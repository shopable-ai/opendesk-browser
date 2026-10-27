# Browser Environment P0-R1.2 · 2026-10-27

> 2026-10-27 后续 owner 增量：取消后的显式“停止 / 刷新恢复”已完成最小修复和 Mac 原生复验，详见本报告末尾“取消恢复增量”。以下首轮正文及评分作为历史保留；首轮 `INDEX.json` / `final-source.json` 仍只封存旧候选。新候选独立固定在 `delta-01a17bd5/`，不覆盖旧证据。

**P0 GO / NO_GO：P0 GO（真实 Mac Chrome for Testing 138.0.7204.183）；是否建议正式接入 OpenDesk Browser：暂不建议直接正式接入。** 六项底层可行性门槛有原生证据；正式 React Side Panel / Authority 集成尚未实施，异常恢复仍有明确限制。八维 ≥95 质量目标不能由本结论替代。

本轮的用户操作已完成：从 Chrome 工具栏扩展入口打开真正 Side Panel，绑定不同的 Target / Control，点击只读观测、启动、停止；实际网页 JS 与 HTTP 回显证明修改、隔离和恢复。没有通过外部 CDP 注入代替侧栏动作，没有改写页面 navigator / Intl，没有使用真实账号或第三方敏感网站。

## 来源、去重与候选

开始时原约定目录和 `browser-environment-p0-main-only.patch` 均不存在。已检索仓库、Downloads、Desktop、Documents、Codex 文件区和临时目录，未找到原件或同候选 Mac 原始 PASS；这不是对所有外部归档的穷尽证明。初始 `BLOCKED_MISSING_PATCH` 保留在证据中。用户随后回复“**不知道，你作为专家，合适的判断和完善。**”，本轮据此在唯一原约定目录恢复这一个新候选，没有再建第二份 Demo。没有伪称应用过原补丁，也没有执行不存在补丁的 `git apply --check`。

历史 Node 7/7、Linux HTTP PASS、Linux Chromium 被策略阻断均只继承为历史描述，不能证明本轮字节或 Mac 环境。本轮早期失败、语言修复和停止恢复修复均完整保留。生命周期复用相同 worker SHA 的已有效原生证据；后续仅证据队列/收集端改变时，只验证写入、重试及最后只读读回，没有反复执行大型测试矩阵。

唯一写入的源码目录为 `tests/fixtures/browser-environment-p0/`，共八个文件：`manifest.json`、`worker.js`、`panel.html`、`panel.js`、`server.mjs`、`test.mjs`、`README.md`、本报告。专属证据位于：

`docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/`

证据总索引是该目录的 `INDEX.json`；`final-source.json` 固定最终文件 SHA-256，`native/core/candidate-source.json` 固定核心链执行时字节。核心执行后 panel/server 仅加入跨侧栏队列互斥和派生文件修复；这两项的差量证据见 `native/collector-retry.json`、最后只读观测及组件日志，worker、CDP、绑定、恢复逻辑未变。

## 环境和 Git 边界

| 项目 | 实际值 |
|---|---|
| macOS | 26.5.1，build 25F80，Apple Silicon |
| 实测浏览器 | 官方 Google Chrome for Testing **138.0.7204.183**，原生 Mac GUI |
| Node | v24.16.0 |
| 工作目录 | `/Users/shopme/Documents/workspace/opendesk-browser` |
| 分支 | `main`，未建分支 / Worktree / PR，未提交或推送 |
| 开始 HEAD | `53538d3229b407b2dde0ef9c2880fda9584413d3` |
| 原生冻结及本轮末检查 HEAD | `33e329b557d3c5952f7c0d147ae59110d8f8b2d1` |
| 本轮末远端 main 查询 | `c8eaf4fc37a2825e0608ba7a8d1c4cbadf1cc7ae`，不是本地 HEAD |
| 扩展 ID | `npncjnknmchjnadgomodcfdnfdaajlfl` |
| 扩展加载目录 | `/Users/shopme/Documents/workspace/opendesk-browser/tests/fixtures/browser-environment-p0` |
| 隔离 Profile | `/Users/shopme/Documents/workspace/opendesk-browser/artifacts/browser-environment-p0-r12-01a179a2/profile-138` |
| worker SHA-256 | `a5e036ccd8a46a387ff0e94ac6b60e929fc59bdaa8f709df884851f0cb80a1c5` |

