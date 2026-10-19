import { Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { newDraftId } from "../drafts";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const navigate = useNavigate();

  // Alt+N: new note (Ctrl+N is reserved by the browser).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        void navigate({
          to: "/notes/$noteId",
          params: { noteId: newDraftId() },
          search: (prev) => ({ q: prev.q, focus: "title" }),
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
