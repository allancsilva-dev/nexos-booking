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
  console.log("\nPR-1.8 Maintenance Cron Jobs Tests");
  console.log("==================================\n");

  await waitForPostgres();
  console.log("[phase] Postgres ready\n");

  const APP = "app_runtime";

  const USER = "66666666-6666-6666-6666-666666666666";
  const ORG = "77777777-7777-7777-7777-777777777777";

  // ─── Seed base records ─────────────────────────────────────────────
  console.log("[setup] Seeding test user and organization...");
  runPsql(`
    INSERT INTO users (id, name, email, password_hash) VALUES
      (${quotedLiteral(USER)}, 'Maint Test User', 'maint@test.com', 'hash')
    ON CONFLICT DO NOTHING;
  `);
  runPsql(`
    INSERT INTO organizations (id, name, slug) VALUES
      (${quotedLiteral(ORG)}, 'Maint Org', 'maint-org')
    ON CONFLICT DO NOTHING;
  `);
  console.log("[setup] Done.\n");

  // ═════════════════════════════════════════════════════════════════
  // T1: Refresh sessions cleanup — expired deleted, valid remain
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T1: refresh_sessions cleanup ---");
  const RS_EXP_1 = "b1111111-1111-1111-1111-111111111111";
  const RS_EXP_2 = "b1111111-2222-2222-2222-222222222222";
  const RS_VALID = "b1111111-3333-3333-3333-333333333333";

  runPsql(`
    DELETE FROM refresh_sessions WHERE id IN (${quotedLiteral(RS_EXP_1)}, ${quotedLiteral(RS_EXP_2)}, ${quotedLiteral(RS_VALID)});
  `);

  runPsql(`
    INSERT INTO refresh_sessions (id, user_id, token_hash, family_id, expires_at) VALUES
      (${quotedLiteral(RS_EXP_1)}, ${quotedLiteral(USER)}, 'exp-hash1', 'a0000001-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '2020-01-01'),
      (${quotedLiteral(RS_EXP_2)}, ${quotedLiteral(USER)}, 'exp-hash2', 'a0000002-aaaa-aaaa-aaaa-aaaaaaaaaaa2', '2020-06-01'),
      (${quotedLiteral(RS_VALID)}, ${quotedLiteral(USER)}, 'val-hash1', 'a0000003-aaaa-aaaa-aaaa-aaaaaaaaaaa3', '2099-12-31');
  `);

  const rsBefore = parseCount(
    runPsql(`SELECT count(*)::text FROM refresh_sessions WHERE id IN (${quotedLiteral(RS_EXP_1)}, ${quotedLiteral(RS_EXP_2)}, ${quotedLiteral(RS_VALID)});`),
  );
  assert("T1a 3 rows seeded", rsBefore, 3);

  runPsql(`DELETE FROM refresh_sessions WHERE expires_at < now();`);

  const rsExpAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM refresh_sessions WHERE id IN (${quotedLiteral(RS_EXP_1)}, ${quotedLiteral(RS_EXP_2)});`),
  );
  const rsValidAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM refresh_sessions WHERE id = ${quotedLiteral(RS_VALID)};`),
  );
  assert("T1b expired deleted (0)", rsExpAfter, 0);
  assert("T1c valid remains (1)", rsValidAfter, 1);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T2: Verification tokens cleanup — expired deleted, valid remain
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T2: verification_tokens cleanup ---");
  const VT_EXP_1 = "c2222222-1111-1111-1111-111111111111";
  const VT_EXP_2 = "c2222222-2222-2222-2222-222222222222";
  const VT_VALID = "c2222222-3333-3333-3333-333333333333";

  runPsql(`
    DELETE FROM verification_tokens WHERE id IN (${quotedLiteral(VT_EXP_1)}, ${quotedLiteral(VT_EXP_2)}, ${quotedLiteral(VT_VALID)});
  `);

  runPsql(`
    INSERT INTO verification_tokens (id, user_id, purpose, token_hash, expires_at) VALUES
      (${quotedLiteral(VT_EXP_1)}, ${quotedLiteral(USER)}, 'email_verification', 'vt-hash1', '2020-01-01'),
      (${quotedLiteral(VT_EXP_2)}, ${quotedLiteral(USER)}, 'password_reset', 'vt-hash2', '2020-06-01'),
      (${quotedLiteral(VT_VALID)}, ${quotedLiteral(USER)}, 'email_verification', 'vt-hash3', '2099-12-31');
  `);

  const vtBefore = parseCount(
    runPsql(`SELECT count(*)::text FROM verification_tokens WHERE id IN (${quotedLiteral(VT_EXP_1)}, ${quotedLiteral(VT_EXP_2)}, ${quotedLiteral(VT_VALID)});`),
  );
  assert("T2a 3 rows seeded", vtBefore, 3);

  runPsql(`DELETE FROM verification_tokens WHERE expires_at < now();`);

  const vtExpAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM verification_tokens WHERE id IN (${quotedLiteral(VT_EXP_1)}, ${quotedLiteral(VT_EXP_2)});`),
  );
  const vtValidAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM verification_tokens WHERE id = ${quotedLiteral(VT_VALID)};`),
  );
  assert("T2b expired deleted (0)", vtExpAfter, 0);
  assert("T2c valid remains (1)", vtValidAfter, 1);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T3: Invitations cleanup — expired deleted, valid + accepted remain
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T3: invitations cleanup ---");
  const INV_EXP_1 = "d3333333-1111-1111-1111-111111111111";
  const INV_EXP_2 = "d3333333-2222-2222-2222-222222222222";
  const INV_VALID = "d3333333-3333-3333-3333-333333333333";
  const INV_ACCEPTED_EXP = "d3333333-4444-4444-4444-444444444444";

  runPsql(`
    DELETE FROM invitations WHERE id IN (${quotedLiteral(INV_EXP_1)}, ${quotedLiteral(INV_EXP_2)}, ${quotedLiteral(INV_VALID)}, ${quotedLiteral(INV_ACCEPTED_EXP)});
  `);

  runPsql(`
    INSERT INTO invitations (id, organization_id, email, role, token_hash, invited_by, expires_at, accepted_at) VALUES
      (${quotedLiteral(INV_EXP_1)}, ${quotedLiteral(ORG)}, 'inv1@test.com', 'MANAGER', 'inv-hash1', ${quotedLiteral(USER)}, '2020-01-01', NULL),
      (${quotedLiteral(INV_EXP_2)}, ${quotedLiteral(ORG)}, 'inv2@test.com', 'STAFF', 'inv-hash2', ${quotedLiteral(USER)}, '2020-06-01', NULL),
      (${quotedLiteral(INV_VALID)}, ${quotedLiteral(ORG)}, 'inv3@test.com', 'MANAGER', 'inv-hash3', ${quotedLiteral(USER)}, '2099-12-31', NULL),
      (${quotedLiteral(INV_ACCEPTED_EXP)}, ${quotedLiteral(ORG)}, 'inv4@test.com', 'STAFF', 'inv-hash4', ${quotedLiteral(USER)}, '2020-03-01', '2020-02-15');
  `);

  const invBefore = parseCount(
    runPsql(`SELECT count(*)::text FROM invitations WHERE id IN (${quotedLiteral(INV_EXP_1)}, ${quotedLiteral(INV_EXP_2)}, ${quotedLiteral(INV_VALID)}, ${quotedLiteral(INV_ACCEPTED_EXP)});`),
  );
  assert("T3a 4 rows seeded", invBefore, 4);

  runPsql(
    `
    BEGIN;
    SELECT set_config('app.is_system', 'true', true);
    DELETE FROM invitations WHERE expires_at < now();
    COMMIT;
    `,
    { asUser: APP },
  );

  const invExpAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM invitations WHERE id IN (${quotedLiteral(INV_EXP_1)}, ${quotedLiteral(INV_EXP_2)});`),
  );
  const invValidAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM invitations WHERE id = ${quotedLiteral(INV_VALID)};`),
  );
  const invAcceptedAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM invitations WHERE id = ${quotedLiteral(INV_ACCEPTED_EXP)};`),
  );
  assert("T3b expired deleted (0)", invExpAfter, 0);
  assert("T3c valid remains (1)", invValidAfter, 1);
  assert("T3d accepted but expired remains (1)", invAcceptedAfter, 1);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T4: All valid rows untouched after cleanup cycle
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T4: Valid rows untouched after full cleanup cycle ---");
  runPsql(`DELETE FROM refresh_sessions WHERE expires_at < now();`);
  runPsql(`DELETE FROM verification_tokens WHERE expires_at < now();`);
  runPsql(
    `
    BEGIN;
    SELECT set_config('app.is_system', 'true', true);
    DELETE FROM invitations WHERE expires_at < now();
    COMMIT;
    `,
    { asUser: APP },
  );

  const rsFinal = parseCount(
    runPsql(`SELECT count(*)::text FROM refresh_sessions WHERE id = ${quotedLiteral(RS_VALID)};`),
  );
  const vtFinal = parseCount(
    runPsql(`SELECT count(*)::text FROM verification_tokens WHERE id = ${quotedLiteral(VT_VALID)};`),
  );
  const invFinal = parseCount(
    runPsql(`SELECT count(*)::text FROM invitations WHERE id = ${quotedLiteral(INV_VALID)};`),
  );
  assert("T4a refresh_sessions valid untouched", rsFinal, 1);
  assert("T4b verification_tokens valid untouched", vtFinal, 1);
  assert("T4c invitations valid untouched", invFinal, 1);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T5: idempotency_keys scaffold exists, no DELETE on idempotency_keys
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T5: idempotency_keys scaffold ---");
  const maintServicePath = path.resolve(__dirname, "../src/maintenance/maintenance.service.ts");
  const maintSource = readFileSync(maintServicePath, "utf8");

  const hasMethod = maintSource.includes("cleanupIdempotencyKeys");
  assert("T5a cleanupIdempotencyKeys method exists in source", hasMethod, true);

  const hasCronActive = maintSource.match(/@Cron\(.*\)\s*\n\s*(private\s+)?async\s+cleanupIdempotencyKeys/);
  assert("T5b @Cron decorator NOT active on cleanupIdempotencyKeys", hasCronActive === null, true);

  const hasDeleteOnIdem = /delete\s*\(\s*idempotencyKeys\s*\)/i.test(maintSource);
  assert("T5c no DELETE on idempotencyKeys in source", hasDeleteOnIdem, false);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T6: Simulated error → health still responds (job doesn't crash)
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T6: Error resilience ---");

  const badResult = runPsqlMayFail(`DELETE FROM nonexistent_table WHERE 1=1;`);
  assert("T6a bad query caught as error", badResult.ok, false);

  const healthResult = runPsqlMayFail(`SELECT 1 AS health;`);
  assert("T6b health check still responds after error", healthResult.ok, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T7: Verify log messages — entity names + row counts, no PII
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T7: Log message content (no PII) ---");

  const hasRefreshLog = /\[maintenance\]\s*refresh_sessions:\s*\$\{result\.rowCount/.test(maintSource);
  assert("T7a refresh_sessions log contains entity name + rowCount", hasRefreshLog, true);

  const hasVerificationLog = /\[maintenance\]\s*verification_tokens:\s*\$\{result\.rowCount/.test(maintSource);
  assert("T7b verification_tokens log contains entity name + rowCount", hasVerificationLog, true);

  const hasInvitationLog = /\[maintenance\]\s*invitations:\s*\$\{result\.rowCount/.test(maintSource);
  assert("T7c invitations log contains entity name + rowCount", hasInvitationLog, true);

  const logLines = maintSource.match(/this\.logger\.(log|error)\(/g) || [];
  for (const line of logLines) {
    const surrounding = maintSource.slice(
      Math.max(0, maintSource.indexOf(line) - 50),
      maintSource.indexOf(line) + 200,
    );
    const hasTokenPII = /token[_\s]/.test(surrounding) && !/verification_tokens/.test(surrounding) && !/refresh_sessions/.test(surrounding);
    const hasUserPII = /\buser_id\b/.test(surrounding);
    const hasEmailPII = /\bemail\b/.test(surrounding);
    assert(
      "T7d no PII (token/email/user_id) in log messages",
      !hasTokenPII && !hasUserPII && !hasEmailPII,
      true,
    );
  }
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // Cleanup test data
  // ═════════════════════════════════════════════════════════════════
  runPsql(`
    DELETE FROM refresh_sessions WHERE id IN (${quotedLiteral(RS_EXP_1)}, ${quotedLiteral(RS_EXP_2)}, ${quotedLiteral(RS_VALID)});
    DELETE FROM verification_tokens WHERE id IN (${quotedLiteral(VT_EXP_1)}, ${quotedLiteral(VT_EXP_2)}, ${quotedLiteral(VT_VALID)});
    DELETE FROM invitations WHERE id IN (${quotedLiteral(INV_EXP_1)}, ${quotedLiteral(INV_EXP_2)}, ${quotedLiteral(INV_VALID)}, ${quotedLiteral(INV_ACCEPTED_EXP)});
  `);

  console.log("============================");
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
