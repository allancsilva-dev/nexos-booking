import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separator = trimmed.indexOf("=");
  if (separator === -1) {
    return null;
  }

  const key = trimmed.slice(0, separator).trim();
  let value = trimmed.slice(separator + 1).trim();

  if (!key) {
    return null;
  }

  const quote = value[0];
  if (
    value.length >= 2 &&
    (quote === "\"" || quote === "'") &&
    value[value.length - 1] === quote
  ) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry) {
      continue;
    }

    const [key, value] = entry;
    process.env[key] ??= value;
  }
}

function findUp(filename: string, start: string): string | null {
  let current = start;
  const root = parse(current).root;

  while (current !== root) {
    const candidate = join(current, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
    current = dirname(current);
  }

  const rootCandidate = join(root, filename);
  return existsSync(rootCandidate) ? rootCandidate : null;
}

const envPath = findUp(".env", process.cwd());
if (envPath) {
  loadEnvFile(envPath);
}
