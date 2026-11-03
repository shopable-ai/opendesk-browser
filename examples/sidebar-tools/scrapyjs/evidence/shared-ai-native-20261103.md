# 当前共享 AI 源码原生核心测试（1.8.18）

2026-11-03，北京时间。范围为持续开发环境中的当前核心流程，非 production 验收。测试 owner：`01a19db8-5d8b-7271-be3a-074fa46cd747`。

## 用户可见结果

| 原生操作 | 实际结果 |
| --- | --- |
| AI 设置 → 修改未保存的 Provider 表单 → 取消 → 重开 | 聊天草稿保留；已保存的本机 Codex 来源不变；临时 HTTPS 模型草稿被丢弃；即时连接开关未操作 |
| “解释当前配置，不要修改、保存或采集。” | 真实本机 AI 正常解释；完整配置 JSON 与基线相同 |
| “把 title 的 CSV 表头改成书名” | 只改 `output.fieldNames.title`：`图书名称` → `书名`；原表单、JSON 和表格预览同步 |
| 连续发送“把最大页数设为 3” | 只改 `maxPages`：`1` → `3`；前一轮表头保留 |
| “把表头改一下” | 真实回答要求明确字段与名称；配置不变，输入保留可编辑 |
| 原发送审阅 → 点击取消 | `E_CANCELLED`；输入和配置保留，未确认该次 Provider 发送 |
| 原“保存配置” → 关闭工具 → 重开 | 两轮分别使用原保存按钮；重新打开后完整 JSON 等于上述两项差异的期望值 |
| 书签 AI → 同一设置 → 取消 → 收起/展开 → 跨工具返回 | 使用同一保存设置；书签自己的未发送草稿保留，未出现在 ScrapyJS；新 ScrapyJS 实例没有借用书签消息或草稿 |

测试使用原配置的副本 **`共享AI验证-20261103`**，由原配置库“复制为新配置”创建。原 `Chat-20261102` 在最后重新选择并核对完整 JSON，保持不变。现场保留测试副本供复查；没有采集、导出或修改书签数据。最后清除的只有本轮自行输入的书签标记；退出 ScrapyJS 时只丢弃了本轮已取消的聊天输入，保存的业务配置保留。

设置返回、明确修改、澄清、取消和重新打开的所记录 ScrapyJS 状态，Dock 均为 276。**历史高度收缩未复现，根因未知；未宣称已修复。** 本轮没有发现需要追加修改 Chat/业务源码的缺陷，没有为制造修复改动源码。

## 同一候选与实际入口

- 仓库：`main`，HEAD `24fa6344cea4cc21425967995f50f30cbc453d73`，保留接管时所有未提交及并行改动。
- 原 CFT：`/Applications/Google Chrome.app`，149.0.7827.55，原进程 PID 18442、原 Default Profile。
- 实际启用扩展：`ccfcjegpkdlgbclopjmadlcjedelidmf`，加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。扩展详情原生 UI 已核对路径和 ID。
- Browser Debug revision：`4cfe7704a93854bd2289aa8363cb503852b9778476119b62eba6b0eb9c5cfae0`。启动时取得 serve 已连接现场；后续服务退出情况见下节，不将全程描述为在线持续开发。
- 原 Native manifest `allowed_origins` 与上述 ID 一致；原 instance `scrapyjs-react-01a186cc` 的只读 doctor 返回 `connected:true`、`nativeConnected:true` 及相同 ID。没有改配对、凭据或模型路由。
- 唯一正式包：[scrapyjs.opendesk-tool.json](../scrapyjs.opendesk-tool.json)，版本 **1.8.18**，SHA-256 **`b26cfafc2575acd8f8404250c35cce64f42cb5d343d4e7ff60b24dce7cb43f1e`**；工具 buildId `a1138e5a8ba890a041d48be5380ef616121e80f6c221d3a44f79578210f3510a`。
- 原构建器编译 → 原 `app:update` 候选/8项包与安全检查/晋升 → `--check-project` 同源核对。原可信导入审阅核对同 ID、1.8.17 → 1.8.18、相同权限与上述 SHA 后原位更新，数据保留；没有卸载或增加启用步骤。打包命令的 `installed:false` 不查询 Chrome，实际安装证据来自可信审阅及更新后的产品 UI。
- 自动版本递增首次因配置包含多个 `version` 字段返回 `E_APP_CONFIG: cannot safely replace exactly one declared version`，未覆盖正式包。只显式调整顶层版本后重走原构建与晋升成功；打包脚本的该限制未修复。本轮仅写入版本与同源生成包，没有追加业务行为变更。

