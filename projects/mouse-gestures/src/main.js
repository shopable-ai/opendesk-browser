(() => {
  const root = globalThis.OpenDeskTool?.root;
  const status = root?.querySelector('#mg-runtime');
  if (!status) throw new Error('E_MOUSE_GESTURES_TOOL_CONTEXT');
  status.textContent = '页面手势由已审阅的 Page Module 负责；打开此面板不表示目标网页已授权或已运行。';
})();
