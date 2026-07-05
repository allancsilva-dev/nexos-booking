// Conformance smoke — exercita TODOS os endpoints que o front consome hoje.
// Sobe a API em :3097, registra uma org nova e percorre o golden path,
// assertando status HTTP + presença dos campos que os hooks do front leem.
// Uso: node scripts/smoke-conformance.mjs
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";

const PORT = "3097";
const BASE = `http://localhost:${PORT}`;
let pass = 0;
let fail = 0;
const failures = [];

function ok(name) {
  pass++;
  console.log(`  ✓ ${name}`);
}
function bad(name, detail) {
  fail++;
  failures.push({ name, detail });
  console.log(`  ✗ ${name}\n      ${detail}`);
}
function check(name, cond, detail) {
  if (cond) ok(name);
  else bad(name, detail ?? "assertion failed");
}
function hasKeys(obj, keys) {
  if (!obj || typeof obj !== "object") return `not an object: ${JSON.stringify(obj)}`;
  const missing = keys.filter((k) => !(k in obj));
  return missing.length ? `missing keys: ${missing.join(", ")}` : null;
}

function loadDotEnv(dir) {
  const p = path.resolve(dir, ".env");
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const raw of fs.readFileSync(p, "utf-8").split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[line.slice(0, i).trim()] = v;
  }
  return out;
}

function req(pathname, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE);
    const r = http.request(url, { method: opts.method ?? "GET", headers: opts.headers ?? {} }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(body); } catch { /* non-json */ }
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

