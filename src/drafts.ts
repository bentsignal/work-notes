/** A note that hasn't been saved yet. It gets a real id once you type something. */
export const newDraftId = () => `draft-${Math.random().toString(36).slice(2, 10)}`;
export const isDraftId = (id: string) => id.startsWith("draft-");

/**
 * When a draft is saved for the first time the URL switches from /notes/draft-x to /notes/<id>.
 * This maps the real id back to the draft id so the editor isn't remounted (and you keep your cursor).
 */
export const draftAliases = new Map<string, string>();
