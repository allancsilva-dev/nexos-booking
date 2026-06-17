import { readFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

function parseDotEnv(contents) {
  const result = {};
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

function loadEnv() {
  const envFile = path.resolve(repoRoot, ".env");
  const fileValues = (() => {
    try {
      return parseDotEnv(readFileSync(envFile, "utf8"));
    } catch {
      return {};
    }
  })();
  return {
    POSTGRES_DB:
      process.env.POSTGRES_DB ?? fileValues.POSTGRES_DB ?? "nexos_booking",
    POSTGRES_USER:
      process.env.POSTGRES_USER ?? fileValues.POSTGRES_USER ?? "nexos_booking",
    POSTGRES_PASSWORD:
      process.env.POSTGRES_PASSWORD ??
      fileValues.POSTGRES_PASSWORD ??
      "nexos_booking_local_password",
  };
}

function quotedLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function runPsql(sql, { asUser = null } = {}) {
  const env = {
    PGPASSWORD: asUser
      ? (process.env.POSTGRES_PASSWORD ?? envVars.POSTGRES_PASSWORD)
      : envVars.POSTGRES_PASSWORD,
  };

  const user = asUser ?? envVars.POSTGRES_USER;
  const db = envVars.POSTGRES_DB;

  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "-e",
      `PGPASSWORD=${env.PGPASSWORD}`,
      "postgres",
      "psql",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      user,
      "-d",
      db,
    ],
    { cwd: repoRoot, encoding: "utf8", input: sql },
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || "";
    const stdout = result.stdout?.trim() || "";
    const details = [stderr, stdout].filter(Boolean).join("\n");
    throw new Error(details || `psql failed with code ${result.status}`);
  }

  return result.stdout?.trim() ?? "";
}

function runPsqlMayFail(sql, { asUser = null } = {}) {
  try {
    return { ok: true, output: runPsql(sql, { asUser }) };
  } catch (error) {
    return { ok: false, error };
  }
}

async function waitForPostgres() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      runPsql("SELECT 1;");
      return;
    } catch {
      if (attempt === 30)
        throw new Error("Postgres not ready after 30 attempts");
      await delay(1000);
    }
  }
}

const envVars = loadEnv();

function assert(description, actual, expected) {
  if (actual === expected) {
    console.log(`  PASS  ${description}`);
    return true;
  }
  console.error(`  FAIL  ${description}`);
  console.error(`        expected: ${JSON.stringify(expected)}`);
  console.error(`        actual:   ${JSON.stringify(actual)}`);
  process.exitCode = 1;
  return false;
}

function parseCount(output) {
  const lines = output.split("\n").filter(Boolean);
  return lines.map((l) => parseInt(l.trim(), 10)).find((n) => !isNaN(n)) ?? -1;
}

