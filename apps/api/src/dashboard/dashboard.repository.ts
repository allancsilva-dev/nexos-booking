import { Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { DbTransaction } from "../db/db.types";

/**
 * Agregações do dashboard. Todas as datas são resolvidas no fuso da organização
 * (`AT TIME ZONE`), e a receita ignora agendamentos cancelados.
 * Roda sempre dentro de `withTenantContext` (RLS como app_runtime).
 */
@Injectable()
export class DashboardRepository {
  /** Fuso e moeda da organização ativa. */
  async getOrgSettings(tx: DbTransaction, orgId: string) {
    const result = await tx.execute(sql`
      SELECT timezone, currency
      FROM organizations
      WHERE id = ${orgId}
      LIMIT 1
    `);
    return (result.rows[0] as { timezone: string; currency: string } | undefined) ?? null;
  }

  /** Data civil de hoje e a segunda-feira da semana corrente, no fuso da org. */
  async getCalendarBounds(tx: DbTransaction, tz: string) {
    const result = await tx.execute(sql`
      SELECT
        (now() AT TIME ZONE ${tz})::date AS today,
        date_trunc('week', (now() AT TIME ZONE ${tz}))::date AS week_start
    `);
    const row = result.rows[0] as { today: string; week_start: string };
    return { today: row.today, weekStart: row.week_start };
  }

  /** Receita (centavos) por data civil, no intervalo [from, to] inclusivo. */
  async getDailyRevenue(
    tx: DbTransaction,
    orgId: string,
    tz: string,
    from: string,
    to: string,
  ) {
    const result = await tx.execute(sql`
      SELECT
        (starts_at AT TIME ZONE ${tz})::date AS d,
        COALESCE(SUM(service_price_cents_snapshot), 0)::bigint AS cents,
        COUNT(*)::int AS cnt
      FROM appointments
      WHERE organization_id = ${orgId}
        AND status <> 'CANCELLED'
        AND (starts_at AT TIME ZONE ${tz})::date BETWEEN ${from}::date AND ${to}::date
      GROUP BY 1
    `);
    return result.rows as Array<{ d: string; cents: string; cnt: number }>;
  }

  /** Top serviços por contagem desde `since` (inclusivo), nome vivo com fallback no snapshot. */
  async getTopServices(
    tx: DbTransaction,
    orgId: string,
    tz: string,
    since: string,
    limit: number,
  ) {
    const result = await tx.execute(sql`
      SELECT
        a.service_id AS service_id,
        COALESCE(s.name, MAX(a.service_name_snapshot)) AS name,
        COUNT(*)::int AS count,
        COALESCE(SUM(a.service_price_cents_snapshot), 0)::bigint AS cents
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.organization_id = ${orgId}
        AND a.status <> 'CANCELLED'
        AND (a.starts_at AT TIME ZONE ${tz})::date >= ${since}::date
      GROUP BY a.service_id, s.name
      ORDER BY count DESC, cents DESC
      LIMIT ${limit}
    `);
    return result.rows as Array<{
      service_id: string;
      name: string;
      count: number;
      cents: string;
    }>;
  }
}
