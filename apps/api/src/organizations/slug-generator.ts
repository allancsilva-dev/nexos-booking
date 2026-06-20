const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "login",
  "auth",
  "public",
  "barbearia",
  "barbeiro",
  "static",
  "assets",
  "root",
  "www",
  "mail",
  "ftp",
  "cdn",
  "docs",
  "help",
  "suporte",
  "support",
  "status",
  "api-docs",
]);

export function generateSlugCandidates(name: string): string[] {
  let base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  if (!base || base.length < 2) {
    base = `org-${Math.random().toString(36).slice(2, 10)}`;
  }

  if (RESERVED_SLUGS.has(base)) {
    base = `${base}-org`;
  }

  const candidates: string[] = [base];
  for (let i = 2; i <= 10; i++) {
    candidates.push(`${base}-${i}`);
  }

  return candidates;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
