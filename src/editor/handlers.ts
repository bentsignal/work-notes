import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { api } from "../api";

function imageFiles(list: FileList | undefined | null) {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

async function insertImages(view: EditorView, files: File[], pos?: number) {
  for (const file of files) {
    try {
      const { url } = await api.uploadImage(file);
      const node = view.state.schema.nodes.image.create({ src: url });
      const tr = pos === undefined ? view.state.tr.replaceSelectionWith(node) : view.state.tr.insert(pos, node);
      view.dispatch(tr);
    } catch (err) {
      alert(`Couldn't save the image: ${(err as Error).message}`);
    }
  }
}

/** Pasted screenshots/images are uploaded to the server instead of being inlined. */
export function handlePaste(view: EditorView, event: ClipboardEvent) {
  const files = imageFiles(event.clipboardData?.files);
  if (!files.length) return false;
  event.preventDefault();
  void insertImages(view, files);
  return true;
}

export function handleDrop(view: EditorView, event: DragEvent) {
  const files = imageFiles(event.dataTransfer?.files);
  if (!files.length) return false;
  event.preventDefault();
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
  void insertImages(view, files, pos);
  return true;
}

/** Links don't open on a plain click (so you can edit them); Ctrl/Cmd+click opens in a new tab. */
export function handleClick(_view: EditorView, _pos: number, event: MouseEvent) {
  const link = (event.target as HTMLElement).closest("a");
  if (link?.href && (event.ctrlKey || event.metaKey)) {
    window.open(link.href, "_blank", "noopener");
    return true;
  }
  return false;
}

/** Ctrl/Cmd+K: add, change, or remove the link on the selection. */
export function promptForLink(editor: Editor) {
  const current = editor.getAttributes("link").href as string | undefined;
  const href = window.prompt("Link URL (leave empty to remove)", current ?? "https://");
  if (href === null) return;
  const chain = editor.chain().focus().extendMarkRange("link");
  if (!href.trim() || href.trim() === "https://") chain.unsetLink().run();
  else chain.setLink({ href: href.trim() }).run();
}
