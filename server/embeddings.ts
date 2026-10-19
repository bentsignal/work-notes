import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { config, rootDir } from "./config.ts";
import { db } from "./db.ts";
import { notes } from "./schema.ts";

type Extractor = (texts: string[], options: object) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor | null> | undefined;

/** Loads the embedding model once (downloading it on first run). Resolves to null if unavailable. */
function getExtractor() {
  if (!config.semanticSearch) return Promise.resolve(null);
  extractorPromise ??= (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = path.join(rootDir, ".cache", "models");
      const extractor = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
      console.log("Semantic search ready");
      return extractor as unknown as Extractor;
    } catch (err) {
      console.warn("Semantic search unavailable, falling back to text search only:", (err as Error).message);
      return null;
    }
  })();
  return extractorPromise;
}

// The model reads ~256 tokens at a time, so long notes are embedded in chunks and averaged.
const CHUNK_CHARS = 1000;
const MAX_CHUNKS = 16;

function chunk(text: string) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < MAX_CHUNKS; i += CHUNK_CHARS) {
    chunks.push(text.slice(i, i + CHUNK_CHARS));
  }
  return chunks.length ? chunks : [""];
}

function normalize(v: number[]) {
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
}

export async function embed(text: string): Promise<number[] | null> {
  const extractor = await getExtractor();
  if (!extractor) return null;
  const vectors = (await extractor(chunk(text), { pooling: "mean", normalize: true })).tolist();
  const mean = vectors[0].map((_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length);
  return normalize(mean);
}

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Background queue: notes are re-embedded a few seconds after the last edit.
const timers = new Map<string, NodeJS.Timeout>();
let queue = Promise.resolve();

export function scheduleEmbedding(id: string, delayMs = 4000) {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      queue = queue.then(() => embedNote(id)).catch((err) => console.error("Embedding failed:", err));
    }, delayMs),
  );
}

async function embedNote(id: string) {
  const [note] = await db.select({ title: notes.title, text: notes.contentText }).from(notes).where(eq(notes.id, id));
  if (!note) return;
  const vector = await embed(`${note.title}\n${note.text}`);
  if (!vector) return;
  // Only store it if the note wasn't edited while we were computing.
  await db
    .update(notes)
    .set({ embedding: vector })
    .where(and(eq(notes.id, id), eq(notes.title, note.title), eq(notes.contentText, note.text)));
}

/** Embeds every note that's missing one (first run, model newly available, etc.). */
export async function backfillEmbeddings() {
  if (!(await getExtractor())) return;
  const missing = await db.select({ id: notes.id }).from(notes).where(isNull(notes.embedding));
  for (const { id } of missing) scheduleEmbedding(id, 0);
}
