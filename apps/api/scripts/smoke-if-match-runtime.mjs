import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { hash } from "@node-rs/argon2";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const apiDir = path.resolve(new URL("../", import.meta.url).pathname);
const port = String(3600 + Math.floor(Math.random() * 200));
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
  const ownerEmail = `owner-ifmatch-smoke-${ts}@example.com`;
  const { date, weekday } = nextWeekdayDate();
  const firstStartsAt = `${date}T09:00:00-03:00`;
  const secondStartsAt = `${date}T09:30:00-03:00`;
  const thirdStartsAt = `${date}T10:00:00-03:00`;

  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${ownerUserId}', 'Owner IfMatch Smoke', '${ownerEmail}', '${passwordHash}', now());

    INSERT INTO organizations (id, name, slug, timezone, slot_interval_min, currency)
    VALUES ('${orgId}', 'IfMatch Smoke Org', 'ifmatch-smoke-org-${ts}', 'America/Sao_Paulo', 30, 'BRL');

    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${orgId}', '${ownerUserId}', 'OWNER', 'ACTIVE');

    INSERT INTO professionals (id, organization_id, name, slug, active)
    VALUES ('${professionalId}', '${orgId}', 'IfMatch Professional', 'ifmatch-smoke-prof-${ts}', true);

    INSERT INTO services (id, organization_id, name, duration_min, price_cents, currency, active)
    VALUES ('${serviceId}', '${orgId}', 'IfMatch Service', 30, 5000, 'BRL', true);

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

    const create = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": idempotencyKey("ifmatch-create"),
      },
      body: JSON.stringify({
        professionalId,
        serviceId,
        startsAt: firstStartsAt,
        client: { name: "IfMatch Client", phone: "(11) 97777-3333" },
      }),
    });
    assert.equal(create.status, 201, `expected create 201, got ${create.status}: ${create.body}`);

    const appointmentId = create.json.id;
    const createdVersion = create.json.version;

    const withoutHeader = await fetchJson(`/api/v1/appointments/${appointmentId}/cancel`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": idempotencyKey("ifmatch-missing"),
      },
    });
    assert.equal(withoutHeader.status, 400, `expected missing If-Match 400, got ${withoutHeader.status}: ${withoutHeader.body}`);
    assert.equal(withoutHeader.json?.error?.code, "BAD_REQUEST");

    const correctReschedule = await fetchJson(`/api/v1/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": idempotencyKey("ifmatch-reschedule-good"),
        "if-match": String(createdVersion),
      },
      body: JSON.stringify({ startsAt: secondStartsAt }),
    });
    assert.equal(correctReschedule.status, 200, `expected correct If-Match 200, got ${correctReschedule.status}: ${correctReschedule.body}`);

    const staleReschedule = await fetchJson(`/api/v1/appointments/${appointmentId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": idempotencyKey("ifmatch-reschedule-stale"),
        "if-match": String(createdVersion),
      },
      body: JSON.stringify({ startsAt: thirdStartsAt }),
    });
    assert.equal(staleReschedule.status, 409, `expected stale If-Match 409, got ${staleReschedule.status}: ${staleReschedule.body}`);
    assert.equal(staleReschedule.json?.error?.code, "APPOINTMENT_VERSION_CONFLICT");

    const correctCancel = await fetchJson(`/api/v1/appointments/${appointmentId}/cancel`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
        "idempotency-key": idempotencyKey("ifmatch-cancel-good"),
        "if-match": String(correctReschedule.json.version),
      },
    });
    assert.ok([200, 201].includes(correctCancel.status), `expected correct cancel success, got ${correctCancel.status}: ${correctCancel.body}`);
    assert.equal(correctCancel.json?.status, "CANCELLED");

    const cancelledState = execPsql(`
      SELECT status || '|' || version::text || '|' || COALESCE(cancelled_by_type::text, 'NULL')
      FROM appointments
      WHERE id = '${appointmentId}';
    `);
    assert.ok(cancelledState.trim().startsWith("CANCELLED|"), "appointment should be cancelled in DB");

    console.log(
      JSON.stringify(
        {
          missingIfMatch400: {
            status: withoutHeader.status,
            code: withoutHeader.json.error.code,
          },
          staleVersion409: {
            status: staleReschedule.status,
            code: staleReschedule.json.error.code,
          },
          correctVersion200: {
            rescheduleStatus: correctReschedule.status,
            cancelStatus: correctCancel.status,
            finalStatus: correctCancel.json.status,
          },
          dbState: cancelledState.trim(),
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
