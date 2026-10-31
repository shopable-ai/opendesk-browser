import { AI_SITES } from '../diagnostics/catalog';
import type { DiagnosticSite } from '../diagnostics/types';
import { usageDomainFromHostname } from './domain';
import type { UsageSite, UsageSnapshot } from './types';

type Ranked = DiagnosticSite & { usage?: UsageSite };

function compareUsage(a: UsageSite | undefined, b: UsageSite | undefined, usage: UsageSnapshot): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  if (usage.settings.sort === 'recent') return b.lastVisitedAt - a.lastVisitedAt;
  const week = usage.sites.some(site => site.activeDays7d > 0);
  if (usage.settings.sort === 'visits')
    return (week ? b.visits7d - a.visits7d : b.visits30d - a.visits30d) || b.lastVisitedAt - a.lastVisitedAt;
  return (week ? b.activeDays7d - a.activeDays7d : b.activeDays30d - a.activeDays30d) ||
    (week ? b.sessions7d - a.sessions7d : b.sessions30d - a.sessions30d) || b.lastVisitedAt - a.lastVisitedAt;
}
function fixed(site: DiagnosticSite): boolean {
  return site.pinnedByUser === true || (site.pinnedByUser === undefined && site.priority === 'P0');
}

/** Returns the full list. The UI owns Top 5/10 clipping and fixed-overflow notices.
 * Explicit intent and order are preserved; only automatic rows are usage-sorted.
 */
export function rankUsageSites(favorites: DiagnosticSite[], usage: UsageSnapshot): Ranked[] {
  const stats = new Map(usage.sites.map(site => [site.siteKey, site]));
  const used = new Set<string>();
  const favoriteIds = new Set<string>();
  const pinned: Ranked[] = [], user: Ranked[] = [], automatic: Ranked[] = [], builtin: Ranked[] = [];
  for (const favorite of favorites) {
    const normalized = usageDomainFromHostname(favorite.domain);
    const key = normalized?.siteKey ?? favorite.id;
    if (!fixed(favorite) && (favorite.provenance === 'builtin' || favorite.provenance === 'auto') &&
      usage.settings.ignored.includes(normalized?.domain ?? favorite.domain)) continue;
    // PSL groups usage; explicit favorites retain their exact domain intent.
    if (favoriteIds.has(favorite.id)) continue;
    favoriteIds.add(favorite.id);
    used.add(key);
    const stat = stats.get(key);
    const row: Ranked = { ...favorite, ...(stat ? { usage: stat } : {}) };
    if (fixed(favorite)) pinned.push(row);
    else if (!favorite.provenance || favorite.provenance === 'user') user.push(row);
    else if (favorite.provenance === 'auto' || stat) automatic.push(row);
    else builtin.push(row);
  }
  for (const stat of usage.sites) {
    if (used.has(stat.siteKey) || usage.settings.ignored.includes(stat.domain)) continue;
    const known = AI_SITES.find(site => site.id === stat.siteKey);
    automatic.push({ id: stat.siteKey, domain: stat.domain, name: known?.name ?? stat.domain,
      kind: known ? 'ai' : 'custom', priority: 'P1', provenance: 'auto', pinnedByUser: false, usage: stat });
    used.add(stat.siteKey);
  }
  automatic.sort((a, b) => compareUsage(a.usage, b.usage, usage) || a.domain.localeCompare(b.domain));
  // Factories sit at the tail and only fill visible gaps in a cold/short list.
  // The UI alone applies topLimit; no pinned/user/auto rows are clipped here.
  return [...pinned, ...user, ...automatic, ...builtin];
}
