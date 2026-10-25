# OpenDesk Browser R1.2.3-WEB · 四产品源码交付与新旧身份迁移

日期：2026-10-26。仓库 `shopable-ai/opendesk-browser`，唯一写入分支 `main`。

## 原始目标（不可漂移）

在「扩展」中心独立安装、使用、停用、升级、卸载四产品：Sidebar Tool `prompt-shortcuts`（只管理/填写提示词，不发送）；Page Program `opendesk.ai-scroll-navigation`（三站固定授权、五项导航）；Page Program `opendesk.ai-reply-mindmap`（真实 XMind、定位、导出和 Viewer Theme）；Page Program `opendesk.ai-send-queue`（FIFO、暂停恢复、unknown-effect 不重放）。共享回复工具组属于既有 DOM 协议而非第五产品；通用名称不扩大网站或 Authority。

R1.2.2：`docs/framework/workstreams/ai-four-products-r122-web-20261026.md`；历史提交 `d8569107de1b5240d7f522db20b8c1b2c8387337`，仅复用不重复实施。

## W0 输入、资源与文件所有权

- 本次最早只读远端 HEAD `31a934936913d7d4308c512c5ebbf8ec6a3045c9`；首次身份源码原子提交的直接父提交为 `c1b6f533c69af4ea5b326df183dcf328de18105e`，提交 `7e6ef79569f31aa836121d89d3f3f08c6e9372a4`。并行其他 owner 的 main 提交均保留。
- 只读检查 `AGENTS.md`、`parallel-development.md`、`testing-guide.md`、R1.2.2、Scroll R1.2.1、Mind Map R3.9.6 与 Send Queue R4.6 等工作流、现有正式包和相关业务入口。GitHub 没有用户 Mac 本地 workspace 的 dirty/index/watcher/Profile 状态；不能因此证明实时 Mac owner 或本地安装。
- 本轮只接管 Mind Map 身份迁移的 `package.json`、`src/main.js`、`src/answer-registry.js`、`tests/{xmind-theme-toggle,xmind-answer-registry-lifecycle,xmind-frame-business,identity-migration}.test.mjs`、README 及**本独立记录**。R3.9.6 toggle 工作流记载源码写权释放。本轮每文件使用最新 GitHub Blob 与原子 Git tree + fast-forward 比对，不写 `src/` 通用 Host，不占用浏览器/watcher/dist。
- Send Queue 目录最近有 R4.8 活跃业务提交，原业务 owner 未提供明确交接，全部 **OWNED_ELSEWHERE/只读**。Mind Map 的 XMind/渲染/Frame/导出其余代码只读。Scroll 和 Prompt 其余业务、共享工具组、Extension Center/React/Installer 都复用 R1.2.2，禁止跨对话重复实施。

## W1—W6 实际产品状态

| 产品/领域 | 当前真实源码、身份 | 正式包与剩余工作 | 状态 |
|---|---|---|---|
| Prompt | `prompt-shortcuts`，`tool.config.json` 1.1.19，去导航化已由 R1.2.2 提交 | 唯一正式 JSON 仍 1.1.18，需原 Sidebar builder 及 `--promote-from` 同源晋升 | `ALREADY_DONE / PACKAGE_BUILD_REQUIRED` |
| Scroll | `opendesk.ai-scroll-navigation`，0.4.0，保留 ChatGPT/DeepSeek/Gemini 固定范围 | 旧 `chatgpt-jump-top.opendesk-page.json` 为 `opendesk.chatgpt-jump-top` 0.2.0/r2；须新文件名、原 Program builder、哈希与三站审阅 | `SOURCE_VERIFIED / PACKAGE_BUILD_REQUIRED` |
| Mind Map | 0.2.7，源码现为 `opendesk.ai-reply-mindmap`；runtime lifecycle、诊断 ID、主题键同步迁移 | 新身份目标 r1；尚无可信新 Page 安装 JSON，旧 0.2.7/r8 安装记录/授权不迁移 | `SOURCE_IMPLEMENTED / PACKAGE_BUILD_REQUIRED` |
| Send Queue | 0.1.2，仍 `opendesk.chatgpt-send-queue`，memory-only FIFO、已保存旧 ID 正式 r4 包 | 独立 owner 先正式交接，再更改 `package.json`、`src/main.js` 的身份和新包；不能改 engine 或复用旧 Authority | `MIGRATION_REQUIRED / OWNED_ELSEWHERE` |
| 共享回复区 | `data-opendesk-chatgpt-answer-tools` 及 Scroll 旧/新标记 | 双安装顺序、新旧停用/卸载的原生行为未验收 | `ALREADY_DONE / NOT_TESTED` |
| Extension Center | 准确 row ID 搜索别名由 R1.2.2 实现 | 新旧 ID 权限、安装实例、显示和用户操作待实际安装核查 | `ALREADY_DONE / NOT_TESTED` |

