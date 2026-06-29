import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { hash } from "@node-rs/argon2";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const apiDir = path.resolve(new URL("../", import.meta.url).pathname);
const port = String(3200 + Math.floor(Math.random() * 200));
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

function execPsql(sql) {
  const dotEnv = loadDotEnv(repoRoot);
  const user = process.env.POSTGRES_USER ?? dotEnv.POSTGRES_USER ?? "nexos_booking";
  const pass =
    process.env.POSTGRES_PASSWORD ??
    dotEnv.POSTGRES_PASSWORD ??
    "nexos_booking_local_password";
  const db = process.env.POSTGRES_DB ?? dotEnv.POSTGRES_DB ?? "nexos_booking";

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
          try { json = JSON.parse(body); } catch { json = null; }
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
    await new Promise((r) => setTimeout(r, 300));
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
  };

  const tsxBin = path.resolve(apiDir, "node_modules/.bin/tsx");
  const proc = spawn(tsxBin, ["src/main.ts"], {
    cwd: apiDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
  proc.stdout.on("data", () => {});

  return { proc, getStderr: () => stderr };
}

function killApi(api) {
  try { api.proc.kill("SIGTERM"); } catch { /* ignore */ }
}

async function stopApi(api) {
  killApi(api);
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3_000);
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
  const ownerEmail = `owner-smoke-${ts}@example.com`;
  const { date, weekday } = nextWeekdayDate();

  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${ownerUserId}', 'Owner Smoke', '${ownerEmail}', '${passwordHash}', now());

    INSERT INTO organizations (id, name, slug, timezone, slot_interval_min, currency)
    VALUES ('${orgId}', 'Smoke Org', 'smoke-org-${Date.now()}', 'America/Sao_Paulo', 30, 'BRL');

    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${orgId}', '${ownerUserId}', 'OWNER', 'ACTIVE');

    INSERT INTO professionals (id, organization_id, name, slug, active)
    VALUES ('${professionalId}', '${orgId}', 'Smoke Professional', 'smoke-prof-${Date.now()}', true);

    INSERT INTO services (id, organization_id, name, duration_min, price_cents, currency, active)
    VALUES ('${serviceId}', '${orgId}', 'Consultation 30min', 30, 5000, 'BRL', true);

    INSERT INTO professional_services (organization_id, professional_id, service_id)
    VALUES ('${orgId}', '${professionalId}', '${serviceId}');

    INSERT INTO working_hours (organization_id, professional_id, weekday, start_time, end_time)
    VALUES ('${orgId}', '${professionalId}', ${weekday}, '09:00', '17:00');
  `);
  const api = startApi();

  try {
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
      const token = login.json?.accessToken;
      assert.ok(token, "login should return accessToken");

      const startsAt = `${date}T09:00:00-03:00`;
      const createKey = idempotencyKey("appt-create");
      const createBody = {
        professionalId,
        serviceId,
        startsAt,
        client: { name: "Maria Silva", phone: "(11) 99999-9999" },
        note: "Primeira consulta",
      };

      const first = await fetchJson("/api/v1/appointments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "idempotency-key": createKey,
        },
        body: JSON.stringify(createBody),
      });

      assert.equal(first.status, 201, `expected 201, got ${first.status}: ${first.body}`);
      assert.equal(first.json?.serviceNameSnapshot, "Consultation 30min");
      assert.equal(first.json?.serviceDurationMinSnapshot, 30);
      assert.equal(first.json?.servicePriceCentsSnapshot, 5000);
      assert.equal(first.json?.serviceCurrencySnapshot, "BRL");

      const second = await fetchJson("/api/v1/appointments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "idempotency-key": idempotencyKey("appt-conflict"),
        },
        body: JSON.stringify({
          ...createBody,
          client: { name: "Joao Souza", phone: "(11) 98888-7777" },
        }),
      });

      assert.equal(second.status, 409, `expected 409, got ${second.status}: ${second.body}`);
      assert.equal(second.json?.error?.code, "APPOINTMENT_CONFLICT");

      const overlapCount = execPsql(`
      SELECT count(*)
      FROM appointments
      WHERE organization_id = '${orgId}'
        AND professional_id = '${professionalId}'
        AND starts_at = '${startsAt}';
    `);
      assert.equal(overlapCount.trim(), "1");

      const replayKey = idempotencyKey("appt-replay");
      const replayStartsAt = `${date}T10:00:00-03:00`;
      const replayBody = {
        professionalId,
        serviceId,
        startsAt: replayStartsAt,
        client: { name: "Replay Client", phone: "(11) 97777-6666" },
      };

      const replayFirst = await fetchJson("/api/v1/appointments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "idempotency-key": replayKey,
        },
        body: JSON.stringify(replayBody),
      });
      assert.equal(replayFirst.status, 201, `expected replay first 201, got ${replayFirst.status}: ${replayFirst.body}`);

      const replaySecond = await fetchJson("/api/v1/appointments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "idempotency-key": replayKey,
        },
        body: JSON.stringify(replayBody),
      });
      assert.equal(replaySecond.status, 201, `expected replay second 201, got ${replaySecond.status}: ${replaySecond.body}`);
      assert.equal(replaySecond.json?.id, replayFirst.json?.id);

      const reuseDifferent = await fetchJson("/api/v1/appointments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "idempotency-key": replayKey,
        },
        body: JSON.stringify({
          ...replayBody,
          client: { name: "Replay Client", phone: "(11) 96666-5555" },
        }),
      });
      assert.equal(reuseDifferent.status, 409, `expected reused-key 409, got ${reuseDifferent.status}: ${reuseDifferent.body}`);
      assert.equal(reuseDifferent.json?.error?.code, "IDEMPOTENCY_KEY_REUSED");

      console.log(
        JSON.stringify(
          {
            create201: {
              id: first.json.id,
              serviceNameSnapshot: first.json.serviceNameSnapshot,
              serviceDurationMinSnapshot: first.json.serviceDurationMinSnapshot,
              servicePriceCentsSnapshot: first.json.servicePriceCentsSnapshot,
              serviceCurrencySnapshot: first.json.serviceCurrencySnapshot,
            },
            overlap409: {
              status: second.status,
              code: second.json.error.code,
            },
            noDoubleWrite: {
              appointmentsAtSameSlot: Number(overlapCount.trim()),
            },
            idempotency: {
              replayStatus: replaySecond.status,
              replayedAppointmentId: replaySecond.json.id,
              differentPayloadStatus: reuseDifferent.status,
              differentPayloadCode: reuseDifferent.json.error.code,
            },
          },
          null,
          2,
        ),
      );
    } catch (error) {
      if (error instanceof Error) {
        error.apiStderr = api.getStderr();
      }
      throw error;
    }
  } finally {
    await stopApi(api);
  }
}

main().catch((error) => {
  const details =
    error instanceof Error && "apiStderr" in error
      ? `\n--- api stderr ---\n${error.apiStderr}`
      : "";
  console.error(`${error instanceof Error ? error.message : String(error)}${details}`);
  process.exit(1);
});
