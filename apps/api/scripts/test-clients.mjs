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

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
console.log("\nPR-6.3 Clients Management Test Harness\n");
console.log("======================================\n");

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

  const ownerEmail = `test-clients-owner-${ts}@example.com`;
  const ownerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Owner User", email: ownerEmail, password: testPassword, organizationName: "Clients Test Org" }),
  });
  const ownerOrgId = ownerReg.json.organization.id;
  let ownerAccessToken = ownerReg.json.accessToken;

  // Manager in owner's org
  const managerEmail = `test-clients-manager-${ts}@example.com`;
  const managerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Manager User", email: managerEmail, password: testPassword, organizationName: "Manager Org" }),
  });
  const managerUserId = managerReg.json.user.id;
  let managerAccessToken = managerReg.json.accessToken;

  // Professional in owner's org
  const profUserEmail = `test-clients-prof-${ts}@example.com`;
  const profReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prof User", email: profUserEmail, password: testPassword, organizationName: "Prof Org" }),
  });
  const profUserId = profReg.json.user.id;
  let profAccessToken = profReg.json.accessToken;

  // Cross-tenant user
  const otherEmail = `test-clients-other-${ts}@example.com`;
  const otherReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Other Org Owner", email: otherEmail, password: testPassword, organizationName: "Other Clients Org" }),
  });
  const otherAccessToken = otherReg.json.accessToken;

  // Add manager, prof as members of owner's org
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${managerUserId}', 'MANAGER', 'ACTIVE');`);
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${profUserId}', 'PROFESSIONAL', 'ACTIVE');`);

  // Re-login everyone
  const ownerLogin = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: testPassword }),
  });
  ownerAccessToken = ownerLogin.json.accessToken;

  const managerLogin = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: managerEmail, password: testPassword }),
  });
  managerAccessToken = managerLogin.json.accessToken;

  const profLogin = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: profUserEmail, password: testPassword }),
  });
  profAccessToken = profLogin.json.accessToken;

  // Create professional linked to profUserId
  const createProfRes = await fetchJson("/api/v1/professionals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Dr. Clients", slug: "dr-clients-test" }),
  });
  const profId = createProfRes.json.id;
  execPsql(`UPDATE professionals SET user_id = '${profUserId}' WHERE id = '${profId}'`);

  // Create another professional (not linked to prof user)
  const createProf2Res = await fetchJson("/api/v1/professionals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Dr. Other", slug: "dr-other-test" }),
  });
  const otherProfId = createProf2Res.json.id;

  // Create service + link
  const createServiceRes = await fetchJson("/api/v1/services", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Client Service 30min", durationMin: 30, priceCents: 5000 }),
  });
  const serviceId = createServiceRes.json.id;
  execPsql(`INSERT INTO professional_services (organization_id, professional_id, service_id) VALUES ('${ownerOrgId}', '${profId}', '${serviceId}');`);

  // Set working hours
  execPsql(`UPDATE organizations SET timezone = 'America/Sao_Paulo', slot_interval_min = 30 WHERE id = '${ownerOrgId}';`);
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

  // ═══════════════════════════════════════════════════════════════
  // Seed clients via DB
  // ═══════════════════════════════════════════════════════════════

  execPsql(`INSERT INTO clients (organization_id, name, phone, phone_normalized) VALUES ('${ownerOrgId}', 'Alice Silva', '(11) 91111-1111', '+5511911111111');`);
  execPsql(`INSERT INTO clients (organization_id, name, phone, phone_normalized) VALUES ('${ownerOrgId}', 'Bob Santos', '(11) 92222-2222', '+5511922222222');`);
  execPsql(`INSERT INTO clients (organization_id, name, phone, phone_normalized) VALUES ('${ownerOrgId}', 'Carlos Oliveira', '(11) 93333-3333', '+5511933333333');`);
  execPsql(`INSERT INTO clients (organization_id, name, phone, phone_normalized) VALUES ('${ownerOrgId}', 'Diana Costa', '(11) 94444-4444', '+5511944444444');`);
  execPsql(`INSERT INTO clients (organization_id, name, phone, phone_normalized) VALUES ('${ownerOrgId}', 'Eduardo Lima', NULL, NULL);`);
  execPsql(`INSERT INTO clients (organization_id, name, phone, phone_normalized) VALUES ('${ownerOrgId}', 'Fernanda Alves', '(11) 96666-6666', '+5511966666666');`);

  // Get client IDs
  const aliceId = execPsql(`SELECT id FROM clients WHERE organization_id = '${ownerOrgId}' AND phone_normalized = '+5511911111111'`);
  const bobId = execPsql(`SELECT id FROM clients WHERE organization_id = '${ownerOrgId}' AND phone_normalized = '+5511922222222'`);
  const carlosId = execPsql(`SELECT id FROM clients WHERE organization_id = '${ownerOrgId}' AND phone_normalized = '+5511933333333'`);
  const dianaId = execPsql(`SELECT id FROM clients WHERE organization_id = '${ownerOrgId}' AND phone_normalized = '+5511944444444'`);
  const eduardoId = execPsql(`SELECT id FROM clients WHERE organization_id = '${ownerOrgId}' AND name = 'Eduardo Lima'`);
  const fernandaId = execPsql(`SELECT id FROM clients WHERE organization_id = '${ownerOrgId}' AND phone_normalized = '+5511966666666'`);

  // Create appointments for Alice (with prof) and Bob (with prof)
  // Alice has 2 appointments with Dr. Clients
  execPsql(`INSERT INTO appointments (organization_id, professional_id, service_id, client_id, starts_at, ends_at, status, source, note)
    VALUES ('${ownerOrgId}', '${profId}', '${serviceId}', '${aliceId}', NOW() + INTERVAL '1 day' + INTERVAL '9 hours', NOW() + INTERVAL '1 day' + INTERVAL '9 hours 30 minutes', 'CONFIRMED', 'PANEL', 'Note for Alice');`);
  execPsql(`INSERT INTO appointments (organization_id, professional_id, service_id, client_id, starts_at, ends_at, status, source, note)
    VALUES ('${ownerOrgId}', '${profId}', '${serviceId}', '${aliceId}', NOW() + INTERVAL '7 days' + INTERVAL '9 hours', NOW() + INTERVAL '7 days' + INTERVAL '9 hours 30 minutes', 'CONFIRMED', 'PANEL', 'Another note for Alice');`);

  // Bob has 1 appointment with Dr. Clients
  execPsql(`INSERT INTO appointments (organization_id, professional_id, service_id, client_id, starts_at, ends_at, status, source, note)
    VALUES ('${ownerOrgId}', '${profId}', '${serviceId}', '${bobId}', NOW() + INTERVAL '2 days' + INTERVAL '10 hours', NOW() + INTERVAL '2 days' + INTERVAL '10 hours 30 minutes', 'CONFIRMED', 'PANEL', 'Note for Bob');`);

  // Carlos has no appointments

  // Diana has an appointment with otherProfId (not Dr. Clients)
  execPsql(`INSERT INTO appointments (organization_id, professional_id, service_id, client_id, starts_at, ends_at, status, source)
    VALUES ('${ownerOrgId}', '${otherProfId}', '${serviceId}', '${carlosId}', NOW() + INTERVAL '3 days' + INTERVAL '11 hours', NOW() + INTERVAL '3 days' + INTERVAL '11 hours 30 minutes', 'CONFIRMED', 'PANEL');`);

  // Fernanda has appointment with Dr. Clients
  execPsql(`INSERT INTO appointments (organization_id, professional_id, service_id, client_id, starts_at, ends_at, status, source)
    VALUES ('${ownerOrgId}', '${profId}', '${serviceId}', '${fernandaId}', NOW() + INTERVAL '4 days' + INTERVAL '14 hours', NOW() + INTERVAL '4 days' + INTERVAL '14 hours 30 minutes', 'CONFIRMED', 'PANEL');`);

  // Also seed client in other org (cross-tenant)
  const otherOrgId = otherReg.json.organization.id;
  execPsql(`INSERT INTO clients (organization_id, name, phone, phone_normalized) VALUES ('${otherOrgId}', 'Cross Tenant Client', '(11) 90000-0000', '+5511900000000');`);

  // ═══════════════════════════════════════════════════════════════
  // T1: OWNER lists all clients → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("─── List Clients ───\n");

  await testAsync("OWNER lists all clients → 200 with items", async () => {
    const res = await fetchJson("/api/v1/clients", {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.json.items), "items should be array");
    assert.ok(res.json.items.length >= 6, `should have at least 6 items, got ${res.json.items.length}`);
    assert.ok("nextCursor" in res.json, "should have nextCursor");
  });

  // ═══════════════════════════════════════════════════════════════
  // T2: MANAGER lists all clients → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("MANAGER lists all clients → 200", async () => {
    const res = await fetchJson("/api/v1/clients", {
      headers: { authorization: `Bearer ${managerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length > 0, "should have items");
  });

  // ═══════════════════════════════════════════════════════════════
  // T3: PROFESSIONAL lists clients → only those with own appointments
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL lists clients → only with own appointments", async () => {
    const res = await fetchJson("/api/v1/clients", {
      headers: { authorization: `Bearer ${profAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    // Prof should see Alice, Bob, Fernanda (who have appts with them)
    // Should NOT see Carlos (appt with otherProfId) or Diana, Eduardo (no appts)
    const names = res.json.items.map((i) => i.name);
    assert.ok(names.includes("Alice Silva"), "should include Alice");
    assert.ok(names.includes("Bob Santos"), "should include Bob");
    assert.ok(names.includes("Fernanda Alves"), "should include Fernanda");
    assert.ok(!names.includes("Carlos Oliveira"), "should NOT include Carlos (has other prof)");
    assert.ok(!names.includes("Diana Costa"), "should NOT include Diana (no appts)");
    assert.ok(!names.includes("Eduardo Lima"), "should NOT include Eduardo (no appts)");
  });

  // ═══════════════════════════════════════════════════════════════
  // T4: List with search by name
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List search by name → returns matching clients", async () => {
    const res = await fetchJson(`/api/v1/clients?search=Alice`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length >= 1, "should have at least 1 match");
    assert.equal(res.json.items[0].name, "Alice Silva", "should be Alice");
  });

  // ═══════════════════════════════════════════════════════════════
  // T5: List search by phone (normalized)
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List search by phone → returns exact match", async () => {
    const res = await fetchJson(`/api/v1/clients?search=11922222222`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.items.length, 1, "should have exactly 1 match");
    assert.equal(res.json.items[0].name, "Bob Santos", "should be Bob");
  });

  // ═══════════════════════════════════════════════════════════════
  // T6: List search with part of name (ILIKE substring)
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List search by partial name → ILIKE match", async () => {
    const res = await fetchJson(`/api/v1/clients?search=Sant`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length >= 1, "should have matches");
    const names = res.json.items.map((i) => i.name);
    assert.ok(names.some((n) => n.includes("Santos")), "should include Santos");
  });

  // ═══════════════════════════════════════════════════════════════
  // T7: List with pagination limit
  // ═══════════════════════════════════════════════════════════════

  let listPage1Names = [];

  await testAsync("List with limit=2 → max 2 items + nextCursor", async () => {
    const res = await fetchJson(`/api/v1/clients?limit=2`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length <= 2, `items should be <= 2, got ${res.json.items.length}`);
    assert.ok(res.json.nextCursor, "should have nextCursor");
    listPage1Names = res.json.items.map((i) => i.name);
  });

  // ═══════════════════════════════════════════════════════════════
  // T8: List cursor pagination → second page differs
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List cursor pagination → second page differs", async () => {
    const res1 = await fetchJson(`/api/v1/clients?limit=2`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    const cursor = res1.json.nextCursor;
    assert.ok(cursor, "should have cursor from page 1");

    const res2 = await fetchJson(`/api/v1/clients?limit=2&cursor=${encodeURIComponent(cursor)}`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res2.status, 200, `Expected 200, got ${res2.status}`);
    assert.ok(res2.json.items.length > 0, "second page should have items");
    const page2Names = res2.json.items.map((i) => i.name);
    const overlap = page2Names.filter((n) => listPage1Names.includes(n));
    assert.equal(overlap.length, 0, "second page should not overlap with first page");
  });

  // ═══════════════════════════════════════════════════════════════
  // T9: List invalid cursor → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List invalid cursor → 422", async () => {
    const res = await fetchJson(`/api/v1/clients?cursor=notbase64!!!`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T10: List limit capped at 100
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List limit=999 → capped at 100", async () => {
    const res = await fetchJson(`/api/v1/clients?limit=999`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.items.length <= 100, "should be capped at 100");
  });

  // ═══════════════════════════════════════════════════════════════
  // T11: List search with no results → empty items
  // ═══════════════════════════════════════════════════════════════

  await testAsync("List search no results → empty items", async () => {
    const res = await fetchJson(`/api/v1/clients?search=ZZZNotExist`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.items.length, 0, "items should be empty");
    assert.equal(res.json.nextCursor, null, "nextCursor should be null");
  });

  // ═══════════════════════════════════════════════════════════════
  // T12: List DTO shape (no phoneNormalized)
  // ═══════════════════════════════════════════════════════════════
  console.log("─── DTO Shape ───\n");

  await testAsync("List items exclude phoneNormalized", async () => {
    const res = await fetchJson(`/api/v1/clients?limit=1`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200);
    const item = res.json.items[0];
    assert.ok(item.id, "should have id");
    assert.ok(item.name, "should have name");
    assert.ok("phone" in item, "should have phone");
    assert.ok(!("phoneNormalized" in item), "should NOT have phoneNormalized");
    assert.ok(!("phone_normalized" in item), "should NOT have phone_normalized");
    assert.ok(!("createdAt" in item), "should NOT have createdAt");
    assert.ok(!("updatedAt" in item), "should NOT have updatedAt");
  });

  // ═══════════════════════════════════════════════════════════════
  // T13: Get client detail → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Get Client Detail ───\n");

  await testAsync("OWNER gets client detail → 200 with appointments", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.id, aliceId, "should return correct id");
    assert.equal(res.json.name, "Alice Silva", "should return name");
    assert.equal(res.json.phone, "(11) 91111-1111", "should return phone");
    assert.ok(Array.isArray(res.json.appointments), "appointments should be array");
    assert.ok(res.json.appointments.length >= 2, "Alice should have at least 2 appointments");
  });

  // ═══════════════════════════════════════════════════════════════
  // T14: Get client detail → non-existent → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Get client detail non-existent → 404", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const res = await fetchJson(`/api/v1/clients/${fakeId}`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T15: MANAGER gets client detail → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("MANAGER gets client detail → 200", async () => {
    const res = await fetchJson(`/api/v1/clients/${bobId}`, {
      headers: { authorization: `Bearer ${managerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.name, "Bob Santos", "should return name");
  });

  // ═══════════════════════════════════════════════════════════════
  // T16: PROFESSIONAL gets client detail → only own appointments
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL gets client detail → only own appointments", async () => {
    // Carlos has appt with otherProfId, so PROFESSIONAL should get detail but empty appointments
    const res = await fetchJson(`/api/v1/clients/${carlosId}`, {
      headers: { authorization: `Bearer ${profAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.name, "Carlos Oliveira", "should return name");
    assert.equal(res.json.appointments.length, 0, "PROFESSIONAL should not see other prof appointments");
  });

  // ═══════════════════════════════════════════════════════════════
  // T17: Detail DTO shape (no phoneNormalized, appointments have correct shape)
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Detail DTO has correct shape", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(!("phoneNormalized" in res.json), "should NOT have phoneNormalized");
    const appt = res.json.appointments[0];
    assert.ok(appt.id, "appointment should have id");
    assert.ok(appt.professionalId, "appointment should have professionalId");
    assert.ok(appt.serviceId, "appointment should have serviceId");
    assert.ok(appt.startsAt, "appointment should have startsAt");
    assert.ok(appt.endsAt, "appointment should have endsAt");
    assert.ok(appt.status, "appointment should have status");
    assert.ok(appt.source, "appointment should have source");
    assert.ok(!("note" in appt), "appointment should NOT have note");
    assert.ok(!("clientId" in appt), "appointment should NOT have clientId");
  });

  // ═══════════════════════════════════════════════════════════════
  // T18: Update client name → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Update Client ───\n");

  await testAsync("Update client name → 200", async () => {
    const res = await fetchJson(`/api/v1/clients/${dianaId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Diana Costa Updated" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.name, "Diana Costa Updated", "name should be updated");
    assert.equal(res.json.phone, null, "phone should be unchanged");
  });

  // ═══════════════════════════════════════════════════════════════
  // T19: Update client phone → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Update client phone → 200", async () => {
    const res = await fetchJson(`/api/v1/clients/${eduardoId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ phone: "(11) 95555-5555" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.phone, "(11) 95555-5555", "phone should be updated");
  });

  // ═══════════════════════════════════════════════════════════════
  // T20: Update client phone already taken → 409 PHONE_TAKEN
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Update phone to already taken → 409 PHONE_TAKEN", async () => {
    const res = await fetchJson(`/api/v1/clients/${eduardoId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ phone: "(11) 91111-1111" }),
    });
    assert.equal(res.status, 409, `Expected 409, got ${res.status}`);
    assert.equal(res.json?.error?.code, "PHONE_TAKEN", "should be PHONE_TAKEN");
  });

  // ═══════════════════════════════════════════════════════════════
  // T21: Update client invalid phone → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Update invalid phone → 422", async () => {
    const res = await fetchJson(`/api/v1/clients/${eduardoId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ phone: "123" }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    assert.equal(res.json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════
  // T22: Update non-existent client → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Update non-existent client → 404", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const res = await fetchJson(`/api/v1/clients/${fakeId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Ghost" }),
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T23: Update both name and phone → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Update name and phone → 200", async () => {
    const res = await fetchJson(`/api/v1/clients/${dianaId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Diana Costa", phone: "(11) 97777-7777" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.name, "Diana Costa", "name should be updated");
    assert.equal(res.json.phone, "(11) 97777-7777", "phone should be updated");
  });

  // ═══════════════════════════════════════════════════════════════
  // T24: Clear phone (set to empty string)
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Clear client phone → 200", async () => {
    const res = await fetchJson(`/api/v1/clients/${dianaId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ phone: "" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.phone, null, "phone should be null after clearing");
  });

  // ═══════════════════════════════════════════════════════════════
  // T25: MANAGER can update client
  // ═══════════════════════════════════════════════════════════════

  await testAsync("MANAGER can update client → 200", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerAccessToken}`,
      },
      body: JSON.stringify({ name: "Alice Silva Managed" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.name, "Alice Silva Managed", "name should be updated by manager");
  });

  // ═══════════════════════════════════════════════════════════════
  // T26: PROFESSIONAL cannot PATCH → 403
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Authorization ───\n");

  await testAsync("PROFESSIONAL cannot PATCH client → 403", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profAccessToken}`,
      },
      body: JSON.stringify({ name: "Hacked" }),
    });
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T27: PROFESSIONAL cannot anonymize → 403
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL cannot anonymize → 403", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${profAccessToken}` },
    });
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T28: MANAGER cannot anonymize → 403
  // ═══════════════════════════════════════════════════════════════

  await testAsync("MANAGER cannot anonymize → 403", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${managerAccessToken}` },
    });
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T29: Unauthenticated access → 401
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET /clients without auth → 401", async () => {
    const res = await fetchJson("/api/v1/clients");
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  await testAsync("PATCH /clients without auth → 401", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Hack" }),
    });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  await testAsync("POST /clients/:id/anonymize without auth → 401", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}/anonymize`, {
      method: "POST",
    });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T30: Cross-tenant access → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Cross-tenant GET client → 404", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}`, {
      headers: { authorization: `Bearer ${otherAccessToken}` },
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  await testAsync("Cross-tenant PATCH client → 404", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${otherAccessToken}`,
      },
      body: JSON.stringify({ name: "Hacked" }),
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  await testAsync("Cross-tenant anonymize → 404", async () => {
    const res = await fetchJson(`/api/v1/clients/${aliceId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${otherAccessToken}` },
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T31: Anonymize client → 200, { id, anonymized: true }
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Anonymize ───\n");

  let anonymizedClientId;

  await testAsync("OWNER anonymizes client → 200 { id, anonymized: true }", async () => {
    // Use Diana who has no appointments
    const res = await fetchJson(`/api/v1/clients/${dianaId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.id, dianaId, "should return same id");
    assert.equal(res.json.anonymized, true, "anonymized should be true");
    anonymizedClientId = dianaId;
  });

  // ═══════════════════════════════════════════════════════════════
  // T32: Get anonymized client → "Cliente removido", phone null
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Get anonymized client → name=Cliente removido, phone=null", async () => {
    const res = await fetchJson(`/api/v1/clients/${anonymizedClientId}`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.equal(res.json.name, "Cliente removido", "name should be anonymized");
    assert.equal(res.json.phone, null, "phone should be null");
  });

  // ═══════════════════════════════════════════════════════════════
  // T33: Anonymize already anonymized → 409
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Anonymize already anonymized client → 409 ALREADY_ANONYMIZED", async () => {
    const res = await fetchJson(`/api/v1/clients/${anonymizedClientId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 409, `Expected 409, got ${res.status}`);
    assert.equal(res.json?.error?.code, "ALREADY_ANONYMIZED", "should be ALREADY_ANONYMIZED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T34: Update anonymized client → 409
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Update anonymized client → 409 ALREADY_ANONYMIZED", async () => {
    const res = await fetchJson(`/api/v1/clients/${anonymizedClientId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Attempted Update" }),
    });
    assert.equal(res.status, 409, `Expected 409, got ${res.status}`);
    assert.equal(res.json?.error?.code, "ALREADY_ANONYMIZED", "should be ALREADY_ANONYMIZED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T35: Anonymize scrubs appointment notes (use Fernanda)
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Anonymize scrubs appointment notes", async () => {
    // Set a note on Fernanda's appointment
    execPsql(`UPDATE appointments SET note = 'Sensitive info' WHERE client_id = '${fernandaId}'`);

    const res = await fetchJson(`/api/v1/clients/${fernandaId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);

    // Verify notes are null
    const noteCheck = execPsql(`SELECT note FROM appointments WHERE client_id = '${fernandaId}'`);
    assert.equal(noteCheck, "", "appointment notes should be cleared (empty)");
  });

  // ═══════════════════════════════════════════════════════════════
  // T36: Anonymize creates audit log
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Anonymize creates audit log", async () => {
    // Anonymize Eduardo
    const res = await fetchJson(`/api/v1/clients/${eduardoId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);

    // Check audit log exists
    const auditCheck = execPsql(`SELECT COUNT(*)::int FROM audit_logs WHERE action = 'CLIENT_ANONYMIZED' AND target_id = '${eduardoId}'`);
    assert.ok(parseInt(auditCheck) >= 1, "audit log should exist for anonymization");
  });

  // ═══════════════════════════════════════════════════════════════
  // T37: Anonymize non-existent client → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Anonymize non-existent client → 404", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000099";
    const res = await fetchJson(`/api/v1/clients/${fakeId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T38: Phone collision with anonymized client (no collision since phone_normalized = null)
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Can reuse phone of anonymized client → no collision", async () => {
    // Diana was anonymized (phone_normalized = null), so her old phone should be free
    const res = await fetchJson(`/api/v1/clients/${aliceId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ phone: "(11) 97777-7777" }),
    });
    // Should be ok (no conflict since Diana had phone cleared)
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T39: Anonymize scrubs notes for ALL client appointments
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Anonymize clears ALL appointment notes for client", async () => {
    // Alice has 2 appointments with notes. Anonymize her.
    const res = await fetchJson(`/api/v1/clients/${aliceId}/anonymize`, {
      method: "POST",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);

    const notesCount = execPsql(`SELECT COUNT(*)::int FROM appointments WHERE client_id = '${aliceId}' AND note IS NOT NULL`);
    assert.equal(notesCount, "0", "all notes should be cleared");
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
