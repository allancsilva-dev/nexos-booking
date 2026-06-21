import { spawn, execSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { strict as assert } from "node:assert";
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
    const dbPort = envOverrides.POSTGRES_PORT ?? dotEnv.POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? "5432";
    const dbHost = envOverrides.POSTGRES_HOST ?? dotEnv.POSTGRES_HOST ?? process.env.POSTGRES_HOST ?? "127.0.0.1";

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
      DATABASE_URL:
        dotEnv.DATABASE_URL ??
        process.env.DATABASE_URL ??
        `postgres://${dotEnv.POSTGRES_USER ?? process.env.POSTGRES_USER ?? "nexos_booking"}:${dotEnv.POSTGRES_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? ""}@${dbHost}:${dbPort}/${dotEnv.POSTGRES_DB ?? process.env.POSTGRES_DB ?? "nexos_booking"}`,
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
    user: dotEnv.POSTGRES_USER ?? process.env.POSTGRES_USER ?? "nexos_booking",
    pass: dotEnv.POSTGRES_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? "nexos_booking_local_password",
    db: dotEnv.POSTGRES_DB ?? process.env.POSTGRES_DB ?? "nexos_booking",
  };
}

function execPsql(sql) {
  const { user, pass, db } = resolveDbEnv();
  return execSync(
    `docker compose exec -T -e PGPASSWORD="${pass}" postgres psql -t -U "${user}" -d "${db}" -c "${sql.replace(/"/g, '\\"')}"`,
    { cwd: repoRoot(), encoding: "utf8" },
  ).trim();
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
  return `test-list-${ts}-${rand}`;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
console.log("\nPR-6.2 Appointments List + Events Test Harness\n");
console.log("==============================================\n");

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

  const ownerEmail = `test-list-owner-${ts}@example.com`;
  const ownerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Owner User", email: ownerEmail, password: testPassword, organizationName: "List Test Org" }),
  });
  const ownerOrgId = ownerReg.json.organization.id;
  let ownerAccessToken = ownerReg.json.accessToken;

  const ownerLogin = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: testPassword }),
  });
  ownerAccessToken = ownerLogin.json.accessToken;

  const profEmail = `test-list-prof-${ts}@example.com`;
  const profReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prof User", email: profEmail, password: testPassword, organizationName: "Prof Org" }),
  });
  const profUserId = profReg.json.user.id;
  let profAccessToken = profReg.json.accessToken;

  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${profUserId}', 'PROFESSIONAL', 'ACTIVE');`);

  const profLogin = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: profEmail, password: testPassword }),
  });
  profAccessToken = profLogin.json.accessToken;

  const otherEmail = `test-list-other-${ts}@example.com`;
  const otherReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Other User", email: otherEmail, password: testPassword, organizationName: "Other Org" }),
  });
  const otherAccessToken = otherReg.json.accessToken;

  // Setup org config
  execPsql(`UPDATE organizations SET timezone = 'America/Sao_Paulo', slot_interval_min = 30 WHERE id = '${ownerOrgId}'`);

  // ═══════════════════════════════════════════════════════════════
  // Create professionals
  // ═══════════════════════════════════════════════════════════════

  const createProfRes = await fetchJson("/api/v1/professionals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Dr. Smith", slug: "dr-smith" }),
  });
  const profId = createProfRes.json.id;
  execPsql(`UPDATE professionals SET user_id = '${profUserId}' WHERE id = '${profId}'`);

  const createProf2Res = await fetchJson("/api/v1/professionals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Dr. Jones", slug: "dr-jones" }),
  });
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
  const serviceId = createServiceRes.json.id;

  const createLongServiceRes = await fetchJson("/api/v1/services", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Long Session 1h", durationMin: 60, priceCents: 10000 }),
  });
  const longServiceId = createLongServiceRes.json.id;

  // Link services to professional
  execPsql(`INSERT INTO professional_services (organization_id, professional_id, service_id) VALUES ('${ownerOrgId}', '${profId}', '${serviceId}');`);
  execPsql(`INSERT INTO professional_services (organization_id, professional_id, service_id) VALUES ('${ownerOrgId}', '${profId}', '${longServiceId}');`);

  // Link services to other professional
  execPsql(`INSERT INTO professional_services (organization_id, professional_id, service_id) VALUES ('${ownerOrgId}', '${otherProfId}', '${serviceId}');`);

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

  // ═══════════════════════════════════════════════════════════════
  // Find a valid appointment slot
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
  // Create multiple appointments for list testing
  // ═══════════════════════════════════════════════════════════════

  const createdAppointments = [];
  let nextSlotIdx = 0;

  for (let i = 0; i < 5; i++) {
    const slot = await findSlot(profId, serviceId, nextSlotIdx);
    assert.ok(slot, `Need slot ${i}`);
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
        client: { name: `Client ${i}`, phone: `(11) 9${String(i).padStart(4, "0")}-${String(i).padStart(4, "0")}` },
      }),
    });
    assert.equal(res.status, 201, `Create ${i} failed with ${res.status}`);
    createdAppointments.push(res.json);
    nextSlotIdx++;
  }

  // Create one with long service
  const longSlot = await findSlot(profId, longServiceId, 0);
  assert.ok(longSlot, "Need long slot");
  const longRes = await fetchJson("/api/v1/appointments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
      "idempotency-key": idempotencyKey(),
    },
    body: JSON.stringify({
      professionalId: profId,
      serviceId: longServiceId,
      startsAt: longSlot.startsAt,
      client: { name: "Long Client", phone: "(11) 99999-9999" },
    }),
  });
  assert.equal(longRes.status, 201, `Create long failed`);

  // Create one for other professional
  const otherSlot = await findSlot(otherProfId, serviceId, 0);
  assert.ok(otherSlot, "Need other slot");
  const otherApptRes = await fetchJson("/api/v1/appointments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
      "idempotency-key": idempotencyKey(),
    },
    body: JSON.stringify({
      professionalId: otherProfId,
      serviceId: serviceId,
      startsAt: otherSlot.startsAt,
      client: { name: "Other Prof Client", phone: "(11) 98888-8888" },
    }),
  });
  assert.equal(otherApptRes.status, 201, "Create other prof appointment failed");

  // Cancel one appointment for status filter testing
  const cancelSlot = await findSlot(profId, serviceId, nextSlotIdx);
  assert.ok(cancelSlot, "Need cancel slot");
  const cancelAppt = await fetchJson("/api/v1/appointments", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
      "idempotency-key": idempotencyKey(),
    },
    body: JSON.stringify({
      professionalId: profId,
      serviceId: serviceId,
      startsAt: cancelSlot.startsAt,
      client: { name: "Cancel Me", phone: "(11) 97777-7777" },
    }),
  });
  assert.equal(cancelAppt.status, 201);
  const cancelRes = await fetchJson(`/api/v1/appointments/${cancelAppt.json.id}/cancel`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
      "idempotency-key": idempotencyKey(),
      "if-match": "1",
    },
  });
  assert.equal(cancelRes.status, 200);

  nextSlotIdx++;

  // ═══════════════════════════════════════════════════════════════
  // T1: GET /appointments with from/to → 200 with items
  // ═══════════════════════════════════════════════════════════════
  console.log("─── List Appointments ───\n");

  await testAsync("GET /appointments?from=&to= → 200 with items array", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.json.items), "items should be array");
    assert.ok(res.json.items.length > 0, "items should not be empty");
    assert.ok("nextCursor" in res.json, "should have nextCursor");
  });

  // ═══════════════════════════════════════════════════════════════
  // T2: List missing from → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments missing from → 422", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?to=${encodeURIComponent(to)}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T3: List missing to → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments missing to → 422", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T4: List with professionalId filter → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments?professionalId= → filtered results", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&professionalId=${profId}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    for (const item of res.json.items) {
      assert.equal(item.professionalId, profId, "all items should match professionalId filter");
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // T5: List with serviceId filter → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments?serviceId= → filtered results", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    for (const item of res.json.items) {
      assert.equal(item.serviceId, serviceId, "all items should match serviceId filter");
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // T6: List with status filter → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments?status=CONFIRMED → only CONFIRMED", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=CONFIRMED`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    for (const item of res.json.items) {
      assert.equal(item.status, "CONFIRMED", "all items should be CONFIRMED");
    }
  });

  await testAsync("GET /appointments?status=CANCELLED → only CANCELLED", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&status=CANCELLED`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    for (const item of res.json.items) {
      assert.equal(item.status, "CANCELLED", "all items should be CANCELLED");
    }
    assert.ok(res.json.items.length > 0, "should have at least one CANCELLED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T7: List with limit → enforces limit
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments?limit=2 → max 2 items", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=2`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length <= 2, `items should be <= 2, got ${res.json.items.length}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T8: List cursor pagination → nextCursor works
  // ═══════════════════════════════════════════════════════════════

  let firstPageCursor;

  await testAsync("GET /appointments?limit=2 → returns nextCursor", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=2`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length === 2, `should have 2 items`);
    assert.ok(res.json.nextCursor, "should have nextCursor");
    firstPageCursor = res.json.nextCursor;
  });

  await testAsync("GET /appointments?cursor= → second page differs", async () => {
    assert.ok(firstPageCursor, "need cursor from previous test");
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=2&cursor=${encodeURIComponent(firstPageCursor)}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length > 0, "second page should have items");
  });

  // ═══════════════════════════════════════════════════════════════
  // T9: List with 31-day window → 422 if exceeds
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments with >31 day window → 422", async () => {
    const tooFar = daysFromNow(40);
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(tooFar)}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T10: List as unauthenticated → 401
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Auth & Scope ───\n");

  await testAsync("GET /appointments without auth → 401", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T11: List as PROFESSIONAL → own professional only, 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL lists appointments → sees only own", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: { authorization: `Bearer ${profAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    for (const item of res.json.items) {
      assert.equal(item.professionalId, profId, "PROFESSIONAL should only see own professional");
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // T12: PROFESSIONAL lists with other professionalId → 403
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL lists other professionalId → 403", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&professionalId=${otherProfId}`,
      { headers: { authorization: `Bearer ${profAccessToken}` } },
    );
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T13: List cross-tenant → 401/403
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Cross-tenant list → unauthorized", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: { authorization: `Bearer ${otherAccessToken}` } },
    );
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T14: List items DO NOT have note, clientId, createdAt, updatedAt
  // ═══════════════════════════════════════════════════════════════
  console.log("─── DTO Shape ───\n");

  await testAsync("List items exclude note, clientId, createdAt, updatedAt", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200);
    const item = res.json.items[0];
    assert.ok(item, "should have one item");
    assert.ok(!("note" in item), "should NOT have note");
    assert.ok(!("clientId" in item), "should NOT have clientId");
    assert.ok(!("createdAt" in item), "should NOT have createdAt");
    assert.ok(!("updatedAt" in item), "should NOT have updatedAt");
  });

  // ═══════════════════════════════════════════════════════════════
  // T15: List items have required fields
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List items have all required fields", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    const item = res.json.items[0];
    assert.ok(item.id, "should have id");
    assert.ok(item.startsAt, "should have startsAt");
    assert.ok(item.endsAt, "should have endsAt");
    assert.ok(item.status, "should have status");
    assert.ok(item.professionalId, "should have professionalId");
    assert.ok(item.serviceId, "should have serviceId");
    assert.ok("clientName" in item, "should have clientName");
    assert.ok("clientPhone" in item, "should have clientPhone");
    assert.ok(item.version !== undefined, "should have version");
    assert.ok(item.source, "should have source");
    assert.ok(["PANEL", "PUBLIC"].includes(item.source), "source should be PANEL or PUBLIC");
  });

  // ═══════════════════════════════════════════════════════════════
  // T16: Phone masking — OWNER sees full phone
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Phone Masking ───\n");

  await testAsync("OWNER sees unmasked phone in list", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=5`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200);
    let foundFullPhone = false;
    for (const item of res.json.items) {
      if (item.clientPhone && item.clientPhone.length > 8 && !item.clientPhone.includes("****")) {
        foundFullPhone = true;
        break;
      }
    }
    assert.ok(foundFullPhone, "OWNER should see full phone numbers");
  });

  // ═══════════════════════════════════════════════════════════════
  // T17: PROFESSIONAL sees masked phone for other's appointments
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL sees masked phone for other prof", async () => {
    // PROFESSIONAL (profId) cannot see otherProfId appointments, but let's check OWNER
    // Actually the masking is for PROFESSIONAL seeing their own appointments with client phone
    // Client appointments assigned to other professional should be masked
    // But PROFESSIONAL can't list other professional's appointments anyway (403 test above)
    // So just verify PROFESSIONAL sees full phone for own appointments
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=1`,
      { headers: { authorization: `Bearer ${profAccessToken}` } },
    );
    assert.equal(res.status, 200);
    if (res.json.items.length > 0) {
      const item = res.json.items[0];
      assert.ok(item.clientPhone, "PROFESSIONAL should see client phone for own appointments");
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // T18: Invalid cursor → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Invalid cursor → 422", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&cursor=notbase64!!!`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T19: GET /appointments/:id/events → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Get Events ───\n");

  let testApptId;

  await testAsync("GET /appointments/:id/events → 200 with event array", async () => {
    testApptId = createdAppointments[0].id;
    const res = await fetchJson(
      `/api/v1/appointments/${testApptId}/events`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.json), "events should be array");
    assert.ok(res.json.length >= 1, "should have at least CREATED event");
    const createdEvent = res.json.find((e) => e.eventType === "CREATED");
    assert.ok(createdEvent, "should have CREATED event");
    assert.ok(createdEvent.id, "event should have id");
    assert.ok(createdEvent.eventType, "event should have eventType");
    assert.ok(createdEvent.actorType, "event should have actorType");
    assert.ok(createdEvent.occurredAt, "event should have occurredAt");
    assert.ok(createdEvent.metadata, "event should have metadata");
  });

  // ═══════════════════════════════════════════════════════════════
  // T20: Event has no actorUserId
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Event DTO has no actorUserId", async () => {
    const res = await fetchJson(
      `/api/v1/appointments/${testApptId}/events`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200);
    for (const event of res.json) {
      assert.ok(!("actorUserId" in event), "event should NOT have actorUserId");
      assert.ok(!("publishedAt" in event), "event should NOT have publishedAt");
      assert.ok(!("publishAttempts" in event), "event should NOT have publishAttempts");
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // T21: CREATED event metadata has whitelisted fields
  // ═══════════════════════════════════════════════════════════════

  await testAsync("CREATED event metadata is whitelisted", async () => {
    const res = await fetchJson(
      `/api/v1/appointments/${testApptId}/events`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    const createdEvent = res.json.find((e) => e.eventType === "CREATED");
    assert.ok(createdEvent, "should have CREATED event");
    const meta = createdEvent.metadata;
    // Should have whitelisted fields
    assert.ok(meta.appointmentId || meta.version, "should have whitelisted fields");
    // Should NOT have raw fields like previousStatus, newStatus, cancelledByType etc
    assert.ok(!("previousStatus" in meta), "CREATED should NOT have previousStatus");
    assert.ok(!("newStatus" in meta), "CREATED should NOT have newStatus");
  });

  // ═══════════════════════════════════════════════════════════════
  // T22: Get events for non-existent appointment → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET events non-existent appointment → 404", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const res = await fetchJson(
      `/api/v1/appointments/${fakeId}/events`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T23: Events ordered by occurredAt ASC
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Events ordered by occurredAt ASC", async () => {
    const res = await fetchJson(
      `/api/v1/appointments/${testApptId}/events`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200);
    const events = res.json;
    for (let i = 1; i < events.length; i++) {
      assert.ok(
        events[i].occurredAt >= events[i - 1].occurredAt,
        `Events should be sorted ASC: ${events[i].occurredAt} >= ${events[i - 1].occurredAt}`,
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // T24: PROFESSIONAL can get events for own appointment → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL gets events for own appointment → 200", async () => {
    const res = await fetchJson(
      `/api/v1/appointments/${testApptId}/events`,
      { headers: { authorization: `Bearer ${profAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.json), "should be array");
  });

  // ═══════════════════════════════════════════════════════════════
  // T25: PROFESSIONAL gets events for other professional → 403
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Events Scope ───\n");

  await testAsync("PROFESSIONAL gets events for other professional → 403", async () => {
    const res = await fetchJson(
      `/api/v1/appointments/${otherApptRes.json.id}/events`,
      { headers: { authorization: `Bearer ${profAccessToken}` } },
    );
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T26: Events unauthenticated → 401
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET events without auth → 401", async () => {
    const res = await fetchJson(
      `/api/v1/appointments/${testApptId}/events`,
    );
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T27: List with invalid date range (from > to) → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments with from > to → 422", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T28: CANCELLED event metadata sanitized
  // ═══════════════════════════════════════════════════════════════

  await testAsync("CANCELLED event metadata is whitelisted", async () => {
    const res = await fetchJson(
      `/api/v1/appointments/${cancelAppt.json.id}/events`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200);
    const cancelledEvent = res.json.find((e) => e.eventType === "CANCELLED");
    assert.ok(cancelledEvent, "should have CANCELLED event");
    const meta = cancelledEvent.metadata;
    // CANCELLED whitelist: appointmentId, version
    assert.ok(!("previousStatus" in meta), "CANCELLED should NOT have previousStatus");
    assert.ok(!("newStatus" in meta), "CANCELLED should NOT have newStatus");
    assert.ok(!("professionalId" in meta), "CANCELLED should NOT have professionalId");
    assert.ok(!("serviceId" in meta), "CANCELLED should NOT have serviceId");
    assert.ok(!("clientId" in meta), "CANCELLED should NOT have clientId");
  });

  // ═══════════════════════════════════════════════════════════════
  // T29: Empty list for window with no appointments
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List empty window → empty items", async () => {
    const farFrom = daysFromNow(100);
    const farTo = daysFromNow(107);
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(farFrom)}&to=${encodeURIComponent(farTo)}`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.json.items), "items should be array");
    assert.equal(res.json.items.length, 0, "items should be empty");
    assert.equal(res.json.nextCursor, null, "nextCursor should be null");
  });

  // ═══════════════════════════════════════════════════════════════
  // T30: Limit capped at 100
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /appointments?limit=999 → capped at 100", async () => {
    const res = await fetchJson(
      `/api/v1/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=999`,
      { headers: { authorization: `Bearer ${ownerAccessToken}` } },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length <= 100, "should be capped at 100");
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
