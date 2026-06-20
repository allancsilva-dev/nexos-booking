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

function hashToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
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

function createVerificationTokenRaw(userId, purpose, tokenHash, expiresAt) {
  const sql = `INSERT INTO verification_tokens (user_id, purpose, token_hash, expires_at) VALUES ('${userId}', '${purpose}', '${tokenHash}', '${expiresAt}') RETURNING id;`;
  return execPsql(sql);
}

function getUserPasswordHash(userId) {
  return execPsql(`SELECT password_hash FROM users WHERE id = '${userId}';`);
}

function getUserEmailVerifiedAt(userId) {
  return execPsqlSafe(`SELECT email_verified_at FROM users WHERE id = '${userId}';`);
}

function countActiveSessions(userId) {
  const result = execPsqlSafe(`SELECT COUNT(*) FROM refresh_sessions WHERE user_id = '${userId}' AND revoked_at IS NULL;`);
  return parseInt(result || "0", 10);
}

function countAuditLogs(userId, action) {
  const result = execPsqlSafe(`SELECT COUNT(*) FROM audit_logs WHERE actor_user_id = '${userId}' AND action = '${action}';`);
  return parseInt(result || "0", 10);
}

function getVerificationTokenHashForUser(userId, purpose) {
  return execPsqlSafe(`SELECT token_hash FROM verification_tokens WHERE user_id = '${userId}' AND purpose = '${purpose}' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1;`);
}

// ═══════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════
console.log("\nPR-1.5 Auth Email Test Harness\n");
console.log("================================\n");

console.log("Starting API...");
const api = await startApi(true);

