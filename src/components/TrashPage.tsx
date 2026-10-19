import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import { api, keys, TRASH_DAYS } from "../api";
import { daysUntilPurge, formatLongDate } from "../dates";
import { extensions } from "../editor/extensions";

export function TrashEmpty() {
  return <div className="empty-state">Select a deleted note to restore it.</div>;
}

export function TrashNotePage() {
  const { noteId } = useParams({ from: "/trash/$noteId" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: note, error } = useQuery({ queryKey: keys.note(noteId), queryFn: () => api.getNote(noteId) });
  const editor = useEditor(
    { extensions, editable: false, content: note?.contentHtml ?? "", editorProps: { attributes: { class: "note-body" } } },
    [note?.contentHtml],
  );

  if (error) return <div className="empty-state">This note was permanently deleted.</div>;
  if (!note) return null;

  const refresh = async () => {
    queryClient.removeQueries({ queryKey: keys.note(noteId) });
    await queryClient.invalidateQueries({ queryKey: keys.lists });
  };

  const restore = async () => {
    await api.restoreNote(noteId);
    await refresh();
    void navigate({ to: "/notes/$noteId", params: { noteId } });
  };

  const deleteForever = async () => {
    if (!confirm("Permanently delete this note? This can't be undone.")) return;
    await api.deleteForever(noteId);
    await refresh();
    void navigate({ to: "/trash" });
  };

  const days = note.deletedAt ? daysUntilPurge(note.deletedAt, TRASH_DAYS) : TRASH_DAYS;

  return (
    <article className="note">
      <header className="note-toolbar trash-banner">
        <span>
          Deleted {note.deletedAt && formatLongDate(note.deletedAt)} · permanently deleted in {days} day{days === 1 ? "" : "s"}
        </span>
        <span className="toolbar-actions">
          <button className="text-button" onClick={() => void restore()}>
            Restore
          </button>
          <button className="text-button danger" onClick={() => void deleteForever()}>
            Delete Now
          </button>
        </span>
      </header>
      <div className="note-scroll">
        <div className="note-title readonly">{note.title || "Untitled"}</div>
        <EditorContent editor={editor} />
      </div>
    </article>
  );
}