## Mind Map 精确增量与恢复

1. `package.json` 的 npm 名与 Program ID 转为 AI 回复思维导图，保留 0.2.7、ChatGPT-only `USER_SCRIPT`；项目目录不搬家。
2. `src/main.js` 生命周期和可观察返回 ID 改为新 ID；`programRevision=0.2.7/r1` 属于新身份首次包的**目标合同**，不能冒充已构建或已安装。未来 builder 的实际 revision 必须与源码诊断一致。
3. `answer-registry.js` 错误诊断使用新 Program ID。新 Viewer Theme key 优先；若缺失，旧 key 只读 fallback；显式用户切换只写新 key，不复制/删除旧主题，不读取/修改旧安装 Authority。旧 UI 的 DOM 标记仍保留供共享回复组兼容。
4. 更新生命周期/主题/Program Validator 定向断言，另加身份边界静态测试；不改真实 XMind engine、renderer、assets 或既有来源。
5. 恢复路径：用户可先停用新安装、保留旧安装与旧主题键，复查旧包来源及 Authority 后单独恢复旧安装；新旧 Page ID 不是同 ID 升级或静默权限转移。双装未经原生核验，不声称无重复 UI。

源码提交 `7e6ef79569f31aa836121d89d3f3f08c6e9372a4` Blob 收据：

| 文件（均相对于 `examples/programs/chatgpt-mindmap/`） | 原 Blob → 新 Blob |
|---|---|
| `package.json` | `ae3d54b7d97449492fa5a5c06549835091c9687a` → `074837c0167c13e0dc6ff53bd44961de4b4aaedc` |
| `src/main.js` | `0e5767dc611cf8ea2b6ff81945a4b09134985470` → `e2d6c8e6277304922de583794f96f4dcea6966f9` |
| `src/answer-registry.js` | `cfdf9723d82ea20f38008d048dd16c75c1f4e01e` → `1b6792ee3601ed7a6e96e12e536fcb6e9cdd3e13` |
| `tests/xmind-theme-toggle.test.mjs` | `9032df8859adea68a938606cdf041ca6c740666e` → `df70f2a9440d76cfe1749bcd31e64e1a7a50baea` |
| `tests/xmind-answer-registry-lifecycle.test.mjs` | `13f1f362438a17c83d06d5eb53458578965114e5` → `063a32b864ac81464fcc821195ea2dc51da0a37f` |
| `README.zh-CN.md` | `4c945bb80fb5759c04171b4727752a510a897d3c` → `81c78e57692404789f645a34d0353d7ef12033ac` |

## 验证等级与下一阶段门禁

本会话在 GitHub 远端操作，没有本项目的 Node/npm workspace、正式 Page/Sidebar 构建器、用户 Mac Chrome、扩展安装记录、sourceHash/packageHash 生成器；本轮**没有运行 Node 测试或真实 Chrome**。身份匹配与范围为静态源码审阅，不属于 Node/CI/安装 PASS；原 Mac 0.2.7/r8 的 XMind 成功属于旧 ID，绝不转移到新身份。GitHub 上的并行失败工作流需要按具体 job 与输入归因；未因全局失败修改不相关模块。所有专家正式评分 `NOT_SCORED`，不编造 95。

**唯一下一项业务操作：** 获取 Send Queue 业务 owner 对本目录身份文件及正式包的明确交接后，仅将其从旧 ID 升级为独立 `opendesk.ai-send-queue`，保留 FIFO、unknown-effect 和所有用户草稿安全。其后才在 Mac 用可信 builder 构建新 Scroll/Mind Map/Send Queue Page JSON 与新 Prompt 包、核对哈希、站点和 Authority，执行最小定向 Node/真实安装验证。四产品业务源码尚未完全结束，R1.3-LOCAL 正式验收阶段不得提前启动。

本记录 owner：R1.2.3 远端源码交付；状态 `SOURCE_DELIVERED / RELEASED`。没有浏览器、构建或后台任务资源占用。
