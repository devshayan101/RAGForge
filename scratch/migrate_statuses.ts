import { getDb } from "../server/db";
import { documents } from "../drizzle/schema";
import { eq } from "drizzle-orm";

async function migrate() {
  console.log("Migrating document statuses...");
  const db = await getDb();
  if (!db) {
    console.error("Database not available");
    return;
  }

  try {
    // 1. Update completed to ready
    // We use a raw SQL query because drizzle types might not match the current DB state if migrations are pending
    await db.execute('UPDATE documents SET ingestionStatus = "ready" WHERE ingestionStatus = "completed"');
    console.log("✅ Updated 'completed' to 'ready'");

    // 2. Update processing to extracting (conservative choice)
    await db.execute('UPDATE documents SET ingestionStatus = "extracting" WHERE ingestionStatus = "processing"');
    console.log("✅ Updated 'processing' to 'extracting'");

  } catch (error: any) {
    console.error("❌ Migration failed:", error.message);
  }
}

migrate();
