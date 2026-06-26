import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const apiDir = path.resolve(new URL("../", import.meta.url).pathname);
const port = String(3800 + Math.floor(Math.random() * 200));
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

let registerIpCounter = 10;

function registerHeaders() {
  registerIpCounter += 1;
  return {
    "content-type": "application/json",
    "x-forwarded-for": `203.0.113.${registerIpCounter}`,
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
          } catch {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            json,
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
    } catch {}
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
  } catch {}

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    api.proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function inspectRuntimeRole(pool) {
  const result = await pool.query(
    "SELECT current_user AS current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  return result.rows[0];
}

async function main() {
  const ts = Date.now();
  const password = "Password123!";
  const ownerEmail = `org-settings-owner-${ts}@example.com`;
  const outsiderEmail = `org-settings-outsider-${ts}@example.com`;
  const api = startApi();
  const dbEnv = buildDbEnv();
  const runtimePool = createPool(dbEnv.runtimeUser, dbEnv.runtimePass);

  try {
    await waitForApi();

    const role = await inspectRuntimeRole(runtimePool);
    assert.equal(role.current_user, dbEnv.runtimeUser);
    assert.equal(role.rolsuper, false);
    assert.equal(role.rolbypassrls, false);

    const ownerRegister = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: registerHeaders(),
      body: JSON.stringify({
        name: "Settings Owner",
        email: ownerEmail,
        password,
        organizationName: `Settings Org ${ts}`,
      }),
    });
    assert.equal(ownerRegister.status, 201, ownerRegister.body);

    const ownerToken = ownerRegister.json.accessToken;
    const ownerOrgId = ownerRegister.json.organization.id;
    const ownerUserId = ownerRegister.json.user.id;

    const me = await fetchJson("/api/v1/auth/me", {
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(me.status, 200, me.body);
    assert.equal(me.json.activeOrg, ownerOrgId);

    const getOk = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(getOk.status, 200, getOk.body);
    assert.equal(getOk.json.id, ownerOrgId);
    assert.equal(getOk.json.name, `Settings Org ${ts}`);
    assert.ok(getOk.json.slug);
    assert.equal(typeof getOk.json.timezone, "string");
    assert.equal(typeof getOk.json.slotIntervalMin, "number");
    assert.equal(getOk.json.currency, "BRL");

    const patchOk = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: `Settings Org Updated ${ts}`,
        timezone: "America/Sao_Paulo",
        slotIntervalMin: 45,
      }),
    });
    assert.equal(patchOk.status, 200, patchOk.body);
    assert.equal(patchOk.json.id, ownerOrgId);
    assert.equal(patchOk.json.name, `Settings Org Updated ${ts}`);
    assert.equal(patchOk.json.timezone, "America/Sao_Paulo");
    assert.equal(patchOk.json.slotIntervalMin, 45);
    assert.equal(patchOk.json.currency, "BRL");

    const patchBadTimezone = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        timezone: "Mars/Olympus",
      }),
    });
    assert.equal(patchBadTimezone.status, 422, patchBadTimezone.body);
    assert.equal(typeof patchBadTimezone.json?.error?.requestId, "string");

    const patchBadSlot = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        slotIntervalMin: 3,
      }),
    });
    assert.equal(patchBadSlot.status, 422, patchBadSlot.body);
    assert.equal(typeof patchBadSlot.json?.error?.requestId, "string");

    const nonexistentId = randomUUID();
    const getMissing = await fetchJson(`/api/v1/organizations/${nonexistentId}`, {
      headers: {
        authorization: `Bearer ${ownerToken}`,
      },
    });
    assert.equal(getMissing.status, 404, getMissing.body);
    assert.equal(typeof getMissing.json?.error?.requestId, "string");

    const outsiderRegister = await fetchJson("/api/v1/auth/register", {
      method: "POST",
      headers: registerHeaders(),
      body: JSON.stringify({
        name: "Settings Outsider",
        email: outsiderEmail,
        password,
        organizationName: `Outsider Org ${ts}`,
      }),
    });
    assert.equal(outsiderRegister.status, 201, outsiderRegister.body);

    const outsiderToken = outsiderRegister.json.accessToken;
    const outsiderUserId = outsiderRegister.json.user.id;
    const outsiderOrgId = outsiderRegister.json.organization.id;

    const getCrossTenant = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      headers: {
        authorization: `Bearer ${outsiderToken}`,
      },
    });
    assert.equal(getCrossTenant.status, 404, getCrossTenant.body);

    const patchCrossTenant = await fetchJson(`/api/v1/organizations/${ownerOrgId}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${outsiderToken}`,
      },
      body: JSON.stringify({
        name: "Should Not Update",
      }),
    });
    assert.equal(patchCrossTenant.status, 404, patchCrossTenant.body);

    const noAuth = await fetchJson(`/api/v1/organizations/${ownerOrgId}`);
    assert.equal(noAuth.status, 401, noAuth.body);

    const noContextRows = await runtimePool.query(
      "SELECT count(*)::int AS count FROM organizations WHERE id = $1",
      [ownerOrgId],
    );
    assert.equal(Number(noContextRows.rows[0].count), 0);

    const wrongTenantRows = await runtimePool.connect();
    let wrongTenantCount = 0;
    try {
      await wrongTenantRows.query("BEGIN");
      await wrongTenantRows.query(
        "SELECT set_config('app.current_organization_id', $1, true)",
        [outsiderOrgId],
      );
      await wrongTenantRows.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [outsiderUserId],
      );
      const result = await wrongTenantRows.query(
        "SELECT count(*)::int AS count FROM organizations WHERE id = $1",
        [ownerOrgId],
      );
      wrongTenantCount = Number(result.rows[0].count);
      await wrongTenantRows.query("ROLLBACK");
    } finally {
      wrongTenantRows.release();
    }
    assert.equal(wrongTenantCount, 0);

    const rightTenantRows = await runtimePool.connect();
    let rightTenantCount = 0;
    try {
      await rightTenantRows.query("BEGIN");
      await rightTenantRows.query(
        "SELECT set_config('app.current_organization_id', $1, true)",
        [ownerOrgId],
      );
      await rightTenantRows.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [ownerUserId],
      );
      const result = await rightTenantRows.query(
        "SELECT count(*)::int AS count FROM organizations WHERE id = $1",
        [ownerOrgId],
      );
      rightTenantCount = Number(result.rows[0].count);
      await rightTenantRows.query("ROLLBACK");
    } finally {
      rightTenantRows.release();
    }
    assert.equal(rightTenantCount, 1);

    console.log(
      JSON.stringify(
        {
          proof: "org-settings-route",
          runtimeRole: {
            current_user: role.current_user,
            rolsuper: role.rolsuper,
            rolbypassrls: role.rolbypassrls,
          },
          tenantCorrect: {
            activeOrg: me.json.activeOrg,
            getStatus: getOk.status,
            patchStatus: patchOk.status,
          },
          responseShape: {
            id: getOk.json.id,
            name: getOk.json.name,
            slug: getOk.json.slug,
            timezone: getOk.json.timezone,
            slotIntervalMin: getOk.json.slotIntervalMin,
            currency: getOk.json.currency,
          },
          patchShape: {
            id: patchOk.json.id,
            name: patchOk.json.name,
            slug: patchOk.json.slug,
            timezone: patchOk.json.timezone,
            slotIntervalMin: patchOk.json.slotIntervalMin,
            currency: patchOk.json.currency,
          },
          negatives: {
            invalidTimezoneStatus: patchBadTimezone.status,
            invalidSlotStatus: patchBadSlot.status,
            nonexistentStatus: getMissing.status,
            crossTenantGetStatus: getCrossTenant.status,
            crossTenantPatchStatus: patchCrossTenant.status,
            noAuthStatus: noAuth.status,
          },
          rls: {
            noContextRows: Number(noContextRows.rows[0].count),
            wrongTenantRows: wrongTenantCount,
            rightTenantRows: rightTenantCount,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const logs = api.getLogs();
    if (logs.stderr.trim()) {
      console.error(logs.stderr.trim());
    }
    throw error;
  } finally {
    await stopApi(api);
    await runtimePool.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
