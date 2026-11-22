const KEY = 'next-receipts.v1';
const MARKER = 'opendesk.video-auto-skip.next';
const MAX_AGE = 60_000;
const MAX_PENDING = 16;
const uuid = /^[a-f0-9-]{36}$/;
const prune = (value, now) => Array.isArray(value) ? value.filter(row => row &&
  typeof row.id === 'string' && uuid.test(row.id) && typeof row.from === 'string' &&
  row.until > now && row.until <= now + MAX_AGE) : [];
const targetMatches = (row, context) => row.seriesKey === context.seriesKey &&
  row.episodeKey === context.episodeKey && row.line === context.line;

// Chrome does not carry Navigation.navigate's state through these document loads.
// Its activation instead identifies the previous entry in this browsing context.
// A marker on that entry correlates the actual transition with a private intent.
// Neither record includes a page or media URL.
export function createNextReceipt({storage, navigation, arrivalType, now = Date.now, id = () => crypto.randomUUID()}) {
  const activation = navigation?.activation;
  const predecessor = arrivalType === 'navigate' && activation?.navigationType === 'push' &&
    activation.entry?.id === navigation?.currentEntry?.id ? activation.from : null;
  const incoming = predecessor?.getState?.()?.[MARKER];
  function sourceEntry() {
    const entry = navigation?.currentEntry;
    if (!entry?.id || typeof navigation.navigate !== 'function' || typeof navigation.updateCurrentEntry !== 'function') return null;
    const state = entry.getState?.();
    if (state != null && Object.getPrototypeOf(state) !== Object.prototype) return null;
    return {entry, state};
  }
  let arrival;
  return {
    async prepare(target) {
      const source = sourceEntry();
      if (!source) return null;
      const current = await storage.get({key: KEY, withEtag: true});
      const stamp = now();
      const rows = prune(current.value, stamp);
      if (rows.length >= MAX_PENDING) return null;
      const token = id();
      const {seriesKey, episodeKey, line} = target;
      const value = [...rows, {id: token, from: source.entry.id, until: stamp + MAX_AGE, seriesKey, episodeKey, line}];
      const reply = await storage.set({key: KEY, value, ifMatch: current.etag});
      return reply?.saved === true ? {id: token, from: source.entry.id} : null;
    },
    dispatch(href, token) {
      const source = sourceEntry();
      if (!source || source.entry.id !== token.from) return false;
      navigation.updateCurrentEntry({state: {...source.state, [MARKER]: token.id}});
      const invalidate = () => {
        const current = sourceEntry();
        if (current?.entry.id === token.from && current.state?.[MARKER] === token.id) {
          const {[MARKER]: _, ...state} = current.state;
          try { navigation.updateCurrentEntry({state}); } catch { /* The source may already be gone. */ }
        }
        void (async () => {
          const {value, etag} = await storage.get({key: KEY, withEtag: true});
          const rows = prune(value, now());
          if (rows.some(row => row.id === token.id && row.from === token.from)) {
            await storage.set({key: KEY, ifMatch: etag, value: rows.filter(row => row.id !== token.id || row.from !== token.from)});
          }
        })().catch(() => {});
      };
      let change;
      try { change = navigation.navigate(href, {history: 'push'}); }
      catch (error) { invalidate(); throw error; }
      // The old document cannot certify a cross-document arrival.
      void change?.committed?.catch(invalidate);
      void change?.finished?.catch(() => {});
      return true;
    },
    async arrive(context, isCurrent) {
      if (typeof incoming !== 'string' || !uuid.test(incoming)) return false;
      const current = await storage.get({key: KEY, withEtag: true});
      const rows = prune(current.value, now());
      const match = rows.find(row => row.id === incoming && row.from === predecessor.id && targetMatches(row, context));
      if (!match || !isCurrent()) return false;
      const reply = await storage.set({key: KEY, ifMatch: current.etag, value: rows.filter(row => row.id !== incoming)});
      if (reply?.saved !== true || !isCurrent()) return false;
      arrival ??= {kind: 'next', state: 'arrived'};
      return true;
    },
    snapshot: () => arrival && {...arrival},
    confirmPlaying() {
      if (arrival?.state === 'arrived') arrival = {kind: 'next', state: 'playing'};
    },
    clear() { arrival = undefined; },
  };
}
