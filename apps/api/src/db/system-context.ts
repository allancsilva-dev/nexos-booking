import { sql } from "drizzle-orm";

import type { DbService } from "./db.service";
import type { DbTransaction } from "./db.types";

export async function withSystemContext<T>(
  db: DbService,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.is_system', 'true', true)`,
    );

    return fn(tx);
  });
}