本机还有日常 Chrome 155.0.8059.85 及其他会话 CFT 155。本轮最初 CFT 155 的原生选择器命中了同路径的另一会话窗口，仅只读观察后放弃；终止了本轮自己启动且尚未 attach 的 155 进程，再选用当时空闲的官方 CFT 138，避免抢占。**155 / 当前 Stable 原生验收为 NOT_TESTED**，不冒充最新版本 PASS。

共享 main 和未提交文件持续有其他 Agent 写入。本轮只读取生产源码，保留所有并行变更；未 fetch / pull / merge / reset / clean 或改变共享 HEAD。`git ls-remote` 是远端查询，不声称本地已经同步该远端最新提交。正式方案的源码引用绑定本地实读快照，真正接入前必须重新核对相关生产文件。隔离 fixture 相关字节独立固定，因此无关 main 变化不触发重测。

正式 `manifest.json` 初始 SHA-256 为 `8add25c1c1756700eb8e16734aed89a94f8cc59378b459e0bb955ba745f143c8`，本轮未修改、未增加 `debugger`。只在隔离 MV3 fixture 声明 debugger / sidePanel / tabs / scripting / storage 及 localhost host permission。原生详情页实际显示“访问页面调试程序后端”“读取和更改您在所有网站上的所有数据”；命令行加载没有出现独立商店安装确认框，不能伪称已验收那种安装提示。点击启动后确实出现 Chrome“已开始调试此浏览器”信息栏。

## 核心三阶段原始观测

最终核心链 UTC 时间：BEFORE `2026-10-26T20:05:14.463Z`，MODIFIED `20:05:26.019Z`，STOPPED `20:05:44.666Z`（上海时间为 2026-10-27）。

Target `tabId=765241884`，Control `tabId=765241883`；二者 `windowId=765241869`。

| Target 字段 | BEFORE | MODIFIED | STOPPED | 结果 |
|---|---|---|---|---|
| JS / HTTP UA | 下列原 UA，两者一致 | 下列测试 UA，两者一致 | 原 UA，两者一致 | PASS |
| `navigator.platform` | MacIntel | Linux x86_64 | MacIntel | PASS |
| language / languages | zh-CN / [zh-CN] | en-US / [en-US, en] | zh-CN / [zh-CN] | PASS |
| HTTP Accept-Language | zh-CN,zh;q=0.9 | en-US,en;q=0.9 | zh-CN,zh;q=0.9 | PASS |
| Intl 时区 | Asia/Shanghai | Pacific/Honolulu | Asia/Shanghai | PASS |
| JS UA-CH 平台 / 架构 / 版本 | macOS / arm / 26.5.1 | Linux / x86 / 6.0.0 | macOS / arm / 26.5.1 | PASS |
| 实际 HTTP UA-CH | Chromium 138，macOS，arm，64 | Chromium 131 + OpenDesk P0 1，Linux，x86，64 | 与 BEFORE 一致 | PASS |
| innerWidth × innerHeight | 821 × 811 | 1024 × 768 | 821 × 811 | PASS |
| devicePixelRatio | 2 | 1.5 | 2 | PASS |
| outerWidth × outerHeight | 1200 × 950 | 1200 × 950 | 1200 × 950 | 未改变，真实窗口尺寸不由本覆盖修改 |
| documentId | 28B3E8EE6BE1BBBB2E754994AA566018 | 709E18E82FC1F7A6859397C8633AF306 | 823BC9B065DBC3519633110925031386 | 真实重新加载 |

