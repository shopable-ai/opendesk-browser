# AI VIP Share R5.9.2 实际能力拒绝定位

负责人：Codex，本对话 `01a1433d-17fb-7490-8071-5c98f9cc006a`。状态：本次根因定位、诊断修复和用户选定日常 Chrome 路径验证完成；历史 CFT 保留原样，真实 Provider 功能仍阻塞。

## 范围与通过条件

- 仅在 main；保留其他任务及原 preview 的未提交修改，不创建分支、worktree 或 PR。
- 实际写入：本记录、`src/ui/sidebar-tools/package.js`、独立定向回归 `tests/environment/sidebar-tool-capability-diagnostics.test.mjs`、工具 `README.zh-CN.md` 的导入故障说明。`src/ui/sidebar-tools.js` 已有 textContent 错误展示，无需修改。公共 capability 白名单与安装 Authority 不放宽。
- 已确认的缺口：导入校验将所有未知能力、重复项及声明形状错误合成同一句消息，无法知道实际拒绝了什么。增加具体诊断并保持拒绝语义；这项修复本身不等于关闭用户实例故障。
- P0 通过条件：在用户报错的实际实例取得包 SHA、运行代码、扩展 ID/路径与具体拒绝项，修复后通过选择文件、审阅、安装、打开及重开；其他实例的 PASS 不替代。
- 当前正式包 1.3.1，56902 bytes，SHA256 `2b7a74b4c2596a910cd4dd892d3f7aac5e4af21ea45bd8dac1730a885c46892e`。四项能力 storage.local / network / browser.tabs / browser.proxy.managed。尚未改工具源码与正式包。

## 资源与复用

- 读取 testing-guide 与 R5.9/R5.9.1 记录；旧安装 PASS 仅作历史证据，本次用户失败优先。
- 日常 Chrome PID 75495，实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载仓库 dist/development，当前名 OpenDesk Browser Developer。旧 watcher PID 55545/55566 与 43119/43120 已不在，不将磁盘字节视为当前文档字节。
- 仅只读核对现有其他 CFT 的身份；不重载、不安装、不变更其他工作流资源。原生日常 Chrome 由本任务诊断；等待用户指明仍报错窗口，同时推进安全诊断修复。
- 独立输出：artifacts/ai-vip-share-r592-capability-import/。验证仅新诊断及受影响包/导入测试；工具业务测试输入未变时引用原记录，不提升为真实服务/Native/production PASS。

## 当前限制

- 正式会员/商品/代理 Provider 尚未配置，相关真实业务与安装 ticket 仍 BLOCKED/NOT_TESTED。
- 本地 main 与 origin/main 已分叉，且远端修改与其他任务未提交文件重叠；不自动 merge/stash/覆盖。提交与安全推送后续重新核对。

## 已定位根因与用户选择

- 原生 AX 在 `OpenDesk Schedule Demo CFT` 当前 Side Panel 直接观察到文件名与用户原文完全一致的能力错误，页面 `chrome-extension://defpghhiinilpacbiancgedhomkkbmkd/ui/tool.html?hostInstanceId=9b790a1c-0036-41f2-bd28-9bdc337ad92d`。这是实际报错实例；不是上一轮的日常 Chrome。
- Profile Preferences 与进程启动参数一致指向 `.runtime/scheduled-visible-demo-01a13b30/fix-candidate/dist/production`。该历史包 `ui/sidebar-tool-host.js` SHA256 `4c3e229fb2efa451417d1fab18988cedd2a196cd630e9183565df6c81982232f`，白名单含 storage.local/network/browser.tabs，但没有 browser.proxy.managed；当前包因此被正确拒绝。
- 用户确认“在 Chrome for Testing”，对选择日常 Chrome 或保留 CFT 回复“你进行判断”。本任务决定使用已配对的日常 Chrome；不覆盖历史定时验收候选、不更改其 Native origin/扩展 ID，也不称旧 CFT 已升级。
- 旧 55545/55566 watcher 已退出，端口无监听；本任务将启动仓库现有 `npm run dev`，成为 dist/development 的唯一 writer。按现有安全刷新栅栏执行，不伪造任务释放，不强制重载。
- 新增诊断回归先红后绿：具体未知能力、v1/v2 拒绝、重复/形状错误和有界文案；保留 E_TOOL_SCHEMA 与原白名单。5/5 NODE_PASS。

