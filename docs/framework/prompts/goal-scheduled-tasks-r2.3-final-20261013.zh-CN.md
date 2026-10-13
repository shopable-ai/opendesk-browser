# GOAL：OpenDesk Browser Scheduled Tasks R2.3 Final Closure

## 未知网页副作用、长期历史安全保留、真实高倍率 UI、跨功能回归与最终原生验收

日期：2026-10-13。默认中文。

仓库：https://github.com/shopable-ai/opendesk-browser

Mac 工作目录：`/Users/shopme/Documents/workspace/opendesk-browser`

**唯一允许写入和推送的分支：`main`。**

### 一、直接执行目标

**直接在真实仓库现有 Scheduled Tasks R2 源码上继续工作，优先修复剩余可靠性、安全性、数据规模和原生 UI 缺口，并提交可运行的源码、测试、构建和可追溯验收证据。**

这是 R2 最终收敛，不是从零设计、另建调度框架、制作静态 HTML、只写报告，或再生成一份下一轮提示词。请以此任务直接长时间持续执行，完成一个小闭环就提交和记录，不要求用户逐项确认普通可逆工作。

**不重写、不复制原有 Controller、Authority、RunHost、`runs/@slot`、Cloud Control、Time Review、Chrome Alarms 或 Framework Storage。** 不另建 SDK、Host、IndexedDB 或后台隐形网页。

### 二、先只读核对 main 与已完成证据，严禁重复实施

必须读：

- `AGENTS.md`
- `docs/framework/parallel-development.md`
- `docs/framework/testing-guide.md`
- `docs/framework/workstreams/scheduled-tasks-r1-20261012.md`
- `docs/framework/workstreams/scheduled-tasks-r2-20261013.md`
- `docs/architecture/browser-framework/scheduled-tasks-r1-design.zh-CN.md`
- `docs/api/scheduled-tasks.zh-CN.md`
- `src/platform/tasks/schedule-{time,contract,repository,service}.js`
- `src/ui/{scheduled-task-workbench,scheduled-task-host,tool-shell}.js`
- `src/ui/{tool.html,tool-shell.css}`
- `src/sw.js`、`src/run-host.js`
- `tests/environment/{scheduled-tasks-r1,scheduled-task-ui-r1}.test.mjs`
- `tests/framework/scheduled-tasks-r1-native-mac.test.mjs`
- `.github/workflows/scheduled-tasks-r1*.yml`、`scheduled-tasks-r2*.yml`

最新目标 HEAD 必须现场核查，不得以提示词中的历史 SHA 作为当前 HEAD。用户有多个 Agent 并行开发；先看 `git status`、`git log`、`origin/main`、目标文件差异、既有 Chrome Profile/端口/构建目录占用。仅写入 `main`，不创建分支、worktree 或 PR；不强推、不 reset/clean、不覆盖别人的未提交工作或测试产物。冲突时仅停止冲突文件，不停其他无冲突任务。

**必须继承、不要重做的已验收能力：**

- R1/R2 已验证计划创建、一次/每日/每周/间隔、时区与 DST、固定安装身份、真实 Controller 执行、FireId 幂等和 Run/Result/Worker 退休。
- Side Panel「我的 → 定时计划」与独立 `scheduledRunner=1` 四项运行概览、内联验证、保存前确认、中文状态、历史分页和高级技术详情。
- Linux baseline/lifecycle、macOS baseline、Chrome 完整退出后同 Profile 恢复和真实页面执行。
- Chrome 网站访问权限真实撤销/恢复：Linux 和 macOS PASS。
- 已安装 Task 真实 UI 停用、重新启用、授权 generation 旋转及卸载：Linux 和 macOS PASS。
- `frameworkKV` 内的待处理 Fire 派生索引；不能为性能再次独立建库。

可复用的**固定候选**证据：

