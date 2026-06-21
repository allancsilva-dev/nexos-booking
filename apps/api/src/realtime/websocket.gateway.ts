import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from "@nestjs/websockets";
import { OnEvent } from "@nestjs/event-emitter";
import { Server, Socket } from "socket.io";
import { and, eq } from "drizzle-orm";
import { JwtService } from "../auth/jwt/jwt.service";
import { DbService } from "../db";
import { KickService } from "./kick.service";
import { ScrubbedLogger } from "../common/logger/scrubbed-logger.service";
import { organizationUsers, professionals } from "../../db/schema";
import type { PublishedEvent } from "./publisher.interface";

@WebSocketGateway({ namespace: "/appointments" })
export class AppointmentsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new ScrubbedLogger();

  constructor(
    private readonly jwt: JwtService,
    private readonly db: DbService,
    private readonly kickService: KickService,
  ) {}

  afterInit(server: Server) {
    this.kickService.setServer(server);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const data = client.handshake.auth as Record<string, unknown>;
      const token = typeof data.token === "string" ? data.token : undefined;
      if (!token) {
        this.logger.warn(`[ws] missing token, disconnecting ${client.id}`);
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAccess(token);
      const userId = payload.sub;
      const sid = payload.sid;
      const orgId = payload.org;

      if (!orgId) {
        this.logger.warn(`[ws] no org in token for ${client.id}`);
        client.disconnect(true);
        return;
      }

      const [membership] = await this.db.client
        .select()
        .from(organizationUsers)
        .where(
          and(
            eq(organizationUsers.organization_id, orgId),
            eq(organizationUsers.user_id, userId),
            eq(organizationUsers.status, "ACTIVE"),
          ),
        )
        .limit(1);

      if (!membership) {
        this.logger.warn(`[ws] no active membership for ${client.id}`);
        client.disconnect(true);
        return;
      }

      let professionalId: string | undefined;
      if (membership.role === "PROFESSIONAL") {
        const [prof] = await this.db.client
          .select({ id: professionals.id })
          .from(professionals)
          .where(
            and(
              eq(professionals.organization_id, orgId),
              eq(professionals.user_id, userId),
            ),
          )
          .limit(1);
        professionalId = prof?.id;
      }

      client.data = {
        sid,
        userId,
        orgId,
        role: membership.role,
        professionalId,
      };

      if (membership.role !== "PROFESSIONAL") {
        client.join(`org:${orgId}`);
      }
      if (membership.role === "PROFESSIONAL" && professionalId) {
        client.join(`professional:${orgId}:${professionalId}`);
      }

      this.kickService.register(sid, client.id);
      this.logger.log(`[ws] ${client.id} connected (user=${userId}, org=${orgId})`);
    } catch (err) {
      this.logger.warn(
        `[ws] auth failed for ${client.id}: ${err instanceof Error ? err.message : "unknown"}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const data = client.data as Record<string, unknown> | undefined;
    const sid = typeof data?.sid === "string" ? data.sid : undefined;
    if (sid) {
      this.kickService.unregister(sid, client.id);
    }
    this.logger.log(`[ws] ${client.id} disconnected`);
  }

  @OnEvent("appointment.changed")
  handleAppointmentChanged(event: PublishedEvent): void {
    const payload = {
      appointmentId: event.appointmentId,
      professionalId: event.professionalId,
      eventType: event.eventType,
      date: event.date,
      version: event.version,
      occurredAt: event.occurredAt,
    };

    if (event.organizationId) {
      this.server.to(`org:${event.organizationId}`).emit("appointment.changed", payload);
      this.server
        .to(`professional:${event.organizationId}:${event.professionalId}`)
        .emit("appointment.changed", payload);
    }
  }
}
