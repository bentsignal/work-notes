import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { api, keys, type NoteSummary } from "./api";
import { newDraftId } from "./drafts";

/** Moves a note to Recently Deleted. If it's the open note, opens the next one in the list. */
export function useDeleteNote() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { noteId: activeId } = useParams({ strict: false });
  const { q } = useSearch({ strict: false });

  return async (id: string) => {
    const listKey = keys.list(q ?? "");
    const list = queryClient.getQueryData<NoteSummary[]>(listKey) ?? [];
    if (id === activeId) {
      const i = list.findIndex((n) => n.id === id);
      const next = list[i + 1] ?? list[i - 1];
      await navigate({
        to: "/notes/$noteId",
        params: { noteId: next && next.id !== id ? next.id : newDraftId() },
        search: { q },
      });
    }
    queryClient.setQueryData<NoteSummary[]>(listKey, (prev) => prev?.filter((n) => n.id !== id));
    await api.deleteNote(id);
    queryClient.removeQueries({ queryKey: keys.note(id) });
    await queryClient.invalidateQueries({ queryKey: keys.lists });
  };
}
