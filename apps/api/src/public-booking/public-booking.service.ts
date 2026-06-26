import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { RateLimitException } from "../common/exceptions/rate-limit.exception";
import { ValidationException } from "../common/exceptions/validation.exception";
import {
  AppointmentConflictException,
  OutsideWorkingHoursException,
  WithinBlockException,
  CancelTokenInvalidException,
  CancelTokenExpiredException,
  CancelTokenGoneException,
  ProfessionalServiceNotLinkedException,
} from "../common/exceptions/domain.exception";
import { PublicBookingRepository } from "./public-booking.repository";
import { AvailabilityService } from "../scheduling/availability.service";
import type { RateLimiter } from "../auth/rate-limit/rate-limiter.interface";
import type { AvailabilityQuery } from "@nexos/shared";
import {
  alignToSlotGrid,
  instantToCivilDate,
  normalizePhone,
  zonedDateTimeToInstant,
  isAllowedTransition,
  isTerminal,
  MAX_BOOKING_HORIZON_DAYS,
  MIN_SCHEDULE_NOTICE_MIN,
} from "@nexos/shared";
import type {
  PublicBookingInput,
  PublicBookingResponse,
  CancelPreviewResponse,
} from "@nexos/shared";
import type { AppointmentStatus } from "@nexos/shared";
import { resolveEffectiveSlotStepMin } from "../scheduling/slot-step.util";

interface AvailabilityRouteQuery {
  date?: string;
  from?: string;
  to?: string;
  serviceId: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

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

function generateCancelToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

@Injectable()
export class PublicBookingService {
  constructor(
    @Inject("RateLimiter") private readonly rateLimiter: RateLimiter,
    @Inject(DbService) private readonly db: DbService,
    @Inject(PublicBookingRepository)
    private readonly repo: PublicBookingRepository,
    @Inject(AvailabilityService)
    private readonly availability: AvailabilityService,
  ) {}

  private async checkRateLimit(ip: string, limit: number, windowMs: number) {
    const result = await this.rateLimiter.consume(`public:ip:${ip}`, limit, windowMs);
    if (!result.allowed) {
      throw new RateLimitException(
        Math.ceil((result.resetAt - Date.now()) / 1000),
      );
    }
  }

  private async checkPhoneRateLimit(phoneNormalized: string) {
    const phoneHash = createHash("sha256").update(phoneNormalized).digest("hex");
    const result = await this.rateLimiter.consume(`public:phone:${phoneHash}`, 5, 3600_000);
    if (!result.allowed) {
      throw new RateLimitException(
        Math.ceil((result.resetAt - Date.now()) / 1000),
      );
    }
  }

