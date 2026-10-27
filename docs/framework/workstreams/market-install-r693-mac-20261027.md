# 应用市场 R6.9.3 · Mac 本地验收

- Owner：Codex `01a17da5-72aa-7441-aca8-ad819879c1cb`；2026-10-27；状态 `BLOCKED`，下述环境、源码与资源均为本轮观察，续跑先重查。
- 起始分支/HEAD：`main` / `c165105c98beb5535b4d6db740f6fe62a833e98f`；起始工作区干净。R6.9.2 两提交为祖先；后续业务差异仅 tool-shell 安装审阅回执文案。
- 当前目标：真实 Mac Chrome 书签管理安装、成功页直接打开原 ToolHost、正常卸载后网页无过期状态；仅必要最小修复与定向安全回归。
- 写入范围：本记录、`artifacts/market-r693-mac-20261027/`；发现实际失败后才声明具体产品/测试文件。两位原生子 agent 只读，禁止操作 Chrome、服务与产物。
- 起始资源核查：当时列表中的其他相关对话均 idle。43132 / PID 81835 服务旧 R6.9.1 snapshot；保留。日常 `dist/development` 当时无活跃 watcher，旧 lock 待核查。原专属 Profile 2 加载 snapshot、ID `efdideaeenealogeamjmlbffhhjohelg`，不能冒充新源码。日常 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 当时待 UI 核对，后续核对结果见下。
- 验证：复用 R6.9.2 CI run 40513098611，原始证据由只读审计核查；本轮真实行为全部 `NOT_TESTED`，旧包中可见书签 UI 只作环境观察。
- 保护：不创建分支/worktree/PR、不停止他人 watcher/Chrome/服务器，不修改 Native 配对，不覆盖旧候选或并行代码。

## 本轮结论：BLOCKED / ENV_BLOCKED

**两个原始问题均未取得本轮真实 Mac Chrome 通过证据，不能宣布修复已验收。** R6.9.2 安装成功页直达 ToolHost 的代码仍在；本轮期间并行合入的 `47d4568c6` 重新引入网页安装状态读取，已覆盖 R6.9.2 的部分网页行为，与本轮 R6.9.3 原约束冲突。本轮没有重新实现市场、修改业务源码、卸载用户应用或绕过发行身份校验。

### 用户补充相似任务后的去重决定

- 用户明确提供另一份 R6.9.x 最终闭环任务并要求避免重复执行。两份任务的书签安装、真实打开、卸载、重装、权限与 UNKNOWN 验收重叠，不启动第二轮相同浏览器测试、相同输出构建或相同源码修复。
- 最新实读 `main` 为 `9388b97b1aec550f276773b998af260c323fa1b7`。其中 `47d4568c6d24616e024b4cb0665576eef46c8291` 已修改 `src/market-site/client.js`、`market-site-client-r5.test.mjs`、`market-panel-navigation-r691.test.mjs`，重新加入 `GET_APP_STATUS`、`OPEN_INSTALLED_APP` 与 focus/pageshow 状态刷新。这些是另一任务已完成的变更，本轮不重复编写或擅自回滚。
- 两份要求存在实际冲突：R6.9.3 明确网页不维护长期已安装状态，不重新增加 GET_APP_STATUS 查询层；相似任务明确要求网页查询安装状态并提供打开/管理按钮。用户将后者作为“相似任务”提供，未明确撤销前者，本轮继续保留 R6.9.3 为需求依据，冲突记为 `SOURCE_REQUIREMENT_CONFLICT`，不让两边互相覆盖。
- 本轮原准备对 R6.9.2 的活页成功提示补最小回归；在写入前发现上述并行提交，已停止该修改，实际未写产品或测试文件。旧 CI 与本轮早先导航结果不再自动覆盖这三个已变化文件；不重复运行冲突版本的验收来制造当前 PASS。
- 已读回「应用市场继续完善与手动测试环境」：该对话接管旧 Profile 2、43132 旧服务器；最近一次完成的是旧候选 Markdown 打开使用，不能替代当前书签候选。最新列表查询未完成，ChatGPT 侧读取返回 Too many requests；新增相似任务的实际 owner 和最新结果尚未核实，不能写成已协调移交。已向用户询问其对话标题或链接，未向其他用户对话发送消息。
- 日常 Profile 的并行 Bridge 测试与当前 `src/ui/tool-shell.js` 未提交修改继续保护。本轮保留环境/差量证据，释放自动点击，不启动第二个 watcher、不重复他人安装/卸载，也不伪报原 goal 已迁移或暂停。
- 独立 verifier 再核当前源码：`client.js:103` 保存 appStatus，`:116` 据此渲染打开/管理/更新，`:140` 查询，`:212` 无未决 intent 也读取，`:289` 返回页面时刷新。结论为相对 R6.9.3 的源码要求 `FAIL`；没有发现写盘持久化，也不是每 15 秒定时轮询。该结论不等于真实 Chrome 功能验收已执行。

