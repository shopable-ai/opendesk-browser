// This observer reads the existing owners. It never registers a host, sends an
// operation or disposes a resource. SDK MAIN/relay realms are observed separately.
export function snapshotToolResources(snapshot, shell) {
  const owners = {...snapshot, shell};
  const missing = message => ({scope: 'extension-tool-document', counts: null, owners, observationMissing: message});
  if (!Array.isArray(snapshot?.controllers) || !Array.isArray(snapshot?.contexts))
    return missing('Current controller/context owners are unavailable');
  // A host-side port/Worker flag cannot measure all resources inside a live
  // opaque child realm. A boundary baseline is complete only after its release.
  if (snapshot.controllers.length) return missing('Live controller child realm has not released its resources');
  const fields = {client: ['pending', 'timers', 'subscriptions', 'ports'],
    blobs: ['blobs'], host: ['subscriptions'], editor: ['pending', 'timers', 'subscriptions'], shell: ['subscriptions']};
  for (const [owner, keys] of Object.entries(fields))
    if (!keys.every(key => Number.isSafeInteger(owners[owner]?.[key]) && owners[owner][key] >= 0))
      return missing(`Missing or invalid ${owner} resource counters`);
  if (!snapshot.contexts.every(context => ['pending', 'timers', 'subscriptions'].every(key =>
    Number.isSafeInteger(context?.[key]) && context[key] >= 0))) return missing('Missing or invalid context resource counters');
  const counts = {pending: snapshot.client.pending + snapshot.editor.pending,
    timers: snapshot.client.timers + snapshot.editor.timers,
    subscriptions: snapshot.client.subscriptions + snapshot.host.subscriptions + snapshot.editor.subscriptions + shell.subscriptions,
    ports: snapshot.client.ports, workers: 0, blobs: snapshot.blobs.blobs};
  for (const context of snapshot.contexts)
    for (const key of ['pending', 'timers', 'subscriptions']) counts[key] += context[key];
  return {scope: 'extension-tool-document', counts, owners, observationMissing: null};
}
