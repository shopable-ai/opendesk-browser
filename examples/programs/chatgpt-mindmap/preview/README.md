# ChatGPT 思维导图：真正完整的 XMind HTML 预览

**四份原始 XMind JS 已直接提交到本目录 `preview/`，与 `index.html` 同级。** 不是在 CI 里临时生成，不是隐藏目录，不需要 `npm pack`、旧仓库、远端 CDN 或绝对资源路径。

```text
examples/programs/chatgpt-mindmap/preview/
├── index.html                   原始 XMind 技术实验台（保留）
├── chatgpt.html                ChatGPT 用户视角模拟页面
├── chatgpt.css                 模拟站点外观
├── chatgpt.js                  模拟壳主题/复制/评价（不含 Renderer）
├── design.md                   产品功能与交互设计候选
├── jszip.min.js                 97,630 B
├── polyfill-45b9836beb.min.js  104,563 B
├── xmind-sdk.bundle.js         401,113 B
├── snowbrush-2c2b5d62b5.js    3,439,267 B
├── app.js
├── preview.css
├── serve.mjs
├── verify-assets.mjs
└── README.md
```

真实四件套合计 **4,042,573 B**。以 `../tests/xmind-provenance.json` 为唯一字节身份清单；JSZip 精确复用历史 Git Blob，另三份复用 Browser 仓库已有 Git Blob，**文件字节未修改**。HTML 中四个 `<script defer>` 顺序固定、直接使用 `./<文件名>.js`。

## 一条命令预览（仓库根目录）

```bash
node examples/programs/chatgpt-mindmap/preview/serve.mjs
```

启动前校验四份**同目录真实文件**的字节数、SHA-256、Git Blob、顺序，任意缺失或篡改都会失败关闭且不绑定端口。成功打印 `PREVIEW_ASSETS_READY 4` 和 `REAL_XMIND_LOCAL_PREVIEW http://127.0.0.1:<port>/index.html?autostart=1`，桌面环境尝试自动打开默认浏览器；也支持 `--no-open` 仅打印 URL。在预览中会使用真实产品按钮自动打开 A 回复的真实 XMind 画布，B/C 独立操作。

另可执行：

```bash
node examples/programs/chatgpt-mindmap/preview/verify-assets.mjs
git ls-files examples/programs/chatgpt-mindmap/preview
```

`index.html` 需要本地 HTTP 服务，因为业务 ESM 模块采用同源 `/src/` 路由；**不能把 `file://` 双击当成完整产品执行入口**。

## 用户视角 ChatGPT 模拟预览（优先审核）

默认启动将直接打开 ChatGPT 模拟页面，同时打印 REAL_XMIND_CHATGPT_PREVIEW http://127.0.0.1:<port>/chatgpt.html 供手动进入；三条 AI 回复的思维导图按钮由正式 createAnswerRegistry 自动插入，点击后使用真正的原始 XMind，不是静态图片或第二个 Renderer。

- chatgpt.html：模拟聊天、原生操作栏、用户气泡、深浅主题和 320px 响应式；绝不手写思维导图触发按钮。
- chatgpt.css / chatgpt.js：仅模拟网站壳、主题切换和原生复制/评价，不承担导图业务。
- 开发诊断、大型导图、内容更新和 Stop 功能放在页面底部折叠的实验台，**不属于正式程序 UI**。
- design.md：保存本程序的功能、视觉、交互和安全验收要求；**状态 PENDING_USER_CONFIRMATION**，须用户实际核对后才批准为 UI 基准。
- index.html：原始真实 XMind 技术验收页面，完全保留。

模拟站点仅在本地 loopback 预览服务器运行，不连接真实 ChatGPT、不发送消息、没有安装能力。预览与正式 Chrome 安装的证据不能互换。

## 真正的产品代码与交互

预览只复用 `src/{answer-registry,chatgpt-adapter,extract,view,xmind-adapter,xmind-convert}.js` 和 `assets/ui.css`，无第二套 Renderer、无 Mock、无 SVG 替代画法。真实 `_SB_.createWorkbookEditor()` 负责 XMind 导图。检查 A/B/C、97 个真实主题、缩放、折叠、鼠标拖动、滚轮、全屏/原文、更新回复、操作栏重建、320px、Stop。

