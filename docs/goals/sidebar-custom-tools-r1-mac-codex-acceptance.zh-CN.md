# GOAL：OpenDesk Browser 自定义 Sidebar Tool R1 —— Mac Chrome 真实验收与必要修复（Codex 本地接管）

你是 Chrome MV3 / Side Panel、沙箱与 CSP、JS/DOM、React/Vue/Tailwind 编译、RunHost、Browser Agent、安全测试和 Git main 主集成负责人。直接操作本机真实仓库，不重复市场调研。

仓库：shopable-ai/opendesk-browser
本机：/Users/shopme/Documents/workspace/opendesk-browser
目标文档：docs/product/sidebar-custom-tools-r1.zh-CN.md
参考现有基线：docs/product/program-development-dual-format-and-sidebar.zh-CN.md
默认中文。

## 严格约束

1. 仅使用已经存在的 main；不新建分支，不创建多余 Worktree；保留本机一切未提交修改，先核对远端提交、git status，再决定安全拉取。不得强制重置、清理他人修改。
2. 持续运行直至能完成的项目全部验证并作必要修复；不要仅提交新提示词。每次修改同步修改测试、产品文档和验证证据；可安全提交时提交至 main。
3. 保留 Sidebar 原有「我的任务／发现／开发」三页签、Run/Stop、当前网页精确目标、任务候选/安装/结果和原有 SDK；不要重建独立执行器或直接向沙箱开放 chrome。
4. 当前 UI Tool R1 是独立 opendesk.sidebar-tool.v1，不是 Task v1，不可越权绕过已有验证/安装链。React/Vue/Tailwind 可先由本地可信项目构建成 IIFE+CSS；不要声称未测试的原生组件源码已能直接导入。
5. UI 在独立 sidebar-tools/sandbox.html 执行；计算沙箱仍保持原有效 CSP。严禁把用户 HTML/JS 放入有扩展权限的 Side Panel 主文档。
6. 用户信任的点击由宿主完成，不能把 iframe postMessage 模拟成 chrome.permissions.request 的用户激活。

## 执行步骤

A. 查看最新 main 提交/工作区状态，核对这些文件：manifest.json、scripts/build-contract.mjs、scripts/build.mjs、scripts/verify-package.mjs、scripts/check-source.mjs、wxt.config.mjs、src/entrypoints/bridge.js、src/sidebar-tools/bridge.js、src/sidebar-tools/sandbox.html、src/ui/sidebar-tools/package.js、src/ui/sidebar-tools.js、src/ui/tool.html、src/ui/tool-shell.js、src/ui/tool-shell.css、src/ui/task-workbench.js、scripts/build-sidebar-tool.mjs、examples/sidebar-tools/quick-notes、tests/environment/sidebar-tools.test.mjs。对发现的漂移先修复最小缺口。

B. 运行 npm ci --ignore-scripts；npm run check；npm run build；npm run build:dev；npm run verify；npm test；按失败具体定位修复（不要删除既有测试/放宽发行白名单）。运行 npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes；验证产出 JSON 的 HTML/CSS/JS、本地图片 data URI、能力声明和离线资源不依赖 CDN。对恶意路径、过大资源、未经声明能力、非法导入和重复安装添加必要回归。

C. 在真实 Mac Chrome 138+ 中通过 chrome://extensions 开发者模式加载 dist/production，打开普通 https 网页及 Sidebar，优先使用 examples/tasks/demo-form.html 的既有本机 HTTP 服务作为页面 fixture。保留原三页签。打开「我的任务 → 我的工具」，导入 quick-notes JSON，核对不会自动执行，确认安装后点击工具标签才运行。读取标题/URL，保存中文笔记，关闭/重开及浏览器重启后恢复。卸载后按提示确认数据确实清除，反复测试 20 次。检查 narrow sidepanel，320/400/600 CSS px，200% 缩放、键盘顺序、角色/焦点、空状态、崩溃错误和错误回执。

D. 严格安全反测：沙箱内直接调用 chrome.tabs/chrome.runtime/chrome.storage 必须不可用；postMessage 冒充 instance/toolId、非当前 frame、重放旧 iframe 消息都不得成功；工具 A 的存储不得读取工具 B；未声明 capability 请求拒绝；外部远程脚本、CSS @import/URL、未经支持 import() / chunk 不执行；现有计算 sandbox 的 style/img 严格 Meta CSP 不因 UI 扩权而失效。利用实际 DevTools Console、Network/Security 面板观察。
 
E. 兼容性回归：已有单文件草稿运行/保存、Controller 与 USER_SCRIPT、Task v1 正式验证/运行/停止与持久结果、关闭/重开、目标文档 stale、撤权失败关闭、Native Agent 若本机已配置则不被改坏。不要将沙箱可视化效果视为这些引擎的验证结果。

F. 扩展框架试验：分别选小型 React+Tailwind、Vue+CSS 项目，本地可信地编译单一经典 JS + 静态 CSS，使用 tool.config.json 打包导入，验证状态更新、卸载、对话框、离线重开。若构建配置或包大小未成熟，明确记录 NOT_SUPPORTED / PARTIAL，不要为达成分数盲目关闭 CSP 或发布未经验证的模板。

G. 提交和输出：列明最终 main SHA、changed files、build/package hash、node 测试 pass/fail、真实 Chrome 版本、每项操作的截图/日志/验收表、保留问题及复测方式；明确区分 CI_PASS、NATIVE_PASS、NOT_VERIFIED。不生成虚假测试结果。评分独立目标：功能≥95、安全≥95、视觉≥95、生命周期≥95、开发体验≥95，关键安全缺陷为阻塞项。若环境能力不允许测试，明确 NATIVE_NOT_VERIFIED 并附人工可复现步骤。

最终目标：可信主分支上的真实可安装自定义 Sidebar 工具，而非独立假预览页或新的浏览器扩展外壳。