原 UA：

```text
Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36
```

测试 UA：

```text
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OpenDeskP0/1.2
```

Control 三阶段的所有已采集 JS 与 HTTP 字段逐项相等，包含上述原 UA、MacIntel、zh-CN / [zh-CN]、Asia/Shanghai、macOS/arm UA-CH、1200×811、DPR 2、outer 1200×950；documentId 始终 `CF99BB5819EE04C1D07690E74FC30199`。这证明该 Control 没有被误修改，不代表检查过所有潜在浏览器指纹或任意第三标签。

HTTP 原始完整头、UA-CH fullVersionList、observedAt、tab/window/document ID 均在 `native/core/before.json`、`after.json`、`stop.json`；独立比较结果为 `native/core/comparison.json`。

| GO 必要门槛 | 结果 | 证据 |
|---|---|---|
| Chrome 原生 Side Panel 发起真实 debugger.attach | PASS | 原生截图、可信按钮 isTrusted、ATTACH 日志 |
| 目标 JS User-Agent 实际改变 | PASS | 真实 MAIN 世界读取，没有属性替换 |
| HTTP UA 实际改变且与 JS 一致 | PASS | 本地服务器 echo |
| 时区改变并读回 | PASS | Asia/Shanghai → Pacific/Honolulu |
| Control 未误修改 | PASS | 全字段比较及 documentId |
| Stop 后网页与 HTTP 实际恢复 | PASS | RESTORED_OBSERVED；不是 detach 回执推断 |

CDP 三条命令 `Emulation.setUserAgentOverride`、`Emulation.setTimezoneOverride`、`Emulation.setDeviceMetricsOverride` 均有真实 `chrome.debugger.sendCommand` 成功回执；它们与网页 JS、HTTP、跨标签隔离是独立结果。底层物理 OS/硬件仍为 Mac；不是完整指纹浏览器。

## 实际失败、最小修复和受影响验证

1. 初始语言参数含 q 权重，真实 JS languages 变成 `en;q=0.9` 且 HTTP 重复 q。改为 CDP 语言列表 `en-US,en`；原生 JS 与 HTTP 复验通过。
2. 初始恢复只比较 UA/时区，独立 Mock 反例证实 platform、languages、UA-CH、HTTP Accept-Language、DPR 残留可被漏报。扩为全部已采集 JS + HTTP 严格比较，原失败断言保留。
3. Chrome 调试信息栏退出造成高度差 52px，随后残留 1px。先保留 RESTORE_UNVERIFIED，再增加有界重观测；仅本次明确 owned 的显式 Stop 在其他字段全部恢复时，允许最多一次额外页面刷新，随后仍全字段比较。真实一次 Stop 的 `LAYOUT_REFRESH` 与 RESTORED_OBSERVED 原始日志保留，不抹掉早期失败。
4. 恢复状态曾可被 BIND、导航或 Control 关闭覆盖；对照关闭且清理失败还会丢失原 Target 责任。现在保留原绑定/基线/未知恢复锁，拒绝新 START/BIND；每条 override 前重新核对 tab/window/URL。Node 反例与原生 Worker 恢复、导航/Control 关闭负例均覆盖对应保护。
5. 证据接口原先接受过宽来源；现在要求指定 extension Origin 和每轮随机凭据，动作名由服务器确定。Chrome 的扩展 GET 不带 Origin 曾导致真实 403，改为 POST 会话请求；错误来源 / 无 Origin / 无凭据真实 HTTP 均 403，原侧栏保存成功。
6. POST 失败曾会遮住完整观测；现在先保存原 actionId 与完整结果到独立 session pending，失败保留原结果。原生证据端 POST 404 后，重开 Side Panel 重试成功，无新 CDP。Web Locks 串行保护同 Origin 多侧栏队列；服务器重试补齐派生 JSON、旧重试不能覆盖较新结果。该最后两项收集逻辑只定向回归，没有重跑无关核心或正式构建。

