import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { hash } from "@node-rs/argon2";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const apiDir = path.resolve(new URL("../", import.meta.url).pathname);
const port = String(3400 + Math.floor(Math.random() * 200));
const BASE = `http://127.0.0.1:${port}`;

function loadDotEnv(dir) {
  const dotenvPath = path.resolve(dir, ".env");
  if (!fs.existsSync(dotenvPath)) return {};
  const result = {};
  const contents = fs.readFileSync(dotenvPath, "utf-8");
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function resolveDbEnv() {
  const dotEnv = loadDotEnv(repoRoot);
  return {
    user: process.env.POSTGRES_USER ?? dotEnv.POSTGRES_USER ?? "nexos_booking",
    pass:
      process.env.POSTGRES_PASSWORD ??
      dotEnv.POSTGRES_PASSWORD ??
      "nexos_booking_local_password",
    db: process.env.POSTGRES_DB ?? dotEnv.POSTGRES_DB ?? "nexos_booking",
  };
}

function execPsql(sql) {
  const { user, pass, db } = resolveDbEnv();
  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "-e",
      `PGPASSWORD=${pass}`,
      "postgres",
      "psql",
      "-t",
      "-A",
      "-U",
      user,
      "-d",
      db,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: sql,
      env: {
        ...process.env,
        APP_RUNTIME_USER: process.env.APP_RUNTIME_USER ?? "app_runtime",
        APP_RUNTIME_PASSWORD:
          process.env.APP_RUNTIME_PASSWORD ??
          loadDotEnv(repoRoot).POSTGRES_PASSWORD ??
          "nexos_booking_local_password",
      },
    },
  );

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "psql failed").trim());
  }

  return (result.stdout ?? "").trim();
}

function fetchJson(pathStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, BASE);
    const req = http.request(
      url,
      { method: opts.method ?? "GET", headers: opts.headers ?? {} },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, body, json });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function waitForApi(timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchJson("/health");
      if (res.status === 200) return;
    } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("API did not start within timeout");
}

