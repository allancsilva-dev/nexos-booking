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
export * from "./civil-date.js";
export * from "./money.js";
export * from "./limits.js";
export {
  OrganizationSchema,
  MemberSchema,
  InvitationSchema,
  UpdateOrganizationSchema,
  InviteMemberSchema,
  UpdateMemberSchema,
} from "./dto/organization.dto.js";
export type {
  OrganizationDTO,
  MemberDTO,
  InvitationDTO,
  UpdateOrganizationInput,
  InviteMemberInput,
  UpdateMemberInput,
} from "./dto/organization.dto.js";
export { AcceptInviteSchema } from "./dto/accept-invite.dto.js";
export type { AcceptInviteInput } from "./dto/accept-invite.dto.js";
export {
  ProfessionalSchema,
  CreateProfessionalSchema,
  UpdateProfessionalSchema,
} from "./dto/professional.dto.js";
export type {
  ProfessionalDTO,
  CreateProfessionalInput,
  UpdateProfessionalInput,
} from "./dto/professional.dto.js";
export {
  ProfessionalServicesInputSchema,
  ProfessionalServicesResponseSchema,
} from "./dto/professional-services.dto.js";
export type {
  ProfessionalServicesInput,
  ProfessionalServicesResponse,
} from "./dto/professional-services.dto.js";
export {
  ServiceSchema,
  CreateServiceSchema,
  UpdateServiceSchema,
} from "./dto/service.dto.js";
export type {
  ServiceDTO,
  CreateServiceInput,
  UpdateServiceInput,
} from "./dto/service.dto.js";
export { WorkingHoursSchema, ShiftSchema } from "./dto/working-hours.dto.js";
export type { WorkingHoursInput, ShiftDTO } from "./dto/working-hours.dto.js";
export { AvailabilityBlockSchema, CreateBlockSchema } from "./dto/availability-block.dto.js";
export type { AvailabilityBlockDTO, CreateBlockInput } from "./dto/availability-block.dto.js";
export { alignToSlotGrid } from "./slot-grid.js";
export { normalizePhone } from "./phone.js";
export { ClientSchema } from "./dto/client.dto.js";
export type { ClientDTO } from "./dto/client.dto.js";
export {
  AvailabilityQuerySchema,
  AvailabilitySlotSchema,
  AvailabilityDaySchema,
  AvailabilityResponseSchema,
} from "./dto/availability.dto.js";
export type {
  AvailabilityQuery,
  AvailabilityResponse,
  AvailabilitySlot,
  AvailabilityDay,
} from "./dto/availability.dto.js";
export {
  DashboardWeekDaySchema,
  DashboardTopServiceSchema,
  DashboardOverviewSchema,
} from "./dto/dashboard.dto.js";
export type {
  DashboardWeekDay,
  DashboardTopService,
  DashboardOverviewResponse,
} from "./dto/dashboard.dto.js";
export {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TRANSITIONS,
  isAllowedTransition,
  isTerminal,
  AppointmentSchema,
  CreateAppointmentSchema,
  RescheduleSchema,
} from "./dto/appointment.dto.js";
export type {
  AppointmentStatus,
  AppointmentDTO,
  CreateAppointmentInput,
  RescheduleInput,
} from "./dto/appointment.dto.js";
export {
  PublicServiceSummarySchema,
  PublicProfessionalSummarySchema,
  PublicVitrineResponseSchema,
} from "./dto/public-vitrine.dto.js";
export type { PublicVitrineResponse } from "./dto/public-vitrine.dto.js";
export {
  PublicBookingInputSchema,
  PublicBookingResponseSchema,
  MAX_BOOKING_HORIZON_DAYS,
  MIN_SCHEDULE_NOTICE_MIN,
} from "./dto/public-booking.dto.js";
export type {
  PublicBookingInput,
  PublicBookingResponse,
} from "./dto/public-booking.dto.js";
export {
  CancelPreviewInputSchema,
  CancelPreviewResponseSchema,
  CancelInputSchema,
} from "./dto/public-cancel.dto.js";
export type {
  CancelPreviewInput,
  CancelPreviewResponse,
  CancelInput,
} from "./dto/public-cancel.dto.js";
export {
  AppointmentListItemSchema,
  AppointmentListResponseSchema,
} from "./dto/appointment-list.dto.js";
export type {
  AppointmentListItemDTO,
  AppointmentListResponse,
} from "./dto/appointment-list.dto.js";
export {
  AppointmentEventSchema,
} from "./dto/appointment-event.dto.js";
export type {
  AppointmentEventDTO,
} from "./dto/appointment-event.dto.js";
export {
  ClientListItemSchema,
  ClientDetailSchema,
  UpdateClientSchema,
  AnonymizeResponseSchema,
} from "./dto/client-management.dto.js";
export type {
  ClientListItemDTO,
  ClientDetailDTO,
  UpdateClientInput,
  AnonymizeResponse,
} from "./dto/client-management.dto.js";
export {
  RegisterInputSchema,
  LoginInputSchema,
  SwitchOrgInputSchema,
  MeResponseSchema,
  passwordSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  PasswordChangeSchema,
  VerifyEmailSchema,
} from "./dto/auth.dto.js";
export type {
  RegisterInput,
  LoginInput,
  SwitchOrgInput,
  MeResponse,
  ForgotPasswordInput,
  ResetPasswordInput,
  PasswordChangeInput,
  VerifyEmailInput,
} from "./dto/auth.dto.js";
