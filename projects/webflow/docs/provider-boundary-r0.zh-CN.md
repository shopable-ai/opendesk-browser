# WebFlow Provider R0 · 单一解析器、保留兼容入口

任务：`OD-WEBFLOW-PROVIDER-BOUNDARY-REFACTOR-R0`；原始目标：以后新增 Claude/Gemini/Grok/DeepSeek 等 Provider 时，通用协议、Task、Host、Runner、Authority、Ledger 不复制。R0 **仅做定向职责提取**，不完成 R2 A→B→A。

## 源码逐项审计（原职责 → 消费者 → 决定）

| 文件 | 职责与真实消费者 | 分类、改名及影响 |
|---|---|---|
| `src/native-agent/chatgpt-task-request.js` | ChatGPT V1 请求和安装验证，混有 WebFlow V1/V2 意图；Host、Trigger、Background、历史测试使用 | 混合。通用意图提取到 `projects/webflow/src/task-intent-contract.js`；保留原 V1 实现及兼容 re-export，所有历史消费仍可运行，不批量改名 |
| `src/page-events/generic-task-adapter.js` | 网页通用候选监听，由 content-runtime/普通站点消费 | 通用。直接引用新解析器，无 ChatGPT import；不授予运行权 |
| `src/native-agent/webflow-v2-target.js` | 已安装固定 Task 的 V2 目标与参数校验，由 Background 等消费 | 通用。协议常量直接引用新文件，固定入口及可信 pin 不变 |
| `src/native-agent/webflow-v2-entry.js` | 百度/Google/ChatGPT 审核入口，ChatGPT PREPARE-only 约束 | 混合但边界清楚。不移动，保留拒绝 SUBMIT |
| `src/native-agent/chatgpt-bridge-trigger-gate.js` | ChatGPT 来源和 Ledger/授权栅栏，由 Host、Background 消费 | ChatGPT 专用 + 通用候选。暂不拆；Ledger Key、授权、UNKNOWN 风险高且 R2 活跃 |
| `src/native-agent/chatgpt-fixed-bridge-host.js` | ChatGPT 可信 Host、安装任务执行与结果核对，Side Panel 消费 | 混合。暂不动，避免重建 Host 或修改授权 |
| `src/native-agent/chatgpt-background-adapter.js` | ChatGPT 后台 Bridge 接线、V1/V2 入站和现有任务调度 | ChatGPT 入口，兼容读取唯一解析器，暂无多 Provider 通用化的真实消费者 |
| `src/native-agent/chatgpt-execution-page.js` | Controller target 校验、激活和返回标签，由 ChatGPT Host 消费 | 部分通用。保留旧名称与导出；待出现跨 Provider 消费再提取，不整文件重命名 |
| `projects/webflow/trusted/chatgpt-bridge-page.js` / `src/native-agent/chatgpt-fixed-bridge-page.js` | ChatGPT 官方网页 DOM 桥及固定内容脚本/构建入口 | 真正 Provider 专用/固定资源。保留原文件、bundle 来源 SHA、Manifest 路径 |
| `src/page-events/web-task-contract.js` | 通用 Web Task 协议及现有 ChatGPT site profile，由 Site Registry/Host 消费 | 混合但已有协议生效；本轮不移动/更改来源权限 |
| `src/page-events/site-catalog.js` | 通用站点注册表，Web Task 消费 | 通用，当前名称正确，无需移动 |
| `projects/webflow/trusted/CurrentTask.tsx` | WebFlow 可信任务状态展示、通知，由固定编译/Side Panel 消费 | WebFlow 通用 UI，现名正确，保护精确打包 SHA |
| `projects/webflow/src/chat-handoff-contract.js` | 历史 ChatGPT A/B v2 交接合同，受信桥与测试消费 | 历史合同不搬动、不放宽为多 Provider |

## 不可变合同

- V1 五字段、V2 四字段；协议字符串、候选 token、URL/args 约束、错误码、重复字段拒绝、冻结输出保持原样。
- 新模块只实现结构解析；旧 ChatGPT 导出是**同一函数的再导出**，不是第二份解析实现。ChatGPT 旧 V1 请求与安装快照校验保持原位置、原执行语义。
- 不改 V2 已审入口与 PIN/Schema，`phase=submit` 仍必须经独立可信批准；不改变 ChatGPT 0.1/0.2/0.3 Task 源码、Manifest、版本/哈希、授权、UNKNOWN 不重放。
- 不变更原 WXT content-script 输出路径、Ledger Key、Bridge 协议、Controller retained/borrowed。新增解析器必须经 `scripts/bundle-provenance.mjs` 原固定资源审计：pin Git Blob `50a7ec4bd3d8707ba53724efdc378cd98c2404d6`，严格只允许 `sw.js`、`ui/tool-shell.js`、`agents/web-task-content.js` 三个既有固定输出，不放开 ChatGPT 官方页面脚本或其他 Bundle。新增精确目标/改源后不能跳过重审。
- 增加 provenance 定向测试：原三个输出接受相同审阅源；未授权输出、SHA 漂移和符号链接全部失败关闭。
- CI 新增这次代码的 paths、独立 Node 兼容/安全测试及构建后 `verify-package`。任何 CI PASS 只能绑定当前提交 SHA；未取得回执之前 NODE/PACKAGE 保持 NOT_TESTED。

## 下一阶段

原 `OD-WEBFLOW-AI-RELAY-CHATGPT-FIRST-R2` 的 `APPROVE_SEND → borrowed SUBMIT → B 完整回复 → A 一次性交付` 仍未在本任务实现，也不能从 R0 测试推导为完成。真实 Chrome/Native/账号与后台工作流需独立验收。
