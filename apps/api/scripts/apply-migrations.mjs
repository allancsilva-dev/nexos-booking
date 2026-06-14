import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");
const defaultMigrationsDir = path.resolve(__dirname, "../db/migrations");

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];

  if (!token.startsWith("--")) {
    continue;
  }

  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(token, next);
    index += 1;
    continue;
  }

  args.set(token, "true");
}

const fresh = args.has("--fresh");
const migrationsDir = path.resolve(
  repoRoot,
  args.get("--migrations-dir") ?? path.relative(repoRoot, defaultMigrationsDir)
);
const targetDatabase = args.get("--database") ?? "nexos_migrations_gate";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseDotEnv(contents) {
  const result = {};

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
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadEnv() {
  const envFile = path.resolve(repoRoot, ".env");
  const fileValues = (() => {
    try {
      return parseDotEnv(readFileSync(envFile, "utf8"));
    } catch {
      return {};
    }
  })();

  return {
    POSTGRES_DB: process.env.POSTGRES_DB ?? fileValues.POSTGRES_DB,
    POSTGRES_USER: process.env.POSTGRES_USER ?? fileValues.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? fileValues.POSTGRES_PASSWORD
  };
}

function quotedLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function quotedIdentifier(value) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function runComposeCommand(command, options = {}) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", "postgres", "sh", "-lc", command],
    {
      cwd: repoRoot,
      encoding: "utf8",
      input: options.input,
      env: process.env
    }
  );

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const details = [stderr, stdout].filter(Boolean).join("\n");
    throw new Error(details || `docker compose exec failed with code ${result.status}`);
  }

  return result.stdout?.trim() ?? "";
}

async function waitForPostgres() {
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      runComposeCommand('pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"');
      return;
    } catch (error) {
      if (attempt === 30) {
        throw error;
      }

      await delay(1000);
    }
  }
}

function listMigrationFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name);

  if (entries.length === 0) {
    fail(`No SQL migrations found in ${directory}`);
  }

  return entries
    .map((name) => {
      const match = /^(?<order>\d+).*\.sql$/u.exec(name);
      if (!match?.groups?.order) {
        fail(`Migration file must start with a numeric prefix: ${name}`);
      }

      return {
        name,
        order: Number.parseInt(match.groups.order, 10)
      };
    })
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    .map((entry) => entry.name);
}

async function main() {
  const env = loadEnv();

  if (!env.POSTGRES_DB || !env.POSTGRES_USER || !env.POSTGRES_PASSWORD) {
    fail("Missing POSTGRES_DB, POSTGRES_USER or POSTGRES_PASSWORD in the environment or .env file.");
  }

  if (!/^[a-zA-Z0-9_]+$/u.test(targetDatabase)) {
    fail(`Unsafe database name: ${targetDatabase}`);
  }

  const migrationFiles = listMigrationFiles(migrationsDir);

  console.log(`Using migrations directory: ${path.relative(repoRoot, migrationsDir)}`);
  console.log(`Migration order: ${migrationFiles.join(", ")}`);

  await waitForPostgres();

  if (fresh) {
    console.log(`Recreating disposable database: ${targetDatabase}`);
    runComposeCommand(
      [
        'export PGPASSWORD="$POSTGRES_PASSWORD"',
        `psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<'SQL'`,
        `DROP DATABASE IF EXISTS ${quotedIdentifier(targetDatabase)} WITH (FORCE);`,
        `CREATE DATABASE ${quotedIdentifier(targetDatabase)};`,
        "SQL"
      ].join("\n")
    );
  }

  for (const migrationFile of migrationFiles) {
    const fullPath = path.resolve(migrationsDir, migrationFile);
    const sql = readFileSync(fullPath, "utf8");

    console.log(`Applying ${migrationFile}`);
    runComposeCommand(
      [
        'export PGPASSWORD="$POSTGRES_PASSWORD"',
        `psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ${quotedLiteral(targetDatabase)}`
      ].join("\n"),
      { input: sql }
    );
  }

  console.log(`Applied ${migrationFiles.length} migration(s) to ${targetDatabase}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
