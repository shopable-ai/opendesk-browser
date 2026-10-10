# GOAL：OpenDesk Browser R21 Mac Native —— 五页签视觉验收、真实 Chrome 修复与主分支收口

仓库：https://github.com/shopable-ai/opendesk-browser

默认中文。**仅在 main 工作、提交和安全集成；不创建新分支或 Worktree、不强推、不 reset --hard、clean 或覆盖其他 Agent 代码、Chrome Profile、端口、dist/ZIP。** 不重复开发 R19/R20 Design System。

## 1. 先核对现场与候选

先阅读：
- AGENTS.md
- docs/framework/testing-guide.md
- docs/architecture/sidebar-design-system-r20.zh-CN.md
- docs/framework/workstreams/sidebar-design-r21-20261010.md
- docs/product/sidebar-ui-spec.zh-CN.md
- scripts/tests/sidebar-r19-layout-visual.mjs
- src/ui/design-system.css、src/ui/tool-shell.css、src/ui/sidebar-tools.js

在实际 Mac 仓库执行 git status --short --branch、git rev-parse HEAD、git fetch origin main、git rev-parse origin/main、git log -8 --oneline；检查正在运行的任务、写入者及文件差异。任何现有修改都保留，安全时才 fast-forward；提交前重新核对对应文件 SHA。不要因另一对话的历史 PASS 就认定当前包成功。

## 2. 构建身份与自动检查

如尚无对应候选成功证据，执行（不抢占其他人的 dist）：
```bash
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/sidebar-r21-design-system.test.mjs tests/environment/sidebar-ui-preview.test.mjs tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/workflow-ui-states.test.mjs tests/environment/task-workbench.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
```
检查 source SHA、Manifest、扩展加载路径、bundle 文件 SHA-256、生产/开发包差异、静态 CSS 确实复制、CSP 和固定 SW 大小预算；绝不提高预算或宽松安全扫描让构建通过。保存日志和原始 SHA。

## 3. 真正的 Mac Chrome MV3 安装验收

先按照已安装的受控 Chrome/CFT 说明建立自己独立的 Profile，不复用现有真实工作浏览器或其他 Agent Profile。明确记录进程 PID、Profile 位置和释放状态。**测试真正以 unpacked extension 加载的 Side Panel，不能只运行 STATIC_MARKUP_CHROME HTML。** 对照 `chrome://extensions` 的 ID、版本、扩展路径、运行中的 Side Panel 资源 URL 与生产构建候选身份。统一手工测试页：
```bash
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```
访问 http://127.0.0.1:43111/demo-form.html。确保 43111 未被其他任务占用；无法独占则使用受控替代端口并记录。

依次测试「我的」「发现」「工作流」「开发」「工具」完整滚动页面，分别使用 300/360/420/520 × 700px，125% 和 200% 缩放，正常/空/错误/加载/禁用/展开/长文字/运行状态。截取含完整可滚动内容和底栏的真实原生截图；导出 computed style 的圆角、间距、控件尺寸、字体层级、滚动宽度、可见区域、键盘焦点、AA 对比度，记录每项实际可复现的差异。

重点动作：
- 我的：真实已安装任务、参数保留、运行结果、历史、跨标签 Stop 归属；不得用脚本伪造可信点击。
- 发现：筛选三态、长名称、无结果、搜索、导入目录；核对 8px/12px 圆角。
- 工作流：对话初态、模型设置、消息记录、步骤、审批提示、运行结果与历史；任何数据发送/授权都必须有真实用户确认，不能虚构模型返回。
- 开发：当前网页摘要、直接脚本/本地项目、下拉刷新、JSON、高级折叠、草稿 Run/Save/Stop、网页 USER_SCRIPT；切换不自动读取、执行或授予权限。
- 工具：阅读目录和网页笔记真实安装/更新/打开/卸载、网站开关、新 Tab、键盘 tooltip、iframe 沙箱隔离、未授权只读预览。
- 独立任务目录和工具页面：相同 token 与组件规范。Native Agent Workspace/Settings 先审计差异，不覆盖其他 Agent 工作。

使用真实 Chrome 功能事件、权限确认、目标绑定和 RunHost 回执判定功能；静态 DOM 注入不能冒充原生证明。错误、未测试、权限未获得或依赖不可用时保留事实，不改成 PASS。

## 4. 修复、证据与交付

保存工作记录到 `docs/framework/workstreams/sidebar-design-r21-20261010.md` 的本地续接节及独立 evidence 目录，不改写历史 R19/R20 收据。每个问题保存截图/计算样式/复现步骤/修复差异/最小回归，再视受影响合同执行完整 build/verify/Chrome。只修改归属文件，不重构 Worker/Controller/RunHost/Native Agent，不引入 Tailwind CDN。

最终逐页交付：
1. 源码与加载包 SHA、Mac Chrome 版本/扩展 ID/实际路径、CI URL；
2. 五页签以及两个独立页各自 PASS/FAIL/NOT_TESTED；
3. 300/360/420/520、125%/200%、键盘/AA/滚动和底栏逐场景截图及 metrics；
4. Task/Workflow/Tools/项目/页面脚本回归与失败实录；
5. 六维专家评分的明细和原始证据；没有足够真实证据不宣布 ≥95；
6. 代码修改文件、main commit SHA、未测风险、Profile/端口释放状态。

不要停止在报告或计划。遇到可复现缺陷直接在允许的 main 工作区修复并重新验证；若受资源/权限限制，明确列出阻塞与实际完成项。
