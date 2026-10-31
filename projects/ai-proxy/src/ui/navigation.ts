import { OPTIONS_SECTIONS, parseSubscriptionRoute } from './optionsRoute';

type Guard = (route: string) => boolean;
type Listener = (route: string) => void;

function validRoute(route: unknown): route is string {
  if (typeof route !== 'string') return false;
  if (route.length > 128 || /[^#\/a-zA-Z0-9_-]/.test(route)) return false;
  if (route === '' || OPTIONS_SECTIONS.some(section => route === '#/' + section)) return true;
  if (parseSubscriptionRoute(route).kind !== 'invalid') return true;
  return /^#\/(?:profiles\/(?:add|pac|rotation)|diagnostic\/(?:overview|ai|top|speed|proxy))$/.test(route);
}

/** One app instance owns its routes; no document URL, history or global events. */
export function createNavigation({ initialRoute = '' }: { initialRoute?: string } = {}) {
  let route = validRoute(initialRoute) ? initialRoute : '';
  let guard: Guard | null = null;
  let destroyed = false;
  const listeners = new Set<Listener>();
  return {
    getRoute: () => route,
    subscribe(fn: Listener) {
      if (destroyed) return () => {};
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    setGuard(fn: Guard | null) { if (!destroyed) guard = fn; },
    navigate(next: string, { force = false, replace = false }: { force?: boolean; replace?: boolean } = {}) {
      // Validate before guards/listeners can see an untrusted or secret-bearing URL.
      if (destroyed || !validRoute(next)) return false;
      if (next === route) return true;
      if (!force && guard && !guard(next)) return false;
      // There is no history stack; replace has the same internal state semantics.
      void replace;
      route = next;
      for (const listener of [...listeners]) {
        if (listeners.has(listener)) listener(route);
      }
      return true;
    },
    destroy() { destroyed = true; guard = null; listeners.clear(); route = ''; }
  };
}
