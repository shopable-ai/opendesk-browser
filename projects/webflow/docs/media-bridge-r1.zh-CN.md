# OpenDesk WebFlow · 媒体仓库至已授权网页的 R1/R2 最小闭环

任务 ID：`OD-WEBFLOW-MEDIA-BRIDGE-R1`；固定检索词：`OD-AI-WORKFLOW-BRIDGE`。
唯一分支：`main`。当前是**源码已接线、待真实安装验收**，不是已发布功能。

## 原始问题与范围

用户在扩展可信设置页只选择一次真实 PNG。扩展把原始 Blob 保存到扩展自有 IndexedDB 并生成可持久读回的 `assetId`。Side Panel 关闭后，用户在 **原有已安装、已验证、明确授权**的 Controller Task 里输入 `assetId`，Controller 调用原 Browser Framework Host 受控读取、分块写入同一网页的 `input[type=file]`；网页从实际收到的 File 独立计算 SHA-256 并对照，最后仅把文章保存为本地草稿。**不上传真实第三方平台、不发布文章、不支持大视频**。

上传输入框接受 File、网页确认收到 File、页面本地草稿提交完成是三个不同状态。沙箱、网页 Origin、MV3 Worker 内存、剪贴板与普通 storage.local 配置都不能成为可信永久素材源。

## 核对过的先存能力（复用，未重做）

- R1 已有 `projects/webflow/trusted/media-vault.js` 与 `media-vault-settings-ui.js`，只允许扩展 Origin，IndexedDB `opendesk-webflow-media-v1` 持久 Blob、SHA-256、名称、MIME、大小、来源、Profile 身份、创建/过期时间；每文件≤1 MiB、每 Profile≤10 MiB/20 件、7 天 TTL。独立读回并复算哈希。可信设置页入口 `src/native-agent/settings.html` / `settings.js` 已存在。
- 浏览器原 `page.uploadFile`、`uploadChunk`、`uploadCommit`、File 构造、原 RunHost/Task Catalog/权限与持久操作日志、本地 `article-editor.html` / Controller Demo 原样复用，没有第二套执行器、安装器或任务协议。
- 初始时 R2 未接 `assetId`；R3 仅有仓库配额/过期/哈希，未覆盖跨 Controller 传递与撤权。

## 本轮新增源码及契约

1. **用户入口**：原 `ChromePage.uploadAsset(css,assetId)` 仅传受限引用，不传字节、不允许绝对路径。现有 `uploadFile` 保持不变。
2. **安装审阅**：原 `Task Manifest` 明确支持 `media.read` 权限，由原 Task Catalog 显示并审阅；默认无此权的草稿、App Controller、旧安装任务均不得读取。原任务运行参数 `paramsWire.assetId` 必须等于每次操作的 assetId（仅 `assetId` 本身不能授权）。
3. **唯一可信 Host**：`src/sw.js` 把既有媒体仓库的读取能力仅注入原 `createFoundationBroker → authority → controllerMethods` 私有依赖。每次读取重新核验原注册 Host、Run owner、安装版本、启用状态、目标页面/Origin、Chrome 网站权限、期限与取消状态。扩展内部无对网页公开的媒体读取消息接口。
4. **原生分块链**：`src/framework/control/native-driver.js` 对获批的二进制重新核对长度、MIME、SHA-256，每包沿现有 49152 字节通道 `uploadChunk`，最后 `uploadCommit` 到原文档 File input；不足或失败时同 Session `uploadAbort`，停用/换页后原 Cancel/Pagehide 兜底。上传 ACK 不会自动重放。
5. **网站独立收据**：现有演示页在真实 `change` 事件读取实际 File.arrayBuffer()，独立生成 `data-filename/data-mime/data-size/data-sha256`；原 Controller 仅在四字段与 Host 预期完全一致时继续保存草稿，返回 `site-file-received` + `draft-saved-local`。不会报告第三方发布成功。
6. **审阅与测试**：现有 Demo Controller 增加 `verifyOnly:true`，使用相同源码在真实本地网页填写标题/正文形成原生页面操作成功记录，但**不读素材、不上传**。待原 Task 目录验证源码 SHA / RunId、标记 Available、人工安装后，改为 `verifyOnly:false` 真正上传；见目录内 `package-media-task.mjs`，只生成原格式候选包，不自行安装。原 `fixed-entry-budget.yml` CI 加入定向 Node/构建检查，新增 `tests/environment/webflow-media-asset-r2.test.mjs`。

