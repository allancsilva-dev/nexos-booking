import { Pool, type PoolConfig } from "pg";

function buildConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (url) {
    const parsed = new URL(url);
    if (parsed.searchParams.has("sslmode")) {
      return url;
    }

    if (process.env.NODE_ENV === "production") {
      parsed.searchParams.set("sslmode", "require");
    }

    return parsed.toString();
  }

  const host = process.env.POSTGRES_HOST ?? "localhost";
  const port = process.env.POSTGRES_PORT ?? "5432";
  const db = process.env.POSTGRES_DB ?? "nexos_booking";
  const user = process.env.POSTGRES_USER ?? "nexos_booking";
  const pass = process.env.POSTGRES_PASSWORD ?? "";

  const base = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${db}`;

  if (process.env.NODE_ENV === "production") {
    return `${base}?sslmode=require`;
  }

  return base;
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
    connectionString: buildConnectionString(),
    ssl: buildSslConfig(),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

export function createPool(): Pool {
  return new Pool(createPoolConfig());
}
