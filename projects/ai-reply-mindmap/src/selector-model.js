// Shared by the sandbox form and the USER_SCRIPT. Rules are data only.
(() => {
  const sites = Object.freeze({
    'https://chatgpt.com': Object.freeze({name:'ChatGPT',
      root:'[data-content-search-unit-key$=":assistant"]',
      body:'[data-markdown-text-style="assistant-message"]', actions:'.turn-action-controls'}),
    'https://gemini.google.com': Object.freeze({name:'Gemini',
      root:'model-response', body:'message-content .markdown', actions:'message-actions'}),
    'https://chat.deepseek.com': Object.freeze({name:'DeepSeek',builtInOnly:true})
  });
  const fields = Object.freeze(['root','body','actions']);
  function siteFor(href) {
    try {
      const url = new URL(href);
      if (!Object.hasOwn(sites,url.origin) || url.username || url.password) return null;
      if (url.origin === 'https://gemini.google.com' && !/^\/app(?:\/[a-z0-9_-]+)?\/?$/i.test(url.pathname)) return null;
      if (url.origin === 'https://chat.deepseek.com' &&
          !/^\/a\/chat\/s\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/i.test(url.pathname)) return null;
      return url.origin;
    } catch { return null; }
  }
  function rule(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== fields.length || fields.some(field => !Object.hasOwn(value,field)))
      throw Error('请填写回复容器、正文和操作栏三个选择器。');
    return Object.fromEntries(fields.map(field => {
      const s = typeof value[field] === 'string' ? value[field].trim() : '';
      const simple = /^(?:[\p{L}\p{N}\p{M}_#. >-]|\[[\w-]+(?:[~|^$*]?=(?:"[^"\\\[\]]*"|'[^'\\\[\]]*'|[\w-]+))?\])+$/u;
      if (!s || s.length > 220 || /\p{Cc}/u.test(s) || !simple.test(s))
        throw Error('请使用标签、类名、ID、属性或层级选择器，例如 .markdown 或 [data-testid="reply"]。');
      return [field,s];
    }));
  }
  const model = Object.freeze({sites,fields,siteFor,rule});
  Object.defineProperty(globalThis,'OpenDeskMindmapSelectors',{value:model,configurable:true});
})();
