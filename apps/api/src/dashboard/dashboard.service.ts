import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { DashboardRepository } from "./dashboard.repository";
import type { DashboardOverviewResponse } from "@nexos/shared";

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const TOP_SERVICES_WINDOW_DAYS = 30;
const TOP_SERVICES_LIMIT = 4;

/** Soma `amount` dias a uma data civil YYYY-MM-DD (aritmética em UTC, sem fuso). */
function addCivilDays(dateStr: string, amount: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + amount));
  return next.toISOString().slice(0, 10);
}

/** Rótulo curto (Seg, Ter, …) de uma data civil, independente de fuso. */
function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
  return WEEKDAY_LABELS[day]!;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DbService) private readonly db: DbService,
    @Inject(DashboardRepository) private readonly repo: DashboardRepository,
  ) {}

  async getOverview(
    orgId: string,
    userId: string,
  ): Promise<DashboardOverviewResponse> {
    return withTenantContext(this.db, orgId, userId, async (tx) => {
      const org = await this.repo.getOrgSettings(tx, orgId);
      if (!org) {
        throw new NotFoundException("Organization not found");
      }
      const tz = org.timezone;

      const { today, weekStart } = await this.repo.getCalendarBounds(tx, tz);
      const yesterday = addCivilDays(today, -1);
      const weekEnd = addCivilDays(weekStart, 6);
      const prevWeekStart = addCivilDays(weekStart, -7);
      const since = addCivilDays(today, -(TOP_SERVICES_WINDOW_DAYS - 1));

      // Janela única cobrindo semana anterior + atual; bucketização no JS.
      const dailyRows = await this.repo.getDailyRevenue(
        tx,
        orgId,
        tz,
        prevWeekStart,
        weekEnd,
      );
      const revenueByDate = new Map<string, number>();
      const countByDate = new Map<string, number>();
      for (const row of dailyRows) {
        revenueByDate.set(row.d, Number(row.cents));
        countByDate.set(row.d, Number(row.cnt));
      }

      const days = Array.from({ length: 7 }, (_, i) => {
        const date = addCivilDays(weekStart, i);
        return {
          date,
          weekday: weekdayLabel(date),
          revenueCents: revenueByDate.get(date) ?? 0,
        };
      });
      const totalCents = days.reduce((sum, d) => sum + d.revenueCents, 0);

      let previousTotalCents = 0;
      for (let i = 0; i < 7; i++) {
        previousTotalCents += revenueByDate.get(addCivilDays(prevWeekStart, i)) ?? 0;
      }

      const topRows = await this.repo.getTopServices(
        tx,
        orgId,
        tz,
        since,
        TOP_SERVICES_LIMIT,
      );

      return {
        currency: org.currency,
        today: {
          count: countByDate.get(today) ?? 0,
          revenueCents: revenueByDate.get(today) ?? 0,
        },
        yesterday: {
          revenueCents: revenueByDate.get(yesterday) ?? 0,
        },
        week: {
          from: weekStart,
          to: weekEnd,
          totalCents,
          previousTotalCents,
          days,
        },
        topServices: topRows.map((r) => ({
          serviceId: r.service_id,
          name: r.name,
          count: Number(r.count),
          revenueCents: Number(r.cents),
        })),
      };
    });
  }
}