## 严格状态（截至本轮 GitHub 写入，不得提前升格）

| 阶段 | 状态 | 凭证/边界 |
| --- | --- | --- |
| R1：素材存取与恢复 | SOURCE_EXISTING / CHROME NOT_TESTED | 已在 main 的仓库源码；真实 Chrome 重启/持久读回尚无本轮现场证据 |
| R2：取件授权与网页上传 | SOURCE_IMPLEMENTED / NODE 待 CI / CHROME NOT_TESTED | 原 Host、Controller 分块和本地网页收据均已接线；尚无真实用户 PNG → 网站收件的现场回执 |
| R3：取消、撤权与 UNKNOWN | SOURCE_PARTIAL / CHROME NOT_TESTED | 现有 Run 栅栏和分块清理复用；需真实中断、撤权、失 ACK、SW 重启现场回归 |
| INSTALL / BUSINESS | NOT_TESTED | 没有本轮正式安装包执行和网站实际收件、草稿读回证据 |

没有实测的测试不写 PASS。CI 即使通过，仍不能替代用户真实 Chrome 的文件选择和网页接收。

## 本地最短验收（使用真实文件，不手写 Base64）

1. 在 Mac 原仓库最新 `main` 跑 `node --test tests/environment/webflow-media-vault-r1.test.mjs tests/environment/webflow-media-asset-r2.test.mjs tests/environment/controller-media-upload.test.mjs`，再运行 `npm run check && npm run build:dev`，按既有安装器/开发指引刷新原正式扩展，不创建新扩展安装链。
2. 启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory projects/webflow/demos/article-media`，在 Chrome 打开 `http://127.0.0.1:43111/article-editor.html`，明确授予该精确站点权限。
3. 在**当前已安装的** `chrome-extension://<扩展ID>/native-agent/settings.html` 保存本机真实 PNG，记录 assetId 与 SHA；关闭 Side Panel 与设置页，重新打开；验证再次读取字节、SHA 不变（另测 Service Worker 重启）。
4. 在根目录运行 `node projects/webflow/demos/article-media/package-media-task.mjs`，生成原格式 `webflow-media-png-local.v0.1.0.opendesk-task.json`。在原「我的」任务目录导入该包成为 **candidate**。用同一字节的 `article-publish.controller.js` 在开发编辑器运行 `{\"assetId\":\"上述真实ID\",\"verifyOnly\":true}`，等原 Controller Run/result/retirement **完整成功**，输入真实 runId 做原任务验证 → Available → 显式人工安装，审阅权限含 `media.read`。注意：未经安装的草稿一律不可执行真实 uploadAsset。
5. 在已安装任务的参数面板输入 `assetId`，`verifyOnly=false`，明确点击运行一次。核对原 Controller 操作/RunId、网页 `#image-ready-0` 的原 File 名称/MIME/大小/SHA、Controller 的 `mediaReceipts`、`#save-state[data-state=saved]`、刷新后网页本地草稿。
6. 负面回归：取消、停用/卸载任务、撤掉 localhost 权限、换网页/Origin、删除/过期资产、超配额、丢 ACK/UNKNOWN。若无法确定是否已提交，只查询原 runId/operation；严禁自动再次上传或保存。

`FILE_INPUT_COMMITTED` 不等于 `SITE_FILE_RECEIVED`；后者不等于 `DRAFT_SAVED`；本轮任何结果都**不等于外部发布成功**。
