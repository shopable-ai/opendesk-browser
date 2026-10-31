import type { DiagnosticSite, SitePriority } from './types';

export const AI_SITES = [
  { id: 'chatgpt', domain: 'chatgpt.com', name: 'ChatGPT' },
  { id: 'claude', domain: 'claude.ai', name: 'Claude' },
  { id: 'gemini', domain: 'gemini.google.com', name: 'Gemini' },
  { id: 'perplexity', domain: 'perplexity.ai', name: 'Perplexity' },
  { id: 'grok', domain: 'grok.com', name: 'Grok' },
  { id: 'copilot', domain: 'copilot.microsoft.com', name: 'Microsoft Copilot' },
  { id: 'deepseek', domain: 'chat.deepseek.com', name: 'DeepSeek' },
  { id: 'poe', domain: 'poe.com', name: 'Poe' },
  { id: 'huggingface', domain: 'huggingface.co', name: 'Hugging Face' }
] as const;

export type AiSiteId = typeof AI_SITES[number]['id'];
const ids = new Set<string>(AI_SITES.map(s => s.id));
export function isAiSite(id: string): id is AiSiteId { return ids.has(id); }
export function aiSite(id: string): typeof AI_SITES[number] | undefined {
  return AI_SITES.find(s => s.id === id);
}
export function defaultFavorites(): DiagnosticSite[] {
  return AI_SITES.slice(0, 5).map(s => ({ ...s, kind: 'ai', priority: 'P1',
    provenance: 'builtin', pinnedByUser: false }));
}

/** Persist hostname only, never a URL with credentials, port, path or query. */
export function safePublicDomain(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 253 || !/^[A-Za-z0-9.-]+$/.test(raw)) return null;
  const domain = raw.toLowerCase().replace(/\.$/, '');
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(s => s.length < 1 || s.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(s))) return null;
  const tld = labels.at(-1)!;
  if (!/^[a-z]{2,63}$/.test(tld) ||
    ['localhost','local','internal','invalid','test','lan','onion','home','arpa','example'].includes(tld) ||
    domain.endsWith('.home.arpa')) return null;
  // The URL parser validates punycode/IDNA without fetching or retaining a URL.
  try { if (new URL('https://' + domain + '/').hostname !== domain) return null; }
  catch { return null; }
  if (labels.every(s => /^\d+$/.test(s))) return null;
  return domain;
}
/** Exactly the shipped HTTPS origin is network-probeable, not its redirects or custom hosts. */
export function diagnosticUrl(id: string): string | null {
  const site = aiSite(id);
  return site ? 'https://' + site.domain + '/' : null;
}
export function siteForDomain(domain: string, priority: SitePriority, name?: string): DiagnosticSite | null {
  const safe = safePublicDomain(domain);
  if (!safe) return null;
  const known = AI_SITES.find(s => s.domain === safe);
  if (known) return { ...known, priority, kind: 'ai' };
  return { id: 'custom:' + safe, domain: safe,
    name: (name || safe).trim().slice(0, 60) || safe, priority, kind: 'custom' };
}
