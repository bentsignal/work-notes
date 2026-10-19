import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useMatchRoute, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api, displayTitle, keys, TRASH_DAYS, type NoteSummary } from "../api";
import { daysUntilPurge, formatShortDate, groupLabel } from "../dates";
import { isDraftId, newDraftId } from "../drafts";
import { useDeleteNote } from "../hooks";
import { BackIcon, ComposeIcon, SearchIcon, TrashIcon } from "./icons";

export function Sidebar() {
  const matchRoute = useMatchRoute();
  const inTrash = !!matchRoute({ to: "/trash", fuzzy: true });
  return <aside className="sidebar">{inTrash ? <TrashList /> : <NotesList />}</aside>;
}

function NotesList() {
  const navigate = useNavigate();
  const { q } = useSearch({ from: "__root__" });
  const { noteId: activeId } = useParams({ strict: false });
  const [query, setQuery] = useState(q ?? "");
  const deleteNote = useDeleteNote();

  // Keep the search in the URL (debounced) so it survives reloads and works as a link.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim() || undefined;
      if (next !== q) void navigate({ to: ".", search: (prev) => ({ ...prev, q: next }), replace: true });
    }, 200);
    return () => clearTimeout(timer);
  }, [query, q, navigate]);

  const notes = useQuery({
    queryKey: keys.list(q ?? ""),
    queryFn: () => api.listNotes(q),
    placeholderData: keepPreviousData,
  });
  const trash = useQuery({ queryKey: keys.trash, queryFn: api.listTrash });

  const items = notes.data ?? [];
  const showDraft = activeId && isDraftId(activeId) && !q;

  return (
    <>
      <div className="sidebar-header">
        <h1>Notes</h1>
        <Link
          to="/notes/$noteId"
          params={{ noteId: newDraftId() }}
          search={{ q, focus: "title" }}
          className="icon-button"
          title="New note (Alt+N)"
        >
          <ComposeIcon />
        </Link>
      </div>
      <label className="search">
        <SearchIcon />
        <input
          type="search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
        />
      </label>

      <nav className="note-list">
        {showDraft && (
          <div className="note-item active">
            <div className="note-item-title">New Note</div>
            <div className="note-item-meta">No additional text</div>
          </div>
        )}
        {q ? (
          <>
            <div className="group-label">{items.length ? `${items.length} found` : "No matches"}</div>
            {items.map((n) => (
              <NoteItem key={n.id} note={n} active={n.id === activeId} q={q} onDelete={deleteNote} />
            ))}
          </>
        ) : (
          groupByDate(items).map(([label, group]) => (
            <section key={label}>
              <div className="group-label">{label}</div>
              {group.map((n) => (
                <NoteItem key={n.id} note={n} active={n.id === activeId} q={q} onDelete={deleteNote} />
              ))}
            </section>
          ))
        )}
        {!q && notes.isSuccess && !items.length && !showDraft && <div className="list-empty">No notes yet</div>}
      </nav>

      <Link to="/trash" className="sidebar-footer">
        <TrashIcon />
        Recently Deleted
        {!!trash.data?.length && <span className="count">{trash.data.length}</span>}
      </Link>
    </>
  );
}

function NoteItem({
  note,
  active,
  q,
  onDelete,
}: {
  note: NoteSummary;
  active: boolean;
  q?: string;
  onDelete: (id: string) => Promise<void>;
}) {
  const preview = note.title.trim() ? firstLine(note.snippet) : secondLine(note.snippet);
  return (
    <Link to="/notes/$noteId" params={{ noteId: note.id }} search={{ q }} className={`note-item${active ? " active" : ""}`}>
      <div className="note-item-title">{displayTitle(note)}</div>
      <div className="note-item-meta">
        <span className="note-item-date">{formatShortDate(note.updatedAt)}</span>
        <span className="note-item-snippet">{preview || "No additional text"}</span>
      </div>
      {note.match === "meaning" && <span className="match-badge" title="Matched by meaning, not exact words">≈</span>}
      <button
        className="icon-button note-item-delete"
        title="Delete"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void onDelete(note.id);
        }}
      >
        <TrashIcon />
      </button>
    </Link>
  );
}

function TrashList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { noteId: activeId } = useParams({ strict: false });
  const trash = useQuery({ queryKey: keys.trash, queryFn: api.listTrash });
  const empty = useMutation({
    mutationFn: api.emptyTrash,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.lists });
      void navigate({ to: "/trash" });
    },
  });
  const items = trash.data ?? [];

  return (
    <>
      <div className="sidebar-header">
        <Link to="/" className="back-link">
          <BackIcon />
          Notes
        </Link>
        {!!items.length && (
          <button
            className="text-button danger"
            onClick={() => confirm(`Permanently delete ${items.length} note(s)? This can't be undone.`) && empty.mutate()}
          >
            Empty
          </button>
        )}
      </div>
      <h1 className="trash-title">Recently Deleted</h1>
      <p className="trash-hint">Notes are permanently deleted after {TRASH_DAYS} days.</p>
      <nav className="note-list">
        {items.map((n) => (
          <Link
            key={n.id}
            to="/trash/$noteId"
            params={{ noteId: n.id }}
            className={`note-item${n.id === activeId ? " active" : ""}`}
          >
            <div className="note-item-title">{displayTitle(n)}</div>
            <div className="note-item-meta">
              <span className="note-item-date">{daysUntilPurge(n.deletedAt!, TRASH_DAYS)} days left</span>
              <span className="note-item-snippet">{firstLine(n.snippet)}</span>
            </div>
          </Link>
        ))}
        {trash.isSuccess && !items.length && <div className="list-empty">Nothing here</div>}
      </nav>
    </>
  );
}

function groupByDate(notes: NoteSummary[]) {
  const groups = new Map<string, NoteSummary[]>();
  for (const n of notes) {
    const label = groupLabel(n.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), n]);
  }
  return [...groups];
}

const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
const firstLine = (s: string) => lines(s)[0] ?? "";
// When there's no title the first line is already shown as the title.
const secondLine = (s: string) => lines(s)[1] ?? "";