Linux Chromium 需有中文字体（CI 安装 Noto CJK）；200% CDP 页面视口模拟与 Chrome 菜单原生缩放不同，后者未单独验收。截图只能标 `VISUAL_EVIDENCE_ONLY`，不能冒充在聊天里实时运行原引擎。

## 边界：预览源码存在，不等于生产安装获准

这些第三方引擎字节已在公开仓库**预览目录**可见，但 Snowbrush 合并包及 GSAP 3.5.1 等第三方许可与 NOTICE/SBOM 仍需审查；不能据此认定正式产品分发许可已获批准。正式 Program manifest 仅声明 `assets/ui.css`，不包含以上四份 JS；保持 `installable:false`。Snowbrush 全局 `style#snowbrush_style` 样式残留仍为 `BLOCKED_GLOBAL_STYLE_RESIDUE`，不得向 ChatGPT MAIN 注入原引擎或借 CDN 绕过。

旧版 `preview/.runtime/` 已废弃，不再由任何新预览脚本创建；本地旧副本中的残留可在确认无需保留后自行清理。专项 CI 必须对**被 Git 跟踪的同级文件**运行正反向验证和真实 Chromium 绘图，而不是从快照重新生成副本。

## R3.3 交互基准与截图验收

- 首选打开启动输出的 `REAL_XMIND_CHATGPT_PREVIEW`（`/chatgpt.html`）。初次打开应在三条 AI 回复的原生操作栏旁自动出现程序自身注入的 3 个「思维导图」按钮，不会自动展开导图；`?autostart=1` 用于单独验证 A 的自动展开。
- 本地模拟页删去占据对话顶部的预览说明卡，保留顶部「本地模拟 · 非官方网站」提示；复制、评价采用无外部依赖的线框图标。模拟操作栏在 DOM 重建后继续支持复制/评价，本地输入区明确不发送消息。
- 多条回复的真实 XMind 独立状态、原文无损恢复、全屏/Escape、A/B 缩放与折叠、C 表格/代码/引用、主题切换及 320px 整屏布局由现有产品源码与 `tests/framework/chatgpt-mindmap-chatgpt-probe.mjs` 联合验证。新版深浅切换必须等当前真实 Workbook 完成皮肤重载，并保持相邻回答不受影响。
- 启动 `node examples/programs/chatgpt-mindmap/preview/serve.mjs --no-open` 后检查上述页面；原 `preview/index.html` 仍是保留的真实 XMind 技术实验台，不可删除、覆盖、转成 Mock。
- GitHub Actions 的 `ChatGPT Mind Map original JS direct preview and browser proof` 任务在真实 Chromium 中输出 `chatgpt-before.png`、`chatgpt-answer-A-light.png`、`chatgpt-answer-B-light.png`、`chatgpt-answer-B-dark.png`、`chatgpt-answer-C-structured.png`、`chatgpt-original-restored.png`、`chatgpt-fullscreen.png`、`chatgpt-narrow-320.png`、`chatgpt-mobile-320.png`、兼容截图 `chatgpt-xmind.png`、`chatgpt-result.json`，作为 Actions artifact 保存 7 天。必须实际检查运行是否成功和截图是否可读，不能只凭文件名宣称通过。
- 唯一 UI 设计合同 `preview/design.md` 的状态始终为 **PENDING_USER_CONFIRMATION**；用户逐屏确认前不设定专家 95+ 完成分，也不把模拟页面的结果冒充实际登录 ChatGPT、原生安装、许可证和 Snowbrush 全局样式隔离已经通过。
### 截图复查后的 R3.3 可读性补充

320px 不再强行缩到看清所有节点的微型全图：正式 XMind 适配器将狭窄画布的最小缩放设置为 100%，使用真实引擎的拖动、滚轮浏览其它分支。全屏必须等待真实 SDK 适配完成才截图；截图新增 `chatgpt-answer-B-narrow-320.png` 和中心主题可读性几何检查。中心主题采用满足正常文字对比度目标的 `#1D75C1` + 白字，修改的是正式转换 Skin，不是四份引擎 JS。
