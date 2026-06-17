import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";

import { DbService } from "../db";

const READINESS_DB_TIMEOUT_MS = 2000;

@Controller()
export class HealthController {
  constructor(
    @Inject(DbService) private readonly db: DbService,
  ) {}

  @Get("health")
  health(@Res() res: Response): void {
    res.status(200).json({ status: "ok" });
  }

  @Get("ready")
  async ready(@Res() res: Response): Promise<void> {
    try {
      await Promise.race([
        this.db.pool.query("SELECT 1"),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("readiness DB probe timed out")),
            READINESS_DB_TIMEOUT_MS,
          ),
        ),
      ]);
      res.status(200).json({ status: "ok", database: "connected" });
    } catch {
      res.status(503).json({ status: "error", database: "disconnected" });
    }
  }
}