async function main() {
  console.log("\nPR-1.2 RLS Integration Tests");
  console.log("============================\n");

  await waitForPostgres();
  console.log("[phase] Postgres ready\n");

  const APP = "app_runtime";

  const ORG_A = "aaaaaaa1-aaaa-aaaa-aaaa-aaaaaaaaaaa1";
  const ORG_B = "bbbbbbb1-bbbb-bbbb-bbbb-bbbbbbbbbbb1";
  const USER_A = "11111111-1111-1111-1111-111111111111";
  const USER_B = "22222222-2222-2222-2222-222222222222";

  const PROF_A = "1111aaa1-1111-1111-1111-1111aaa11111";
  const PROF_B = "2222bbb1-2222-2222-2222-2222bbb22222";
  const SVC_A = "51c1aaa1-1111-1111-1111-111111111111";
  const SVC_B = "51c2bbb2-2222-2222-2222-222222222222";
  const CLIENT_A = "c11aaaa1-1111-1111-1111-111111111111";
  const CLIENT_B = "c11bbbb2-2222-2222-2222-222222222222";

  // ═══════════════════════════════════════════════════════════════
  // PHASE 1 — Admin setup: ONLY global tables (no RLS)
  // ═══════════════════════════════════════════════════════════════
  console.log("[phase 1] Admin: inserting users (global, no RLS)...");
  runPsql(`
    INSERT INTO users (id, name, email, password_hash) VALUES
      (${quotedLiteral(USER_A)}, 'User A', 'a@test.com', 'hash'),
      (${quotedLiteral(USER_B)}, 'User B', 'b@test.com', 'hash')
    ON CONFLICT DO NOTHING;
  `);
  console.log("[phase 1] Admin done.\n");

  // ═══════════════════════════════════════════════════════════════
  // PHASE 2 — Seed Tenant A as app_runtime via set_config
  // ═══════════════════════════════════════════════════════════════
  console.log("[phase 2] Seeding tenant A via withTenantContext (app_runtime)...");
  runPsql(
    `
    BEGIN;
    SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_A)}, true);
    SELECT set_config('app.current_user_id', ${quotedLiteral(USER_A)}, true);

    INSERT INTO organizations (id, name, slug) VALUES
      (${quotedLiteral(ORG_A)}, 'Org A', 'org-a');

    INSERT INTO organization_users (id, organization_id, user_id, role) VALUES
      ('a0011111-aaaa-aaaa-aaaa-aaaa1111aaa1', ${quotedLiteral(ORG_A)}, ${quotedLiteral(USER_A)}, 'OWNER');

    INSERT INTO professionals (id, organization_id, name, slug) VALUES
      (${quotedLiteral(PROF_A)}, ${quotedLiteral(ORG_A)}, 'Prof A', 'prof-a');

    INSERT INTO services (id, organization_id, name, duration_min, price_cents) VALUES
      (${quotedLiteral(SVC_A)}, ${quotedLiteral(ORG_A)}, 'Corte A', 30, 5000);

    INSERT INTO clients (id, organization_id, name) VALUES
      (${quotedLiteral(CLIENT_A)}, ${quotedLiteral(ORG_A)}, 'Cliente A');

    INSERT INTO appointments (id, organization_id, professional_id, service_id, client_id, starts_at, ends_at, source) VALUES
      ('a110aaa1-1111-1111-1111-111111111111', ${quotedLiteral(ORG_A)}, ${quotedLiteral(PROF_A)}, ${quotedLiteral(SVC_A)}, ${quotedLiteral(CLIENT_A)}, '2026-06-10 09:00-03', '2026-06-10 09:30-03', 'PANEL');

    INSERT INTO appointment_events (id, organization_id, appointment_id, event_type, actor_type, actor_user_id, metadata) VALUES
      ('e110aaa1-1111-1111-1111-111111111111', ${quotedLiteral(ORG_A)}, 'a110aaa1-1111-1111-1111-111111111111', 'CREATED', 'STAFF', ${quotedLiteral(USER_A)}, '{}');

    INSERT INTO idempotency_keys (id, organization_id, key, route, request_hash, state, expires_at) VALUES
      ('1d10aaa1-1111-1111-1111-111111111111', ${quotedLiteral(ORG_A)}, 'key-a', '/test', 'hash-a', 'COMPLETED', '2099-01-01');

    INSERT INTO invitations (id, organization_id, email, role, token_hash, invited_by, expires_at) VALUES
      ('1a10aaa1-1111-1111-1111-111111111111', ${quotedLiteral(ORG_A)}, 'invite-a@test.com', 'MANAGER', 'hash-inv-a', ${quotedLiteral(USER_A)}, '2099-01-01');

    COMMIT;
    `,
    { asUser: APP },
  );
  console.log("[phase 2] Tenant A seeded.\n");

  // ═══════════════════════════════════════════════════════════════
  // PHASE 3 — Seed Tenant B as app_runtime via set_config
  // ═══════════════════════════════════════════════════════════════
  console.log("[phase 3] Seeding tenant B via withTenantContext (app_runtime)...");
  runPsql(
    `
    BEGIN;
    SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_B)}, true);
    SELECT set_config('app.current_user_id', ${quotedLiteral(USER_B)}, true);

    INSERT INTO organizations (id, name, slug) VALUES
      (${quotedLiteral(ORG_B)}, 'Org B', 'org-b');

    INSERT INTO organization_users (id, organization_id, user_id, role) VALUES
      ('b0022222-bbbb-bbbb-bbbb-bbbb2222bbb1', ${quotedLiteral(ORG_B)}, ${quotedLiteral(USER_B)}, 'OWNER');

    INSERT INTO professionals (id, organization_id, name, slug) VALUES
      (${quotedLiteral(PROF_B)}, ${quotedLiteral(ORG_B)}, 'Prof B', 'prof-b');

    INSERT INTO services (id, organization_id, name, duration_min, price_cents) VALUES
      (${quotedLiteral(SVC_B)}, ${quotedLiteral(ORG_B)}, 'Corte B', 30, 5000);

    INSERT INTO clients (id, organization_id, name) VALUES
      (${quotedLiteral(CLIENT_B)}, ${quotedLiteral(ORG_B)}, 'Cliente B');

    INSERT INTO appointments (id, organization_id, professional_id, service_id, client_id, starts_at, ends_at, source) VALUES
      ('a110bbb2-2222-2222-2222-222222222222', ${quotedLiteral(ORG_B)}, ${quotedLiteral(PROF_B)}, ${quotedLiteral(SVC_B)}, ${quotedLiteral(CLIENT_B)}, '2026-06-10 09:00-03', '2026-06-10 09:30-03', 'PANEL');

    INSERT INTO appointment_events (id, organization_id, appointment_id, event_type, actor_type, actor_user_id, metadata) VALUES
      ('e110bbb2-2222-2222-2222-222222222222', ${quotedLiteral(ORG_B)}, 'a110bbb2-2222-2222-2222-222222222222', 'CREATED', 'STAFF', ${quotedLiteral(USER_B)}, '{}');

    INSERT INTO idempotency_keys (id, organization_id, key, route, request_hash, state, expires_at) VALUES
      ('1d10bbb2-2222-2222-2222-222222222222', ${quotedLiteral(ORG_B)}, 'key-b', '/test', 'hash-b', 'COMPLETED', '2099-01-01');

    INSERT INTO invitations (id, organization_id, email, role, token_hash, invited_by, expires_at) VALUES
      ('1a10bbb2-2222-2222-2222-222222222222', ${quotedLiteral(ORG_B)}, 'invite-b@test.com', 'MANAGER', 'hash-inv-b', ${quotedLiteral(USER_B)}, '2099-01-01');

    COMMIT;
    `,
    { asUser: APP },
  );
  console.log("[phase 3] Tenant B seeded.\n");

  // ═══════════════════════════════════════════════════════════════
  // PHASE 4 — WRITE / WITH CHECK tests (as app_runtime)
  // ═══════════════════════════════════════════════════════════════
  console.log("--- Write / WITH CHECK tests (app_runtime) ---\n");

  // W1: INSERT with correct orgId succeeds
  {
    const NEW_PROF = "ba11aaa1-1111-1111-1111-111111111111";
    const result = runPsqlMayFail(
      `
      BEGIN;
      SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_A)}, true);
      INSERT INTO professionals (id, organization_id, name, slug)
        VALUES (${quotedLiteral(NEW_PROF)}, ${quotedLiteral(ORG_A)}, 'Prof A2', 'prof-a2');
      ROLLBACK;
      `,
      { asUser: APP },
    );
    assert(
      "W1  INSERT with correct orgId succeeds",
      result.ok,
      true,
    );
  }

  // W2: INSERT with organization_id different from GUC must fail
  {
    const BAD_PROF = "ba22aaa1-1111-1111-1111-111111111111";
    const result = runPsqlMayFail(
      `
      BEGIN;
      SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_A)}, true);
      INSERT INTO professionals (id, organization_id, name, slug)
        VALUES (${quotedLiteral(BAD_PROF)}, ${quotedLiteral(ORG_B)}, 'Bad Prof', 'bad-prof');
      ROLLBACK;
      `,
      { asUser: APP },
    );
    assert(
      "W2  INSERT with mismatched orgId fails (WITH CHECK / FK)",
      result.ok === false,
      true,
    );
  }

  // W3: INSERT without GUC must fail
  {
    const BAD_PROF = "ba33aaa1-1111-1111-1111-111111111111";
    const result = runPsqlMayFail(
      `
      INSERT INTO professionals (id, organization_id, name, slug)
        VALUES (${quotedLiteral(BAD_PROF)}, ${quotedLiteral(ORG_A)}, 'Bad Prof 2', 'bad-prof2');
      `,
      { asUser: APP },
    );
    assert(
      "W3  INSERT without context fails (RLS denies)",
      result.ok === false,
      true,
    );
  }

  // W4: INSERT with only user_id GUC into organization_users via tenant_or_self
  {
    const NEW_MEM = "a0099999-aaaa-aaaa-aaaa-aaaa1111aaa1";
    const result = runPsqlMayFail(
      `
      BEGIN;
      SELECT set_config('app.current_user_id', ${quotedLiteral(USER_A)}, true);
      INSERT INTO organization_users (id, organization_id, user_id, role)
        VALUES (${quotedLiteral(NEW_MEM)}, ${quotedLiteral(ORG_B)}, ${quotedLiteral(USER_A)}, 'MANAGER');
      ROLLBACK;
      `,
      { asUser: APP },
    );
    assert(
      "W4  INSERT org_user with only user_id GUC (tenant_or_self) succeeds",
      result.ok,
      true,
    );
  }

  // W5: system context can insert cross-tenant event
  {
    const NEW_EVT = "e1199999-9999-9999-9999-999999999999";
    const result = runPsqlMayFail(
      `
      BEGIN;
      SELECT set_config('app.is_system', 'true', true);
      INSERT INTO appointment_events (id, organization_id, appointment_id, event_type, actor_type, metadata)
        VALUES (${quotedLiteral(NEW_EVT)}, ${quotedLiteral(ORG_B)}, 'a110bbb2-2222-2222-2222-222222222222', 'NO_SHOW', 'SYSTEM', '{}');
      ROLLBACK;
      `,
      { asUser: APP },
    );
    assert(
      "W5  INSERT appointment_event with system context succeeds",
      result.ok,
      true,
    );
  }

  // W6: system context cannot insert into tenant_isolation table
  {
    const BAD_PROF = "ba44aaa1-1111-1111-1111-111111111111";
    const result = runPsqlMayFail(
      `
      BEGIN;
      SELECT set_config('app.is_system', 'true', true);
      INSERT INTO professionals (id, organization_id, name, slug)
        VALUES (${quotedLiteral(BAD_PROF)}, ${quotedLiteral(ORG_A)}, 'Sys Prof', 'sys-prof');
      ROLLBACK;
      `,
      { asUser: APP },
    );
    assert(
      "W6  INSERT into tenant_isolation table with only is_system fails",
      result.ok === false,
      true,
    );
  }

  console.log("");

  // ═══════════════════════════════════════════════════════════════
  // PHASE 5 — READ / RLS isolation tests (as app_runtime)
  // ═══════════════════════════════════════════════════════════════
  console.log("--- RLS Read Isolation tests (app_runtime) ---\n");

  // R1: Query without context denies rows
  {
    let rows;
    try {
      rows = parseCount(
        runPsql(`SELECT count(*)::text FROM professionals;`, {
          asUser: APP,
        }),
      );
    } catch {
      rows = 0;
    }
    assert("R1  Query without context denies rows (0)", rows, 0);
  }

  // R2: Query with correct orgId returns rows
  {
    const out = runPsql(
      `BEGIN;
       SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_A)}, true);
       SELECT count(*)::text FROM professionals;
       ROLLBACK;`,
      { asUser: APP },
    );
    const count = parseCount(out);
    assert("R2  Query with correct orgId returns rows (1+)", count >= 1, true);
  }

  // R3: Cross-tenant query denies orgA's professional under orgB
  {
    const out = runPsql(
      `BEGIN;
       SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_B)}, true);
       SELECT count(*)::text FROM professionals WHERE id = ${quotedLiteral(PROF_A)};
       ROLLBACK;`,
      { asUser: APP },
    );
    const count = parseCount(out);
    assert("R3  Cross-tenant professional denied (0)", count, 0);
  }

  // R4: Resolver works without tenant context
  {
    let resolved;
    try {
      resolved = runPsql(
        `SELECT app_resolve_org_by_slug('org-a')::text;`,
        { asUser: APP },
      ).trim();
    } catch {
      resolved = "";
    }
    assert("R4  Resolver app_resolve_org_by_slug works without context", resolved, ORG_A);
  }

  // R5: Direct table access without context continues denied
  {
    let rows;
    try {
      rows = parseCount(
        runPsql(`SELECT count(*)::text FROM organizations;`, {
          asUser: APP,
        }),
      );
    } catch {
      rows = 0;
    }
    assert("R5  Direct access to organizations without context denied (0)", rows, 0);
  }

  // R6: appointment_events with tenant context returns only tenant
  {
    const out = runPsql(
      `BEGIN;
       SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_A)}, true);
       SELECT count(*)::text FROM appointment_events;
       ROLLBACK;`,
      { asUser: APP },
    );
    assert("R6  appointment_events withTenantContext(orgA) returns only orgA (1+)", parseCount(out) >= 1, true);
  }

  // R7: appointment_events with system context returns ALL tenants
  {
    const out = runPsql(
      `BEGIN;
       SELECT set_config('app.is_system', 'true', true);
       SELECT count(*)::text FROM appointment_events;
       ROLLBACK;`,
      { asUser: APP },
    );
    assert("R7  appointment_events withSystemContext returns all tenants (2+)", parseCount(out) >= 2, true);
  }

  // R8: idempotency_keys with system context returns ALL tenants
  {
    const out = runPsql(
      `BEGIN;
       SELECT set_config('app.is_system', 'true', true);
       SELECT count(*)::text FROM idempotency_keys;
       ROLLBACK;`,
      { asUser: APP },
    );
    assert("R8  idempotency_keys withSystemContext returns all tenants (2+)", parseCount(out) >= 2, true);
  }

  // R9: invitations with system context returns ALL tenants
  {
    const out = runPsql(
      `BEGIN;
       SELECT set_config('app.is_system', 'true', true);
       SELECT count(*)::text FROM invitations;
       ROLLBACK;`,
      { asUser: APP },
    );
    assert("R9  invitations withSystemContext returns all tenants (2+)", parseCount(out) >= 2, true);
  }

  // R10: GUC does not leak between connections
  {
    let c1, c2;
    try { c1 = parseCount(runPsql(`SELECT count(*)::text FROM professionals;`, { asUser: APP })); } catch { c1 = 0; }
    try { c2 = parseCount(runPsql(`SELECT count(*)::text FROM professionals;`, { asUser: APP })); } catch { c2 = 0; }
    assert("R10 GUC does not leak between connections (both 0)", c1 === 0 && c2 === 0, true);
  }

  // R11: Error in callback -> ROLLBACK, no GUC leak
  {
    try {
      runPsql(
        `BEGIN;
         SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_A)}, true);
         SELECT 1/0;
         ROLLBACK;`,
        { asUser: APP },
      );
    } catch { /* expected */ }
    let count;
    try {
      count = parseCount(runPsql(`SELECT count(*)::text FROM professionals;`, { asUser: APP }));
    } catch {
      count = 0;
    }
    assert("R11 Error in callback rolls back, no GUC leak (0)", count, 0);
  }

  // R12: After error, next call does not inherit GUC
  {
    try {
      runPsql(
        `BEGIN;
         SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_A)}, true);
         SELECT 1/0;
         ROLLBACK;`,
        { asUser: APP },
      );
    } catch { /* expected */ }
    let count;
    try {
      count = parseCount(runPsql(`SELECT count(*)::text FROM professionals;`, { asUser: APP }));
    } catch {
      count = 0;
    }
    assert("R12 After error, next call does not inherit GUC (0)", count, 0);
  }

  // R13: tenant_or_self — user sees own membership
  {
    const out = runPsql(
      `BEGIN;
       SELECT set_config('app.current_user_id', ${quotedLiteral(USER_A)}, true);
       SELECT count(*)::text FROM organization_users WHERE user_id = ${quotedLiteral(USER_A)};
       ROLLBACK;`,
      { asUser: APP },
    );
    assert("R13 tenant_or_self: user sees own membership (1+)", parseCount(out) >= 1, true);
  }

  // R14: Data seeded via withTenantContext is visible under same context
  {
    const out = runPsql(
      `BEGIN;
       SELECT set_config('app.current_organization_id', ${quotedLiteral(ORG_A)}, true);
       SELECT count(*)::text FROM clients;
       ROLLBACK;`,
      { asUser: APP },
    );
    assert("R14 Data seeded via context visible under same context (1+)", parseCount(out) >= 1, true);
  }

  // ═══════════════════════════════════════════════════════════════
  console.log("\n============================");
  if (process.exitCode) {
    console.log("RESULT: FAIL\n");
  } else {
    console.log("RESULT: PASS\n");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
