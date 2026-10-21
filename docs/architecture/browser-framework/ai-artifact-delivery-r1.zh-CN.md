# AI 工作产物交付 R1：正式源码归属和技术门禁

- 审计日期：2026-10-21；读取 main SHA `ebc414140f6dceffd3b38608f6c3c21d561ebc95`。
- 状态：**SOURCE_AUDITED / IMPLEMENTATION_NOT_APPROVED / CHROME_NOT_TESTED**。
- 产品方案：[AI 工作产物交付 R1.1](../../product/browser-extension-ecosystem/ai-artifact-delivery-r1.zh-CN.md)；工作记录：[workstream](../../framework/workstreams/ai-artifact-delivery-r1-20261020.md)。
- 规则：不新增第二 Host、SDK、图片二进制写盘协议、独立素材数据库或第二套 UI 状态机。正式业务源码变更须等待用户确认同源预览。

## 1. 唯一职责与现状

| 模块及真实 owner | 已审计入口 | 复用结论 |
| --- | --- | --- |
| Prompt Shortcuts：提示词保存、快捷插入 | `examples/sidebar-tools/prompt-shortcuts/` | **REUSABLE_WITH_CHANGE**；仅允许可选人工关联提示词 ID，不侵入其现有编辑/插入业务 |
| Knowledge Inbox：记录、查询、标签、来源、Markdown 编辑 | `examples/sidebar-tools/knowledge-inbox/src/index.html`、`style.css`、`main.js` | **IMPLEMENTED** 既有文本功能；图片交付记录 **REUSABLE_WITH_CHANGE**，须使用同一 record model 与持久化锁 |
| ChatGPT 页面按钮：回答保存、Markdown、图片下载 | `src/knowledge/page.js` | **IMPLEMENTED**：现有图片菜单调用 `capture.image`；新增图片旁 SKU 入口 **NOT_IMPLEMENTED** |
| Knowledge trusted storage / 受控 RPC | `src/knowledge/model.js`、`service.js`、`policy.js` | **IMPLEMENTED** 现有手工记录和回答记录；新图片结构化字段与下载生命周期 **REUSABLE_WITH_CHANGE**，不可额外开同义 store |
| Web Markdown Clipper：通用网页内容 | `examples/sidebar-tools/web-markdown-clipper/` | **IMPLEMENTED** 现有独立职责；**NOT_IMPLEMENTED** 图片交付并且不应由它承担 |
| Browser SDK 公共导出与 Host | `src/framework/sdk/browser-contract.js`、`browser.js`、`src/platform/chrome/browser-downloads.js` | **IMPLEMENTED**：download/getOwned/listOwned/cancelOwned；不需要第二次发明下载引擎 |
| Controller export jobs（另一已有责任域） | `src/platform/downloads/index.js` | **IMPLEMENTED** 既有 export receipts 状态机，**不等于** Knowledge 图片下载已集成；避免混为一谈 |
| 授权本地 Workspace | `src/knowledge/workspace-handoff.js`、`src/native-agent/file-workspace-service.js` | **IMPLEMENTED** 文本 Markdown handoff 和受控文本文件读写；任意二进制图片直接写入 **NOT_IMPLEMENTED** |

## 2. 必须独立判断的八项门禁

