# ScrapyJS 1.8.16：空白配置与简化 Chat

本轮完成范围是核心开发：新配置从空白开始；共享 Chat 保留消息、输入、发送/停止和开合；明确配置编辑自动同步原模型。保存、采集/停止、结果和下载仍在原业务界面。未恢复完整验收、独立评分、production 或采集超时调查。

## 源码与安装包

- 唯一 owner：`examples/sidebar-tools/scrapyjs/`；现有 `main`，无新分支、worktree 或 PR。
- `app-model.js` 以 `EMPTY_CONFIG` 初始化及新建，允许未完成草稿逐步编辑；保存、运行及 AI 应用继续完整校验。`DEFAULT_CONFIG` 仅为历史测试 fixture 导出，生产初始化不再使用。
- `AiPanel.jsx` 复用公共 Dock/Frame/session。删除本地撤销、技术审阅、资料/诊断、重复业务操作与保存提示状态；保留原请求 CAS、未知结果恢复、取消、Provider 代际、配置/页面身份与迟到返回保护。
- AI 配置经原 `business.config.propose/apply` 一次更新同一个 App；原表单、规则和 JSON 继续读取 `app.state.config`。仅解释、无差异、非法结果、取消与身份变化不写入。
- 唯一正式包 `scrapyjs.opendesk-tool.json`：**1.8.16**，**1,341,055 字节**，SHA-256 `38c34306de0eaf82a6d7d5471b5a4da51745f341dd06f5924da68bec2a91140d`。权限与固定 Controller/Task pin 未变化。
- 原工具 Vite 编译 → 原打包器 `--out artifacts/sidebar-tools/scrapyjs/candidate.opendesk-tool.json` → 定向包门禁 → `--promote-from` → `--check-project`，最终 `PROJECT_PACKAGE_MATCH`。打包器输出中的 `installed:false` 只表示该 CLI 不执行安装；实际安装证据如下。

## 本轮实际操作

- 持续开发 Browser：`dist/development`；Chrome 实际 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。调试页读到「开发服务已连接」，revision `37fa5a6cc912f1afcb1c96b270d8bec2ea00c490768ca07e3cf792f2eaadf9a7`。既有 watcher 与 Native 保留，未重建或重载 Browser。
- CFT **149.0.7827.55**，原 Native 实例 `scrapyjs-react-01a186cc`。实际页面为豆瓣图书编程标签页。经原「扩展 → 导入扩展」更新 **1.8.15 → 1.8.16**，可信审阅显示「权限未变化」「原有应用数据保留」；打开及重开均读回 1.8.16。
- 升级前用原配置库将未保存草稿保存为独立副本，实际名称 **`Chat-20261102`**。升级后 11 份保存配置仍列出，原 `共享Chat验收-20261102` 保留；未覆盖原记录。
- 实际点击「新建配置」：目标输入为空、0 字段，保存与开始采集禁用；Chat 默认没有撤销、应用差异或业务按钮。页面标题仅表示当前网页，不被填成配置网址。
- 本机普通问答请求 `d5cd46cf-6518-4531-ac3d-e2ddcd7a8d7e`，经原可信发送审阅返回「我可以帮你理解采集规则、梳理字段和提出配置建议，本次仅聊天，不修改配置、不采集也不保存。」空白配置保持。
- 切回独立副本后，请求 `35ee1601-2f8e-4a15-a294-dff73b5ca274` 明确要求只把 CSV `title` 表头改为「图书名称」。返回后仅显示「已更新配置草稿。」原 CSV 表单立即显示该值，五个字段及选择器保持。
- 点击原「保存配置」，随后退出并重开工具：配置已保存，JSON 的 `output.fieldNames.title` 为「图书名称」；字段顺序、列表范围、validation、processing、网址和等待选择器保留。没有通过 Chat 保存、启动采集或下载。
- Chat 收起再展开时两轮消息及业务配置保留；退出工具后新会话为空，这是当前会话边界，不声称跨实例持久化。

实际截图保存在本机忽略产物目录 `artifacts/scrapyjs/chat-simple-20261102/`：`empty-chat.png`、`applied-chat.png`、`saved-json-chat.png`。不是离线 Mock。

## 定向验证

- 117 PASS：`ai-panel`、`ai-app`、`app-model`、`profiles`、`business-api`；证明空白编辑、历史配置、原表单同步和请求/身份/权限围栏。日志 `artifacts/scrapyjs/chat-simple-20261102/tests.log`。
- 55 PASS：`ai-config`、`ai-actions`、`export-settings`、`ai-business`；证明回复协议、非法/无差异拒绝与保留的 CSV/原业务身份。旧运行测试显式提供可运行配置，不再依赖新建时注入演示字段。日志 `protocol-tests.log`。首次该组因旧 fixture 缺字段而等待从未进入的运行 gate，已中止，仅修 fixture 后通过。
- 工具 Vite 编译通过，既有引擎 PURE 注解警告不阻断；候选包测试 1 PASS，正式包来源检查通过。未运行根测试或完整工具测试矩阵。

## 已观察限制与延期

- 第二次可信发送审阅关闭后，工具业务区和 Chat 可用高度曾收缩，余下区域空白；Dock AX 高度从约 276/290 降到 144。收起再展开未恢复，保存并退出工具后重开恢复到 276。没有修改公共 Host/共享布局，也没有加第二套高度管理；根因尚未证实，此问题未修复，不宣称最终视觉验收完成。
- 新包未实际采集、Stop 或下载。此前已提取 20 条随后 90 秒 `E_TIMEOUT` 的运行仍是历史未解决项；本轮未重放、延长超时或放宽来源保护。
- 真人 IME、production、完整 Chromium 安全矩阵、外部 MCP/云/代理及独立 95+ 评分均未执行。真实普通问答和配置编辑成功不替代这些证据。
- 收尾复核时，并行同步提交 `d1daddd8c` 已将本轮工具源码与同源正式包一起纳入 `main`。本轮余下的文档、操作证据和运行测试 fixture 独立收尾；不批量暂存其他工作，也不主动推送。
