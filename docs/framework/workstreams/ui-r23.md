# R23 · UI Design System / 渐进架构收敛执行记录

- 日期：2026-10-11
- 读取的远端 main 基线：`d56c84273f7fcab8b837269ef5472fafd1fd19e5`
- 环境：GitHub Connector 远端仓库（非用户 Mac 本地工作树），无 macOS Chrome/Native Host；容器网络无法 Git checkout，也无现成 WXT dist。
- 归属：`src/ui/design-tokens.css`、`src/ui/design-system.css`、`src/ui/tool.html`、`src/native-agent/settings.html` 与其新 CSS、Workspace Tailwind Tokens 引用、显式静态资源及定向测试。没有触碰共享 Profile、端口、生成 dist、Native 连接状态或旧测试证据。
- 关联架构说明：[browser-ui-r23.zh-CN.md](../../architecture/browser-ui-r23.zh-CN.md)

## 发现与通过条件

| 实际缺口 | 根因位置 | 本次变更 | 必须验证 |
| --- | --- | --- | --- |
| Side Panel 的 Tokens 与页面级 overflow/reset 耦合 | `src/ui/design-system.css` | 提取纯 :root Tokens，保留 Side Panel 页面基样式 | 五页签/独立打开不回退；Tokens 无页面全局选择器 |
| Native Options 独立色值、内嵌样式、窄视口按钮可能拥挤 | `src/native-agent/settings.html` | 引用纯 Tokens 与本地 `settings.css`，可滚动、操作按钮自适应、明显焦点 | 设置授权手势不变；窄视口/200% 可滚动；资源被白名单允许 |
| Workspace 再定义 R20 色值，修改可能漂移 | `src/native-agent/workspace.tailwind.css` | Tailwind CLI 构建期内联同一 Tokens | 产物含变量，不残留 @import，CSS 校验/开发监听通过 |
| 新共享资源未被固定打包链认识 | `scripts/prepare-public.mjs` / `verify-package.mjs` | 显式复制、白名单、CSS 安全扫描与漏资源负例 | production / development build、verify、变异测试 |
| React 是否必要无实际负载证据 | 现有原生 DOM + 严格 IIFE 合同 | 暂不安装新运行时或组件库 | 保持 SW/JS 入口数量、权限/CSP、包体预算不变 |

## 证据与未完成项（提交时记录）

| 层级 | 状态 | 说明 |
| --- | --- | --- |
| GitHub 源码核查 | READ_PASS | 已读取 `AGENTS.md`、package/WXT、三类 UI、静态资产合同、R20/R21/R22 记录与现有测试 |
| 源码编辑 | SOURCE_CHANGED | 仅 R23 范围；提交后必须核对 SHA 和 CI 结果 |
| GitHub Actions 编译/构建与源检查 | NOT_TESTED | 远端提交后需检查新 HEAD 对应 CI，不能复用 R22 packageHash |
| Node 回归、样式编译、生产/开发包验收 | NOT_TESTED | 该环境没有仓库 checkout/node_modules/dist；先由 CI 或本机 Codex 执行 |
| Mac Chrome 实际五页签、真实 200% 缩放 | NOT_TESTED | 需独立 Profile 和候选扩展身份 |
| Native Options 权限与 Workspace 实际保存读回 | NOT_TESTED | 需真实 Chrome 可信点击、Host 与本机授权目录 |
| 95+ 专项验收评分 | NOT_SCORED | 未取得对应层级的实测，不能宣称六项达标 |

## 最小验证命令（运行在可安全使用的本机 main 工作树）

```bash
git status --short --branch
git fetch origin main
git pull --ff-only origin main     # 仅在本机未提交修改/并行任务允许时
npm ci
node --test tests/environment/ui-r23-design-boundaries.test.mjs tests/environment/sidebar-r21-design-system.test.mjs
npm run check
npm run build
npm run build:dev
node --test tests/environment/workspace-style.test.mjs tests/environment/package.test.mjs
npm run verify
```

再用 **新的、独立 Chrome 测试 Profile** 加载 `dist/production`，记录 Git SHA / 扩展 ID / 插件路径。分别打开五个 Tab、独立工具页、`native-agent/settings.html`、`native-agent/workspace.html`，进行 320/360/400/480/600px、浏览器 100% 与真实 200% 缩放下的滚动、长字串、键盘焦点、空/错/加载/禁用检查，并在受控目录进行保存读回及撤权/冲突保护。真实业务和 Native PASS 必须保存本轮候选的证据；遇到旧候选结果，只引用历史记录，不升格。

提交前后记录生产包两类 CSS 实测字节数、服务工作线程 JS、完整包大小；未测的指标不填写收益结论。
