import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function envFile() {
  try {
    return Object.fromEntries(
      readFileSync(path.join(root, ".env"), "utf8")
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/gu, "")];
        }),
    );
  } catch {
    return {};
  }
}

const fileEnv = envFile();
const value = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;
const host = value("POSTGRES_HOST", "localhost");
const port = Number(value("POSTGRES_PORT", "5432"));
const database = value("POSTGRES_DB", "nexos_migrations_gate");
const admin = new Pool({ host, port, database, user: value("POSTGRES_USER", "nexos"), password: value("POSTGRES_PASSWORD", "nexos_dev_password") });
const runtime = new Pool({ host, port, database, user: value("APP_RUNTIME_USER", "app_runtime"), password: value("APP_RUNTIME_PASSWORD", value("POSTGRES_PASSWORD", "nexos_dev_password")) });

const userA = randomUUID();
const userB = randomUUID();
const orgId = randomUUID();
const familyA = randomUUID();
const familyB = randomUUID();

async function main() {
  await admin.query(
    `INSERT INTO users (id,name,email,password_hash) VALUES ($1,'A',$2,'hash-a'),($3,'B',$4,'hash-b')`,
    [userA, `a-${userA}@example.com`, userB, `b-${userB}@example.com`],
  );
  await admin.query(`INSERT INTO organizations (id,name,slug) VALUES ($1,'RLS Org',$2)`, [orgId, `rls-${orgId}`]);
  await admin.query(
    `INSERT INTO organization_users (organization_id,user_id,role,status) VALUES ($1,$2,'OWNER','ACTIVE'),($1,$3,'MANAGER','ACTIVE')`,
    [orgId, userA, userB],
  );
  await admin.query(
    `INSERT INTO refresh_sessions (user_id,token_hash,family_id,expires_at) VALUES ($1,$2,$3,now()+interval '1 day'),($4,$5,$6,now()+interval '1 day')`,
    [userA, `refresh-${userA}`, familyA, userB, `refresh-${userB}`, familyB],
  );
  await admin.query(
    `INSERT INTO verification_tokens (user_id,purpose,token_hash,expires_at) VALUES ($1,'EMAIL_VERIFY',$2,now()+interval '1 day'),($3,'EMAIL_VERIFY',$4,now()+interval '1 day')`,
    [userA, `verify-${userA}`, userB, `verify-${userB}`],
  );

  assert.equal((await runtime.query("SELECT id FROM users")).rowCount, 0);
  await assert.rejects(() => runtime.query("SELECT password_hash FROM users"), /permission denied/u);
  const preAuth = await runtime.query("SELECT id FROM app_auth_find_user_by_email($1)", [`a-${userA}@example.com`]);
  assert.equal(preAuth.rows[0].id, userA);

  const client = await runtime.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id',$1,true)", [userA]);
    assert.equal((await client.query("SELECT id FROM users WHERE id=$1", [userA])).rowCount, 1);
    assert.equal((await client.query("SELECT id FROM users WHERE id=$1", [userB])).rowCount, 0);
    assert.equal((await client.query("SELECT id FROM refresh_sessions WHERE user_id=$1", [userA])).rowCount, 1);
    assert.equal((await client.query("SELECT id FROM refresh_sessions WHERE user_id=$1", [userB])).rowCount, 0);
    assert.equal((await client.query("SELECT id FROM verification_tokens WHERE user_id=$1", [userB])).rowCount, 0);
    assert.equal((await client.query("UPDATE users SET name='blocked' WHERE id=$1", [userB])).rowCount, 0);
    assert.equal((await client.query("SELECT id FROM app_auth_find_user_by_id($1)", [userB])).rowCount, 0);
    await client.query("SELECT set_config('app.current_organization_id',$1,true)", [orgId]);
    assert.equal((await client.query("SELECT id,name,email FROM users WHERE id=$1", [userB])).rowCount, 1);
    await client.query("ROLLBACK");
  } finally {
    client.release();
  }

  console.log("Identity RLS: PASS");
}

try {
  await main();
} finally {
  await runtime.end();
  await admin.query("DELETE FROM organizations WHERE id=$1", [orgId]).catch(() => {});
  await admin.query("DELETE FROM users WHERE id IN ($1,$2)", [userA, userB]).catch(() => {});
  await admin.end();
}
