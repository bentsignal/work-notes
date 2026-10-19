import path from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { config, rootDir } from "./config.ts";
import * as schema from "./schema.ts";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
export const db = drizzle(pool, { schema });

/** Creates the database if it's missing, then applies any pending migrations. */
export async function prepareDatabase() {
  try {
    const client = await pool.connect();
    client.release();
  } catch (err) {
    if ((err as { code?: string }).code !== "3D000") throw err; // 3D000 = database does not exist
    const url = new URL(config.databaseUrl);
    const name = decodeURIComponent(url.pathname.slice(1));
    url.pathname = "/postgres";
    const admin = new pg.Client({ connectionString: url.toString() });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${name.replaceAll('"', '""')}"`);
      console.log(`Created database "${name}"`);
    } finally {
      await admin.end();
    }
  }
  await migrate(db, { migrationsFolder: path.join(rootDir, "drizzle") });
}
