# OpenDesk Browser 工具独立运行 R3.2 · 真实能力及交付边界

日期：2026-10-14。所有权：本轮网页实施，唯一集成分支 main。文件范围：`src/stay-focus/{policy,service,tool-host}.js`、`src/entrypoints/stay-focus-controls.js`、`src/ui/sidebar-tools.js` 的少量静态准入接线、三份原有环境测试以及 `.agents/skills/opendesk-sidebar-tool-dev/SKILL.md`。不占用 Mac Chrome、Profile、开发端口或 dist；不改 Manifest、其他工具代码、共享 SDK 或历史记录。最终以目标 SHA 的 Actions 为准。

## 三个真实消费者的能力矩阵

| 工具 | 真实调用链与环境 | Manifest 与用户批准 | 已有源码 / 自动化证据 | 状态及边界 |
| --- | --- | --- | --- | --- |
| Quick Notes | 安装 JSON → Sandbox `OpenDeskTool.request` → Side Panel `storage.get/set`、`currentPage.info`、`tasks.open` | `storage`、当前页面目标；数据按 toolId 隔离，任务打开需已有任务 | `examples/sidebar-tools/quick-notes/src/main.js`；`src/ui/sidebar-tools.js`；`tests/environment/sidebar-tools-host.test.mjs` | 源码 SOURCE_WIRED，已有 Node 用例；关闭重新打开、重装及真实 Profile 数据持久化 NOT_TESTED |
| Reading TOC | 安装 JSON → Sandbox `toc.snapshot/navigate` → 已有 Host / `src/reading-toc/page.js` → ISOLATED Page Relay DOM | 静态 HTTP(S) Content Script、Chrome 站点访问、工具启停和网站/单页排除；特殊页明确拒绝；不提供任意 DOM API | `src/entrypoints/page-relay.js`、`tests/environment/reading-toc-*.test.mjs`、`tests/framework/reading-toc-native-r41.test.mjs` | SOURCE_WIRED；真实页面重载/跳转及撤权恢复按同候选实际证据判定，未取证 NOT_TESTED |
| Stay Focus | 安装 JSON → Sandbox `focus.status` 或可信 Side Panel 点击 → 静态 `src/stay-focus/tool-host.js` → MV3 `src/stay-focus/service.js` → idle/tabs/windows/alarms/DNR；ISOLATED 页面提醒 | `alarms` 已声明；`idle` 和 `declarativeNetRequestWithHostAccess` 为可选原生权限，必须真实可信点击；用户未授权为 PERMISSION_REQUIRED | `src/sw.js`、`src/stay-focus/{service,rule-ownership,page-notice}.js`、`tests/environment/stay-focus-*.test.mjs`、`tests/framework/stay-focus-r1-native.test.mjs` | 原运行能力 SOURCE_WIRED；增加 `focus.probe` 的真实 SW 响应/版本/API 门槛，缺失时 RUNTIME_UNAVAILABLE；DNR 与计时真实效果仍需原生 Chrome |

## 本轮修复的具体缺口

R3.1 `requireToolRuntime` 仅核验 Side Panel 固定对象的属性；SW 尽管通过 `src/sw.js` 静态引入，启动异常可能被捕获，造成“已安装但服务不可达”。R3.2 在安装确认、持久化事务之前，发送只读 `focus.probe` 到真实 MV3 Worker，核对固定协议、服务版本、必需 Chrome API 的存在，并以 `src/sidebar-tools/sender.js` + 真实 `chrome.runtime.getContexts` 对来源文档双重验证。探测失败不能写入新安装；未申请原生权限不是服务缺失。探测不列入 `FOCUS_OPERATIONS`，动态包无法通过沙箱请求或据此提升权限。

继续复用 `src/stay-focus/rule-ownership.js` 的 730000–730199 自有 DNR 规则读回、原启停/撤权代际与清理事务，其他工具的规则与数据不应受到影响。探测无状态写入、无 DNR、无 Alarm、无网站 DOM 读取。

## 验证与后续

新增并更新已有环境测试：Worker 探测、活动宿主身份、未授权和 API 缺失、拒绝不匹配服务协议、Side Panel 安装前 fail-closed 与原有正向安装。实际 Node、WXT build、官方包、Chrome native 均以本 SHA 的 GitHub Actions 运行记录为准，**本文件不预先声称 PASS**。如果 CI 没有全部执行，需要独立补测未覆盖项。

Mac 本地最终确认：正式扩展 + 官方包真实安装、关闭 Side Panel 后前台计时和 DNR、原生授权窗口、阅读目录的 DOM/重载、笔记跨重启持久化、SW 休眠与 Chrome 重启、停用/卸载/重新安装、Time Review 和 Quick Notes 跨工具隔离；未获得同候选原始证据的场景始终 NOT_TESTED。
