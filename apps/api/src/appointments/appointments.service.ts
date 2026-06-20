import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { AppointmentsRepository } from "./appointments.repository";
import {
  alignToSlotGrid,
  normalizePhone,
  isAllowedTransition,
  isTerminal,
} from "@nexos/shared";
import {
  AppointmentConflictException,
  AppointmentVersionConflictException,
  InvalidStatusTransitionException,
  OutsideWorkingHoursException,
  WithinBlockException,
} from "../common/exceptions/domain.exception";
import type { CreateAppointmentInput, RescheduleInput, AppointmentStatus } from "@nexos/shared";

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function getDateKey(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(instant);
}

function getWeekdayForDate(dateStr: string, timezone: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(utcNoon);
  const name = parts.find((p) => p.type === "weekday")?.value;
  return WEEKDAY_MAP[name ?? ""] ?? -1;
}

function wallTimeToInstant(
  dateStr: string,
  timeStr: string,
  timezone: string,
): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const parts = timeStr.split(":").map(Number);
  const h = parts[0]!;
  const mi = parts[1]!;
  const sec = parts[2] ?? 0;

  const probe = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
  const fmtParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "longOffset",
  }).formatToParts(probe);

  const tzPart = fmtParts.find((p) => p.type === "timeZoneName");
  let offsetMin = 0;
  if (tzPart) {
    const match = tzPart.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (match) {
      const sign = match[1] === "+" ? 1 : -1;
      const oh = parseInt(match[2], 10);
      const om = parseInt(match[3] || "0", 10);
      offsetMin = sign * (oh * 60 + om);
    }
  }

  const wallMs = (h * 3600 + mi * 60 + sec) * 1000;
  const utcMs = Date.UTC(y!, m! - 1, d!) + wallMs - offsetMin * 60 * 1000;
  return new Date(utcMs);
}

function maskPhone(phone: string): string {
  if (phone.length < 8) return "****";
  return phone.slice(0, 2) + "****" + phone.slice(-2);
}

