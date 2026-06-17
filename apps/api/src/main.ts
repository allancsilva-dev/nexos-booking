import "reflect-metadata";

import { json } from "express";
import type { Request, Response, NextFunction } from "express";
import helmet from "helmet";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { ERROR_CODES } from "@nexos/shared";

import { buildErrorEnvelope } from "./common/errors/build-error-envelope";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = Number(process.env.PORT ?? 3001);
  const bodyLimit = Number(process.env.BODY_LIMIT_BYTES ?? 102400);

  // 1. X-Request-Id middleware - must run first so requestId exists even for body parse errors
  app.use(requestIdMiddleware);

  // 2. Helmet - security headers on every response
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 15552000,
        includeSubDomains: true,
      },
      xContentTypeOptions: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      frameguard: { action: "deny" },
    }),
  );

  // 3. Body parser with size limit
  app.use(json({ limit: bodyLimit }));

  // 4. Express error middleware - captures body-parser errors (entity.too.large) before Nest filter
  app.use(function payloadErrorHandler(
    err: { type?: string; status?: number },
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    if (err.type === "entity.too.large" || err.status === 413) {
      const requestId = (req.headers["x-request-id"] as string) ?? "unknown";
      res.status(413).json(
        buildErrorEnvelope({
          code: "BAD_REQUEST",
          message: "Payload too large.",
          requestId,
        }),
      );
      return;
    }
    next(err);
  });

  // 5. Request timeout middleware - 30s deadline
  app.use((req: Request, res: Response, next: NextFunction) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        const requestId = (req.headers["x-request-id"] as string) ?? "unknown";
        res.status(500).json(
          buildErrorEnvelope({
            code: "INTERNAL_ERROR",
            message: "Request timeout.",
            requestId,
          }),
        );
      }
    }, 30_000);
    res.on("finish", () => clearTimeout(timer));
    next();
  });

  // 6. Global exception filter - catches all unhandled errors, mounts error envelope
  app.useGlobalFilters(new HttpExceptionFilter());

  await app.listen(port);
  Logger.log(
    `API online on port ${port} with ${ERROR_CODES.length} contract error codes`,
    "Bootstrap",
  );
}

void bootstrap();
