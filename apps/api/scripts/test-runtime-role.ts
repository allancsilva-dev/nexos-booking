import "../src/load-env";
import "../src/config/load-env";

import { DbService } from "../src/db";
import { inspectRuntimeRole } from "../src/db/db.config";

async function main(): Promise<void> {
  const db = new DbService();

  try {
    await db.onModuleInit();

    const role = await inspectRuntimeRole(db.pool);
    console.log(
      JSON.stringify(
        {
          proof: "runtime-role",
          current_user: role.currentUser,
          rolbypassrls: role.rolbypassrls,
          rolsuper: role.rolsuper,
        },
        null,
        2,
      ),
    );
  } finally {
    await db.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