## 当前验证结果

- **用户选定路径的导入阻断已消除**：用户授权由代理判断环境后，使用日常 Google Chrome 的既有配对实例。原生文件选择器选中本目录唯一正式 JSON，实际审阅显示 v1.3.1 与全部四项能力。显示“已安装相同工具”（disabled），未执行重复安装或卸载。随后原生点击打开 → 返回列表 → 重开，全部可用；同一 UI 的“刷新状态”经公共 SDK 返回“已停止”。不把本次结果写成新的安装确认 PASS。
- **历史 CFT 仍为旧候选**：未覆盖、重载或升级该定时验收环境。它仍缺 managed proxy；本任务没有宣称该 CFT 已修复。支持能力取决于实际构建字节，与 Standard/Developer 名称或共同 0.1.0 版本无直接等价关系。
- **实际业务边界**：会员服务未配置、兑换输入与提交禁用、商品目录未配置、单一代理启用按钮禁用，界面明确展示安装 ticket 尚未接入；刷新状态可用。真实兑换/商品导航/START 在途 STOP/代理网络副作用仍 PROVIDER_BLOCKED / NOT_TESTED。源码和现有业务测试未改；R5.9 原组件证据仅保留原候选层级。
- **NODE_PASS 54/54**：`TMPDIR=/private/tmp node --test tests/environment/sidebar-tool-capability-diagnostics.test.mjs tests/environment/sidebar-tools.test.mjs tests/environment/browser-sdk-r13.test.mjs tests/environment/official-tools-catalog-r45.test.mjs`。原始日志 `artifacts/ai-vip-share-r592-capability-import-tests-canonical-tmp.log`。首次默认 TMPDIR 35/36，失败仅 `/var` 与 `/private/var` 的打包器输出路径等值断言；保留 `artifacts/ai-vip-share-r592-capability-import-tests.log`，未修改该测试绕过。
- **SOURCE_CHECK_PASS**：`npm run check`，777 个源码/测试/构建文件语法、固定入口、CSP、MIT 等检查通过；日志 `artifacts/ai-vip-share-r592-source-check.log`。
- **PROJECT_PACKAGE_MATCH**：唯一打包器 `--check-project` 成功；工具发行源码、版本与正式 JSON 字节未变，不执行无意义同版本晋升。
- **持续开发而非 production 验收**：本任务 watcher PID 36718，43119/43120，唯一 writer `.wxt/development.lock`，保留运行。磁盘已生成新诊断；实际页面诊断显示连接中的旧应用 revision `03ce689c843218bf07998be9ac9ee2287301e73c660c9dfd3dab3f1ff964a517`，提示安全刷新延后。未强制刷新、伪造 idle 或绕过未知资源保护；不宣称新诊断已应用到当前所有旧文档。
- 身份与原生 AX 转录、包/旧新 bundle SHA 和旧白名单提取保存在 `artifacts/ai-vip-share-r592-capability-import/observations.json`，明确 `automaticNativeReceipt:false`；不是自动化原生 main/F3/ZIP receipt。

## Git 集成边界

提交 SHA 与推送结果保存在 `artifacts/ai-vip-share-r592-capability-import/git-delivery.json` 及本次最终答复。取回远端后 main 仍 ahead4/behind17；远端与其他任务未提交的 `.github/workflows/prompt-shortcuts-r14.yml`、prompt-shortcuts 包/JS/CSS 及 management 测试重叠。不自行 merge/stash/rebase/覆盖，普通安全推送若被拒则保留本地提交待串行集成。

本次代码、文档和独立测试写入结束；未占用 CFT/端口/Native 资源。日常 development watcher 继续运行并持有 43119/43120，与全局源码自动刷新安全栅栏配合，后续开发不得另起 writer 覆盖它。当前 Chrome 留在已经打开的 AI VIP Share，停止状态、未配置 Provider 的真实提示可见。
