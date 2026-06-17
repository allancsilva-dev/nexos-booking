import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

import * as schema from "../../db/schema";

import { createPool } from "./db.config";
import type { DbClient } from "./db.types";

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly client: DbClient;

  constructor() {
    this.pool = createPool();
    this.client = drizzle(this.pool, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
