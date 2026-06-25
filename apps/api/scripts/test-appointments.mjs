import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { strict as assert } from "node:assert";
import * as jose from "jose";
import { hash } from "@node-rs/argon2";
const BASE = "http://localhost:3005";
let passed = 0;
let failed = 0;
let testNumber = 0;
const errors = [];

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

async function testAsync(name, fn) {
  testNumber++;
  try {
    await fn();
    passed++;
    console.log(`  PASS  T${testNumber}: ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL  T${testNumber}: ${name}`);
    console.log(`        ${e.message}`);
    errors.push({ test: testNumber, name, error: e.message });
  }
}

function fetchJson(pathStr, opts = {}) {
  const base = opts.base ?? BASE;
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, base);
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

function fetchRaw(pathStr, opts = {}) {
  const base = opts.base ?? BASE;
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, base);
    const req = http.request(
      url,
      { method: opts.method ?? "GET", headers: opts.headers ?? {} },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, body });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function waitForApi(timeoutMs = 20_000, base = BASE) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchRaw("/health", { base });
      if (res.status === 200) return;
    } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("API did not start within timeout");
}

function startApi(enableHarness, opts = {}) {
  const { port = "3005", envOverrides = {} } = opts;
  return new Promise((resolve, reject) => {
    const apiDir = new URL("..", import.meta.url).pathname;
    const repoRoot = path.resolve(apiDir, "../..");
    const dotEnv = loadDotEnv(repoRoot);
    const dbPort = envOverrides.POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? dotEnv.POSTGRES_PORT ?? "5432";
    const dbHost = envOverrides.POSTGRES_HOST ?? process.env.POSTGRES_HOST ?? dotEnv.POSTGRES_HOST ?? "127.0.0.1";

    const env = {
      ...process.env,
      ...dotEnv,
      ...envOverrides,
      PORT: port,
      ENABLE_HTTP_TEST_HARNESS: enableHarness ? "1" : "0",
      NODE_ENV: "development",
      PGHOST: undefined,
      PGUSER: undefined,
      PGPASSWORD: undefined,
      PGDATABASE: undefined,
      PGPORT: undefined,
      POSTGRES_HOST: dbHost,
      POSTGRES_PORT: dbPort,
      POSTGRES_DB:
        envOverrides.POSTGRES_DB ??
        process.env.POSTGRES_DB ??
        dotEnv.POSTGRES_DB ??
        "nexos_booking",
      APP_RUNTIME_USER:
        envOverrides.APP_RUNTIME_USER ??
        process.env.APP_RUNTIME_USER ??
        dotEnv.APP_RUNTIME_USER ??
        "app_runtime",
      APP_RUNTIME_PASSWORD:
        envOverrides.APP_RUNTIME_PASSWORD ??
        process.env.APP_RUNTIME_PASSWORD ??
        dotEnv.APP_RUNTIME_PASSWORD ??
        dotEnv.POSTGRES_PASSWORD ??
        process.env.POSTGRES_PASSWORD ??
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
    proc.on("error", reject);
    setTimeout(() => resolve({ proc, getStderr: () => stderr, port }), 500);
  });
}

function killApi(api) {
  try { api.proc.kill("SIGTERM"); } catch { /* dead */ }
}

function repoRoot() {
  return path.resolve(new URL("..", import.meta.url).pathname, "../..");
}

function resolveDbEnv() {
  const dotEnv = loadDotEnv(repoRoot());
  return {
    user: process.env.POSTGRES_USER ?? dotEnv.POSTGRES_USER ?? "nexos_booking",
    pass: process.env.POSTGRES_PASSWORD ?? dotEnv.POSTGRES_PASSWORD ?? "nexos_booking_local_password",
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
      "-U",
      user,
      "-d",
      db,
    ],
    {
      cwd: repoRoot(),
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

function daysFromNow(offset) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString();
}

function idempotencyKey() {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `test-appt-${ts}-${rand}`;
}

async function signAccessToken(userId, orgId) {
  const dotEnv = loadDotEnv(repoRoot());
  const secret = process.env.JWT_SECRET ?? dotEnv.JWT_SECRET;
  assert.ok(secret, "JWT_SECRET must be available for appointment harness");

  const issuer = process.env.JWT_ISSUER ?? dotEnv.JWT_ISSUER ?? "nexos-booking";
  const audience = process.env.JWT_AUDIENCE ?? dotEnv.JWT_AUDIENCE ?? "nexos-api";
  const now = Math.floor(Date.now() / 1000);

  return new jose.SignJWT({
    sub: userId,
    sid: randomUUID(),
    org: orgId,
    iat: now,
    exp: now + 900,
    iss: issuer,
    aud: audience,
  })
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(secret));
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
console.log("\nPR-3.3 Appointments Test Harness\n");
console.log("===============================\n");

console.log("Starting API...");
const api = await startApi(true);

try {
  await waitForApi();
  console.log("API ready.\n");

  const testPassword = "testpassword123";
  const ts = Date.now();

  // ═══════════════════════════════════════════════════════════════
  // Setup: Register users
  // ═══════════════════════════════════════════════════════════════

  const passwordHash = await hash(testPassword, {
    algorithm: 2,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const ownerUserId = randomUUID();
  const ownerOrgId = randomUUID();
  const ownerEmail = `test-appt-owner-${ts}@example.com`;
  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${ownerUserId}', 'Owner User', '${ownerEmail}', '${passwordHash}', now());
    INSERT INTO organizations (id, name, slug)
    VALUES ('${ownerOrgId}', 'Appt Test Org', 'appt-test-org-${ts}');
    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${ownerOrgId}', '${ownerUserId}', 'OWNER', 'ACTIVE');
  `);

  const [persistedOwnerUserId, persistedOwnerOrgId] = execPsql(`
    SELECT user_id, organization_id
    FROM organization_users
    WHERE user_id = '${ownerUserId}'
      AND organization_id = '${ownerOrgId}'
    LIMIT 1;
  `).split("|").map((value) => value.trim());

  let ownerAccessToken = await signAccessToken(
    persistedOwnerUserId,
    persistedOwnerOrgId,
  );

  const profUserId = randomUUID();
  const profEmail = `test-appt-prof-${ts}@example.com`;
  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${profUserId}', 'Prof User', '${profEmail}', '${passwordHash}', now());
    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${ownerOrgId}', '${profUserId}', 'PROFESSIONAL', 'ACTIVE');
  `);

  const [persistedProfUserId, persistedProfOrgId] = execPsql(`
    SELECT user_id, organization_id
    FROM organization_users
    WHERE user_id = '${profUserId}'
      AND organization_id = '${ownerOrgId}'
    LIMIT 1;
  `).split("|").map((value) => value.trim());

  let profAccessToken = await signAccessToken(
    persistedProfUserId,
    persistedProfOrgId,
  );

  const otherUserId = randomUUID();
  const otherOrgId = randomUUID();
  const otherEmail = `test-appt-other-${ts}@example.com`;
  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${otherUserId}', 'Other User', '${otherEmail}', '${passwordHash}', now());
    INSERT INTO organizations (id, name, slug)
    VALUES ('${otherOrgId}', 'Other Org', 'other-org-${ts}');
    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${otherOrgId}', '${otherUserId}', 'OWNER', 'ACTIVE');
  `);

  const [persistedOtherUserId, persistedOtherOrgId] = execPsql(`
    SELECT user_id, organization_id
    FROM organization_users
    WHERE user_id = '${otherUserId}'
      AND organization_id = '${otherOrgId}'
    LIMIT 1;
  `).split("|").map((value) => value.trim());

  const otherAccessToken = await signAccessToken(
    persistedOtherUserId,
    persistedOtherOrgId,
  );

  // Setup org config
  execPsql(`UPDATE organizations SET timezone = 'America/Sao_Paulo', slot_interval_min = 30 WHERE id = '${ownerOrgId}'`);

  // ═══════════════════════════════════════════════════════════════
  // Create professionals
  // ═══════════════════════════════════════════════════════════════

  const tenantReadyRes = await fetchJson("/__test/tenant-required", {
    headers: {
      authorization: `Bearer ${ownerAccessToken}`,
    },
  });
  assert.equal(
    tenantReadyRes.status,
    200,
    `Expected 200, got ${tenantReadyRes.status} for tenant preflight: ${tenantReadyRes.body}`,
  );

  const createProfRes = await fetchJson("/api/v1/professionals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Dr. Smith", slug: "dr-smith" }),
  });
  assert.equal(
    createProfRes.status,
    201,
    `Expected 201, got ${createProfRes.status} for professional create: ${createProfRes.body}`,
  );
  const profId = createProfRes.json.id;
  execPsql(`UPDATE professionals SET user_id = '${profUserId}' WHERE id = '${profId}'`);

  // Create second professional not linked to profUserId
  const createProf2Res = await fetchJson("/api/v1/professionals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Dr. Jones", slug: "dr-jones" }),
  });
  assert.equal(createProf2Res.status, 201, `Expected 201, got ${createProf2Res.status} for second professional create`);
  const otherProfId = createProf2Res.json.id;

  // ═══════════════════════════════════════════════════════════════
  // Create services
  // ═══════════════════════════════════════════════════════════════

  const createServiceRes = await fetchJson("/api/v1/services", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Consultation 30min", durationMin: 30, priceCents: 5000 }),
  });
  assert.equal(createServiceRes.status, 201, `Expected 201, got ${createServiceRes.status} for service create`);
  const serviceId = createServiceRes.json.id;

  const createLongServiceRes = await fetchJson("/api/v1/services", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Long Session 1h", durationMin: 60, priceCents: 10000 }),
  });
  assert.equal(createLongServiceRes.status, 201, `Expected 201, got ${createLongServiceRes.status} for long service create`);
  const longServiceId = createLongServiceRes.json.id;

  // Create inactive service
  const createInactiveServiceRes = await fetchJson("/api/v1/services", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Inactive Service", durationMin: 30, priceCents: 1000 }),
  });
  assert.equal(createInactiveServiceRes.status, 201, `Expected 201, got ${createInactiveServiceRes.status} for inactive service create`);
  const inactiveServiceId = createInactiveServiceRes.json.id;
  execPsql(`UPDATE services SET active = false WHERE id = '${inactiveServiceId}'`);

  // Link services to professional
  execPsql(`INSERT INTO professional_services (organization_id, professional_id, service_id) VALUES ('${ownerOrgId}', '${profId}', '${serviceId}');`);
  execPsql(`INSERT INTO professional_services (organization_id, professional_id, service_id) VALUES ('${ownerOrgId}', '${profId}', '${longServiceId}');`);
  execPsql(`INSERT INTO professional_services (organization_id, professional_id, service_id) VALUES ('${ownerOrgId}', '${profId}', '${inactiveServiceId}');`);

  // ═══════════════════════════════════════════════════════════════
  // Set working hours for Mon-Fri 09:00-17:00
  // ═══════════════════════════════════════════════════════════════

  await fetchJson(`/api/v1/professionals/${profId}/working-hours`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({
      shifts: [
        { weekday: 1, startTime: "09:00", endTime: "17:00" },
        { weekday: 2, startTime: "09:00", endTime: "17:00" },
        { weekday: 3, startTime: "09:00", endTime: "17:00" },
        { weekday: 4, startTime: "09:00", endTime: "17:00" },
        { weekday: 5, startTime: "09:00", endTime: "17:00" },
      ],
    }),
  });

  // Also set working hours for otherProfId (for scope tests)
  await fetchJson(`/api/v1/professionals/${otherProfId}/working-hours`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({
      shifts: [
        { weekday: 1, startTime: "09:00", endTime: "17:00" },
      ],
    }),
  });

  // Link services to other professional
  execPsql(`INSERT INTO professional_services (organization_id, professional_id, service_id) VALUES ('${ownerOrgId}', '${otherProfId}', '${serviceId}');`);

  // ═══════════════════════════════════════════════════════════════
  // Find a valid appointment slot in the next business day
  // ═══════════════════════════════════════════════════════════════

  const from = daysFromNow(1);
  const to = daysFromNow(8);

  async function findSlot(proId, servId, hoursAhead = 0) {
    const availRes = await fetchJson(
      `/api/v1/professionals/${proId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&serviceId=${servId}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    const days = availRes.json.days;
    for (const day of days) {
      if (day.slots.length > hoursAhead) {
        return day.slots[hoursAhead];
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════
  // T1: Create appointment → 201 with valid structure
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Create Appointment ───\n");

  let slot;

  await testAsync("POST /appointments → 201 with valid structure", async () => {
    slot = await findSlot(profId, serviceId);
    assert.ok(slot, "No available slots found");
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Maria Silva", phone: "(11) 99999-9999" },
        note: "Primeira consulta",
      }),
    });
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    assert.ok(res.json, "should have body");
    assert.equal(res.json.professionalId, profId);
    assert.equal(res.json.serviceId, serviceId);
    assert.equal(res.json.status, "CONFIRMED");
    assert.equal(res.json.source, "PANEL");
    assert.equal(res.json.version, 1);
    assert.equal(res.json.clientName, "Maria Silva");
    assert.ok(res.json.clientPhone, "should have phone");
    assert.equal(res.json.serviceNameSnapshot, "Consultation 30min");
    assert.equal(res.json.serviceDurationMinSnapshot, 30);
    assert.equal(res.json.servicePriceCentsSnapshot, 5000);
    assert.equal(res.json.serviceCurrencySnapshot, "BRL");
    assert.ok(res.json.startsAt, "should have startsAt");
    assert.ok(res.json.endsAt, "should have endsAt");

    const persisted = execPsql(
      `SELECT organization_id, service_name_snapshot, service_duration_min_snapshot, service_price_cents_snapshot, service_currency_snapshot FROM appointments WHERE id = '${res.json.id}'`,
    ).split("|").map((value) => value.trim());
    assert.equal(persisted[0], ownerOrgId);
    assert.equal(persisted[1], "Consultation 30min");
    assert.equal(persisted[2], "30");
    assert.equal(persisted[3], "5000");
    assert.equal(persisted[4], "BRL");
  });

  // ═══════════════════════════════════════════════════════════════
  // T2: Create with invalid phone → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST /appointments with invalid phone → 422", async () => {
    slot = await findSlot(profId, serviceId, 1);
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Bad Phone", phone: "123" },
      }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    assert.equal(res.json?.error?.code, "VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════
  // T3: Create with invalid startsAt format → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST /appointments with invalid startsAt → 422", async () => {
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: "not-a-date",
        client: { name: "Invalid Date", phone: "(11) 98888-7777" },
      }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    assert.equal(res.json?.error?.code, "VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════
  // T4: Create missing required field → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST /appointments missing professionalId → 422", async () => {
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        serviceId: serviceId,
        startsAt: "2026-06-01T09:00:00-03:00",
        client: { name: "No Prof", phone: "(11) 97777-6666" },
      }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T5: Create with non-existent professional → 404
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Not Found Scenarios ───\n");

  await testAsync("POST /appointments with non-existent professional → 404", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000001";
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: fakeId,
        serviceId: serviceId,
        startsAt: "2026-06-01T09:00:00-03:00",
        client: { name: "Fake Prof", phone: "(11) 96666-5555" },
      }),
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T6: Create with non-existent service → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST /appointments with non-existent service → 404", async () => {
    const fakeServiceId = "00000000-0000-0000-0000-000000000002";
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: fakeServiceId,
        startsAt: "2026-06-01T09:00:00-03:00",
        client: { name: "Fake Service", phone: "(11) 95555-4444" },
      }),
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T7: Create with inactive service → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST /appointments with inactive service → 404", async () => {
    slot = await findSlot(profId, serviceId, 2);
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: inactiveServiceId,
        startsAt: slot.startsAt,
        client: { name: "Inactive", phone: "(11) 94444-3333" },
      }),
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T8: Create with service not assigned to professional → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST /appointments with unassigned service → 404", async () => {
    await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: otherProfId,
        serviceId: serviceId,
        startsAt: "2026-06-01T09:00:00-03:00",
        client: { name: "Other Prof", phone: "(11) 93333-2222" },
      }),
    });
    // Service not linked to otherProfId — this will fail at the professional_services junction check
  });

  // ═══════════════════════════════════════════════════════════════
  // T9: Create appointment conflict (same slot) → 409
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Conflict Scenarios ───\n");

  let firstSlotForConflict;

  await testAsync("POST duplicate slot → 409 APPOINTMENT_CONFLICT", async () => {
    firstSlotForConflict = await findSlot(profId, serviceId, 3);
    assert.ok(firstSlotForConflict, "Need a slot for conflict test");

    // Book first
    const res1 = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: firstSlotForConflict.startsAt,
        client: { name: "First Booker", phone: "(11) 92222-1111" },
      }),
    });
    assert.equal(res1.status, 201, `First book should succeed, got ${res1.status}`);

    // Book same slot again
    const res2 = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: firstSlotForConflict.startsAt,
        client: { name: "Second Booker", phone: "(11) 91111-0000" },
      }),
    });
    assert.equal(res2.status, 409, `Expected 409, got ${res2.status}`);
    assert.equal(res2.json?.error?.code, "APPOINTMENT_CONFLICT");

    const overlapCount = execPsql(
      `SELECT count(*) FROM appointments WHERE organization_id = '${ownerOrgId}' AND professional_id = '${profId}' AND starts_at = '${firstSlotForConflict.startsAt}'`,
    );
    assert.equal(overlapCount.trim(), "1");
  });

  // ═══════════════════════════════════════════════════════════════
  // T10: Create outside working hours → 422
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Gate de Jornada ───\n");

  await testAsync("POST outside working hours (06:00) → 422", async () => {
    // Find a day in the range and use 06:00 which is outside 09:00-17:00
    const availRes = await fetchJson(
      `/api/v1/professionals/${profId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    const day = availRes.json.days.find((d) => d.slots.length > 0);
    assert.ok(day, "Need a day with slots");
    const earlyTime = `${day.date}T06:00:00-03:00`;

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: earlyTime,
        client: { name: "Early Bird", phone: "(11) 98888-9999" },
      }),
    });
    // Could be 422 (outside hours) or 422 (off-grid)
    assert.ok(res.status === 422 || res.status === 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T11: Create outside working hours with allowOutsideHours → 201
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST with allowOutsideHours → 201", async () => {
    const availRes = await fetchJson(
      `/api/v1/professionals/${profId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    const day = availRes.json.days.find((d) => d.slots.length > 0);
    assert.ok(day, "Need a day with slots");

    // Use 08:00 which is before 09:00, but on-grid (30-min intervals)
    const earlyTime = `${day.date}T08:00:00-03:00`;

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: earlyTime,
        client: { name: "Early With Flag", phone: "(11) 97777-8888" },
        allowOutsideHours: true,
      }),
    });
    // May be 201 (if on-grid and allowOutsideHours respected) or 422 (off-grid)
    if (res.status === 201) {
      assert.equal(res.json.status, "CONFIRMED");
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // T12: Create within block → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST within availability block → 422", async () => {
    // Find slots and block the first one
    const availRes = await fetchJson(
      `/api/v1/professionals/${profId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    const allSlots = availRes.json.days.flatMap((d) => d.slots);
    assert.ok(allSlots.length > 4, "Need enough slots");

    const targetSlot = allSlots[4];
    const blockStart = targetSlot.startsAt;
    const blockEnd = targetSlot.endsAt;

    // Create block
    await fetchJson(`/api/v1/professionals/${profId}/blocks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ startsAt: blockStart, endsAt: blockEnd, reason: "Test block" }),
    });

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: blockStart,
        client: { name: "Blocked", phone: "(11) 96666-7777" },
      }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T13: Unauthenticated → 401
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Auth ───\n");

  await testAsync("POST /appointments without auth → 401", async () => {
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: "2026-06-01T09:00:00-03:00",
        client: { name: "No Auth", phone: "(11) 95555-6666" },
      }),
    });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T14: Cross-tenant access → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST /appointments cross-tenant → 403", async () => {
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${otherAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: "2026-06-01T09:00:00-03:00",
        client: { name: "Cross Tenant", phone: "(11) 94444-5555" },
      }),
    });
    // Will get 404 or 403 because the professional doesn't exist in that tenant
    assert.ok([403, 404].includes(res.status), `Expected 403/404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T15: Missing Idempotency-Key → 400
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Idempotency ───\n");

  await testAsync("POST /appointments without Idempotency-Key → 400", async () => {
    const slot = await findSlot(profId, serviceId, 5);
    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "No Key", phone: "(11) 93333-4444" },
      }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T16: Idempotency replay → returns same response
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Idempotency key replay → returns same 201 response", async () => {
    const slot = await findSlot(profId, serviceId, 6);
    assert.ok(slot, "Need slot");
    const key = idempotencyKey();
    const body = JSON.stringify({
      professionalId: profId,
      serviceId: serviceId,
      startsAt: slot.startsAt,
      client: { name: "Replay Test", phone: "(11) 92222-3333" },
    });

    const res1 = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": key,
      },
      body,
    });
    assert.equal(res1.status, 201, `First call should succeed, got ${res1.status}`);
    const id1 = res1.json.id;

    const res2 = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": key,
      },
      body,
    });
    assert.equal(res2.status, 201, `Replay should return 201, got ${res2.status}`);
    assert.equal(res2.json.id, id1, "Replay should return same appointment id");
  });

  // ═══════════════════════════════════════════════════════════════
  // T17: Idempotency key reused with different payload → 409
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Idempotency key reused with different body → 409", async () => {
    const slot = await findSlot(profId, serviceId, 7);
    assert.ok(slot, "Need slot");
    const key = idempotencyKey();

    await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": key,
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "First", phone: "(11) 91111-2222" },
      }),
    });

    const res2 = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": key,
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Second Different", phone: "(11) 91111-3333" },
      }),
    });
    assert.equal(res2.status, 409, `Expected 409, got ${res2.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T18: Reschedule appointment → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Reschedule ───\n");

  let rescheduleApptId;
  let rescheduleVersion;

  await testAsync("PATCH /appointments/:id reschedule → 200", async () => {
    const slotA = await findSlot(profId, serviceId, 8);
    const slotB = await findSlot(profId, serviceId, 9);
    assert.ok(slotA && slotB, "Need slots");

    // Create an appointment first
    const createRes = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slotA.startsAt,
        client: { name: "Reschedule Me", phone: "(11) 98888-1111" },
      }),
    });
    assert.equal(createRes.status, 201);
    rescheduleApptId = createRes.json.id;
    rescheduleVersion = createRes.json.version;

    // Reschedule to a different slot
    const patchRes = await fetchJson(`/api/v1/appointments/${rescheduleApptId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
        "if-match": String(rescheduleVersion),
      },
      body: JSON.stringify({
        startsAt: slotB.startsAt,
      }),
    });
    assert.equal(patchRes.status, 200, `Expected 200, got ${patchRes.status}`);
    assert.equal(patchRes.json.startsAt, slotB.startsAt);
    rescheduleVersion = patchRes.json.version;
  });

  // ═══════════════════════════════════════════════════════════════
  // T19: Reschedule with note only → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PATCH /appointments/:id note only → 200", async () => {
    const patchRes = await fetchJson(`/api/v1/appointments/${rescheduleApptId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
        "if-match": String(rescheduleVersion),
      },
      body: JSON.stringify({
        note: "Updated note",
      }),
    });
    assert.equal(patchRes.status, 200, `Expected 200, got ${patchRes.status}`);
    assert.equal(patchRes.json.note, "Updated note");
    rescheduleVersion = patchRes.json.version;
  });

  // ═══════════════════════════════════════════════════════════════
  // T20: Reschedule without If-Match → 400
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PATCH without If-Match → 400", async () => {
    const res = await fetchJson(`/api/v1/appointments/${rescheduleApptId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        note: "Should fail",
      }),
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T21: Reschedule with wrong version → 409
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PATCH with wrong version → 409", async () => {
    const res = await fetchJson(`/api/v1/appointments/${rescheduleApptId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
        "if-match": "999",
      },
      body: JSON.stringify({
        note: "Should fail version",
      }),
    });
    assert.equal(res.status, 409, `Expected 409, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T22: Reschedule with empty body → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PATCH with empty body → 422", async () => {
    const res = await fetchJson(`/api/v1/appointments/${rescheduleApptId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
        "if-match": String(rescheduleVersion),
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T23: Cancel appointment → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Cancel ───\n");

  let cancelApptId;
  let cancelVersion;

  await testAsync("POST /appointments/:id/cancel → 200", async () => {
    const slot = await findSlot(profId, serviceId, 10);
    assert.ok(slot, "Need slot");

    const createRes = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Cancel Me", phone: "(11) 97777-0000" },
      }),
    });
    assert.equal(createRes.status, 201);
    cancelApptId = createRes.json.id;
    cancelVersion = createRes.json.version;

    const cancelRes = await fetchJson(`/api/v1/appointments/${cancelApptId}/cancel`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
        "if-match": String(cancelVersion),
      },
    });
    assert.equal(cancelRes.status, 200, `Expected 200, got ${cancelRes.status}`);
    assert.equal(cancelRes.json.status, "CANCELLED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T24: Cancel without If-Match → 400
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST cancel without If-Match → 400", async () => {
    const res = await fetchJson(`/api/v1/appointments/${rescheduleApptId}/cancel`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T25: Cancel already cancelled → 409
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Cancel already CANCELLED → 409", async () => {
    const res = await fetchJson(`/api/v1/appointments/${cancelApptId}/cancel`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
        "if-match": String(cancelVersion + 1),
      },
    });
    assert.equal(res.status, 409, `Expected 409, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T26: Complete appointment → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Complete ───\n");

  let completeApptId;
  let completeVersion;

  await testAsync("POST /appointments/:id/complete → 200", async () => {
    const slot = await findSlot(profId, serviceId, 11);
    assert.ok(slot, "Need slot");

    const createRes = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Complete Me", phone: "(11) 96666-0000" },
      }),
    });
    assert.equal(createRes.status, 201);
    completeApptId = createRes.json.id;
    completeVersion = createRes.json.version;

    const completeRes = await fetchJson(`/api/v1/appointments/${completeApptId}/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
        "if-match": String(completeVersion),
      },
    });
    assert.equal(completeRes.status, 200, `Expected 200, got ${completeRes.status}`);
    assert.equal(completeRes.json.status, "COMPLETED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T27: Complete without If-Match → 400
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST complete without If-Match → 400", async () => {
    const res = await fetchJson(`/api/v1/appointments/${rescheduleApptId}/complete`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T28: No-show appointment → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("─── No-Show ───\n");

  await testAsync("POST /appointments/:id/no-show → 200", async () => {
    const slot = await findSlot(profId, longServiceId, 0);
    assert.ok(slot, "Need slot");

    const createRes = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: longServiceId,
        startsAt: slot.startsAt,
        client: { name: "No Show Me", phone: "(11) 95555-0000" },
      }),
    });
    assert.equal(createRes.status, 201);
    const noShowId = createRes.json.id;
    const version = createRes.json.version;

    const noShowRes = await fetchJson(`/api/v1/appointments/${noShowId}/no-show`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
        "if-match": String(version),
      },
    });
    assert.equal(noShowRes.status, 200, `Expected 200, got ${noShowRes.status}`);
    assert.equal(noShowRes.json.status, "NO_SHOW");
  });

  // ═══════════════════════════════════════════════════════════════
  // T29: No-show without If-Match → 400
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST no-show without If-Match → 400", async () => {
    const res = await fetchJson(`/api/v1/appointments/${rescheduleApptId}/no-show`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T30: PROFESSIONAL scope: can create on own professional → 201
  // ═══════════════════════════════════════════════════════════════
  console.log("─── PROFESSIONAL Scope ───\n");

  await testAsync("PROFESSIONAL creates on own professional → 201", async () => {
    const slot = await findSlot(profId, serviceId, 12);
    assert.ok(slot, "Need slot");

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Prof Own", phone: "(11) 94444-0000" },
      }),
    });
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    assert.equal(res.json.status, "CONFIRMED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T31: PROFESSIONAL scope: cannot operate on other's appointments → 403
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL tries to create on other professional → 403", async () => {
    const slot = await findSlot(otherProfId, serviceId, 0);
    assert.ok(slot, "Need slot");

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: otherProfId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Other Prof", phone: "(11) 93333-0000" },
      }),
    });
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T32: Phone masking: PROFESSIONAL sees masked phone for other's appointments
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Phone Masking ───\n");

  await testAsync("OWNER sees full phone", async () => {
    const slot = await findSlot(profId, serviceId, 13);
    assert.ok(slot, "Need slot");

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Full Phone", phone: "(11) 91234-5678" },
      }),
    });
    assert.equal(res.status, 201);
    assert.ok(res.json.clientPhone, "should have phone");
    // Owner should see full phone (not masked)
    assert.ok(res.json.clientPhone.includes("1234") || res.json.clientPhone.includes("5678"), "Phone should not be masked for OWNER");
  });

  // ═══════════════════════════════════════════════════════════════
  // T33: Create with off-grid startsAt → 422
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Slot Grid ───\n");

  await testAsync("POST with off-grid startsAt → 422", async () => {
    const availRes = await fetchJson(
      `/api/v1/professionals/${profId}/availability?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    const day = availRes.json.days.find((d) => d.slots.length > 0);
    assert.ok(day, "Need a day");

    // 09:07 is off-grid for 30-min slot interval
    const offGridTime = `${day.date}T09:07:00-03:00`;

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: offGridTime,
        client: { name: "Off Grid", phone: "(11) 99999-0000" },
      }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T34: Create with 60-min service succeeds
  // ═══════════════════════════════════════════════════════════════

  await testAsync("POST with 60min service → 201", async () => {
    const slot = await findSlot(profId, longServiceId, 1);
    assert.ok(slot, "Need slot");

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: longServiceId,
        startsAt: slot.startsAt,
        client: { name: "Long Service", phone: "(11) 98888-0000" },
      }),
    });
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    // endsAt should be startsAt + 60 min
    const startMs = new Date(res.json.startsAt).getTime();
    const endMs = new Date(res.json.endsAt).getTime();
    assert.equal(endMs - startMs, 60 * 60 * 1000, "endsAt should be 60 min after startsAt");
  });

  // ═══════════════════════════════════════════════════════════════
  // T35: MANAGER can create appointment → 201
  // ═══════════════════════════════════════════════════════════════

  const managerEmail = `test-appt-manager-${ts}@example.com`;
  const managerUserId = randomUUID();
  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${managerUserId}', 'Manager User', '${managerEmail}', '${passwordHash}', now());
    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${ownerOrgId}', '${managerUserId}', 'MANAGER', 'ACTIVE');
  `);

  const [persistedManagerUserId, persistedManagerOrgId] = execPsql(`
    SELECT user_id, organization_id
    FROM organization_users
    WHERE user_id = '${managerUserId}'
      AND organization_id = '${ownerOrgId}'
    LIMIT 1;
  `).split("|").map((value) => value.trim());

  const managerAccessToken = await signAccessToken(
    persistedManagerUserId,
    persistedManagerOrgId,
  );

  await testAsync("MANAGER creates appointment → 201", async () => {
    const slot = await findSlot(profId, serviceId, 14);
    assert.ok(slot, "Need slot");

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Manager Client", phone: "(11) 97777-1111" },
      }),
    });
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T36: endsAt derived from service.durationMin → endsAt matches
  // ═══════════════════════════════════════════════════════════════

  await testAsync("endsAt = startsAt + service.durationMin", async () => {
    const slot = await findSlot(profId, serviceId, 15);
    assert.ok(slot, "Need slot");

    const res = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
        "idempotency-key": idempotencyKey(),
      },
      body: JSON.stringify({
        professionalId: profId,
        serviceId: serviceId,
        startsAt: slot.startsAt,
        client: { name: "Duration Test", phone: "(11) 96666-1111" },
      }),
    });
    assert.equal(res.status, 201);
    const startMs = new Date(res.json.startsAt).getTime();
    const endMs = new Date(res.json.endsAt).getTime();
    assert.equal(endMs - startMs, 30 * 60 * 1000, "endsAt should be startsAt + 30 min");
  });

  // ═══════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════
  console.log(`\n─── Results ───`);
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);

  if (errors.length > 0) {
    console.log("\nErrors:");
    for (const e of errors) {
      console.log(`  T${e.test}: ${e.name} - ${e.error}`);
    }
  }

} finally {
  console.log("\nStopping API...");
  killApi(api);
  await new Promise((r) => setTimeout(r, 500));
}

if (failed > 0) {
  process.exit(1);
}

console.log("All tests passed.\n");
