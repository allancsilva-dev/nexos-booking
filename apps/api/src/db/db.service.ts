import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import * as schema from "../../db/schema";

import { createPool, validateRuntimeRole } from "./db.config";
import type { DbClient } from "./db.types";

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;
  readonly client: DbClient;

  constructor() {
    this.pool = createPool();
    this.client = drizzle(this.pool, { schema });
  }

  async onModuleInit(): Promise<void> {
    await validateRuntimeRole(this.pool);
    Logger.log("Runtime role validated for RLS compliance", "DbService");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
