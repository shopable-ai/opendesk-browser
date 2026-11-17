// Controller drafts keep one finite execution budget, frozen at the Run click.
// Installed Tasks and individual SDK operations retain their own reviewed limits.
export const CONTROLLER_DRAFT_DEFAULT_DEADLINE_MS = 30000;
export const CONTROLLER_DRAFT_MAX_DEADLINE_MS = 24 * 60 * 60 * 1000;
