import { Pool, type PoolConfig } from "pg";

type RuntimeConnectionSettings = {
  connectionString: string;
  expectedRole: string;
};

function ensureRuntimeRoleIsSeparated(expectedRole: string): void {
  const adminRole = process.env.POSTGRES_USER?.trim();
  if (adminRole && expectedRole === adminRole) {
    throw new Error(
      "Unsafe runtime database configuration: runtime role matches POSTGRES_USER/admin role. " +
        "Use a dedicated least-privilege runtime role such as app_runtime. " +
        "Ref: ADR-001, ADR-021, DATABASE_SCHEMA_V2 §10.2.",
    );
  }
}

function buildRuntimeConnectionSettings(): RuntimeConnectionSettings {
  const isProduction = process.env.NODE_ENV === "production";

  const runtimeUrl = process.env.DATABASE_RUNTIME_URL;
  if (runtimeUrl) {
    const parsed = new URL(runtimeUrl);
    const expectedRole = decodeURIComponent(parsed.username);
    if (!expectedRole) {
      throw new Error(
        "DATABASE_RUNTIME_URL must include the dedicated runtime role username.",
      );
    }
    ensureRuntimeRoleIsSeparated(expectedRole);
    if (isProduction && !parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    return {
      connectionString: parsed.toString(),
      expectedRole,
    };
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
    ensureRuntimeRoleIsSeparated(runtimeUser);
    return {
      connectionString: isProduction ? `${base}?sslmode=require` : base,
      expectedRole: runtimeUser,
    };
  }

  throw new Error(
    "DATABASE_RUNTIME_URL or APP_RUNTIME_USER/APP_RUNTIME_PASSWORD is required. " +
      "The API runtime pool must never fall back to POSTGRES_USER/admin credentials. " +
      "Ref: ADR-001, ADR-021, DATABASE_SCHEMA_V2 §10.2.",
  );
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
  const runtime = buildRuntimeConnectionSettings();
  return {
    connectionString: runtime.connectionString,
    ssl: buildSslConfig(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: process.env.POSTGRES_APPLICATION_NAME ?? "nexos_api_runtime",
  };
}

let sharedPool: Pool | null = null;

export function createPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool(createPoolConfig());
  }
  return sharedPool;
}

export type RuntimeRoleInfo = {
  currentUser: string;
  rolbypassrls: boolean;
  rolsuper: boolean;
};

export function getExpectedRuntimeRole(): string {
  return buildRuntimeConnectionSettings().expectedRole;
}

export async function inspectRuntimeRole(pool: Pool): Promise<RuntimeRoleInfo> {
  const result = await pool.query(
    "SELECT current_user AS current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user",
  );
  const row = result.rows[0] as {
    current_user: string;
    rolsuper: boolean;
    rolbypassrls: boolean;
  };

  if (!row?.current_user) {
    throw new Error("Runtime role inspection failed: current_user was not returned.");
  }

  return {
    currentUser: row.current_user,
    rolbypassrls: row.rolbypassrls,
    rolsuper: row.rolsuper,
  };
}

export async function validateRuntimeRole(pool: Pool): Promise<RuntimeRoleInfo> {
  const expectedRole = getExpectedRuntimeRole();
  const info = await inspectRuntimeRole(pool);

  if (info.currentUser !== expectedRole) {
    throw new Error(
      `Unsafe runtime database configuration: expected current_user=${expectedRole}, got ${info.currentUser}. ` +
        "The API must connect with the dedicated runtime role only.",
    );
  }

  if (info.rolsuper || info.rolbypassrls) {
    throw new Error(
      `Unsafe runtime database configuration: current_user=${info.currentUser} has ${info.rolsuper ? "SUPERUSER" : ""}${info.rolsuper && info.rolbypassrls ? " and " : ""}${info.rolbypassrls ? "BYPASSRLS" : ""}. ` +
        "RLS would be inert; refusing to boot.",
    );
  }

  return info;
}
