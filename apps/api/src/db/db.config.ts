import { Pool, type PoolConfig } from "pg";

function buildRuntimeConnectionString(): string {
  const isProduction = process.env.NODE_ENV === "production";

  const runtimeUrl = process.env.DATABASE_RUNTIME_URL;
  if (runtimeUrl) {
    const parsed = new URL(runtimeUrl);
    if (isProduction && !parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    return parsed.toString();
  }

  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const db = process.env.POSTGRES_DB ?? "nexos_booking";

  const runtimeUser = process.env.APP_RUNTIME_USER;
  if (runtimeUser) {
    const runtimePass = process.env.APP_RUNTIME_PASSWORD;
    if (!runtimePass) {
      throw new Error(
        "APP_RUNTIME_PASSWORD is required when APP_RUNTIME_USER is set.",
      );
    }
    const base = `postgres://${encodeURIComponent(runtimeUser)}:${encodeURIComponent(runtimePass)}@${host}:${port}/${db}`;
    return isProduction ? `${base}?sslmode=require` : base;
  }

  if (isProduction) {
    throw new Error(
      "APP_RUNTIME_USER or DATABASE_RUNTIME_URL must be set in production. " +
        "The runtime pool must use a least-privilege role (app_runtime) for RLS protection. " +
        "Ref: ADR-001, DATABASE_SCHEMA_V2 §10.2, BUG-012/PEND-001.",
    );
  }

  console.warn(
    "[WARNING] APP_RUNTIME_USER is not set. Using POSTGRES_USER for runtime pool. " +
      "RLS will be INERT if this role has BYPASSRLS. " +
      "Set APP_RUNTIME_USER=app_runtime and APP_RUNTIME_PASSWORD=<password> to enable RLS.",
  );

  const ownerUser = process.env.POSTGRES_USER ?? "nexos_booking";
  const ownerPass = process.env.POSTGRES_PASSWORD;
  if (!ownerPass) {
    throw new Error(
      "POSTGRES_PASSWORD environment variable is not set. Define it in the project .env file or export it before starting the API.",
    );
  }
  return `postgres://${encodeURIComponent(ownerUser)}:${encodeURIComponent(ownerPass)}@${host}:${port}/${db}`;
}

function buildSslConfig(): PoolConfig["ssl"] {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const ca = process.env.POSTGRES_CA_CERT;

  return {
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
}

export function createPoolConfig(): PoolConfig {
  return {
    connectionString: buildRuntimeConnectionString(),
    ssl: buildSslConfig(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

let sharedPool: Pool | null = null;

export function createPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool(createPoolConfig());
  }
  return sharedPool;
}

export async function validateRuntimeRole(pool: Pool): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production";
  const result = await pool.query(
    "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  const row = result.rows[0] as { rolsuper: boolean; rolbypassrls: boolean };

  if (row?.rolsuper || row?.rolbypassrls) {
    const msg =
      `Runtime role (current_user) has ${row.rolsuper ? "SUPERUSER" : ""}${row.rolsuper && row.rolbypassrls ? " and " : ""}${row.rolbypassrls ? "BYPASSRLS" : ""}. ` +
      "RLS is inert. Set APP_RUNTIME_USER=app_runtime or DATABASE_RUNTIME_URL. " +
      "Ref: BUG-012/PEND-001.";

    if (isProduction) {
      throw new Error(msg);
    }

    console.error(`[ERROR] ${msg}`);
  }
}
