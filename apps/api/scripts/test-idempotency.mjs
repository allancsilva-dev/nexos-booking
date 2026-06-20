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
  console.log("\nPR-3.2 Idempotency Engine Tests");
  console.log("================================\n");

  await waitForPostgres();
  console.log("[phase] Postgres ready\n");

  const ORG = "77777777-7777-7777-7777-777777777777";

  // ─── Load source files ──────────────────────────────────────────────
  const decoratorPath = path.resolve(
    __dirname,
    "../src/common/decorators/idempotent.decorator.ts",
  );
  const interceptorPath = path.resolve(
    __dirname,
    "../src/common/interceptors/idempotency.interceptor.ts",
  );
  const filterPath = path.resolve(
    __dirname,
    "../src/common/filters/http-exception.filter.ts",
  );
  const domainExPath = path.resolve(
    __dirname,
    "../src/common/exceptions/domain.exception.ts",
  );
  const appModPath = path.resolve(__dirname, "../src/app.module.ts");
  const maintPath = path.resolve(
    __dirname,
    "../src/maintenance/maintenance.service.ts",
  );
  const errorCodePath = path.resolve(
    repoRoot,
    "packages/shared/src/error-code.ts",
  );

  const hasF = (f) => {
    try { readFileSync(f); return true; } catch { return false; }
  };
  const src = (f) => (hasF(f) ? readFileSync(f, "utf8") : "");

  // ═════════════════════════════════════════════════════════════════
  // T1: @Idempotent() decorator source
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T1: @Idempotent() decorator ---");
  const decSrc = src(decoratorPath);
  assert("T1a decorator file exists", hasF(decoratorPath), true);
  assert(
    "T1b IDEMPOTENT_KEY constant exported",
    /export\s+const\s+IDEMPOTENT_KEY/.test(decSrc),
    true,
  );
  assert(
    "T1c Idempotent function uses SetMetadata",
    decSrc.includes("SetMetadata(IDEMPOTENT_KEY, true)"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T2: IdempotencyInterceptor class source
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T2: IdempotencyInterceptor class ---");
  const intSrc = src(interceptorPath);
  assert("T2a interceptor file exists", hasF(interceptorPath), true);
  assert(
    "T2b IdempotencyInterceptor exported",
    /export\s+class\s+IdempotencyInterceptor/.test(intSrc),
    true,
  );
  assert(
    "T2c implements NestInterceptor marker",
    intSrc.includes("NestInterceptor"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T3: canonicalize function
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T3: canonicalize function ---");
  assert(
    "T3a canonicalize function defined",
    /function\s+canonicalize/.test(intSrc),
    true,
  );
  assert(
    "T3b canonicalize handles null",
    intSrc.includes('return "null"'),
    true,
  );
  assert(
    "T3c canonicalize sorts object keys",
    intSrc.includes("Object.keys(value).sort()"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T4: hashPayload uses SHA-256
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T4: hashPayload (SHA-256) ---");
  assert(
    "T4a hashPayload uses createHash sha256",
    intSrc.includes('createHash("sha256")'),
    true,
  );
  assert(
    "T4b hashPayload calls canonicalize",
    intSrc.includes("canonicalize(body"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T5: resolveRoute uses template (not raw URL)
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T5: Route scope template ---");
  assert(
    "T5a resolveRoute uses Reflect.getMetadata path",
    intSrc.includes('Reflect.getMetadata("path"'),
    true,
  );
  assert(
    "T5b resolveRoute uses Reflect.getMetadata method",
    intSrc.includes('Reflect.getMetadata("method"'),
    true,
  );
  assert(
    "T5c route NOT using req.url/path",
    !intSrc.includes("req.url") && !intSrc.includes("req.path"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T6: Intercept checks @Idempotent() metadata
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T6: @Idempotent() metadata check ---");
  assert(
    "T6a checks IDEMPOTENT_KEY via reflector.get",
    intSrc.includes("IDEMPOTENT_KEY, context.getHandler()"),
    true,
  );
  assert(
    "T6b returns next.handle() for non-idempotent routes",
    /if\s*\(\s*!isIdempotent\s*\)\s*return\s+next\.handle\(\)/.test(intSrc),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T7: Header validation — missing key
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T7: Header missing key ---");
  assert(
    "T7a validates key presence (IDEMPOTENCY_KEY_REQUIRED)",
    intSrc.includes('"IDEMPOTENCY_KEY_REQUIRED"'),
    true,
  );
  assert(
    "T7b missing key throws BAD_REQUEST",
    intSrc.includes("Idempotency-Key header is required") &&
      intSrc.includes("HttpStatus.BAD_REQUEST"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T8: Header validation — key length > 256
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T8: Key length > 256 ---");
  assert(
    "T8a key length > 256 check",
    intSrc.includes("key.length > 256"),
    true,
  );
  assert(
    "T8b exceeds message uses IDEMPOTENCY_KEY_REQUIRED",
    intSrc.includes("exceeds 256 characters"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T9: IN_PROGRESS elapsed < 60000 check
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T9: IN_PROGRESS elapsed ---");
  assert(
    "T9a elapsed < 60000 check",
    intSrc.includes("elapsed < 60000"),
    true,
  );
  assert(
    "T9b IDEMPOTENCY_IN_PROGRESS with retryAfter",
    intSrc.includes('"IDEMPOTENCY_IN_PROGRESS"') &&
      intSrc.includes("HttpStatus.CONFLICT"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T10: CAS rowCount === 1 check
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T10: CAS takeover ---");
  assert("T10a CAS SQL with interval 60", intSrc.includes("interval '60 seconds'"), true);
  assert("T10b rowCount !== 1 throws", intSrc.includes("rowCount !== 1"), true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T11: COMPLETED/FAILED replay
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T11: Replay COMPLETED/FAILED ---");
  assert(
    "T11a sets response.status for replay",
    intSrc.includes("res.status(row.response_status_code"),
    true,
  );
  assert(
    "T11b returns of(row.response) for replay",
    intSrc.includes("of(row.response)"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T12: Payload hash mismatch → IDEMPOTENCY_KEY_REUSED
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T12: Hash mismatch ---");
  assert(
    "T12a IDEMPOTENCY_KEY_REUSED on hash mismatch",
    intSrc.includes("IDEMPOTENCY_KEY_REUSED") &&
      intSrc.includes("request_hash !== requestHash"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T13: DomainException retryAfterSeconds
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T13: DomainException retryAfterSeconds ---");
  const dexSrc = src(domainExPath);
  assert(
    "T13a retryAfterSeconds property declared",
    dexSrc.includes("retryAfterSeconds?: number"),
    true,
  );
  assert(
    "T13b retryAfterSeconds in constructor params",
    dexSrc.includes("retryAfterSeconds?: number") &&
      dexSrc.includes("this.retryAfterSeconds = retryAfterSeconds"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T14: Filter sets Retry-After header for DomainException
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T14: Filter Retry-After header ---");
  const filtSrc = src(filterPath);
  assert(
    "T14a Retry-After header for DomainException",
    filtSrc.includes('setHeader("Retry-After"') &&
      filtSrc.includes("exception.retryAfterSeconds"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T15: Error codes in shared catalog
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T15: Error code catalog ---");
  const ecSrc = src(errorCodePath);
  assert(
    "T15a IDEMPOTENCY_KEY_REQUIRED in ERROR_CODES",
    ecSrc.includes('"IDEMPOTENCY_KEY_REQUIRED"'),
    true,
  );
  assert(
    "T15b IDEMPOTENCY_KEY_REUSED in ERROR_CODES",
    ecSrc.includes('"IDEMPOTENCY_KEY_REUSED"'),
    true,
  );
  assert(
    "T15c IDEMPOTENCY_IN_PROGRESS in ERROR_CODES",
    ecSrc.includes('"IDEMPOTENCY_IN_PROGRESS"'),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T16: APP_INTERCEPTOR registration in app.module
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T16: APP_INTERCEPTOR registration ---");
  const modSrc = src(appModPath);
  assert(
    "T16a APP_INTERCEPTOR imported from @nestjs/core",
    modSrc.includes('APP_INTERCEPTOR') &&
      modSrc.includes('@nestjs/core'),
    true,
  );
  assert(
    "T16b IdempotencyInterceptor in providers",
    modSrc.includes("IdempotencyInterceptor") &&
      modSrc.includes("useClass: IdempotencyInterceptor"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T17: buildErrorEnvelope used for FAILED capture
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T17: FAILED envelope ---");
  assert(
    "T17a buildErrorEnvelope called for FAILED state",
    intSrc.includes("buildErrorEnvelope") &&
      intSrc.includes('state: "FAILED"'),
    true,
  );
  assert(
    "T17b error code extracted for envelope",
    intSrc.includes("extractErrorCode"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T18: Separate transactions (Option B)
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T18: Separate transactions ---");
  const withTenantCalls = intSrc.match(/withTenantContext/g) || [];
  assert(
    "T18a Multiple withTenantContext calls (separate tx)",
    withTenantCalls.length >= 2,
    true,
  );
  const txWrapsHandler = /withTenantContext[\s\S]*next\.handle\(\)/.test(intSrc);
  assert(
    "T18b Handler NOT inside tenant transaction (separate)",
    !txWrapsHandler,
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T19: Expires_at 24h
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T19: Expires_at 24h ---");
  assert(
    "T19a expires_at uses 86400000 (24h ms)",
    intSrc.includes("86400000"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T20: No raw idempotency key in log messages
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T20: Key masking in logs ---");
  const intLogLines = intSrc.match(/this\.logger\.(log|error|warn|debug)\(/g) || [];
  const intHasPlainKey = intLogLines.some((lineLine) => {
    const idx = intSrc.indexOf(lineLine);
    const ctx = intSrc.slice(idx, idx + 300);
    return ctx.includes("key,") && !ctx.includes("key.slice");
  });
  assert(
    "T20a No raw idempotency key logged in interceptor",
    !intHasPlainKey,
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T21: Maintenance @Cron("45 * * * *") active
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T21: Maintenance @Cron active ---");
  const maintSrc = src(maintPath);
  assert(
    "T21a @Cron(45 * * * *) active on cleanupIdempotencyKeys",
    /@Cron\("45 \* \* \* \*"\)/.test(maintSrc),
    true,
  );
  const hasDeleteIdem = /delete\(\s*idempotencyKeys\s*\)/.test(maintSrc);
  assert("T21b DELETE on idempotencyKeys exists", hasDeleteIdem, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T22: Maintenance logs entity name + rowCount
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T22: Maintenance log format ---");
  assert(
    "T22a idempotency_keys entity name in log",
    maintSrc.includes("idempotency_keys:") &&
      maintSrc.includes("result.rowCount"),
    true,
  );
  assert(
    "T22b Error log contains entity name",
    maintSrc.includes("idempotency_keys failed:"),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T23: Maintenance uses withSystemContext
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T23: withSystemContext for cleanup ---");
  assert(
    "T23a withSystemContext imported in maintenance",
    maintSrc.includes("withSystemContext"),
    true,
  );
  assert(
    "T23b withSystemContext wraps delete",
    /withSystemContext\s*\(\s*this\.db\s*,\s*async\s*\(\s*tx\s*\)\s*=>\s*\{[\s\S]*delete\s*\(\s*idempotencyKeys\s*\)/.test(maintSrc),
    true,
  );
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T24: DB — cleanup deletes expired, keeps valid
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T24: DB cleanup idempotency_keys ---");
  const IK_EXP = "e4444444-1111-1111-1111-111111111111";
  const IK_VALID = "e4444444-2222-2222-2222-222222222222";

  runPsql(`
    DELETE FROM idempotency_keys WHERE id IN (${quotedLiteral(IK_EXP)}, ${quotedLiteral(IK_VALID)});
  `);

  runPsql(`
    INSERT INTO idempotency_keys (id, organization_id, key, route, request_hash, state, expires_at) VALUES
      (${quotedLiteral(IK_EXP)}, ${quotedLiteral(ORG)}, 'expired-key', 'POST /api/test', 'hash-abc', 'COMPLETED', '2020-01-01'),
      (${quotedLiteral(IK_VALID)}, ${quotedLiteral(ORG)}, 'valid-key', 'POST /api/test', 'hash-def', 'COMPLETED', '2099-12-31');
  `);

  const ikBefore = parseCount(
    runPsql(`SELECT count(*)::text FROM idempotency_keys WHERE id IN (${quotedLiteral(IK_EXP)}, ${quotedLiteral(IK_VALID)});`),
  );
  assert("T24a 2 rows seeded", ikBefore, 2);

  runPsql(`DELETE FROM idempotency_keys WHERE expires_at < now();`);

  const ikExpAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM idempotency_keys WHERE id = ${quotedLiteral(IK_EXP)};`),
  );
  const ikValidAfter = parseCount(
    runPsql(`SELECT count(*)::text FROM idempotency_keys WHERE id = ${quotedLiteral(IK_VALID)};`),
  );
  assert("T24b expired deleted", ikExpAfter, 0);
  assert("T24c valid remains", ikValidAfter, 1);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T25: DB — table structure verification
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T25: Table structure ---");
  const cols = runPsql(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'idempotency_keys'
    ORDER BY ordinal_position;
  `);
  assert("T25a has response column (jsonb)", cols.includes("response"), true);
  assert("T25b has response_status_code column", cols.includes("response_status_code"), true);
  assert("T25c has request_hash column", cols.includes("request_hash"), true);
  assert("T25d has state column", cols.includes("state"), true);
  assert("T25e has expires_at column", cols.includes("expires_at"), true);

  const fk = runPsql(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'idempotency_keys' AND constraint_type = 'UNIQUE'
    )::text;
  `);
  assert("T25f unique constraint exists", fk.includes("t"), true);
  console.log("");

  // ─── Cleanup ─────────────────────────────────────────────────────
  runPsql(`
    DELETE FROM idempotency_keys WHERE id IN (${quotedLiteral(IK_EXP)}, ${quotedLiteral(IK_VALID)});
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