async function waitForApi(ms = 25000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try { const r = await req("/health"); if (r.status === 200) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("API did not start");
}

function startApi() {
  const apiDir = new URL("..", import.meta.url).pathname;
  const repoRoot = path.resolve(apiDir, "../..");
  const dotEnv = loadDotEnv(repoRoot);
  const dbPort = dotEnv.POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? "5432";
  const dbHost = dotEnv.POSTGRES_HOST ?? process.env.POSTGRES_HOST ?? "127.0.0.1";
  const env = {
    ...process.env, ...dotEnv,
    PORT, ENABLE_HTTP_TEST_HARNESS: "0", NODE_ENV: "development",
    PGHOST: undefined, PGUSER: undefined, PGPASSWORD: undefined, PGDATABASE: undefined, PGPORT: undefined,
    DATABASE_URL: dotEnv.DATABASE_URL ?? process.env.DATABASE_URL ??
      `postgres://${dotEnv.POSTGRES_USER ?? "nexos_booking"}:${dotEnv.POSTGRES_PASSWORD ?? ""}@${dbHost}:${dbPort}/${dotEnv.POSTGRES_DB ?? "nexos_booking"}`,
  };
  const tsxBin = path.resolve(apiDir, "node_modules/.bin/tsx");
  const proc = spawn(tsxBin, ["src/main.ts"], { cwd: apiDir, env, stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (c) => (stderr += c.toString()));
  return { proc, getStderr: () => stderr };
}

// Próxima segunda-feira em YYYY-MM-DD e um ISO de slot dentro do expediente.
function nextMonday() {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function main() {
  const api = startApi();
  let auth, orgId, svcId, profId, blockId, apptId, apptVersion;
  try {
    await waitForApi();
    console.log("API up.\n");
    const J = { "Content-Type": "application/json" };

    // ── auth/register ──
    const email = `smoke_${Date.now()}@nexos.test`;
    let r = await req("/api/v1/auth/register", {
      method: "POST", headers: J,
      body: JSON.stringify({ name: "Smoke Owner", email, password: "smoke-pass-123", organizationName: "Smoke Org" }),
    });
    check("auth/register → 201", r.status === 201, `status=${r.status} body=${r.body}`);
    check("register payload {user,organization,accessToken}", !hasKeys(r.json, ["user", "organization", "accessToken"]), hasKeys(r.json ?? {}, ["user", "organization", "accessToken"]));
    auth = r.json?.accessToken;
    orgId = r.json?.organization?.id;
    const H = { ...J, Authorization: `Bearer ${auth}` };

    // ── auth/me ──
    r = await req("/api/v1/auth/me", { headers: H });
    check("auth/me → 200", r.status === 200, `status=${r.status} body=${r.body}`);
    check("me payload {user,activeOrg,memberships}", !hasKeys(r.json, ["user", "activeOrg", "memberships"]), hasKeys(r.json ?? {}, ["user", "activeOrg", "memberships"]));

    // ── organizations GET/PATCH ──
    r = await req(`/api/v1/organizations/${orgId}`, { headers: H });
    check("GET organizations/:id → 200", r.status === 200, `status=${r.status} body=${r.body}`);
    check("org payload {id,name,slug,timezone,slotIntervalMin,currency}", !hasKeys(r.json, ["id", "name", "slug", "timezone", "slotIntervalMin", "currency"]), hasKeys(r.json ?? {}, ["id", "name", "slug", "timezone", "slotIntervalMin", "currency"]));
    r = await req(`/api/v1/organizations/${orgId}`, { method: "PATCH", headers: H, body: JSON.stringify({ name: "Smoke Org 2", timezone: "America/Sao_Paulo", slotIntervalMin: 30 }) });
    check("PATCH organizations/:id → 200", r.status === 200, `status=${r.status} body=${r.body}`);

    // ── services ──
    r = await req("/api/v1/services", { headers: H });
    check("GET services → 200 array", r.status === 200 && Array.isArray(r.json), `status=${r.status} body=${r.body}`);
    r = await req("/api/v1/services", { method: "POST", headers: H, body: JSON.stringify({ name: "Corte", durationMin: 30, priceCents: 5000, bufferAfterMin: 10 }) });
    check("POST services → 201", r.status === 201, `status=${r.status} body=${r.body}`);
    check("service payload (ServiceDTO)", !hasKeys(r.json, ["id", "name", "durationMin", "bufferAfterMin", "priceCents", "currency", "active"]), hasKeys(r.json ?? {}, ["id", "name", "durationMin", "bufferAfterMin", "priceCents", "currency", "active"]));
    svcId = r.json?.id;
    r = await req(`/api/v1/services/${svcId}`, { method: "PATCH", headers: H, body: JSON.stringify({ priceCents: 5500 }) });
    check("PATCH services/:id → 200", r.status === 200 && r.json?.priceCents === 5500, `status=${r.status} body=${r.body}`);

    // ── professionals ──
    r = await req("/api/v1/professionals", { method: "POST", headers: H, body: JSON.stringify({ name: "Maria" }) });
    check("POST professionals → 201", r.status === 201, `status=${r.status} body=${r.body}`);
    check("professional payload (ProfessionalDTO)", !hasKeys(r.json, ["id", "name", "slug", "active", "userId"]), hasKeys(r.json ?? {}, ["id", "name", "slug", "active", "userId"]));
    profId = r.json?.id;
    r = await req("/api/v1/professionals", { headers: H });
    check("GET professionals → 200 array", r.status === 200 && Array.isArray(r.json), `status=${r.status} body=${r.body}`);

    // ── professional services (PUT/GET) ──
    r = await req(`/api/v1/professionals/${profId}/services`, { method: "PUT", headers: H, body: JSON.stringify({ serviceIds: [svcId] }) });
    check("PUT professionals/:id/services → 200", r.status === 200, `status=${r.status} body=${r.body}`);
    r = await req(`/api/v1/professionals/${profId}/services`, { headers: H });
    check("GET professionals/:id/services → {serviceIds:[svc]}", r.status === 200 && Array.isArray(r.json?.serviceIds) && r.json.serviceIds.includes(svcId), `status=${r.status} body=${r.body}`);

    // ── working-hours (PUT/GET) ──
    const wh = { shifts: [{ weekday: 1, startTime: "09:00", endTime: "18:00" }] };
    r = await req(`/api/v1/professionals/${profId}/working-hours`, { method: "PUT", headers: H, body: JSON.stringify(wh) });
    check("PUT working-hours → 2xx", r.status >= 200 && r.status < 300, `status=${r.status} body=${r.body}`);
    r = await req(`/api/v1/professionals/${profId}/working-hours`, { headers: H });
    check("GET working-hours → 200", r.status === 200, `status=${r.status} body=${r.body}`);

    // ── blocks (POST/GET/DELETE) ──
    const mon = nextMonday();
    const bStart = new Date(mon); bStart.setUTCHours(20, 0, 0, 0);
    const bEnd = new Date(mon); bEnd.setUTCHours(21, 0, 0, 0);
    r = await req(`/api/v1/professionals/${profId}/blocks`, { method: "POST", headers: H, body: JSON.stringify({ startsAt: bStart.toISOString(), endsAt: bEnd.toISOString(), reason: "smoke" }) });
    check("POST blocks → 201", r.status === 201, `status=${r.status} body=${r.body}`);
    blockId = r.json?.id;
    const fromIso = new Date(mon); fromIso.setUTCHours(0, 0, 0, 0);
    const toIso = new Date(mon); toIso.setUTCDate(toIso.getUTCDate() + 1);
    r = await req(`/api/v1/professionals/${profId}/blocks?from=${encodeURIComponent(fromIso.toISOString())}&to=${encodeURIComponent(toIso.toISOString())}`, { headers: H });
    check("GET blocks → 200 array", r.status === 200 && Array.isArray(r.json), `status=${r.status} body=${r.body}`);
    if (blockId) {
      r = await req(`/api/v1/professionals/${profId}/blocks/${blockId}`, { method: "DELETE", headers: H });
      check("DELETE blocks/:id → 204", r.status === 204, `status=${r.status} body=${r.body}`);
    }

    // ── availability ── (front day-view manda to = from+1; nunca from===to)
    const civil = mon.toISOString().slice(0, 10);
    const nextDay = new Date(mon); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const civilTo = nextDay.toISOString().slice(0, 10);
    r = await req(`/api/v1/professionals/${profId}/availability?from=${civil}&to=${civilTo}&serviceId=${svcId}`, { headers: H });
    check("GET availability → 200", r.status === 200, `status=${r.status} body=${r.body}`);
    check("availability payload {professionalId,serviceId,timezone,slotIntervalMin,days}", !hasKeys(r.json, ["professionalId", "serviceId", "timezone", "slotIntervalMin", "days"]), hasKeys(r.json ?? {}, ["professionalId", "serviceId", "timezone", "slotIntervalMin", "days"]));
    const slot = r.json?.days?.[0]?.slots?.[0]?.startsAt;
    check("availability has at least one slot", !!slot, `days=${JSON.stringify(r.json?.days)}`);

    // ── appointments POST/GET/cancel ──
    if (slot) {
      r = await req("/api/v1/appointments", {
        method: "POST", headers: { ...H, "Idempotency-Key": `smoke-${Date.now()}` },
        body: JSON.stringify({ professionalId: profId, serviceId: svcId, startsAt: slot, client: { name: "Cliente Smoke", phone: "+5511999999999" } }),
      });
      check("POST appointments → 201", r.status === 201, `status=${r.status} body=${r.body}`);
      check("appointment has service snapshots", !hasKeys(r.json, ["serviceNameSnapshot", "serviceDurationMinSnapshot", "servicePriceCentsSnapshot", "serviceCurrencySnapshot", "version"]), hasKeys(r.json ?? {}, ["serviceNameSnapshot", "serviceDurationMinSnapshot", "servicePriceCentsSnapshot", "serviceCurrencySnapshot", "version"]));
      apptId = r.json?.id;
      apptVersion = r.json?.version;

      r = await req(`/api/v1/appointments?from=${civil}&to=${civilTo}&professionalId=${profId}`, { headers: H });
      check("GET appointments → {items,nextCursor}", r.status === 200 && Array.isArray(r.json?.items) && "nextCursor" in (r.json ?? {}), `status=${r.status} body=${r.body}`);
      check("list item carries service snapshot", !!r.json?.items?.[0]?.serviceNameSnapshot, `item=${JSON.stringify(r.json?.items?.[0])}`);

      if (apptId != null && apptVersion != null) {
        r = await req(`/api/v1/appointments/${apptId}/cancel`, { method: "POST", headers: { ...H, "If-Match": String(apptVersion), "Idempotency-Key": `smoke-cancel-${Date.now()}` } });
        check("POST appointments/:id/cancel → 200", r.status === 200 && r.json?.status === "CANCELLED", `status=${r.status} body=${r.body}`);
      }
    }

    // ── clients (front: list + detail) ── um cliente já existe via appointment
    r = await req("/api/v1/clients", { headers: H });
    check("GET clients → {items,nextCursor}", r.status === 200 && Array.isArray(r.json?.items) && "nextCursor" in (r.json ?? {}), `status=${r.status} body=${r.body}`);
    const cliId = r.json?.items?.[0]?.id;
    check("GET clients has the appointment client", !!cliId, `items=${JSON.stringify(r.json?.items)}`);
    if (cliId) {
      r = await req(`/api/v1/clients/${cliId}`, { headers: H });
      check("GET clients/:id → 200", r.status === 200 && r.json?.id === cliId, `status=${r.status} body=${r.body}`);
    }
    r = await req("/api/v1/clients?search=Cliente", { headers: H });
    check("GET clients?search → 200", r.status === 200 && Array.isArray(r.json?.items), `status=${r.status} body=${r.body}`);

    // ── optimistic lock: cancel com versão errada → 409 (front usa If-Match) ──
    if (slot) {
      let rc = await req("/api/v1/appointments", {
        method: "POST", headers: { ...H, "Idempotency-Key": `smoke-ol-${Date.now()}` },
        body: JSON.stringify({ professionalId: profId, serviceId: svcId, startsAt: slot, client: { name: "OL", phone: "+5511988888888" }, allowOutsideHours: true }),
      });
      const olId = rc.json?.id;
      if (olId) {
        rc = await req(`/api/v1/appointments/${olId}/cancel`, { method: "POST", headers: { ...H, "If-Match": "999", "Idempotency-Key": `smoke-ol-c-${Date.now()}` } });
        check("cancel wrong version → 409 (optimistic lock)", rc.status === 409, `status=${rc.status} body=${rc.body}`);
      }
    }

    // ── envelope de erro: rota autenticada sem token ──
    r = await req("/api/v1/services");
    check("unauth → 401 envelope {error.code}", r.status === 401 && !!r.json?.error?.code, `status=${r.status} body=${r.body}`);
    // validação: org PATCH com slotIntervalMin inválido
    r = await req(`/api/v1/organizations/${orgId}`, { method: "PATCH", headers: H, body: JSON.stringify({ slotIntervalMin: 3 }) });
    check("PATCH org slotIntervalMin=3 → 422 VALIDATION_ERROR", r.status === 422 && r.json?.error?.code === "VALIDATION_ERROR", `status=${r.status} body=${r.body}`);
  } catch (e) {
    bad("FATAL", e.stack ?? String(e));
    console.error("\nAPI stderr tail:\n" + api.getStderr().split("\n").slice(-25).join("\n"));
  } finally {
    api.proc.kill("SIGTERM");
  }

  console.log(`\n─── Results ───\nPassed: ${pass}\nFailed: ${fail}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
  }
  process.exit(fail ? 1 : 0);
}

main();
