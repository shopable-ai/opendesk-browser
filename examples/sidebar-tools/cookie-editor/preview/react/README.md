# Cookie Editor R4.9 · React 独立交互候选

仅预览，**不提供 Chrome Cookie API / OpenDesk SDK /真实授权**。原型数据全部虚构、仅在页面内存中存在。`src/App.jsx` 是唯一 UI 行为源码；`src/style.css` 按 R27 的尺寸和语义 token 映射，未引入共享宿主 CSS。此目录不修改 Cookie Editor 正式 `src/` 或安装包，用户确认后再决定是否迁移。

Node ≥22.12：`npm install --ignore-scripts --no-audit --no-fund && npm run build`。输出为同目录 `index.html`，可通过 `file://` 打开；所有 JS 和 CSS 以 data: URI 嵌入，无 CDN / 外网请求。真实 React 19.2.0 + React DOM 由 Vite 7.3.6 编译打包。`npm run check` 比对生成结果字节，避免预览漂移。

⚠ 预览实验台独立于真实工具 UI；其中的模拟授权/失败选项不可迁入正式产品。默认导出 JSON 元数据不含 Value，显式含值会要求额外模拟许可及操作确认；真实产品仍通过既有可信 Host、SDK 与身份合同执行。此演示导出只处理虚构数据。所有修改后必须做 Chromium 浏览器回归，不得将虚构场景的操作结果当作真实 Chrome Cookie 验收。
