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
console.log("\nPR-2.4 Availability Blocks Test Harness\n");
console.log("=======================================\n");

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

  const ownerEmail = `test-blk-owner-${ts}@example.com`;
  const ownerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Owner User", email: ownerEmail, password: testPassword, organizationName: "Block Test Org" }),
  });
  const ownerOrgId = ownerReg.json.organization.id;
  let ownerAccessToken = ownerReg.json.accessToken;

  const managerEmail = `test-blk-manager-${ts}@example.com`;
  const managerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Manager User", email: managerEmail, password: testPassword, organizationName: "Mgr Org" }),
  });
  const managerUserId = managerReg.json.user.id;
  let managerAccessToken = managerReg.json.accessToken;

  const profUserEmail = `test-blk-prof-${ts}@example.com`;
  const profReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prof User", email: profUserEmail, password: testPassword, organizationName: "Prof Org" }),
  });
  const profUserId = profReg.json.user.id;
  let profAccessToken = profReg.json.accessToken;

  const orgBOwnerEmail = `test-blk-orgb-${ts}@example.com`;
  const orgBOwnerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "OrgB Owner", email: orgBOwnerEmail, password: testPassword, organizationName: "Block OrgB" }),
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
    body: JSON.stringify({ name: "Dr. Block", slug: "dr-block" }),
  });
  const profId = createProfRes.json.id;

  // ═══════════════════════════════════════════════════════════════
  // T1: OWNER creates block → 201
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Create ───\n");

  const startsAt = new Date(Date.UTC(2026, 5, 20, 9, 0, 0)).toISOString();
  const endsAt = new Date(Date.UTC(2026, 5, 20, 10, 0, 0)).toISOString();

  await testAsync("OWNER creates block → 201", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({ startsAt, endsAt, reason: "Lunch break" }),
      },
    );
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    assert.ok(res.json.id, "should have id");
    assert.equal(res.json.professionalId, profId);
    assert.equal(res.json.reason, "Lunch break");
  });

  // ═══════════════════════════════════════════════════════════════
  // T2: MANAGER creates block → 201
  // ═══════════════════════════════════════════════════════════════

  await testAsync("MANAGER creates block → 201", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${managerAccessToken}`,
        },
        body: JSON.stringify({
          startsAt: new Date(Date.UTC(2026, 5, 20, 14, 0, 0)).toISOString(),
          endsAt: new Date(Date.UTC(2026, 5, 20, 15, 0, 0)).toISOString(),
          reason: "Meeting",
        }),
      },
    );
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    assert.equal(res.json.professionalId, profId);
  });

  // ═══════════════════════════════════════════════════════════════
  // T3: PROFESSIONAL tries POST → 403
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL tries POST → 403", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${profAccessToken}`,
        },
        body: JSON.stringify({ startsAt, endsAt }),
      },
    );
    assert.equal(res.status, 403, `Expected 403, got ${res.status}`);
    assert.equal(res.json?.error?.code, "AUTHZ_DENIED", "should be AUTHZ_DENIED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T4: GET with from/to returns blocks intersecting window
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Query ───\n");

  await testAsync("GET with from/to returns blocks intersecting window", async () => {
    // Blocks: 09:00-10:00 and 14:00-15:00. Window 08:00-16:00 should capture both.
    const from = new Date(Date.UTC(2026, 5, 20, 8, 0, 0)).toISOString();
    const to = new Date(Date.UTC(2026, 5, 20, 16, 0, 0)).toISOString();
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        headers: { authorization: `Bearer ${ownerAccessToken}` },
      },
    );
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(Array.isArray(res.json), "response should be array");
    assert.ok(res.json.length >= 2, `should have at least 2 blocks, got ${res.json.length}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T5: GET without from/to → 422
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Validation ───\n");

  await testAsync("GET without from/to → 422", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        headers: { authorization: `Bearer ${ownerAccessToken}` },
      },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T6: from >= to → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("from >= to → 422", async () => {
    const from = new Date(Date.UTC(2026, 5, 20, 16, 0, 0)).toISOString();
    const to = new Date(Date.UTC(2026, 5, 20, 8, 0, 0)).toISOString();
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      {
        headers: { authorization: `Bearer ${ownerAccessToken}` },
      },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T7: startsAt >= endsAt → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("startsAt >= endsAt → 422", async () => {
    const badEndsAt = new Date(Date.UTC(2026, 5, 20, 8, 0, 0)).toISOString();
    const badStartsAt = new Date(Date.UTC(2026, 5, 20, 10, 0, 0)).toISOString();
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({ startsAt: badStartsAt, endsAt: badEndsAt }),
      },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    assert.equal(res.json?.error?.code, "VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════
  // T8: reason > 500 chars → 422
  // ═══════════════════════════════════════════════════════════════

  await testAsync("reason > 500 chars → 422", async () => {
    const longReason = "x".repeat(501);
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({ startsAt, endsAt, reason: longReason }),
      },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    assert.equal(res.json?.error?.code, "VALIDATION_ERROR");
  });

  // ═══════════════════════════════════════════════════════════════
  // T9: DELETE removes block → 200
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Delete ───\n");

  await testAsync("DELETE removes block → 200", async () => {
    // Create a new block to delete
    const createRes = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          startsAt: new Date(Date.UTC(2026, 5, 21, 9, 0, 0)).toISOString(),
          endsAt: new Date(Date.UTC(2026, 5, 21, 10, 0, 0)).toISOString(),
        }),
      },
    );
    const newBlockId = createRes.json.id;

    const delRes = await fetchJson(
      `/api/v1/professionals/${profId}/blocks/${newBlockId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${ownerAccessToken}` },
      },
    );
    assert.ok(delRes.status === 200 || delRes.status === 204, `Expected 200 or 204, got ${delRes.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T10: DELETE cross-tenant → 404
  // ═══════════════════════════════════════════════════════════════

  await testAsync("DELETE cross-tenant → 404", async () => {
    // Create a block in owner's org, try to delete with orgB token
    const createRes = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({
          startsAt: new Date(Date.UTC(2026, 5, 21, 11, 0, 0)).toISOString(),
          endsAt: new Date(Date.UTC(2026, 5, 21, 12, 0, 0)).toISOString(),
        }),
      },
    );
    const crossBlockId = createRes.json.id;

    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks/${crossBlockId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${orgBOwnerToken}` },
      },
    );
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T11: POST cross-tenant professionalId → 404
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Tenant Opacity ───\n");

  await testAsync("POST cross-tenant professionalId → 404", async () => {
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${orgBOwnerToken}`,
        },
        body: JSON.stringify({ startsAt, endsAt }),
      },
    );
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T12: Envelope/error.code correct
  // ═══════════════════════════════════════════════════════════════

  await testAsync("Envelope/error.code correct", async () => {
    // Trigger a 422 to check envelope shape
    const res = await fetchJson(
      `/api/v1/professionals/${profId}/blocks`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ownerAccessToken}`,
        },
        body: JSON.stringify({ startsAt: "invalid-date", endsAt }),
      },
    );
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    assert.ok(res.json?.error, "should have error envelope");
    assert.ok(res.json.error.code, "should have error.code");
    assert.ok(typeof res.json.error.code === "string", "error.code should be a string");
  });

  // ═══════════════════════════════════════════════════════════════
  // T13: No audit_logs entry for blocks
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Audit ───\n");

  await testAsync("No audit_logs entry for blocks", async () => {
    const count = execPsql(
      `SELECT COUNT(*)::int FROM audit_logs WHERE action LIKE '%BLOCK%' AND organization_id = '${ownerOrgId}'`,
    );
    assert.equal(count, "0", `Expected 0 audit logs for blocks, got ${count}`);
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
