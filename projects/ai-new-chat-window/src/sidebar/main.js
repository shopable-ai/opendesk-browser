(() => {
  const tool = globalThis.OpenDeskTool;
  const bundled = __OPENDESK_TOOL_MESSAGES__;
  function render() {
    const catalog = tool.messages ?? bundled;
    const {sourceLocale, messages} = catalog;
    const locale = tool.locale ?? sourceLocale;
    tool.root.querySelector('.new-chat-guide').lang = locale;
    for (const node of tool.root.querySelectorAll('[data-message]')) {
      const key = node.dataset.message;
      node.textContent = messages[locale]?.[key] ?? messages[sourceLocale][key];
    }
  }
  render();
  tool.onLocaleChange?.(render);
})();