| 门禁 | 可直接核查的代码事实 | 状态与最低下一步 |
| --- | --- | --- |
| 1. 真实完成而非启动 | `browser-downloads.js` 下载返回 `{downloadRef,status:'started'}`，`getOwned` 查询 `in_progress/complete/interrupted`；而 `knowledge/service.js` 的 `capture.image` 仅回 `downloadId` | **REUSABLE_WITH_CHANGE**：图片交付改用已验证 Scoped SDK 或同一 Trusted Host 状态能力，`complete` 后才标成功；**NOT_TESTED** 真实下载 |
| 2. 原图、缩略图、短期 URL | `page.js` 采用 `image.currentSrc||image.src`，筛选可见图；`service.js` 仅按受限 hostname/HTTPS 校验，未证明拿到原图，且正文 HTML 不保存图像字节 | **NOT_IMPLEMENTED**：只在可证实原图的受控 DOM/下载链路支持 SKU 保存，任何不确定显示「来源无法核实」而非猜测 |
| 3. 安全命名与 MIME | Browser SDK 和 Host 限定相对安全路径，拒绝 `..`、隐藏路径、控制字符；Knowledge 的 `knowledgeFilename` 仅构造 `.md` | **REUSABLE_WITH_CHANGE**：规范 `SKU-角色-编号.真实扩展名`，不允许 WebP/JPEG 重命名成 PNG；需来源与文件类型可信检测，无法确定则拒绝 |
| 4. 中断/结果未知/幂等 | `getOwned` 能区分中断，Host 的 downloadRef 是 Worker 内存记录、最长 24h，重启丢失；`download()` 可返回 `E_OUTCOME_UNKNOWN` | **REUSABLE_WITH_CHANGE**：持久图片交付状态机、幂等业务键、重开读回；不知道下载效果时不能直接自动重试，提供核对 Chrome 下载入口 |
| 5. 跨工具可信交接 | `knowledge.workspace` 将 Markdown 放入 `storage.session`，跳到本地工作区导入；`workspace-handoff.js` 核验包 hash/epoch/文件名/sha256 | **IMPLEMENTED** 文本交接；图片资产跨工具数据路径 **NOT_IMPLEMENTED**，MVP 不开发；要证明现有可信 sender 才能做 |
| 6. 提示词真实性 | `page.js` 的捕获尝试关联上一条 user 消息（对回答可用），不能证明这是图片实际生成提示词，且长度截断 | **NOT_IMPLEMENTED**：关联默认「未关联」；来源经明确确认后仅保存精简的非敏感说明/标识，不能伪称系统级 provenance |
| 7. SKU、来源、结果状态持久化 | `model.js` 统一 knowledge store `version:1`、`records`；手工记录无结构化图片/下载回执字段；`service.js` 使用共享锁和 verified write | **REUSABLE_WITH_CHANGE**：在既有 record schema 增**可选兼容字段**（如 `delivery`），按业务幂等键去重，原 record 不迁移破坏；镜像到搜索与详情，不另建数据账本 |
| 8. 来源、安装与撤权 | `policy.js` 仅允许 chatgpt.com/chat.openai.com；`service.js` 核实 sender/document/安装包、站点授权、grant epoch；`page.js` 处理页面撤权和生命周期 | **REUSABLE_WITH_CHANGE**：新增图片旁交互必须复用此判断、拒绝未授权 URL，安装包更新维持原工具 ID、数据及授权边界。真实升级 **NOT_TESTED** |

额外约束：本工具 `KNOWLEDGE_LIMITS` 为 200 records、单条 150,000 字节、总计 4 MiB；**不在知识 JSON 内塞图片 base64**。若业务文件已经保存到 Chrome 下载目录，Knowledge 仅索引元数据和有限可查信息；绝不宣称能永久恢复删除/搬走的磁盘文件。浏览器下载记录不是持久可靠素材库。

## 3. 可靠状态机（正式阶段必须实现）

```text
USER_CLICK (可信、已授权的当前图)
  -> SOURCE_PROBED (原图等级/MIME/权限/URL有效性)
     -> BLOCKED_SOURCE / BLOCKED_FORMAT -> 可解释错误，不静默降质
  -> DRAFT_VALIDATED (SKU/类型/编号/安全文件名)
  -> DELIVERY_INTENT_RECORDED (幂等键 + 源 fingerprint + 初始状态)
  -> DOWNLOAD_REQUESTED
     -> IN_PROGRESS
     -> COMPLETED (getOwned=complete + 交付记录读回) -> SUCCESS
     -> INTERRUPTED -> RETRYABLE_AFTER_RECONCILE
     -> OUTCOME_UNKNOWN -> MANUAL_CHROME_CHECK (禁止自动二次下载)
     -> REVOKED -> STOP (保留可安全显示的失败/未知状态)
```

