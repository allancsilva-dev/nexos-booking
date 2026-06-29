import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { hash } from "@node-rs/argon2";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const apiDir = path.resolve(new URL("../", import.meta.url).pathname);
const port = String(3900 + Math.floor(Math.random() * 100));
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
      (value.startsWith('"') && value.endsWith('"')) ||
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
      "-v",
      "ON_ERROR_STOP=1",
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
        APP_RUNTIME_USER: process.env.APP_RUNTIME_USER ?? "",
        APP_RUNTIME_PASSWORD: process.env.APP_RUNTIME_PASSWORD ?? "",
        DATABASE_RUNTIME_URL: process.env.DATABASE_RUNTIME_URL ?? "",
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
    APP_RUNTIME_USER: process.env.APP_RUNTIME_USER ?? dotEnv.APP_RUNTIME_USER ?? "app_runtime",
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
  const bufferedServiceId = randomUUID();
  const plainServiceId = randomUUID();
  const ownerEmail = `owner-buffer-${ts}@example.com`;
  const orgSlug = `buffer-org-${ts}`;
  const professionalSlug = `buffer-prof-${ts}`;
  const { date, weekday } = nextWeekdayDate();

  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${ownerUserId}', 'Owner Buffer', '${ownerEmail}', '${passwordHash}', now());

    INSERT INTO organizations (id, name, slug, timezone, slot_interval_min, currency)
    VALUES ('${orgId}', 'Buffer Org', '${orgSlug}', 'America/Sao_Paulo', 30, 'BRL');

    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${orgId}', '${ownerUserId}', 'OWNER', 'ACTIVE');

    INSERT INTO professionals (id, organization_id, name, slug, active)
    VALUES ('${professionalId}', '${orgId}', 'Buffer Professional', '${professionalSlug}', true);

    INSERT INTO services (id, organization_id, name, duration_min, buffer_after_min, price_cents, currency, active)
    VALUES
      ('${bufferedServiceId}', '${orgId}', 'Corte com buffer', 30, 10, 5000, 'BRL', true),
      ('${plainServiceId}', '${orgId}', 'Corte sem buffer', 30, 0, 4500, 'BRL', true);

    INSERT INTO professional_services (organization_id, professional_id, service_id, slot_step_min)
    VALUES
      ('${orgId}', '${professionalId}', '${bufferedServiceId}', 30),
      ('${orgId}', '${professionalId}', '${plainServiceId}', 30);

    INSERT INTO working_hours (organization_id, professional_id, weekday, start_time, end_time)
    VALUES ('${orgId}', '${professionalId}', ${weekday}, '09:00', '11:00');
  `);

  const api = startApi();

  try {
    await waitForApi();

    const bufferedAvailability = await fetchJson(
      `/api/v1/public/${orgSlug}/professionals/${professionalSlug}/availability?date=${date}&serviceId=${bufferedServiceId}`,
    );
    assert.equal(
      bufferedAvailability.status,
      200,
      `expected buffered availability 200, got ${bufferedAvailability.status}: ${bufferedAvailability.body}`,
    );
    const bufferedStarts =
      bufferedAvailability.json?.days?.[0]?.slots?.map((slot) =>
        slot.startsAt.slice(11, 16),
      ) ?? [];
    assert.deepEqual(
      bufferedStarts,
      ["09:00", "09:30", "10:00"],
      "buffered service should hide only the last slot that overruns working hours",
    );

    const plainAvailability = await fetchJson(
      `/api/v1/public/${orgSlug}/professionals/${professionalSlug}/availability?date=${date}&serviceId=${plainServiceId}`,
    );
    assert.equal(
      plainAvailability.status,
      200,
      `expected plain availability 200, got ${plainAvailability.status}: ${plainAvailability.body}`,
    );
    const plainStarts =
      plainAvailability.json?.days?.[0]?.slots?.map((slot) =>
        slot.startsAt.slice(11, 16),
      ) ?? [];
    assert.deepEqual(
      plainStarts,
      ["09:00", "09:30", "10:00", "10:30"],
      "service without buffer should preserve current end-of-day behavior",
    );

    const booking = await fetchJson(`/api/v1/public/${orgSlug}/appointments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `buffer-public-${ts}`,
      },
      body: JSON.stringify({
        professionalSlug,
        serviceId: bufferedServiceId,
        startsAt: `${date}T09:00:00-03:00`,
        client: { name: "Maria Buffer", phone: "(11) 99999-0001" },
        consent: true,
      }),
    });
    assert.equal(
      booking.status,
      201,
      `expected public booking 201, got ${booking.status}: ${booking.body}`,
    );

    const occupiedUntil = execPsql(`
      SELECT to_char(occupied_until AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI')
      FROM appointments
      WHERE id = '${booking.json.id}';
    `);
    assert.equal(
      occupiedUntil,
      "09:40",
      "occupied_until should persist end + buffer",
    );

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: ownerEmail,
        password: testPassword,
      }),
    });
    assert.equal(
      login.status,
      200,
      `expected login 200, got ${login.status}: ${login.body}`,
    );
    const token = login.json?.accessToken;
    assert.ok(token, "login should return accessToken");

    const conflict = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "idempotency-key": `buffer-panel-${ts}`,
      },
      body: JSON.stringify({
        professionalId,
        serviceId: bufferedServiceId,
        startsAt: `${date}T09:30:00-03:00`,
        client: { name: "Joao Conflict", phone: "(11) 99999-0002" },
        note: "Deve conflitar",
      }),
    });
    assert.equal(
      conflict.status,
      409,
      `expected panel conflict 409, got ${conflict.status}: ${conflict.body}`,
    );
    assert.equal(
      conflict.json?.error?.code,
      "APPOINTMENT_CONFLICT",
      "panel booking inside buffer should return APPOINTMENT_CONFLICT",
    );

    const afterBookingAvailability = await fetchJson(
      `/api/v1/public/${orgSlug}/professionals/${professionalSlug}/availability?date=${date}&serviceId=${bufferedServiceId}`,
    );
    assert.equal(
      afterBookingAvailability.status,
      200,
      `expected post-booking availability 200, got ${afterBookingAvailability.status}: ${afterBookingAvailability.body}`,
    );
    const afterBookingStarts =
      afterBookingAvailability.json?.days?.[0]?.slots?.map((slot) =>
        slot.startsAt.slice(11, 16),
      ) ?? [];
    assert.deepEqual(
      afterBookingStarts,
      ["10:00"],
      "availability should remove slot that overlaps occupied interval after booking",
    );

    console.log("PASS smoke-buffer-after-runtime");
  } finally {
    await stopApi(api);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
