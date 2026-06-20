import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { AvailabilityRepository } from "./availability.repository";
import { alignToSlotGrid } from "@nexos/shared";
import type { AvailabilityQuery, AvailabilityResponse, AvailabilityDay, AvailabilitySlot } from "@nexos/shared";

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
    const { from, to, serviceId } = query;

    return withTenantContext(this.db, orgId, userId, async (tx) => {
      if (role === "PROFESSIONAL") {
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
        throw new NotFoundException("Service not found");
      }

      const config = await this.repo.findOrgConfig(tx, orgId);
      if (!config) {
        throw new NotFoundException("Organization not found");
      }

      if (!prof.active) {
        return {
          professionalId,
          serviceId,
          timezone: config.timezone,
          slotIntervalMin: config.slotIntervalMin,
          days: [],
        };
      }

      const whRows = await this.repo.findWorkingHours(
        tx,
        orgId,
        professionalId,
      );

      const blockRows = await this.repo.findBlocks(
        tx,
        orgId,
        professionalId,
        from,
        to,
      );

      const appointmentRows = await this.repo.findActiveAppointments(
        tx,
        orgId,
        professionalId,
        from,
        to,
      );

      const now = new Date();
      const durationMs = service.duration_min * 60 * 1000;
      const stepMs = config.slotIntervalMin * 60 * 1000;
      const days: AvailabilityDay[] = [];

      const fromDate = new Date(from);
      const toDate = new Date(to);
      let probe = new Date(fromDate.getTime());

      while (true) {
        const dateStr = getDateKey(probe, config.timezone);
        const [y, m, d] = dateStr.split("-").map(Number);

        const dayStartUtc = wallTimeToInstant(
          dateStr,
          "00:00:00",
          config.timezone,
        );
        if (dayStartUtc.getTime() >= toDate.getTime()) break;

        const weekday = getWeekdayForDate(dateStr, config.timezone);
        const shifts = whRows.filter((wh) => wh.weekday === weekday);

        const slots: AvailabilitySlot[] = [];

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

          let candidate = new Date(shiftStart.getTime());
          const anchor = new Date(shiftStart.getTime());

          while (true) {
            const slotStart = alignToSlotGrid(
              candidate,
              anchor,
              config.slotIntervalMin,
            );
            const slotEnd = new Date(slotStart.getTime() + durationMs);

            if (slotEnd.getTime() > shiftEnd.getTime()) break;

            if (slotStart.getTime() >= now.getTime()) {
              const blocked = blockRows.some(
                (b) =>
                  b.starts_at.getTime() < slotEnd.getTime() &&
                  b.ends_at.getTime() > slotStart.getTime(),
              );
              const hasAppointment = appointmentRows.some(
                (a) =>
                  a.starts_at.getTime() < slotEnd.getTime() &&
                  a.ends_at.getTime() > slotStart.getTime(),
              );

              if (!blocked && !hasAppointment) {
                slots.push({
                  startsAt: slotStart.toISOString(),
                  endsAt: slotEnd.toISOString(),
                });
              }
            }

            candidate = new Date(slotStart.getTime() + stepMs);
          }
        }

        slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        days.push({ date: dateStr, slots });

        probe = new Date(Date.UTC(y!, m! - 1, d! + 1));
      }

      return {
        professionalId,
        serviceId,
        timezone: config.timezone,
        slotIntervalMin: config.slotIntervalMin,
        days,
      };
    });
  }
}
