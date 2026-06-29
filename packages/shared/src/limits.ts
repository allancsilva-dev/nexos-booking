/**
 * Limites de entrada compartilhados (hardening — PR-BE-FIX-SECURITY-HARDENING-01).
 *
 * Tetos defensivos para toda string/numérico de entrada do contrato. Não alteram shapes
 * existentes; apenas tornam efetiva a validação que o contrato pressupõe.
 */
export const NAME_MAX = 120;
export const SLUG_MAX = 64;
export const PHONE_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const REASON_MAX = 500;
export const NOTE_MAX = 2000;
export const SERVICE_DURATION_MAX_MIN = 1440;
export const PRICE_CENTS_MAX = 100_000_000;

/**
 * Teto da janela de availability (`from`..`to`, em dias).
 *
 * Sem teto, um request (inclusive na rota pública/anônima) pode pedir
 * `from=2000-01-01&to=2999-12-31` e fazer o serviço iterar centenas de
 * milhares de dias de forma síncrona, travando o event loop (DoS trivial,
 * Node single-thread). 62 dias cobre qualquer visão de calendário do produto
 * (semana/mês) e fica muito abaixo do horizonte de risco. Ref: BUG-029.
 */
export const AVAILABILITY_MAX_RANGE_DAYS = 62;

/**
 * Teto de itens em arrays de entrada que disparam escrita em lote.
 * Body global (100KB) é mitigação grosseira; estes dão limite semântico. Ref: BUG-030.
 */
export const WORKING_HOURS_MAX_SHIFTS = 50;
export const PROFESSIONAL_SERVICES_MAX = 200;
