import { readFileSync } from "node:fs";
import path from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { api, purgeOld } from "./api.ts";
import { config, rootDir } from "./config.ts";
import { prepareDatabase } from "./db.ts";
import { backfillEmbeddings } from "./embeddings.ts";

const distDir = path.join(rootDir, "dist");

const app = new Hono();
app.route("/api", api);
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// The built UI (npm run build). Any other path gets index.html so client-side routes work on reload.
app.use("*", serveStatic({ root: distDir }));
app.get("*", (c) => {
  try {
    return c.html(readFileSync(path.join(distDir, "index.html"), "utf8"));
  } catch {
    return c.text("UI not built yet. Run `npm run build`, or use `npm run dev` and open http://localhost:5173", 503);
  }
});

// At login Postgres may still be starting, so keep trying for a few minutes.
for (let attempt = 1; ; attempt++) {
  try {
    await prepareDatabase();
    break;
  } catch (err) {
    if (attempt >= 36) throw err;
    console.warn(`Database not ready (${(err as Error).message}), retrying in 5s…`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

const server = serve(
  // Hono's replacement global Response breaks the model downloader's `instanceof Response` check.
  { fetch: app.fetch, port: config.port, hostname: "127.0.0.1", overrideGlobalObjects: false },
  ({ port }) => {
    console.log(`Notes running at http://localhost:${port}`);
  },
);
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Is the notes server already running?`);
    process.exit(1);
  }
  throw err;
});

await purgeOld();
setInterval(() => purgeOld().catch(console.error), 6 * 60 * 60 * 1000);
backfillEmbeddings().catch(console.error);
