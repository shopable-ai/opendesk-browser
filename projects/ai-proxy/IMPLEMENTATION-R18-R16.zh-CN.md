# AI Proxy · R18/R16 正式业务整合记录

> 本记录只说明源码实现与开发门禁；不是最终本地 Codex / Chromium 安装、发布或唯一包晋升验收。

## 原始目标与已实现的基线

唯一视觉/交互参照 `preview/preview.html`，同一正式 Tool ID、同一 React App、同一 `environment.ts → service.ts` 业务链和配置存储。历史 0.3.9 已具有 Side Panel + PC 两个展示面、四种模式、PC 七个栏目、代理创建/编辑/保存/选择/应用/停止、ETag 条件提交、草稿、busy、unknown、撤权以及跨界面配置读回；不重新开发这些功能。

## R18 / R16：预览操作到真实业务的映射

| 交互 | 真实源码/Service | 当前状态 |
| --- | --- | --- |
| R18 四模式及待应用 | `QuickPanel.tsx` → `SELECT` → `GET_STATE` | DONE（源码接线），选择不自动应用 |
| R18 我的代理及运行中选另一条 | `QuickPanel.tsx` → `SELECT` / `APPLY` / `STOP` | DONE（源码接线）；运行中 A 选 B 仅存待应用，A 保持“已应用”，明确应用并经原 Host 审阅后才切换 |
| R18 运行状态 | `Status.tsx` + `QuickPanel.tsx` → `GET_STATE` | DONE（既有状态机）；失败、unknown、冲突不伪报已运行 |
| R18 添加、保存和当前网站规则 | `QuickPanel.tsx` / `Settings.tsx` → `SAVE_ENDPOINT`、`SAVE_RULE` | DONE（既有真实 Service） |
| R18 顶部 Action Slot | `App.jsx` → 公共 `toolNavigation.setNavigation` | DONE（源码接线）；导航白名单来自用户已保存偏好，公共 Header 仍是唯一渲染 owner |
| R18 自定义快捷操作 | `Settings.tsx` → `SET_HEADER_ACTIONS` → `service.ts` → `ai-proxy.full-config.v2` | DONE（源码接线）：显示、隐藏、上移、下移、恢复默认与 ETag 持久化，隐藏全部也可在 PC 通用设置恢复 |
| R18 删除底部冗余入口 | `QuickPanel.tsx` | DONE，原诊断/订阅功能保留在 PC 及可配置页头 |
| R18 当前站点操作 | `QuickPanel.tsx` → 原 `currentSite` / `SAVE_RULE` | DONE（源码接线），刷新网站和添加/编辑规则作为可见操作 |
| R16 profiles | `Settings.tsx` → `SAVE_ENDPOINT`、`SELECT`、`APPLY`、`STOP` | DONE（既有），保存/应用明确分离 |
| R16 rules | `Settings.tsx` → `SAVE_RULE`、`DELETE_RULE`、`SET_DEFAULT` | DONE（既有） |
| R16 subscriptions | `SourcesPage.tsx` → 原 Service | PARTIAL：本地来源/本地代理记录可以保存；联网抓取与同步未接入，不宣称成功 |
| R16 backup（导入备份） | `Settings.tsx` → `IMPORT` / `EXPORT` | DONE（既有），无密码安全备份，导入确认 |
| R16 diagnostic | `DiagnosticsPage.tsx` → 原 Service | BLOCKED：未接真实网络 HTTP 探测，不把离线模拟当实测 |
| R16 general | `Settings.tsx` → 语言 Provider、`SET_HEADER_ACTIONS` | DONE（源码接线），偏好经同一存储回读 |
| R16 official | `OfficialServicePage.tsx` → 未配置服务状态 | BLOCKED：无真实认证、计费、订单或官方连接 |
| 关闭/重开与双 PC 并发 | `environment.ts` / `service.ts` 原有存储与 `ifMatch` | DONE（既有 + 新快捷操作冲突用例），未知结果不自动重放 |

