import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { strict as assert } from "node:assert";
import { hash } from "@node-rs/argon2";

const repoRoot = path.resolve(new URL("../../../", import.meta.url).pathname);
const apiDir = path.resolve(new URL("../", import.meta.url).pathname);
const port = String(3600 + Math.floor(Math.random() * 200));
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

function execPsql(sql) {
  const dotEnv = loadDotEnv(repoRoot);
  const user = process.env.POSTGRES_USER ?? dotEnv.POSTGRES_USER ?? "nexos_booking";
  const pass =
    process.env.POSTGRES_PASSWORD ??
    dotEnv.POSTGRES_PASSWORD ??
    "nexos_booking_local_password";
  const db = process.env.POSTGRES_DB ?? dotEnv.POSTGRES_DB ?? "nexos_booking";

  const result = spawnSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "-e",
      `PGPASSWORD=${pass}`,
      "postgres",
      "psql",
      "-t",
      "-A",
      "-U",
      user,
      "-d",
      db,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: sql,
      env: {
        ...process.env,
        APP_RUNTIME_USER: process.env.APP_RUNTIME_USER ?? "",
        APP_RUNTIME_PASSWORD: process.env.APP_RUNTIME_PASSWORD ?? "",
        DATABASE_RUNTIME_URL: process.env.DATABASE_RUNTIME_URL ?? "",
      },
    },
  );

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "psql failed").trim());
  }

  return (result.stdout ?? "").trim();
}

function fetchJson(pathStr, opts = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathStr, BASE);
    const req = http.request(
      url,
      { method: opts.method ?? "GET", headers: opts.headers ?? {} },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let json;
          try {
            json = JSON.parse(body);
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, body, json });
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
    } catch { /* ignore */ }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("API did not start within timeout");
}

