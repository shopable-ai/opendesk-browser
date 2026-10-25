// Classic Sandbox JS for the existing OpenDeskTool iframe, not the trusted Host.
(() => {
  'use strict';
  const root = globalThis.OpenDeskTool?.root;
  if (typeof root?.querySelector !== 'function')
    throw new Error('E_TOOL_CONTEXT: OpenDeskTool.root is unavailable');
  const button = root.querySelector('#preview-action');
  const feedback = root.querySelector('#preview-feedback');
  if (!button || !feedback)
    throw new Error('E_TOOL_UI: expected preview controls are missing');
  let clicks = 0;
  button.addEventListener('click', () => {
    clicks += 1;
    feedback.textContent = 'JS 版本 A · 已点击 ' + clicks + ' 次';
  });
})();
