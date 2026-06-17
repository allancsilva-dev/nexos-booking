import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../db/schema";

export type DbClient = NodePgDatabase<typeof schema>;

export type DbTransaction = Parameters<
  Parameters<DbClient["transaction"]>[0]
>[0];
