import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { hash } from "@node-rs/argon2";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const apiDir = path.resolve(new URL("../", import.meta.url).pathname);
const port = String(3800 + Math.floor(Math.random() * 200));
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

function assertStarts(actualSlots, expectedStarts, label) {
  const actual = actualSlots.map((slot) => slot.startsAt);
  assert.deepEqual(actual.slice(0, expectedStarts.length), expectedStarts, label);
}

function key(ts, suffix) {
  return `slot-step-${ts}-${suffix}`;
}

async function login(email, password) {
  const res = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `expected login 200, got ${res.status}: ${res.body}`);
  assert.ok(res.json?.accessToken, "login should return accessToken");
  return res.json.accessToken;
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

  const ownerAUserId = randomUUID();
  const ownerBUserId = randomUUID();
  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const professionalAId = randomUUID();
  const professionalBId = randomUUID();
  const service30AId = randomUUID();
  const service45AId = randomUUID();
  const service50AId = randomUUID();
  const service50OverrideAId = randomUUID();
  const service30BId = randomUUID();

  const ownerAEmail = `owner-slot-step-a-${ts}@example.com`;
  const ownerBEmail = `owner-slot-step-b-${ts}@example.com`;
  const orgASlug = `slot-step-org-a-${ts}`;
  const orgBSlug = `slot-step-org-b-${ts}`;
  const professionalASlug = `slot-step-prof-a-${ts}`;
  const professionalBSlug = `slot-step-prof-b-${ts}`;
  const { date, weekday } = nextWeekdayDate();

  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES
      ('${ownerAUserId}', 'Owner Slot Step A', '${ownerAEmail}', '${passwordHash}', now()),
      ('${ownerBUserId}', 'Owner Slot Step B', '${ownerBEmail}', '${passwordHash}', now());

    INSERT INTO organizations (id, name, slug, timezone, slot_interval_min, currency)
    VALUES
      ('${orgAId}', 'Slot Step Org A', '${orgASlug}', 'America/Sao_Paulo', 30, 'BRL'),
      ('${orgBId}', 'Slot Step Org B', '${orgBSlug}', 'America/Sao_Paulo', 30, 'BRL');

    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES
      ('${orgAId}', '${ownerAUserId}', 'OWNER', 'ACTIVE'),
      ('${orgBId}', '${ownerBUserId}', 'OWNER', 'ACTIVE');

    INSERT INTO professionals (id, organization_id, name, slug, active)
    VALUES
      ('${professionalAId}', '${orgAId}', 'Slot Step Professional A', '${professionalASlug}', true),
      ('${professionalBId}', '${orgBId}', 'Slot Step Professional B', '${professionalBSlug}', true);

    INSERT INTO services (id, organization_id, name, duration_min, price_cents, currency, active)
    VALUES
      ('${service30AId}', '${orgAId}', 'Service 30', 30, 3000, 'BRL', true),
      ('${service45AId}', '${orgAId}', 'Service 45', 45, 4500, 'BRL', true),
      ('${service50AId}', '${orgAId}', 'Service 50', 50, 5000, 'BRL', true),
      ('${service50OverrideAId}', '${orgAId}', 'Service 50 Override 25', 50, 5500, 'BRL', true),
      ('${service30BId}', '${orgBId}', 'Service 30 B', 30, 3000, 'BRL', true);

    INSERT INTO professional_services (organization_id, professional_id, service_id, slot_step_min)
    VALUES
      ('${orgAId}', '${professionalAId}', '${service30AId}', NULL),
      ('${orgAId}', '${professionalAId}', '${service45AId}', NULL),
      ('${orgAId}', '${professionalAId}', '${service50AId}', NULL),
      ('${orgAId}', '${professionalAId}', '${service50OverrideAId}', 25),
      ('${orgBId}', '${professionalBId}', '${service30BId}', NULL);

    INSERT INTO working_hours (organization_id, professional_id, weekday, start_time, end_time)
    VALUES
      ('${orgAId}', '${professionalAId}', ${weekday}, '09:00', '12:00'),
      ('${orgBId}', '${professionalBId}', ${weekday}, '09:00', '12:00');
  `);

  let invalidConstraintRejected = false;
  try {
    execPsql(`
      INSERT INTO professional_services (organization_id, professional_id, service_id, slot_step_min)
      VALUES ('${orgAId}', '${professionalAId}', '${randomUUID()}', 7);
    `);
  } catch (error) {
    invalidConstraintRejected = String(error.message).includes("professional_services_slot_step_min_check");
  }
  assert.ok(invalidConstraintRejected, "slot_step_min check constraint should reject invalid values");

  const api = startApi();

  try {
    await waitForApi();

    const ownerAToken = await login(ownerAEmail, testPassword);
    const ownerBToken = await login(ownerBEmail, testPassword);

    const panel30 = await fetchJson(
      `/api/v1/professionals/${professionalAId}/availability?date=${date}&serviceId=${service30AId}`,
      { headers: { authorization: `Bearer ${ownerAToken}` } },
    );
    assert.equal(panel30.status, 200, `expected 30-minute availability 200, got ${panel30.status}: ${panel30.body}`);
    assert.equal(panel30.json.slotIntervalMin, 30);
    assertStarts(
      panel30.json.days[0].slots,
      [
        `${date}T09:00:00-03:00`,
        `${date}T09:30:00-03:00`,
        `${date}T10:00:00-03:00`,
      ],
      "30-minute cadence should be every 30 minutes",
    );

    const panel45 = await fetchJson(
      `/api/v1/professionals/${professionalAId}/availability?date=${date}&serviceId=${service45AId}`,
      { headers: { authorization: `Bearer ${ownerAToken}` } },
    );
    assert.equal(panel45.status, 200, `expected 45-minute availability 200, got ${panel45.status}: ${panel45.body}`);
    assert.equal(panel45.json.slotIntervalMin, 45);
    assertStarts(
      panel45.json.days[0].slots,
      [
        `${date}T09:00:00-03:00`,
        `${date}T09:45:00-03:00`,
        `${date}T10:30:00-03:00`,
      ],
      "45-minute cadence should be every 45 minutes",
    );

    const public50 = await fetchJson(
      `/api/v1/public/${orgASlug}/professionals/${professionalASlug}/availability?date=${date}&serviceId=${service50AId}`,
    );
    assert.equal(public50.status, 200, `expected 50-minute public availability 200, got ${public50.status}: ${public50.body}`);
    assert.equal(public50.json.slotIntervalMin, 50);
    assertStarts(
      public50.json.days[0].slots,
      [
        `${date}T09:00:00-03:00`,
        `${date}T09:50:00-03:00`,
        `${date}T10:40:00-03:00`,
      ],
      "50-minute cadence should be every 50 minutes",
    );
    assert.ok(
      !public50.json.days[0].slots.some((slot) => slot.startsAt === `${date}T09:30:00-03:00`),
      "50-minute service must not expose 09:30 slot",
    );

    const panel50Override = await fetchJson(
      `/api/v1/professionals/${professionalAId}/availability?date=${date}&serviceId=${service50OverrideAId}`,
      { headers: { authorization: `Bearer ${ownerAToken}` } },
    );
    assert.equal(panel50Override.status, 200, `expected override availability 200, got ${panel50Override.status}: ${panel50Override.body}`);
    assert.equal(panel50Override.json.slotIntervalMin, 25);
    assertStarts(
      panel50Override.json.days[0].slots,
      [
        `${date}T09:00:00-03:00`,
        `${date}T09:25:00-03:00`,
        `${date}T09:50:00-03:00`,
      ],
      "override cadence should use slot_step_min=25",
    );

    const publicBooking = await fetchJson(`/api/v1/public/${orgASlug}/appointments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": key(ts, "public-50"),
      },
      body: JSON.stringify({
        professionalSlug: professionalASlug,
        serviceId: service50AId,
        startsAt: public50.json.days[0].slots[0].startsAt,
        client: { name: "Public Slot Step", phone: "(11) 98888-1111" },
        consent: true,
      }),
    });
    assert.equal(publicBooking.status, 201, `expected public booking 201, got ${publicBooking.status}: ${publicBooking.body}`);

    const panel45Create = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAToken}`,
        "idempotency-key": key(ts, "staff-45"),
      },
      body: JSON.stringify({
        professionalId: professionalAId,
        serviceId: service45AId,
        startsAt: `${date}T10:30:00-03:00`,
        client: { name: "Staff Slot Step", phone: "(11) 97777-2222" },
      }),
    });
    assert.equal(panel45Create.status, 201, `expected staff create 201, got ${panel45Create.status}: ${panel45Create.body}`);

    const panelB30 = await fetchJson(
      `/api/v1/professionals/${professionalBId}/availability?date=${date}&serviceId=${service30BId}`,
      { headers: { authorization: `Bearer ${ownerBToken}` } },
    );
    assert.equal(panelB30.status, 200, `expected org B availability 200, got ${panelB30.status}: ${panelB30.body}`);
    assert.equal(panelB30.json.slotIntervalMin, 30);
    assertStarts(
      panelB30.json.days[0].slots,
      [
        `${date}T09:00:00-03:00`,
        `${date}T09:30:00-03:00`,
        `${date}T10:00:00-03:00`,
      ],
      "org B must keep 30-minute cadence",
    );

    const rescheduleCreate = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerBToken}`,
        "idempotency-key": key(ts, "reschedule-create"),
      },
      body: JSON.stringify({
        professionalId: professionalBId,
        serviceId: service30BId,
        startsAt: `${date}T09:00:00-03:00`,
        client: { name: "Reschedule Slot Step", phone: "(11) 96666-3333" },
      }),
    });
    assert.equal(rescheduleCreate.status, 201, `expected reschedule seed create 201, got ${rescheduleCreate.status}: ${rescheduleCreate.body}`);

    const rescheduleOk = await fetchJson(`/api/v1/appointments/${rescheduleCreate.json.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerBToken}`,
        "if-match": String(rescheduleCreate.json.version),
        "idempotency-key": key(ts, "reschedule-ok"),
      },
      body: JSON.stringify({
        startsAt: `${date}T09:30:00-03:00`,
      }),
    });
    assert.equal(rescheduleOk.status, 200, `expected aligned reschedule 200, got ${rescheduleOk.status}: ${rescheduleOk.body}`);

    const rescheduleOffGrid = await fetchJson(`/api/v1/appointments/${rescheduleCreate.json.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerBToken}`,
        "if-match": String(rescheduleOk.json.version),
        "idempotency-key": key(ts, "reschedule-off-grid"),
      },
      body: JSON.stringify({
        startsAt: `${date}T09:15:00-03:00`,
      }),
    });
    assert.equal(rescheduleOffGrid.status, 422, `expected off-grid reschedule 422, got ${rescheduleOffGrid.status}: ${rescheduleOffGrid.body}`);
    assert.equal(rescheduleOffGrid.json?.error?.code, "VALIDATION_ERROR");

    console.log(
      JSON.stringify(
        {
          service30: {
            slotIntervalMin: panel30.json.slotIntervalMin,
            firstThree: panel30.json.days[0].slots.slice(0, 3).map((slot) => slot.startsAt),
          },
          service45: {
            slotIntervalMin: panel45.json.slotIntervalMin,
            firstThree: panel45.json.days[0].slots.slice(0, 3).map((slot) => slot.startsAt),
          },
          service50: {
            slotIntervalMin: public50.json.slotIntervalMin,
            firstThree: public50.json.days[0].slots.slice(0, 3).map((slot) => slot.startsAt),
          },
          service50Override25: {
            slotIntervalMin: panel50Override.json.slotIntervalMin,
            firstThree: panel50Override.json.days[0].slots.slice(0, 3).map((slot) => slot.startsAt),
          },
          coherence: {
            publicAvailabilityToPost: publicBooking.status,
            staffCreateFromAvailability: panel45Create.status,
            rescheduleAligned: rescheduleOk.status,
            rescheduleOffGrid: {
              status: rescheduleOffGrid.status,
              code: rescheduleOffGrid.json?.error?.code,
            },
          },
          crossCompany: {
            orgAService50Step: public50.json.slotIntervalMin,
            orgBService30Step: panelB30.json.slotIntervalMin,
          },
          migration: {
            invalidConstraintRejected,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await stopApi(api);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
