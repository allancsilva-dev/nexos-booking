import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { AvailabilityRepository } from "./availability.repository";
import { ProfessionalServiceNotLinkedException } from "../common/exceptions/domain.exception";
import { ValidationException } from "../common/exceptions/validation.exception";
import {
  addCivilDays,
  alignToSlotGrid,
  civilDateStartToInstant,
  formatInstantWithOffset,
  instantToCivilDate,
  zonedDateTimeToInstant,
  AVAILABILITY_MAX_RANGE_DAYS,
} from "@nexos/shared";
import type { AvailabilityQuery, AvailabilityResponse, AvailabilityDay, AvailabilitySlot } from "@nexos/shared";
import { resolveEffectiveSlotStepMin } from "./slot-step.util";
import { computeOccupiedUntil } from "./occupied-interval.util";

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

@Injectable()
export class AvailabilityService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(AvailabilityRepository)
    private readonly repo: AvailabilityRepository,
  ) {}

  async getAvailability(
    orgId: string,
    userId: string,
    role: string,
    professionalId: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    const serviceId = query.serviceId;

    return withTenantContext(this.db, orgId, userId, async (tx) => {
      if (userId && role === "PROFESSIONAL") {
        const profByUser = await this.repo.findProfessionalByUserId(
          tx,
          orgId,
          userId,
        );
        if (!profByUser || profByUser.id !== professionalId) {
          throw new ForbiddenException("Forbidden");
        }
      }

      const prof = await this.repo.findProfessionalById(
        tx,
        orgId,
        professionalId,
      );
      if (!prof) {
        throw new NotFoundException("Professional not found");
      }

      const service = await this.repo.findServiceById(tx, orgId, serviceId);
      if (!service) {
        throw new NotFoundException("Service not found");
      }
      if (!service.active) {
        throw new NotFoundException("Service not found");
      }

      const junction = await this.repo.findProfessionalService(
        tx,
        orgId,
        professionalId,
        serviceId,
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

      if (!prof.active) {
        return {
          professionalId,
          serviceId,
          timezone: config.timezone,
          slotIntervalMin: effectiveSlotStepMin,
          days: [],
        };
      }

      const fromCivilDate = query.date ?? query.from!;
      const toCivilDateExclusive = query.date
        ? addCivilDays(query.date, 1)
        : query.to!;
      // Defesa em profundidade (BUG-029): o schema já limita a janela, mas o
      // loop de slots vive aqui — recusar range gigante mesmo se chamado por
      // dentro (ex.: rota pública monta o query antes de delegar).
      const spanDays =
        (Date.parse(toCivilDateExclusive) - Date.parse(fromCivilDate)) /
        86_400_000;
      if (spanDays > AVAILABILITY_MAX_RANGE_DAYS) {
        throw new ValidationException("Invalid input", [
          {
            field: "to",
            issue: `from..to range exceeds ${AVAILABILITY_MAX_RANGE_DAYS} days`,
          },
        ]);
      }

      const rangeStart = civilDateStartToInstant(fromCivilDate, config.timezone);
      const rangeEnd = civilDateStartToInstant(toCivilDateExclusive, config.timezone);

      const whRows = await this.repo.findWorkingHours(
        tx,
        orgId,
        professionalId,
      );

      const blockRows = await this.repo.findBlocks(
        tx,
        orgId,
        professionalId,
        rangeStart,
        rangeEnd,
      );

      const appointmentRows = await this.repo.findActiveAppointments(
        tx,
        orgId,
        professionalId,
        rangeStart,
        rangeEnd,
      );

      const now = new Date();
      const stepMs = effectiveSlotStepMin * 60 * 1000;
      const days: AvailabilityDay[] = [];
      let dateStr = fromCivilDate;

      while (dateStr < toCivilDateExclusive) {

        const weekday = getWeekdayForDate(dateStr, config.timezone);
        const shifts = whRows.filter((wh) => wh.weekday === weekday);

        const slots: AvailabilitySlot[] = [];

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

          let candidate = new Date(shiftStart.getTime());
          const anchor = new Date(shiftStart.getTime());

          while (true) {
            const slotStart = alignToSlotGrid(
              candidate,
              anchor,
              effectiveSlotStepMin,
            );
            const slotEnd = new Date(
              slotStart.getTime() + service.duration_min * 60 * 1000,
            );
            const occupiedUntil = computeOccupiedUntil(
              slotEnd,
              service.buffer_after_min,
            );

            if (occupiedUntil.getTime() > shiftEnd.getTime()) break;

            if (slotStart.getTime() >= now.getTime()) {
              const blocked = blockRows.some(
                (b) =>
                  b.starts_at.getTime() < occupiedUntil.getTime() &&
                  b.ends_at.getTime() > slotStart.getTime(),
              );
              const hasAppointment = appointmentRows.some(
                (a) =>
                  a.starts_at.getTime() < occupiedUntil.getTime() &&
                  a.occupied_until.getTime() > slotStart.getTime(),
              );

              if (!blocked && !hasAppointment) {
                slots.push({
                  startsAt: formatInstantWithOffset(slotStart, config.timezone),
                  endsAt: formatInstantWithOffset(slotEnd, config.timezone),
                });
              }
            }

            candidate = new Date(slotStart.getTime() + stepMs);
          }
        }

        slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        days.push({ date: dateStr, slots });
        dateStr = addCivilDays(dateStr, 1);
      }

      return {
        professionalId,
        serviceId,
        timezone: config.timezone,
        slotIntervalMin: effectiveSlotStepMin,
        days,
      };
    });
  }
}
