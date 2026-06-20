import { spawn, execSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
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

function extractCookie(cookies, name) {
  for (const c of cookies) {
    const match = c.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function getRefreshCookie(cookies) {
  const token = extractCookie(cookies, "refresh_token");
  if (!token) return null;
  const pathFlag = cookies.find((c) => c.startsWith("refresh_token="));
  const path = pathFlag ? pathFlag.match(/Path=([^;]+)/)?.[1] : null;
  const httpOnly = cookies.some((c) => c.startsWith("refresh_token=") && c.toLowerCase().includes("httponly"));
  const secure = cookies.some((c) => c.startsWith("refresh_token=") && c.toLowerCase().includes("secure"));
  const sameSite = pathFlag ? pathFlag.match(/SameSite=([^;]+)/i)?.[1] : null;
  return { token, path, httpOnly, secure, sameSite };
}

function execPsql(sql) {
  const { user, pass, db } = resolveDbEnv();
  return execSync(
    `docker compose exec -T -e PGPASSWORD="${pass}" postgres psql -t -U "${user}" -d "${db}" -c "${sql.replace(/"/g, '\\"')}"`,
    { cwd: repoRoot(), encoding: "utf8" },
  ).trim();
}

function execPsqlSafe(sql) {
  const { user, pass, db } = resolveDbEnv();
  try {
    return execSync(
      `docker compose exec -T -e PGPASSWORD="${pass}" postgres psql -t -U "${user}" -d "${db}" -c "${sql.replace(/"/g, '\\"')}"`,
      { cwd: repoRoot(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    return "";
  }
}

function hashToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function setEmailVerified(userId) {
  execPsql(`UPDATE users SET email_verified_at = NOW() WHERE id = '${userId}';`);
}

function dbCreateInvitation(orgId, email, role, invitedBy, expiresAt) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  execPsql(
    `INSERT INTO invitations (organization_id, email, role, token_hash, invited_by, expires_at) VALUES ('${orgId}', '${email}', '${role}', '${tokenHash}', '${invitedBy}', '${expiresAt}') RETURNING token_hash;`,
  );
  return { rawToken, tokenHash };
}

function getInvitationFromDb(tokenHash) {
  return execPsqlSafe(`SELECT id, accepted_at, expires_at, email, role, organization_id FROM invitations WHERE token_hash = '${tokenHash}' LIMIT 1;`);
}

function countAuditLogs(action, orgId) {
  const result = execPsqlSafe(`SELECT COUNT(*) FROM audit_logs WHERE action = '${action}' AND organization_id = '${orgId}';`);
  return parseInt(result || "0", 10);
}

function findAuditLog(action, orgId) {
  return execPsqlSafe(`SELECT metadata FROM audit_logs WHERE action = '${action}' AND organization_id = '${orgId}' ORDER BY created_at DESC LIMIT 1;`);
}

function countMemberships(orgId, userId) {
  const result = execPsqlSafe(`SELECT COUNT(*) FROM organization_users WHERE organization_id = '${orgId}' AND user_id = '${userId}';`);
  return parseInt(result || "0", 10);
}

function getMembershipStatus(orgId, userId) {
  return execPsqlSafe(`SELECT status FROM organization_users WHERE organization_id = '${orgId}' AND user_id = '${userId}';`);
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
console.log("\nPR-2.0 Organizations Test Harness\n");
console.log("==================================\n");

console.log("Starting API...");
const api = await startApi(true);

try {
  await waitForApi();
  console.log("API ready.\n");

  const testPassword = "testpassword123";
  const ts = Date.now();

  // ═══════════════════════════════════════════════════════════════
  // Setup: Register users and organizations
  // ═══════════════════════════════════════════════════════════════

  // Owner user (org1) - primary org
  const ownerEmail = `test-org-owner-${ts}@example.com`;
  const ownerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Owner User", email: ownerEmail, password: testPassword, organizationName: "Owner Org" }),
  });
  let ownerUserId = ownerReg.json.user.id;
  let ownerOrgId = ownerReg.json.organization.id;
  let ownerAccessToken = ownerReg.json.accessToken;
  getRefreshCookie(ownerReg.cookies);

  // Manager user (org1)
  const managerEmail = `test-org-manager-${ts}@example.com`;
  const managerReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Manager User", email: managerEmail, password: testPassword, organizationName: "Manager Org" }),
  });
  let managerUserId = managerReg.json.user.id;
  let managerOrgId = managerReg.json.organization.id;
  let managerAccessToken = managerReg.json.accessToken;
  getRefreshCookie(managerReg.cookies);

  // Professional user (org1, added via invite)
  const profEmail = `test-org-professional-${ts}@example.com`;
  const profReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Professional User", email: profEmail, password: testPassword, organizationName: "Prof Org" }),
  });
  let profUserId = profReg.json.user.id;
  let profAccessToken = profReg.json.accessToken;
  getRefreshCookie(profReg.cookies);

  // Second org user (for tenant isolation)
  const tenantEmail = `test-org-tenant-${ts}@example.com`;
  const tenantReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Tenant User", email: tenantEmail, password: testPassword, organizationName: "Tenant Org" }),
  });
  let tenantOrgId = tenantReg.json.organization.id;

  // Add manager and professional to owner's org via DB
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${managerUserId}', 'MANAGER', 'ACTIVE');`);
  execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${ownerOrgId}', '${profUserId}', 'PROFESSIONAL', 'ACTIVE');`);

  // Login after adding memberships to get tokens with org context
  const managerLogin = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: managerEmail, password: testPassword }),
  });
  managerAccessToken = managerLogin.json.accessToken;

  const profLogin = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: profEmail, password: testPassword }),
  });
  profAccessToken = profLogin.json.accessToken;

  // Re-login owner to get token with org context
  const ownerLogin = await fetchJson("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: ownerEmail, password: testPassword }),
  });
  ownerAccessToken = ownerLogin.json.accessToken;
  getRefreshCookie(ownerLogin.cookies);

  // Set email verified on owner for invite tests
  setEmailVerified(ownerUserId);

  // ═══════════════════════════════════════════════════════════════
  // Group 1 — Organizations (T1–T6)
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Organizations ───\n");

  // T1: GET /organizations/me — 200, body has memberships[] with organization info
  await testAsync("GET /organizations/me returns memberships", async () => {
    const { status, json } = await fetchJson("/api/v1/organizations/me", {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(Array.isArray(json), "response should be array of memberships");
    assert.ok(json.length >= 1, "should have at least 1 membership");
    assert.ok(json[0].organizationId, "membership should have organizationId");
    assert.ok(json[0].name, "membership should have org name");
  });

  // T2: GET /organizations/:id as member — 200, org details
  await testAsync("GET /organizations/:id as member returns org details", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.equal(json.id, ownerOrgId, "should return correct org id");
    assert.ok(json.name, "should have name");
    assert.ok(json.slug, "should have slug");
  });

  // T3: GET /organizations/:id as member of DIFFERENT org — 404 (tenant opacity)
  await testAsync("GET /organizations/:id as member of different org returns 404", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${managerOrgId}`, {
      headers: { authorization: `Bearer ${managerAccessToken}` },
    });
    assert.equal(status, 404, `Expected 404, got ${status}`);
  });

  // T4: GET /organizations/:id without auth — 401
  await testAsync("GET /organizations/:id without auth returns 401", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`);
    assert.equal(status, 401, `Expected 401, got ${status}`);
  });

  // T5: PATCH /organizations/:id as OWNER — 200, name updated
  await testAsync("PATCH /organizations/:id as OWNER updates name", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ name: "Updated Owner Org" }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.equal(json.name, "Updated Owner Org", "name should be updated");
  });

  // T6: PATCH /organizations/:id as MANAGER — 403 AUTHZ_DENIED
  await testAsync("PATCH /organizations/:id as MANAGER returns 403", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerAccessToken}`,
      },
      body: JSON.stringify({ name: "No Perm" }),
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
    assert.equal(json?.error?.code, "AUTHZ_DENIED", "should be AUTHZ_DENIED");
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 2 — Organization PATCH validations (T7–T11)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── PATCH Validations ───\n");

  // T7: PATCH with invalid timezone → 422 VALIDATION_ERROR
  await testAsync("PATCH with invalid timezone returns 422", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ timezone: "Invalid/Zone" }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
  });

  // T8: PATCH with valid IANA timezone → 200
  await testAsync("PATCH with valid IANA timezone returns 200", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ timezone: "America/Santiago" }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.equal(json.timezone, "America/Santiago", "timezone should be updated");
  });

  // T9: PATCH with slotIntervalMin: 3 → 422 VALIDATION_ERROR
  await testAsync("PATCH with slotIntervalMin=3 returns 422", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ slotIntervalMin: 3 }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
  });

  // T10: PATCH with slotIntervalMin: 300 → 422 VALIDATION_ERROR
  await testAsync("PATCH with slotIntervalMin=300 returns 422", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ slotIntervalMin: 300 }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
  });

  // T11: PATCH with slotIntervalMin: 30 → 200 (valid range)
  await testAsync("PATCH with slotIntervalMin=30 returns 200", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ slotIntervalMin: 30 }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.equal(json.slotIntervalMin, 30, "slotIntervalMin should be updated");
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 3 — Members (T12–T20)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Members ───\n");

  // T12: GET /organizations/:id/members as OWNER → 200
  await testAsync("GET members as OWNER returns 200", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(Array.isArray(json), "should be array");
    assert.ok(json.length >= 3, `should have at least 3 members (owner, manager, prof), got ${json.length}`);
  });

  // T13: GET /organizations/:id/members as MANAGER → 200
  await testAsync("GET members as MANAGER returns 200", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members`, {
      headers: { authorization: `Bearer ${managerAccessToken}` },
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(Array.isArray(json), "should be array");
  });

  // T14: PATCH /:id/members/:userId change role as OWNER → 200
  await testAsync("PATCH member role as OWNER returns 200", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${profUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ role: "MANAGER" }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.equal(json.role, "MANAGER", "role should be updated to MANAGER");
    // Change back for later tests
    await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${profUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ role: "PROFESSIONAL" }),
    });
  });

  // T15: Demote only OWNER to MANAGER → 409 LAST_OWNER
  await testAsync("demote only OWNER to MANAGER returns 409 LAST_OWNER", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${ownerUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ role: "MANAGER" }),
    });
    assert.equal(status, 409, `Expected 409, got ${status}`);
    assert.equal(json?.error?.code, "LAST_OWNER", "should be LAST_OWNER");
  });

  // T16: Disable only OWNER → 409 LAST_OWNER
  await testAsync("disable only OWNER returns 409 LAST_OWNER", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${ownerUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ status: "DISABLED" }),
    });
    assert.equal(status, 409, `Expected 409, got ${status}`);
    assert.equal(json?.error?.code, "LAST_OWNER", "should be LAST_OWNER");
  });

  // T17: Promote another → OWNER, then demote original → 200 (LAST_OWNER no longer triggered)
  await testAsync("promote another to OWNER then demote original succeeds", async () => {
    // Promote manager to OWNER
    const promoteRes = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${managerUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ role: "OWNER" }),
    });
    assert.equal(promoteRes.status, 200, `promotion: Expected 200, got ${promoteRes.status}`);

    // Demote original owner to MANAGER (now there are 2 owners, so it should work)
    const demoteRes = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${ownerUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ role: "MANAGER" }),
    });
    assert.equal(demoteRes.status, 200, `demotion: Expected 200, got ${demoteRes.status}`);

    // Restore: promote original back to OWNER, demote manager back to MANAGER
    await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${ownerUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ role: "OWNER" }),
    });
    await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${managerUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ role: "MANAGER" }),
    });
  });

  // T18: DISABLED member — old refresh token rejected (sessions revoked)
  let disabledProfRefreshCookie = null;
  await testAsync("DISABLED member sessions are revoked", async () => {
    // Get prof's refresh cookie
    const profLogin = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: profEmail, password: testPassword }),
    });
    disabledProfRefreshCookie = getRefreshCookie(profLogin.cookies);
    assert.ok(disabledProfRefreshCookie, "should have refresh cookie before disable");

    // Disable professional
    const disableRes = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${profUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ status: "DISABLED" }),
    });
    assert.equal(disableRes.status, 200, `disable: Expected 200, got ${disableRes.status}`);

    // Try refresh — should fail
    const refreshRes = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `refresh_token=${disabledProfRefreshCookie.token}`,
      },
    });
    assert.equal(refreshRes.status, 401, `Expected 401 for disabled member refresh, got ${refreshRes.status}`);

    // Re-enable professional for later tests
    execPsql(`UPDATE organization_users SET status = 'ACTIVE' WHERE user_id = '${profUserId}' AND organization_id = '${ownerOrgId}';`);
  });

  // T19: MANAGER tries to demote OWNER → 403 AUTHZ_DENIED
  await testAsync("MANAGER PATCH on member returns 403", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/${ownerUserId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerAccessToken}`,
      },
      body: JSON.stringify({ role: "PROFESSIONAL" }),
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
  });

  // T20: Membership revalidation: user disabled, then try PATCH members → 403
  await testAsync("disabled user PATCH members returns 403", async () => {
    // Disable owner (but keep prof as active in db temporarily so owner is disable-target)
    execPsql(`UPDATE organization_users SET status = 'DISABLED' WHERE user_id = '${managerUserId}' AND organization_id = '${ownerOrgId}';`);

    // Manager's token still has org, but TenantGuard revalidates
    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members`, {
      headers: { authorization: `Bearer ${managerAccessToken}` },
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);

    // Restore manager membership
    execPsql(`UPDATE organization_users SET status = 'ACTIVE' WHERE user_id = '${managerUserId}' AND organization_id = '${ownerOrgId}';`);

    // Re-login manager to get fresh token
    const reLogin = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: managerEmail, password: testPassword }),
    });
    managerAccessToken = reLogin.json.accessToken;
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 4 — Invitations: Create (T21–T27)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Invitations: Create ───\n");

  let inviteEmail = `test-org-invite-${ts}@example.com`;

  // T21: POST /:id/members/invite as OWNER with verified email → 201
  let createdInvitationId = null;
  await testAsync("POST invite as OWNER with verified email returns 201", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ email: inviteEmail, role: "PROFESSIONAL" }),
    });
    assert.equal(status, 201, `Expected 201, got ${status}`);
    assert.ok(json.id, "should have invitation id");
    createdInvitationId = json.id;

    // Verify token exists in DB
    const dbResult = execPsqlSafe(`SELECT id FROM invitations WHERE id = '${json.id}' AND organization_id = '${ownerOrgId}';`);
    assert.ok(dbResult, "invitation should exist in DB");
  });

  // T22: POST invite with unverified email returns 403 EMAIL_NOT_VERIFIED
  await testAsync("POST invite with unverified email returns 403", async () => {
    // Create a new user without email verification
    const unverEmail = `test-org-unver-${ts}@example.com`;
    const unverReg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Unverified User", email: unverEmail, password: testPassword, organizationName: "Unver Org" }),
    });
    const unverToken = unverReg.json.accessToken;

    const { status, json } = await fetchJson(`/api/v1/organizations/${unverReg.json.organization.id}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${unverToken}`,
      },
      body: JSON.stringify({ email: "someone@example.com", role: "PROFESSIONAL" }),
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
    assert.equal(json?.error?.code, "EMAIL_NOT_VERIFIED", "should be EMAIL_NOT_VERIFIED");
  });

  // T23: POST invite as MANAGER → 403 AUTHZ_DENIED
  await testAsync("POST invite as MANAGER returns 403", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerAccessToken}`,
      },
      body: JSON.stringify({ email: "someone@example.com", role: "PROFESSIONAL" }),
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
  });

  // T24: Re-send to same email (pending) → 201, old token replaced
  await testAsync("re-send invite to same email replaces old token", async () => {
    const resendRes = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ email: inviteEmail, role: "PROFESSIONAL" }),
    });
    assert.equal(resendRes.status, 201, `Expected 201, got ${resendRes.status}`);
    assert.ok(resendRes.json.id, "should have invitation id");
  });

  // T25: POST invite with invalid role → 422 VALIDATION_ERROR
  await testAsync("POST invite with invalid role returns 422", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ email: `invalidrole-${ts}@example.com`, role: "INVALID_ROLE" }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
  });

  // T26: GET /organizations/:id/invitations as OWNER → 200
  await testAsync("GET invitations as OWNER returns 200", async () => {
    const { status, json } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/invitations`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(Array.isArray(json), "should be array");
    createdInvitationId = json[0]?.id;
    assert.ok(createdInvitationId, "should have at least 1 pending invitation");
  });

  // T27: POST invite with cross-tenant org id → 404
  await testAsync("POST invite with cross-tenant org id returns 404", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${tenantOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ email: "someone@example.com", role: "PROFESSIONAL" }),
    });
    assert.equal(status, 404, `Expected 404, got ${status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 5 — Invitations: Accept (existing user) (T28–T33)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Invitations: Accept (existing user) ───\n");

  // Create a fresh invitation for the tenant user to accept
  let validToken = null;
  let validTokenHash = null;

  // Register a fresh user that will be invited to owner's org
  const acceptUserEmail = `test-org-acceptuser-${ts}@example.com`;
  const acceptUserReg = await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Accept User", email: acceptUserEmail, password: testPassword, organizationName: "Accept User Org" }),
  });
  let acceptUserId = acceptUserReg.json.user.id;
  let acceptUserToken = acceptUserReg.json.accessToken;

  // Create invitation from owner org to acceptUserEmail via API
  const inviteRes = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/invite`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerAccessToken}`,
    },
    body: JSON.stringify({ email: acceptUserEmail, role: "PROFESSIONAL" }),
  });
  assert.equal(inviteRes.status, 201, `invite: Expected 201, got ${inviteRes.status}`);

  // Get the raw token from DB for accept-invite
  const inviteInDb = execPsqlSafe(`SELECT token_hash FROM invitations WHERE email = '${acceptUserEmail}' AND organization_id = '${ownerOrgId}' AND accepted_at IS NULL ORDER BY created_at DESC LIMIT 1;`);
  validTokenHash = inviteInDb.trim();

  // We need raw token to call accept-invite... but the raw token is only in the notification
  // Create a DB invitation with known raw token instead
  {
    const { rawToken, tokenHash } = dbCreateInvitation(
      ownerOrgId,
      acceptUserEmail,
      "PROFESSIONAL",
      ownerUserId,
      new Date(Date.now() + 7 * 86400_000).toISOString(),
    );
    validToken = rawToken;
    validTokenHash = tokenHash;

    // Delete the API-created invitation (we'll use our DB-created one)
    execPsqlSafe(`DELETE FROM invitations WHERE email = '${acceptUserEmail}' AND organization_id = '${ownerOrgId}' AND token_hash != '${tokenHash}';`);
  }

  // T28: POST /auth/accept-invite logged-in → 200, membership ACTIVE
  await testAsync("accept invite logged-in returns 200", async () => {
    const { status, json } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${acceptUserToken}`,
      },
      body: JSON.stringify({ token: validToken }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(json.organization, "should return organization");

    // Verify membership exists and is ACTIVE
    const count = countMemberships(ownerOrgId, acceptUserId);
    assert.equal(count, 1, `should have exactly 1 membership, got ${count}`);
    const mStatus = getMembershipStatus(ownerOrgId, acceptUserId);
    assert.equal(mStatus, "ACTIVE", "membership should be ACTIVE");
  });

  // T29: Accept expired token → 410 INVITE_TOKEN_EXPIRED
  await testAsync("accept expired token returns 410", async () => {
    const expiredEmail = `test-org-expired-${ts}@example.com`;
    const { rawToken } = dbCreateInvitation(
      ownerOrgId,
      expiredEmail,
      "PROFESSIONAL",
      ownerUserId,
      new Date(Date.now() - 3600_000).toISOString(),
    );

    const { status, json } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profAccessToken}`,
      },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(status, 410, `Expected 410, got ${status}`);
    assert.equal(json?.error?.code, "INVITE_TOKEN_EXPIRED", "should be INVITE_TOKEN_EXPIRED");
  });

  // T30: Accept already used token → 410 INVITE_TOKEN_INVALID
  await testAsync("accept already used token returns 410", async () => {
    const { status, json } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${acceptUserToken}`,
      },
      body: JSON.stringify({ token: validToken }),
    });
    assert.equal(status, 410, `Expected 410, got ${status}`);
    assert.equal(json?.error?.code, "INVITE_TOKEN_INVALID", "should be INVITE_TOKEN_INVALID");
  });

  // T31: Accept random/invalid token → 410 INVITE_TOKEN_INVALID
  await testAsync("accept random token returns 410", async () => {
    const randomTok = randomBytes(32).toString("hex");
    const { status, json } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: randomTok }),
    });
    assert.equal(status, 410, `Expected 410, got ${status}`);
    assert.equal(json?.error?.code, "INVITE_TOKEN_INVALID", "should be INVITE_TOKEN_INVALID");
  });

  // T32: Accept already member → 409 ALREADY_MEMBER
  await testAsync("accept already member returns 409", async () => {
    // acceptUserId is already a member of ownerOrgId
    const { rawToken } = dbCreateInvitation(
      ownerOrgId,
      acceptUserEmail,
      "PROFESSIONAL",
      ownerUserId,
      new Date(Date.now() + 7 * 86400_000).toISOString(),
    );

    const { status, json } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${acceptUserToken}`,
      },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(status, 409, `Expected 409, got ${status}`);
    assert.equal(json?.error?.code, "ALREADY_MEMBER", "should be ALREADY_MEMBER");
  });

  // T33: Verify accepted_at set + no duplicate membership in DB
  await testAsync("accepted_at set and no duplicate membership", async () => {
    const invInfo = getInvitationFromDb(validTokenHash);
    const parts = invInfo.split("|").map(s => s.trim());
    const acceptedAt = parts[1];
    assert.ok(acceptedAt && acceptedAt !== "", "accepted_at should be set");

    const count = countMemberships(ownerOrgId, acceptUserId);
    assert.equal(count, 1, `should have exactly 1 membership, got ${count}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 6 — Invitations: Accept (register-by-invite) (T34–T38)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Invitations: Accept (register-by-invite) ───\n");

  // T34: POST /auth/accept-invite { token, name, password } → 201
  await testAsync("register-by-invite returns 201", async () => {
    const regInviteEmail = `test-org-reginvite-${ts}@example.com`;
    const { rawToken } = dbCreateInvitation(
      ownerOrgId,
      regInviteEmail,
      "PROFESSIONAL",
      ownerUserId,
      new Date(Date.now() + 7 * 86400_000).toISOString(),
    );
    const { status, json, cookies } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, name: "Registered By Invite", password: "newuserpass123" }),
    });
    assert.equal(status, 201, `Expected 201, got ${status}`);
    assert.ok(json.user, "should have user");
    assert.ok(json.organization, "should have organization");
    assert.ok(json.accessToken, "should have accessToken");
    const refCookie = getRefreshCookie(cookies);
    assert.ok(refCookie, "should have refresh cookie");
  });

  // T35: Register-by-invite with password < 8 chars → 422 VALIDATION_ERROR
  await testAsync("register-by-invite with short password returns 422", async () => {
    const shortPwEmail = `test-org-shortpw-${ts}@example.com`;
    const { rawToken } = dbCreateInvitation(
      ownerOrgId,
      shortPwEmail,
      "PROFESSIONAL",
      ownerUserId,
      new Date(Date.now() + 7 * 86400_000).toISOString(),
    );

    const { status, json } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, name: "Short PW", password: "1234567" }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
  });

  // T36: Register-by-invite with empty name → 422 VALIDATION_ERROR
  await testAsync("register-by-invite with empty name returns 422", async () => {
    const emptyNameEmail = `test-org-emptyname-${ts}@example.com`;
    const { rawToken } = dbCreateInvitation(
      ownerOrgId,
      emptyNameEmail,
      "PROFESSIONAL",
      ownerUserId,
      new Date(Date.now() + 7 * 86400_000).toISOString(),
    );

    const { status, json } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, name: "", password: "password123" }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}`);
    assert.equal(json?.error?.code, "VALIDATION_ERROR", "should be VALIDATION_ERROR");
  });

  // T37: Register-by-invite with expired token → 410 INVITE_TOKEN_EXPIRED
  await testAsync("register-by-invite with expired token returns 410", async () => {
    const expInviteEmail = `test-org-expinvite-${ts}@example.com`;
    const { rawToken } = dbCreateInvitation(
      ownerOrgId,
      expInviteEmail,
      "PROFESSIONAL",
      ownerUserId,
      new Date(Date.now() - 3600_000).toISOString(),
    );

    const { status, json } = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, name: "Expired Invite", password: "password123" }),
    });
    assert.equal(status, 410, `Expected 410, got ${status}`);
    assert.equal(json?.error?.code, "INVITE_TOKEN_EXPIRED", "should be INVITE_TOKEN_EXPIRED");
  });

  // T38: New user can login with password after accepting invite
  await testAsync("new user can login after register-by-invite", async () => {
    const loginEmail = `test-org-logininv-${ts}@example.com`;
    const { rawToken } = dbCreateInvitation(
      ownerOrgId,
      loginEmail,
      "PROFESSIONAL",
      ownerUserId,
      new Date(Date.now() + 7 * 86400_000).toISOString(),
    );

    const acceptRes = await fetchJson("/api/v1/auth/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, name: "Login After Invite", password: "logininvitepw123" }),
    });
    assert.equal(acceptRes.status, 201, `accept: Expected 201, got ${acceptRes.status}`);

    const loginRes = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: "logininvitepw123" }),
    });
    assert.equal(loginRes.status, 200, `login: Expected 200, got ${loginRes.status}`);
    assert.ok(loginRes.json.accessToken, "should return access token");
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 7 — Invitations: Revoke (T39–T41)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Invitations: Revoke ───\n");

  // T39: DELETE /:id/invitations/:invitationId as OWNER → 200/204
  await testAsync("DELETE invitation as OWNER returns success", async () => {
    // Create a fresh invitation to revoke
    const revokeEmail = `test-org-revoke-${ts}@example.com`;
    const inviteRes = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ email: revokeEmail, role: "PROFESSIONAL" }),
    });
    assert.equal(inviteRes.status, 201, `invite: Expected 201, got ${inviteRes.status}`);
    const invId = inviteRes.json.id;
    assert.ok(invId, "should have invitation id");

    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/invitations/${invId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.ok(status === 200 || status === 204, `Expected 200/204, got ${status}`);
  });

  // T40: DELETE invitation as MANAGER → 403 AUTHZ_DENIED
  await testAsync("DELETE invitation as MANAGER returns 403", async () => {
    const revokeEmail2 = `test-org-revoke2-${ts}@example.com`;
    const inviteRes = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ email: revokeEmail2, role: "PROFESSIONAL" }),
    });
    const invId = inviteRes.json.id;

    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/invitations/${invId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${managerAccessToken}` },
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
  });

  // T41: DELETE already accepted invitation → 404
  await testAsync("DELETE already accepted invitation returns 404", async () => {
    // The invitation for validToken is already accepted (T28)
    // Find its ID
    const invInfo = execPsqlSafe(`SELECT id FROM invitations WHERE token_hash = '${validTokenHash}';`);
    const invId = invInfo.trim();
    assert.ok(invId, "should find accepted invitation id");

    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/invitations/${invId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(status, 404, `Expected 404, got ${status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 8 — Tenant Isolation (T42–T44)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Tenant Isolation ───\n");

  // T42: GET /organizations/:id for org of OTHER tenant → 404
  await testAsync("GET org of other tenant returns 404", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${tenantOrgId}`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(status, 404, `Expected 404, got ${status}`);
  });

  // T43: GET /organizations/:id/members for other tenant → 404
  await testAsync("GET members of other tenant returns 404", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${tenantOrgId}/members`, {
      headers: { authorization: `Bearer ${ownerAccessToken}` },
    });
    assert.equal(status, 404, `Expected 404, got ${status}`);
  });

  // T44: POST /:id/members/invite for other tenant → 404
  await testAsync("POST invite for other tenant returns 404", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${tenantOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerAccessToken}`,
      },
      body: JSON.stringify({ email: `cross-tenant-${ts}@example.com`, role: "PROFESSIONAL" }),
    });
    assert.equal(status, 404, `Expected 404, got ${status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 9 — Authorization Guards (T45–T48)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Authorization Guards ───\n");

  // T45: MANAGER on OWNER-only route → 403 AUTHZ_DENIED
  await testAsync("MANAGER on OWNER-only route returns 403", async () => {
    // POST invite is OWNER-only
    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members/invite`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${managerAccessToken}`,
      },
      body: JSON.stringify({ email: `t45-${ts}@example.com`, role: "PROFESSIONAL" }),
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
  });

  // T46: PROFESSIONAL on OWNER/MANAGER route → 403 AUTHZ_DENIED
  await testAsync("PROFESSIONAL on OWNER/MANAGER route returns 403", async () => {
    // GET members requires OWNER or MANAGER
    // Re-login to ensure prof has fresh token with org context
    const profReLogin = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: profEmail, password: testPassword }),
    });
    // Prof has 2 org memberships (profOrg + ownerOrg). Login will have null activeOrg
    // Need to switch to ownerOrg
    const switchRes = await fetchJson("/api/v1/auth/switch-org", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profReLogin.json.accessToken}`,
      },
      body: JSON.stringify({ organizationId: ownerOrgId }),
    });
    assert.equal(switchRes.status, 200, `switch-org: Expected 200, got ${switchRes.status}`);
    const profOrgToken = switchRes.json.accessToken;

    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}/members`, {
      headers: { authorization: `Bearer ${profOrgToken}` },
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
  });

  // T47: Unauthenticated → org route → 401
  await testAsync("unauthenticated org route returns 401", async () => {
    const { status } = await fetchJson(`/api/v1/organizations/${ownerOrgId}`);
    assert.equal(status, 401, `Expected 401, got ${status}`);
  });

  // T48: User with >1 org, no active org → 403 NO_ACTIVE_ORG
  await testAsync("user with multiple orgs and no active org returns 403", async () => {
    // Create a user with exactly 1 org, then add a second org
    const multiEmail = `test-org-multi-${ts}@example.com`;
    const multiReg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Multi Org User", email: multiEmail, password: testPassword, organizationName: "Multi Org 1" }),
    });
    const multiUserId = multiReg.json.user.id;
    const multiOrg1Id = multiReg.json.organization.id;

    // Create second org via DB
    const secondOrgSlug = `multi-org-2-${Date.now()}`;
    execPsql(`INSERT INTO organizations (name, slug) VALUES ('Multi Org 2', '${secondOrgSlug}') RETURNING id;`);
    const secondOrgRaw = execPsql(`SELECT id FROM organizations WHERE slug = '${secondOrgSlug}';`);
    const multiOrg2Id = secondOrgRaw.trim();
    execPsql(`INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${multiOrg2Id}', '${multiUserId}', 'OWNER', 'ACTIVE');`);

    // Login — should have null activeOrg (2 orgs)
    const multiLogin = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: multiEmail, password: testPassword }),
    });
    assert.equal(multiLogin.json.activeOrg, null, "activeOrg should be null with 2 orgs");
    const multiToken = multiLogin.json.accessToken;

    // Try to access org-scoped route without active org
    const { status, json } = await fetchJson(`/api/v1/organizations/${multiOrg1Id}`, {
      headers: { authorization: `Bearer ${multiToken}` },
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
    assert.equal(json?.error?.code, "AUTHZ_DENIED", "should be AUTHZ_DENIED");
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 10 — Audit Logs (T49–T52)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Audit Logs ───\n");

  // T49: MEMBER_INVITED with correct action + target
  await testAsync("MEMBER_INVITED in audit_logs", async () => {
    const count = countAuditLogs("MEMBER_INVITED", ownerOrgId);
    assert.ok(count >= 1, `Expected MEMBER_INVITED audit log, got ${count}`);
  });

  // T50: ROLE_CHANGED with metadata { role }
  await testAsync("ROLE_CHANGED in audit_logs", async () => {
    // T14 and T17 performed role changes, should have ROLE_CHANGED entries
    const count = countAuditLogs("ROLE_CHANGED", ownerOrgId);
    assert.ok(count >= 1, `Expected ROLE_CHANGED audit log, got ${count}`);
    const metadata = findAuditLog("ROLE_CHANGED", ownerOrgId);
    assert.ok(metadata, "ROLE_CHANGED audit log should have metadata");
  });

  // T51: MEMBER_DISABLED after disabling member
  await testAsync("MEMBER_DISABLED in audit_logs", async () => {
    // T18 disabled the professional. Check for MEMBER_DISABLED
    const count = countAuditLogs("MEMBER_DISABLED", ownerOrgId);
    assert.ok(count >= 1, `Expected MEMBER_DISABLED audit log, got ${count}`);
  });

  // T52: LAST_OWNER_REJECTED after LAST_OWNER blocks operation
  await testAsync("LAST_OWNER_REJECTED in audit_logs", async () => {
    // T15 and T16 triggered LAST_OWNER_REJECTED
    const count = countAuditLogs("LAST_OWNER_REJECTED", ownerOrgId);
    assert.ok(count >= 1, `Expected LAST_OWNER_REJECTED audit log, got ${count}`);
  });

  // ── Summary ──
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
