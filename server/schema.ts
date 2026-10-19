import { sql } from "drizzle-orm";
import { customType, index, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull().default(""),
    contentHtml: text("content_html").notNull().default(""),
    // Plain-text copy of the content, used for search, snippets, and embeddings.
    contentText: text("content_text").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Set when the note is moved to Recently Deleted; purged after 30 days.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // Normalized sentence embedding of title + content. Null means it needs (re)computing.
    embedding: real("embedding").array(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(content_text, '')), 'B')`,
    ),
  },
  (t) => [
    index("notes_search_idx").using("gin", t.searchVector),
    index("notes_updated_idx").on(t.updatedAt),
  ],
);

export const images = pgTable("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  mime: text("mime").notNull(),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
