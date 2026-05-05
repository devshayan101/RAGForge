import { getDb } from "../server/db";

async function run() {
  const db = await getDb();
  if (!db) return;
  
  try {
    console.log("Manually altering ingestionStatus enum...");
    await db.execute("ALTER TABLE `documents` MODIFY COLUMN `ingestionStatus` enum('uploading','pending','extracting','embedding','ready','failed','processing','completed') NOT NULL DEFAULT 'uploading'");
    console.log("✅ Successfully altered table.");
  } catch (error: any) {
    console.error("❌ Failed to alter table:", error.message);
  }
}

run();
