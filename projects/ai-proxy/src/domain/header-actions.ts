/** The shared Header owns presentation; this list only selects trusted navigation IDs. */
export const HEADER_ACTION_IDS = ['add-proxy','diagnostics','subscriptions','settings'] as const;
export type HeaderActionId = typeof HEADER_ACTION_IDS[number];
export const DEFAULT_HEADER_ACTIONS: HeaderActionId[] = [...HEADER_ACTION_IDS];
export function validateHeaderActions(value: unknown): HeaderActionId[] {
  if (!Array.isArray(value) || value.length > HEADER_ACTION_IDS.length)
    throw new Error('快捷操作应为长度受限的列表');
  const actions: HeaderActionId[] = [];
  for (const id of value) {
    if (typeof id !== 'string' || !HEADER_ACTION_IDS.some(known => known === id) ||
        actions.includes(id as HeaderActionId))
      throw new Error('快捷操作包含未知或重复的导航动作');
    actions.push(id as HeaderActionId);
  }
  return actions;
}
