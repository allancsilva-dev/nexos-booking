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

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
console.log("\nPR-2.2 Services Test Harness\n");
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

  const ownerEmail = `test-svc-owner-${ts}@example.com`;
  const ownerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Owner User", email: ownerEmail, password: testPassword, organizationName: "Svc Test Org" }),
  });
  const ownerOrgId = ownerReg.json.organization.id;
  let ownerAccessToken = ownerReg.json.accessToken;

  // Manager in owner's org
  const managerEmail = `test-svc-manager-${ts}@example.com`;
  const managerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Manager User", email: managerEmail, password: testPassword, organizationName: "Manager Org" }),
  });
  const managerUserId = managerReg.json.user.id;
  let managerAccessToken = managerReg.json.accessToken;

  // Professional in owner's org
  const profUserEmail = `test-svc-prof-${ts}@example.com`;
  const profReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Prof User", email: profUserEmail, password: testPassword, organizationName: "Prof Org" }),
  });
  const profUserId = profReg.json.user.id;
  let profAccessToken = profReg.json.accessToken;

  // Another org owner (org B, for cross-tenant)
  const orgBOwnerEmail = `test-svc-orgb-${ts}@example.com`;
  const orgBOwnerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "OrgB Owner", email: orgBOwnerEmail, password: testPassword, organizationName: "OrgB" }),
  });
  const orgBOwnerToken = orgBOwnerReg.json.accessToken;

  // Add manager, prof to owner's org via DB
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${managerUserId}', 'MANAGER', 'ACTIVE');`);
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${profUserId}', 'PROFESSIONAL', 'ACTIVE');`);

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
  // T1: OWNER creates service → 201, active:true, currency:BRL
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Create ───\n");

  let svc1Id = null;

  await testAsync("OWNER creates service → 201, active:true, currency:BRL", async () => {
    const { status, json } = await fetchJson("/api/v1/services", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Haircut", durationMin: 30, priceCents: 5000 }),
    });
    assert.equal(status, 201, `Expected 201, got ${status}`);
    assert.ok(json.id, "should have id");
    assert.equal(json.name, "Haircut", "name should match");
    assert.equal(json.durationMin, 30, "durationMin should match");
    assert.equal(json.priceCents, 5000, "priceCents should match");
    assert.equal(json.currency, "BRL", "currency should be BRL");
    assert.equal(json.active, true, "active should default to true");
    svc1Id = json.id;
  });

  // ═══════════════════════════════════════════════════════════════
  // T2: MANAGER creates service → 201
  // ═══════════════════════════════════════════════════════════════

  await testAsync("MANAGER creates service → 201", async () => {
    const { status, json } = await fetchJson("/api/v1/services", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerAccessToken}`,
      },
      body: JSON.stringify({ name: "Beard Trim", durationMin: 15, priceCents: 2500 }),
    });
    assert.equal(status, 201, `Expected 201, got ${status}`);
    assert.equal(json.name, "Beard Trim", "name should match");
    assert.equal(json.currency, "BRL", "currency should be BRL");
  });

  // ═══════════════════════════════════════════════════════════════
  // T3: PROFESSIONAL tries to create → 403 AUTHZ_DENIED
  // ═══════════════════════════════════════════════════════════════

  await testAsync("PROFESSIONAL tries to create → 403 AUTHZ_DENIED", async () => {
    const { status, json } = await fetchJson("/api/v1/services", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profAccessToken}`,
      },
      body: JSON.stringify({ name: "No Perm", durationMin: 30, priceCents: 1000 }),
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
    assert.equal(json?.error?.code, "AUTHZ_DENIED", "should be AUTHZ_DENIED");
  });

  // ═══════════════════════════════════════════════════════════════
  // T4: GET /services returns only services from current org
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── List ───\n");

  await testAsync("GET /services returns only services from current org", async () => {
    // Owner creates a service in his org
    const { status: getStatus, json: list } = await fetchJson("/api/v1/services", {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(getStatus, 200, `Expected 200, got ${getStatus}`);
    assert.ok(Array.isArray(list), "should be an array");
    assert.ok(list.length >= 2, "should have at least 2 services");

    // Org B owner sees empty list (different org)
    const { status: getBStatus, json: listB } = await fetchJson("/api/v1/services", {
      headers: { authorization: `Bearer ${orgBOwnerToken}` },
    });
    assert.equal(getBStatus, 200, `Expected 200, got ${getBStatus}`);
    assert.equal(listB.length, 0, "org B should see empty list");
  });

  // ═══════════════════════════════════════════════════════════════
  // T5: PATCH service from other org → 404 NOT_FOUND
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Tenant Opacity ───\n");

  await testAsync("PATCH service from other org → 404 NOT_FOUND", async () => {
    const { status } = await fetchJson(`/api/v1/services/${svc1Id}`, {
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
  // T6: durationMin = 0 → 422, details field=durationMin issue=must_be_positive
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Validation ───\n");

  await testAsync("durationMin = 0 → 422 VALIDATION_ERROR", async () => {
    const { status, json } = await fetchJson("/api/v1/services", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Bad Duration", durationMin: 0, priceCents: 1000 }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
    assert.equal(json?.error?.details?.field, "durationMin", "field should be durationMin");
    assert.equal(json?.error?.details?.issue, "must_be_positive", "issue should be must_be_positive");
  });

  // ═══════════════════════════════════════════════════════════════
  // T7: priceCents = -1 → 422, details field=priceCents issue=must_be_non_negative
  // ═══════════════════════════════════════════════════════════════

  await testAsync("priceCents = -1 → 422 VALIDATION_ERROR", async () => {
    const { status, json } = await fetchJson("/api/v1/services", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Bad Price", durationMin: 30, priceCents: -1 }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
    assert.equal(json?.error?.details?.field, "priceCents", "field should be priceCents");
    assert.equal(json?.error?.details?.issue, "must_be_non_negative", "issue should be must_be_non_negative");
  });

  // ═══════════════════════════════════════════════════════════════
  // T8: PATCH active:false → service still in list with active=false
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Active Toggle ───\n");

  await testAsync("PATCH active:false → service still in list with active=false", async () => {
    const { status: patchStatus } = await fetchJson(`/api/v1/services/${svc1Id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ active: false }),
    });
    assert.equal(patchStatus, 200, `PATCH: Expected 200, got ${patchStatus}`);

    const { status: getStatus, json: list } = await fetchJson("/api/v1/services", {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(getStatus, 200, `GET: Expected 200, got ${getStatus}`);
    const found = list.find((s) => s.id === svc1Id);
    assert.ok(found, "deactivated service should still appear in GET list");
    assert.equal(found.active, false, "active should be false");
  });

  // ═══════════════════════════════════════════════════════════════
  // T9: Error response has error.code + error.requestId
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Error Envelope ───\n");

  await testAsync("Error response has error.code + error.requestId", async () => {
    const { status, json } = await fetchJson("/api/v1/services", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Bad", durationMin: 0, priceCents: 1000 }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.ok(json?.error?.code, "error.code should exist");
    assert.ok(json?.error?.requestId, "error.requestId should exist");
  });

  // ═══════════════════════════════════════════════════════════════
  // T10: Audit metadata: only serviceId + changedFields (no values)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Audit Metadata ───\n");

  await testAsync("Audit metadata: only serviceId + changedFields (no values, no names)", async () => {
    // Create a service, then update it
    const createRes = await fetchJson("/api/v1/services", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Audit Test", durationMin: 60, priceCents: 10000 }),
    });
    const auditSvcId = createRes.json.id;

    // Update name and durationMin
    await fetchJson(`/api/v1/services/${auditSvcId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Audit Updated", durationMin: 45 }),
    });

    // Check audit logs in DB
    const createdLog = execPsql(`SELECT metadata FROM audit_logs WHERE action = 'SERVICE_CREATED' AND target_id = '${auditSvcId}' ORDER BY created_at ASC LIMIT 1;`);
    const createdMeta = JSON.parse(createdLog.replace(/\s+/g, " ").trim());
    assert.ok(createdMeta.serviceId, "SERVICE_CREATED: metadata should have serviceId");
    assert.equal(Object.keys(createdMeta).length, 1, "SERVICE_CREATED: metadata should have exactly 1 key (serviceId)");

    const updatedLog = execPsql(`SELECT metadata FROM audit_logs WHERE action = 'SERVICE_UPDATED' AND target_id = '${auditSvcId}' ORDER BY created_at DESC LIMIT 1;`);
    const updatedMeta = JSON.parse(updatedLog.replace(/\s+/g, " ").trim());
    assert.ok(updatedMeta.serviceId, "SERVICE_UPDATED: metadata should have serviceId");
    assert.ok(Array.isArray(updatedMeta.changedFields), "SERVICE_UPDATED: metadata should have changedFields array");
    assert.equal(Object.keys(updatedMeta).length, 2, "SERVICE_UPDATED: metadata should have exactly 2 keys (serviceId, changedFields)");

    // Verify changedFields contains only field names, no values
    for (const f of updatedMeta.changedFields) {
      assert.equal(typeof f, "string", `changedField should be a string, got ${typeof f}: ${f}`);
    }
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
