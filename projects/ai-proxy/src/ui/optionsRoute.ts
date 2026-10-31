/**
 * Navigation inside the extension's full-page Options UI.
 *
 * The popup is 380px. Heavyweight pages are extension-owned tabs, not popups
 * or browser side panels. Hash routing works with WXT's static /options.html.
 */
export const OPTIONS_SECTIONS = ['profiles', 'rules', 'subscriptions', 'backup', 'diagnostic', 'general', 'official'] as const;
export type OptionsSection = (typeof OPTIONS_SECTIONS)[number];

export const DIAGNOSTIC_SECTIONS = ['overview', 'ai', 'top', 'speed', 'proxy'] as const;
export type DiagnosticSection = (typeof DIAGNOSTIC_SECTIONS)[number];

export function parseDiagnosticHash(hash: string): DiagnosticSection {
  const segment = /^#\/diagnostic\/([^/?]+)$/.exec(hash)?.[1];
  return DIAGNOSTIC_SECTIONS.find(section => section === segment) ?? 'overview';
}

export function diagnosticHash(section: DiagnosticSection): string {
  return section === 'overview' ? '#/diagnostic' : '#/diagnostic/' + section;
}

/** Copy only complete known routes, excluding queries and unsaved form data. */
export function copyableOptionsHash(hash: string): string {
  const subscriptionRoute = parseSubscriptionRoute(hash);
  if (subscriptionRoute.kind !== 'invalid') return subscriptionRouteHash(subscriptionRoute);
  return /^#\/(?:profiles\/(?:add|pac|rotation)|subscriptions\/(?:local|new)|diagnostic\/(?:overview|ai|top|speed|proxy))$/.test(hash)
    ? hash : optionsHash(parseOptionsHash(hash));
}

export function parseOptionsHash(hash: string): OptionsSection {
  const segment = hash.replace(/^#\/?/, '').split(/[/?]/, 1)[0];
  return OPTIONS_SECTIONS.find(section => section === segment) ?? 'profiles';
}

export type SubscriptionRoute =
  | { kind: 'list' | 'new' | 'local' | 'official' | 'invalid' }
  | { kind: 'source'; id: string };

const SOURCE_ID = /^[a-zA-Z0-9_-]{1,80}$/;

/** Do not reflect untrusted fragments or subscription credentials into navigable URLs. */
export function parseSubscriptionRoute(hash: string): SubscriptionRoute {
  if (hash === '#/subscriptions') return { kind: 'list' };
  if (hash === '#/subscriptions/new') return { kind: 'new' };
  if (hash === '#/subscriptions/local') return { kind: 'local' };
  if (hash === '#/subscriptions/official') return { kind: 'official' };
  const match = /^#\/subscriptions\/source\/([^/?#]+)$/.exec(hash);
  if (match && SOURCE_ID.test(match[1]!)) return { kind: 'source', id: match[1]! };
  return { kind: 'invalid' };
}

export function subscriptionRouteHash(route: SubscriptionRoute): string {
  if (route.kind === 'source') {
    if (!SOURCE_ID.test(route.id)) throw new Error('Invalid subscription source ID');
    return '#/subscriptions/source/' + route.id;
  }
  return route.kind === 'invalid' || route.kind === 'list'
    ? '#/subscriptions' : '#/subscriptions/' + route.kind;
}

export function optionsHash(section: OptionsSection): string {
  return `#/${section}`;
}

/** A caller must supply its own extension URL via chrome.runtime.getURL('options.html'). */
export function optionsUrl(optionsHtmlUrl: string, section: OptionsSection): string {
  return optionsHtmlUrl.split('#', 1)[0] + optionsHash(section);
}
