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
console.log("\nPR-2.3 Working Hours Test Harness\n");
console.log("================================\n");

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

  const ownerEmail = `test-wh-owner-${ts}@example.com`;
  const ownerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Owner User", email: ownerEmail, password: testPassword, organizationName: "WH Test Org" }),
  });
  const ownerOrgId = ownerReg.json.organization.id;
  let ownerAccessToken = ownerReg.json.accessToken;

  const managerEmail = `test-wh-manager-${ts}@example.com`;
  const managerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Manager User", email: managerEmail, password: testPassword, organizationName: "Mgr Org" }),
  });
  const managerUserId = managerReg.json.user.id;
  let managerAccessToken = managerReg.json.accessToken;

  const profUserEmail = `test-wh-prof-${ts}@example.com`;
  const profReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prof User", email: profUserEmail, password: testPassword, organizationName: "Prof Org" }),
  });
  const profUserId = profReg.json.user.id;
  let profAccessToken = profReg.json.accessToken;

  const orgBOwnerEmail = `test-wh-orgb-${ts}@example.com`;
  const orgBOwnerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "OrgB Owner", email: orgBOwnerEmail, password: testPassword, organizationName: "WH OrgB" }),
  });
  const orgBOwnerToken = orgBOwnerReg.json.accessToken;

  // Add manager and prof to owner's org
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${managerUserId}', 'MANAGER', 'ACTIVE');`);
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${profUserId}', 'PROFESSIONAL', 'ACTIVE');`);

  // Re-login
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

  // Create a professional in owner's org
  const createProfRes = await fetchJson("/api/v1/professionals", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ name: "Dr. Test", slug: "dr-test-wh" }),
  });
  const profId = createProfRes.json.id;

  // ═══════════════════════════════════════════════════════════════
  // T1: OWNER PUT shifts → 200, GET confirms
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Basic CRUD ───\n");

  const validShifts = [
    { weekday: 1, startTime: "09:00", endTime: "17:00" },
  ];

  await testAsync("OWNER PUT shifts → 200, GET confirms", async () => {
    const putRes = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({ shifts: validShifts }),
      },
    );
    assert.equal(putRes.status, 200, `Expected 200, got ${putRes.status}`);
    assert.ok(Array.isArray(putRes.json), "response should be array");
    assert.equal(putRes.json.length, 1, "should return 1 shift");
    assert.equal(putRes.json[0].weekday, 1);
    assert.equal(putRes.json[0].startTime, "09:00:00");
    assert.equal(putRes.json[0].endTime, "17:00:00");

    const getRes = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        headers: { authorization: `Bearer ${ownerAccessToken}` },
      },
    );
    assert.equal(getRes.status, 200, `GET: Expected 200, got ${getRes.status}`);
    assert.equal(getRes.json.length, 1);
  });

  // ═══════════════════════════════════════════════════════════════
  // T2: MANAGER PUT shifts → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("MANAGER PUT shifts → 200", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${managerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [{ weekday: 2, startTime: "08:00", endTime: "12:00" }],
        }),
      },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T3: PROFESSIONAL tries PUT → 403 AUTHZ_DENIED
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL tries PUT → 403 AUTHZ_DENIED", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${profAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
        }),
      },
    );
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
    assert.equal(res.json?.error?.code, "AUTHZ_DENIED", "should be AUTHZ_DENIED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T4: GET returns shifts for valid professional
  // ═══════════════════════════════════════════════════════════════

  await testAsync("GET returns shifts for valid professional", async () => {
    // PUT shifts first
    await fetchJson(`/api/v1/professionals/${profId}/working-hours`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({
        shifts: [
          { weekday: 0, startTime: "08:00", endTime: "12:00" },
          { weekday: 5, startTime: "09:00", endTime: "18:00" },
        ],
      }),
    });

    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        headers: { authorization: `Bearer ${ownerAccessToken}` },
      },
    );
    assert.equal(res.status, 200);
    assert.equal(res.json.length, 2);
  });

  // ═══════════════════════════════════════════════════════════════
  // T5: 2 non-overlapping shifts same weekday → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── No-Overlap Validations ───\n");

  await testAsync("2 non-overlapping shifts same weekday → 200", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [
            { weekday: 3, startTime: "08:00", endTime: "12:00" },
            { weekday: 3, startTime: "13:00", endTime: "18:00" },
          ],
        }),
      },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T6: Adjacent shifts (09:00-10:00 and 10:00-11:00) → 200
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Adjacent shifts → 200", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [
            { weekday: 4, startTime: "09:00", endTime: "10:00" },
            { weekday: 4, startTime: "10:00", endTime: "11:00" },
          ],
        }),
      },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T7: Partial overlap → 409 WORKING_HOURS_CONFLICT
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Overlap Detection ───\n");

  await testAsync("Partial overlap → 409 WORKING_HOURS_CONFLICT", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [
            { weekday: 1, startTime: "09:00", endTime: "14:00" },
            { weekday: 1, startTime: "12:00", endTime: "18:00" },
          ],
        }),
      },
    );
    assert.equal(res.status, 409, `Expected 409, got ${res.status}`);
    assert.equal(res.json?.error?.code, "WORKING_HOURS_CONFLICT", "should be WORKING_HOURS_CONFLICT");
  });

  // ═══════════════════════════════════════════════════════════════
  // T8: Contained overlap → 409
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Contained overlap → 409", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [
            { weekday: 2, startTime: "08:00", endTime: "18:00" },
            { weekday: 2, startTime: "10:00", endTime: "12:00" },
          ],
        }),
      },
    );
    assert.equal(res.status, 409, `Expected 409, got ${res.status}`);
    assert.equal(res.json?.error?.code, "WORKING_HOURS_CONFLICT");
  });

  // ═══════════════════════════════════════════════════════════════
  // T9: Exact overlap → 409
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Exact overlap → 409", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [
            { weekday: 3, startTime: "09:00", endTime: "17:00" },
            { weekday: 3, startTime: "09:00", endTime: "17:00" },
          ],
        }),
      },
    );
    assert.equal(res.status, 409, `Expected 409, got ${res.status}`);
    assert.equal(res.json?.error?.code, "WORKING_HOURS_CONFLICT");
  });

  // ═══════════════════════════════════════════════════════════════
  // T10: weekday = -1 → 422
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Input Validation ───\n");

  await testAsync("weekday = -1 → 422", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [{ weekday: -1, startTime: "09:00", endTime: "17:00" }],
        }),
      },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T11: weekday = 7 → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("weekday = 7 → 422", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [{ weekday: 7, startTime: "09:00", endTime: "17:00" }],
        }),
      },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T12: startTime >= endTime → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("startTime >= endTime → 422", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          shifts: [{ weekday: 1, startTime: "17:00", endTime: "09:00" }],
        }),
      },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T13: Cross-tenant professionalId → 404
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Tenant Opacity ───\n");

  await testAsync("Cross-tenant professionalId → 404", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${orgBOwnerToken}`,
        },
        body: JSON.stringify({
          shifts: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
        }),
      },
    );
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T14: PUT fails → old shifts preserved (atomicity)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Atomicity ───\n");

  await testAsync("PUT fails → old shifts preserved", async () => {
    // Set valid shifts first
    const original = [
      { weekday: 6, startTime: "08:00", endTime: "12:00" },
    ];
    await fetchJson(`/api/v1/professionals/${profId}/working-hours`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ shifts: original }),
    });

    // Try to PUT overlapping shifts (should fail with 409)
    await fetchJson(`/api/v1/professionals/${profId}/working-hours`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({
        shifts: [
          { weekday: 6, startTime: "08:00", endTime: "14:00" },
          { weekday: 6, startTime: "10:00", endTime: "18:00" },
        ],
      }),
    });

    // GET should still return the original shifts
    const getRes = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        headers: { authorization: `Bearer ${ownerAccessToken}` },
      },
    );
    assert.equal(getRes.status, 200);
    assert.equal(getRes.json.length, 1, "old shifts should be preserved");
    assert.equal(getRes.json[0].weekday, 6);
    assert.equal(getRes.json[0].startTime, "08:00:00");
    assert.equal(getRes.json[0].endTime, "12:00:00");
  });

  // ═══════════════════════════════════════════════════════════════
  // T15: PUT replaces old shifts → GET confirms new, old gone
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PUT replaces old shifts → GET confirms new, old gone", async () => {
    const newShifts = [
      { weekday: 0, startTime: "10:00", endTime: "16:00" },
      { weekday: 2, startTime: "09:00", endTime: "13:00" },
      { weekday: 4, startTime: "14:00", endTime: "20:00" },
    ];

    const putRes = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({ shifts: newShifts }),
      },
    );
    assert.equal(putRes.status, 200);

    const getRes = await fetchJson(
      `/api/v1/professionals/${profId}/working-hours`,
      {
        headers: { authorization: `Bearer ${ownerAccessToken}` },
      },
    );
    assert.equal(getRes.status, 200);
    assert.equal(getRes.json.length, 3, "should have 3 new shifts");

    // Verify specific shift for weekday 0 is there, and old weekday 6 is gone
    const weekdays = getRes.json.map((s) => s.weekday);
    assert.ok(weekdays.includes(0), "weekday 0 should be present");
    assert.ok(weekdays.includes(2), "weekday 2 should be present");
    assert.ok(weekdays.includes(4), "weekday 4 should be present");
    assert.ok(!weekdays.includes(6), "old weekday 6 should be gone");
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
