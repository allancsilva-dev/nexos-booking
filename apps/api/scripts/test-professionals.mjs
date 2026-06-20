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
          const cookies = (res.headers["set-cookie"] || []);
          resolve({ status: res.statusCode, headers: res.headers, body, json, cookies });
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

function disableMembership(userId, orgId) {
  execPsql(`UPDATE organization_users SET status = 'DISABLED' WHERE user_id = '${userId}' AND organization_id = '${orgId}';`);
}

function enableMembership(userId, orgId) {
  execPsql(`UPDATE organization_users SET status = 'ACTIVE' WHERE user_id = '${userId}' AND organization_id = '${orgId}';`);
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
console.log("\nPR-2.1 Professionals Test Harness\n");
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

  const ownerEmail = `test-prof-owner-${ts}@example.com`;
  const ownerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Owner User", email: ownerEmail, password: testPassword, organizationName: "Prof Test Org" }),
  });
  const ownerOrgId = ownerReg.json.organization.id;
  let ownerAccessToken = ownerReg.json.accessToken;

  // Manager in owner's org
  const managerEmail = `test-prof-manager-${ts}@example.com`;
  const managerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Manager User", email: managerEmail, password: testPassword, organizationName: "Manager Org" }),
  });
  const managerUserId = managerReg.json.user.id;
  let managerAccessToken = managerReg.json.accessToken;

  // Professional in owner's org
  const profUserEmail = `test-prof-prof-${ts}@example.com`;
  const profReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prof User", email: profUserEmail, password: testPassword, organizationName: "Prof Org" }),
  });
  const profUserId = profReg.json.user.id;
  let profAccessToken = profReg.json.accessToken;

  // Another user (for userId assignment)
  const user2Email = `test-prof-user2-${ts}@example.com`;
  const user2Reg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "User Two", email: user2Email, password: testPassword, organizationName: "User2 Org" }),
  });
  const user2Id = user2Reg.json.user.id;

  // Another org owner (org B, for cross-tenant)
  const orgBOwnerEmail = `test-prof-orgb-${ts}@example.com`;
  const orgBOwnerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "OrgB Owner", email: orgBOwnerEmail, password: testPassword, organizationName: "OrgB" }),
  });
  const orgBOwnerToken = orgBOwnerReg.json.accessToken;

  // Add manager, prof, user2 to owner's org via DB (only owner is auto-added on register)
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${managerUserId}', 'MANAGER', 'ACTIVE');`);
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${profUserId}', 'PROFESSIONAL', 'ACTIVE');`);
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${user2Id}', 'PROFESSIONAL', 'ACTIVE');`);

  // Re-login everyone to get tokens with org context
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

  // ═══════════════════════════════════════════════════════════════
  // T1: OWNER creates professional → 201, slug generated from name
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Create ───\n");

  let prof1Id = null;

  await testAsync("OWNER creates professional → 201, slug auto-generated", async () => {
    const { status, json } = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "John Doe" }),
    });
    assert.equal(status, 201, `Expected 201, got ${status}`);
    assert.ok(json.id, "should have id");
    assert.equal(json.name, "John Doe", "name should match");
    assert.ok(json.slug, "slug should be generated");
    assert.ok(json.slug.includes("john-doe"), `slug should contain sanitized name, got ${json.slug}`);
    assert.equal(json.active, true, "active should default to true");
    prof1Id = json.id;
  });

  // ═══════════════════════════════════════════════════════════════
  // T2: MANAGER creates professional → 201
  // ═══════════════════════════════════════════════════════════════

  await testAsync("MANAGER creates professional → 201", async () => {
    const { status, json } = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerAccessToken}`,
      },
      body: JSON.stringify({ name: "Jane Smith" }),
    });
    assert.equal(status, 201, `Expected 201, got ${status}`);
    assert.equal(json.name, "Jane Smith", "name should match");
    assert.ok(json.slug, "slug should be generated");
  });

  // ═══════════════════════════════════════════════════════════════
  // T3: PROFESSIONAL tries to create → 403 AUTHZ_DENIED
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL tries to create → 403 AUTHZ_DENIED", async () => {
    const { status, json } = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profAccessToken}`,
      },
      body: JSON.stringify({ name: "No Perm" }),
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
    assert.equal(json?.error?.code, "AUTHZ_DENIED", "should be AUTHZ_DENIED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T4: Cross-tenant PATCH → 404
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Tenant Opacity ───\n");

  await testAsync("Cross-tenant PATCH → 404", async () => {
    // Owner of org A (ownerOrgId) tries to PATCH a professional that exists in org A
    // but using org B's context. The professional doesn't exist in org B context → 404
    const { status } = await fetchJson(`/api/v1/professionals/${prof1Id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${orgBOwnerToken}`,
      },
      body: JSON.stringify({ name: "Hacked" }),
    });
    assert.equal(status, 404, `Expected 404, got ${status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T5: Slug auto-generated with collision → retries to unique slug
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Slug Retry ───\n");

  await testAsync("Slug collision → auto-retry to unique slug", async () => {
    // Create first professional with name "John Doe" (slug: john-doe)
    const r1 = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "John Doe" }),
    });
    assert.equal(r1.status, 201, `first create: Expected 201, got ${r1.status}`);

    // Create second with same name → should get john-doe-2
    const r2 = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "John Doe" }),
    });
    assert.equal(r2.status, 201, `second create: Expected 201, got ${r2.status}`);
    assert.notEqual(r2.json.slug, r1.json.slug, "slugs should differ");
    assert.ok(r2.json.slug.includes("-2"), `slug should be retried with suffix, got ${r2.json.slug}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // T6: PATCH with explicit taken slug → 409 SLUG_TAKEN
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Slug Conflict ───\n");

  let profForSlugTest = null;

  await testAsync("PATCH with explicit taken slug → 409 SLUG_TAKEN", async () => {
    const r1 = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Unique One", slug: "unique-one-prof" }),
    });

    const r2 = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Unique Two", slug: "unique-two-prof" }),
    });

    // Try to change r2's slug to r1's slug
    const { status, json } = await fetchJson(`/api/v1/professionals/${r2.json.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ slug: "unique-one-prof" }),
    });
    assert.equal(status, 409, `Expected 409, got ${status}`);
    assert.equal(json?.error?.code, "SLUG_TAKEN", "should be SLUG_TAKEN");
    profForSlugTest = r1.json;
  });

  // ═══════════════════════════════════════════════════════════════
  // T7: PATCH active: false → still in GET list with active=false
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Active Toggle ───\n");

  await testAsync("PATCH active:false → still in GET list", async () => {
    const { status: patchStatus } = await fetchJson(`/api/v1/professionals/${profForSlugTest.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ active: false }),
    });
    assert.equal(patchStatus, 200, `PATCH: Expected 200, got ${patchStatus}`);

    const { status: getStatus, json: list } = await fetchJson("/api/v1/professionals", {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(getStatus, 200, `GET: Expected 200, got ${getStatus}`);
    const found = list.find((p) => p.id === profForSlugTest.id);
    assert.ok(found, "deactivated professional should still appear in GET list");
    assert.equal(found.active, false, "active should be false");
  });

  // ═══════════════════════════════════════════════════════════════
  // T8: userId with valid ACTIVE membership → 201
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── userId Membership Validation ───\n");

  await testAsync("create with valid userId → 201", async () => {
    const { status, json } = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Linked Professional", userId: user2Id }),
    });
    assert.equal(status, 201, `Expected 201, got ${status}`);
    assert.equal(json.userId, user2Id, "userId should match");
  });

  // ═══════════════════════════════════════════════════════════════
  // T9: Invalid userId → 422 VALIDATION_ERROR
  // ═══════════════════════════════════════════════════════════════

  await testAsync("create with non-member userId → 422", async () => {
    // Register a user that is NOT a member of ownerOrgId
    const outsiderEmail = `test-prof-outsider-${ts}@example.com`;
    const outsiderReg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Outsider", email: outsiderEmail, password: testPassword, organizationName: "Outsider Org" }),
    });
    const outsiderId = outsiderReg.json.user.id;

    const { status, json } = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Bad Link", userId: outsiderId }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
    assert.equal(json?.error?.details?.userId, "no_active_membership", "details.userId should be no_active_membership");
  });

  await testAsync("create with DISABLED member userId → 422", async () => {
    // Disable user2's membership
    disableMembership(user2Id, ownerOrgId);

    const { status, json } = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Disabled Link", userId: user2Id }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
    assert.equal(json?.error?.details?.userId, "no_active_membership", "details.userId should be no_active_membership");

    // Re-enable for T10
    enableMembership(user2Id, ownerOrgId);
  });

  // ═══════════════════════════════════════════════════════════════
  // T10: Duplicate userId in same org → 409 PROFESSIONAL_USER_TAKEN
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Duplicate userId ───\n");

  await testAsync("duplicate userId in same org → 409 PROFESSIONAL_USER_TAKEN", async () => {
    // Create first professional linked to user2
    const r1 = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Link First", userId: user2Id }),
    });
    assert.equal(r1.status, 201, `first create: Expected 201, got ${r1.status}`);

    // Create second trying to link same userId
    const { status, json } = await fetchJson("/api/v1/professionals", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Link Second", userId: user2Id }),
    });
    assert.equal(status, 409, `Expected 409, got ${status}`);
    assert.equal(json?.error?.code, "PROFESSIONAL_USER_TAKEN", "should be PROFESSIONAL_USER_TAKEN");
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
