import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  NotFoundException,
} from "@nestjs/common";
import type { Request } from "express";
import { PublicBookingRepository } from "../public-booking.repository";

@Injectable()
export class PublicTenantGuard implements CanActivate {
  constructor(
    @Inject(PublicBookingRepository)
    private readonly repo: PublicBookingRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const slug = (req.params as Record<string, string>).orgSlug;
    if (!slug) return true;

    const orgId = await this.repo.resolveOrgBySlug(slug);
    if (!orgId) {
      throw new NotFoundException("Organization not found");
    }

    (req as unknown as { publicTenant?: { organizationId: string } }).publicTenant = {
      organizationId: orgId,
    };
    return true;
  }
}
