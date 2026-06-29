import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { Pool } from "pg";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const apiDir = path.resolve(new URL("../", import.meta.url).pathname);
const port = String(3600 + Math.floor(Math.random() * 200));
const BASE = `http://127.0.0.1:${port}`;

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
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }

  return result;
}

function buildDbEnv() {
  const dotEnv = loadDotEnv(repoRoot);
  const host = process.env.POSTGRES_HOST ?? dotEnv.POSTGRES_HOST ?? "127.0.0.1";
  const portValue = process.env.POSTGRES_PORT ?? dotEnv.POSTGRES_PORT ?? "5432";
  const db = process.env.POSTGRES_DB ?? dotEnv.POSTGRES_DB ?? "nexos_booking";
  const adminUser = process.env.POSTGRES_USER ?? dotEnv.POSTGRES_USER ?? "nexos_booking";
  const adminPass =
    process.env.POSTGRES_PASSWORD ??
    dotEnv.POSTGRES_PASSWORD ??
    "nexos_booking_local_password";
  const runtimeUser = process.env.APP_RUNTIME_USER ?? dotEnv.APP_RUNTIME_USER ?? "app_runtime";
  const runtimePass =
    process.env.APP_RUNTIME_PASSWORD ??
    dotEnv.APP_RUNTIME_PASSWORD ??
    adminPass;

  return {
    dotEnv,
    host,
    port: portValue,
    db,
    adminUser,
    adminPass,
    runtimeUser,
    runtimePass,
  };
}

function createPool(user, password) {
  const dbEnv = buildDbEnv();
  return new Pool({
    host: dbEnv.host,
    port: Number(dbEnv.port),
    database: dbEnv.db,
    user,
    password,
    max: 4,
  });
}

let registerIpCounter = 0;
// Each registration is a distinct user/org; give each its own source IP so the
// per-IP register rate limit (real, intentional) does not block the proof.
function registerHeaders(extra = {}) {
  registerIpCounter += 1;
  return {
    "content-type": "application/json",
    "x-forwarded-for": `203.0.113.${registerIpCounter}`,
    ...extra,
  };
}

function fetchJson(pathStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, BASE);
    const req = http.request(
      url,
      { method: opts.method ?? "GET", headers: opts.headers ?? {} },
      (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch { /* ignore */ }
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            json,
            cookies: res.headers["set-cookie"] ?? [],
          });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function waitForApi(timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchJson("/health");
      if (res.status === 200) return;
    } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("API did not start within timeout");
}