Node 是模拟/组件证据，不能替代以上 Mac 原始观测。最终 **83 PASS、0 FAIL**，4 项语法检查通过；完整日志见 `component-tests-final.log`，预期 EISDIR 为收集端写入失败注入。早期失败日志保留为 `component-tests.log`。历史异步截图的限制见 `historical-evidence-notes.json`，不把它们当恢复证据。

## 生命周期结果

`native/lifecycle-results.json` 为案例索引；每个案例有独立 `.actions.jsonl`，其来源是未删改的 `native/actions.jsonl` 行号。

| 情形 | 实际结果 | 修改 / 恢复事实 |
|---|---|---|
| 重复启动 | PASS | repeated=true，没有新增 attach 或三条 override |
| 重复停止 | PASS | RESTORED_OBSERVED，没有再次 detach |
| 修改中的 Target 关闭 | PASS | 原生关闭标签，TAB_CLOSED / CLOSED；不把关闭写成网页恢复 |
| Target 移至新窗口 | PASS（拒绝旧绑定） | 765241874 从 window 765241869 → 765241875；清理 owned attachment，STOP 报 TARGET_IDENTITY_CHANGED；随后关闭该目标，恢复读回未确认 |
| localhost 导航 | PASS | 旧目标拒绝 START；回原本地 URL 后实际 RESTORED_OBSERVED |
| 打开 DevTools | PASS（实际行为已记录） | 此 CFT 版本与扩展调试共存，没有自动 onDetach；截图 devtools-open.png |
| Chrome 原生取消调试 | PASS（事件与保护）；恢复 FAIL | onDetach=canceled_by_user；UA/HTTP UA/时区恢复，但 language/languages 残留，RESTORE_UNVERIFIED；拒绝重新绑定/启动，安全关闭 |
| Service Worker 中断与恢复 | PASS（安全失败） | 原生 serviceworker-internals Stop 显示 STOPPED；侧栏唤醒后 RECOVERY_REQUIRED，未重放 attach/CDP/detach，START/STOP 拒绝；未知覆盖仍可存在，不声称自动恢复 |
| 恢复锁遇导航或 Control 关闭 | PASS | 保留原 Target / before；BIND 仍 STOP_OR_RECOVER_FIRST；最终安全关闭原本地目标 |
| Stop 结果未知 | PASS（如实阻止） | 移窗 STOP 与 Worker 恢复 STOP 均真实拒绝；保留未确认状态 |
| chrome.debugger.detach 自身抛错 | NOT_TESTED（原生） | Node 已覆盖失败保护；未制造真实 API 抛错条件 |
| 旧 onDetach 在新 attach 后才送达 | NOT_TESTED（原生） | 已排队事件按 generation 过滤；到达后无法从 tabId 判别旧会话，保守失去 ownership；正式接入前风险 |

因此“全部异常可无缝恢复”不成立。取消后的语言残留、未知 debugger 会话和关闭清理均未冒充 RESTORED_OBSERVED。核心 GO 是已经独立证明的一次正常修改/停止链；不代表正式产品生命周期通过。

## 正式接入可行性（本轮只读）

目标链固定为：**现有 React Side Panel → 唯一 Foundation Broker / Authority → 受限可信 CDP Adapter → 精确目标 Tab**。不能把 fixture 的 SW/消息协议作为第二套正式 Host 或公开 SDK。

现有入口可复用 `src/ui/react/main.tsx:40`、`src/ui/tool-shell.js:67`、`src/platform/host/client.js:16`，由 `src/sw.js:269` 进入 `src/platform/host/broker.js:221`，沿现有 Authority 解析身份与授权（`src/platform/host/authority.js:20`）。当前页面选择已有 `src/ui/current-page-target.js:34`；`controller-methods.js:555` 已有 targetSessionId/targetVersion 模式，但 `target/index.js:83` 的校验不自动补 windowId，后续 adapter 必须显式验证用户点击时的 window / tab / top-document / URL 与 session generation。

