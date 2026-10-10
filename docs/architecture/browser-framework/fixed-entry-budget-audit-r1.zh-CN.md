# OpenDesk Browser：15 个固定入口的构建体积审计与优化边界 R1

更新时间：2026-10-10。范围：main 的 WXT/Chrome MV3 固定入口。**本轮实现跨入口审计，不以 Node 测试冒充 Mac Chrome 原生验收，也不突改运行时的拆包合同。**

## 一、真实风险及证据身份

- `scripts/build-contract.mjs` 定义 15 个固定自包含 classic-IIFE 入口；`wxt.config.mjs` 使用 **320 KiB** 生产预算约束固定产物。这是项目构建合同，不是 Chrome 对所有 SW 的统一硬限制。
- 用户报告一次本机 `sw.js=326907` 字节，余量 **773** 字节；仅凭转述的体积不能认定与仓库当前 SHA 完全一致。
- 仓库历史回执 `docs/framework/workstreams/evidence/webcodex-chat-edit-r2/release-builds/build-production.json` 记录 `sw.js=327027` 字节（余 653）和 `ui/tool-shell.js=311536` 字节（余 16144）。这是该回执绑定的历史候选，不能冒充当前 Mac 构建或原生 PASS。
- Rollup 的 `renderedLength` 是**压缩前**统计，不可当作最终产物字节归因；当前产物要由实际文件的字节和 SHA-256 确认。
- `src/runtime/builtin-libraries/core.js` 的 Lodash/Day.js 实现应仅进入 Controller Worker、Page USER_SCRIPT 的固定资产；SW 中只能需要库目录或哈希验证器，不能直接携带第三方库实现。

## 二、本轮已经新增的安全审计

| 文件 | 作用 |
| --- | --- |
| `scripts/audit-fixed-entries.mjs` | 同时读取**本轮生产回执与 15 个实际输出文件**，核对字节、SHA-256、模块图及固定入口闭包；拒绝错配、超过预算或 SW 误引 Lodash/Day.js 实现。 |
| `tests/environment/fixed-entries-audit.test.mjs` | 测试跨入口体积风险、缺失/重复/错配回执的阻断及错误运行世界的第三方库。 |
| `.github/workflows/fixed-entry-budget.yml` | main/面向 main 的 PR 有构建相关变更时，在独立 Actions checkout 运行依赖安装、定向测试、源码检查、真实生产构建与全部入口物理审计，按 SHA 保留工件。 |

新的架构预警等级：使用率达到 **80% watch**、**90% critical**；低于现有预算仍然允许现有构建流程继续，不能把预警伪装成失败，也不能提高旧的 320 KiB 硬上限。长期建议争取每个重要固定入口预留至少 **20% 余量（≤262144 B）**，在审计 JSON 中显示达到目标尚需节省的 `designReserveDebtBytes`，它不是新的强制门槛。

本地执行（在无其他 Agent 共用 dist 的时机）：

```bash
npm ci
node --test tests/environment/fixed-entries-audit.test.mjs
npm run check
npm run build
node scripts/audit-fixed-entries.mjs artifacts/fixed-entry-budget.json
```

输出 JSON 包含每个固定入口的物理 `bytes`、`remainingBytes`、`usagePercent`、`sha256`、`moduleCount`、`topModulesPreMinify` 和优先级。**不可把历史 receipt 与当前 dist 混合。** 构建失败必须如实报错，不可通过 `npm run build || true` 冒充正式验收。

## 三、下一步真正节省运行时代码的优先级（尚未实施）

1. **SW 优先**：历史 Rollup 模块图的大贡献者是 `src/platform/host/controller-methods.js`、`src/platform/downloads/index.js`、`src/framework/control/native-driver.js`、`src/platform/host/sdk-methods.js`、`src/scripting/user-scripts/{dependency-manager,installed-programs}.js`。先做相同候选的依赖图比较及重复序列化/冷路径分析，再用打包后字节和 Chrome 回归衡量；绝不迁移 Run Authority、权限校验、幂等下载/持久化验证到用户网页，亦不靠更激进 `unsafe` Terser 选项赌功能等价。
2. **Sidebar 第二**：`ui/tool-shell.js` 历史接近 320 KiB，评估冷路径 UI 功能与独立页面的职责。不可把动态运行结果改成静态 UI 数据、牺牲可访问性或粗暴启用任意代码块/动态 import。新入口只有连同 Manifest、资源完整性、权限合同和原生 Chrome 证据一起变更才能正式采用。
3. **其他入口跟踪**：Controller Worker、Page USER_SCRIPT、`native-agent/settings.js`、`native-agent/transport.js` 继续单独审计体积、来源和运行世界；已冻结的库版本和用户零配置行为不得倒退。
4. **证据闭环**：前后两次都用相同锁文件、WXT 构建策略与真实文件测量；跑受影响 Node 合同、生产/开发包、相应真实 Chrome 双入口、重启、撤权、停止、ZIP 同包验收。原始测试和失败日志按候选提交 SHA 保存；组件通过不等于真实 Chrome 或全局 F3 PASS。

Chrome MV3 支持 classic `importScripts`，也支持声明 `background.type=module` 后的静态 import，但**不支持 SW 动态 `import()`**。目前该仓库的 classic-IIFE、固定 Native transport、资源闭包与校验器是一体安全合同，任何拆包须独立迁移并复验。参考：https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics 。

## 四、反方审计与未完成项

- 体积预警不能代替权限审计和运行时证明。超过旧硬上限、模块图缺失、SHA 错配与把 Lodash/Day.js 实现打入 SW 都是构建阻断。
- 本轮没有修改 `src/sw.js`、`src/ui/tool-shell.js`、`wxt.config.mjs` 或 SW 的压缩参数，避免覆盖正在进行的 Mac Chrome 双入口验收。
- Node 22 独立 fixture 的 4 项针对性测试通过；**当前环境无法安装整个仓库及启动用户 Mac Chrome，尚未产生本次提交完整的 WXT/Chrome 通过证据**。CI 运行与本地 Codex 的结果须按真实 SHA 查看，不能预先宣称 95+ 或 F3 完成。
