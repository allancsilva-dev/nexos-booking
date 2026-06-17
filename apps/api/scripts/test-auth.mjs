import { spawn, execSync } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { createHmac } from "node:crypto";
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

function extractCookie(cookies, name) {
  for (const c of cookies) {
    const match = c.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function hasCookieFlag(cookies, name, flag) {
  for (const c of cookies) {
    if (c.startsWith(`${name}=`)) return c.toLowerCase().includes(flag.toLowerCase());
  }
  return false;
}

function getRefreshCookie(cookies) {
  const token = extractCookie(cookies, "refresh_token");
  if (!token) return null;
  const pathFlag = cookies.find((c) => c.startsWith("refresh_token="));
  const path = pathFlag ? pathFlag.match(/Path=([^;]+)/)?.[1] : null;
  const httpOnly = hasCookieFlag(cookies, "refresh_token", "httponly");
  const secure = hasCookieFlag(cookies, "refresh_token", "secure");
  const sameSite = pathFlag ? pathFlag.match(/SameSite=([^;]+)/i)?.[1] : null;
  return { token, path, httpOnly, secure, sameSite };
}

// ═══════════════════════════════════════════════════════════════
// JWT helper for negative tests
// ═══════════════════════════════════════════════════════════════
function base64url(str) {
  return Buffer.from(str).toString("base64url");
}

function makeNoneAlgToken(payload) {
  const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.`;
}

function makeBadIssToken(secret, payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, iss: "wrong-issuer" }));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function makeBadAudToken(secret, payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, aud: "wrong-audience" }));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
console.log("\nPR-1.4 Auth Test Harness\n");
console.log("========================\n");

console.log("Starting API...");
const api = await startApi(true);

try {
  await waitForApi();
  console.log("API ready.\n");

  let accessToken1 = null;
  let refreshCookie1 = null;
  let user1Id = null;
  let org1Id = null;
const testEmail = `test-${Date.now()}@example.com`;
const testEmail3 = `test3-${Date.now()}@example.com`;
const testPassword = "testpassword123";

const TEST_SENTINEL_PASSWORD = "SenhaSuperSecreta123!";
const TEST_SENTINEL_COOKIE = "cookie-sentinel-value-xyz";

function makeExpiredToken(secret, payload) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) - 3600 }));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function createSecondOrg(dbUser, dbPass, dbName, userId, orgName) {
  const slug = `second-org-${Date.now()}`;
  const raw = execSync(
    `docker compose exec -T -e PGPASSWORD="${dbPass}" postgres psql -t -U "${dbUser}" -d "${dbName}" -c "INSERT INTO organizations (name, slug) VALUES ('${orgName}', '${slug}') RETURNING id;"`,
    { cwd: repoRoot(), encoding: "utf8" },
  );
  const orgId = raw.split("\n")[0].trim();
  execSync(
    `docker compose exec -T -e PGPASSWORD="${dbPass}" postgres psql -t -U "${dbUser}" -d "${dbName}" -c "INSERT INTO organization_users (organization_id, user_id, role, status) VALUES ('${orgId}', '${userId}', 'OWNER', 'ACTIVE');"`,
    { cwd: repoRoot(), encoding: "utf8" },
  );
  return orgId;
}

function disableMembership(dbUser, dbPass, dbName, userId, orgId) {
  execSync(
    `docker compose exec -T -e PGPASSWORD="${dbPass}" postgres psql -t -U "${dbUser}" -d "${dbName}" -c "UPDATE organization_users SET status = 'DISABLED' WHERE user_id = '${userId}' AND organization_id = '${orgId}';"`,
    { cwd: repoRoot(), encoding: "utf8" },
  );
}

  // ── T1: Register creates user + org + OWNER membership ──
  console.log("─── Registration ───\n");

  await testAsync("register creates user + org + OWNER membership", async () => {
    const { status, json, cookies } = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: testEmail,
        password: testPassword,
        organizationName: "Test Org",
      }),
    });
    assert.equal(status, 201, `Expected 201, got ${status}`);
    assert.ok(json.user, "user should exist");
    assert.ok(json.user.id, "user.id should exist");
    assert.ok(json.organization, "organization should exist");
    assert.ok(json.accessToken, "accessToken should exist");
    user1Id = json.user.id;
    org1Id = json.organization.id;
    accessToken1 = json.accessToken;
    refreshCookie1 = getRefreshCookie(cookies);
    assert.ok(refreshCookie1, "refresh cookie should exist");
    assert.equal(refreshCookie1.httpOnly, true, "cookie should be httpOnly");
    assert.equal(refreshCookie1.secure, true, "cookie should be Secure");
    assert.equal(refreshCookie1.sameSite, "Strict", "cookie should be SameSite=Strict");
    assert.equal(refreshCookie1.path, "/api/v1/auth/refresh", "cookie path should be /api/v1/auth/refresh");
  });

  // ── T2: Register with existing email → 409 ──
  await testAsync("register with existing email returns 409", async () => {
    const { status, json } = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Another",
        email: testEmail,
        password: testPassword,
        organizationName: "Another Org",
      }),
    });
    assert.equal(status, 409, `Expected 409, got ${status}`);
    assert.ok(json?.error, "should use error envelope");
  });

  // ── T3: Password stored as hash (negative - raw passwords not visible in DB) ──
  await testAsync("password hash is argon2id (not plain text)", async () => {
    const dbHash = await checkPasswordHash(user1Id);
    assert.ok(dbHash.startsWith("$argon2id$"), "password hash should be argon2id format");
  });

  // ── T4: Login with correct credentials ──
  console.log("\n─── Login ───\n");

  await testAsync("login returns access token + refresh cookie", async () => {
    const { status, json, cookies } = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(json.accessToken, "accessToken should exist");
    assert.ok(json.user, "user should exist");
    accessToken1 = json.accessToken;
    refreshCookie1 = getRefreshCookie(cookies);
    assert.ok(refreshCookie1, "refresh cookie should exist");
  });

  // ── T5: Login invalid credentials → 401 ──
  await testAsync("login with wrong password returns 401", async () => {
    const { status } = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "wrongpassword" }),
    });
    assert.equal(status, 401, `Expected 401, got ${status}`);
  });

  // ── T6: Login with 1 active org emits access with org ──
  await testAsync("login with 1 org emits access token with org claim", async () => {
    const { json } = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    assert.equal(json.activeOrg, org1Id, "activeOrg should match the only org");
    accessToken1 = json.accessToken;
  });

  // ── T7: GET /auth/me returns bootstrap data ──
  console.log("\n─── GET /auth/me ───\n");

  await testAsync("GET /auth/me returns user + memberships", async () => {
    const { status, json } = await fetchJson("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${accessToken1}` },
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(json.user, "user should exist");
    assert.ok(Array.isArray(json.memberships), "memberships should be array");
    assert.ok(json.memberships.length >= 1, "should have at least 1 membership");
    assert.equal(json.activeOrg, org1Id, "activeOrg should be set");
  });

  // ── T7b: Multi-org: login with 2 orgs emits access WITHOUT org ──
  console.log("\n─── Multi-Org (ADR-020) ───\n");

  const dotEnv = loadDotEnv(repoRoot());
  const dbUser = dotEnv.POSTGRES_USER ?? "nexos_booking";
  const dbPass = dotEnv.POSTGRES_PASSWORD ?? "nexos_booking_local_password";
  const dbName = dotEnv.POSTGRES_DB ?? "nexos_booking";

  let multiOrgAccessToken = null;
  let org2Id = null;

  await testAsync("create second organization for user", async () => {
    org2Id = createSecondOrg(dbUser, dbPass, dbName, user1Id, "Second Org");
    assert.ok(org2Id, "org2Id should be created");
  });

  await testAsync("login with 2 orgs emits access token WITHOUT org claim", async () => {
    const { status, json, cookies } = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.equal(json.activeOrg, null, "activeOrg should be null with 2 orgs");
    multiOrgAccessToken = json.accessToken;
    refreshCookie1 = getRefreshCookie(cookies);
  });

  await testAsync("GET /auth/me with multi-org returns 2 memberships", async () => {
    const { status, json } = await fetchJson("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${multiOrgAccessToken}` },
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(json.memberships), "memberships should be array");
    assert.equal(json.memberships.length, 2, `Expected 2 memberships, got ${json.memberships.length}`);
    assert.equal(json.activeOrg, null, "activeOrg should be null");
  });

  // ── T8: Refresh without CSRF → 403 ──
  console.log("\n─── Refresh / CSRF ───\n");

  await testAsync("refresh without X-CSRF: 1 returns 403", async () => {
    const { status } = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: { cookie: `refresh_token=${refreshCookie1.token}` },
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
  });

  // ── T9: Refresh with valid CSRF rotates refresh ──
  await testAsync("refresh with X-CSRF: 1 rotates refresh token", async () => {
    const { status, json, cookies } = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `refresh_token=${refreshCookie1.token}`,
      },
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(json.accessToken, "should return new access token");
    const newCookie = getRefreshCookie(cookies);
    assert.ok(newCookie, "should set new refresh cookie");
    assert.notEqual(newCookie.token, refreshCookie1.token, "refresh token should be rotated");
    refreshCookie1 = newCookie;
    accessToken1 = json.accessToken;
  });

  // ── T10: Refresh reuse revokes family ──
  await testAsync("reusing revoked refresh token revokes family", async () => {
    // First do a normal refresh to get new token
    const res1 = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `refresh_token=${refreshCookie1.token}`,
      },
    });
    const oldRefreshToken = refreshCookie1.token;
    refreshCookie1 = getRefreshCookie(res1.cookies);
    accessToken1 = res1.json.accessToken;

    // Now reuse the old token (which was revoked)
    const res2 = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `refresh_token=${oldRefreshToken}`,
      },
    });
    assert.equal(res2.status, 401, `Expected 401 for reused token, got ${res2.status}`);

    // The current valid token should also be revoked (family revoked)
    const res3 = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `refresh_token=${refreshCookie1.token}`,
      },
    });
    assert.equal(res3.status, 401, `Expected 401 for family-revoked token, got ${res3.status}`);

    // Login again to get fresh session
    const loginRes = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    accessToken1 = loginRes.json.accessToken;
    refreshCookie1 = getRefreshCookie(loginRes.cookies);
  });

  // ── T11: Logout isolation — session A revoked, session B valid ──
  console.log("\n─── Logout Isolation ───\n");

  // Register fresh user for logout isolation to avoid rate limit interference
  await fetchJson("/api/v1/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Iso User", email: testEmail3, password: testPassword, organizationName: "Iso Org" }),
  });

  await testAsync("logout of session A does not revoke session B", async () => {
    const loginA = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail3, password: testPassword }),
    });
    const accessA = loginA.json.accessToken;
    const cookieA = getRefreshCookie(loginA.cookies);
    assert.ok(cookieA, "session A cookie must exist");

    const loginB = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail3, password: testPassword }),
    });
    const accessB = loginB.json.accessToken;
    const cookieB = getRefreshCookie(loginB.cookies);
    assert.ok(cookieB, "session B cookie must exist");

    // Logout session A
    const logoutRes = await fetchJson("/api/v1/auth/logout", {
      method: "POST",
      headers: { authorization: `Bearer ${accessA}` },
    });
    assert.equal(logoutRes.status, 204, `Expected 204, got ${logoutRes.status}`);

    // Session A refresh should fail
    const refreshA = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "x-csrf": "1", cookie: `refresh_token=${cookieA.token}` },
    });
    assert.equal(refreshA.status, 401, "session A refresh should fail after logout");

    // Session B refresh must succeed
    const refreshB = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "x-csrf": "1", cookie: `refresh_token=${cookieB.token}` },
    });
    assert.equal(refreshB.status, 200, "session B refresh must still work");

    // Session B access must still work
    const meRes = await fetchJson("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${accessB}` },
    });
    assert.equal(meRes.status, 200, "session B access must still work");

    accessToken1 = refreshB.json.accessToken;
    refreshCookie1 = getRefreshCookie(refreshB.cookies);
    org1Id = refreshB.json.activeOrg;
  });

  // ── T13: switch-org without active binding → 403 AUTHZ_DENIED ──
  console.log("\n─── Switch Org ───\n");

  await testAsync("switch-org without active binding returns 403", async () => {
    const fakeOrgId = "00000000-0000-0000-0000-000000000000";
    const { status } = await fetchJson("/api/v1/auth/switch-org", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken1}`,
      },
      body: JSON.stringify({ organizationId: fakeOrgId }),
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
  });

  // ── T14: switch-org does not rotate refresh ──
  await testAsync("switch-org does not rotate refresh token", async () => {
    const oldCookie = refreshCookie1.token;
    const { status, json } = await fetchJson("/api/v1/auth/switch-org", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken1}`,
      },
      body: JSON.stringify({ organizationId: org1Id }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
    assert.ok(json.accessToken, "should return new access token");
    // Refresh token should still be usable (not rotated)
    const refreshRes = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "x-csrf": "1", cookie: `refresh_token=${oldCookie}` },
    });
    assert.equal(refreshRes.status, 200, "refresh should still work after switch-org");
    refreshCookie1 = getRefreshCookie(refreshRes.cookies);
    accessToken1 = refreshRes.json.accessToken;
  });

  // ── JWT hardening tests ──
  console.log("\n─── JWT Hardening ───\n");

  await testAsync("JWT with alg:none is rejected", async () => {
    const noneToken = makeNoneAlgToken({ sub: user1Id, sid: "fake", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 });
    const { status } = await fetchJson("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${noneToken}` },
    });
    assert.equal(status, 401, `Expected 401 for alg:none, got ${status}`);
  });

  const jwtSecret = loadDotEnv(repoRoot()).JWT_SECRET || "dev-jwt-secret-key-not-for-production-use";

  await testAsync("JWT with invalid iss is rejected", async () => {
    const badToken = makeBadIssToken(jwtSecret, { sub: user1Id, sid: "fake", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, iss: "wrong-issuer", aud: "nexos-api" });
    const { status } = await fetchJson("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${badToken}` },
    });
    assert.equal(status, 401, `Expected 401 for bad iss, got ${status}`);
  });

  await testAsync("JWT with invalid aud is rejected", async () => {
    const badToken = makeBadAudToken(jwtSecret, { sub: user1Id, sid: "fake", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, iss: "nexos-booking", aud: "wrong-audience" });
    const { status } = await fetchJson("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${badToken}` },
    });
    assert.equal(status, 401, `Expected 401 for bad aud, got ${status}`);
  });

  // ── Negative tests: body/header cannot force org ──
  console.log("\n─── Negative Tests ───\n");

  await testAsync("organization_id in body does not alter response", async () => {
    const res = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail3, password: testPassword, organizationId: "00000000-0000-0000-0000-000000000000" }),
    });
    assert.equal(res.status, 200);
    assert.notEqual(res.json.activeOrg, "00000000-0000-0000-0000-000000000000");
    // Also verify cookie flags from this login
    const cookie = getRefreshCookie(res.cookies);
    assert.ok(cookie, "cookie should exist");
    assert.equal(cookie.httpOnly, true, "cookie must be httpOnly");
    assert.equal(cookie.secure, true, "cookie must be Secure");
    assert.equal(cookie.sameSite, "Strict", "cookie must be SameSite=Strict");
    assert.equal(cookie.path, "/api/v1/auth/refresh", "cookie path must be /api/v1/auth/refresh");
  });

  // ── Log scrub: no tokens/sensitive data in stderr ──
  await testAsync("logs do not contain refresh tokens", async () => {
    const stderr = api.getStderr();
    const found = stderr.includes("refresh_token");
    assert.ok(!found, "stderr must not contain refresh_token");
  });

  await testAsync("logs do not contain access tokens", async () => {
    const stderr = api.getStderr();
    assert.ok(!stderr.includes("eyJ"), "stderr must not contain JWT tokens");
  });

  // ── Error envelope ──
  await testAsync("auth errors use standard error envelope", async () => {
    const { status, json } = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `error-envelope-${Date.now()}@example.com`, password: "wrong" }),
    });
    assert.equal(status, 401);
    assert.ok(json?.error, "should have error envelope");
    assert.ok(json.error.code, "should have error code");
    assert.ok(json.error.requestId, "should have requestId");
  });

  // ── T14b: NO_ACTIVE_ORG — token without org on tenant-scoped route ──
  console.log("\n─── NO_ACTIVE_ORG ───\n");

  await testAsync("tenant-scoped route without org returns 403", async () => {
    const { status, json } = await fetchJson("/__test/tenant-required", {
      headers: { authorization: `Bearer ${multiOrgAccessToken}` },
    });
    assert.equal(status, 403, `Expected 403, got ${status}`);
    assert.ok(json?.error, "should use error envelope");
  });

  await testAsync("tenant-scoped route with org succeeds", async () => {
    const res = await fetchJson("/api/v1/auth/switch-org", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${multiOrgAccessToken}`,
      },
      body: JSON.stringify({ organizationId: org2Id }),
    });
    assert.equal(res.status, 200, `Expected switch-org 200, got ${res.status}`);
    const orgAccess = res.json.accessToken;
    assert.ok(orgAccess, "switch-org should return access token");
    const { status } = await fetchJson("/__test/tenant-required", {
      headers: { authorization: `Bearer ${orgAccess}` },
    });
    assert.equal(status, 200, `Expected 200, got ${status}`);
  });

  // ── Expired access token ──
  console.log("\n─── Expired Token ───\n");

  await testAsync("expired access token returns 401", async () => {
    const jwtSecret = loadDotEnv(repoRoot()).JWT_SECRET || "dev-jwt-secret-key-not-for-production-use";
    const expiredToken = makeExpiredToken(jwtSecret, {
      sub: user1Id, sid: "fake-sid", iat: Math.floor(Date.now()/1000) - 7200,
      iss: "nexos-booking", aud: "nexos-api",
    });
    const { status } = await fetchJson("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${expiredToken}` },
    });
    assert.equal(status, 401, `Expected 401, got ${status}`);
  });

  // ── Refresh concurrency ──
  console.log("\n─── Refresh Concurrency ───\n");

  await testAsync("concurrent refresh with same token: only one succeeds", async () => {
    // Use existing refresh cookie from T16 to avoid additional logins
    const token = refreshCookie1?.token;
    assert.ok(token, "need a valid refresh token");

    const [r1, r2] = await Promise.all([
      fetchJson("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "x-csrf": "1", cookie: `refresh_token=${token}` },
      }),
      fetchJson("/api/v1/auth/refresh", {
        method: "POST",
        headers: { "x-csrf": "1", cookie: `refresh_token=${token}` },
      }),
    ]);

    const successes = [r1, r2].filter((r) => r.status === 200);
    assert.ok(successes.length <= 1, `Expected ≤1 success, got ${successes.length}`);
    if (successes.length === 1) {
      accessToken1 = successes[0].json.accessToken;
      refreshCookie1 = getRefreshCookie(successes[0].cookies);
    }
  });

  // ── Cookie parser edge cases ──
  console.log("\n─── Cookie Parser ───\n");

  await testAsync("refresh with absent cookie returns 401", async () => {
    const { status } = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "x-csrf": "1" },
    });
    assert.equal(status, 401, "missing cookie should return 401");
  });

  await testAsync("refresh with malformed cookie header", async () => {
    const { status } = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "x-csrf": "1", cookie: "garbage;;;" },
    });
    assert.equal(status, 401, "malformed cookie should return 401");
  });

  await testAsync("refresh with empty refresh token value", async () => {
    const { status } = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "x-csrf": "1", cookie: "refresh_token=" },
    });
    assert.equal(status, 401, "empty token should return 401");
  });

  await testAsync("cookie parser ignores unrelated cookies", async () => {
    const loginRes = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail3, password: testPassword }),
    });
    const cookie = getRefreshCookie(loginRes.cookies);
    assert.ok(cookie, "login should return refresh cookie");
    const { status } = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `other=value; refresh_token=${cookie.token}; ga=123`,
      },
    });
    assert.equal(status, 200, "refresh with extra cookies should work");
  });

  // ── DISABLED binding ──
  console.log("\n─── DISABLED Binding ───\n");

  await testAsync("switch-org to DISABLED binding returns 403", async () => {
    // Use existing accessToken1 from T14 (testEmail3 user with org1Id)
    const meRes = await fetchJson("/api/v1/auth/me", {
      headers: { authorization: `Bearer ${accessToken1}` },
    });
    const userId = meRes.json.user.id;
    const orgId = meRes.json.activeOrg;
    assert.ok(userId, "userId should exist");
    assert.ok(orgId, "orgId should exist");

    disableMembership(dbUser, dbPass, dbName, userId, orgId);

    // Token still has org claim from before DISABLED, so switch-org should re-validate
    const switchRes = await fetchJson("/api/v1/auth/switch-org", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken1}`,
      },
      body: JSON.stringify({ organizationId: orgId }),
    });
    assert.equal(switchRes.status, 403, `Expected 403, got ${switchRes.status}`);
  });

  // ── Password/cookie scrub in logs ──
  console.log("\n─── Log Scrub (password/cookie) ───\n");

  await testAsync("logs do not contain sentinel password", async () => {
    await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: TEST_SENTINEL_PASSWORD }),
    });
    const stderr = api.getStderr();
    assert.ok(!stderr.includes(TEST_SENTINEL_PASSWORD), "stderr must not contain sentinel password");
  });

  await testAsync("logs do not contain sentinel cookie value", async () => {
    await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "x-csrf": "1", cookie: `refresh_token=${TEST_SENTINEL_COOKIE}; other=val` },
    });
    const stderr = api.getStderr();
    assert.ok(!stderr.includes(TEST_SENTINEL_COOKIE), "stderr must not contain sentinel cookie");
  });

  // ── Rate Limiter tests ──
  console.log("\n─── Rate Limiter ───\n");

  await testAsync("register rate limit (3/hour) returns 429 RATE_LIMITED with Retry-After", async () => {
    const baseEmail = `ratelimit-${Date.now()}@example.com`;
    for (let i = 0; i < 3; i++) {
      await fetchJson("/api/v1/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `R${i}`, email: `${i}-${baseEmail}`, password: testPassword, organizationName: `O${i}` }),
      });
    }
    const { status, json, headers } = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Blocked", email: `blocked-${baseEmail}`, password: testPassword, organizationName: "Blocked" }),
    });
    assert.equal(status, 429, `Expected 429, got ${status}`);
    assert.equal(json?.error?.code, "RATE_LIMITED", "error.code must be RATE_LIMITED");
    assert.ok(headers["retry-after"], "Retry-After header must be present");
  });

  await testAsync("login email rate limit (5/min) returns 429 RATE_LIMITED with Retry-After", async () => {
    const limitEmail = `login-limit-${Date.now()}@example.com`;
    for (let i = 0; i < 5; i++) {
      await fetchJson("/api/v1/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: limitEmail, password: "wrong" }),
      });
    }
    const { status, json, headers } = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: limitEmail, password: "wrong" }),
    });
    assert.equal(status, 429, `Expected 429, got ${status}`);
    assert.equal(json?.error?.code, "RATE_LIMITED", "error.code must be RATE_LIMITED");
    assert.ok(headers["retry-after"], "Retry-After header must be present");
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

// ═══════════════════════════════════════════════════════════════
// Helper: check password hash in DB
// ═══════════════════════════════════════════════════════════════

function checkPasswordHash(userId) {
  const dotEnv = loadDotEnv(repoRoot());
  const pw = dotEnv.POSTGRES_PASSWORD ?? "nexos_booking_local_password";
  const user = dotEnv.POSTGRES_USER ?? "nexos_booking";
  const db = dotEnv.POSTGRES_DB ?? "nexos_booking";
  const result = execSync(
    `docker compose exec -T -e PGPASSWORD="${pw}" postgres psql -t -U "${user}" -d "${db}" -c "SELECT password_hash FROM users WHERE id = '${userId}';"`,
    { cwd: repoRoot(), encoding: "utf8" },
  );
  return result.trim();
}
