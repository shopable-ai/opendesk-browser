# OpenDesk Browser R1.2.4-BUILTIN · AI 四产品内置发行与可安装门禁

日期：2026-10-26。远端唯一写入分支 `main`。本任务对照 HEAD `f236311e2774aedb66de64034223430aeb282ff7` 核验；工作流记录提交后 HEAD 应继续前进，具体以 GitHub 为准。用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser` 未接入本会话；没有读取其本地 dirty/index/watcher/Chrome Profile。

## 不可变产品目标与边界

- `prompt-shortcuts`：Sidebar Tool，新用户默认预装，保存与插入提示词，不自动发送。
- `opendesk.ai-scroll-navigation`：独立 Page Program，ChatGPT / DeepSeek / Gemini 三站，需单独授权。
- `opendesk.ai-reply-mindmap`：独立 Page Program，XMind 阅读/查看/导出与主题，仅明确按需安装，许可证审核未通过前不能发行。
- `opendesk.ai-send-queue`：独立 Page Program，FIFO、暂停恢复和 unknown-effect 保守保护；R4.8 其他 owner 未交接，不触碰业务源码。
- 不允许 Prompt 重新承载后三项业务，不新建第五个超级扩展，也不建第二套 Authority/Host/Installer。

## 本次真实交付（可核验）

1. `official-tools/catalog.json` 将 Prompt 的 `installationPolicy` 从 optional 变更为 preinstalled；沿用 `src/sidebar-tools/default-preinstall.js` 的已有安装进度、旧配置保护、卸载后不恢复、未知结果不盲重放。
2. 新增 `official-pages/sources.json`、`src/scripting/user-scripts/official-page-catalog.js`、`scripts/build-official-pages.mjs`；固定三个新 ID、版本、精确网站、授权/发行门禁、受控路径、大小与哈希。资源来自 extension-owned bundled bytes，任何阻塞状态都不得被伪装成安装。
3. 以最小增量接入 `scripts/prepare-public.mjs`、`scripts/build.mjs`、`scripts/verify-package.mjs` 的官方 Page 目录产物及固定源校验；`src/sidebar-tools/official-catalog.js` 复用可信资源读取，不放宽 Sidebar Tool kind。
4. `src/ui/extension-center-model.js`、`src/ui/extension-center.js` 使未安装官方 Page 候选能够在「可安装 / 更新」视图被发现；被阻塞时显示原因，已安装 Page 继续走原注册列表。`src/ui/sidebar-tools.js` 为批准候选复用 `reviewPagePackage`、用户确认及原 Page Authority，不做自动网站授权。修复未安装 Page 详情空对象访问、按钮身份判断与键名语法问题。
5. 已从当前 Scroll `0.4.0` 新 ID 项目经原 `build-program-project.mjs` + `build-page-install-package.mjs` 生成 `examples/programs/chatgpt-jump-top/ai-scroll-navigation.opendesk-page.json`，45,511 字节；programId `opendesk.ai-scroll-navigation`、revision 1，`sourceHash=7e7f8377447e176cf9fa3bed1848f9e6979af7143e10279ad1fc15bcbec5a9bd`，`packageHash=7500942dc0c2115f80a14342ccabc1031f23b47e5ead7b71547f4842844a3d4a`。旧 ID 包保持不变。Chrome 新身份安装未验收，发行元数据仍 `blocked`。
6. 新增定向测试及独立受控 GitHub Actions CI。没有修改 Send Queue、Mind Map 的业务源码。

## 最小文件所有权与剩余 Delta

| 文件 | 本轮 owner / Blob SHA | 已完成能力 | 剩余 delta / 是否仍可改 |
| --- | --- | --- | --- |
| `official-tools/catalog.json` | R1.2.4 / `4edeffb5` | Prompt 标记默认预装 | **RELEASED**；Mac 首次 Profile 读回 |
| `official-pages/sources.json` | R1.2.4 / `50f9bd4b` | 三独立官方候选，保守 blocked | **RELEASED**；对应门禁完成后再逐一晋升 |
| `src/scripting/user-scripts/official-page-catalog.js` | R1.2.4 / `1c9172db` | 目录校验、精确权限、字节与 packageHash 审阅 | **RELEASED**；Chrome 权限真实验收 |
| `scripts/build-official-pages.mjs` | R1.2.4 / `9097cc45` | 官方 Page 来源打包/阻塞门禁 | **RELEASED**；完整 WXT 构建与复现 |
| `src/ui/extension-center-model.js` | R1.2.4 / `da5906b4` | blocked Page 发现、不伪造 installed | **RELEASED**；Chrome UI 交互 |
| `src/ui/extension-center.js` | R1.2.4 / `c5a98b6a` | 安装入口/状态/原因/版本投影 | **RELEASED**；真实 Page 读回 |
| `src/ui/sidebar-tools.js` | R1.2.4 / `ec1d926b` | 新官方 Page 复用可信审阅和安装链 | **RELEASED**；真实安装失败及未知回退 |
| `examples/programs/chatgpt-jump-top/ai-scroll-navigation.opendesk-page.json` | R1.2.4 / `3d120ce0` | 新 ID 0.4.0/r1 同源冻结包 | **RELEASED**；原生 Chrome 门禁才允许 official available |
| `examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json` | Prompt 产品 owner / `1b034f05` | 历史 1.1.18 正式包保留 | **OWNED_ELSEWHERE**；1.1.19 同源晋升及 provenance re-pin |
| `examples/programs/chatgpt-mindmap/**` | Mind Map owner | 新 ID 源码 0.2.7 已完成 | **BLOCKED_LICENSE**；不得未经许可再分发 XMind |
| `examples/programs/chatgpt-send-queue/**` | Send Queue R4.8 owner | 原 FIFO/皇冠业务源码受保护 | **OWNED_ELSEWHERE**；须获得交接再新 ID 打包 |

本任务只读原 `AGENTS.md`、`docs/framework/parallel-development.md` 和 R1.2.2/R1.2.3 工作流。未占用本地 watcher、dist、Profile、Native 安装数据库或 Chrome 端口。未新建分支、Worktree 或 PR。以上 RELEASED 仅表示本次对这些文件不再写入，不代表产品验收 PASS。

## 真实验证等级与证据

- `STATIC_VERIFIED`：受影响 9 个模块经 V8 解析；目录守卫拒绝额外站点，旧/新 ID 不共享安装记录。静态探针与真实 Node 不混称。
- `NODE_PASS / CI_PASS`：<https://github.com/shopable-ai/opendesk-browser/actions/runs/40223916504>，精确 SHA `0ed695bf44b0c48a30b9645bba71ab95fac455a2`，17 测试成功、0 失败，包含原默认预装安全测试、官方 Page 阻塞发现测试。
- `NODE_PASS / CI_PASS`：<https://github.com/shopable-ai/opendesk-browser/actions/runs/40224322344>，Scroll 新 ID 原 Program/Page builder 构建与哈希合同 PASS，生成 `45511` 字节正式包。
- `NODE_PASS / CI_PASS`：<https://github.com/shopable-ai/opendesk-browser/actions/runs/40224870077>，从最新 Scroll 源码重新构建并与已提交正式包按原始字节逐位相等，日志 `SCROLL_SOURCE_REBUILD_AND_FORMAL_PACKAGE_EQUAL 45511`。
- `CHROME_PASS=NOT_TESTED`、`MAC_LOCAL=NOT_TESTED`、`FULL_WXT_BUILD=NOT_TESTED/未见本任务同一冻结候选 PASS`。不可把构建脚本存在、CI Node 成功、历史旧 ID Chromium 结果当成新 ID 实际安装通过。
- 部分原有全仓大范围 CI 包含过时 UI 文案断言、未准备的 `dist/tool.css` fixture 或旧 Prompt 正式包同源不一致；只按相关日志归因，不改动其他 owner 的业务代码以追求全绿。

## 尚缺产品能力与交接

1. Mac 本地 Codex 在真实 `main` 工作区先核对 dirty/watcher/独立文件 owner；运行 `npm run check`、真实 WXT build + verify、定向测试。
2. 新 Chrome Profile 测 Prompt 默认预装、首次安装一次、已安装配置升级和主动卸载后不恢复；核对 1.1.19 正式包及可信 provenance pin。
3. 用新 Scroll 0.4.0/r1 正式 JSON 进入原 Page 许可审阅、三站授权及安装；验证页面 UI 真注入、禁用/升级/卸载/重启与新旧 ID 共存、没有重复按钮。Chrome 成功且包同源后，才把官方 Scroll 的 `publication` 晋升 `approved`，复跑打包和权限 UI，形成 Available→Installed 完整回执。
4. Send Queue 先取得 R4.8 owner 显式交接，保留 FIFO/message completion fence/unknown-effect，再按独立新 ID 构建；Mind Map 在 XMind 许可证通过前保持 blocked。两项不因 Scroll 成功而自动晋升。

最终状态：`SOURCE_DELIVERED / NODE_CI_VERIFIED / CHROME_NOT_TESTED / OWNER_RELEASED`。本记录不得用于虚报生产 Ready、Chrome 通过或用户本机安装完成。