function mapAppointment(
  row: {
    id: string;
    professional_id: string;
    service_id: string;
    client_id: string;
    starts_at: Date;
    ends_at: Date;
    status: string;
    source: string;
    note: string | null;
    version: number;
    created_at: Date;
    updated_at: Date;
  },
  clientName: string,
  clientPhone: string | null,
  callerRole: string,
  callerUserId: string,
  professionalUserId: string | null,
) {
  const phone =
    callerRole === "PROFESSIONAL" && professionalUserId !== callerUserId
      ? clientPhone
        ? maskPhone(clientPhone)
        : null
      : clientPhone;

  return {
    id: row.id,
    professionalId: row.professional_id,
    serviceId: row.service_id,
    clientId: row.client_id,
    clientName,
    clientPhone: phone,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
    source: row.source,
    note: row.note,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(AppointmentsRepository)
    private readonly repo: AppointmentsRepository,
  ) {}

  async create(
    orgId: string,
    userId: string,
    role: string,
    input: CreateAppointmentInput,
  ) {
    const normalized = normalizePhone(input.client.phone);
    if (!normalized) {
      throw new HttpException(
        {
          error: {
            code: "VALIDATION_ERROR" as const,
            message: "Invalid phone number",
            details: [{ field: "client.phone", issue: "invalid_phone" }],
          },
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const profByUser = await this.repo.findProfessionalByUserId(
        tx,
        orgId,
        userId,
      );
      if (role === "PROFESSIONAL") {
        if (!profByUser || profByUser.id !== input.professionalId) {
          throw new ForbiddenException("Forbidden");
        }
      }

      const professional = await this.repo.findProfessionalById(
        tx,
        orgId,
        input.professionalId,
      );
      if (!professional) {
        throw new NotFoundException("Professional not found");
      }
      if (!professional.active) {
        throw new NotFoundException("Professional not found");
      }

      const service = await this.repo.findServiceById(
        tx,
        orgId,
        input.serviceId,
      );
      if (!service) {
        throw new NotFoundException("Service not found");
      }
      if (!service.active) {
        throw new NotFoundException("Service not found");
      }

      const junction = await this.repo.findProfessionalService(
        tx,
        orgId,
        input.professionalId,
        input.serviceId,
      );
      if (!junction) {
        throw new NotFoundException("Service not found");
      }

      const config = await this.repo.findOrgConfig(tx, orgId);
      if (!config) {
        throw new NotFoundException("Organization not found");
      }

      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(
        startsAt.getTime() + service.duration_min * 60 * 1000,
      );

      const dateStr = getDateKey(startsAt, config.timezone);
      const weekday = getWeekdayForDate(dateStr, config.timezone);

      const shifts = await this.repo.findWorkingHoursForWeekday(
        tx,
        orgId,
        input.professionalId,
        weekday,
      );

      let anchor: Date | null = null;
      if (shifts.length > 0) {
        const firstShift = shifts[0]!;
        anchor = wallTimeToInstant(
          dateStr,
          firstShift.start_time,
          config.timezone,
        );
      }

      if (anchor) {
        const aligned = alignToSlotGrid(
          new Date(startsAt.getTime()),
          anchor,
          config.slotIntervalMin,
        );
        if (aligned.getTime() !== startsAt.getTime()) {
          throw new HttpException(
            {
              error: {
                code: "VALIDATION_ERROR" as const,
                message: "startsAt must be aligned to the slot grid",
                details: [
                  {
                    field: "startsAt",
                    issue: "off_grid",
                  },
                ],
              },
            },
            HttpStatus.UNPROCESSABLE_ENTITY,
          );
        }
      }

      let withinWorkingHours = false;
      for (const shift of shifts) {
        const shiftStart = wallTimeToInstant(
          dateStr,
          shift.start_time,
          config.timezone,
        );
        const shiftEnd = wallTimeToInstant(
          dateStr,
          shift.end_time,
          config.timezone,
        );
        if (
          startsAt.getTime() >= shiftStart.getTime() &&
          endsAt.getTime() <= shiftEnd.getTime()
        ) {
          withinWorkingHours = true;
          break;
        }
      }

      const blocks = await this.repo.findBlocksInRange(
        tx,
        orgId,
        input.professionalId,
        startsAt,
        endsAt,
      );

      const withinBlock = blocks.some(
        (b) =>
          b.starts_at.getTime() < endsAt.getTime() &&
          b.ends_at.getTime() > startsAt.getTime(),
      );

      if (withinBlock) {
        throw new WithinBlockException();
      }

      if (!withinWorkingHours && !input.allowOutsideHours) {
        throw new OutsideWorkingHoursException();
      }

      const client = await this.repo.upsertClientByPhone(
        tx,
        orgId,
        input.client.name,
        input.client.phone,
        normalized,
      );

      if (!client) {
        throw new HttpException(
          {
            error: {
              code: "INTERNAL_ERROR" as const,
              message: "Failed to upsert client",
            },
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      try {
        const appointment = await this.repo.insertAppointment(tx, {
          organization_id: orgId,
          professional_id: input.professionalId,
          service_id: input.serviceId,
          client_id: client.id,
          starts_at: startsAt,
          ends_at: endsAt,
          status: "CONFIRMED",
          source: "PANEL",
          note: input.note ?? null,
          version: 1,
          public_cancel_token_hash: null,
          public_cancel_token_expires_at: null,
        });

        await this.repo.insertAppointmentEvent(tx, {
          organization_id: orgId,
          appointment_id: appointment.id,
          event_type: "CREATED",
          actor_type: role,
          actor_user_id: userId,
          metadata: {
            appointmentId: appointment.id,
            professionalId: input.professionalId,
            serviceId: input.serviceId,
            clientId: client.id,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            version: 1,
            ...(!withinWorkingHours
              ? { outsideWorkingHours: true }
              : {}),
          },
        });

        return mapAppointment(
          appointment,
          client.name,
          client.phone,
          role,
          userId,
          professional.user_id,
        );
      } catch (err) {
        const pgErr = err as {
          code?: string;
          cause?: { code?: string };
        };
        const code =
          pgErr.code ??
          (pgErr.cause && typeof pgErr.cause === "object"
            ? (pgErr.cause as { code?: string }).code
            : undefined);
        if (code === "23P01") {
          throw new AppointmentConflictException();
        }
        throw err;
      }
    });
  }

  async reschedule(
    orgId: string,
    userId: string,
    role: string,
    id: string,
    version: number,
    input: RescheduleInput,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const profByUser = await this.repo.findProfessionalByUserId(
        tx,
        orgId,
        userId,
      );
      if (role === "PROFESSIONAL") {
        if (!profByUser) {
          throw new ForbiddenException("Forbidden");
        }
      }

      const appointment = await this.repo.findAppointmentById(tx, orgId, id);
      if (!appointment) {
        throw new NotFoundException("Appointment not found");
      }

      if (
        role === "PROFESSIONAL" &&
        profByUser &&
        profByUser.id !== appointment.professional_id
      ) {
        throw new ForbiddenException("Forbidden");
      }

      if (appointment.version !== version) {
        throw new AppointmentVersionConflictException();
      }

      if (isTerminal(appointment.status as AppointmentStatus)) {
        throw new InvalidStatusTransitionException();
      }

      if (
        appointment.status !== "CONFIRMED" &&
        appointment.status !== "SCHEDULED"
      ) {
        throw new InvalidStatusTransitionException();
      }

      const config = await this.repo.findOrgConfig(tx, orgId);
      if (!config) {
        throw new NotFoundException("Organization not found");
      }

      const professional = await this.repo.findProfessionalById(
        tx,
        orgId,
        appointment.professional_id,
      );

      const updateData: Record<string, unknown> = {};
      const metadata: Record<string, unknown> = {
        appointmentId: id,
        version: version + 1,
        previousStartsAt: appointment.starts_at.toISOString(),
        previousEndsAt: appointment.ends_at.toISOString(),
      };

      if (input.startsAt) {
        const service = await this.repo.findServiceById(
          tx,
          orgId,
          appointment.service_id,
        );
        if (!service) {
          throw new NotFoundException("Service not found");
        }

        const newStartsAt = new Date(input.startsAt);
        const newEndsAt = new Date(
          newStartsAt.getTime() + service.duration_min * 60 * 1000,
        );

        const dateStr = getDateKey(newStartsAt, config.timezone);
        const weekday = getWeekdayForDate(dateStr, config.timezone);

        const shifts = await this.repo.findWorkingHoursForWeekday(
          tx,
          orgId,
          appointment.professional_id,
          weekday,
        );

        let anchor: Date | null = null;
        if (shifts.length > 0) {
          const firstShift = shifts[0]!;
          anchor = wallTimeToInstant(
            dateStr,
            firstShift.start_time,
            config.timezone,
          );
        }

        if (anchor) {
          const aligned = alignToSlotGrid(
            new Date(newStartsAt.getTime()),
            anchor,
            config.slotIntervalMin,
          );
          if (aligned.getTime() !== newStartsAt.getTime()) {
            throw new HttpException(
              {
                error: {
                  code: "VALIDATION_ERROR" as const,
                  message: "startsAt must be aligned to the slot grid",
                  details: [{ field: "startsAt", issue: "off_grid" }],
                },
              },
              HttpStatus.UNPROCESSABLE_ENTITY,
            );
          }
        }

        let withinWorkingHours = false;
        for (const shift of shifts) {
          const shiftStart = wallTimeToInstant(
            dateStr,
            shift.start_time,
            config.timezone,
          );
          const shiftEnd = wallTimeToInstant(
            dateStr,
            shift.end_time,
            config.timezone,
          );
          if (
            newStartsAt.getTime() >= shiftStart.getTime() &&
            newEndsAt.getTime() <= shiftEnd.getTime()
          ) {
            withinWorkingHours = true;
            break;
          }
        }

        const blocks = await this.repo.findBlocksInRange(
          tx,
          orgId,
          appointment.professional_id,
          newStartsAt,
          newEndsAt,
        );

        const withinBlock = blocks.some(
          (b) =>
            b.starts_at.getTime() < newEndsAt.getTime() &&
            b.ends_at.getTime() > newStartsAt.getTime(),
        );

        if (withinBlock) {
          throw new WithinBlockException();
        }

        if (!withinWorkingHours) {
          throw new OutsideWorkingHoursException();
        }

        updateData.starts_at = newStartsAt;
        updateData.ends_at = newEndsAt;
        metadata.newStartsAt = newStartsAt.toISOString();
        metadata.newEndsAt = newEndsAt.toISOString();

        if (appointment.public_cancel_token_hash) {
          updateData.public_cancel_token_expires_at = newStartsAt;
        }
      }

      if (input.note !== undefined) {
        updateData.note = input.note;
        metadata.noteChanged = true;
      }

      const updated = await this.repo.updateAppointment(
        tx,
        orgId,
        id,
        version,
        updateData,
      );

      if (!updated) {
        throw new AppointmentVersionConflictException();
      }

      await this.repo.insertAppointmentEvent(tx, {
        organization_id: orgId,
        appointment_id: id,
        event_type: "RESCHEDULED",
        actor_type: role,
        actor_user_id: userId,
        metadata,
      });

      const client = await this.repo.findClientById(
        tx,
        orgId,
        updated.client_id,
      );

      return mapAppointment(
        updated,
        client?.name ?? "",
        client?.phone ?? null,
        role,
        userId,
        professional?.user_id ?? null,
      );
    });
  }

  async cancel(
    orgId: string,
    userId: string,
    role: string,
    id: string,
    version: number,
  ) {
    return this.performStatusTransition(
      orgId,
      userId,
      role,
      id,
      version,
      "CANCELLED",
      "CANCELLED",
      { cancelledByType: "STAFF" },
    );
  }

  async complete(
    orgId: string,
    userId: string,
    role: string,
    id: string,
    version: number,
  ) {
    return this.performStatusTransition(
      orgId,
      userId,
      role,
      id,
      version,
      "COMPLETED",
      "COMPLETED",
      {},
    );
  }

  async noShow(
    orgId: string,
    userId: string,
    role: string,
    id: string,
    version: number,
  ) {
    return this.performStatusTransition(
      orgId,
      userId,
      role,
      id,
      version,
      "NO_SHOW",
      "NO_SHOW",
      {},
    );
  }

  private async performStatusTransition(
    orgId: string,
    userId: string,
    role: string,
    id: string,
    version: number,
    targetStatus: string,
    eventType: string,
    extraUpdateData: Record<string, unknown>,
  ) {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const profByUser = await this.repo.findProfessionalByUserId(
        tx,
        orgId,
        userId,
      );
      if (role === "PROFESSIONAL") {
        if (!profByUser) {
          throw new ForbiddenException("Forbidden");
        }
      }

      const appointment = await this.repo.findAppointmentById(tx, orgId, id);
      if (!appointment) {
        throw new NotFoundException("Appointment not found");
      }

      if (
        role === "PROFESSIONAL" &&
        profByUser &&
        profByUser.id !== appointment.professional_id
      ) {
        throw new ForbiddenException("Forbidden");
      }

      if (appointment.version !== version) {
        throw new AppointmentVersionConflictException();
      }

      if (!isAllowedTransition(appointment.status as AppointmentStatus, targetStatus)) {
        throw new InvalidStatusTransitionException();
      }

      const updateData: Record<string, unknown> = {
        status: targetStatus,
        ...extraUpdateData,
      };

      if (targetStatus === "CANCELLED" && !extraUpdateData.cancelledByType) {
        updateData.cancelled_by_type = "STAFF";
      }

      const updated = await this.repo.updateAppointment(
        tx,
        orgId,
        id,
        version,
        updateData,
      );

      if (!updated) {
        throw new AppointmentVersionConflictException();
      }

      await this.repo.insertAppointmentEvent(tx, {
        organization_id: orgId,
        appointment_id: id,
        event_type: eventType,
        actor_type: role,
        actor_user_id: userId,
        metadata: {
          appointmentId: id,
          previousStatus: appointment.status,
          newStatus: targetStatus,
          version: version + 1,
        },
      });

      const client = await this.repo.findClientById(
        tx,
        orgId,
        updated.client_id,
      );
      const professional = await this.repo.findProfessionalById(
        tx,
        orgId,
        updated.professional_id,
      );

      return mapAppointment(
        updated,
        client?.name ?? "",
        client?.phone ?? null,
        role,
        userId,
        professional?.user_id ?? null,
      );
    });
  }
}