预览里的自动假切换、线路时延、HTTP 407 模拟、收藏图标和自动启动开关并非真实已批准能力，不从模拟 UI 直接搬运第二套业务状态。用户可配置快捷操作只支持四个已确认导航动作，不能配置任意 URL、JS 或权限动作。已有 PAC 编辑功能保留，但不能借偏好操作放开任意 PAC 或认证。

## 文件和最小验证门禁

补齐本项目显式 `app.ci.json`：选择现有 React App CI 编译，并使用已存在的 `scripts/trusted-dialog-browser.mjs` 做内存预览 Chromium 测试；App CI 会按目录自动收集所有 `tests/*.test.mjs`。这不是最终本机安装或真实 Chrome 代理网络验收；若 CI 失败，必须保留原日志，不伪造通过。

新增 `src/domain/header-actions.ts` 的强类型动作白名单，`ConfigState.headerActions` 保持可选（旧 0.3.9 配置无迁移）；`SET_HEADER_ACTIONS` 的条件保存必须沿用 Service 的 ETag，绝不调用受管 Chrome 代理 `APPLY/STOP`。新增 `tests/header-actions.test.mjs` 及 `tests/service.test.mjs` 的保存顺序、隐藏、旧 ETag 冲突、拒绝未知动作与无代理副作用断言。

当前 GitHub 连接可读取并创建源码提交，但本机 CodexPro `open_current_workspace` 返回 `UNAVAILABLE`。**本轮改动尚未在本地 Node/Vite 或 Chromium 安装运行，不得把以前 0.3.9 的通过结论沿用到当前源码。** 后续应在不触碰日常 Profile/并行 watcher 的前提下执行 `npm --prefix projects/ai-proxy test`、`npm --prefix projects/ai-proxy run build`，并单独验证两 Surface 的真实快捷操作同步、状态、撤权、ETag 与外观。正式 `ai-proxy.opendesk-tool.json` 本轮保持原样，不构造新工具包。

**开发完成状态**：新代码及测试用例已纳入源码范围；实际运行验证阻断，完成状态须保持 `IMPLEMENTATION_PARTIAL`，不能进入最终 Codex 验收宣称。

## 2026-11-09 开发 CI 实际回执（以源码提交绑定）

- [App CI Run 42630510057](https://github.com/shopable-ai/opendesk-browser/actions/runs/42630510057)；验证源码提交 `0e6c9f139ccde98816bdda9e693941857e0c5ad0`。
- `npm --prefix projects/ai-proxy run build` 对应 Vite 编译阶段成功，CI 生成 **候选** `artifacts/app-ci/ai-proxy/candidate.opendesk-tool.json`（仅 CI 临时产物），版本 0.3.9，SHA-256 `ec73cabccc47a345504cff20e193333029096fb06366b7b0a47b125e136f4d43`，状态 `BUILT_NOT_TESTED_NOT_RELEASED`；不是已发布安装包。
- 项目自动收集的全部 Node 回归与四个共享基础用例合计 **302 通过、1 失败**；检查失败项唯一指向 `tests/environment/sidebar-tool-enable-r26.test.mjs` 的 Reading TOC 市场身份断言（`Missing expected rejection.`），**不是本轮 AI Proxy 测试失败**。App CI 整体仍为 FAIL，严禁改写为全绿。
- App CI 合同自身的独立测试另有 `tests/environment/app-ci.test.mjs` 的普通 App 夹具测试失败，源于其复用共享基础测试；不在本 AI Proxy 文件归属内，未改动公共测试来掩盖。
- 因共享 Node 门禁失败，声明的内存 Chromium `scripts/trusted-dialog-browser.mjs` 未进入执行，故本轮 Chromium 开发 UI 仍为 NOT_TESTED；最终本地 Codex 与真实安装验收同样未进行。
- 结论：**`IMPLEMENTATION_PARTIAL`**。本轮已提交业务源码和回归代码，最小 Vite 编译成功；剩余门禁为共享 CI 阻断解除后的完整 App CI、R18/R16 点击/布局同源复验，以及既定的 SDK 能力边界。
