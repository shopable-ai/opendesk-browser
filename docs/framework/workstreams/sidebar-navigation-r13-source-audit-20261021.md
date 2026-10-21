# OpenDesk Browser Sidebar Navigation R1.3 — GitHub 源码核查与原生收尾交接（2026-10-21）

> 状态：**WEB_PARTIAL / TEST_FIX_PENDING**；禁止将此审计写入视为 Node、Chrome、React 静态预览或正式发布 PASS。此记录是当前任务的独立工作流文档，不更改另一会话持有的安装包或通用 Host 文件。

## 原始产品目标与本轮边界

- 用户熟悉的手机 App 式逐级返回：统一框架左上角唯一返回按钮；扩展业务控制器拥有实际历史和进入来源。右侧仅呈现当前动作的图标按钮，保留 `title`、`aria-label`、键盘和触屏。
- 网页剪藏首页与最近四条摘录同屏；正文、Markdown 优先于域名、测试页面名和时间。我的摘录继续可搜索、筛选、阅读、编辑、新建、删除、备份与恢复原列表位置。
- 保留既有 SDK / Host / Installer、同 ID 数据命名空间、权限、草稿保护、自定义 HTML/CSS/JS、React JSX、Vue SFC 及未适配工具原行为；不得创建第二导航 owner、路由、React Root、Host 或跨 iframe DOM 控制。
- 只修改 `main`，禁止分支、worktree、PR、强推；在并行源码漂移和缺少真实打包环境时不冒险覆盖正式包。唯一发布流程为现有 `scripts/build-sidebar-tool.mjs` candidate → 定向测试 → `--promote-from` → `--check-project`。

## 核实结果（GitHub 只读快照）

- 核查基线：`main` 在 2026-10-21 当前读回时为 `17cbb88eb41b39c688c1dbd4e9801f4f9986954a`。该 SHA 不是锁定版本，实施前必须重读最新 HEAD。
- R1.2 源码提交已存在；`8fab559000883d4919f358179bee06f9014b470e` 进一步将 `web-markdown-clipper` 升级至 **1.2.4**、接入 `examples/sidebar-tools/web-markdown-clipper/app.ci.json` 的 R1.2 测试，并修复预览根节点可能就是 `.clip` 时的 `.clip-hosted` 匹配。
- 逐字段对照 `tool.config.json`、唯一正式包 `web-markdown-clipper.opendesk-tool.json` 及当前 `src/index.html`、`src/style.css`、`src/main.js`、`src/notes.js`：**ID、version、capabilities、HTML、CSS、JS、唯一 scripts[0].code 均一致**。当次包 blob `8e37fd947d1a881228f3ceea8add32939abf56d8`，notes blob `fe82b337d287abe97aeef51849a2ba8581edb26f`。这是 GitHub 文件的直接字符串核对，**不能替代**实际构建器的 `--check-project`。
- React 源 `src/ui/react/preview/sidebar-six-preview.tsx` 有 `clipper-preview`、正式剪藏 iframe 和页头操作；但当前静态 `prototypes/sidebar/react-preview/index.html` 的 HTML **及其内嵌 Base64 脚本解码结果**都没有 `clipper-preview` / `clipper-demo-nav-action` / 剪藏 stage 路径。**REACT_PREVIEW_VERIFIED = NO**，须查生成入口和 source fingerprint 后使用原构建器重生成，不能手写替代“同源 React”。
- `examples/sidebar-tools/web-markdown-clipper/preview/index.html` 与 `preview/stage.html` 提供正式剪藏 JS/CSS 加**模拟 Host 与会话数据**，已明确标记，不能冒充真实 React Host、Chrome 存储或安装验收。
- `src/ui/sidebar-tools.js` 使用 null-origin、协议、`sameInstance(source, token)` 与工具 ID 约束导航消息；`src/sidebar-tools/bridge.js` 仅派发适配工具的展示/动作消息，业务页面状态仍由 `src/notes.js` 持有。没有证据需要新路由或新 Host。
- 截至核查，无与当次 1.2.4 源码身份绑定的成功 GitHub Actions/Node/Chrome 原始回执。队列中 workflow 不等于 CI PASS。

## 隔离 JavaScript 动作核查：真实源码上的可复现 P0

对从 GitHub 读取的 `src/notes.js` 使用独立 V8、最小模拟 DOM 和 `clipNotes.*` 请求回执进行动作演练（**不是 Node、Playwright 或 Chrome 验收**）：

