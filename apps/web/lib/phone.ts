/**
 * Máscara de telefone/WhatsApp no padrão brasileiro.
 *
 * Aceita fixo (10 dígitos) e celular (11 dígitos), formatando
 * progressivamente conforme o usuário digita:
 *   (11) 99999-9999  → celular
 *   (11) 9999-9999   → fixo
 *
 * Reutilizável em qualquer input de telefone (agenda, agenda externa, etc.).
 */
export function formatPhoneBR(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Remove a máscara, retornando apenas os dígitos. */
export function unmaskPhone(value: string): string {
  return value.replace(/\D/g, "");
}

/** Tamanho máximo do telefone já mascarado: "(11) 99999-9999". */
export const PHONE_MAX_LENGTH = 15;
