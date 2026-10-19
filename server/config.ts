import path from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(path.join(rootDir, ".env"));
} catch {
  // No .env file; fall back to defaults below.
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/work_notes",
  port: Number(process.env.PORT ?? 4747),
  semanticSearch: process.env.SEMANTIC_SEARCH !== "false",
};
