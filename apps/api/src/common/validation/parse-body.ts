import { ValidationException } from "../exceptions/validation.exception";

interface ParseIssue {
  path: PropertyKey[];
  message: string;
}

/**
 * Contrato estrutural de um schema zod, sem depender do pacote `zod` no app da API
 * (os schemas vêm de `@nexos/shared`).
 */
interface Parseable<T> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: ParseIssue[] } };
}

/**
 * Valida o body de um handler contra um schema zod e devolve o dado tipado.
 * Em falha, lança `ValidationException` (→ `422 VALIDATION_ERROR` com `details[]`),
 * mesmo padrão usado em `auth.controller.ts`.
 */
export function parseBody<T>(schema: Parseable<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationException(
      "Invalid input",
      parsed.error.issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        issue: issue.message,
      })),
    );
  }
  return parsed.data;
}