注：`getOwned=complete` 是 Chrome 下载管理器状态，不等于未来随时能读到具体磁盘文件/最终用户保存路径；若需真文件再次打开必须另行授权并读回。本轮没有实现该状态机，预览仅以模拟 Host 复现交互。

幂等键建议：`sourceConversationRef + imageFingerprint + normalizedSku + role + sequence`，其中无法可靠获得的字段不能发明。重复点击先查既有状态，若下载正在进行则复用结果；`OUTCOME_UNKNOWN` 必须走查证/人工继续。文档和交付记录不得包含未经用户确认的全部聊天内容、会话凭证、Cookie、任意远端请求地址。

## 4. R1.2 正式源码**最小**归属（须先通过预览确认）

1. **`src/knowledge/page.js`**：现有固定 ChatGPT 捕获入口旁的非遮挡保存图片按钮；仅作用于已加载、非流式、可验证来源图，动态 DOM 变化和 SPA 导航后保持可恢复。
2. **`src/knowledge/policy.js`**：新增经审核的图片交付操作白名单、来源及字段限制；保持旧 `capture.*` 原义；拒绝沙箱直接取 Chrome 权限。
3. **`src/knowledge/model.js`**：既有 knowledge record 可选 `delivery` 元数据（schema/version 检查、上限、迁移、按 SKU 查询、去重、更新 revision），旧知识记录保持兼容，不另开 storage key。
4. **`src/knowledge/service.js`**：单一受控 Host 内：校验 sender、安装/撤权、提交文件 intent、调用既有下载能力、状态核对、持久化结果；下载和写入先后顺序明确，不把 `started` 写成成功。
5. **`examples/sidebar-tools/knowledge-inbox/src/index.html` / `style.css` / `main.js`**：扩展正式已有完整 UI，增加必要 SKU 元信息显示/编辑/筛选或恢复入口，现有列表、Markdown、搜索、删除、焦点和未保存保护零退化。首版继续 HTML/JS，不引入 React。
6. **`tests/` 下已有 knowledge / scoped download 对应测试**：补合同和真实场景定向测试；不创建重复 SDK。
7. **`examples/sidebar-tools/knowledge-inbox/tool.config.json` 与唯一正式包**：只有在正式代码修改、对应版本/打包验证通过后按现行发布机制晋升，不能仅修改 MOCK 就升级正式包。

明确默认**不修改**：`src/native-agent/file-workspace-service.js`、`src/platform/downloads/index.js`、Prompt Shortcuts、Web Markdown Clipper、通用 Host router。若 R1.2 证实 SDK 状态无法满足一致性，需要单独报告可复现缺口与权限风险后方可建议最小框架改动。

## 5. 验证矩阵和可阻断条件

| 真实测试 | 必须观察到 | 本轮 |
| --- | --- | --- |
| Knowledge Inbox 原列表、搜索/标签、手工新建/编辑/删除、Markdown/备份、Source/Workspace/未保存保护 | 原 UI、原正式 `main.js` 无退化；预览 Host 仅 MOCK | **MOCK_PASS 待执行、Chrome NOT_TESTED** |
| 320/360/400/440、宽屏、深浅主题、200% 缩放、键盘、ARIA、消息可访问性 | 无遮挡、弹层焦点恢复、长 SKU 不溢出 | **NOT_TESTED**，提供预览切换 |
| 图片 URL 失效、仅缩略图、MIME 不明、受限链接、标签过长、目录穿越 | 明确拒绝，不假成功 | **NOT_TESTED** |
| 下载 Started → Complete/Interrupted/Unknown、Worker 重启、撤权、重复操作 | 成功必须读回；Unknown 不盲重试；无重复资产记录 | **NOT_TESTED** |
| Mac 原生 Chrome、真实 ChatGPT 出图、包升级、下载目录、Native 文件 | 人工可追溯截图/下载文件/重新打开 | **NOT_TESTED**，等待后续 Codex |

安全问题、图片格式不确定、沙箱越权、没有可重读的回执任何一项失败即停止上线；不能用专家平均分绕过安全门禁。
