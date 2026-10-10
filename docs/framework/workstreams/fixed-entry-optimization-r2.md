# 固定入口实际瘦身 R2

## 方案与范围

本轮承接 R1 体积审计，直接修改构建和后台运行时代码，不只增加告警。只在 main 集成，不新建分支或 worktree，不更改 320 KiB 预算、Manifest、权限、CSP、公开协议、第三方库版本、UI 功能或 Terser 参数。

1. **不需要校验的入口不再带入完整规则。** `scoped-schema.mjs` 复用原有数据压缩器，只对生成的常量数据解码调用标记纯初始化，让 Rollup 删除没有实际使用的规则表及解码器。绝不对实际校验函数、网络调用或任意模块统一标记无副作用。
2. **后台按调用保留规则。** `scoped-schema.mjs` 用 Acorn 精确识别从固定 protocol 模块导入的 `validate('固定名称', value)`，在构建时绑定该规则及全部递归 `$ref` 依赖。完整 `validate(name,value)` API 保留；动态名称、命名空间调用、别名遮蔽或额外参数保留完整路径。未知引用阻断构建，不猜测或绕过校验。
3. **共享同一校验引擎。** `protocol.js` 的 `validateSchema` 与原 `validate` 共享原有类型、字段、引用、时间、深度、循环及错误投影逻辑。没有删除校验规则，没有把后台鉴权交给网页。
4. **后台转发去重。** `broker.js` 将 38 个相同的两参数转发包装合并为代码内固定清单。别名路由、下载分块、安装顺序，以及 sender、host、identity 和能力校验流程不变。方法仍在调用时读取，保留 receiver、Promise 和异常身份。

## 修改文件

- `src/platform/protocol.js`、`src/platform/host/broker.js`
- `scripts/scoped-schema.mjs`、`wxt.config.mjs`
- `tests/environment/scoped-schema.test.mjs`
- `.github/workflows/fixed-entry-optimization.yml`

未修改 `src/sw.js`、侧栏 UI 业务文件、预算、运行世界、Lodash/Day.js 功能或用户权限。优化结果作用于最终产物，而非通过移动或重命名文件绕开统计。

## 等价性与证据

新增测试覆盖所有规则的引用闭包与字节等价、恶意输入的错误码/错误文本、循环/未知引用、导入别名和遮蔽、动态回退、真实 Rollup 删除无用解码器，以及后台转发的调用身份。既有协议、运行时、下载、Controller 和 SDK 错误引用测试继续运行。

专用 CI 对同一次提交的父版本及优化后版本分别执行真实生产构建，按实际文件字节、SHA-256 和完整模块图比较合同中全部固定入口（集成时为 17 个）；优化后另执行开发构建和双包 verify。父版本构建失败仍然报错，不使用 `|| true`。不修改/覆盖历史回执。

CI 的 macOS/CFT 冒烟只证明实际 SW 注册、监听器和重启，不等同于用户 Mac、真实 Sidebar 两入口、完整 F3 或 ZIP 安装验收。浏览器 profile 和进程由原受控测试创建及释放，不使用用户个人 Chrome profile。

状态：源码与定向测试已实施；本提交的 CI 结果须以真实运行记录和 `comparison.json` 为准。优化前后体积不得引用不匹配的历史回执。低于上限不等于达到 10%/20% 储备；剩余风险在实际报告中保留。

## 2026-10-10 已完成的同候选验收

实现提交：`feddfc31122eeca8fb2228830d78bd83ffa0681b`。未修改父版本：`659d28114a594e687478fc21e988919e2e0bddfc`。完整结果见 [固定候选验收 JSON](evidence/fixed-entry-optimization-r2/acceptance.json) 与 [Actions 38055203012](https://github.com/shopable-ai/opendesk-browser/actions/runs/38055203012)。后续主干提交不能自动继承同包原生 PASS，须先核对相关输入及实际产物。

| 产物 | 优化前 B | 优化后 B | 减少 B |
| --- | ---: | ---: | ---: |
| sw.js | 327567 | 323646 | 3921 |
| ui/tool-shell.js | 312411 | 291876 | 20535 |
| native-agent/settings.js | 66551 | 46016 | 20535 |
| scripting/packaged/page-session.js | 59622 | 39087 | 20535 |
| scripting/sandbox/worker-runtime.js | 57315 | 36780 | 20535 |
| native-agent/transport.js | 56581 | 36046 | 20535 |
| framework/sdk-main.js | 49866 | 29331 | 20535 |
| agents/page-relay.js | 35276 | 14741 | 20535 |
| agents/bootstrap.js | 21466 | 931 | 20535 |

全部 17 个固定入口合计减少 **168125 B**。`agents/page-agent.js` 因共享校验引擎参数化增加 76 B，其余七个入口不变；完整表保留在 JSON 中，不隐去负收益项。

协议/构建等价回归 **27/27**，运行时/下载/Controller/SDK 回归 **141/141**，均无失败或跳过；源码检查、父版本生产构建、优化版生产/开发构建及双包 verify 全部通过。

macOS 15 / Chrome for Testing 155.0.8059.39 的真实 SW 注册、五类必要监听器、停止/重新启动及会话保持通过；Mac 生产包与 Linux 测量包的 packageHash 均为 `d9711bb1df939e34da8f4aacdee07edf2e7cddb62019bb66501116809a389bf1`。这是后台冒烟，不是用户 Mac、完整 Sidebar 双入口、ZIP 或 F3 全部验收。

**剩余风险明确保留：** Sidebar 余量 35804 B（10.93%）；SW 余量只有 4034 B（1.23%），尚未达到 10% 储备。本轮确实完成跨入口去冗余，但不能宣称 SW 容量风险彻底关闭。不提高阈值，不通过继续加 unsafe 压缩参数掩盖剩余问题。