- `bc6dc46aa17f56006010ac27af8484a6eaf96f70`：组件/构建 [38352072072](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352072072)、Linux baseline/lifecycle [38352072052](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352072052)、macOS baseline [38352071965](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352071965)、Linux/macOS Chrome 整进程重启 [38352072059](https://github.com/shopable-ai/opendesk-browser/actions/runs/38352072059)，均 PASS。
- `743a67bd01404490aa6e1ba4c35ab60eba8806ea`：真实 Chrome 网站撤权/恢复 [38287719781](https://github.com/shopable-ai/opendesk-browser/actions/runs/38287719781) 与 Task 安装身份变化 [38287719921](https://github.com/shopable-ai/opendesk-browser/actions/runs/38287719921)，Linux/macOS 均 PASS。

如果 HEAD 及相关输入不变，直接引用既有证据；有受影响源码变更仅重跑必要分母，最终同 SHA 才执行整体收敛。

### 三、剩余任务树：按顺序实现与验收

#### P0-A：未知外部副作用、进程和宿主异常，真实闭环

保留「至多一次准入、未知副作用不自动重放」的严格语义。逐项核查并修复：

1. Controller 已经 ADMITTED，网页 POST/点击等效果已发生，但完成回执丢失：只能查询原 Run/Result/退休状态，不得创建另一个 Run，也不得把 ADMITTED 改回 READY/WAITING_TARGET。
2. Worker 中断或 Service Worker 休眠唤醒；原始 Host 页面在运行期间关闭、冻结或丢弃；宿主恢复时检查原 FireId、RunId、ResultId，禁止因重新连接而重跑网页。
3. 目标网页中途导航、documentId 失效、权限中途撤销、执行槽竞争、超时和用户 Stop：必须显示正确用户状态并保留审计记录，且资源最终释放或明确标记不能安全释放。
4. `UNKNOWN`、`SETTLING`、`ADMITTED` 和需要人工处理的状态不得被定时对账、历史分页、授权恢复或迁移脚本误清除。
5. 真实 Chrome 故障注入与纯函数/Mock 组件测试分别记录。真实测试使用隔离 Profile、真实网页效果、原 Controller/Authority/RunHost；不修改 IndexedDB 伪造收据、不能直接给表单赋值、不能绕过 Chrome 原生权限。
6. 如果已有证据覆盖某项且身份完全一致，直接标记 ALREADY_VERIFIED，不重复跑无意义流程。

#### P0-B：长期历史数据规模、索引和安全保留

重点审阅 `schedule-repository.js`、现有 `tx.scan` 和 `frameworkKV` 的真实读写路径。

1. 使用隔离真实 Chrome IndexedDB 建立 1,000 / 10,000 / 100,000 Fire 历史压力数据，记录准备时间、存储大小、`listSchedules`、`listScheduleHistory`、`reconcile`、`ready` 的 p50/p95 响应时间与原生日志；测试数据不得写入用户真实 Profile。
2. 验证历史跨 generation=9/10、多计划、多 Host、迁移前 R1 老数据、首次 pending 索引构建、Chrome 重启索引恢复、索引悬空与缺失时的安全行为；确保长期执行主要成本随活跃 Fire 而非所有审计历史增长。
3. 完成保留政策：定义哪些纯终态记录可压缩、哪些必须永久或长期保存；保留 UNKNOWN、ADMITTED、未退休、具有真实 Run/Result 或需要审计的记录。任何清理不能破坏 FireId 防重放，可使用同一个 Framework Storage 中有界且可验证的归档/墓碑机制；**绝不为达成性能目标直接批量删除旧历史**。
4. 可证明安全才实现自动清理；若无法确保审计与幂等性，同时交付安全的分页/统计/空间告警和保留策略文档，将自动清理标为 NOT_IMPLEMENTED，不虚称 R2 已关闭。
5. 不提高现有安全容量限制来掩盖问题，也不引入另一套数据库。

#### P0-C：真实 Chrome 产品 UI 与 200% 高倍率

保留六个 Side Panel 一级页签「我的 / 发现 / 工作流 / 开发 / 工具 / 云控」，定时计划继续只属于「我的」。

1. 真正使用 Chrome 检查 Side Panel 320/360/420px、独立窗口宽屏/窄屏，浏览器真实 100/125/150/200% 缩放；DevTools `Emulation.setDeviceMetricsOverride` 仅能称 viewport emulation，不能替代真实缩放。
2. 验收空列表、100+ 历史、长中文任务名称、长 URL、长 JSON、暂停、等待宿主、等待网页、权限不足、未知结果、失败恢复、多 Host 状态。
3. 核查焦点顺序、屏幕阅读器可理解的标签/aria、键盘操作、图标点击目标、内联错误、状态对比度、200% 溢出与水平滚动；使用项目 R27/R20 和既有 Token，不另建 UI/CSS 系统。
4. 独立运行页应保持运行概览而不是 Side Panel 放大版；详情、停止、暂停、恢复和管理入口必须正确关联原 Run/Task 逻辑。
5. 真实截图与原始几何/交互记录和包 hash 一起保存；没有证据不能写 UI 95 分。

#### P1：Task 精确身份与其他模块兼容收敛

1. 前期「停用→重新启用→安装授权 generation 旋转→卸载」的 Linux/macOS PASS 不重跑，除非相关代码变更。
2. 补同名不同版本、升级到新 manifestHash/sourceHash、安装候选来源变更和参数 schema 变更的安全拒绝与显式重新确认；仍绑定原固定身份，不自动运行新源码。
3. 验证 Cloud Control、人工 Controller、工作流与 Scheduled Tasks 共享原执行槽时的公平等待和资源释放，不改变 Cloud Control/Time Review 原调度、Chrome Alarms 命名空间或 Side Panel 导航。
4. 异常恢复后 UI 显示的「当前授权状态」与历史 `NEEDS_ATTENTION` 必须区分，不能因为一次旧错误永久提示当前无法执行。

#### P2：完整测试、构建、证据与文档收敛

运行受影响测试以及：
```bash
node --test tests/environment/scheduled-tasks-r1.test.mjs tests/environment/scheduled-task-ui-r1.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
```
按仓库测试指南补原 Task、Authority、Host 与 Cloud 回归。安全且必要时执行 `npm run pack`、`npm run pack:dev` 与 ZIP 身份一致性验收。

R1 的 Linux baseline/lifecycle、macOS baseline 保留独立稳定阶段；R2 完整重启、撤权、Task 身份、UNKNOWN 故障、数据规模和真实 UI 采用独立专项 CI，最终对齐同一 Git SHA / WXT package hash。

原生证据逐项记录 Git SHA、完整 package hash、Chrome 版本、独立 Profile、真实 Tab/DocumentId、Alarm/FireId、RunId/ResultId、网页实际效果、Worker retirement、截图与日志、PASS/FAIL/NOT_TESTED。不把 Linux CI 的 `--no-sandbox` 写成沙盒安全 PASS。

只优先更新现有：
- `docs/framework/workstreams/scheduled-tasks-r2-20261013.md`
- `docs/api/scheduled-tasks.zh-CN.md`
- `docs/architecture/browser-framework/scheduled-tasks-r1-design.zh-CN.md`

每个功能的 SOURCE_IMPLEMENTED、COMPONENT_TESTED、BUILD_VERIFIED、CHROME_NATIVE_VERIFIED、NOT_TESTED / FAIL 严格区分。

### 四、95 分质量闸门与最终交付

按视觉设计、信息架构、交互体验、功能完整性、长期可靠性、错误与恢复、可访问性、性能、权限安全、原生 Chrome 验收 **分别独立评分**。目标各项 >=95/100；不足或没测写明原因和后续关闭条件，绝不平均分掩盖缺项。

最终必须提供：
1. 本轮真实修改文件和功能差异；已经完成的不重复申报。
2. 测试候选 SHA、构建包 hash、每个原生 CI URL、真实 PASS/FAIL/NOT_TESTED。
3. Side Panel 和独立运行页的最终布局、关键截图路径及 200% 真实缩放情况。
4. 长期性能规模与安全保留策略/剩余缺口。
5. Controller、Cloud Control、Time Review、SDK 等原功能的回归结论。
6. 是否构建、打包、提交和安全推送 `main`。
7. 各专家维度是否已达 95 分，以及 R2 是否正式满足 Final，若不满足则只列最小剩余项。

**现在直接开始修改、修复、验收和安全提交，不要停留在二次规划，也不要只给下一份 GOAL。某一原生环境暂不可用时继续推进其他不冲突的源码任务，绝不假报 PASS。**