### 当前实际操作与阻断

1. 在真实稳定 Chrome UI 核对日常 Profile「您的 Chrome」：启用的 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载来源为本仓库 `dist/development`，书签权限已存在。原始 AX/截图见 `artifacts/market-r693-mac-20261027/daily-extension-path.txt` / `.png`。
2. 原 43132 / PID 81835 仍服务 R6.9.1 静态网站，专属 Profile 2 仍加载 snapshot / `efdideaeenealogeamjmlbffhhjohelg`。该旧页面可见的已安装标签和书签 UI 不能作为新源码缺陷或 R6.9.3 PASS。
3. 无活跃旧 watcher，原 lock PID 71072 已不存在、输出守卫端口未占用。经原 `npm run dev` 恢复持续开发。为保留旧网站服务器，曾将本轮通道设置为 43133，并用原 `npm run dev:market` 生成新网站，**失败**：

   ```text
   Immutable release conflict: opendesk/ai-knowledge-answers@0.1.5; publish a new version
   at mergeMarketReleases (scripts/market-release-snapshots.mjs:42)
   at buildMarketSite (scripts/build-market-site.mjs:127)
   ```

   原始命令环境：`OPENDESK_MARKET_DEV_ORIGIN=http://127.0.0.1:43133 OPENDESK_MARKET_SITE_OUTPUT=artifacts/market-r693-mac-20261027/site npm run dev:market`。日志为 `artifacts/market-r693-mac-20261027/market.log`；新网站未生成，43133 没有监听服务。
4. 独立只读审计确认同一 `ai-knowledge-answers@0.1.5` 有三种字节：历史快照 57380 B / SHA 前缀 `19b07522517e`，当前源码经原打包函数 57929 B / `b8aa00929168`，工具目录正式 JSON 57435 B / `e65e942b7715`。官方目录对该工具未指定 packageFile；builder 固定合并所有官方资源及历史快照。更换端口/输出或追加项目均不能解决。没有删快照、改旧 SHA、降级安全校验、临时改其他工具版本，亦未添加第二个网站 builder 或安装器。
5. 43133 临时通道已撤回，**最终恢复原默认 43132 通道**，ID 仍为 ccfc…。当前为 `CONTINUOUS_DEVELOPMENT`，输出路径不变；`npm run dev` PID 2676，server 127.0.0.1:43119。日志有 `RUNNING`，TCP 连接实读包含稳定 Chrome network PID 80652；这证明开发连接存在，不证明市场安装或最终候选通过。旧 81835 服务未停止或改写。
6. 日常 Profile 后出现并行「Bridge P0 R4」测试标签，且 `src/native-agent/chatgpt-bridge-trigger-gate.js`、`chatgpt-fixed-bridge-host.js`、新增 `chatgpt-task-discovery.js` 正在由其他工作修改。已停止该 Profile 的进一步点击；这些文件不属于本轮，不暂存、不提交、不回滚。watcher 依原安全更新机制处理变更，故本轮产物是活动开发候选，不能称为正式冻结包。

### A–E 验收状态

| 任务 | 实际状态 |
| --- | --- |
| A 环境 | Chrome 日常路径/ID/Profile、默认 channel、dev server 连接已核对；同源新市场网站 `ENV_BLOCKED`；Go doctor / Native 配对未操作，本轮普通工具安装未进入，不声称运行证明无 Native 依赖 |
| B 真实市场安装 | `NOT_TESTED`：原 builder 未产出当前网站，未进行新安装确认 |
| C 成功页直接打开与书签搜索 | `NOT_TESTED`：没有同候选安装成功页，不以旧 snapshot 的书签 UI 代替 |
| D 卸载后网页 | `NOT_TESTED`：没有卸载现有用户工具或数据 |
| E 最小安全回归 | 原 CI 只证明原候选；本轮早先导航 14/14 只证明当时输入，后续 47d4568 又修改该文件。当前状态同步增量未由本轮测试；真实升级/停用/撤权/重复点击/脏草稿与旧按钮场景均 `NOT_TESTED` |

### 源码与 CI 证据复用

