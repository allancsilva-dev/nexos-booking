import { Inject } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { ExtendedError, Server, Socket } from "socket.io";

import { JwtService } from "../auth/jwt/jwt.service";
import { ScrubbedLogger } from "../common/logger/scrubbed-logger.service";
import { DbService } from "../db";
import { withTenantContext } from "../db/tenant-context";
import {
  organizationUsers,
  professionals,
  refreshSessions,
} from "../../db/schema";
import { KickService } from "./kick.service";
import { RedisRealtimeTransport } from "./redis-realtime.transport";

const corsOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

type AuthenticatedSocketData = {
  sid: string;
  userId: string;
  orgId: string;
  role: string;
  professionalId?: string;
};

function authError(code: "TOKEN_EXPIRED" | "UNAUTHORIZED"): ExtendedError {
  const error = new Error("WebSocket authentication failed") as ExtendedError;
  error.data = { code };
  return error;
}

function isOriginAllowed(client: Socket): boolean {
  const origin = client.handshake.headers.origin;
  if (!origin) return true;
  if (corsOrigins.length > 0) return corsOrigins.includes(origin);

  const forwardedHost = client.handshake.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
    ?? client.handshake.headers.host;
  const forwardedProto = client.handshake.headers["x-forwarded-proto"];
  const protocol = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)
    ?? (client.handshake.secure ? "https" : "http");
  return !!host && origin === `${protocol}://${host}`;
}

@WebSocketGateway({
  namespace: "/appointments",
  cors: { origin: corsOrigins, credentials: true },
})
export class AppointmentsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server?: Server;

  private readonly logger = new ScrubbedLogger();

  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(DbService) private readonly db: DbService,
    @Inject(KickService) private readonly kickService: KickService,
    @Inject(RedisRealtimeTransport) private readonly transport: RedisRealtimeTransport,
  ) {}

  afterInit(server?: Server): void {
    const socketServer = server ?? this.server;
    if (!socketServer) throw new Error("Socket server unavailable during gateway init.");

    this.server = socketServer;
    this.kickService.setServer(socketServer);
    this.transport.setServer(socketServer);
    socketServer.use((client, next) => void this.authenticate(client, next));
  }

  handleConnection(client: Socket): void {
    const data = client.data as AuthenticatedSocketData;
    void client.join(`session:${data.sid}`);
    if (data.role === "PROFESSIONAL" && data.professionalId) {
      void client.join(`professional:${data.orgId}:${data.professionalId}`);
    } else {
      void client.join(`org:${data.orgId}`);
    }
    this.logger.log(`[ws] connected socket=${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`[ws] disconnected socket=${client.id}`);
  }

  private async authenticate(
    client: Socket,
    next: (error?: ExtendedError) => void,
  ): Promise<void> {
    if (!isOriginAllowed(client)) {
      next(authError("UNAUTHORIZED"));
      return;
    }

    try {
      const data = client.handshake.auth as Record<string, unknown>;
      const token = typeof data.token === "string" ? data.token : undefined;
      if (!token) throw authError("UNAUTHORIZED");

      const payload = await this.jwt.verifyAccess(token);
      if (!payload.org) throw authError("UNAUTHORIZED");

      const auth = await withTenantContext(
        this.db,
        payload.org,
        payload.sub,
        async (tx): Promise<AuthenticatedSocketData | null> => {
          const [session] = await tx
            .select({ id: refreshSessions.id })
            .from(refreshSessions)
            .where(and(
              eq(refreshSessions.family_id, payload.sid),
              eq(refreshSessions.user_id, payload.sub),
              isNull(refreshSessions.revoked_at),
              gt(refreshSessions.expires_at, new Date()),
            ))
            .limit(1);
          if (!session) return null;

          const [membership] = await tx
            .select({ role: organizationUsers.role })
            .from(organizationUsers)
            .where(and(
              eq(organizationUsers.organization_id, payload.org!),
              eq(organizationUsers.user_id, payload.sub),
              eq(organizationUsers.status, "ACTIVE"),
            ))
            .limit(1);
          if (!membership) return null;

          let professionalId: string | undefined;
          if (membership.role === "PROFESSIONAL") {
            const [professional] = await tx
              .select({ id: professionals.id })
              .from(professionals)
              .where(and(
                eq(professionals.organization_id, payload.org!),
                eq(professionals.user_id, payload.sub),
                eq(professionals.active, true),
              ))
              .limit(1);
            if (!professional) return null;
            professionalId = professional.id;
          }

          return {
            sid: payload.sid,
            userId: payload.sub,
            orgId: payload.org!,
            role: membership.role,
            professionalId,
          };
        },
      );

      if (!auth) throw authError("UNAUTHORIZED");
      client.data = auth;
      next();
    } catch (error) {
      const code = (error as { code?: string }).code;
      next(authError(code === "ERR_JWT_EXPIRED" ? "TOKEN_EXPIRED" : "UNAUTHORIZED"));
    }
  }
}
