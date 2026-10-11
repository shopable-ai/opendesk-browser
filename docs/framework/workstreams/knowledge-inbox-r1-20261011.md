# ChatGPT 知识收件箱 R1

日期：2026-10-11。状态：IMPLEMENTED / BUILD_AND_COMPONENTS_VERIFIED / CONTROLLED_CHROME_PENDING。

## 目标、范围和资源

用户要求：参照先前 TOC 浏览器工具，梳理并评分高频知识资产需求，然后实现首批功能。需求已经整理为 30 项并给出频率、价值、覆盖、差异、成本和排序，见 `docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md`。分数是产品假设，不是流量数据或质量评分。

本会话使用独立 `main` 检出；起点 `f5550d608d3cc512d5620c0d1d32f03ec9d63c61`，提交前快进合并到 `8f30854f0f2aa4a2b479fc179f8911cc01decdc1`，保留同期间其他会话的 TOC、内置库和市场规划改动。一个源码写入者，其他 Agent 只做产品研究和只读审查。

使用本检出的 `dist/`、`.runtime/knowledge-inbox-r1/` 和本任务证据目录。不占用或删除其他浏览器 Profile、端口、Native 配置；原 WXT 公共证据文件由构建临时写入后恢复为 HEAD，本轮原始报告单独 gzip 归档。

## 已实现

- 官方可安装 `knowledge-inbox` 工具，使用既有 `.opendesk-tool.json` 与 opaque sandbox；不新增依赖。
- 独立 `page.capture` 站点授权，不借用 TOC 或文章剪藏授权；已授权 ChatGPT 回答下显示保存/Markdown/更多。
- 单条完整回答和精确选区；来源、提问节选、时间、消息标识；隐藏分支与生成中回答保护。
- 有界本地收件箱，去重、搜索、分类、标签、备注、原文和草稿分离、修订冲突保护、MD 复制下载与 JSON 备份。
- 标题/列表结构导图；当前可见图片逐张下载入口，未实现图片离线附件包。
- MD 送往受信任的本地 Workspace，使用既有授权目录与明确 files.create、回执、读回、SHA 核对。送达或载入草稿本身不会写磁盘。文本上限沿用 32 KiB，不新增二进制文件协议。
- 沙箱内行内确认、宿主未保存保护、Native 切换导入稿保护、卸载交接清理、窄 v1 迁移及容量保护。

## 审查中关闭的问题

1. 重复初始化导致重复按钮；隐藏分支/多 Markdown 区块/生成状态误判。
2. 异步读取期间页面或 document 改变；同 URL reload；撤权后旧请求写入。
3. 收件箱与安装/卸载共锁；旧编辑修订号不能覆盖新内容；长 MD 加元数据仍可下载。
4. 沙箱不能使用 modal confirm：改为行内确认；宿主 dirty 通知立即处理且不受正文接口限流影响。
5. Native 交接在同工具锁中重新读取 session 与安装哈希；失败保留交接，卸载清理未载入交接。
6. 未创建的知识草稿切文件、切目录或通过 ChatGPT 文件请求读取其他文件前均要求明确放弃；结果未知/不匹配有明确退出路径。
7. v1 缺少 draft 时窄迁移，读取容量按原始存储值验证；合法满额旧库仍能备份、删除。

## 本地验证

已阅读 `AGENTS.md`、`docs/framework/testing-guide.md` 与相关工作流。新增固定知识入口、宿主、页面及 Workspace 属于受影响输入，未把其他会话的 Chrome 证据转记成本次 PASS。

| 检查 | 结果 | 限定解释 |
|---|---|---|
| 定向初始组件 | 72/72 通过 | 包、授权、持久化、TOC/剪藏/Workspace 受影响合同 |
| 草稿保护扩大组件 | 114/114 通过 | 增加宿主导航、编辑状态与迁移保护 |
| 最后受影响核心组件 | 83/83 通过 | 含真实 Workspace 控制器的组件交接/编辑/创建/读回逻辑；不是 Native 磁盘实测 |
| `npm run check` | 通过 | 当前源码与固定构建合同可解析 |
| `npm run build`、`build:dev`、`verify` | 全部通过 | 新固定入口和工具 JSON 包含在产物内；沙箱仍无 allow-modals |
| 全环境 `npm test` | 972 项，957 pass / 8 fail / 7 skip | 7 个 Native Host 用例被当前环境 `listen EPERM` 阻断，另 1 个依赖 socket 的终止用例退出异常；不是全量通过 |
| 本环境真实 Chrome | NOT_TESTED | 浏览器下载返回空的无效 ZIP；未重复尝试同一失败环境 |
| 线上 ChatGPT / 用户 macOS Native / 公司云盘与博客 | NOT_TESTED | 不由上述组件、构建或受控 DOM 提升为正式验收 |

原始日志、完整 gzip 构建报告和摘要位于 `docs/framework/workstreams/evidence/knowledge-inbox-r1-20261011/`；SHA 与包标识在 `local-summary.json`。本轮没有修改 `native-agent/native-host.mjs` 来绕过环境限制，也没有改变既有 Native 权限。

## 仓库 CI

新增 `.github/workflows/knowledge-inbox-r1.yml`：在具有真实 Chrome for Testing 的 Linux runner 上重建同一提交，执行环境回归，然后使用 `tests/framework/knowledge-inbox-native-r1.test.mjs`。

该浏览器测试通过 Chrome Fetch 受控响应提供 ChatGPT 形状的 DOM，用实际 UI 安装、站点授权与真实 Chrome 输入触发业务动作；持久化通过扩展实际 storage 检查。测试只创建一个测试控制来打开真实 Side Panel，不通过测试控制设置业务数据/安装结果/站点授权或伪造 Native 回执。覆盖官方按钮下方位置、完整回答、去重、流式保护、编辑稿、取消离开、行内确认、结构导图、SPA 和撤权。

CI 结果待提交后记录。真实网站、真实 Mac 文件写入、系统剪贴板、图片最终落盘、已验收 ZIP 与独立 F3 仍需各自证据；此次工具功能不等于原框架迁移合同全部关闭。

## 使用与后续

使用说明：`examples/sidebar-tools/knowledge-inbox/README.zh-CN.md`。旧 OpenDesk 版本不认识新增能力，需要先更新框架再安装工具。

下一阶段优先：固定 MD 追加、图片附件包、备份导入和常用目的地。博客和公司系统需要实际 API/目的地配置；当前未连真实账户，不发布文章。文件下载、本地目录写入、云端同步分别报告结果。