- 正常流程：主页 → 我的摘录 → 阅读 → 编辑；dirty 时返回触发未保存保护；放弃后回阅读；编辑保存且读回后回阅读；再返回恢复列表 `scrollTop=170`。异步写入须等至最后 `busy:false` 才可宣称通过。
- **并发复现**：列表加载完成，用户在 `#clip-search` 输入匹配词（180ms 防抖），立即点击第一张卡片；将 `clipNotes.get` 模拟耗时设为 240ms。防抖查询 `reload()` 调用 `++generation`，使 `openReader()` 在 `await store.get(id)` 后因 `seq!==generation` 放弃展示；画面停在 `library`。当前 `src/notes.js` 中 `reload` / `openReader` / `editCard` 仍共用同一 `generation`，所以这是正式源码中的可检查风险，而非已修复缺陷。
- **修复原则**：列表查询分页与详情读取分别拥有请求序列/失效代际；新查询不得无故取消用户明确点击的详情，旧详情也不得在用户离开/切页后重新打开。不要删除原 ETag、写后读回、未保存保护；在工具原 Node 测试中添加可重复的 180ms/240ms 竞争回归（以及点击两个不同卡片后只显示最后一次选择）。测试失败时先最小修复业务 owner 的 `src/notes.js`。

## 完成门禁与下一次实机执行

1. **先解决并发 P0**，在当前最新 `main` 读取受影响文件、差异及并行 owner；不要覆盖并行会话新增正文滚动相关改动。
2. 在 Mac 真实仓库运行 `node --test tests/environment/sidebar-tool-hierarchical-back-r12.test.mjs examples/sidebar-tools/web-markdown-clipper/tests/ui.test.mjs examples/sidebar-tools/web-markdown-clipper/tests/notes.test.mjs`；补竞争回归，必要时定向 Host、安全来源及其他受影响工具测试。失败必须保留断言并定位。
3. 按官方 Skill 的单一打包器运行 candidate → 定向测试/Schema/安全/哈希 → `--promote-from` 晋升**同一个**已验证 candidate → `--check-project`。如业务 JS 正式改变且 1.2.4 已安装，不得静默同版本覆盖；结合当前官方 `app:update` 合同确认合法下一个版本，确保同 ID、存储与权限不变。禁止人工直接编辑 JSON 来蒙混 package gate。
4. 修复 React 静态 HTML 未包含最新 clipper preview 的源码漂移，核对正式 React `ToolHost` 与预览同源构建证明；不要把独立 preview 模拟页头标记为正式 React PASS。
5. 启动已有 watcher（若存在），不覆盖 `dist/development` 的其他 writer；原生 Chrome 同 ID 升级，在保存旧资料后验收：首页↔最近阅读、搜索/筛选/滚动恢复、阅读→编辑→保存、dirty/discard、保存中返回、详情→设置→返回、停用/撤权/更新/卸载、不同工具与旧实例消息、触屏/键盘/浅深色。核对真实持久化/权限/同 ID 版本与安装回执。
6. 在 GitHub Actions 中找到**与最终提交 SHA 及当前业务输入绑定**的 workflow 运行，并逐项记录 PASS/FAIL/NOT_TESTED。未取得 Mac 真实 Chrome 回执必须标为 `CHROME_PASS=NOT_TESTED`、`NATIVE_PASS=NOT_TESTED`。

## 此次验证的明确分级

| 门禁 | 本次证据 |
|---|---|
| SOURCE_WIRED | 已有源码，R1.2/R1.2.4 |
| PACKAGE_SOURCE_EQUAL | PASS（GitHub 当次内容直接对比） |
| NODE_PASS | NOT_TESTED（没有仓库 Node 运行环境） |
| CANONICAL_PACKAGE_CHECK | NOT_TESTED（不能在 GitHub GET 工具内执行打包器） |
| CI_PASS | NOT_VERIFIED（未发现与当前最终候选对应的成功回执） |
| REACT_PREVIEW_VERIFIED | FAIL / STALE_BUNDLE_SUSPECTED（TSX 与提交的 HTML 脚本不一致） |
| CHROME_PASS / NATIVE_PASS | NOT_TESTED |
| UI_QUALITY_95+ | NOT_CLAIMED（仍有竞态与原生证据缺口） |

本记录不修改产品源文件、不跳过测试，也不谎称已完成安装升级或产品发布。
