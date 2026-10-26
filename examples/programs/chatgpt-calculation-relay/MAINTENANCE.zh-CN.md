# 维护与升级

维护范围为本项目官网适配及业务模块。公开 page/Locator、AppStorage 和 Task/RunHost/Authority 由平台维护；不得把官网选择器、提示词或算术规则放入通用 Host。完整参数和返回见 [合同](CONTRACT.zh-CN.md)。

## 官网 DOM 改变

1. 先保存原宿主 requestId/runId/resultId/sourceHash 和业务 runId；查询原日志，不重新 Run 发送。
2. 原文档仍可绑定时，用 `operation:inspect` 只读查看 `selectorDiagnostics`、消息标记、角色、完整消息内容、编辑器、流式状态和完成信号。不要把当前页面全部文本作为回复，也不要输出凭据或 Cookie。
3. 在 `src/site.js` 最小调整已确认的官网结构。沿用单一文档绑定、唯一消息 ID、相邻用户/助手归属和草稿保护；新结构有歧义时拒绝。计算协议修改留在 `src/relay.js`，通用对话行为留在 `src/conversation.js`。
4. 从脱敏 DOM 片段补定向 fixture，覆盖正例和缺失/重复身份、未完成、流式、真实空白草稿。运行本项目 Node 测试；这些不替代官网实测。
5. 新版本通过现有开发入口在独占空白对话验证。保留新源码的实际宿主哈希和网页消息证据，再冻结并审阅升级。已安装旧版本不会因编辑源码自动升级。

当前兼容结构为历史 `data-message-author-role` 等标记和 2026-10-26 观察到的 `data-chatgpt-search-unit-key`、`data-chatgpt-search-message-ids`、`data-talvt-turn-state`；这些不是官网的永久公开 API。未观察到的布局、实验、付费模式、语言、移动端和模型均未承诺兼容。

## 故障分类

| 观察 | 处理 |
| --- | --- |
| `E_RELAY_PARAMS` / `E_PARAMS` | 修正输入；同业务 runId 不能换算式 |
| `E_RELAY_DRAFT` | 用户保留并自行处理草稿/附件/生成；脚本不得清空或发送它们 |
| `E_RELAY_SITE` / `E_RELAY_TURN` / `E_RELAY_TARGET` | 只读定位 DOM 或文档/消息变化；不能放宽身份来获取一个数值 |
| `E_RELAY_REPLY` | 原文非协议、运行标识不符或算术不符；保留原文，不能修成期望结果 |
| `E_RELAY_STORAGE` / `E_RELAY_READBACK` | 保留原记录，排查授权、数据或版本；禁止 clear 来恢复运行 |
| `E_RELAY_PENDING` / `E_RELAY_UNKNOWN` | 查原业务日志与宿主终态；未核清前不发新消息 |
| Stop、期限、失联或浏览器退出 | 视为可能已产生网页效果；先查询原请求，不能自动补发 |
| 登录过期、权限停用/撤销 | 由用户通过原可信入口恢复；恢复授权不代表批准重放未知消息 |
| 安装版本/哈希/installation 竞态 | 重新读取实际安装元数据并审阅更新后的调用；不静默跟随最新版 |
| 运行槽占用 | 等原运行释放；不在父 Task 内嵌套调用同一 RunHost |

宿主“已停止”只代表停止后续执行，不回滚已发消息。Worker 可能在 catch 落账前终止，日志中的 `running` 仅是最后记录；不要把它当作当前存活证明。

## unknown 恢复

先查 `status`，再查宿主原请求、原运行和实际资源退役。`request.get` 查入场请求的持久回执，`run.get` 查同一 Host 所有权下的运行；Native 新 registration 不能接管旧运行。浏览器重启后，使用「我的」持久历史，以及同一已安装 taskId 的只读 `status` 查询原 journal。

只有原未知步骤还可绑定相同 documentId、原提示词/用户消息/唯一助手完成均可核验时，用户才能明确选择 `reconcile`，传入原 runId 与全部原算式参数。它不重发原步骤。若重启/导航使文档身份丢失，不允许把相同 URL 当作旧文档；保留 unknown 并人工核查，不自动发送 B。

不要删除 active 指针、换任务身份、换业务 runId 或恢复旧代码来绕过未知请求。没有可靠发送证据的记录不得自动改为 completed/未发送。

## 固定构建与安全升级

项目无第三方运行时依赖，无 CDN、npm 动态加载或凭据文件；项目 package-lock 固定空依赖图。构建器及 webpack/terser 版本由仓库根 package.json/package-lock 固定，构建记录应另记根锁 SHA。构建必须在使用该根锁安装的现有 Node 工具链运行；普通安装版执行不需要这些构建工具。

```sh
node scripts/validate-program-project.mjs examples/programs/chatgpt-calculation-relay
node --test examples/programs/chatgpt-calculation-relay/tests/*.test.mjs
node scripts/build-program-project.mjs examples/programs/chatgpt-calculation-relay --mode production --out examples/programs/chatgpt-calculation-relay/release/0.2.0
```

从仓库根运行。原构建器对已有不同产物拒绝覆盖；后续版本先更新 package/package-lock 版本，用新 release 目录，保留旧版本和证据。此处 `production` 是 Program 编译模式，不代表浏览器扩展 production 包已经验收。

升级保持同一已安装 taskId，提交新的固定版本、参数合同、权限、期限和哈希，通过原候选验证及用户安装审阅。已有任务 ID 由真实安装回执确定；不要把本地保存生成的 `local-*` 与可移植包 ID 混用。升级改变 generation/installation pin，旧调用应拒绝，调用者明确选取新版本。日志跨版本保留；不兼容格式须先设计可回退迁移，不在本轮自动迁移旧草稿 journal。

## 数据保留

日志含发送提示词、助手原文、算式、对话 URL/消息 ID 和时间，保存在当前浏览器配置的可信本地存储；不读取 Cookie。运行结果另由现有 RunHost 保存。停止、停用或普通版本升级不主动删除本项目 journal。

撤销安装后脚本失去读取其存储的权限；重新安装、扩展卸载、清浏览器数据和浏览器自身清理可能影响可访问性/数据存续，未验证则不得承诺永久保存。需要清理时先确认无未知副作用并按现有存储管理合同处理；不新增脚本“强制重置”开关，不在未知状态调用 AppStorage.clear。