  async getVitrine(ip: string, slug: string) {
    await this.checkRateLimit(ip, 60, 60_000);

    const orgId = await this.repo.resolveOrgBySlug(slug);
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    return withTenantContext(this.db, orgId, null, async (tx) => {
      const orgRows = await this.repo.findOrgPublicInfo(tx, orgId);
      if (!orgRows[0]) {
        throw new NotFoundException("Organization not found");
      }

      const services = await this.repo.findActiveServices(tx, orgId);
      const professionals = await this.repo.findActiveProfessionals(tx, orgId);
      const links = await this.repo.findServiceProfessionalSlugs(tx, orgId);

      // Agrupa slugs por service_id — usa services[] ativos como base
      const slugsByService = new Map<string, string[]>();
      for (const link of links) {
        const arr = slugsByService.get(link.service_id);
        if (arr) {
          arr.push(link.slug);
        } else {
          slugsByService.set(link.service_id, [link.slug]);
        }
      }

      return {
        name: orgRows[0].name,
        slug: orgRows[0].slug,
        timezone: orgRows[0].timezone,
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMin: s.durationMin,
          priceCents: s.priceCents,
          currency: s.currency,
          professionalSlugs: slugsByService.get(s.id) ?? [],
        })),
        professionals: professionals.map((p) => ({
          slug: p.slug,
          name: p.name,
        })),
      };
    });
  }

  async getProfessionals(ip: string, slug: string) {
    await this.checkRateLimit(ip, 60, 60_000);

    const orgId = await this.repo.resolveOrgBySlug(slug);
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    return withTenantContext(this.db, orgId, null, async (tx) => {
      const professionals = await this.repo.findActiveProfessionals(tx, orgId);
      return professionals.map((p) => ({
        slug: p.slug,
        name: p.name,
      }));
    });
  }

  async getAvailability(
    ip: string,
    orgSlug: string,
    professionalSlug: string,
    query: AvailabilityRouteQuery,
  ) {
    await this.checkRateLimit(ip, 60, 60_000);

    const orgId = await this.repo.resolveOrgBySlug(orgSlug);
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    return withTenantContext(this.db, orgId, null, async (tx) => {
      const prof = await this.repo.findProfessionalBySlug(
        tx,
        orgId,
        professionalSlug,
      );
      if (!prof) {
        throw new NotFoundException("Professional not found");
      }

      const parsed: AvailabilityQuery = {
        ...(query.date ? { date: query.date } : {}),
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        serviceId: query.serviceId,
      };

      return this.availability.getAvailability(
        orgId,
        null as unknown as string,
        "",
        prof.id,
        parsed,
      );
    });
  }

  async bookAppointment(
    ip: string,
    orgSlug: string,
    input: PublicBookingInput,
  ): Promise<PublicBookingResponse> {
    await this.checkRateLimit(ip, 10, 60_000);

    const normalized = normalizePhone(input.client.phone);
    if (!normalized) {
      throw new ValidationException("Invalid phone number", [
        { field: "client.phone", issue: "invalid_phone" },
      ]);
    }
    await this.checkPhoneRateLimit(normalized!);

    const orgId = await this.repo.resolveOrgBySlug(orgSlug);
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    return withTenantContext(this.db, orgId, null, async (tx) => {
      const professional = await this.repo.findProfessionalBySlug(
        tx,
        orgId,
        input.professionalSlug,
      );
      if (!professional) {
        throw new NotFoundException("Professional not found");
      }

      const service = await this.repo.findServiceById(
        tx,
        orgId,
        input.serviceId,
      );
      if (!service || !service.active) {
        throw new NotFoundException("Service not found");
      }

      const junction = await this.repo.findProfessionalService(
        tx,
        orgId,
        professional.id,
        input.serviceId,
      );
      if (!junction) {
        throw new ProfessionalServiceNotLinkedException();
      }

      const config = await this.repo.findOrgConfig(tx, orgId);
      if (!config) {
        throw new NotFoundException("Organization not found");
      }

      const effectiveSlotStepMin = resolveEffectiveSlotStepMin({
        professionalServiceSlotStepMin: junction.slot_step_min,
        serviceDurationMin: service.duration_min,
        organizationSlotIntervalMin: config.slotIntervalMin,
      });

      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(
        startsAt.getTime() + service.duration_min * 60 * 1000,
      );

      const nowMs = Date.now();

      if (startsAt.getTime() <= nowMs) {
        throw new ValidationException("startsAt must be in the future", [
          { field: "startsAt", issue: "past" },
        ]);
      }

      if (
        startsAt.getTime() <
        nowMs + MIN_SCHEDULE_NOTICE_MIN * 60 * 1000
      ) {
        throw new ValidationException(
          "startsAt must be at least MIN_SCHEDULE_NOTICE_MIN in advance",
          [{ field: "startsAt", issue: "too_soon" }],
        );
      }

      if (
        startsAt.getTime() >
        nowMs + MAX_BOOKING_HORIZON_DAYS * 24 * 60 * 60 * 1000
      ) {
        throw new ValidationException(
          "startsAt exceeds MAX_BOOKING_HORIZON_DAYS",
          [{ field: "startsAt", issue: "too_far" }],
        );
      }

      const dateStr = instantToCivilDate(startsAt, config.timezone);
      const weekday = getWeekdayForDate(dateStr, config.timezone);

      const shifts = await this.repo.findWorkingHoursForWeekday(
        tx,
        orgId,
        professional.id,
        weekday,
      );

      if (shifts.length === 0) {
        throw new OutsideWorkingHoursException();
      }

      const firstShift = shifts[0]!;
      const anchor = zonedDateTimeToInstant(
        dateStr,
        firstShift.start_time,
        config.timezone,
      );

      const aligned = alignToSlotGrid(
        new Date(startsAt.getTime()),
        anchor,
        effectiveSlotStepMin,
      );
      if (aligned.getTime() !== startsAt.getTime()) {
        throw new ValidationException(
          "startsAt must be aligned to the slot grid",
          [{ field: "startsAt", issue: "off_grid" }],
        );
      }

      let withinWorkingHours = false;
      for (const shift of shifts) {
        const shiftStart = zonedDateTimeToInstant(
          dateStr,
          shift.start_time,
          config.timezone,
        );
        const shiftEnd = zonedDateTimeToInstant(
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

      if (!withinWorkingHours) {
        throw new OutsideWorkingHoursException();
      }

      const blocks = await this.repo.findBlocksInRange(
        tx,
        orgId,
        professional.id,
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

      const client = await this.repo.upsertClientByPhone(
        tx,
        orgId,
        input.client.name,
        input.client.phone,
        normalized,
      );

      if (!client) {
        throw new ValidationException("Failed to upsert client", []);
      }

      const { raw: rawToken, hash: tokenHash } = generateCancelToken();

      const cancelBaseUrl =
        process.env.PUBLIC_CANCEL_BASE_URL ?? "https://nexos.app/cancelar";

      try {
        const appointment = await this.repo.insertAppointment(tx, {
          organization_id: orgId,
          professional_id: professional.id,
          service_id: input.serviceId,
          client_id: client.id,
          starts_at: startsAt,
          ends_at: endsAt,
          status: "CONFIRMED",
          source: "PUBLIC",
          note: null,
          version: 1,
          public_cancel_token_hash: tokenHash,
          public_cancel_token_expires_at: startsAt,
          service_name_snapshot: service.name,
          service_duration_min_snapshot: service.duration_min,
          service_price_cents_snapshot: service.price_cents,
          service_currency_snapshot: service.currency,
        });

        await this.repo.insertAppointmentEvent(tx, {
          organization_id: orgId,
          appointment_id: appointment.id,
          event_type: "CREATED",
          actor_type: "CLIENT",
          actor_user_id: null,
          metadata: {
            appointmentId: appointment.id,
            professionalId: professional.id,
            serviceId: input.serviceId,
            clientId: client.id,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            version: 1,
          },
        });

        return {
          id: appointment.id,
          startsAt: appointment.starts_at.toISOString(),
          endsAt: appointment.ends_at.toISOString(),
          status: appointment.status,
          professional: { name: professional.name },
          service: {
            name: service.name,
            durationMin: service.duration_min,
            serviceNameSnapshot: service.name,
            serviceDurationMinSnapshot: service.duration_min,
          },
          cancelUrl: `${cancelBaseUrl}/${rawToken}`,
        };
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

  async previewCancel(
    ip: string,
    token: string,
  ): Promise<CancelPreviewResponse> {
    await this.checkRateLimit(ip, 20, 60_000);

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const resolved = await this.db.client.transaction(async (tx) => {
      return this.repo.resolveByCancelHash(tx, tokenHash);
    });

    if (!resolved) {
      throw new CancelTokenInvalidException();
    }

    return withTenantContext(
      this.db,
      resolved.organization_id,
      null,
      async (tx) => {
        const appt = await this.repo.findAppointmentForPreview(
          tx,
          resolved.organization_id,
          resolved.appointment_id,
        );

        if (!appt) {
          throw new CancelTokenInvalidException();
        }

        if (
          appt.public_cancel_token_expires_at &&
          appt.public_cancel_token_expires_at.getTime() < Date.now()
        ) {
          throw new CancelTokenExpiredException();
        }

        if (isTerminal(appt.status as AppointmentStatus)) {
          throw new CancelTokenGoneException();
        }

        if (
          !isAllowedTransition(appt.status as AppointmentStatus, "CANCELLED")
        ) {
          throw new CancelTokenGoneException();
        }

        return {
          professionalName: appt.professionalName,
          serviceName: appt.serviceName,
          startsAt: appt.starts_at.toISOString(),
          endsAt: appt.ends_at.toISOString(),
        };
      },
    );
  }

  async cancelByToken(ip: string, token: string): Promise<{ cancelled: boolean }> {
    await this.checkRateLimit(ip, 20, 60_000);

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const resolved = await this.db.client.transaction(async (tx) => {
      return this.repo.resolveByCancelHash(tx, tokenHash);
    });

    if (!resolved) {
      throw new CancelTokenInvalidException();
    }

    return withTenantContext(
      this.db,
      resolved.organization_id,
      null,
      async (tx) => {
        const appt = await this.repo.findAppointmentById(
          tx,
          resolved.organization_id,
          resolved.appointment_id,
        );

        if (!appt) {
          throw new CancelTokenInvalidException();
        }

        if (
          appt.public_cancel_token_expires_at &&
          appt.public_cancel_token_expires_at.getTime() < Date.now()
        ) {
          throw new CancelTokenExpiredException();
        }

        if (isTerminal(appt.status as AppointmentStatus)) {
          throw new CancelTokenGoneException();
        }

        if (
          !isAllowedTransition(appt.status as AppointmentStatus, "CANCELLED")
        ) {
          throw new CancelTokenGoneException();
        }

        const updated = await this.repo.updateAppointment(
          tx,
          resolved.organization_id,
          resolved.appointment_id,
          appt.version,
          {
            status: "CANCELLED",
            cancelled_by_type: "CLIENT",
            public_cancel_token_hash: null,
            public_cancel_token_expires_at: null,
          },
        );

        if (!updated) {
          throw new CancelTokenGoneException();
        }

        await this.repo.insertAppointmentEvent(tx, {
          organization_id: resolved.organization_id,
          appointment_id: resolved.appointment_id,
          event_type: "CANCELLED",
          actor_type: "CLIENT",
          actor_user_id: null,
          metadata: {
            appointmentId: resolved.appointment_id,
            previousStatus: appt.status,
            newStatus: "CANCELLED",
            version: appt.version + 1,
            cancelledByType: "CLIENT",
          },
        });

        return { cancelled: true };
      },
    );
  }
}