11项已评审源码与上一轮指纹一致（manifest SHA `211f691d2bedb24fa16d72466e1240fe3cf6ae60afe72a83fca8caf6d658adc1`），因此复用其定向控制验证，没有重复完整测试。原报告的 113/113 共享核心、69/69 ScrapyJS、4/4 设置/生命周期及相关来源检查只证明各自测试范围。本轮新增的是上述真实 AI 和原生操作，以及包门禁 8/8、原生记录的16项核对；这些不能相加成完整验收覆盖率。

## 开发服务生命周期与剩余限制

接管时没有本仓库 watcher 或 43119/43120 监听；旧 Debug 的连接文字按缓存处理。本轮以原 `npm run dev` 启动 PID 69800，写入原 `dist/development`，取得新 revision 的真实已连接状态，未强制重载或重装扩展。

收尾发现该进程退出 134；日志在启动约 613 秒时记录约 4GB Node 堆耗尽（`Ineffective mark-compacts near heap limit`）。退出之后产品仍使用同一目录已编译字节完成其余操作；业务原生结果有效，**不作为全程 serve 在线证据**。没有证据将 OOM 归因于 Chat，亦未声称解决内存根因。

确认原进程已退出且端口空闲后，仅为本轮服务使用临时环境变量 `NODE_OPTIONS=--max-old-space-size=8192 npm run dev` 恢复，日志为 `browser-dev-recovery.log`。PID 79227 已重新报告 RUNNING 并监听原 43119/43120，revision 和三个关键 Browser 文件字节与测试候选相同。该参数未写入仓库或用户全局配置，属于临时恢复，长期稳定性未验证。恢复后的浏览器端连接**尚未原生复查**：本轮已释放桌面租约，重新申请时另一任务持有桌面，因此未抢占 UI、未刷新其窗口。

本轮原生 UI 租约已释放；没有关闭原 CFT 或其他 Profile，也没有停止其他任务服务。恢复的本轮 watcher 保留运行，最终进程/端口快照见 lifecycle receipt；文档中的 PID 是当时观察值，不保证未来仍存活。

## 原始证据与未测项

[机器汇总](../../../../artifacts/scrapyjs/shared-ai-native-20261103/native-summary.json) · [候选字节/编译回执](../../../../artifacts/scrapyjs/shared-ai-native-20261103/candidate-identity.json) · [服务与租约收尾](../../../../artifacts/scrapyjs/shared-ai-native-20261103/lifecycle-receipt.json)。这些在仓库忽略的本地产物中，不代替正式源码或安装包。

- 配置：[基线](../../../../artifacts/scrapyjs/shared-ai-native-20261103/original-config.json)、[只读后](../../../../artifacts/scrapyjs/shared-ai-native-20261103/readonly-config.json)、[表头后](../../../../artifacts/scrapyjs/shared-ai-native-20261103/header-config.json)、[第二轮后](../../../../artifacts/scrapyjs/shared-ai-native-20261103/maxpages-config.json)、[重新打开回读](../../../../artifacts/scrapyjs/shared-ai-native-20261103/reopened-config.json)。逐份比较完整对象，而非仅检查单个路径。
- 正常窗口：[原表单书名](../../../../artifacts/scrapyjs/shared-ai-native-20261103/header-form-expanded.png)、[连续分页修改](../../../../artifacts/scrapyjs/shared-ai-native-20261103/maxpages-window.png)、[澄清](../../../../artifacts/scrapyjs/shared-ai-native-20261103/clarify-result.png)、[原生发送取消](../../../../artifacts/scrapyjs/shared-ai-native-20261103/explicit-cancel-result.png)、[保存重开](../../../../artifacts/scrapyjs/shared-ai-native-20261103/reopened-config.png)、[书签设置返回](../../../../artifacts/scrapyjs/shared-ai-native-20261103/bookmarks-settings-return.png)。同目录 AX 记录保留各步骤与请求 ID。

**NOT_TESTED / 延期**：production、完整布局/控制台矩阵、本机连接开关变更、HTTPS 设置保存与真实 HTTPS 推理、原生 unknown/迟到回包故障注入、页面依赖选择器应用、采集/导出、云端/代理/外部 MCP。Cookie AI 不在范围。原生停止运行中 Provider、来源切换和撤权没有由本轮场景证明；相关既有 fixture 证据不升级为原生 PASS。

两位上一轮独立 AI 的 100/100 是方案/源码复评，**本轮实现独立评分为 NOT_SCORED**。没有运行全量矩阵或新建总 GOAL，没有提交、推送、新分支、worktree 或 PR。