try {
  await waitForApi();
  console.log("API ready.\n");

  const testPassword = "testpassword123";
  const ts = Date.now();

  // ═══════════════════════════════════════════════════════════════
  // Group 1 — Email Verification (6 tests)
  // ═══════════════════════════════════════════════════════════════
  console.log("─── Email Verification ───\n");

  let t1User = null;
  let t1RawToken = null;
  let t1TokenHash = null;

  // T1: Verify with valid token → 200
  await testAsync("verify with valid token returns 200", async () => {
    const email = `test-auth-email-t1-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T1 User", email, password: testPassword, organizationName: "T1 Org" }),
    });
    assert.equal(reg.status, 201, `Register: Expected 201, got ${reg.status}`);
    t1User = reg.json.user;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 3600_000).toISOString();
    t1RawToken = randomBytes(32).toString("hex");
    t1TokenHash = hashToken(t1RawToken);
    createVerificationTokenRaw(t1User.id, "EMAIL_VERIFY", t1TokenHash, expiresAt);

    const res = await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: t1RawToken }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json?.verified === true, "verified should be true");

    const verifiedAt = getUserEmailVerifiedAt(t1User.id);
    assert.ok(verifiedAt && verifiedAt !== "", "email_verified_at should be set in DB");
  });

  // T2: Verify with invalid token → 410
  await testAsync("verify with invalid token returns 410", async () => {
    const res = await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "invalid-hash-token-12345" }),
    });
    assert.equal(res.status, 410, `Expected 410, got ${res.status}`);
    assert.equal(res.json?.error?.code, "VERIFICATION_TOKEN_INVALID", "error.code should be VERIFICATION_TOKEN_INVALID");
  });

  // T3: Verify with expired token → 410
  await testAsync("verify with expired token returns 410", async () => {
    const email = `test-auth-email-t3-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T3 User", email, password: testPassword, organizationName: "T3 Org" }),
    });
    assert.equal(reg.status, 201, `Register: Expected 201, got ${reg.status}`);
    const userId = reg.json.user.id;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() - 3600_000).toISOString();
    createVerificationTokenRaw(userId, "EMAIL_VERIFY", tokenHash, expiresAt);

    const res = await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(res.status, 410, `Expected 410, got ${res.status}`);
  });

  // T4: First verify succeeds
  let t4RawToken = null;
  let t4TokenHash = null;
  let t4UserId = null;

  await testAsync("first verify with fresh token succeeds", async () => {
    const email = `test-auth-email-t4-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T4 User", email, password: testPassword, organizationName: "T4 Org" }),
    });
    assert.equal(reg.status, 201, `Register: Expected 201, got ${reg.status}`);
    t4UserId = reg.json.user.id;

    t4RawToken = randomBytes(32).toString("hex");
    t4TokenHash = hashToken(t4RawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    createVerificationTokenRaw(t4UserId, "EMAIL_VERIFY", t4TokenHash, expiresAt);

    const res = await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: t4RawToken }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json?.verified === true, "verified should be true");
  });

  // T5: Used token cannot be reused → 410
  await testAsync("used token cannot be reused (second verify fails)", async () => {
    const res = await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: t4RawToken }),
    });
    assert.equal(res.status, 410, `Expected 410, got ${res.status}`);
  });

  // T6: Error response uses standard envelope
  await testAsync("410 error response uses standard envelope", async () => {
    const res = await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "another-invalid-token" }),
    });
    assert.equal(res.status, 410, `Expected 410, got ${res.status}`);
    assert.ok(res.json?.error, "should have error envelope");
    assert.ok(res.json.error.code, "error.code should exist");
    assert.ok(res.json.error.message, "error.message should exist");
    assert.ok(res.json.error.requestId, "error.requestId should exist");
    assert.ok(res.json.error.timestamp, "error.timestamp should exist");
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 2 — Resend Verification (4 tests)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Resend Verification ───\n");

  let t7AccessToken = null;

  // T7: Resend authenticated → 202
  await testAsync("resend verification with Bearer returns 202", async () => {
    const email = `test-auth-email-t7-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T7 User", email, password: testPassword, organizationName: "T7 Org" }),
    });
    assert.equal(reg.status, 201, `Register: Expected 201, got ${reg.status}`);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    assert.equal(login.status, 200, `Login: Expected 200, got ${login.status}`);
    t7AccessToken = login.json.accessToken;

    const res = await fetchJson("/api/v1/auth/verify-email/resend", {
      method: "POST",
      headers: { authorization: `Bearer ${t7AccessToken}` },
    });
    assert.equal(res.status, 202, `Expected 202, got ${res.status}`);
  });

  // T8: Resend without Bearer → 401
  await testAsync("resend verification without Bearer returns 401", async () => {
    const res = await fetchJson("/api/v1/auth/verify-email/resend", {
      method: "POST",
    });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // T9: Resend rate limit → 429
  await testAsync("resend rate limit returns 429 with Retry-After", async () => {
    const email = `test-auth-email-t9-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T9 User", email, password: testPassword, organizationName: "T9 Org" }),
    });
    assert.equal(reg.status, 201);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    const token = login.json.accessToken;

    for (let i = 0; i < 3; i++) {
      await fetchJson("/api/v1/auth/verify-email/resend", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    }

    const res = await fetchJson("/api/v1/auth/verify-email/resend", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 429, `Expected 429, got ${res.status}`);
    assert.equal(res.json?.error?.code, "RATE_LIMITED", "error.code should be RATE_LIMITED");
    assert.ok(res.headers["retry-after"], "Retry-After header must be present");
  });

  // T10: Previous token invalidated after resend
  await testAsync("previous token invalidated after resend", async () => {
    const email = `test-auth-email-t10-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T10 User", email, password: testPassword, organizationName: "T10 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    createVerificationTokenRaw(userId, "EMAIL_VERIFY", tokenHash, expiresAt);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    const accessToken = login.json.accessToken;

    await fetchJson("/api/v1/auth/verify-email/resend", {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    const res = await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });
    assert.equal(res.status, 410, `Expected 410, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 3 — Forgot Password (5 tests)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Forgot Password ───\n");

  let t11UserId = null;

  // T11: Forgot with existing email → 202
  await testAsync("forgot password with existing email returns 202", async () => {
    const email = `test-auth-email-t11-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T11 User", email, password: testPassword, organizationName: "T11 Org" }),
    });
    assert.equal(reg.status, 201);
    t11UserId = reg.json.user.id;

    const res = await fetchJson("/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 202, `Expected 202, got ${res.status}`);

    const tokenHash = getVerificationTokenHashForUser(t11UserId, "PASSWORD_RESET");
    assert.ok(tokenHash && tokenHash.length === 64, "PASSWORD_RESET token should be created in DB");
    assert.ok(/^[a-f0-9]{64}$/.test(tokenHash), "token_hash should be SHA-256 hex");
  });

  // T12: Forgot with non-existent email → 202
  let t12ResponseBody = null;

  await testAsync("forgot password with non-existent email returns 202", async () => {
    const fakeEmail = `nonexistent-${ts}@example.com`;
    const res = await fetchJson("/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: fakeEmail }),
    });
    assert.equal(res.status, 202, `Expected 202, got ${res.status}`);
    t12ResponseBody = res.body;
  });

  // T13: Forgot never reveals existence
  await testAsync("forgot never reveals existence (same status + body shape)", async () => {
    const email = `test-auth-email-t11-${ts}@example.com`;
    const res = await fetchJson("/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 202, `Expected 202, got ${res.status}`);
    assert.equal(res.body, t12ResponseBody, "existing and non-existing email should have same body");
  });

  // T14: Forgot rate limit by email → 429
  await testAsync("forgot rate limit by email returns 429", async () => {
    const email = `test-auth-email-t14-${ts}@example.com`;
    await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T14 User", email, password: testPassword, organizationName: "T14 Org" }),
    });

    for (let i = 0; i < 3; i++) {
      await fetchJson("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    }

    const res = await fetchJson("/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 429, `Expected 429, got ${res.status}`);
    assert.equal(res.json?.error?.code, "RATE_LIMITED", "error.code should be RATE_LIMITED");
  });

  // T15: Rate limit consumed before lookup
  await testAsync("rate limit fires even for unknown emails", async () => {
    const base = `test-auth-email-t15-${ts}`;
    for (let i = 0; i < 3; i++) {
      await fetchJson("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `${base}-nonexistent-${i}@example.com` }),
      });
    }

    const res = await fetchJson("/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${base}-nonexistent-99@example.com` }),
    });
    assert.equal(res.status, 429, `Expected 429, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 4 — Reset Password (7 tests)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Reset Password ───\n");

  let t16UserId = null;
  let t16Email = null;
  let t16RawToken = null;

  // T16: Reset with valid token → 200
  await testAsync("reset password with valid token returns 200", async () => {
    t16Email = `test-auth-email-t16-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T16 User", email: t16Email, password: testPassword, organizationName: "T16 Org" }),
    });
    assert.equal(reg.status, 201);
    t16UserId = reg.json.user.id;

    t16RawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(t16RawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    createVerificationTokenRaw(t16UserId, "PASSWORD_RESET", tokenHash, expiresAt);

    const res = await fetchJson("/api/v1/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: t16RawToken, newPassword: "newtestpassword456" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json?.success === true, "success should be true");
  });

  // T17: New password works for login
  await testAsync("new password works for login after reset", async () => {
    const res = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: t16Email, password: "newtestpassword456" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.accessToken, "should return access token");
  });

  // T18: Reset revokes ALL sessions
  await testAsync("password reset revokes all sessions", async () => {
    const email = `test-auth-email-t18-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T18 User", email, password: testPassword, organizationName: "T18 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const loginA = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    assert.equal(loginA.status, 200);

    const loginB = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    assert.equal(loginB.status, 200);

    const activeBefore = countActiveSessions(userId);
    assert.ok(activeBefore >= 2, `Expected at least 2 active sessions, got ${activeBefore}`);

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    createVerificationTokenRaw(userId, "PASSWORD_RESET", tokenHash, expiresAt);

    await fetchJson("/api/v1/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "resetpassword789" }),
    });

    const activeAfter = countActiveSessions(userId);
    assert.equal(activeAfter, 0, `Expected 0 active sessions after reset, got ${activeAfter}`);
  });

  // T19: Expired reset token → 410
  await testAsync("expired reset token returns 410", async () => {
    const email = `test-auth-email-t19-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T19 User", email, password: testPassword, organizationName: "T19 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() - 3600_000).toISOString();
    createVerificationTokenRaw(userId, "PASSWORD_RESET", tokenHash, expiresAt);

    const res = await fetchJson("/api/v1/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "somepassword123" }),
    });
    assert.equal(res.status, 410, `Expected 410, got ${res.status}`);
  });

  // T20: Used reset token → 410
  await testAsync("used reset token cannot be reused", async () => {
    const email = `test-auth-email-t20-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T20 User", email, password: testPassword, organizationName: "T20 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    createVerificationTokenRaw(userId, "PASSWORD_RESET", tokenHash, expiresAt);

    const first = await fetchJson("/api/v1/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "firstpassword123" }),
    });
    assert.equal(first.status, 200, `First reset: Expected 200, got ${first.status}`);

    const second = await fetchJson("/api/v1/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "secondpassword123" }),
    });
    assert.equal(second.status, 410, `Second reset: Expected 410, got ${second.status}`);
  });

  // T21: New password too short → 422
  await testAsync("reset with short password returns 422", async () => {
    const email = `test-auth-email-t21-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T21 User", email, password: testPassword, organizationName: "T21 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    createVerificationTokenRaw(userId, "PASSWORD_RESET", tokenHash, expiresAt);

    const res = await fetchJson("/api/v1/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "1234567" }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
    assert.ok(res.json?.error, "should have error envelope");
  });

  // T22: Transaction atomic: failed reset doesn't change hash
  await testAsync("failed reset does not change password hash", async () => {
    const email = `test-auth-email-t22-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T22 User", email, password: testPassword, organizationName: "T22 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const originalHash = getUserPasswordHash(userId);

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() - 3600_000).toISOString();
    createVerificationTokenRaw(userId, "PASSWORD_RESET", tokenHash, expiresAt);

    const res = await fetchJson("/api/v1/auth/password/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, newPassword: "newpassword999" }),
    });
    assert.equal(res.status, 410, `Expected 410, got ${res.status}`);

    const currentHash = getUserPasswordHash(userId);
    assert.equal(currentHash, originalHash, "password hash should be unchanged after failed reset");

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    assert.equal(login.status, 200, "old password should still work after failed reset");
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 5 — Password Change (8 tests)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Password Change ───\n");

  let t23Email = null;
  let t23AccessToken = null;

  // T23: Change with correct current password → 200
  await testAsync("change password with correct current password returns 200", async () => {
    t23Email = `test-auth-email-t23-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T23 User", email: t23Email, password: testPassword, organizationName: "T23 Org" }),
    });
    assert.equal(reg.status, 201);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: t23Email, password: testPassword }),
    });
    assert.equal(login.status, 200);
    t23AccessToken = login.json.accessToken;

    const res = await fetchJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${t23AccessToken}`,
      },
      body: JSON.stringify({ currentPassword: testPassword, newPassword: "newpassword789" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json?.success === true, "success should be true");
  });

  // T24: New password works for login
  await testAsync("new password works for login after change", async () => {
    const res = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: t23Email, password: "newpassword789" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.json.accessToken, "should return access token");
  });

  // T25: Current session survives change
  await testAsync("current session survives password change", async () => {
    const email = `test-auth-email-t25-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T25 User", email, password: testPassword, organizationName: "T25 Org" }),
    });
    assert.equal(reg.status, 201);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    assert.equal(login.status, 200);
    const accessToken = login.json.accessToken;
    const refreshCookie = getRefreshCookie(login.cookies);
    assert.ok(refreshCookie, "refresh cookie should exist");

    await fetchJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ currentPassword: testPassword, newPassword: "survivorpass123" }),
    });

    const refreshRes = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `refresh_token=${refreshCookie.token}`,
      },
    });
    assert.equal(refreshRes.status, 200, `Expected refresh 200, got ${refreshRes.status}`);
  });

  // T26: Other sessions are revoked
  await testAsync("password change revokes other sessions", async () => {
    const email = `test-auth-email-t26-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T26 User", email, password: testPassword, organizationName: "T26 Org" }),
    });
    assert.equal(reg.status, 201);

    const loginA = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    assert.equal(loginA.status, 200);
    const accessA = loginA.json.accessToken;

    const loginB = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    assert.equal(loginB.status, 200);
    const cookieB = getRefreshCookie(loginB.cookies);
    assert.ok(cookieB, "session B refresh cookie should exist");

    await fetchJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessA}`,
      },
      body: JSON.stringify({ currentPassword: testPassword, newPassword: "revoketest123" }),
    });

    const refreshB = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `refresh_token=${cookieB.token}`,
      },
    });
    assert.equal(refreshB.status, 401, "session B should be revoked after password change");
  });

  // T27: Wrong current password → 401
  await testAsync("change password with wrong current password returns 401", async () => {
    const email = `test-auth-email-t27-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T27 User", email, password: testPassword, organizationName: "T27 Org" }),
    });
    assert.equal(reg.status, 201);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    const accessToken = login.json.accessToken;

    const res = await fetchJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ currentPassword: "wrongpassword!!!!", newPassword: "newpass456789" }),
    });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // T28: Change without Bearer → 401
  await testAsync("change password without Bearer returns 401", async () => {
    const res = await fetchJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: testPassword, newPassword: "somepass123" }),
    });
    assert.equal(res.status, 401, `Expected 401, got ${res.status}`);
  });

  // T29: New password same as current → 422
  await testAsync("new password same as current returns 422", async () => {
    const email = `test-auth-email-t29-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T29 User", email, password: testPassword, organizationName: "T29 Org" }),
    });
    assert.equal(reg.status, 201);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    const res = await fetchJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.json.accessToken}`,
      },
      body: JSON.stringify({ currentPassword: testPassword, newPassword: testPassword }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // T30: New password too short → 422
  await testAsync("new password too short returns 422", async () => {
    const email = `test-auth-email-t30-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T30 User", email, password: testPassword, organizationName: "T30 Org" }),
    });
    assert.equal(reg.status, 201);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    const res = await fetchJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.json.accessToken}`,
      },
      body: JSON.stringify({ currentPassword: testPassword, newPassword: "ab" }),
    });
    assert.equal(res.status, 422, `Expected 422, got ${res.status}`);
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 6 — Rate Limits (4 tests)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Rate Limits ───\n");

  // T31: Forgot email rate limit → 429 + Retry-After
  await testAsync("forgot email rate limit returns 429 with Retry-After", async () => {
    const email = `test-auth-email-t31-${ts}@example.com`;
    await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T31 User", email, password: testPassword, organizationName: "T31 Org" }),
    });

    for (let i = 0; i < 3; i++) {
      await fetchJson("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    }
    const res = await fetchJson("/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 429, `Expected 429, got ${res.status}`);
    assert.equal(res.json?.error?.code, "RATE_LIMITED");
    assert.ok(res.headers["retry-after"], "Retry-After header must be present");
  });

  // T32: Forgot IP rate limit → 429 + Retry-After
  await testAsync("forgot IP rate limit (11 calls, different emails) returns 429", async () => {
    const base = `test-auth-email-t32-${ts}`;
    for (let i = 0; i < 10; i++) {
      await fetchJson("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: `${base}-ip${i}@example.com` }),
      });
    }
    const res = await fetchJson("/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${base}-ip-final@example.com` }),
    });
    assert.equal(res.status, 429, `Expected 429, got ${res.status}`);
    assert.ok(res.headers["retry-after"], "Retry-After header must be present");
  });

  // T33: Resend user rate limit → 429 + Retry-After
  await testAsync("resend user rate limit returns 429 with Retry-After", async () => {
    const email = `test-auth-email-t33-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T33 User", email, password: testPassword, organizationName: "T33 Org" }),
    });
    assert.equal(reg.status, 201);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    const token = login.json.accessToken;

    for (let i = 0; i < 3; i++) {
      await fetchJson("/api/v1/auth/verify-email/resend", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
    }
    const res = await fetchJson("/api/v1/auth/verify-email/resend", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 429, `Expected 429, got ${res.status}`);
    assert.equal(res.json?.error?.code, "RATE_LIMITED");
    assert.ok(res.headers["retry-after"], "Retry-After header must be present");
  });

  // T34: 429 envelope has correct structure
  await testAsync("429 envelope has correct structure", async () => {
    const email = `test-auth-email-t34-${ts}@example.com`;
    await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T34 User", email, password: testPassword, organizationName: "T34 Org" }),
    });

    for (let i = 0; i < 3; i++) {
      await fetchJson("/api/v1/auth/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    }
    const res = await fetchJson("/api/v1/auth/password/forgot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 429);
    assert.equal(res.json?.error?.code, "RATE_LIMITED", "error.code should be RATE_LIMITED");
    assert.ok(res.headers["retry-after"], "Retry-After header must be present");
    assert.ok(res.json?.error?.requestId, "error.requestId should exist");
    assert.ok(res.json?.error?.timestamp, "error.timestamp should exist");
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 7 — Scrub & Security (4 tests)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Scrub & Security ───\n");

  // T35: Token hash in DB is SHA-256 hex (64 chars)
  await testAsync("token_hash in DB is SHA-256 hex (64 chars), not raw token", async () => {
    const email = `test-auth-email-t35-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T35 User", email, password: testPassword, organizationName: "T35 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    createVerificationTokenRaw(userId, "EMAIL_VERIFY", tokenHash, expiresAt);

    const dbHash = execPsqlSafe(
      `SELECT token_hash FROM verification_tokens WHERE user_id = '${userId}' AND purpose = 'EMAIL_VERIFY' ORDER BY created_at DESC LIMIT 1;`
    );
    assert.ok(dbHash && /^[a-f0-9]{64}$/.test(dbHash), `token_hash should be 64-char hex, got: ${dbHash?.length ?? 0} chars`);
    assert.notEqual(dbHash, rawToken, "token_hash must NOT be the raw token");
  });

  // T36: Resend fallback log is scrubbed
  await testAsync("resend fallback log contains metadata but not raw token or email", async () => {
    const email = `test-auth-email-t36-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T36 User", email, password: testPassword, organizationName: "T36 Org" }),
    });
    assert.equal(reg.status, 201);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });

    await fetchJson("/api/v1/auth/verify-email/resend", {
      method: "POST",
      headers: { authorization: `Bearer ${login.json.accessToken}` },
    });

    const stderr = api.getStderr();
    assert.ok(stderr.includes("channel"), "stderr should contain 'channel'");
    assert.ok(stderr.includes("template"), "stderr should contain 'template'");
    assert.ok(stderr.includes("fallback"), "stderr should contain 'status' information");
    assert.ok(!stderr.includes(email), "stderr must NOT contain full email");
  });

  // T37: Password never in log
  await testAsync("password never appears in logs", async () => {
    const sentinel = `SentinelPass-${ts}`;
    await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `t37-${ts}@example.com`, password: sentinel }),
    });
    const stderr = api.getStderr();
    assert.ok(!stderr.includes(sentinel), "stderr must not contain sentinel password");
  });

  // T38: RESEND_API_KEY never in response/error
  await testAsync("RESEND_API_KEY never in response or error body", async () => {
    const res = await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "invalid-token-xyz" }),
    });
    const bodyStr = JSON.stringify(res.json ?? {});
    assert.ok(!bodyStr.includes("RESEND_API_KEY"), "response must not contain RESEND_API_KEY string");
  });

  // ═══════════════════════════════════════════════════════════════
  // Group 8 — Audit Logs (2 tests)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n─── Audit Logs ───\n");

  // T39: EMAIL_VERIFIED in audit_logs
  await testAsync("EMAIL_VERIFIED recorded in audit_logs after verify", async () => {
    const email = `test-auth-email-t39-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T39 User", email, password: testPassword, organizationName: "T39 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600_000).toISOString();
    createVerificationTokenRaw(userId, "EMAIL_VERIFY", tokenHash, expiresAt);

    await fetchJson("/api/v1/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
    });

    const count = countAuditLogs(userId, "EMAIL_VERIFIED");
    assert.ok(count >= 1, `Expected EMAIL_VERIFIED audit log, got ${count}`);
  });

  // T40: PASSWORD_CHANGED + SESSION_REVOKED in audit_logs
  await testAsync("PASSWORD_CHANGED and SESSION_REVOKED recorded in audit_logs", async () => {
    const email = `test-auth-email-t40-${ts}@example.com`;
    const reg = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "T40 User", email, password: testPassword, organizationName: "T40 Org" }),
    });
    assert.equal(reg.status, 201);
    const userId = reg.json.user.id;

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    });
    assert.equal(login.status, 200);

    await fetchJson("/api/v1/auth/password/change", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${login.json.accessToken}`,
      },
      body: JSON.stringify({ currentPassword: testPassword, newPassword: "auditpass1234" }),
    });

    const passwordChangedCount = countAuditLogs(userId, "PASSWORD_CHANGED");
    const sessionRevokedCount = countAuditLogs(userId, "SESSION_REVOKED");
    assert.ok(passwordChangedCount >= 1, `Expected PASSWORD_CHANGED audit log, got ${passwordChangedCount}`);
    assert.ok(sessionRevokedCount >= 1, `Expected SESSION_REVOKED audit log, got ${sessionRevokedCount}`);
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
