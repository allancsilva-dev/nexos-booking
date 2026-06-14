/**
 * Utilitários de asserção compile-time usados pelos testes de contrato.
 *
 * Estes arquivos NÃO são emitidos no build de runtime (ver `tsconfig.json` `exclude`); são
 * verificados por `tsconfig.typecheck.json`, então qualquer divergência do contrato quebra o build.
 */

/** Igualdade estrutural exata entre dois tipos (true só se A e B são idênticos). */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/** Falha de compilação se `T` não for exatamente `true`. */
export type Expect<T extends true> = T;
