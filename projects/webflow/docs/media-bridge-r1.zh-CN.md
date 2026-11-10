# OpenDesk WebFlow 媒体桥 R1：可信扩展素材仓库

任务 ID：`OD-WEBFLOW-MEDIA-BRIDGE-R1`；检索：`OD-AI-WORKFLOW-BRIDGE`。

## 用户目标与已知基础

最终目标是用户选入真实 PNG，扩展保存原始 File/Blob，在刷新/关闭 Side Panel 后用 `assetId` 定位，经原 Controller/Host 权限核验后上传到已授权网页；上传和发布是两个不同的业务状态。已有 `ChromePage.uploadFile`、`uploadChunk`/`uploadCommit`（单文件 1 MiB）、本地文章 Demo 与基础测试。Demo 的 IndexedDB 是网页 Origin，不是扩展素材仓库。本轮不替换它们。

## 本阶段实现与边界

`projects/webflow/trusted/media-vault.js` 是仅受信扩展 Origin 可调用的 WebFlow 专属 IDB 仓库，使用 `opendesk-webflow-media-v1` 独立数据库，不修改 Browser Framework 既有严格 V2 Schema。存储原始 Blob、SHA-256、名称/MIME/大小、`assetId`、来源、Profile 作用域、创建时间、状态及有效期。独立事务读回并复算哈希才确认保存。首版只支持 PNG、≤1 MiB、单 Profile 总量≤10 MiB、≤20 件、7 天过期；支持列举、人工删除和过期清理。SW 内存/剪贴板/Blob URL 不是持久介质，WebFlow Task JSON 不携带字节。本仓库模块**没有公开读取消息接口**，不授予沙箱或网页资产访问权限。

`src/native-agent/settings.html` 既有可信设置页加入 PNG 选择、已存记录、哈希复验和人工删除；`src/native-agent/settings.js` 只初始化该 UI，不创建新 WXT 入口或第二个安装器。需要在真正安装的 Chrome 扩展设置页验证。

**R2 未完成：** 目前 Controller 公共接口不支持凭 assetId 到 Host 取二进制。后续必须在原 Browser Framework Host/Controller owner 内实现：原已授权 Run、任务安装 pin、目标 Origin、具体 File 读授权、Profile、Stop/撤权/期限全部成立时才允许取件；通过有界通道返回到原 Controller/Page session，复用 `uploadFile`，以目标网页原生 `File` 的文件名/MIME/大小/哈希作为成功依据。不能简单把 `assetId` 传给网页或把资产字节放进任务 JSON，也不能绕过原权限系统。请求 `UNKNOWN` 时仅按原 ID/回执查询，不再次提交文件。

**R3 部分：** R1 包含长度/格式/Origin/Profile/数量/容量/TTL/哈希校验与人工删除；Controller 撤权、Stop、传输取消、未知结果恢复及目标网页确认尚需依附 R2 端到端测试。

## 本地 Chrome 验收（不能用 Demo 模拟代替）

1. 安装当前 `main` 打出的正式扩展，打开 `chrome-extension://<当前扩展ID>/native-agent/settings.html`，在「WebFlow 素材仓库」选择真实 PNG（1 MiB 内）。记录 `assetId`、SHA-256、原文件名/MIME/字节数。
2. 关闭 Side Panel、关闭设置页并重新打开；刷新列表后点「核对原始字节」，验证原始 Blob 的 SHA-256，亦验证多次重启浏览器/Service Worker 后仍可读。
3. 以不同 Profile/网页 Origin 及无权限场景测试失败关闭；容量溢出、过期、删除后的读取必须失败。
4. R2 接入后，运行原已批准的 Controller 到既有本地 `article-editor.html`，按真实 `assetId` 取图、上传，网页脚本独立计算文件 `File.arrayBuffer()` SHA-256 并提供实际接收凭证。测试停用/撤权、取消/UNKNOWN 不重传。

验收分层：SOURCE（源码）、NODE（专项单测）、CHROME（正式扩展现场）、INSTALL（正式包安装）、BUSINESS（网页真实接收）。仅依据同 SHA 的真实日志和截图填写 PASS；未实际做的项目全部 NOT_TESTED。`uploadFile` 完成不等于网页处理完成，草稿保存不等于文章已发布。
