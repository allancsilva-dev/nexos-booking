import { Injectable, Inject, NotFoundException } from "@nestjs/common";
import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import { RateLimitException } from "../common/exceptions/rate-limit.exception";
import { PublicBookingRepository } from "./public-booking.repository";
import { AvailabilityService } from "../scheduling/availability.service";
import type { RateLimiter } from "../auth/rate-limit/rate-limiter.interface";
import type { AvailabilityQuery } from "@nexos/shared";
import { sql } from "drizzle-orm";

interface AvailabilityRouteQuery {
  from: string;
  to: string;
  serviceId: string;
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

  private async checkRateLimit(ip: string) {
    const result = await this.rateLimiter.consume(`public:ip:${ip}`, 60, 60_000);
    if (!result.allowed) {
      throw new RateLimitException(
        Math.ceil((result.resetAt - Date.now()) / 1000),
      );
    }
  }

  private async resolveOrgBySlug(slug: string): Promise<string | null> {
    return this.db.client.transaction(async (tx) => {
      const result = await tx.execute<{ org_id: string }>(
        sql`SELECT app_resolve_org_by_slug(${slug}) AS org_id`,
      );
      return result.rows[0]?.org_id ?? null;
    });
  }

  async getVitrine(ip: string, slug: string) {
    await this.checkRateLimit(ip);

    const orgId = await this.resolveOrgBySlug(slug);
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
        })),
        professionals: professionals.map((p) => ({
          slug: p.slug,
          name: p.name,
        })),
      };
    });
  }

  async getProfessionals(ip: string, slug: string) {
    await this.checkRateLimit(ip);

    const orgId = await this.resolveOrgBySlug(slug);
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
    await this.checkRateLimit(ip);

    const orgId = await this.resolveOrgBySlug(orgSlug);
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
        from: query.from,
        to: query.to,
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
}