function startApi() {
  const dotEnv = loadDotEnv(repoRoot);
  const dbHost = process.env.POSTGRES_HOST ?? dotEnv.POSTGRES_HOST ?? "127.0.0.1";
  const dbPort = process.env.POSTGRES_PORT ?? dotEnv.POSTGRES_PORT ?? "5432";
  const env = {
    ...process.env,
    ...dotEnv,
    PORT: port,
    ENABLE_HTTP_TEST_HARNESS: "1",
    NODE_ENV: "development",
    POSTGRES_HOST: dbHost,
    POSTGRES_PORT: dbPort,
    POSTGRES_DB: process.env.POSTGRES_DB ?? dotEnv.POSTGRES_DB ?? "nexos_booking",
    APP_RUNTIME_USER:
      process.env.APP_RUNTIME_USER ?? dotEnv.APP_RUNTIME_USER ?? "app_runtime",
    APP_RUNTIME_PASSWORD:
      process.env.APP_RUNTIME_PASSWORD ??
      dotEnv.APP_RUNTIME_PASSWORD ??
      process.env.POSTGRES_PASSWORD ??
      dotEnv.POSTGRES_PASSWORD ??
      "nexos_booking_local_password",
    DATABASE_URL:
      process.env.DATABASE_URL ??
      dotEnv.DATABASE_URL ??
      `postgres://${process.env.POSTGRES_USER ?? dotEnv.POSTGRES_USER ?? "nexos_booking"}:${process.env.POSTGRES_PASSWORD ?? dotEnv.POSTGRES_PASSWORD ?? ""}@${dbHost}:${dbPort}/${process.env.POSTGRES_DB ?? dotEnv.POSTGRES_DB ?? "nexos_booking"}`,
    PUBLIC_CANCEL_BASE_URL: "https://nexos.test/cancelar",
  };

  const tsxBin = path.resolve(apiDir, "node_modules/.bin/tsx");
  const proc = spawn(tsxBin, ["src/main.ts"], {
    cwd: apiDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return { proc, getStderr: () => stderr };
}

async function stopApi(api) {
  try {
    api.proc.kill("SIGTERM");
  } catch { /* ignore */ }

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    api.proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function nextWeekdayDate() {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while ([0, 6].includes(date.getUTCDay()));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, weekday: date.getUTCDay() };
}

function idempotencyKey(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main() {
  const ts = Date.now();
  const testPassword = "testpassword123";
  const passwordHash = await hash(testPassword, {
    algorithm: 2,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const ownerUserId = randomUUID();
  const orgId = randomUUID();
  const professionalId = randomUUID();
  const serviceId = randomUUID();
  const unlinkedServiceId = randomUUID();
  const ownerEmail = `owner-public-smoke-${ts}@example.com`;
  const orgSlug = `public-smoke-org-${ts}`;
  const professionalSlug = `public-smoke-prof-${ts}`;
  const { date, weekday } = nextWeekdayDate();
  const validStartsAt = `${date}T09:00:00-03:00`;
  const terminalStartsAt = `${date}T10:00:00-03:00`;

  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${ownerUserId}', 'Owner Public Smoke', '${ownerEmail}', '${passwordHash}', now());

    INSERT INTO organizations (id, name, slug, timezone, slot_interval_min, currency)
    VALUES ('${orgId}', 'Public Smoke Org', '${orgSlug}', 'America/Sao_Paulo', 30, 'BRL');

    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${orgId}', '${ownerUserId}', 'OWNER', 'ACTIVE');

    INSERT INTO professionals (id, organization_id, name, slug, active)
    VALUES ('${professionalId}', '${orgId}', 'Public Smoke Professional', '${professionalSlug}', true);

    INSERT INTO services (id, organization_id, name, duration_min, price_cents, currency, active)
    VALUES
      ('${serviceId}', '${orgId}', 'Public Smoke Service', 30, 5000, 'BRL', true),
      ('${unlinkedServiceId}', '${orgId}', 'Unlinked Service', 30, 4500, 'BRL', true);

    INSERT INTO professional_services (organization_id, professional_id, service_id)
    VALUES ('${orgId}', '${professionalId}', '${serviceId}');

    INSERT INTO working_hours (organization_id, professional_id, weekday, start_time, end_time)
    VALUES ('${orgId}', '${professionalId}', ${weekday}, '09:00', '17:00');
  `);

  const api = startApi();

  try {
    await waitForApi();

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: ownerEmail,
        password: testPassword,
      }),
    });
    assert.equal(login.status, 200, `expected login 200, got ${login.status}: ${login.body}`);
    const accessToken = login.json?.accessToken;
    assert.ok(accessToken, "login should return accessToken");

    const vitrine = await fetchJson(`/api/v1/public/${orgSlug}`);
    assert.equal(vitrine.status, 200, `expected vitrine 200, got ${vitrine.status}: ${vitrine.body}`);
    assert.deepEqual(vitrine.json?.services?.[0]?.professionalSlugs, [professionalSlug]);

    const missingSlug = await fetchJson("/api/v1/public/org-inexistente-xyz");
    assert.equal(missingSlug.status, 404, `expected missing slug 404, got ${missingSlug.status}: ${missingSlug.body}`);
    assert.equal(missingSlug.json?.error?.code, "NOT_FOUND");
    assert.ok(missingSlug.json?.error?.requestId, "missing slug should include requestId");

    const invalidPreview = await fetchJson("/api/v1/public/cancel/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "token-invalido" }),
    });
    assert.equal(invalidPreview.status, 410, `expected invalid preview 410, got ${invalidPreview.status}: ${invalidPreview.body}`);
    assert.equal(invalidPreview.json?.error?.code, "CANCEL_TOKEN_INVALID");
    assert.ok(invalidPreview.json?.error?.requestId, "invalid preview should include requestId");

    const invalidCancel = await fetchJson("/api/v1/public/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "token-invalido" }),
    });
    assert.equal(invalidCancel.status, 410, `expected invalid cancel 410, got ${invalidCancel.status}: ${invalidCancel.body}`);
    assert.equal(invalidCancel.json?.error?.code, "CANCEL_TOKEN_INVALID");
    assert.ok(invalidCancel.json?.error?.requestId, "invalid cancel should include requestId");

    const invalidCombo = await fetchJson(`/api/v1/public/${orgSlug}/appointments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey("public-invalid-combo"),
      },
      body: JSON.stringify({
        professionalSlug,
        serviceId: unlinkedServiceId,
        startsAt: validStartsAt,
        client: { name: "Invalid Combo", phone: "(11) 97777-1111" },
        consent: true,
      }),
    });
    assert.equal(invalidCombo.status, 422, `expected invalid combo 422, got ${invalidCombo.status}: ${invalidCombo.body}`);
    assert.equal(invalidCombo.json?.error?.code, "PROFESSIONAL_SERVICE_NOT_LINKED");

    const booking = await fetchJson(`/api/v1/public/${orgSlug}/appointments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey("public-booking"),
      },
      body: JSON.stringify({
        professionalSlug,
        serviceId,
        startsAt: validStartsAt,
        client: { name: "Public Client", phone: "(11) 99999-9999" },
        consent: true,
      }),
    });
    assert.equal(booking.status, 201, `expected public booking 201, got ${booking.status}: ${booking.body}`);
    assert.ok(booking.json?.cancelUrl, "booking should return cancelUrl");

    const cancelToken = booking.json.cancelUrl.split("/").pop();
    assert.ok(cancelToken, "cancelUrl should contain raw token");

    const createdEvent = execPsql(`
      SELECT event_type || '|' || actor_type || '|' || COALESCE(actor_user_id::text, 'NULL')
      FROM appointment_events
      WHERE organization_id = '${orgId}'
        AND appointment_id = '${booking.json.id}'
      ORDER BY created_at ASC
      LIMIT 1;
    `);
    assert.equal(createdEvent.trim(), "CREATED|CLIENT|NULL");

    const previewValid = await fetchJson("/api/v1/public/cancel/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: cancelToken }),
    });
    assert.equal(previewValid.status, 200, `expected valid preview 200, got ${previewValid.status}: ${previewValid.body}`);
    assert.equal(previewValid.json?.serviceName, "Public Smoke Service");

    const cancelValid = await fetchJson("/api/v1/public/cancel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: cancelToken }),
    });
    assert.equal(cancelValid.status, 200, `expected valid cancel 200, got ${cancelValid.status}: ${cancelValid.body}`);
    assert.equal(cancelValid.json?.cancelled, true);

    const cancelledState = execPsql(`
      SELECT status || '|' || COALESCE(cancelled_by_type::text, 'NULL') || '|' ||
             CASE WHEN public_cancel_token_hash IS NULL THEN 'NULL' ELSE 'SET' END
      FROM appointments
      WHERE id = '${booking.json.id}';
    `);
    assert.equal(cancelledState.trim(), "CANCELLED|CLIENT|NULL");

    const cancelledEvent = execPsql(`
      SELECT event_type || '|' || actor_type || '|' || COALESCE(actor_user_id::text, 'NULL')
      FROM appointment_events
      WHERE organization_id = '${orgId}'
        AND appointment_id = '${booking.json.id}'
        AND event_type = 'CANCELLED'
      ORDER BY created_at DESC
      LIMIT 1;
    `);
    assert.equal(cancelledEvent.trim(), "CANCELLED|CLIENT|NULL");

    const terminalBooking = await fetchJson(`/api/v1/public/${orgSlug}/appointments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey("public-terminal"),
      },
      body: JSON.stringify({
        professionalSlug,
        serviceId,
        startsAt: terminalStartsAt,
        client: { name: "Terminal Client", phone: "(11) 98888-2222" },
        consent: true,
      }),
    });
    assert.equal(terminalBooking.status, 201, `expected terminal booking 201, got ${terminalBooking.status}: ${terminalBooking.body}`);

    const terminalToken = terminalBooking.json.cancelUrl.split("/").pop();
    assert.ok(terminalToken, "terminal cancelUrl should contain token");

    const completePanel = await fetchJson(`/api/v1/appointments/${terminalBooking.json.id}/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": idempotencyKey("panel-complete"),
        "if-match": "1",
      },
    });
    assert.ok([200, 201].includes(completePanel.status), `expected panel complete success, got ${completePanel.status}: ${completePanel.body}`);

    const terminalPreview = await fetchJson("/api/v1/public/cancel/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: terminalToken }),
    });
    assert.equal(terminalPreview.status, 410, `expected terminal preview 410, got ${terminalPreview.status}: ${terminalPreview.body}`);
    assert.equal(terminalPreview.json?.error?.code, "CANCEL_TOKEN_INVALID");

    console.log(
      JSON.stringify(
        {
          vitrine200: {
            serviceProfessionalSlugs: vitrine.json.services[0].professionalSlugs,
          },
          missingSlug404: {
            status: missingSlug.status,
            code: missingSlug.json.error.code,
          },
          invalidToken410: {
            previewStatus: invalidPreview.status,
            previewCode: invalidPreview.json.error.code,
            cancelStatus: invalidCancel.status,
            cancelCode: invalidCancel.json.error.code,
          },
          invalidCombo422: {
            status: invalidCombo.status,
            code: invalidCombo.json.error.code,
          },
          booking201: {
            id: booking.json.id,
            cancelUrl: booking.json.cancelUrl,
          },
          createdEventClient: createdEvent.trim(),
          validPreview200: {
            serviceName: previewValid.json.serviceName,
          },
          validCancel200: {
            cancelled: cancelValid.json.cancelled,
            appointment: cancelledState.trim(),
            cancelledEvent: cancelledEvent.trim(),
          },
          terminalPreview410: {
            status: terminalPreview.status,
            code: terminalPreview.json.error.code,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const details = error instanceof Error ? `\n--- api stderr ---\n${api.getStderr()}` : "";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${details}`, { cause: error });
  } finally {
    await stopApi(api);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
