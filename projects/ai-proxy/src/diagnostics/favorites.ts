import { AI_SITES, defaultFavorites, siteForDomain } from './catalog';
import type { DiagnosticSite, SitePriority } from './types';

export const MAX_FAVORITES = 30;
/** Diagnostic favorites remain usable when optional usage statistics fail. */
export function prioritizeFavorites(favorites: DiagnosticSite[]): DiagnosticSite[] {
  const group = (site: DiagnosticSite) => site.pinnedByUser === true ||
    (site.pinnedByUser === undefined && site.priority === 'P0') ? 0 :
    !site.provenance || site.provenance === 'user' ? 1 : 2;
  return [...favorites].sort((a, b) => group(a) - group(b));
}

/** Only an exact, unedited factory list is identifiable as cold-start defaults. */
function isLegacyFactoryList(value: unknown[]): boolean {
  return value.length === 5 && value.every((item, index) => {
    const expected = AI_SITES[index]!;
    if (!item || typeof item !== 'object') return false;
    const row = item as Record<string, unknown>;
    return Object.keys(row).sort().join(',') === 'domain,id,kind,name,priority' &&
      row.id === expected.id && row.domain === expected.domain && row.name === expected.name &&
      row.kind === 'ai' && row.priority === 'P0';
  });
}

/** Retain uncertain legacy intent and array order; never demote an edited P0. */
export function migrateFavorites(value: unknown, legacy = true): DiagnosticSite[] {
  if (!Array.isArray(value)) return defaultFavorites();
  if (legacy && isLegacyFactoryList(value)) return defaultFavorites();
  const unique = new Set<string>();
  return value.slice(0, MAX_FAVORITES).flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Partial<DiagnosticSite>;
    if (typeof row.domain !== 'string') return [];
    const priority: SitePriority = row.priority === 'P0' ? 'P0' : 'P1';
    const site = siteForDomain(row.domain, priority,
      typeof row.name === 'string' ? row.name : undefined);
    if (!site || unique.has(site.id)) return [];
    unique.add(site.id);
    const provenance = !legacy && row.provenance === 'builtin' && row.pinnedByUser !== true
      ? 'builtin' : 'user';
    const pinnedByUser = provenance === 'user' && (legacy || typeof row.pinnedByUser !== 'boolean'
      ? priority === 'P0' : row.pinnedByUser);
    return [{ ...site, provenance, pinnedByUser,
      priority: pinnedByUser ? 'P0' : 'P1' }];
  });
}
