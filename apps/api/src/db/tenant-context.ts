import { sql } from "drizzle-orm";

import type { DbService } from "./db.service";
import type { DbTransaction } from "./db.types";

// Restricted helper for flows that already own a transaction and need the
// canonical tenant GUCs before any tenant-scoped write.
export async function applyTenantContext(
  tx: DbTransaction,
  orgId: string,
  userId: string | null,
): Promise<void> {
  await tx.execute(
    sql`SELECT set_config('app.current_organization_id', ${orgId}, true)`,
  );

  await tx.execute(
    sql`SELECT set_config('app.current_user_id', ${userId ?? ""}, true)`,
  );
}

export async function withTenantContext<T>(
  db: DbService,
  orgId: string,
  userId: string | null,
  fn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.client.transaction(async (tx) => {
    await applyTenantContext(tx, orgId, userId);
    return fn(tx);
  });
}