- 已安全将远端 `91f857dbc` 合入本地 main；合并提交 `9811c17a2344480bb34caaed22842e070b6139f8`，保留两侧历史，无冲突。远端新增主要为 Cookie UI 与统一 Page 详情，未重做 R6.9.2。没有推送。
- 两个 R6.9.2 提交均为祖先。早先在 `9811c17a2` 观察：相对 `0e2154e4c`，client、templates、install、market-install-sheet 及三份定向测试、package-lock 字节未变；tool-shell 仅审阅回执文案有差异。该历史输入哈希保存在 `r692-input-review.json`。之后 `47d4568c6` 改变 client 与两份测试，早先等同关系已失效；当前差量另存 `cross-chat-delta.json`。
- 用 GitHub 连接器读回 [run 40513098611](https://github.com/shopable-ai/opendesk-browser/actions/runs/40513098611) 的 job `122219631753` 及完整原日志。实际 checkout 为 `0e2154e4cd5c190151137f4d3d8fdfd1e449a37e`；30/30、125/125、React 来源绑定预览 PASS。原预览明确 `nativeChrome:NOT_TESTED`、`installedExtension:NOT_TESTED`；不提升为真实安装证据。原件：`ci-jobs.json`、`ci-job.log`。
- `market-panel-navigation-r691.test.mjs` 有后续 `runtime.getContexts` / document 身份差量，在 `9811c17a2` 补跑这一文件：`node --test tests/environment/market-panel-navigation-r691.test.mjs`，**14/14 PASS**，见 `navigation-test.log`。随后 47d4568 修改该测试，不能称为最新 main 的 PASS。没有重新跑整 CI。
- 本轮未修改产品和测试文件。记录格式/路径与 `git diff --check` 核对；不做全仓测试、production 构建、评分矩阵。

### 三个指定反例

| 反例 | 现有源码/证据与限制 |
| --- | --- |
| 成功 Sheet 仍在而 ToolHost 未打开 | `src/marketplace/install.js:36` 先复核身份并等待 openInstalledApp，成功后才 onClose；`src/ui/sidebar-tools.js:4430` 的导入审阅判断没有把市场 Sheet 自身当成拒绝条件。独立审查未证实自阻断，但原测试分别替换事务/回调，整链仍 `NOT_TESTED` |
| 卸载后仍残留成功文案 | R6.9.2 成功反馈为“本次安装成功。请在 OpenDesk 侧边栏打开使用”，原活页没有撤下该成功提示的处理；独立审查发现此潜在误导。本轮尚未写修复时 47d4568 已加入状态查询：当前 client.js:140 readAppStatus 在未安装/停用等状态改写成功提示，:289 focus/pageshow 触发刷新，但与 R6.9.3 的无同步要求冲突。实际卸载/断连时提示表现均 `NOT_TESTED`，不以新增查询的静态逻辑冒充通过 |
| 版本、停用或撤权后旧按钮误启 | `install.js:38` 再读本机版本和 enabled，`src/ui/extension-center.js:541` 再查来源/摘要，`src/marketplace/status.js:52` 绑定安装 epoch；组件边界有证据，真实书签权限撤销和旧按钮点击均 `NOT_TESTED` |

### 八维独立审查与评分

两位原生子 agent 均只读，模型继承；没有占用浏览器或构建输出。第一位负责 React 架构、安装安全、生命周期、维护性；第二位负责产品、UX、测试证据、跨对话去重及发行阻断归因。正式分数要求真实候选证据；以下不把静态检查当成 ≥95 分。

| 维度（各满分100） | 正式评分 |
| --- | --- |
| 产品 | NOT_TESTED |
| UX | NOT_TESTED |
| React 架构 | NOT_TESTED |
| 安装安全 | NOT_TESTED |
| 生命周期 | NOT_TESTED |
| 测试证据 | NOT_TESTED |
| 维护性 | NOT_TESTED |
| 跨对话去重 | NOT_TESTED |

算术平均：`N/A`，未取得八项独立实测分数，不以静态平均或累计总分代替。

### 剩余最小动作与资源

先核实相似任务的实际 owner/证据与唯一测试资源，并对齐网页状态的相冲突要求；由相应发行 owner 用真实不可变字节/合法新版本解决 ai-knowledge-answers 同版本冲突，使原市场 builder 可以生成当前网站。之后只由一个 owner 串行执行书签安装→成功 Sheet 打开使用→搜索→卸载→网页刷新及最小状态变化回归，另一方复用有效证据。后续其他发行是否有冲突未知，不能宣称只存在这一项。不得为完成验收绕过当前失败。正式 HTTPS 市场配置本轮未核查，`PUBLIC_RELEASE_NOT_TESTED`，不将公网发行纳入当前本地验收阻断。

本轮状态 `BLOCKED`，原生 goal 仍 active，未伪报 complete/paused/blocked；当前为第一次观测此阻断，尚不满足工具连续三轮的 blocked 状态门槛。没有创建自动化、分支、worktree、PR。文件与原生 UI 操作已释放；自有 dev watcher PID 2676 保留供日常持续开发，旧市场 PID 81835 保留，均非已停止。后续开始时重查 PID/路径/输入，不重复已有效测试。