| 决策点 | 最小接入要求 |
|---|---|
| 精确目标 | 复用当前页选择与可信用户手势；不允许 activeTab 随焦点漂移，也不接受第三方自报 tabId |
| 实际执行者 | 已注册可信扩展 SW/Host 经唯一 Authority 调用固定白名单 adapter；不是动态 iframe / Page / Controller 用户代码 |
| 禁止任意 CDP | 只暴露受审业务动作及固定参数域；拒绝 raw method、sessionId、任意 Runtime.evaluate、autoAttach 和任意 target |
| 生命周期 | Stop 先撤能力/标 generation，再清理；导航、窗口移动、tab close 使旧能力失效；仅 owned 会话可清理；未知副作用不得自动重放 |
| DevTools / onDetach | 处理实际 Chrome 版本差异、用户取消及旧事件；不能自动抢回，也不能用 onDetach 推断恢复 |
| MV3 中断 | 复用 controller-methods.js:1166 的 unknown/paused 恢复思路；Chrome118+活动 debugger 保活并不保证扩展重载或崩溃后仍拥有会话 |
| 必需 debugger 权限 | Chrome 不允许将 debugger 放入 optional_permissions；会出现广泛原生警告。是否由主扩展承担，必须单独产品/权限决策 |
| 独立能力扩展选项 | 可研究独立安装与撤销边界，但必须经现有 Broker 的认证固定协议，不得另建正式 SDK / Host / 权限管理器；本轮未实施 |
| Managed Proxy | `src/platform/chrome/browser-managed-proxy.js:7` 是浏览器级独占锁；:149 的 Stop 只清匹配 owner 的 PAC，:286 仅恢复 STOP。不能宣称代理为 Tab 私有，也不能创建第二个代理 writer |

拟变更清单（未实施）：既有 React/工具壳、HostClient、Broker/Authority、target 校验、SW 生命周期；可评估新增一个受审适配文件 `src/platform/chrome/browser-environment-cdp.js` 及现有 Authority 下的方法模块和定向测试。权限策略决策后才讨论正式 Manifest；本轮没有公开未经验证的 SDK 接口。

