# OpenDesk Browser R22 · Native Workspace Tailwind CSS 收敛与验收

日期：2026-10-11。范围：`src/native-agent/workspace.html`、Workspace 样式、静态资源构建/校验以及定向测试。
基线：`main` `ceeb93253ceb0fce9637e71c4cabeb2056b42452`；接续 R20/R21 侧栏设计语言。
本文件记录**远端代码集成**与**实际验收**两种不同状态。Git 提交或测试用例存在均不代表真实 Chrome/Native 通过。

## 实际实施

- `src/native-agent/workspace.html`：保留原有 71 个 DOM ID、四个 `data-view` 按钮与 `aria-pressed` 协议；文件区使用 232px 左栏与伸缩主栏，窄屏纵向排列、目录通过原生 `details` 收起；AI 编辑面板默认收起、移至文件预览之后；辅助工具预览改成展开面板。
- `src/native-agent/workspace.js`：仅补充 `aria-busy` 及长文件名 tooltip；**不改变** Native request、权限、保存冲突策略、页面预览 sandbox 和 ChatGPT 提案流程。
- `src/native-agent/workspace.tailwind.css`：Tailwind v4 本地源码、显式输入集、OpenDesk R20 色值/圆角/间距语义、完整工作区布局、只读/脏/错误状态、响应式与减弱动态效果。
- `scripts/build-workspace-style.mjs`：使用项目安装的 `@tailwindcss/cli`，在 `.wxt` 临时目录编译，验证生成 CSS 后原子重命名到 `.wxt/public/native-agent/workspace.css`；不使用 CDN、浏览器 JIT、`npx` 在线安装。
- `scripts/prepare-public.mjs`：先清空 public，再复制静态文件并编译样式，禁止旧 `src/native-agent/workspace.css` 被当作编译产物继续复制。
- `scripts/wxt-development.mjs`：HTML、Workspace JS 与 Tailwind 源码变更时重新编译并通知 WXT；错误期间阻止发布成功 revision，修正源码后允许重新编译。
- `scripts/verify-package.mjs`：在原有严格 HTML/CSP、固定入口和闭包校验之外增加 Workspace CSS 的危险 `@import`、`url(...)`、残留编译指令与关键选择器检测。
- `package.json` / `package-lock.json`：精确固定 `tailwindcss` 与 `@tailwindcss/cli` `4.3.3`。锁定依赖从已公开的 4.3.3 完整 npm 锁元数据合并；**仍必须在真实 macOS 工作区以 `npm ci` 复验**。
- `tests/environment/workspace-style.test.mjs`、`tests/environment/package.test.mjs`：编译 hash、生产与开发资源、关键类、面板合约、恶意 CSS 与缺失选择器拒绝测试。

### 非目标

没有修改 MV3 Service Worker、WXT JS 固定入口、Native Messaging 协议、授权目录白名单、RunHost、iframe sandbox、已有 Side Panel 五个 Tab，也没有更换现有页面脚本入口 `settings.js`。

## 本地 Mac 重现命令

只在已确认没有其他 Agent 写入相关文件且可安全更新的 `main` 执行：

```bash
git status --short --branch
git rev-parse HEAD
git fetch origin main
git rev-parse origin/main
git pull --ff-only origin main
npm ci
npm run check
npm run build
npm run build:dev
npm test
npm run verify
shasum -a 256 dist/production/native-agent/workspace.css dist/development/native-agent/workspace.css
```

生产与 development 生成 CSS 的 SHA-256 应相同；`dist/production/native-agent/workspace.html` 应引用本地 `workspace.css` 和 `settings.js`；生成 CSS 不含 `@import`、`@source`、`@apply` 或远程 `url()`。不要将 `src/native-agent/workspace.tailwind.css` 当作浏览器实际样式文件。

开发热更新另运行 `npm run dev`，在不影响其他 Agent 的受控环境中编辑 Tailwind 源码后检查 `.wxt/public/native-agent/workspace.css` 和 `dist/development/native-agent/workspace.css` 更新；故意引入编译错误必须阻断新版发布，修正后应恢复。

## 真正的 Chrome / Native 验收

加载当前 `dist/production` 到**独立测试 Chrome Profile**；记录扩展 ID、`chrome://extensions` 中显示的安装绝对路径、Git SHA、manifest、CSS 响应、控制台日志、页面截图。直接访问 `chrome-extension://<已验证的扩展ID>/native-agent/workspace.html`，也可从 Side Panel 的工作区入口进入；不得使用旧版插件或纯源码 HTML 替代。

人工检查顺序：

