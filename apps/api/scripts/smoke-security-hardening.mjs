// Hardening smoke — prova que a validação de entrada rejeita payloads inválidos
// (PR-BE-FIX-SECURITY-HARDENING-01 / BUG-021..023).
// Sobe a API em :3098, registra uma org e assere 422 VALIDATION_ERROR em campos
// fora de limite (nome > max, senha < 8, número inválido) nos fluxos críticos.
// Uso: node scripts/smoke-security-hardening.mjs
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";

const PORT = "3098";
const BASE = `http://localhost:${PORT}`;
let pass = 0;
let fail = 0;
const failures = [];

function ok(name) { pass++; console.log(`  ✓ ${name}`); }
function bad(name, detail) { fail++; failures.push({ name, detail }); console.log(`  ✗ ${name}\n      ${detail}`); }
function check(name, cond, detail) { if (cond) ok(name); else bad(name, detail ?? "assertion failed"); }

// Espera 422 com envelope { error: { code: "VALIDATION_ERROR" } }.
function is422(r) {
  return r.status === 422 && r.json?.error?.code === "VALIDATION_ERROR";
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

const BIG = "x".repeat(200); // > NAME_MAX (120)
const UUID = "00000000-0000-4000-8000-000000000000";

async function main() {
  const api = startApi();
  try {
    await waitForApi();
    console.log("API up.\n");
    const J = { "Content-Type": "application/json" };

    // ── BUG-022: política de senha no register ──
    const email = `harden_${Date.now()}@nexos.test`;
    let r = await req("/api/v1/auth/register", { method: "POST", headers: J,
      body: JSON.stringify({ name: "Owner", email: `short_${email}`, password: "1234567", organizationName: "Org" }) });
    check("register senha < 8 → 422", is422(r), `status=${r.status} body=${r.body}`);

    r = await req("/api/v1/auth/register", { method: "POST", headers: J,
      body: JSON.stringify({ name: BIG, email: `bigname_${email}`, password: "valid-pass-123", organizationName: "Org" }) });
    check("register nome > max → 422", is422(r), `status=${r.status} body=${r.body}`);

    // baseline válido p/ obter token + slug
    r = await req("/api/v1/auth/register", { method: "POST", headers: J,
      body: JSON.stringify({ name: "Owner", email, password: "valid-pass-123", organizationName: "Org" }) });
    check("register válido → 201", r.status === 201, `status=${r.status} body=${r.body}`);
    const auth = r.json?.accessToken;
    const orgId = r.json?.organization?.id;
    const orgSlug = r.json?.organization?.slug;
    const H = { ...J, Authorization: `Bearer ${auth}` };

    // ── BUG-022: senha curta em reset/change ──
    r = await req("/api/v1/auth/password/reset", { method: "POST", headers: J,
      body: JSON.stringify({ token: "bogus-token", newPassword: "short" }) });
    check("password/reset senha < 8 → 422", is422(r), `status=${r.status} body=${r.body}`);

    r = await req("/api/v1/auth/password/change", { method: "POST", headers: H,
      body: JSON.stringify({ currentPassword: "valid-pass-123", newPassword: "short" }) });
    check("password/change senha < 8 → 422", is422(r), `status=${r.status} body=${r.body}`);

    r = await req("/api/v1/auth/password/forgot", { method: "POST", headers: J,
      body: JSON.stringify({ email: "not-an-email" }) });
    check("password/forgot email inválido → 422", is422(r), `status=${r.status} body=${r.body}`);

    // ── BUG-021: CRUD autenticado valida body ──
    r = await req("/api/v1/services", { method: "POST", headers: H,
      body: JSON.stringify({ name: BIG, durationMin: 30, priceCents: 5000 }) });
    check("POST services nome > max → 422", is422(r), `status=${r.status} body=${r.body}`);

    r = await req("/api/v1/services", { method: "POST", headers: H,
      body: JSON.stringify({ name: "Corte", durationMin: -5, priceCents: 5000 }) });
    check("POST services durationMin negativo → 422", is422(r), `status=${r.status} body=${r.body}`);

    r = await req("/api/v1/services", { method: "POST", headers: H,
      body: JSON.stringify({ name: "Corte", durationMin: "trinta", priceCents: 5000 }) });
    check("POST services durationMin não-numérico → 422", is422(r), `status=${r.status} body=${r.body}`);

    r = await req("/api/v1/professionals", { method: "POST", headers: H,
      body: JSON.stringify({ name: BIG }) });
    check("POST professionals nome > max → 422", is422(r), `status=${r.status} body=${r.body}`);

    r = await req(`/api/v1/organizations/${orgId}`, { method: "PATCH", headers: H,
      body: JSON.stringify({ name: BIG }) });
    check("PATCH organizations nome > max → 422", is422(r), `status=${r.status} body=${r.body}`);

    // ── BUG-023: campo público sem max agora rejeita ──
    r = await req(`/api/v1/public/${orgSlug}/appointments`, { method: "POST", headers: { ...J, "Idempotency-Key": `harden-${Date.now()}` },
      body: JSON.stringify({ professionalSlug: "qualquer", serviceId: UUID,
        startsAt: "2030-01-01T12:00:00-03:00", client: { name: BIG, phone: "+5511999999999" }, consent: true }) });
    check("public booking nome > max → 422", is422(r), `status=${r.status} body=${r.body}`);

    // ── BUG-023 (cancel anônimo): token sem max agora rejeita ──
    r = await req("/api/v1/public/cancel/preview", { method: "POST", headers: J,
      body: JSON.stringify({ token: "x".repeat(600) }) });
    check("public cancel/preview token > max → 422", is422(r), `status=${r.status} body=${r.body}`);

    r = await req("/api/v1/public/cancel", { method: "POST", headers: J,
      body: JSON.stringify({}) });
    check("public cancel sem token → 422", is422(r), `status=${r.status} body=${r.body}`);

    // ── sanity: payload válido segue aceito ──
    r = await req("/api/v1/services", { method: "POST", headers: H,
      body: JSON.stringify({ name: "Corte", durationMin: 30, priceCents: 5000, bufferAfterMin: 10 }) });
    check("POST services válido → 201 (sem regressão)", r.status === 201, `status=${r.status} body=${r.body}`);
  } catch (e) {
    bad("harness", `${e?.message}\n${api.getStderr()}`);
  } finally {
    api.proc.kill("SIGTERM");
  }

  console.log(`\n─── Results ───\nPassed: ${pass}\nFailed: ${fail}`);
  if (fail > 0) { console.log("\nFailures:"); for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`); process.exit(1); }
}

main();
