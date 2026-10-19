import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "./db.ts";
import { cosine, embed, scheduleEmbedding } from "./embeddings.ts";
import { images, notes } from "./schema.ts";

export const TRASH_DAYS = 30;

const summaryFields = {
  id: notes.id,
  title: notes.title,
  snippet: sql<string>`left(${notes.contentText}, 200)`,
  updatedAt: notes.updatedAt,
  deletedAt: notes.deletedAt,
};

const noteFields = {
  id: notes.id,
  title: notes.title,
  contentHtml: notes.contentHtml,
  createdAt: notes.createdAt,
  updatedAt: notes.updatedAt,
  deletedAt: notes.deletedAt,
};

type NoteInput = { title?: string; contentHtml?: string; contentText?: string };

function pickInput(body: NoteInput) {
  const values: NoteInput = {};
  if (typeof body.title === "string") values.title = body.title;
  if (typeof body.contentHtml === "string") values.contentHtml = body.contentHtml;
  if (typeof body.contentText === "string") values.contentText = body.contentText;
  return values;
}

/** Matches on words and word prefixes (Postgres full-text) plus plain substrings. */
async function textSearch(q: string) {
  const words = q.match(/[\p{L}\p{N}]+/gu) ?? [];
  const tsquery = words.map((w) => `${w}:*`).join(" & ");
  const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const query = sql`to_tsquery('english', ${tsquery})`;
  const rank = tsquery ? sql<number>`ts_rank(${notes.searchVector}, ${query})` : sql<number>`0`;
  const matches = sql`(${notes.title} ilike ${like} or ${notes.contentText} ilike ${like}${
    tsquery ? sql` or ${notes.searchVector} @@ ${query}` : sql``
  })`;
  const rows = await db
    .select({ id: notes.id, rank })
    .from(notes)
    .where(and(isNull(notes.deletedAt), matches))
    .orderBy(desc(rank), desc(notes.updatedAt))
    .limit(50);
  return rows.map((r) => r.id);
}

// Cosine similarity below this is usually unrelated text.
const SEMANTIC_THRESHOLD = 0.2;

async function semanticSearch(q: string) {
  const vector = await embed(q);
  if (!vector) return [];
  const rows = await db
    .select({ id: notes.id, embedding: notes.embedding })
    .from(notes)
    .where(and(isNull(notes.deletedAt), isNotNull(notes.embedding)));
  return rows
    .map((r) => ({ id: r.id, score: cosine(vector, r.embedding!) }))
    .filter((r) => r.score >= SEMANTIC_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map((r) => r.id);
}

/** Merges the two ranked lists with reciprocal rank fusion. */
async function search(q: string) {
  const [textIds, semanticIds] = await Promise.all([textSearch(q), semanticSearch(q)]);
  const scores = new Map<string, number>();
  for (const ids of [textIds, semanticIds]) {
    ids.forEach((id, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank)));
  }
  const ids = [...scores.keys()];
  if (!ids.length) return [];
  const rows = await db.select(summaryFields).from(notes).where(inArray(notes.id, ids));
  const textSet = new Set(textIds);
  return rows
    .map((r) => ({ ...r, match: textSet.has(r.id) ? ("text" as const) : ("meaning" as const) }))
    .sort((a, b) => scores.get(b.id)! - scores.get(a.id)!);
}

export const api = new Hono()
  .get("/notes", async (c) => {
    const q = c.req.query("q")?.trim();
    if (q) return c.json(await search(q));
    return c.json(await db.select(summaryFields).from(notes).where(isNull(notes.deletedAt)).orderBy(desc(notes.updatedAt)));
  })

  .get("/trash", async (c) =>
    c.json(await db.select(summaryFields).from(notes).where(isNotNull(notes.deletedAt)).orderBy(desc(notes.deletedAt))),
  )

  .delete("/trash", async (c) => {
    await db.delete(notes).where(isNotNull(notes.deletedAt));
    return c.body(null, 204);
  })

  .post("/notes", async (c) => {
    const [note] = await db.insert(notes).values(pickInput(await c.req.json())).returning(noteFields);
    scheduleEmbedding(note.id);
    return c.json(note, 201);
  })

  .get("/notes/:id", async (c) => {
    const [note] = await db.select(noteFields).from(notes).where(eq(notes.id, c.req.param("id")));
    return note ? c.json(note) : c.json({ error: "Not found" }, 404);
  })

  .patch("/notes/:id", async (c) => {
    const values = pickInput(await c.req.json());
    const [note] = await db
      .update(notes)
      .set({ ...values, updatedAt: new Date(), embedding: null })
      .where(eq(notes.id, c.req.param("id")))
      .returning({ id: notes.id, updatedAt: notes.updatedAt });
    if (!note) return c.json({ error: "Not found" }, 404);
    scheduleEmbedding(note.id);
    return c.json(note);
  })

  // Moves a note to Recently Deleted.
  .delete("/notes/:id", async (c) => {
    await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, c.req.param("id")));
    return c.body(null, 204);
  })

  .post("/notes/:id/restore", async (c) => {
    await db.update(notes).set({ deletedAt: null }).where(eq(notes.id, c.req.param("id")));
    return c.body(null, 204);
  })

  .delete("/notes/:id/permanent", async (c) => {
    await db.delete(notes).where(eq(notes.id, c.req.param("id")));
    return c.body(null, 204);
  })

  // Pasted/dropped images. The raw file is the request body.
  .post("/images", async (c) => {
    const mime = c.req.header("content-type") ?? "";
    if (!mime.startsWith("image/")) return c.json({ error: "Expected an image" }, 400);
    const data = Buffer.from(await c.req.arrayBuffer());
    const [image] = await db.insert(images).values({ mime, data }).returning({ id: images.id });
    return c.json({ url: `/api/images/${image.id}` }, 201);
  })

  .get("/images/:id", async (c) => {
    const [image] = await db.select().from(images).where(eq(images.id, c.req.param("id")));
    if (!image) return c.json({ error: "Not found" }, 404);
    return c.body(new Uint8Array(image.data), 200, {
      "Content-Type": image.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });

/** Permanently removes notes deleted over 30 days ago, and images no note references anymore. */
export async function purgeOld() {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000);
  const purged = await db.delete(notes).where(lt(notes.deletedAt, cutoff)).returning({ id: notes.id });
  // Grace period so an image pasted into an unsaved draft isn't removed out from under it.
  const orphans = await db.execute(sql`
    delete from ${images} i
    where i.created_at < now() - interval '1 day'
      and not exists (select 1 from ${notes} n where position(i.id::text in n.content_html) > 0)
  `);
  if (purged.length || orphans.rowCount) {
    console.log(`Purged ${purged.length} old notes and ${orphans.rowCount ?? 0} unused images`);
  }
}
