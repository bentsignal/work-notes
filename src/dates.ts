const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function daysAgo(iso: string) {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY);
}

/** "October 19, 2026 at 2:51 PM" */
export function formatLongDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}

/** Sidebar date: a time today, a weekday this week, otherwise a short date. */
export function formatShortDate(iso: string) {
  const d = new Date(iso);
  const ago = daysAgo(iso);
  if (ago === 0) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (ago === 1) return "Yesterday";
  if (ago < 7) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" });
}

/** Apple Notes-style section headings. */
export function groupLabel(iso: string) {
  const ago = daysAgo(iso);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  if (ago < 7) return "Previous 7 Days";
  if (ago < 30) return "Previous 30 Days";
  const d = new Date(iso);
  if (d.getFullYear() === new Date().getFullYear()) return d.toLocaleDateString(undefined, { month: "long" });
  return String(d.getFullYear());
}

export function daysUntilPurge(deletedAt: string, trashDays: number) {
  return Math.max(0, trashDays - Math.floor((Date.now() - new Date(deletedAt).getTime()) / DAY));
}
