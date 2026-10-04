export function createScrapingModule({contracts}) {
  const unavailable = () => { const error = new Error('采集模块尚未接入'); error.code = 'MODULE_NOT_INSTALLED'; throw error; };
  return {
    mountToolPanel(root) {
      root.textContent = '采集模块尚未接入。当前仅提供基础工程和目标健康检查。';
      root.dataset.moduleStatus = 'MODULE_NOT_INSTALLED';
    },
    compileTemplate: unavailable, preview: unavailable, createRunner: unavailable, formatExport: unavailable,
    contractHandshake() { return {contractVersion: contracts.contractVersion, contractHash: contracts.contractHash,
      status: 'MODULE_NOT_INSTALLED', capabilities: []}; },
    dispose() {}
  };
}