已核对的官方依据：[权限 optional 限制](https://developer.chrome.com/docs/extensions/reference/api/permissions)、[权限警告](https://developer.chrome.com/docs/extensions/reference/permissions-list)、[debugger / onDetach](https://developer.chrome.com/docs/extensions/reference/api/debugger)、[MV3 Worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)、[Chrome 137 命令行加载变更](https://developer.chrome.com/blog/extension-news-june-2025)。文档行为与当前实测分开记录，不能由文档推导未测试的版本 PASS。

## 实际命令与证据复查

```sh
pwd
git branch --show-current
git status --short
git rev-parse HEAD
git ls-remote origin refs/heads/main
node --check tests/fixtures/browser-environment-p0/worker.js
node --check tests/fixtures/browser-environment-p0/panel.js
node --check tests/fixtures/browser-environment-p0/server.mjs
node --test tests/fixtures/browser-environment-p0/test.mjs
node tests/fixtures/browser-environment-p0/server.mjs --evidence docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native --extension-id npncjnknmchjnadgomodcfdnfdaajlfl
```

浏览器完整 argv / Profile / PID 在 `browser-launch-138.json`。只结束本轮拥有的服务与测试浏览器；资源收尾实读结果记录在 `cleanup.json`，Profile 保留可复查。不运行整个仓库测试矩阵，不覆盖 dist/development 或任何并行 watcher。工作区仍未提交，生产/其他 Agent 改动保留。

## 独立八维评分与剩余边界

独立只读评审：Archimedes（critic）。这是当前隔离 P0 的交付评审分，不代表正式产品质量分或功能通过率；原始评分及核验范围见 `peer-review.json`。

| 维度 | 得分 / 100 | 独立扣分依据 |
|---|---:|---|
| 原始目标一致性 | 100 | 无扣分 |
| 跨对话去重与证据复用 | 100 | 无扣分 |
| 技术有效性 | 90 | −10：原生取消调试后语言未完整恢复 |
| 权限与安全隔离 | 85 | −8：迟到 onDetach 跨代归属边界未闭环；−7：实际 detach API 失败未原生验证 |
| 真实观测完整性 | 100 | 无扣分 |
| 标签隔离与异常恢复 | 70 | −15：取消后语言残留；−8：实际 detach 失败未原生验证；−7：迟到 onDetach 投递未原生验证 |
| 并行修改安全 | 100 | 无扣分 |
| 交付可重复验证性 | 100 | 无扣分 |

综合分 = 745 ÷ 8 = **93.125/100**。**未达到八维各 ≥95**。独立结论为隔离 P0 六门槛 GO、正式产品接入 REJECT；取消后的语言恢复仍为 FAIL，保护性拒绝与安全关闭为 PASS，两项未执行的原生异常继续标 NOT_TESTED。

正式接入前的下一条最小动作是：在现有 Authority 下先明确“同一 tab 旧 onDetach 迟到 / ownership 丢失”的恢复合同及可复现验证，决定未知会话的用户可见安全退出；随后才批准权限承载方案。不能据本 P0 GO 直接升级正式 Manifest 或发布正式能力。

## 主要原始证据入口

- [完整证据索引](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/INDEX.json)
- [BEFORE JSON](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native/core/before.json)
- [MODIFIED JSON](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native/core/after.json)
- [STOPPED JSON](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native/core/stop.json)
- [真实修改截图](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native/core/after.png)
- [真实恢复截图](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native/core/stop.png)
- [生命周期逐项结果](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native/lifecycle-results.json)
- [完整原始动作日志](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native/actions.jsonl)
- [证据失败及重试](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/native/collector-retry.json)
- [组件最终日志](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/component-tests-final.log)

## 取消恢复增量 · 2026-10-27 · 后续 owner 01a17bd5

**当前核心结论：隔离 P0 的原生取消 → 显式 Stop 恢复已可用；取消事件本身仍不能保证当前文档自动完整恢复。** 本轮未进入正式集成、发布、评分或全量验收。没有为了覆盖旧评分重跑生命周期矩阵；正常 Stop 因本次修改触及同一函数而定向复验，六项基础读回随该最短操作自然取得。

### 候选与历史关系

- 唯一目录仍为本 fixture 八文件；本轮只改 `worker.js`、`test.mjs`、`README.md`、`REPORT.md`。正式 `src/`、SDK、React、Manifest 和日常 `dist/development` 未写入，未执行产品构建。
- Worker 从首轮 `a5e036ccd8a46a387ff0e94ac6b60e929fc59bdaa8f709df884851f0cb80a1c5` 变为 `f6c51baa2b228d9b06a28ee8e3c7d9c7800422ac6c78914a379de8834cbe716f`。新的 `final-source.json` 固定八文件；旧八文件另存 `source-before/`，恢复出的旧 Worker/测试文本逐一通过开始时哈希核对。
- 首轮证据和独立评分原样保留。新证据根为 `docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/delta-01a17bd5/`，独立 `INDEX.json`，23 条真实 Side Panel 动作在 `native/actions.jsonl`。每条动作的实际按钮 `isTrusted=true`，未用普通 panel 标签页、外部 CDP 注入或 Mock 替代。
- 环境仍为 macOS 26.5.1 / Apple Silicon、官方 CFT **138.0.7204.183**；这是静态隔离 MV3 夹具，无 dev watcher 连接，加载路径仍为本 fixture。新建专属 Profile `artifacts/browser-environment-p0-r12-01a17bd5/profile-138`，保留旧 Profile。原生 `chrome://version` / 扩展详情和启动 argv 均已保存；扩展 ID 实读为 `npncjnknmchjnadgomodcfdnfdaajlfl`。
- Target `147644696`、Control `147644695`、window `147644693`。仅 `127.0.0.1:43128`，无账户、Cookie 或敏感网站。本轮服务 PID 34578、浏览器 PID 33411，已正常收尾，Profile 保留。
- 在 `main` 开始 HEAD 为 `33e329b557d3c5952f7c0d147ae59110d8f8b2d1`，远端只查询得 `c8eaf4fc37a2825e0608ba7a8d1c4cbadf1cc7ae`。期间共享 HEAD 被并行工作推进，末次检查见 `run-context.json` / `final-workspace.json`；本 owner 没有 fetch、pull、提交、推送、切分支或创建 Worktree/PR，没有覆盖其他 Agent 文件。

### 实际失败与最小修复

1. **先复现旧候选**（动作 1–8）：从工具栏打开真正 Side Panel，绑定、观测、启动，点击 Chrome 原生“取消”。Target 的 UA / HTTP 头 / 时区恢复，language/languages 仍为 en-US / [en-US,en]，另有 1px 布局差；Control 全字段不变。原始 documentId 在取消前后相同；START/BIND 分别拒绝 `RESTORE_VERIFICATION_REQUIRED` / `STOP_OR_RECOVER_FIRST`。旧 Stop 只读核对也仍未恢复。正常刷新本地 Target 后，documentId 改变、语言恢复，旧 Stop 全字段比较通过。
2. **定位范围**：实测残留依附当前文档，刷新可解除；尚未审计 Chromium 内部实现，不能将“Blink 内部缓存缺陷”当作已证实根因。夹具的具体缺口是 Stop 只在 `state.owned` 时刷新；原生取消使 ownership 丢失，因此按钮没有执行其“刷新恢复”部分。
3. **修复**：Worker 在当前内存 owned 会话收到 `canceled_by_user` 时，只保存本代一次性刷新意图；事件本身不执行动作。后续真实 Stop 消耗该意图，经原绑定完整校验，仅刷新原本地 Target 一次，并重新严格比较 Target / Control 全部已采集 JS 与 HTTP 头。没有新增 attach、CDP、detach，也不据事件推断 ownership。原 owned Stop 的布局补刷新仍只属于 owned Stop。
4. **保持保护**：取消后不能 START/BIND；持久残留仍为 `RESTORE_UNVERIFIED`，基线保留。身份变化/Control 消失不刷新；Worker 恢复不继承这个内存意图，仍保守进入 `RECOVERY_REQUIRED`。未知归属 debugger 不强制断开，未放宽断言。

### 原生结果与六门槛

| 当前操作 / 门槛 | 结果 | 新证据与复用边界 |
|---|---|---|
| 真正 Side Panel → 原生 debugger.attach | PASS | 动作 11 / 17 的可信按钮与 ATTACH；首轮截图/回执仍保留 |
| Target JS UA 实际改变 | PASS | 动作 11 / 17 的真实 MAIN 只读结果 |
| HTTP UA 改变且与 JS 一致 | PASS | 同次本地 echo，未仅用 CDP 回执推断 |
| 时区改变并读回 | PASS | Asia/Shanghai → Pacific/Honolulu → 原值 |
| Control 没有误改 | PASS | 全 JS / HTTP 字段始终匹配基线，documentId 始终 `CA9C3DD31F4ECC9A4F8300DA2C13CCAA` |
| 正常 Stop 后网页与 HTTP 全字段恢复 | PASS | 动作 17 → 18，含语言、UA-CH、viewport、DPR，`RESTORED_OBSERVED` |
| 原生取消立即自动完整恢复 | FAIL（浏览器实测限制） | 动作 12：language/languages 残留，仍 `RESTORE_UNVERIFIED`；没有宣称自动完整恢复 |
| 取消 → 显式 Stop 刷新恢复 | PASS | 动作 12 → 15：documentId 从 `529F1568232400000D81D44F640AA0F0` → `41BBD5AF6F8AD7B274D8656FEE564999`，全部采集字段严格匹配；只增加一次 `CANCELED_TARGET_REFRESH` |
| 重复 Stop | PASS | 动作 16 与 15 的 Target documentId 相同，没有新增刷新、attach/CDP/detach |
| 取消后 Worker 原生 Stop / 唤醒 | PASS（保护性拒绝） | 原生 internals 先显示 STOPPED；动作 20 → 21 保持原 Target documentId，不重放刷新或 debugger 操作，进入 `RECOVERY_REQUIRED` |
| Worker 恢复后 Stop 与安全关闭 | PASS（退出） | 动作 22 拒绝 `RECOVERY_REQUIRED_CLOSE_LOCAL_TARGET`；23 为 `CLOSED_LOCAL_TARGET`，没有在原网页读回恢复，不能计为网页恢复 PASS |
| detach API 自身真实抛错 | NOT_TESTED_NATIVE | 原生取消走 onDetach，不等于 API throw；确定性制造该条件需要受控竞争/浏览器故障，本轮未可靠实现，Mock 失败保护只算组件证据 |
| 旧 onDetach 在新 attach 后才投递 | NOT_TESTED_NATIVE | UI 无法可靠控制 Chrome 原生事件的此种投递顺序，且事件没有 session/generation ID；未以人工回调或 Mock 声称原生 PASS |
| 当前 Stable / CFT 155、正式集成/发布/全量验收 | NOT_TESTED / 延期 | 没有把 138 证据提升到其他版本或正式产品 |

取消恢复前后 ATTACH/CDP/DETACH 计数保持 **1 / 3 / 0**；新增刷新标记 **0 → 1**。真正比较结果及逐项断言存于 `native/results.json`，动作切片来自原始 actions.jsonl 的对应行，截图 `fixed-cancel-readonly.png` / `fixed-cancel-restored.png` 可复查。

### 对应验证、收尾与下一步

新增两个取消恢复回归先在旧 Worker 上失败，原始日志 `regression-before-fix.log` 保留。修复后仅运行本夹具 `node --test .../test.mjs`，**90 PASS、0 FAIL**；`worker.js` / `panel.js` 两项 `node --check` 通过。新增覆盖实际语言残留、显式一次刷新、持续残留仍锁定、URL/窗口/Control 拒绝、Worker 不重放和模糊 detach 不授予刷新。组件结果不代替上表 Mac 原生证据。最后文档调整没有触发重复测试、构建或评分。

本轮浏览器经原生正常退出，HTTP 服务停止；`cleanup.json` 实读两 PID 已退出、43128 无监听，专属 Profile 和日志保留。正式 Manifest SHA-256 仍为 `8add25c1c1756700eb8e16734aed89a94f8cc59378b459e0bb955ba745f143c8`。没有提交或推送。

本阶段没有待执行的核心动作。若 Worker 未中断，取消后点击“停止 / 刷新恢复”即可完成本地页面恢复；若所有权/恢复状态未知，则按安全关闭出口结束。正式权限承载、现有 Authority 集成、原生 detach throw / 迟到事件可重复验证、当前 Stable 与八维重新评分仍延期，不据旧目标自动继续。

- [本轮增量索引](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/delta-01a17bd5/INDEX.json)
- [原生比较与边界](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/delta-01a17bd5/native/results.json)
- [取消后恢复截图](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/workstreams/evidence/browser-environment-p0-r12-20261027-01a179a2/delta-01a17bd5/fixed-cancel-restored.png)
