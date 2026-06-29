import { Injectable, Logger } from "@nestjs/common";
import * as jose from "jose";
import { randomBytes } from "node:crypto";

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  org?: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface RefreshTokenPayload {
  jti: string;
  sub: string;
  familyId: string;
  iat: number;
  exp: number;
}

const ALLOWED_ALGORITHMS = ["HS256"] as const;
const REFRESH_TOKEN_BYTES = 64;
// HS256 segurança = entropia do segredo. Abaixo de 32 chars é brute-forceável offline.
const JWT_SECRET_MIN_LENGTH = 32;

@Injectable()
export class JwtService {
  private readonly logger = new Logger(JwtService.name);
  private secret: Uint8Array | null = null;
  private issuer: string | null = null;
  private audience: string | null = null;
  private accessTtlSeconds: number = 900;

  private getSecret(): Uint8Array {
    if (!this.secret) {
      const raw = process.env.JWT_SECRET;
      if (!raw) {
        throw new Error("JWT_SECRET environment variable is not set");
      }
      if (raw.length < JWT_SECRET_MIN_LENGTH) {
        throw new Error(
          `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters (HS256 strength depends on secret entropy).`,
        );
      }
      this.secret = new TextEncoder().encode(raw);
    }
    return this.secret;
  }

  private getIssuer(): string {
    if (!this.issuer) {
      this.issuer = process.env.JWT_ISSUER ?? "nexos-booking";
    }
    return this.issuer;
  }

  private getAudience(): string {
    if (!this.audience) {
      this.audience = process.env.JWT_AUDIENCE ?? "nexos-api";
    }
    return this.audience;
  }

  private getAccessTtlSeconds(): number {
    const raw = process.env.ACCESS_TOKEN_TTL_SECONDS;
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return 900;
  }

  async signAccess(payload: {
    sub: string;
    sid: string;
    org?: string;
  }): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const ttl = this.getAccessTtlSeconds();

    const claims: AccessTokenPayload = {
      sub: payload.sub,
      sid: payload.sid,
      iat: now,
      exp: now + ttl,
      iss: this.getIssuer(),
      aud: this.getAudience(),
    };

    if (payload.org) {
      claims.org = payload.org;
    }

    return new jose.SignJWT(claims as unknown as jose.JWTPayload)
      .setProtectedHeader({ alg: "HS256" })
      .sign(this.getSecret());
  }

  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    const { payload } = await jose.jwtVerify(token, this.getSecret(), {
      algorithms: [...ALLOWED_ALGORITHMS],
      issuer: this.getIssuer(),
      audience: this.getAudience(),
    });

    if (!payload.sub || !payload.sid) {
      throw new Error("Access token missing required claims (sub, sid)");
    }

    return payload as unknown as AccessTokenPayload;
  }

  generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
  }
}
