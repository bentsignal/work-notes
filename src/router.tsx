import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { AppLayout } from "./components/AppLayout";
import { NotePage } from "./components/NotePage";
import { TrashEmpty, TrashNotePage } from "./components/TrashPage";
import { newDraftId } from "./drafts";

// The router JSON-parses search params, so a title like "2027" arrives as a number.
const str = (v: unknown) =>
  typeof v === "string" ? v || undefined : typeof v === "number" || typeof v === "boolean" ? String(v) : undefined;

const rootRoute = createRootRoute({
  // `q` is the sidebar search, kept in the URL so the Edge search shortcut can link to it.
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({ q: str(search.q) }),
  component: AppLayout,
});

// Opening the app goes straight to a blank note, ready to type.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/notes/$noteId", params: { noteId: newDraftId() }, search: { q: search.q, focus: "body" } });
  },
});

// Target of the Edge "notes" search shortcut: /new?title=Standup
const newRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/new",
  validateSearch: (search: Record<string, unknown>): { title?: string } => ({ title: str(search.title) }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/notes/$noteId",
      params: { noteId: newDraftId() },
      search: { title: search.title, focus: search.title ? "body" : "title" },
      replace: true,
    });
  },
});

const noteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes/$noteId",
  validateSearch: (search: Record<string, unknown>): { title?: string; focus?: "title" | "body" } => ({
    title: str(search.title),
    focus: search.focus === "title" || search.focus === "body" ? search.focus : undefined,
  }),
  component: NotePage,
});

const trashRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trash",
  component: TrashEmpty,
});

const trashNoteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/trash/$noteId",
  component: TrashNotePage,
});

const routeTree = rootRoute.addChildren([indexRoute, newRoute, noteRoute, trashRoute, trashNoteRoute]);

export const router = createRouter({ routeTree, defaultPreload: false });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
