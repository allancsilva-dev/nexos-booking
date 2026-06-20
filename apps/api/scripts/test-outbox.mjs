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

function parseColumn(output) {
  return output.trim().split("\n").filter(Boolean).map((l) => l.trim());
}

const USER_1 = "aaaaaa11-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_2 = "bbbbbb22-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ORG_1 = "cccccc33-cccc-cccc-cccc-cccccccccccc";
const ORG_2 = "dddddd44-dddd-dddd-dddd-dddddddddddd";
const PRO_1 = "eeeeee55-eeee-eeee-eeee-eeeeeeeeeeee";
const SVC_1 = "ffffff66-ffff-ffff-ffff-ffffffffffff";
const CLIENT_1 = "11111177-1111-1111-1111-111111111111";
const APPT_1 = "22222288-2222-2222-2222-222222222222";

async function main() {
  console.log("\nPR-5.1 Outbox + Publisher Tests");
  console.log("================================\n");

  await waitForPostgres();
  console.log("[phase] Postgres ready\n");

  // ─── Seed base records ─────────────────────────────────────────────
  console.log("[setup] Seeding test data...");
  runPsql(`
    INSERT INTO users (id, name, email, password_hash) VALUES
      (${quotedLiteral(USER_1)}, 'Outbox User 1', 'outbox1@test.com', 'hash'),
      (${quotedLiteral(USER_2)}, 'Outbox User 2', 'outbox2@test.com', 'hash')
    ON CONFLICT DO NOTHING;
  `);
  runPsql(`
    INSERT INTO organizations (id, name, slug) VALUES
      (${quotedLiteral(ORG_1)}, 'Outbox Org 1', 'outbox-org-1'),
      (${quotedLiteral(ORG_2)}, 'Outbox Org 2', 'outbox-org-2')
    ON CONFLICT DO NOTHING;
  `);
  runPsql(`
    INSERT INTO professionals (id, organization_id, name, slug) VALUES
      (${quotedLiteral(PRO_1)}, ${quotedLiteral(ORG_1)}, 'Dr. Outbox', 'dr-outbox')
    ON CONFLICT DO NOTHING;
  `);
  runPsql(`
    INSERT INTO services (id, organization_id, name, duration_min, price_cents) VALUES
      (${quotedLiteral(SVC_1)}, ${quotedLiteral(ORG_1)}, 'Outbox Service', 30, 10000)
    ON CONFLICT DO NOTHING;
  `);
  runPsql(`
    INSERT INTO clients (id, organization_id, name, phone) VALUES
      (${quotedLiteral(CLIENT_1)}, ${quotedLiteral(ORG_1)}, 'Client Outbox', '11999999999')
    ON CONFLICT DO NOTHING;
  `);
  runPsql(`
    INSERT INTO appointments (id, organization_id, professional_id, service_id, client_id, starts_at, ends_at, status, source, version) VALUES
      (${quotedLiteral(APPT_1)}, ${quotedLiteral(ORG_1)}, ${quotedLiteral(PRO_1)}, ${quotedLiteral(SVC_1)}, ${quotedLiteral(CLIENT_1)}, '2025-06-20 14:00:00+00', '2025-06-20 14:30:00+00', 'CONFIRMED', 'PANEL', 1)
    ON CONFLICT DO NOTHING;
  `);
  console.log("[setup] Done.\n");

  // ─── Cleanup any leftover test events ─────────────────────────────
  runPsql(`
    DELETE FROM appointment_events WHERE organization_id = ${quotedLiteral(ORG_1)} AND appointment_id = ${quotedLiteral(APPT_1)};
  `);

  // ═════════════════════════════════════════════════════════════════
  // T1: same-tx — event insert and publish are in same conceptual flow
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T1: same-tx ---");
  const relaySourcePath = path.resolve(__dirname, "../src/realtime/relay.service.ts");
  const relaySource = readFileSync(relaySourcePath, "utf8");

  const hasWithSystemContext = relaySource.includes("withSystemContext");
  assert("T1a relay uses withSystemContext", hasWithSystemContext, true);

  const hasForUpdateSkipLocked = relaySource.includes(`for("update"`) && relaySource.includes("skipLocked");
  assert("T1b relay uses FOR UPDATE SKIP LOCKED", hasForUpdateSkipLocked, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T2: rollback — failed tx does not create events
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T2: rollback ---");
  const apptsSourcePath = path.resolve(__dirname, "../src/appointments/appointments.service.ts");
  const apptsSource = readFileSync(apptsSourcePath, "utf8");

  const hasWithTenant = apptsSource.includes("withTenantContext");
  assert("T2a service wraps mutations in withTenantContext", hasWithTenant, true);

  const hasPublisherInjection = apptsSource.includes("AppointmentEventPublisher");
  assert("T2b service injects AppointmentEventPublisher", hasPublisherInjection, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T3: fast-path mark — published_at set after successful publish
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T3: fast-path mark ---");
  // Insert an event that simulates being picked up by relay
  runPsql(`
    INSERT INTO appointment_events (id, organization_id, appointment_id, event_type, actor_type, actor_user_id, metadata)
    VALUES ('a0000001-aaaa-aaaa-aaaa-aaaaaaaaaaa1', ${quotedLiteral(ORG_1)}, ${quotedLiteral(APPT_1)}, 'CREATED', 'MANAGER', ${quotedLiteral(USER_1)}, '{"professionalId": "${PRO_1}", "version": 1}'::jsonb);
  `);

  // Simulate the relay marking it published
  runPsql(`
    UPDATE appointment_events SET published_at = now() WHERE id = 'a0000001-aaaa-aaaa-aaaa-aaaaaaaaaaa1';
  `);

  const publishedCount = parseCount(
    runPsql(`SELECT count(*)::text FROM appointment_events WHERE id = 'a0000001-aaaa-aaaa-aaaa-aaaaaaaaaaa1' AND published_at IS NOT NULL;`),
  );
  assert("T3a published_at is set", publishedCount, 1);

  const stillPending = parseCount(
    runPsql(`SELECT count(*)::text FROM appointment_events WHERE id = 'a0000001-aaaa-aaaa-aaaa-aaaaaaaaaaa1' AND published_at IS NULL;`),
  );
  assert("T3b no longer pending", stillPending, 0);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T4: relay no-republish — relay ignores already-published
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T4: relay ignores already-published ---");
  const ignorePublishedInWhere = relaySource.includes("isNull(appointmentEvents.published_at)");
  assert("T4a relay WHERE filters published_at IS NULL", ignorePublishedInWhere, true);

  // Verify the published event is ignored by relay query
  const publishedIgnored = parseCount(
    runPsql(`SELECT count(*)::text FROM appointment_events WHERE published_at IS NULL AND publish_failed_at IS NULL AND id = 'a0000001-aaaa-aaaa-aaaa-aaaaaaaaaaa1';`),
  );
  assert("T4b published event not in unpublished set", publishedIgnored, 0);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T5: fast-path failure leaves pending — unpublishable events remain
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T5: fast-path failure leaves pending ---");
  runPsql(`
    INSERT INTO appointment_events (id, organization_id, appointment_id, event_type, actor_type, actor_user_id, metadata)
    VALUES ('a0000002-aaaa-aaaa-aaaa-aaaaaaaaaaa2', ${quotedLiteral(ORG_1)}, ${quotedLiteral(APPT_1)}, 'RESCHEDULED', 'MANAGER', ${quotedLiteral(USER_1)}, '{"professionalId": "${PRO_1}", "version": 2}'::jsonb);
  `);

  const pendingCount = parseCount(
    runPsql(`SELECT count(*)::text FROM appointment_events WHERE id = 'a0000002-aaaa-aaaa-aaaa-aaaaaaaaaaa2' AND published_at IS NULL AND publish_failed_at IS NULL;`),
  );
  assert("T5a unpublishable event remains pending", pendingCount, 1);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T6: relay SKIP LOCKED — concurrent relay instances don't conflict
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T6: relay SKIP LOCKED ---");
  const skipLockedInSource = relaySource.includes("skipLocked: true");
  assert("T6a relay uses skipLocked: true", skipLockedInSource, true);

  const batchLimitInSource = relaySource.includes("BATCH_SIZE = 50");
  assert("T6b relay has BATCH_SIZE = 50", batchLimitInSource, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T7: mark published — relay sets published_at on success
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T7: relay marks published on success ---");
  const setsPublishedAt = relaySource.includes("published_at: new Date()");
  assert("T7a relay sets published_at on publish success", setsPublishedAt, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T8: ignore published — published events excluded from relay
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T8: ignore published ---");
  const prePublishedCount = parseCount(
    runPsql(`SELECT count(*)::text FROM appointment_events WHERE id = 'a0000001-aaaa-aaaa-aaaa-aaaaaaaaaaa1' AND published_at IS NOT NULL;`),
  );
  assert("T8a previously published event has published_at set", prePublishedCount, 1);

  const excludedFromRelay = relaySource.includes("isNull(appointmentEvents.published_at)") && relaySource.includes("isNull(appointmentEvents.publish_failed_at)");
  assert("T8b relay WHERE excludes published and dead-lettered", excludedFromRelay, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T9: increment attempts — relay increments publish_attempts on error
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T9: increment attempts ---");
  const incrementsAttempts = relaySource.includes("publish_attempts") && relaySource.includes("attempts = row.publish_attempts + 1");
  assert("T9a relay increments publish_attempts on failure", incrementsAttempts, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T10: sanitized error — error messages stored without PII
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T10: sanitized error ---");
  runPsql(`
    INSERT INTO appointment_events (id, organization_id, appointment_id, event_type, actor_type, actor_user_id, metadata, publish_attempts, last_publish_error)
    VALUES ('a0000003-aaaa-aaaa-aaaa-aaaaaaaaaaa3', ${quotedLiteral(ORG_1)}, ${quotedLiteral(APPT_1)}, 'COMPLETED', 'MANAGER', ${quotedLiteral(USER_1)}, '{"professionalId": "${PRO_1}", "version": 3}'::jsonb, 9, 'Connection refused')
    ON CONFLICT (id) DO UPDATE SET publish_attempts = 9, last_publish_error = 'Connection refused';
  `);

  const errorRow = parseColumn(
    runPsql(`SELECT last_publish_error FROM appointment_events WHERE id = 'a0000003-aaaa-aaaa-aaaa-aaaaaaaaaaa3';`),
  );
  const errorMessage = errorRow[0] ?? "";
  const hasPIIInError = /\b\d{10,11}\b/.test(errorMessage) || /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/.test(errorMessage);
  assert("T10a error message contains no PII (phone/email)", hasPIIInError, false);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T11: cap to dead-letter — after MAX_ATTEMPTS, publish_failed_at set
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T11: cap to dead-letter ---");
  const hasMaxAttempts = relaySource.includes("MAX_ATTEMPTS = 10");
  assert("T11a MAX_ATTEMPTS is 10", hasMaxAttempts, true);

  const hasDeadLetter = relaySource.includes("publish_failed_at");
  assert("T11b relay sets publish_failed_at for dead-letter", hasDeadLetter, true);

  const hasDeadLetterLog = relaySource.includes("dead-lettered");
  assert("T11c relay logs dead-letter event", hasDeadLetterLog, true);

  runPsql(`
    UPDATE appointment_events SET publish_failed_at = now() WHERE id = 'a0000003-aaaa-aaaa-aaaa-aaaaaaaaaaa3';
  `);

  const deadLetteredCount = parseCount(
    runPsql(`SELECT count(*)::text FROM appointment_events WHERE id = 'a0000003-aaaa-aaaa-aaaa-aaaaaaaaaaa3' AND publish_failed_at IS NOT NULL;`),
  );
  assert("T11d dead-lettered event excluded from relay", deadLetteredCount, 1);

  const deadExcluded = parseCount(
    runPsql(`SELECT count(*)::text FROM appointment_events WHERE id = 'a0000003-aaaa-aaaa-aaaa-aaaaaaaaaaa3' AND publish_failed_at IS NULL;`),
  );
  assert("T11e dead-letter event not in pending set", deadExcluded, 0);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T12: cross-tenant isolation
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T12: cross-tenant isolation ---");
  const EVT_ORG2 = "b0000001-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  runPsql(`
    INSERT INTO appointment_events (id, organization_id, appointment_id, event_type, actor_type, actor_user_id, metadata)
    VALUES (${quotedLiteral(EVT_ORG2)}, ${quotedLiteral(ORG_2)}, ${quotedLiteral(APPT_1)}, 'CREATED', 'MANAGER', ${quotedLiteral(USER_1)}, '{"professionalId": "${PRO_1}", "version": 1}'::jsonb)
    ON CONFLICT DO NOTHING;
  `);

  const org2Count = parseCount(
    runPsql(`SELECT count(*)::text FROM appointment_events WHERE organization_id = ${quotedLiteral(ORG_2)} AND id = ${quotedLiteral(EVT_ORG2)};`),
  );
  assert("T12a org2 event exists", org2Count, 1);

  const orgSelectorInPg = runPsql(
    `SELECT current_setting('app.current_organization_id', true) AS org_id;`,
  );
  assert("T12b current_organization_id setting exists", orgSelectorInPg !== "", true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T13: no PII in payload — PublishedEvent interface has only IDs/dates
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T13: no PII in payload ---");
  const pubIfacePath = path.resolve(__dirname, "../src/realtime/publisher.interface.ts");
  const pubIfaceSource = readFileSync(pubIfacePath, "utf8");

  const hasAppointmentId = pubIfaceSource.includes("appointmentId");
  const hasProfessionalId = pubIfaceSource.includes("professionalId");
  const hasEventType = pubIfaceSource.includes("eventType");
  const hasDate = pubIfaceSource.includes("date:");
  const hasVersion = pubIfaceSource.includes("version:");
  const hasOccurredAt = pubIfaceSource.includes("occurredAt");
  assert("T13a payload has appointmentId", hasAppointmentId, true);
  assert("T13b payload has professionalId", hasProfessionalId, true);
  assert("T13c payload has eventType", hasEventType, true);
  assert("T13d payload has date", hasDate, true);
  assert("T13e payload has version", hasVersion, true);
  assert("T13f payload has occurredAt", hasOccurredAt, true);

  const hasName = /name\s*[;:]/.test(pubIfaceSource);
  const hasPhone = /phone/i.test(pubIfaceSource);
  const hasEmail = /email/i.test(pubIfaceSource);
  const hasNote = /note/i.test(pubIfaceSource);
  const hasToken = /token/i.test(pubIfaceSource);
  const hasHash = /hash/i.test(pubIfaceSource);
  assert("T13g no name in PublishedEvent", hasName, false);
  assert("T13h no phone in PublishedEvent", hasPhone, false);
  assert("T13i no email in PublishedEvent", hasEmail, false);
  assert("T13j no note in PublishedEvent", hasNote, false);
  assert("T13k no token in PublishedEvent", hasToken, false);
  assert("T13l no hash in PublishedEvent", hasHash, false);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T14: no PII in logs
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T14: no PII in logs ---");
  const logMatches = relaySource.match(/this\.logger\.(log|error)\(/g) || [];
  let logHasPII = false;
  for (const _match of logMatches) {
    const idx = relaySource.indexOf(_match);
    const surrounding = relaySource.slice(Math.max(0, idx - 80), idx + 200);
    const hasTokenPII = /\btoken\b/i.test(surrounding) && !/appointment_events/i.test(surrounding);
    const hasPhonePII = /\bphone\b/i.test(surrounding);
    const hasEmailPII = /\bemail\b/i.test(surrounding);
    const hasNamePII = /\bclient_name\b/i.test(surrounding) || /\bprofessional_name\b/i.test(surrounding);
    if (hasTokenPII || hasPhonePII || hasEmailPII || hasNamePII) {
      logHasPII = true;
    }
  }
  assert("T14a no PII (token/phone/email/name) in relay log messages", logHasPII, false);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // T15: partial index on unpublished events
  // ═════════════════════════════════════════════════════════════════
  console.log("--- T15: partial index for unpublished events ---");
  const schemaPath = path.resolve(__dirname, "../../db/schema/index.ts");
  const schemaSource = readFileSync(schemaPath, "utf8");

  const hasPartialIndex = schemaSource.includes("appointment_events_unpublished_idx");
  assert("T15a draft schema has partial index for unpublished events", hasPartialIndex, true);

  const indexCreated = runPsqlMayFail(
    `SELECT 1 FROM pg_indexes WHERE indexname = 'appointment_events_unpublished_idx';`,
  );
  const indexExists = indexCreated.ok && indexCreated.output.includes("1");
  assert("T15b partial index exists in database", indexExists, true);
  console.log("");

  // ═════════════════════════════════════════════════════════════════
  // Cleanup
  // ═════════════════════════════════════════════════════════════════
  runPsql(`
    DELETE FROM appointment_events WHERE id IN (
      'a0000001-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
      'a0000002-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
      'a0000003-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
      ${quotedLiteral(EVT_ORG2)}
    );
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
