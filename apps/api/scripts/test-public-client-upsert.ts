import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { DbService } from "../src/db/db.service";
import { applyTenantContext } from "../src/db/tenant-context";
import { PublicBookingRepository } from "../src/public-booking/public-booking.repository";

const host = process.env.POSTGRES_HOST ?? "localhost";
const port = Number(process.env.POSTGRES_PORT ?? "5432");
const database = process.env.POSTGRES_DB ?? "nexos_migrations_gate";
const admin = new Pool({
  host,
  port,
  database,
  user: process.env.POSTGRES_USER ?? "nexos",
  password: process.env.POSTGRES_PASSWORD ?? "nexos_dev_password",
});

const orgId = randomUUID();
const normalized = `5511${Date.now()}`;

async function main() {
  await admin.query("INSERT INTO organizations (id,name,slug) VALUES ($1,'Upsert Org',$2)", [orgId, `upsert-${orgId}`]);
  await admin.query(
    "INSERT INTO clients (organization_id,name,phone,phone_normalized) VALUES ($1,'Cadastro Balcao','+55 11 99999-0000',$2)",
    [orgId, normalized],
  );

  const db = new DbService();
  await db.onModuleInit();
  const repo = new PublicBookingRepository(db);
  const returned = await db.client.transaction(async (tx) => {
    await applyTenantContext(tx, orgId, null);
    return repo.upsertClientByPhone(tx, orgId, "Nome Anonimo", "+55 11 00000-0000", normalized);
  });

  assert.equal(returned?.name, "Cadastro Balcao");
  assert.equal(returned?.phone, "+55 11 99999-0000");
  const persisted = await admin.query("SELECT name,phone FROM clients WHERE organization_id=$1", [orgId]);
  assert.deepEqual(persisted.rows[0], { name: "Cadastro Balcao", phone: "+55 11 99999-0000" });
  await db.onModuleDestroy();
  console.log("Public client upsert preservation: PASS");
}

async function run() {
  try {
    await main();
  } finally {
    await admin.query("DELETE FROM organizations WHERE id=$1", [orgId]).catch(() => {});
    await admin.end();
  }
}

void run();
