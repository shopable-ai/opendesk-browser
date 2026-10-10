// Register during the initial synchronous SW evaluation. The existing broker
// owns reconciliation; events observed while storage opens await that broker.
export function registerDownloadEvents(api, brokerReady) {
  const forward=method=>event=>{
    brokerReady.then(broker=>broker.downloads[method](event)).catch(error=>
      console.error(`[download event ${error?.code||'E_EFFECT_UNKNOWN'}] ${error?.message??String(error)}`));
  };
  const created=forward('handleCreated'),changed=forward('handleChanged');
  api.downloads.onCreated.addListener(created);
  api.downloads.onChanged.addListener(changed);
  return ()=>{
    api.downloads.onCreated.removeListener(created);
    api.downloads.onChanged.removeListener(changed);
  };
}
