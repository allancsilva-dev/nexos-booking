import { pgTable, uuid, text, timestamp, integer, boolean, smallint, time, char, inet, jsonb, primaryKey, unique, uniqueIndex, index, foreignKey } from "drizzle-orm/pg-core";
import { sql, isNotNull } from "drizzle-orm";

// ─── 4.1 users (global) ────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  password_hash: text("password_hash").notNull(),
  phone: text("phone"),
  email_verified_at: timestamp("email_verified_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_email_lower_uk").on(sql`lower(${table.email})`),
]);

// ─── 4.2 refresh_sessions (global) ─────────────────────────────────
export const refreshSessions = pgTable("refresh_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token_hash: text("token_hash").notNull(),
  family_id: uuid("family_id").notNull(),
  replaced_by: uuid("replaced_by"),
  user_agent: text("user_agent"),
  ip: inet("ip"),
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("refresh_sessions_token_hash_uk").on(table.token_hash),
  index("refresh_sessions_family_idx").on(table.family_id),
  index("refresh_sessions_expires_idx").on(table.expires_at),
  foreignKey({
    columns: [table.replaced_by],
    foreignColumns: [table.id],
  }),
]);

// ─── 4.3 verification_tokens (global) ──────────────────────────────
export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: text("purpose").notNull(),
  token_hash: text("token_hash").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  used_at: timestamp("used_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("verification_tokens_hash_uk").on(table.token_hash),
  index("verification_tokens_user_purpose_idx").on(table.user_id, table.purpose),
  index("verification_tokens_expires_idx").on(table.expires_at),
]);

// ─── 5.1 organizations ──────────────────────────────────────────────
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  slot_interval_min: integer("slot_interval_min").notNull().default(30),
  currency: char("currency", { length: 3 }).notNull().default("BRL"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("organizations_slug_uk").on(sql`lower(${table.slug})`),
]);

// ─── 5.2 organization_users ────────────────────────────────────────
export const organizationUsers = pgTable("organization_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("organization_users_org_user_uk").on(table.organization_id, table.user_id),
  index("organization_users_user_idx").on(table.user_id),
]);

// ─── 5.3 invitations (ADR-019) ─────────────────────────────────────
export const invitations = pgTable("invitations", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  token_hash: text("token_hash").notNull(),
  invited_by: uuid("invited_by").notNull().references(() => users.id),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("invitations_token_hash_uk").on(table.token_hash),
  index("invitations_expires_idx").on(table.expires_at),
]);

// ─── 6.1 professionals ─────────────────────────────────────────────
export const professionals = pgTable("professionals", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  user_id: uuid("user_id").references(() => users.id),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  active: boolean("active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("professionals_org_slug_uk").on(table.organization_id, sql`lower(${table.slug})`),
  index("professionals_org_idx").on(table.organization_id),
  unique("professionals_org_id_uk").on(table.organization_id, table.id),
  uniqueIndex("professionals_org_user_uk")
    .on(table.organization_id, table.user_id)
    .where(sql`${table.user_id} IS NOT NULL`),
]);

// ─── 6.2 services ──────────────────────────────────────────────────
export const services = pgTable("services", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  duration_min: integer("duration_min").notNull(),
  price_cents: integer("price_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull().default("BRL"),
  active: boolean("active").notNull().default(true),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("services_org_idx").on(table.organization_id),
  unique("services_org_id_uk").on(table.organization_id, table.id),
]);

// ─── 6.3 professional_services (junção, tenant-safe) ───────────────
export const professionalServices = pgTable("professional_services", {
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  professional_id: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
  service_id: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  slot_step_min: integer("slot_step_min"),
}, (table) => [
  primaryKey({ columns: [table.professional_id, table.service_id] }),
  index("professional_services_org_idx").on(table.organization_id),
]);

// ─── 6.4 working_hours ─────────────────────────────────────────────
export const workingHours = pgTable("working_hours", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  professional_id: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
  weekday: smallint("weekday").notNull(),
  start_time: time("start_time").notNull(),
  end_time: time("end_time").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("working_hours_prof_weekday_idx").on(table.professional_id, table.weekday),
]);

// ─── 6.5 availability_blocks ───────────────────────────────────────
export const availabilityBlocks = pgTable("availability_blocks", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  professional_id: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "cascade" }),
  starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
  ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),
  reason: text("reason"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("availability_blocks_prof_time_idx").on(table.professional_id, table.starts_at, table.ends_at),
]);

// ─── 7. clients ────────────────────────────────────────────────────
export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone"),
  phone_normalized: text("phone_normalized"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("clients_org_id_uk").on(table.organization_id, table.id),
  uniqueIndex("clients_org_phone_uk")
    .on(table.organization_id, table.phone_normalized)
    .where(isNotNull(table.phone_normalized)),
]);

// ─── 8.1 appointments ──────────────────────────────────────────────
export const appointments = pgTable("appointments", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  professional_id: uuid("professional_id").notNull().references(() => professionals.id, { onDelete: "restrict" }),
  service_id: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
  client_id: uuid("client_id").notNull().references(() => clients.id, { onDelete: "restrict" }),
  starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
  ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("CONFIRMED"),
  source: text("source").notNull(),
  note: text("note"),
  version: integer("version").notNull().default(1),
  // PROP-E1: snapshot do serviço no momento da reserva
  service_name_snapshot: text("service_name_snapshot").notNull(),
  service_duration_min_snapshot: integer("service_duration_min_snapshot").notNull(),
  service_price_cents_snapshot: integer("service_price_cents_snapshot").notNull(),
  service_currency_snapshot: char("service_currency_snapshot", { length: 3 }).notNull().default("BRL"),
  public_cancel_token_hash: text("public_cancel_token_hash"),
  public_cancel_token_expires_at: timestamp("public_cancel_token_expires_at", { withTimezone: true }),
  cancelled_by_type: text("cancelled_by_type"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique("appointments_org_id_uk").on(table.organization_id, table.id),
]);

// ─── 8.2 appointment_events ────────────────────────────────────────
export const appointmentEvents = pgTable("appointment_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  appointment_id: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
  event_type: text("event_type").notNull(),
  actor_type: text("actor_type").notNull(),
  actor_user_id: uuid("actor_user_id").references(() => users.id),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  published_at: timestamp("published_at", { withTimezone: true }),
  publish_attempts: integer("publish_attempts").notNull().default(0),
  last_publish_error: text("last_publish_error"),
  publish_failed_at: timestamp("publish_failed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("appointment_events_appt_idx").on(table.appointment_id, table.created_at),
  index("appointment_events_unpublished_idx")
    .on(table.created_at)
    .where(sql`${table.published_at} IS NULL AND ${table.publish_failed_at} IS NULL`),
]);

// ─── 9.1 idempotency_keys ──────────────────────────────────────────
export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  route: text("route").notNull(),
  request_hash: text("request_hash").notNull(),
  state: text("state").notNull().default("IN_PROGRESS"),
  response: jsonb("response"),
  response_status_code: integer("response_status_code"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex("idempotency_keys_org_key_route_uk").on(table.organization_id, table.key, table.route),
  index("idempotency_keys_expires_idx").on(table.expires_at),
]);

// ─── 9.2 audit_logs ────────────────────────────────────────────────
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  organization_id: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  actor_user_id: uuid("actor_user_id").references(() => users.id),
  action: text("action").notNull(),
  target_type: text("target_type"),
  target_id: uuid("target_id"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ip: inet("ip"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("audit_logs_org_created_idx").on(table.organization_id, table.created_at),
  index("audit_logs_actor_created_idx").on(table.actor_user_id, table.created_at),
]);
