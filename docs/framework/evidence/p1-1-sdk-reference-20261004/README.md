# P1.1：SDK 原请求追溯职责收敛（独立分支候选）

## 本轮实际范围

基线：`feae947190c843b3161c2ac75a2274a76684c606`。
分支：`codex/p1-1-sdk-reference-authority-20261004`。

用户本轮明确授权直接推进，并允许新分支。远端 `public-owner.json` 仍登记另一会话为主线写入者。本交付只形成隔离的候选分支，不修改 main、owner、迁移账本或 F3 状态；不声称已完成串行交接，合并前必须重新取得对应交接。没有创建新项目、第二运行器或新公共协议，也没有访问用户 Mac 路径。

读取根及 src、src/platform、src/platform/host、tests、tests/framework、docs、docs/framework、docs/framework/evidence 下的 AGENTS.md 均返回 404；未取得本地父级或未提交规则，不能宣称本地规则不存在。

## 改了什么

- `src/platform/host/sdk-methods.js`：增加内部 `lookupSdkInvocation(payload, sender)`，持有原生 Hello、grant/request/operation 查询、原请求摘要匹配与公共引用投影。
- `src/platform/host/broker.js`：`createSdkRequestHandler` 只委托上述内部查询；不再消费 storage/session 来解释 SDK 持久键，调用点一并调整。
- `tests/framework/k2-sdk-reference-authority.test.mjs`：新增聚焦回归，仍使用 Node 自带测试框架。未修改原有 B05 runner 或其预期。

新增查询不进入 SDK registry，也不增加 runtime route。查询只使用 readonly commandJournal 事务，不创建 run、operation、grant、结果，不调用 admitSdk 或驱动，不更新 deadline。

## 明确保留的行为

保留真实 sender/document、原 grant incarnation、browser session、requestId、规范化参数/codec/摘要、dispatched/effect_unknown 状态范围及原错误对象；查询不可用时仍返回原错误。固定版本、pin/slot、取消屏障、执行后端、HTTP 权限和下载生命周期均不修改。

原 deadline 是摘要的一部分，不是此次只读查找的新执行期限；正常准入仍拒绝过期执行。

改前/改后表征发现一个细节：匹配到残缺 operation、公共投影无法形成时，原代码会赋值 `error.invocation = undefined`，而不是没有该属性。候选通过 `{invocation}` 查询结果封装保留此语义，完整记录不返回路由层。没有用放宽断言掩盖该差异。

本项是职责迁移，不顺带宣称解决原有 Hello 与后续事务之间的全部竞态，也不扩大任何授权规则。

## 实际验证和限制

精确文件字节与 hash、结果见 `verification.json`；隔离检查原始输出见 `isolated-unit.tap`。

Linux / Node v22.16.0：三个交付代码文件语法检查通过；64 项隔离单元检查通过；同一组 53 项 handler 表征在原源码与候选上均通过。最初表征有 1 项 own-undefined 差异，已修正后重跑。

**这不是完整仓库回归通过。** 容器无法直连 GitHub 拉取完整 checkout。该次隔离执行加载了完整 sdkMethods、原 registry/codec、精确 handler 函数及其使用的真实 protocol/environment helper 源码片段；浏览器 API 和存储为测试替身。没有执行 broker 启动依赖图、原生 IDB、真实扩展 sender、打包或 Mac/Chrome。64 项结果不能登记为 B05、四服务、控制轮或 F3 PASS。

正式测试文件不需要该容器隔离 loader；完整 checkout 中按以下命令验收：

```bash
node --test tests/framework/k2-sdk-reference-authority.test.mjs tests/framework/k2-sdk-broker.test.mjs
node --check src/platform/host/broker.js
node --check src/platform/host/sdk-methods.js
```

本轮没有声称上述完整 checkout 回归命令已运行。

## 本地 Codex 接续

先读适用 AGENTS.md，记录工作区 HEAD/分支/status/相关 diff，读取最新 public-owner 和交接。不要覆盖原工作区；使用该远端分支的独立 worktree 做检查。发现本地已有未提交或主线并发修改时保留它们。

本次接续仅验收 P1.1，不自动执行后续跨域授权。运行上面的新测试与已有 SDK broker 回归；检查 authority 组合确实暴露内部委托，broker 没有新增公共 route。记录实际命令、环境、候选 SHA、失败和未验证项，不用组件结果冒充 Chrome 原生结果。

未完成主线串行交接不合并，不改 owner；没有受控浏览器窗口/验收授权时不启动浏览器。若需要修复，只提交本分支相关最小修复，不扩大到数据库、状态机、HTTP 授权或整个 UI。

## 回退与下一项

本提交未改变 schema、持久键、grant 数据和执行语义。合并前可保持候选未合并；若后续合并后需回退，应把 broker/sdk-methods 的本项修改成对回退，不只回退其中之一。

下一项为 P1.2：来源 document 与目标 origin 分开授权，覆盖目标撤权、授权代次、重新授权不复活旧请求，再接工具授权 UI。当前分支**没有实现完整跨域 HTTP 闭环**。普通 JS、DOM 适配、资源兼容与恢复 UI 继续按原计划分轮推进。
