# ChatGPT Mind Map — 本地真实 XMind HTML 预览

这是 **HTML 入口 + 原程序共享模块 + 固定本地 XMind 资源**，不是第二套绘图实现，也不是可直接分发的独立单文件 HTML。

浏览器打开 `preview/index.html` 之前，使用下列命令启动仅绑定 `127.0.0.1` 的开发验证服务（不依赖仓库内额外扩展、不下载 CDN）：

```bash
node examples/programs/chatgpt-mindmap/preview/serve.mjs \
  --assets /absolute/path/to/shopable-station/apps/web/public/lib/xmind
```

服务输出 `REAL_XMIND_LOCAL_PREVIEW http://127.0.0.1:<port>/index.html`，在浏览器中打开该地址。若本机有旧项目，直接指向旧项目的原始资源目录，**不用复制四份文件**。服务器启动前按 `tests/xmind-provenance.json` 逐个复核文件名、顺序、大小、SHA-256、Git blob；缺失或变更立即失败，绝不提供假 XMind 画布。

页面从 `src/answer-registry.js` 进入完整产品链（包括 `chatgpt-adapter.js`、`extract.js`、`view.js`、`xmind-adapter.js`、`xmind-convert.js`），ShadowRoot 样式也直接读取 `assets/ui.css`。换句话说，修改产品绘图或内容解析后，预览**自动使用同一份实现**，不需要人工复制 Demo JS。

## 实际操作与验收条件

1. 确认服务在启动前打印成功；打开页面只代表资源字节校验及脚本引入，并**不**代表画布已经实际渲染。
2. 分别点击 A、B、C 的「思维导图」，查看原 XMind Canvas 的主题内容；缩放/折叠 A，B 不应联动。
3. 点击「切换 320px 容器」，用真实浏览器缩放 200% 再验证工具栏、定位、裁切和键盘焦点。
4. 「重建 B 操作栏」不能产生重复按钮；「更新 B 回复正文」只应使 B 的导图过期，刷新后使用 B 的最新内容。
5. 选择「原文」、全屏/Escape、Stop，检查原 DOM 恢复和控制器关闭。Stop 后页面会显示新增全局 `style` 节点数：若残留，说明隔离未闭环，**不可记为清理 PASS**。
6. 报告预览源 SHA、固定资源 SHA、Chromium 版本、截图/视频、运行结果和错误；有失败就修产品 `src/` 而非在预览复制另一份适配逻辑。

## 事实与边界

- 本机开发者的固定资源是验证输入，不是已经获批准分发的产品资源；四个大文件 **未提交** 到当前仓库。
- 前置 `script-src 'self'` 不允许 CDN、远程 JS 或 `unsafe-eval`；`style-src 'unsafe-inline'` 仅出于隔离预览文档中的旧 SDK 内联样式需要，**不能迁移为 ChatGPT CSP 放宽**。
- 此处的独立本地 HTML 文档避免了向 ChatGPT 注入预览脚本，但 **不能**证明 SDK 在已安装 `USER_SCRIPT` 中的样式隔离、撤权/卸载或官方 ChatGPT 页面兼容。
- 原 XMind 绘图内部可以生成 SVG 图形；禁止的是用自研 SVG **替代** 原引擎，不应仅根据 DOM 出现 SVG 就误判仿造。
- 后续通用 HTML UI 预览复用仓库已有 `.agents/skills/opendesk-ui-preview/SKILL.md`；本预览只拥有 XMind 引擎固定资源的专项验证，不新增通用 Skill/权限/安装器。

**准入状态：独立真实引擎预览的源码入口已具备；未提供原始四份文件或未在浏览器运行时，`REAL_SDK_BROWSER` 必须为 `NOT_TESTED`；正式安装与已登录 ChatGPT 均为 `NOT_TESTED/BLOCKED`。**
