/**
 * `@nexos/shared` — base compartilhada do contrato HTTP (API_CONTRACTS.md §0–§12).
 *
 * Web/api/mobile importam destes módulos; não redefinem. Este pacote contém apenas a base do
 * contrato (envelope de erro, catálogo de códigos, helpers de data/dinheiro). DTOs de domínio,
 * schemas Zod de recurso, matriz de estados e constantes de feature vêm em PRs posteriores.
 */
export * from "./error-code.js";
export * from "./error-envelope.js";
export * from "./datetime.js";
export * from "./money.js";
export {
  OrganizationSchema,
  MemberSchema,
  InvitationSchema,
} from "./dto/organization.dto.js";
export type {
  OrganizationDTO,
  MemberDTO,
  InvitationDTO,
} from "./dto/organization.dto.js";
export { AcceptInviteSchema } from "./dto/accept-invite.dto.js";
export type { AcceptInviteInput } from "./dto/accept-invite.dto.js";
export { ProfessionalSchema } from "./dto/professional.dto.js";
export type { ProfessionalDTO } from "./dto/professional.dto.js";
export { ServiceSchema } from "./dto/service.dto.js";
export type { ServiceDTO } from "./dto/service.dto.js";