1. 在 360、390、768、1024、1280、1440、1920px 与浏览器 200% 缩放下核对布局：无水平溢出，文件目录、保存、丢弃、另存为、AI 面板和状态可操作；对照双栏可独立滚动，窄屏改纵向堆叠。
2. 默认页面：连接状态、工作区选择、目标页面选择、工具预览默认折叠、AI 编辑默认折叠、Tab `aria-pressed`、键盘焦点、长中英文路径 tooltip。
3. 文件闭环：选择已授权目录、刷新/返回上层、打开 Markdown/HTML、预览/源码/对照、编辑产生脏状态、显式 Save、重读及独立读回核对；`Save As` 后读回新文件。
4. 权限异常：只读目录仍可编辑本地草稿但 Save/Save As 不可写；撤权、Native 断联、保存失败、未知结果、外部磁盘版本冲突均保留草稿，绝不自动覆盖。
5. AI 闭环：展开 ChatGPT 对话编辑；建立读取请求、回填原对话、处理完整回答、审阅差异、采用草稿、显式保存和复制回执；切换预览模式不能清除草稿。
6. 本机应用：仅校验已有 localhost / 127.0.0.1 iframe 路径与 sandbox/CSP 行为；未运行服务时不得宣称应用预览已通过。
7. Demo 离线模式明确标识仅为内存，不把页面内成功误报为 Native 真实写盘。

建议截图目录：`docs/framework/evidence/native-workspace-r22/<candidate-sha>/`（注意先核查仓库证据路径政策），记录各视口、只读、冲突、AI 审阅以及真实 Native 读写回执。

## 验收证据账本

| 项目 | 状态 | 证据与缺口 |
|---|---|---|
| 源码与静态 DOM 合同核查 | STATIC_PASS | HTML 保留原 71 ID、四个 data-view；没有新增运行时 JS |
| Tailwind 锁文件及构建源变更 | CI_PASS | Actions 38106614811：npm ci、check、生产及开发构建成功 |
| 生成 CSS 安全校验、固定入口、SW 预算 | CI_PASS | Actions 38106614811：verify、包变异测试通过；38106735520 完整 Node 回归通过 |
| 真实 Mac Chrome 七视口与 200% 缩放 | NOT_TESTED | 需绑定候选 Git SHA 的截图和 Console |
| Native 真实磁盘读改写读回 | NOT_TESTED | 需实际授权目录与真实 Native ack |
| AI/只读/冲突/断联回归 | NOT_TESTED | 需独立 Chrome 测试证据 |
| 视觉质量评分（20/20/20/15/10/10/5） | NOT_SCORED | 缺截图、交互及实际观察，**不宣称 ≥95** |

## 评分条件

视觉统一 20、信息架构 20、操作效率 20、响应式/缩放 15、无障碍 10、权限与异常 10、实测证据 5；每项必须记录实际分数和扣分。任何 npm/Package/真实行为阻断 FAIL 不可宣布 95 分通过；如果 Native 环境不可用，必须单列 NOT_TESTED 与验证范围限制。

## 风险提示

- Tailwind v4 CSS 本地编译链与 npm 锁文件本轮尚未在 Mac 执行，`npm ci` 和真实 WXT/Chrome 是 P0 门槛。
- 独立 HTML 预览、内存演示、GitHub 提交或 CI Node 通过，均不等于 Mac Native 全链路验收。
- 并行工作树若有待提交更改，应逐文件核对再 fast-forward；不要 reset/clean，不占用其他 Agent 的 Chrome Profile/端口/构建记录。

## R22 CI 结果补记（2026-10-11）

- 实际源码候选：`d2b30e14c3b16983541bdf8564c2269218fb8e57`；随后 `3e2ad96e1a06b64c32ed5239774999d078d075f6` 仅修正已有 Sidebar 测试对精确 CSS 检查清单的断言。
- [构建预算和资源安全 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38106614811)：**success**；npm ci、npm run check、build、build:dev、verify、资源预算、Package 变异测试已通过。
- 生产包 packageHash：`6adabe824649d6ef5baea9236509ba78a03a35e0e8226ae0ddfa7e876db87dc0`。开发包 packageHash：`0019d35ad8030984c13141daa650420abba9c465ea2d525acbf5f5dd97afc093`。
- 生产生成 `native-agent/workspace.css`：28625 字节，SHA-256 `5eb22c5da6a5adbf5565c4327712368ce479c2edbefb64986eed8141f9366c33`。
- [Sidebar R1 P0 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38106735502)：**success**；保留原 Sidebar 双 CSS 检查并增加 Native Workspace CSS 检查。
- [Native Agent R1 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38106735520)：`bridge-components` 完整 Node 环境测试 **success**。CI 中的原有 macOS Native Agent 握手测试不等同于 R22 Workspace 七视口视觉验收和真实文件写回。
- **仍未验收**：用户 Mac Chrome 独立 Profile 中 Workspace 360–1920px + 200% 缩放、真实 Native 写入读回、只读/磁盘冲突/AI 审阅 E2E、95 分独立视觉评分。必须继续标记 NOT_TESTED / NOT_SCORED。
