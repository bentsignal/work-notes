export type NoteSummary = {
  id: string;
  title: string;
  snippet: string;
  updatedAt: string;
  deletedAt: string | null;
  /** Present on search results: whether it matched the words or only the meaning. */
  match?: "text" | "meaning";
};

export type Note = {
  id: string;
  title: string;
  contentHtml: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type NoteInput = { title?: string; contentHtml?: string; contentText?: string };

export const TRASH_DAYS = 30;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed (${res.status})`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const json = (method: string, body: unknown, keepalive = false): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  keepalive,
});

export const api = {
  listNotes: (q?: string) => request<NoteSummary[]>(q ? `/notes?q=${encodeURIComponent(q)}` : "/notes"),
  listTrash: () => request<NoteSummary[]>("/trash"),
  getNote: (id: string) => request<Note>(`/notes/${id}`),
  // keepalive lets a save finish even if the tab is closing.
  createNote: (input: NoteInput, keepalive?: boolean) => request<Note>("/notes", json("POST", input, keepalive)),
  updateNote: (id: string, input: NoteInput, keepalive?: boolean) =>
    request<{ id: string; updatedAt: string }>(`/notes/${id}`, json("PATCH", input, keepalive)),
  deleteNote: (id: string) => request<void>(`/notes/${id}`, { method: "DELETE" }),
  restoreNote: (id: string) => request<void>(`/notes/${id}/restore`, { method: "POST" }),
  deleteForever: (id: string) => request<void>(`/notes/${id}/permanent`, { method: "DELETE" }),
  emptyTrash: () => request<void>("/trash", { method: "DELETE" }),
  uploadImage: (file: File) =>
    request<{ url: string }>("/images", { method: "POST", headers: { "Content-Type": file.type }, body: file }),
};

export const keys = {
  lists: ["notes"] as const,
  list: (q: string) => ["notes", "list", q] as const,
  trash: ["notes", "trash"] as const,
  note: (id: string) => ["note", id] as const,
};

/** Sidebar label: the title, else the first line of the content. */
export function displayTitle(note: { title: string; snippet?: string }) {
  return note.title.trim() || note.snippet?.split("\n").find((l) => l.trim())?.trim() || "New Note";
}
