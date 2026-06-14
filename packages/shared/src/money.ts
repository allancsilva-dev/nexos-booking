/**
 * Superfície mínima para dinheiro em centavos (API_CONTRACTS.md §12 — "Convenções de data/dinheiro").
 *
 * Objetivo único: preservar o contrato de que dinheiro trafega como inteiro em centavos + moeda.
 * NÃO há formatação i18n, símbolo monetário, conversão de float, desconto, preço de serviço,
 * pagamento, billing, assinatura, gateway ou cobrança neste PR.
 */

/** Moeda padrão usada apenas quando o helper precisa montar um objeto monetário. */
export const DEFAULT_CURRENCY = "BRL";

/** Valor monetário: inteiro em centavos + código de moeda ISO-4217 (3 letras). */
export interface Money {
  amountCents: number;
  currency: string;
}

/** `true` se `amountCents` é um inteiro (centavos válidos). */
export function isIntegerCents(amountCents: number): boolean {
  return Number.isInteger(amountCents);
}

/** `true` se `currency` é um código de 3 letras maiúsculas (ISO-4217). */
export function isCurrencyCode(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency);
}

/**
 * Cria um {@link Money} preservando centavos como inteiro. Lança `TypeError` se `amountCents` não
 * for inteiro (NÃO arredonda float silenciosamente) ou se `currency` não tiver 3 letras.
 */
export function money(
  amountCents: number,
  currency: string = DEFAULT_CURRENCY,
): Money {
  if (!isIntegerCents(amountCents)) {
    throw new TypeError(
      `Money amountCents must be an integer number of cents, received: ${amountCents}`,
    );
  }
  if (!isCurrencyCode(currency)) {
    throw new TypeError(
      `Money currency must be a 3-letter ISO-4217 code, received: ${currency}`,
    );
  }
  return { amountCents, currency };
}
