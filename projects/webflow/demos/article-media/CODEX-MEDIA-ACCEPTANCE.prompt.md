# GOAL：OpenDesk WebFlow · 真实 Chrome PNG 素材仓库→已授权 Controller→网页收件与草稿的测试、修复、验收

- 仓库：`shopable-ai/opendesk-browser`；唯一分支 `main`；项目 `projects/webflow/`；本轮 `OD-WEBFLOW-MEDIA-BRIDGE-R1`；检索 `OD-AI-WORKFLOW-BRIDGE`。
- 这是**本地 Codex 验收任务，不是要求重做媒体架构或开发文章发布产品**。
- 真实用户目标：在扩展可信设置页面只选择一次 PNG → IndexedDB 原字节/哈希保存、得到 assetId → 关闭再打开 Side Panel，甚至重启 Service Worker → 用户以已审阅 `media.read` 安装任务批准使用该 assetId → 原 Controller/Host 校验当前安装权限/页面 Origin/Run → 复用 `uploadChunk/uploadCommit` 真正塞入本地测试页文件选择框 → 网页自己读取 File 并核对文件名/MIME/大小/SHA-256 → 实际存入本地草稿。无须复制 Base64、剪贴板或再次人工选择文件。**不发布第三方文章**。

## 开始前防重复与并行安全

1. 只读检查 `git status --porcelain`、`git branch --show-current`、`git rev-parse HEAD`、最近相关提交、`projects/webflow/docs/media-bridge-r1.zh-CN.md`，再核对 `src/framework/ChromePage.js`、`src/framework/control/native-driver.js`、`src/platform/host/controller-methods.js`、`src/sw.js`、`projects/webflow/trusted/media-vault.js`。
2. 新增源码已经在 GitHub `main`：`uploadAsset(css,assetId)`；原任务 Manifest 的 `media.read` 权限；原 Host 的 `readMediaAsset` 注入、run.paramsWire.assetId 精确绑定；原分页上传/撤销；原 Demo 真正 File 事件哈希核验；`package-media-task.mjs`；定向测试。**不得重新写 R1、另建上传器、第二套 Runner/Installer/Task Catalog 或旧 Base64 Demo**。
3. 检查并行工作区改动；禁止覆盖未提交文件。若工作区不是 main 或有冲突，只处理允许的安全同步方式；不创建分支、worktree 或 PR。任何本轮修改保持最小、直接 main 并核对远端新提交。

## 必须执行的真实测试

1. **定向 Node**：`node --test tests/environment/webflow-media-vault-r1.test.mjs tests/environment/webflow-media-asset-r2.test.mjs tests/environment/controller-media-upload.test.mjs`；`node --check projects/webflow/demos/article-media/article-publish.controller.js`；`node --check projects/webflow/demos/article-media/package-media-task.mjs`。分别运行 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`（verify 需要两个构建产物），分开记录每个结果。若其它扩展已有 Bookmark/Reading TOC 的并行 pin/缺文件导致全量失败，注明确切来源，勿越权修复或冒认本媒体失败。
2. **真实 Chrome R1**：启动现有 `python3 -m http.server 43111 --bind 127.0.0.1 --directory projects/webflow/demos/article-media`；使用安装后的最新 OpenDesk 扩展（记录扩展版本与 SHA），在 `chrome-extension://<实际扩展ID>/native-agent/settings.html` 由可信 UI 手工选本机真实 PNG≤1MiB，仅选一次，保存并复制得到的 assetId 和 SHA。关闭设置页/Side Panel，重开独立读回；重启 SW 后再读回。严禁用假 File、临时 Blob URL 或只读元数据模拟持久性。
3. **原 Task Catalog 的安装身份**：在根目录执行 `node projects/webflow/demos/article-media/package-media-task.mjs`，生成同源码候选包。打开 `http://127.0.0.1:43111/article-editor.html`；在原「我的」导入 `webflow-media-png-local.v0.1.0.opendesk-task.json` 为 candidate，不会自动安装。用**完全相同的** `article-publish.controller.js` 开发草稿在该页面以 `{\"assetId\":\"真实ID\",\"verifyOnly\":true}` 运行，核验原真实 Run 成功且 released、结果不含媒体上传，然后把该 runId 用于原 Candidate 校验 → Available → 人工审阅并安装（必须显示 `page.automation + media.read`）。不要把 dev draft 当成有读素材权限。
4. **真实 Chrome R2**：在原已安装任务表单输入**同一个** assetId，明确设 `verifyOnly:false`，点击一次运行。记录原 runId、目标 tab/document/origin、任务安装 generation、`file-input-committed` 回执，网页 `#image-ready-0` 实际 File 的 filename/mime/size/sha256 数据，Controller `mediaReceipts[0]` 以及 `#save-state[data-state=saved]`、刷新后页面 IndexedDB 草稿。需要 **4 个字段完全一致、真实网站收到 File、草稿落盘**，否则不得写 PASS。网页演示不是第三方正式发布。
5. **真实 R3**：分别验证停用安装任务、Chrome Origin 撤权、换标签/文档、删除/过期素材、取消中途分块、丢 ACK/UNKNOWN。检查原 Controller 命令日志及 `uploadAbort`、cancel/pagehide 清理。未知状态只查询原身份，不能自动再次 `uploadCommit`、保存或发布。异常测试不要重复触发未知副作用。
6. **真实包与回归**：核对构建包内确实有新增 API/Host 源码，原 `uploadFile` 行为未回退。若失败，定位可重现的文件+行号，按原架构 owner 最小修复、复跑受影响测试，不修改其它并行产品。

## 必须给出的证据和交付

中文回答 A 原目标、B 先存与缺口、C 本轮修复、D R1/R2/R3 状态及来源、E 真机验收结果、F 若未通过只留下**唯一仍未完成的最短任务**。把必要日志与测试矩阵按已有证据目录风格保存：SOURCE / NODE / CHROME / INSTALL / BUSINESS 分别记 `PASS/FAIL/NOT_TESTED`，附 HEAD、命令、RunId、站点实际 File SHA、原任务身份；仅同一次真实执行的记录能作业务证明。六专家：产品、浏览器架构、媒体传输、权限安全、MV3 生命周期、测试验收，各 0–100 独立评分，算术平均，不累加；有不合格项必须指出并修复，**未执行的验证不能靠评分升格**。

**不可漂移**：不做正式第三方发布、多张视频、大文件/OPFS、通知/A→B/Markdown/AI Proxy，不改五字段 WebFlow 协议，不重新创建 Demo 或 Task Runner。
