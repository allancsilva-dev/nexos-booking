import { z } from "zod";

/**
 * Visão agregada do dashboard (`GET /dashboard/overview`).
 * Métricas calculadas server-side no fuso/moeda da organização.
 * Receita = soma de `service_price_cents_snapshot` de agendamentos `status != 'CANCELLED'`.
 */

export const DashboardWeekDaySchema = z.object({
  date: z.string(), // civil date YYYY-MM-DD (fuso da org)
  weekday: z.string(), // rótulo curto: Seg, Ter, ...
  revenueCents: z.number().int().min(0),
});
export type DashboardWeekDay = z.infer<typeof DashboardWeekDaySchema>;

export const DashboardTopServiceSchema = z.object({
  serviceId: z.string().uuid(),
  name: z.string(),
  count: z.number().int().min(0),
  revenueCents: z.number().int().min(0),
});
export type DashboardTopService = z.infer<typeof DashboardTopServiceSchema>;

export const DashboardOverviewSchema = z.object({
  currency: z.string().length(3),
  today: z.object({
    count: z.number().int().min(0),
    revenueCents: z.number().int().min(0),
  }),
  yesterday: z.object({
    revenueCents: z.number().int().min(0),
  }),
  week: z.object({
    from: z.string(), // civil date YYYY-MM-DD (segunda)
    to: z.string(), // civil date YYYY-MM-DD (domingo)
    totalCents: z.number().int().min(0),
    previousTotalCents: z.number().int().min(0),
    days: z.array(DashboardWeekDaySchema).length(7),
  }),
  topServices: z.array(DashboardTopServiceSchema),
});
export type DashboardOverviewResponse = z.infer<typeof DashboardOverviewSchema>;
