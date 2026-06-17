import { sql } from "drizzle-orm";

import type { DbService } from "./db.service";
import type { DbTransaction } from "./db.types";

export async function withTenantContext<T>(
  db: DbService,
  orgId: string,
  userId: string | null,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.client.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_organization_id', ${orgId}, true)`,
    );

    await tx.execute(
      sql`SELECT set_config('app.current_user_id', ${userId ?? ""}, true)`,
    );

    return fn(tx);
  });
}
