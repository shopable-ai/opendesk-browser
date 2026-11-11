import {createWebflowMediaVault} from './media-vault.js';

// Trusted Options document only. The selector never runs inside WebFlow's sandbox
// or an arbitrary website; there is deliberately no asset-byte message API.
export function initWebflowMediaVaultSettingsUI({api = globalThis.chrome, document: doc = globalThis.document} = {}) {
  const fileInput = doc?.getElementById('webflow-media-file');
  const status = doc?.getElementById('webflow-media-status');
  const list = doc?.getElementById('webflow-media-list');
  const refreshButton = doc?.getElementById('webflow-media-refresh');
  if (!fileInput || !status || !list || !refreshButton) return null;

  let vault;
  try {vault = createWebflowMediaVault({extensionId: api.runtime.id, origin: doc.location.origin});}
  catch (error) {status.textContent = `素材仓库不可用：${error.code || error.message}`; fileInput.disabled = true; refreshButton.disabled = true; return null;}
  let busy = false;
  const say = (value, error = false) => {status.textContent = value; status.dataset.state = error ? 'error' : 'ready';};
  const perform = async action => {
    if (busy) return;
    busy = true; fileInput.disabled = refreshButton.disabled = true;
    try {await action();}
    catch (error) {say(`${error.code || 'E_MEDIA_FAILED'}：${error.message || '操作失败'}${error.assetId ? '；待核查 ID '+error.assetId : ''}`, true);}
    finally {busy = false; fileInput.disabled = refreshButton.disabled = false;}
  };
  const present = async () => {
    const assets = await vault.list();
    list.replaceChildren();
    for (const asset of assets) {
      const li = doc.createElement('li');
      const info = doc.createElement('div');
      info.style.overflowWrap = 'anywhere';
      info.textContent = `${asset.name} · ${asset.size} 字节 · ${asset.mime} · ${asset.state}；到期 ${new Date(asset.expiresAt).toLocaleString()}`;
      const detail = doc.createElement('small');
      detail.style.overflowWrap = 'anywhere';
      detail.textContent = `assetId: ${asset.assetId}；SHA-256: ${asset.sha256}`;
      li.append(info, detail);
      const verify = doc.createElement('button');
      verify.type = 'button'; verify.className = 'secondary'; verify.textContent = '核对原始字节';
      verify.addEventListener('click', event => {
        if (!event.isTrusted) return;
        void perform(async () => {
          const result = await vault.read(asset.assetId);
          say(`已读回 ${result.metadata.name}（${result.bytes.length} 字节），SHA-256 与保存记录一致。`);
        });
      });
      const remove = doc.createElement('button');
      remove.type = 'button'; remove.className = 'secondary'; remove.textContent = '删除素材';
      remove.addEventListener('click', event => {
        if (!event.isTrusted || doc.defaultView?.confirm?.(`删除 ${asset.name}？`) !== true) return;
        void perform(async () => {await vault.remove(asset.assetId); await present(); say('已删除所选素材。');});
      });
      li.append(' ', verify, ' ', remove); list.append(li);
    }
    if (!assets.length) list.append(doc.createTextNode('暂无保存的图片素材。'));
  };
  fileInput.addEventListener('change', event => {
    if (!event.isTrusted || busy) return;
    const file = fileInput.files?.[0]; fileInput.value = '';
    if (!file) return;
    void perform(async () => {
      const result = await vault.save(file);
      await present();
      say(`素材保存并独立读回验证成功。assetId: ${result.assetId}；SHA-256: ${result.sha256}`);
    });
  });
  refreshButton.addEventListener('click', event => {
    if (!event.isTrusted) return;
    void perform(async () => {const removed = await vault.cleanup();await present();say(`已刷新素材目录${removed ? '，清理过期素材 '+removed+' 条' : ''}。`);});
  });
  void perform(async () => {await vault.cleanup();await present();say('仅当前扩展 Profile 可查看；assetId 不代表使用授权。');});
  return Object.freeze({refresh: () => perform(present)});
}