function startApi() {
  const dbEnv = buildDbEnv();
  const env = {
    ...process.env,
    ...dbEnv.dotEnv,
    PORT: port,
    NODE_ENV: "development",
    ENABLE_HTTP_TEST_HARNESS: "1",
    TRUST_PROXY_HOPS: "1",
    POSTGRES_HOST: dbEnv.host,
    POSTGRES_PORT: dbEnv.port,
    POSTGRES_DB: dbEnv.db,
    POSTGRES_USER: dbEnv.adminUser,
    POSTGRES_PASSWORD: dbEnv.adminPass,
    APP_RUNTIME_USER: dbEnv.runtimeUser,
    APP_RUNTIME_PASSWORD: dbEnv.runtimePass,
  };

  const tsxBin = path.resolve(apiDir, "node_modules/.bin/tsx");
  const proc = spawn(tsxBin, ["src/main.ts"], {
    cwd: apiDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  let stdout = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  proc.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  return {
    proc,
    getLogs: () => ({ stderr, stdout }),
  };
}

async function stopApi(api) {
  try {
    api.proc.kill("SIGTERM");
  } catch { /* ignore */ }

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    api.proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function getRefreshCookie(cookies) {
  for (const cookie of cookies) {
    const match = cookie.match(/^refresh_token=([^;]+)/u);
    if (match) {
      return {
        token: match[1],
        raw: cookie,
      };
    }
  }
  return null;
}

async function scalar(pool, query, params = []) {
  const result = await pool.query(query, params);
  const row = result.rows[0];
  return row ? Object.values(row)[0] : null;
}

async function inspectRuntimeRole(pool) {
  const result = await pool.query(
    "SELECT current_user AS current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  const row = result.rows[0];
  return {
    current_user: row.current_user,
    rolsuper: row.rolsuper,
    rolbypassrls: row.rolbypassrls,
  };
}

async function countUsersByEmail(pool, email) {
  return Number(
    await scalar(
      pool,
      "SELECT count(*)::int FROM users WHERE lower(email) = lower($1)",
      [email],
    ),
  );
}

async function countOrganizationsById(pool, orgId) {
  return Number(
    await scalar(pool, "SELECT count(*)::int FROM organizations WHERE id = $1", [
      orgId,
    ]),
  );
}

async function countOwnerMembership(pool, orgId, userId) {
  return Number(
    await scalar(
      pool,
      `SELECT count(*)::int
         FROM organization_users
        WHERE organization_id = $1
          AND user_id = $2
          AND role = 'OWNER'
          AND status = 'ACTIVE'`,
      [orgId, userId],
    ),
  );
}

async function countActiveRefreshSessions(pool, userId) {
  return Number(
    await scalar(
      pool,
      "SELECT count(*)::int FROM refresh_sessions WHERE user_id = $1 AND revoked_at IS NULL",
      [userId],
    ),
  );
}

async function withRuntimeContext(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    try {
      await client.query("ROLLBACK");
    } catch { /* ignore */ }
    client.release();
  }
}

async function main() {
  const ts = Date.now();
  const email = `register-runtime-${ts}@example.com`;
  const duplicateNameEmail = `register-runtime-dup-${ts}@example.com`;
  const outsiderEmail = `register-runtime-outsider-${ts}@example.com`;
  const failedEmail = `register-runtime-fail-${ts}@example.com`;
  const password = "testpassword123";
  const organizationName = `Register Runtime Org ${ts}`;

  const adminPool = createPool(buildDbEnv().adminUser, buildDbEnv().adminPass);
  const runtimePool = createPool(buildDbEnv().runtimeUser, buildDbEnv().runtimePass);
  const api = startApi();

  try {
    await waitForApi();

    const role = await inspectRuntimeRole(runtimePool);
    assert.equal(role.current_user, buildDbEnv().runtimeUser);
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);

    const invalid = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: registerHeaders(),
      body: JSON.stringify({
        name: "Bad Password",
        email: `invalid-${ts}@example.com`,
        password: "123",
        organizationName: "Invalid Org",
      }),
    });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.json?.error?.code, "VALIDATION_ERROR");
    assert.equal(invalid.json?.error?.details?.[0]?.field, "password");

    const register = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: registerHeaders(),
      body: JSON.stringify({
        name: "Register Runtime User",
        email,
        password,
        organizationName,
      }),
    });
    assert.equal(register.status, 201, register.body);
    assert.ok(register.json?.user?.id);
    assert.ok(register.json?.organization?.id);
    assert.ok(register.json?.organization?.slug);
    assert.ok(register.json?.accessToken);

    const refreshCookie = getRefreshCookie(register.cookies);
    assert.ok(refreshCookie, "register should set refresh cookie");

    const userId = register.json.user.id;
    const orgId = register.json.organization.id;
    const initialSlug = register.json.organization.slug;

    assert.equal(await countUsersByEmail(adminPool, email), 1);
    assert.equal(await countOrganizationsById(adminPool, orgId), 1);
    assert.equal(await countOwnerMembership(adminPool, orgId, userId), 1);
    assert.equal(await countActiveRefreshSessions(adminPool, userId), 1);

    const duplicateEmail = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: registerHeaders(),
      body: JSON.stringify({
        name: "Duplicate Email",
        email,
        password,
        organizationName: "Another Org",
      }),
    });
    assert.equal(duplicateEmail.status, 409);
    assert.equal(duplicateEmail.json?.error?.code, "EMAIL_TAKEN");

    const sameOrgName = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: registerHeaders(),
      body: JSON.stringify({
        name: "Second Org Owner",
        email: duplicateNameEmail,
        password,
        organizationName,
      }),
    });
    assert.equal(sameOrgName.status, 201, sameOrgName.body);
    assert.notEqual(
      sameOrgName.json?.organization?.slug,
      initialSlug,
      "slug collision should retry to a distinct slug",
    );

    const rollbackFailure = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: registerHeaders({
        "x-test-register-fail-after-user": "1",
      }),
      body: JSON.stringify({
        name: "Rollback User",
        email: failedEmail,
        password,
        organizationName: `Rollback Org ${ts}`,
      }),
    });
    assert.equal(rollbackFailure.status, 500);
    assert.equal(rollbackFailure.json?.error?.code, "INTERNAL_ERROR");
    assert.equal(await countUsersByEmail(adminPool, failedEmail), 0);

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200, login.body);
    assert.equal(login.json?.activeOrg, orgId);
    assert.ok(login.json?.accessToken);

    const loginRefreshCookie = getRefreshCookie(login.cookies);
    assert.ok(loginRefreshCookie, "login should set refresh cookie");

    const me = await fetchJson("/api/v1/auth/me", {
      headers: {
        authorization: `Bearer ${login.json.accessToken}`,
      },
    });
    assert.equal(me.status, 200, me.body);
    assert.equal(me.json?.activeOrg, orgId);

    const refreshDenied = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        cookie: `refresh_token=${loginRefreshCookie.token}`,
      },
    });
    assert.equal(refreshDenied.status, 403);
    assert.equal(refreshDenied.json?.error?.code, "AUTHZ_DENIED");

    const refreshOk = await fetchJson("/api/v1/auth/refresh", {
      method: "POST",
      headers: {
        "x-csrf": "1",
        cookie: `refresh_token=${loginRefreshCookie.token}`,
      },
    });
    assert.equal(refreshOk.status, 200, refreshOk.body);
    assert.equal(refreshOk.json?.activeOrg, orgId);
    assert.ok(refreshOk.json?.accessToken);

    const outsiderRegister = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: registerHeaders(),
      body: JSON.stringify({
        name: "Outsider Owner",
        email: outsiderEmail,
        password,
        organizationName: `Outsider Org ${ts}`,
      }),
    });
    assert.equal(outsiderRegister.status, 201, outsiderRegister.body);
    const outsiderToken = outsiderRegister.json.accessToken;
    const outsiderOrgId = outsiderRegister.json.organization.id;
    const outsiderMe = await fetchJson(`/api/v1/organizations/${orgId}`, {
      headers: { authorization: `Bearer ${outsiderToken}` },
    });
    assert.equal(outsiderMe.status, 404, outsiderMe.body);

    const noContextOrgRows = Number(
      await scalar(
        runtimePool,
        "SELECT count(*)::int FROM organizations WHERE id = $1",
        [orgId],
      ),
    );
    assert.equal(noContextOrgRows, 0);

    const wrongTenantRows = await withRuntimeContext(runtimePool, async (client) => {
      await client.query(
        "SELECT set_config('app.current_organization_id', $1, true)",
        [outsiderOrgId],
      );
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [outsiderRegister.json.user.id],
      );
      const result = await client.query(
        "SELECT count(*)::int FROM organizations WHERE id = $1",
        [orgId],
      );
      return Number(result.rows[0].count);
    });
    assert.equal(wrongTenantRows, 0);

    console.log(
      JSON.stringify(
        {
          proof: "auth-register-runtime",
          runtimeRole: role,
          register: {
            userId,
            organizationId: orgId,
            ownerMembership: true,
            refreshSessionCreated: true,
          },
          login: {
            activeOrg: login.json.activeOrg,
          },
          refresh: {
            withCsrf: refreshOk.status,
            withoutCsrf: refreshDenied.status,
          },
          negatives: {
            invalidPayload: invalid.status,
            duplicateEmail: duplicateEmail.status,
            slugCollisionHandled: sameOrgName.json.organization.slug,
            rollbackNoOrphanUser: true,
          },
          rls: {
            noContextOrgRows,
            wrongTenantRows,
            outsiderHttpStatus: outsiderMe.status,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await stopApi(api);
    await adminPool.end();
    await runtimePool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
