import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, keys, type Note } from "../api";
import { draftAliases, isDraftId, newDraftId } from "../drafts";
import { extensions } from "../editor/extensions";
import { handleClick, handleDrop, handlePaste, promptForLink } from "../editor/handlers";
import { useDeleteNote } from "../hooks";
import { formatLongDate } from "../dates";
import { TrashIcon } from "./icons";

export function NotePage() {
  const { noteId } = useParams({ from: "/notes/$noteId" });
  // A draft that just got saved keeps its original key so the editor stays mounted.
  const key = draftAliases.get(noteId) ?? noteId;
  return <NoteLoader key={key} noteId={noteId} />;
}

function NoteLoader({ noteId }: { noteId: string }) {
  const { title, focus } = useSearch({ from: "/notes/$noteId" });
  const [initialId] = useState(noteId);
  const draft = isDraftId(initialId);
  const { data, error } = useQuery({
    queryKey: keys.note(initialId),
    queryFn: () => api.getNote(initialId),
    enabled: !draft,
    // The editor owns the content once it's open; don't overwrite it with refetches.
    refetchOnWindowFocus: false,
  });

  if (draft) {
    const blank: Note = { id: "", title: title ?? "", contentHtml: "", createdAt: "", updatedAt: "", deletedAt: null };
    return <NoteEditor initial={blank} draftKey={initialId} focus={focus ?? "body"} />;
  }
  if (error) return <div className="empty-state">This note doesn't exist anymore.</div>;
  if (!data) return null;
  if (data.deletedAt) return <div className="empty-state">This note is in Recently Deleted.</div>;
  return <NoteEditor initial={data} focus={focus} />;
}

type SaveStatus = "saved" | "unsaved" | "saving" | "error";

type EditorProps = { initial: Note; draftKey?: string; focus?: "title" | "body" };

function NoteEditor({ initial, draftKey, focus }: EditorProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const deleteNote = useDeleteNote();

  const [title, setTitle] = useState(initial.title);
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt);
  const [status, setStatus] = useState<SaveStatus>("saved");

  const idRef = useRef(initial.id || null);
  const titleRef = useRef(initial.title);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const chainRef = useRef(Promise.resolve());
  const mountedRef = useRef(true);
  const flushRef = useRef<(keepalive?: boolean) => Promise<void>>(async () => {});

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setStatus("unsaved");
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), 500);
  }, []);

  const editor = useEditor({
    extensions,
    content: initial.contentHtml,
    autofocus: focus === "body" ? "end" : false,
    onUpdate: scheduleSave,
    editorProps: {
      attributes: { class: "note-body" },
      handlePaste,
      handleDrop,
      handleClick,
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k" && editorRef.current) {
          event.preventDefault();
          promptForLink(editorRef.current);
          return true;
        }
        return false;
      },
    },
  });
  const editorRef = useRef(editor);
  editorRef.current = editor;

  flushRef.current = async (keepalive = false) => {
    clearTimeout(timerRef.current);
    if (!dirtyRef.current || !editor) return chainRef.current;
    const input = {
      title: titleRef.current,
      contentHtml: editor.getHTML(),
      contentText: editor.getText({ blockSeparator: "\n" }),
    };
    // Don't create a note for a draft you never typed anything into.
    if (!idRef.current && !input.title.trim() && editor.isEmpty) return chainRef.current;
    dirtyRef.current = false;
    if (mountedRef.current) setStatus("saving");

    chainRef.current = chainRef.current.then(async () => {
      try {
        let saved: { id: string; updatedAt: string };
        if (idRef.current) {
          saved = await api.updateNote(idRef.current, input, keepalive);
        } else {
          saved = await api.createNote(input, keepalive);
          idRef.current = saved.id;
          if (draftKey) draftAliases.set(saved.id, draftKey);
          if (mountedRef.current) {
            void navigate({
              to: "/notes/$noteId",
              params: { noteId: saved.id },
              search: (prev) => ({ q: prev.q }),
              replace: true,
            });
          }
        }
        queryClient.setQueryData<Note>(keys.note(saved.id), (prev) => ({
          id: saved.id,
          createdAt: prev?.createdAt ?? saved.updatedAt,
          deletedAt: null,
          title: input.title,
          contentHtml: input.contentHtml,
          updatedAt: saved.updatedAt,
        }));
        void queryClient.invalidateQueries({ queryKey: keys.lists });
        if (mountedRef.current) {
          setUpdatedAt(saved.updatedAt);
          setStatus(dirtyRef.current ? "unsaved" : "saved");
        }
      } catch (err) {
        console.error(err);
        dirtyRef.current = true;
        if (mountedRef.current) setStatus("error");
      }
    });
    return chainRef.current;
  };

  // Save when leaving the note, hiding the tab, or closing it.
  useEffect(() => {
    mountedRef.current = true;
    const onHide = () => void flushRef.current(true);
    const onVisibility = () => document.visibilityState === "hidden" && onHide();
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVisibility);
      void flushRef.current(true);
    };
  }, []);

  // Retry failed saves every few seconds (e.g. server restarting).
  useEffect(() => {
    if (status !== "error") return;
    const timer = setTimeout(() => void flushRef.current(), 3000);
    return () => clearTimeout(timer);
  }, [status]);

  const onTitleChange = (value: string) => {
    setTitle(value);
    titleRef.current = value;
    scheduleSave();
  };

  const onDelete = async () => {
    if (!idRef.current) {
      // Unsaved draft: nothing to delete, just start a fresh one.
      dirtyRef.current = false;
      void navigate({ to: "/notes/$noteId", params: { noteId: newDraftId() }, search: (prev) => ({ q: prev.q }) });
      return;
    }
    await flushRef.current();
    await deleteNote(idRef.current);
  };

  return (
    <article className="note">
      <header className="note-toolbar">
        <span className="note-date">{updatedAt ? formatLongDate(updatedAt) : "New note"}</span>
        <span className={`save-status save-status-${status}`}>
          {status === "saving" ? "Saving…" : status === "unsaved" ? "Edited" : status === "error" ? "Not saved — retrying" : ""}
        </span>
        <button className="icon-button" title="Delete note" onClick={() => void onDelete()}>
          <TrashIcon />
        </button>
      </header>
      <div className="note-scroll" onClick={(e) => e.target === e.currentTarget && editor?.commands.focus("end")}>
        <input
          className="note-title"
          value={title}
          placeholder="Title"
          autoFocus={focus === "title"}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "ArrowDown") {
              e.preventDefault();
              editor?.commands.focus("start");
            }
          }}
        />
        <EditorContent editor={editor} />
      </div>
    </article>
  );
}
