# OpenDesk Browser 书签管理 R2.5 续接：复用当前成果，完成实际验收

默认中文。继续现有书签管理收尾，不重新设计、不重新实施 R2.4、不再返回另一份总 GOAL。先说明当前能访问的仓库、本机执行器和 Chrome 环境，再执行有证据支持的下一步。

仓库：https://github.com/shopable-ai/opendesk-browser
本机目录：`/Users/shopme/Documents/workspace/opendesk-browser`
SDK Issue：https://github.com/shopable-ai/opendesk-browser/issues/75
只允许 main；禁止新分支、worktree、PR、强推、reset/clean、覆盖并行改动。既有授权允许当前任务必要修改、提交与正常推送 main，但 Git 写入须串行，只收录自己的明确路径。

**先处理可见性：** 交接时本地 HEAD 为 `b683e3932aebc972b5c8302a5eb5fa6dd9db5455`，远端已前进至 `45d69b7d630484d78089ab71b06fe5012e630a25`，执行前重新核实。0.3.3/0.3.4 修改仍未提交，本地文件不会自动出现在网页聊天或 GitHub。不要声称网页已经读取这些修改，也不要根据远端旧版本重复开发。若没有本机连接，先完成可访问的只读核查，具体列出需本地执行的验证，真实 Chrome 一律保留 NATIVE_NOT_TESTED。

阅读 AGENTS.md、testing-guide、两个 Bookmark R2/R24 workstream、SDK 唯一执行手册及相关 sidebar-tool-dev/package/runtime skills；优先读取本轮记录 `docs/framework/workstreams/bookmark-manager-r25-local-01a13e74.md`（可能尚未推送）。复用成功且输入未变的证据，按 DONE/PARTIAL/FAILED/BLOCKED/NOT_TESTED 分类。

已完成且不得重建：正式 `browser.bookmarks.full` 的 12 项 API、单一 Registry/Dispatcher/Trusted Host/Chrome Driver、opaque 当前页引用、optional 官方目录、唯一独立业务源码 `examples/sidebar-tools/bookmark-manager/`、旧内置业务/入口删除。复用 `a2be6815` 的订阅先于快照、首轮立即读事件、经审阅写入前置条件及 Host 最后 revision/票据有效期栅栏。其他会话正在做 SDK、Adblock、Extension Center、Cookie Editor，不重复编辑公共文件。

当前本地工具 **0.3.4**；未提交写入范围：工具 `src/main.js`、`src/service.js`、`tool.config.json`、`README.zh-CN.md`，以及 `tests/environment/bookmark-manager-r2.test.mjs`、`bookmark-manager-r24-lifecycle.test.mjs`；新增未完成观察器 `tests/framework/bookmark-manager-r25-observer.mjs`。

本轮已修复：

1. 0.3.2 事件有限重连、撤权清空敏感界面、epoch/pagehide 迟到结果隔离；未知写入结果不自动重试。最初改动已被其他会话 `ea2c770d` 收入 main。
2. 0.3.3 真实大树触发 120 RPC/分钟：去除分页/轮询重复能力发现，保留每次正式 Host 授权；安静观察会话重叠轮换并排空旧事件，不到期就全树重读。不能通过提高配额掩盖问题。
3. 0.3.4 真实新建文件夹被隐藏的 type=url 输入 `https://` 原生校验阻塞：非 URL 模式禁用该字段，书签 URL 校验保留。**0.3.4 尚未真机复验。**

实际验证结论：

- 最新本地 0.3.4 四套定向 **71/71 PASS**，`npm run check` **721 文件 PASS**，限定 diff 检查 PASS。命令：`node --test tests/environment/bookmark-manager-r2.test.mjs tests/environment/bookmark-manager-r24-lifecycle.test.mjs tests/environment/browser-sdk-r112-full-bookmarks.test.mjs tests/environment/browser-sdk-r124-current-page.test.mjs`。
- 独立 CFT 原生导入 100/500/550/1001 四组，**2151 URL、2159 总节点**。0.3.2 Full 权限首次拒绝/再次允许已执行；其首次安装是开发包导入，不算普通用户官方首次安装闭环。
- 旧 watcher 目录缓存只有 9 项；经用户明确授权重启后恢复 11 项。实际扩展中心固定版本审阅升级 **0.3.2→0.3.3**、升级后逐工具重新授权与大树显示已执行。
- 0.3.3 实际 SDK 返回 32 页；保留数据规范化 Chrome 根节点缺失值/SDK null 后，2159 节点 ID、parentId、index、title、url 一致。原始比较器 FAIL 保留，不改 receipt；因观察器身份绑定问题，不能提升为完整正式 Native PASS。
- 原生成功 CRUD、当前网页收藏、深层嵌套、事件/跨窗口同步、危险删除竞态、撤权/Worker/卸载仍 **NOT_TESTED**。多次 CUA 当前应用变更中断，原因未定；不能假报完成。
- 中间态全量曾 2712 总计/2681 PASS/27 FAIL/4 SKIP，包含后来修复的早期用例及旧 dist、固定库、Cookie Editor、夹具差异；不是 0.3.4 最终结果。生产 Build/Verify、最终全量和同候选 CI 尚未完成。

继续使用**持续开发**：固定 `dist/development`；用户已授权安全重启，现有 watcher PID **76733**，serve/guard **43119/43120**，扩展 ID **ccfcjegpkdlgbclopjmadlcjedelidmf**，最后输出 revision **05f8d0466156**；均须现场复核。不要另起 writer、静态 build 或复制包覆盖日常路径。旧专属 CFT 进程交接时已不在，不能复用失效 Profile；使用正式隔离 CFT launcher/mock keychain，绝不碰私人书签。正常窗口默认缩放，宽度/缩放专项 OUT_OF_SCOPE。

下一步按顺序：

1. 核实最新 main、工作区和并行责任；安全保留/整合上述未提交代码，确认当前实际版本与字节。
2. 修复观察器三个证明缺口：绑定真实书签工具 sandbox 与安装实例；绑定当前源码→实际构建包→运行包及 Host revision；observe start/read/stop 只算 smoke，真实事件/轮换/恢复须另证。保存失败原件，不覆盖 receipt。
3. 核实 dev 连接后真实安装/升级 **0.3.4**，先复验新建文件夹，再原生书签/文件夹 CRUD、搜索、收藏标准测试页 `http://127.0.0.1:43111/demo-form.html`；核对真实 Chrome 结果和 opaque Document 身份。
4. 复验大树全 ID/父子/顺序/分页尾页，补事件、撤权、Worker、升级/卸载不删用户书签、删除一次性票据与并发。Chrome 无 CAS，不能宣称原子删除。
5. 只修复已证缺陷；按影响补测试；开发缺陷收敛后再按资源协议冻结独立 production 候选，执行必要 Build/Verify/全量/CI/Native，分别报告。

九维目前均 **NOT_SCORED**，没有同候选证据不能给 95+。Issue #75 保持 Open，门禁未齐不关闭。最终交付准确 SHA/差异/版本/安装身份、已复用与本轮新增证据、各层 PASS/FAIL/NOT_TESTED、剩余责任和阻塞。不能用另一份方案替代可执行工作，也不能在网页无 Mac 连接时伪造本地验收。