function startApi() {
  const dotEnv = loadDotEnv(repoRoot);
  const dbHost = process.env.POSTGRES_HOST ?? dotEnv.POSTGRES_HOST ?? "127.0.0.1";
  const dbPort = process.env.POSTGRES_PORT ?? dotEnv.POSTGRES_PORT ?? "5432";
  const env = {
    ...process.env,
    ...dotEnv,
    PORT: port,
    ENABLE_HTTP_TEST_HARNESS: "1",
    NODE_ENV: "development",
    POSTGRES_HOST: dbHost,
    POSTGRES_PORT: dbPort,
    POSTGRES_DB: process.env.POSTGRES_DB ?? dotEnv.POSTGRES_DB ?? "nexos_booking",
    APP_RUNTIME_USER: process.env.APP_RUNTIME_USER ?? dotEnv.APP_RUNTIME_USER ?? "app_runtime",
    APP_RUNTIME_PASSWORD:
      process.env.APP_RUNTIME_PASSWORD ??
      dotEnv.APP_RUNTIME_PASSWORD ??
      process.env.POSTGRES_PASSWORD ??
      dotEnv.POSTGRES_PASSWORD ??
      "nexos_booking_local_password",
    DATABASE_URL:
      process.env.DATABASE_URL ??
      dotEnv.DATABASE_URL ??
      `postgres://${process.env.POSTGRES_USER ?? dotEnv.POSTGRES_USER ?? "nexos_booking"}:${process.env.POSTGRES_PASSWORD ?? dotEnv.POSTGRES_PASSWORD ?? ""}@${dbHost}:${dbPort}/${process.env.POSTGRES_DB ?? dotEnv.POSTGRES_DB ?? "nexos_booking"}`,
  };

  const tsxBin = path.resolve(apiDir, "node_modules/.bin/tsx");
  const proc = spawn(tsxBin, ["src/main.ts"], {
    cwd: apiDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  proc.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return { proc, getStderr: () => stderr };
}

async function stopApi(api) {
  try {
    api.proc.kill("SIGTERM");
  } catch { /* ignore */ }

  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    api.proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function nextWeekdayDate() {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  do {
    date.setUTCDate(date.getUTCDate() + 1);
  } while ([0, 6].includes(date.getUTCDay()));

  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return { date: `${yyyy}-${mm}-${dd}`, weekday: date.getUTCDay() };
}

function addDays(dateStr, amount) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return next.toISOString().slice(0, 10);
}

async function main() {
  const ts = Date.now();
  const testPassword = "testpassword123";
  const passwordHash = await hash(testPassword, {
    algorithm: 2,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const ownerUserId = randomUUID();
  const orgId = randomUUID();
  const professionalId = randomUUID();
  const serviceId = randomUUID();
  const ownerEmail = `owner-availability-${ts}@example.com`;
  const orgSlug = `availability-org-${ts}`;
  const professionalSlug = `availability-prof-${ts}`;
  const { date, weekday } = nextWeekdayDate();
  const to = addDays(date, 1);

  execPsql(`
    INSERT INTO users (id, name, email, password_hash, email_verified_at)
    VALUES ('${ownerUserId}', 'Owner Availability', '${ownerEmail}', '${passwordHash}', now());

    INSERT INTO organizations (id, name, slug, timezone, slot_interval_min, currency)
    VALUES ('${orgId}', 'Availability Org', '${orgSlug}', 'America/Sao_Paulo', 30, 'BRL');

    INSERT INTO organization_users (organization_id, user_id, role, status)
    VALUES ('${orgId}', '${ownerUserId}', 'OWNER', 'ACTIVE');

    INSERT INTO professionals (id, organization_id, name, slug, active)
    VALUES ('${professionalId}', '${orgId}', 'Availability Professional', '${professionalSlug}', true);

    INSERT INTO services (id, organization_id, name, duration_min, price_cents, currency, active)
    VALUES ('${serviceId}', '${orgId}', 'Availability Service', 30, 5000, 'BRL', true);

    INSERT INTO professional_services (organization_id, professional_id, service_id)
    VALUES ('${orgId}', '${professionalId}', '${serviceId}');

    INSERT INTO working_hours (organization_id, professional_id, weekday, start_time, end_time)
    VALUES ('${orgId}', '${professionalId}', ${weekday}, '09:00', '17:00');
  `);

  const api = startApi();

  try {
    await waitForApi();

    const login = await fetchJson("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: ownerEmail,
        password: testPassword,
      }),
    });
    assert.equal(login.status, 200, `expected login 200, got ${login.status}: ${login.body}`);
    const token = login.json?.accessToken;
    assert.ok(token, "login should return accessToken");

    const panelDate = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?date=${date}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(panelDate.status, 200, `expected panel date query 200, got ${panelDate.status}: ${panelDate.body}`);
    assert.equal(panelDate.json.days.length, 1, "date query should return exactly one day");
    assert.equal(panelDate.json.days[0].date, date);
    assert.ok(panelDate.json.days[0].slots.length > 0, "date query should return slots");

    const firstSlot = panelDate.json.days[0].slots[0];
    assert.equal(firstSlot.startsAt, `${date}T09:00:00-03:00`);
    assert.equal(firstSlot.endsAt, `${date}T09:30:00-03:00`);
    assert.ok(!firstSlot.startsAt.endsWith("Z"), "slot should not be emitted as UTC/Z");

    const panelRange = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?from=${date}&to=${to}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(panelRange.status, 200, `expected panel range query 200, got ${panelRange.status}: ${panelRange.body}`);
    assert.equal(panelRange.json.days[0].date, date);

    const publicDate = await fetchJson(
      `/api/v1/public/${orgSlug}/professionals/${professionalSlug}/availability?date=${date}&serviceId=${serviceId}`,
    );
    assert.equal(publicDate.status, 200, `expected public date query 200, got ${publicDate.status}: ${publicDate.body}`);
    assert.equal(publicDate.json.days[0].slots[0].startsAt, `${date}T09:00:00-03:00`);

    const publicRange = await fetchJson(
      `/api/v1/public/${orgSlug}/professionals/${professionalSlug}/availability?from=${date}&to=${to}&serviceId=${serviceId}`,
    );
    assert.equal(publicRange.status, 200, `expected public range query 200, got ${publicRange.status}: ${publicRange.body}`);
    assert.equal(publicRange.json.days[0].slots[0].startsAt, `${date}T09:00:00-03:00`);

    const invalidBrDate = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?date=24/06/2026&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(invalidBrDate.status, 422, `expected BR date 422, got ${invalidBrDate.status}: ${invalidBrDate.body}`);

    const invalidDateTime = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?date=${encodeURIComponent(`${date}T09:00:00-03:00`)}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(invalidDateTime.status, 422, `expected datetime query 422, got ${invalidDateTime.status}: ${invalidDateTime.body}`);

    const mixedQuery = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?date=${date}&from=${date}&to=${to}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(mixedQuery.status, 422, `expected mixed query 422, got ${mixedQuery.status}: ${mixedQuery.body}`);

    const emptyQuery = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(emptyQuery.status, 422, `expected empty query 422, got ${emptyQuery.status}: ${emptyQuery.body}`);

    const fromOnly = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?from=${date}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(fromOnly.status, 422, `expected from-only 422, got ${fromOnly.status}: ${fromOnly.body}`);

    const toOnly = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?to=${to}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(toOnly.status, 422, `expected to-only 422, got ${toOnly.status}: ${toOnly.body}`);

    const blockRes = await fetchJson(`/api/v1/professionals/${professionalId}/blocks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        startsAt: `${date}T09:30:00-03:00`,
        endsAt: `${date}T10:00:00-03:00`,
        reason: "Blocked by smoke",
      }),
    });
    assert.equal(blockRes.status, 201, `expected block create 201, got ${blockRes.status}: ${blockRes.body}`);

    const afterBlock = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?date=${date}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(afterBlock.status, 200);
    const blockedSlots = afterBlock.json.days[0].slots.map((slot) => slot.startsAt);
    assert.ok(!blockedSlots.includes(`${date}T09:30:00-03:00`), "blocked slot should disappear");

    const createAppointment = await fetchJson("/api/v1/appointments", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "idempotency-key": `availability-post-${ts}`,
      },
      body: JSON.stringify({
        professionalId,
        serviceId,
        startsAt: firstSlot.startsAt,
        client: { name: "Availability Client", phone: "(11) 99999-9999" },
      }),
    });
    assert.equal(createAppointment.status, 201, `expected appointment create 201, got ${createAppointment.status}: ${createAppointment.body}`);

    const afterAppointment = await fetchJson(
      `/api/v1/professionals/${professionalId}/availability?date=${date}&serviceId=${serviceId}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(afterAppointment.status, 200);
    const remainingStarts = afterAppointment.json.days[0].slots.map((slot) => slot.startsAt);
    assert.ok(!remainingStarts.includes(firstSlot.startsAt), "booked slot should disappear from availability");

    const publicOutsideHours = await fetchJson(`/api/v1/public/${orgSlug}/appointments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `public-outside-hours-${ts}`,
      },
      body: JSON.stringify({
        professionalSlug,
        serviceId,
        startsAt: `${date}T17:00:00-03:00`,
        client: { name: "Outside Hours", phone: "(11) 98888-7777" },
        consent: true,
      }),
    });
    assert.equal(publicOutsideHours.status, 422, `expected outside-hours 422, got ${publicOutsideHours.status}: ${publicOutsideHours.body}`);
    assert.equal(publicOutsideHours.json?.error?.code, "OUTSIDE_WORKING_HOURS");

    console.log(
      JSON.stringify(
        {
          environment: {
            machineTz: process.env.TZ ?? "system-default",
            organizationTimezone: "America/Sao_Paulo",
          },
          contract: {
            date200: panelDate.status,
            fromTo200: panelRange.status,
            publicDate200: publicDate.status,
            publicFromTo200: publicRange.status,
            brDate422: invalidBrDate.status,
            datetime422: invalidDateTime.status,
            mixed422: mixedQuery.status,
            empty422: emptyQuery.status,
            fromOnly422: fromOnly.status,
            toOnly422: toOnly.status,
          },
          timezoneProof: {
            requestedDate: date,
            slot0900: firstSlot.startsAt,
            slot0930End: firstSlot.endsAt,
          },
          coherence: {
            postStatus: createAppointment.status,
            consumedSlotRemoved: !remainingStarts.includes(firstSlot.startsAt),
          },
          scheduleAndBlocks: {
            blockedSlotRemoved: !blockedSlots.includes(`${date}T09:30:00-03:00`),
            publicOutsideHoursStatus: publicOutsideHours.status,
            publicOutsideHoursCode: publicOutsideHours.json?.error?.code,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (error instanceof Error) {
      error.apiStderr = api.getStderr();
    }
    throw error;
  } finally {
    await stopApi(api);
  }
}

main().catch((error) => {
  const details =
    error instanceof Error && "apiStderr" in error
      ? `\n--- api stderr ---\n${error.apiStderr}`
      : "";
  console.error(`${error instanceof Error ? error.message : String(error)}${details}`);
  process.exit(1);
});
