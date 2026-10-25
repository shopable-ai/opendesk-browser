# AI 知识问答与自动回复 R1 · 增量实施记录

日期：2026-10-25
Owner：本对话（GitHub 直连，main 上增量写入）；本地 Codex 负责续接可信 AI 和原生闭环。

## 原始目标及真实操作

在 OpenDesk Browser 独立安装并运行一个简单知识问答工具：添加 10–20 条知识 → 保存并重新打开读回 → 固定问题直接得到来源明确的答案 → 相关问题由 Shared AI Provider 根据候选知识生成可审阅答案 → 后续扩展成经目标网站许可的回复。

本轮在不能执行 Mac Chrome 真实验收的环境中先完成独立工具的业务模型、沙箱 UI / Host Storage 适配，以及安全的可信 AI 消费者适配器契约。不得将业务模型或假 Provider 单测升级为真实 RAG PASS。

## 文件所有权

本轮新增：
- examples/sidebar-tools/ai-knowledge-answers/tool.config.json
- examples/sidebar-tools/ai-knowledge-answers/src/model.js
- examples/sidebar-tools/ai-knowledge-answers/src/index.html
- examples/sidebar-tools/ai-knowledge-answers/src/main.js
- examples/sidebar-tools/ai-knowledge-answers/src/style.css
- examples/sidebar-tools/ai-knowledge-answers/trusted/ai-request.js
- examples/sidebar-tools/ai-knowledge-answers/README.zh-CN.md
- tests/environment/ai-knowledge-answers-r1.test.mjs
- tests/environment/ai-knowledge-answers-provider-contract.test.mjs
- 本文档

本轮不修改已存在的 src/ui/ai/provider-runtime.js、src/ui/conversation/provider-consumer.js、src/ui/sidebar-tools.js、src/ui/tool-shell.js、src/ui/react/main.tsx、official-tools/catalog.json 等共享平台代码；这些改动涉及其他并行 Agent 与不同信任边界，应由续接 owner 在最新 main 审核之后以单一所有者增量完成。

## 已经写入源码与独立检查

- 纯 JavaScript：固定问答、同义别名、限定范围、简单检索、来源验证、格式校验、JSON/CSV 导入与防公式注入导出。
- 沙箱 UI：浏览、编辑、启停、删除及复核、导入预览/策略、JSON 下载请求、CSV 剪贴板复制。
- 复用现有 storage.get({withEtag:true}) / storage.set({ifMatch})，写后再次读回；不能确认写入则阻止重复写入。
- 对未知和非精确问题不伪造 AI 结果；模型改写一律返回 REVIEW_REQUIRED，不能据此自动发送。
- 可信 AI 适配器只接受 Host 提供的会话、真实点击事件、ETag 和已核实数据；调用同一个 conversation.request；模型完成后复验版本与授权，但该适配器目前尚未连接正式 Host 和 React 工作区。
- GitHub V8 快速自查：经典 JS 语法、固定/未知/候选问答、CSV 往返、模型漂移、原始 trusted click 透传及 ETag stale 处理。仅代表有限函数级自检。

## 仍需单一 owner 完成

1. 使用现有官方包 admission 模式，审查 package SHA、安装代际、来源、启用和撤权。
2. 现有 provider runtime 和 business consumer 只新增 knowledge 命名空间及静态专用 instructions；不存在向 iframe 发放通用 Provider 密钥/能力的路径。
3. 接入唯一 React Root 的可信 Send 控件，保证 origin permission.request 在原始 isTrusted 用户手势下触发；预读/定版候选知识，明确用户对向 AI 发送这些数据的授权，发出前再次核验身份，返回后验证 ETag。
4. 真实 Provider 请求 + sourceIds/needsHuman 的闭环，正式用户操作与错误恢复；不要借用 prompt-shortcuts 安装身份。
5. 只在 Node 定向测试、包构建验证通过后晋升唯一正式包，按产品授权把新工具加入官方可发现 Catalog（或显式导入测试）。
6. 目标网站读新消息、草稿、发送、回执和 unknown-outcome 的自动回复另设阶段，不提前触碰现有 Send Queue。

## 结果级别与资源状态

- SOURCE_WRITTEN：是。
- QUICK_V8_SMOKE：已做有限检查；不是正式 Node test。
- NODE_TEST：NOT_TESTED（本轮 GitHub 连接环境不提供仓库本地 Checkout/Node）。
- BUILD/PACKAGE：NOT_TESTED；尚无已晋升的正式 .opendesk-tool.json 包。
- PROVIDER_LIVE：NOT_TESTED（正式可信路径尚未接线）。
- MAC_CHROME_NATIVE：NOT_TESTED。
- REAL_SITE_AUTO_SEND：NOT_TESTED。
- 本轮不占用 Mac Chrome Profile、dist/development、端口、Native 连接和共享工作目录资源。

严格遵守 main-only/no-force/no-PR/no-worktree；远端并行 HEAD 变化不等于本文件的原生验证。继续时只读核对最新 SHA、相关 owner、上述新增文件，避免不同对话重复实现；不要在未验证的状态下标记 95+ 完成交付。
