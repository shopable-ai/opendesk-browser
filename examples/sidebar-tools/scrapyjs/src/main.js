(() => {
  'use strict';
  const tool = globalThis.OpenDeskTool;
  const root = tool.root;
  const el = id => root.querySelector('#' + id);
  const sdk = globalThis.ScrapyAppSdk.createSdk((operation, payload) => tool.request(operation, payload));
  let draftValid = true, editing = false, shownConfig = '', shownTarget;
  function message(id, text) {el(id).textContent = text; el(id).hidden = !text;}
  function render(state) {
    const busy = state.phase === 'starting' || (Boolean(state.runId) && !state.retired);
    const config = JSON.stringify(state.config, null, 2);
    if (!editing && config !== shownConfig) {el('config-json').value = config; shownConfig = config; el('target-url').value = state.config.url;}
    if (shownTarget !== state.target) {
      shownTarget = state.target; el('target-url').value = state.config.url;
      el('page-title').textContent = state.target?.title || '当前网页不可用';
    }
    el('start').disabled = busy || state.phase === 'unknown' || !state.target || !draftValid;
    el('stop').disabled = !busy || state.retired || state.stopAccepted;
    el('save-config').disabled = state.saving || !draftValid || !state.storageReady || Boolean(state.conflict);
    el('save-config').textContent = state.saving ? '保存中…' : state.dirty || !draftValid ? '保存配置 · 未保存' : '保存配置';
    el('config-json').disabled = state.saving;
    el('target-url').disabled = state.saving;
    el('load-config').disabled = state.saving;
    el('use-saved').disabled = state.saving;
    el('refresh-run').disabled = !state.runId || state.retired;
    el('download-json').disabled = state.result == null;
    el('host-status').textContent = state.host;
    el('engine-status').textContent = state.engine;
    el('stop-status').textContent = state.stopAccepted ? '已受理' : state.stopRequested ? '已请求，等待确认' : '未请求';
    el('retired-status').textContent = state.retired ? '已确认退休' : busy ? '尚未确认' : '尚无运行';
    el('result').textContent = state.snapshot ? JSON.stringify(state.snapshot, null, 2) : '尚无结果';
    message('app-error', state.error); message('app-notice', state.notice);
    el('conflict').hidden = state.storageReady && !state.conflict;
    el('use-saved').hidden = !state.conflict;
    tool.setState?.({dirty: state.dirty || !draftValid, busy: busy || state.saving});
  }
  const app = globalThis.ScrapyAppModel.createApp(sdk, render);
  el('config-json').addEventListener('input', () => {
    editing = true;
    try {
      app.edit(JSON.parse(el('config-json').value)); draftValid = true; message('config-error', '');
    } catch (error) {draftValid = false; app.touch(); message('config-error', error.message);}
    editing = false; shownConfig = JSON.stringify(app.state.config, null, 2); render(app.state);
  });
  el('target-url').addEventListener('change', () => {
    try {app.edit({...JSON.parse(el('config-json').value), url: el('target-url').value}); draftValid = true; message('config-error', '');}
    catch (error) {draftValid = false; app.touch(); message('config-error', error.message);}
    render(app.state);
  });
  el('refresh-target').addEventListener('click', () => app.refreshTarget());
  el('start').addEventListener('click', () => app.start(el('target-url').value));
  el('stop').addEventListener('click', () => app.stop());
  el('save-config').addEventListener('click', () => app.save());
  el('load-config').addEventListener('click', () => app.load());
  el('use-saved').addEventListener('click', () => {
    draftValid = true; shownConfig = ''; message('config-error', ''); app.useSaved();
  });
  el('refresh-run').addEventListener('click', () => app.refresh());
  el('download-json').addEventListener('click', () => app.download());
  const onPageChanged = () => app.refreshTarget();
  root.addEventListener('opendesk-page-changed', onPageChanged);
  // Poll only real host status; this timer never advances the engine or invents results.
  const timer = setInterval(() => app.refresh(), 1000);
  globalThis.addEventListener('pagehide', () => {
    clearInterval(timer); root.removeEventListener('opendesk-page-changed', onPageChanged); app.dispose();
  }, {once: true});
  render(app.state); app.load(); app.refreshTarget();
})();
