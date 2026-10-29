// Local DOM lifetime only. No OpenDesk authority, resource loader or SDK shim.
export function createLocalOwner(window) {
  let live = true, closing;
  const cleanup = new Set(), disposers = new Set();
  function track(remove) {
    let removed = false;
    const release = () => {
      if (removed) return;
      removed = true; cleanup.delete(release); remove();
    };
    if (live) cleanup.add(release);
    else release();
    return release;
  }
  const owner = {
    active: () => live,
    on(target, type, handler, options) {
      const guarded = event => { if (live) return handler(event); };
      if (live) target.addEventListener(type, guarded, options);
      return track(() => target.removeEventListener(type, guarded, options));
    },
    observe(target, handler, options) {
      const observer = new window.MutationObserver(records => {
        if (live) handler(records);
      });
      if (live) observer.observe(target, options);
      return track(() => observer.disconnect());
    },
    setInterval(handler, delay) {
      if (!live) return null;
      const id = window.setInterval(() => { if (live) handler(); }, delay);
      track(() => window.clearInterval(id));
      return id;
    },
    setTimeout(handler, delay) {
      if (!live) return null;
      const id = window.setTimeout(() => { release(); if (live) handler(); }, delay);
      const release = track(() => window.clearTimeout(id));
      return id;
    },
    onDispose(handler) {
      if (!live) throw new Error('E_MINDMAP_DESTROYED');
      disposers.add(handler);
      return () => disposers.delete(handler);
    },
    destroy() {
      if (closing) return closing;
      live = false;
      for (const remove of [...cleanup]) remove();
      // Set closing before invoking callbacks, including reentrant cleanup.
      closing = Promise.resolve().then(async () => {
        const results = await Promise.allSettled([...disposers].map(fn => Promise.resolve().then(fn)));
        disposers.clear();
        const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
        if (errors.length) throw new AggregateError(errors, 'E_MINDMAP_CLEANUP');
      });
      return closing;
    }
  };
  return Object.freeze(owner);
}
