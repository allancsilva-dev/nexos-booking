import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Loads the repository root `.env` into `process.env` at runtime.
 *
 * The NestJS process is launched via `tsx watch src/main.ts` (dev) and
 * `node dist/main.js` (prod) without any `--env-file` flag, dotenv or
 * ConfigModule. Without this, `POSTGRES_PASSWORD` (and friends) are never
 * read, the connection string ends up with an empty password and `pg`
 * surfaces it as `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be
 * a string`.
 *
 * Existing process env vars always win, so container/CI-provided values are
 * never overridden. If no `.env` file exists, this is a no-op (prod relies on
 * the real environment).
 *
 * Parsing mirrors `scripts/apply-migrations.mjs#parseDotEnv` to keep a single
 * convention across the project.
 */
function parseDotEnv(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

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

function findEnvFile(): string | null {
  let dir = process.cwd();

  // Walk up to the filesystem root looking for the first `.env`.
  for (;;) {
    const candidate = path.join(dir, ".env");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

function loadEnv(): void {
  const envFile = findEnvFile();
  if (!envFile) {
    return;
  }

  let parsed: Record<string, string>;
  try {
    parsed = parseDotEnv(readFileSync(envFile, "utf8"));
  } catch {
    return;
  }

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnv();
