# Extension UI System R2.3 · 本地增量验收

- 日期：2026-10-25（Asia/Shanghai）；owner：Codex `01a1735d-89af-7ec2-93e9-f17a3eff600e`；状态：CHECKPOINT_COMPLETE / GOAL_INCOMPLETE。
- 初始 main：`e4bcd1f397d06dd3170ee2f499429e864a8594d0`；fetch 后与 origin/main 相同。
- 当前阶段：六项目标的正式交付核查；先实际语言入口，再补缺失验证。历史核心成功不重跑，未经验证不计正式 PASS。
- 写入范围：本文、`docs/api/sidebar-tool-localization.zh-CN.md`、`tests/environment/sidebar-tool-locale-packs-r21.test.mjs`；发现正式 CSS 失败后增加 `src/ui/react/main.tsx`、`src/ui/react/tabs/locale-manager.tsx`、`tests/environment/react-sidebar-style-bundle-r23.test.mjs`、`tests/environment/extension-center-locale-manager-r21.test.mjs` 与原生成物 `prototypes/sidebar/react-preview/index.html`。独立证据 `artifacts/extension-ui-r23-local-20261025/`；不复制 JSX、不建新画廊。
- 并行保护：ChatGPT bridge/send-queue 正在修改 `src/ui/tool-shell.js`、`scripts/bundle-provenance.mjs`、Native/MCP 与相关测试；全部只读。Prompt Shortcuts 业务、可信源码及包晋升归独立 workflow。无 SDK/权限/安装合同变更。
- 资源：只读核对现有 watcher `npm run dev` PID 36366；不重启、不覆盖其 `dist/development`。现有 demo 服务 PID 68658/43111 保留。仅通过原生 CUA 打开原语言验收 CFT（PID 64677、155.0.8059.39）的新版本页及现有 demo/Side Panel，不停止/复制/删除 Profile。四个原生子 agent 分工核查 CI/包、预览/架构、国际化与最终样式 diff，不操作浏览器；独立 reviewer 仅保存限定审查摘要。

## 首条真实操作

1. 原生 `chrome://version` 读回 Profile 为 `artifacts/locale-packs-r21/native-restart-20261025-b/codex-cft-locale-r21-retained/Default`，加载参数为仓库 `dist/development`。
2. 原 demo 标签 `http://127.0.0.1:43111/demo-form.html` 仍有日语「ページの目次」及章节列表。这是已加载旧内容的观察，不能证明当前包可重新加载。
3. Chrome 扩展菜单 → OpenDesk Browser Developer → Side Panel：真实显示「无法访问您的文件」「ERR_FILE_NOT_FOUND」，实际扩展 URL 为 `chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf/sidepanel.html`。
4. 磁盘只读核对 `dist/development` 为空；bridge workflow 同样记录 watcher 重启失败后输出缺失。分类为共享开发环境 `BLOCKED_BY_OTHER_OWNER`，不是 LocaleManager 产品故障；不重复构建、不改共享 watcher/pin 来制造通过。

当前运行模式：开发入口已阻塞，serve 连接与当前构建指纹无法确认；不是有效的持续开发 PASS，也不是 production 候选。

## 完成条件与证据规则

核对原语言八项及 R2.2 体验的输入/证据、当前 CI 原始结果、原生成器与 HTML、Prompt Shortcuts 安全来源与包一致性。仅本轮所有权的真实故障可修复。生产安装/升级/数据保留需绑定稳定正式候选，缺失即 NOT_TESTED；六维无运行证据则 NOT_SCORED。未解决本轮 P0 时不宣布 R2.3 达标。

## 已确认的跨对话去重

原 R2.1 的八项原生成功保留于 `artifacts/locale-packs-r21/native-core-20261025-a/` 和 `native-restart-20261025-b/`，受测 TOC 1.0.10 包 SHA `8d6bf170c92f3093de34f1401f49897d9734f740a0deef87076666a548cc39f0`。`09-export-verification.json` 证明重启后导出仍为同一55条日语，完整原生操作见原交付记录。R2.2 原生 revision `966ab4c6e17304470c1563f1a386cfe276975d02b55efc889ae1dcea47cc6338` 的即时切换、跟随/独立、重开与焦点记录仍是原候选事实。

本次 `source-and-runtime.json` 将当前输入与 R2.1 的 `staged-source-hashes.json` 比较：`app-localization.js`、日语样例字节相同；LocaleManager TSX/CSS、tool-host、locale-packs、生成器、React HTML 和 TOC 正式包均不同。因此保留历史原生 PASS，不将其整组提升为当前生产候选 PASS；不重跑旧八项来增加测试数量。共享 `tool-shell.js` 当前 diff 属于 Bridge 的 `check-delivery` 路由，不由本轮改动。

### 最新相关 CI 原始结果

只读 agent 通过 GitHub 连接器读取原始 job 日志（当前 PATH 无 `gh`）。相关候选为 `b7fb4d907d5075d9663c3d0739ab751ab5b77ad2`，在本轮 CSS 修复前，至 main `9d4a082c205c94249d19bbde8f9e1fd11cd77b75` 的104项相关预览输入无差异；无关 Native/MCP 提交不触发重跑。下面 PASS 保留原候选身份；本轮 CSS 引入方式修复已改变 bundle/HTML 哈希，新产物 Chromium 不借用旧 PASS。远端原始日志本轮已读但未另行下载落盘，本地审查摘录不能冒称完整原始日志副本。

| 结果 | 分类 / 本轮动作 |
| --- | --- |
| [40196870927 / job 121179493378](https://github.com/shopable-ai/opendesk-browser/actions/runs/40196870927/job/121179493378)：Showcase Chromium PASS，R53 列表/卸载/搜索/过滤/详情/位置/导入 Sheet PASS | `DONE_VERIFIED`，Chrome 156.0.8078.47，预览 SHA `f42b47f5585932aaef4ddf7c6d45c9dd408a7b23f2f7e4a427d16d1f6f151498`；直接继承，不重复执行 Escape 或 R53 数据数量修复 |
| 同 job 六 Tab 契约 4 PASS / 3 FAIL | `BLOCKED_BY_OTHER_OWNER`；不是 LocaleManager 真实故障证据。production/安装步骤 SKIPPED |
| [40196870797 / job 121179493011](https://github.com/shopable-ai/opendesk-browser/actions/runs/40196870797/job/121179493011)：production/development 固定 Bridge 构建失败 | `examples/programs/chatgpt-send-queue/src/site.js` 可信来源守卫拒绝；Bridge owner 当前另有未提交修复，旧 CI 不能证明该修复已部署 |
| [40196870736 / job 121179492128](https://github.com/shopable-ai/opendesk-browser/actions/runs/40196870736/job/121179492128)：Prompt adapter/nonce/ETag/readback 43/43 PASS，随后 admission/iframe 139 PASS / 9 FAIL | 不能称 Prompt 全绿，后续来源/包检查 SKIPPED；保留独立 owner |

三项契约失败：`sidebar-six-react-preview-contract.test.mjs:94` 要求旧 `schedule-runner-secondary`，实际入口已在 `my-page.tsx:182` 页首动作；`:154` 要求共享 Provider 模式下不渲染的旧 `workflow-connection-line`；`:198` 的旧建议按钮选择器期待 fill/read，实际为空。前两项为旧布局/DOM 契约漂移，最后一项尚不足以断言产品退化。分别归 My/Schedule 与 Workflow/共享 Provider owner 按正式合同修断言或补实操；本轮不修改测试，不恢复旧 UI。

### Prompt Shortcuts 与正式构建的来源边界（初次观察及最新增量）

`npm run app:update -- prompt-shortcuts --check` 退出0，输出 `READY_WITH_VERSION`、1.1.19、`installed:false`、`chrome:NOT_TESTED`；该状态只报告可更新版本。正式 JSON 仍1.1.18，包含 `ps-detail-back`，SHA `7158d16bff8143bef8a6a4ebac54b0fecbf6dba364025ed192c27e397ed0d116`，不满足源码/包一致。

- 初次观察：Prompt `trusted/page.js` 当前 Git blob `ea05936c72c430cb48f62db1e1d2030d1145d82d`，审核 pin 仍 `cb7dcbd4733ba546c4b50790433f1b3cb4e3fd6f`；TOC `trusted/locales.generated.js` 当前 blob `ffdfc72c479bb16ef27e60eda26255b43870e4ae`，pin 仍 `0484bd67fadb23a88c6a7164435d5bf90acd8295`。
- 后续并行事实取代上述阻断状态：Bridge owner 的 `ai-chat-bridge-r13-20261025.md` 记录 Franklin 已独立审阅上述字节及 conversation/view 差异，工作区 `scripts/bundle-provenance.mjs` 精确 pin 已匹配。该文件仍由原 owner 修改，本轮没有修改或提交这些 pin；不能继续把旧 pin 漂移说成当前工作区仍失败。Prompt 正式 JSON 的版本差异及安全包晋升仍归原 Prompt workflow。
- 最终 fetch 又收到 Prompt/AI Scroll owner 的 `03f7cda72c5c2f19855ca4562e79a2407547ea70`，已安全 fast-forward 到本地主分支，未覆盖任何 dirty 文件。它移除 Prompt 中的导航业务及 `trusted/conversation-sites.js`，`trusted/page.js` 最新 blob 为 `96290d6c96b957bf530c37f67bb74ddbc4b8d6fb`；前述 Franklin 审阅只针对旧 `ea05936…`，不能覆盖这一新提交。本轮只记录新的来源/包交接，不重做该 owner 的实现或擅改 pin，也不重复全量构建。

当前 main 尚未包含并行 Bridge 的整套未提交修复，日常开发输出仍为空。Mac production、正式 JSON 安装升级及当前包数据保留 `NOT_TESTED`。本轮仅因下面新发现的实际 CSS 构建故障，使用独立物理源码快照复验原 production 打包器；不向共享输出构建、不安装混合未提交候选。

## 本轮最小增量归属

独立国际化复核发现 `sidebar-tool-locale-packs-r21.test.mjs` 仍要求导入时选择 fr，API 文档也仍写“包与目标语言同次保存”。最新 `locale-ux-r23.md` 明确资源维护不切换语言，并已有1.0.11的实际导入操作证据；不能让产品退回旧行为。本轮扩展写入仅为 `tests/environment/sidebar-tool-locale-packs-r21.test.mjs` 与 `docs/api/sidebar-tool-localization.zh-CN.md`，二者当前无未提交差异，未发现活跃同文件落盘者。先运行单条旧断言定位失败，再同步该测试及对应文档；产品源码、存储 schema、权限和包不改。

上述“无未提交差异”是取得文件归属前的观察。本轮最终同步四处旧前提，均明确选择语言后再验证投影/通知/容量；新增断言证明首次导入保持跟随、独立 fr 时导入 de 不改变选择、完整包对象原子写入及显式恢复跟随。没有删除安全/容量/并发断言。单条旧测试先 FAIL；最终完整文件16/16 PASS，见 `locale-import-before.log`、`locale-pack-regression-after.log`。独立 reviewer Anscombe 最终 PASS，摘要 `i18n-review/locale-contract-diff-review-20261025T141645582779Z.json`，未重复执行测试。

### 新发现的正式 CSS 打包故障及最小修复

Bridge 的真实原打包日志 `artifacts/ai-chat-bridge-r13/build-r13-current.log` 显示所有41入口编译后，被原包校验拒绝：`Unexpected packaged asset: tool-shell.css`；对应摘要的714项输入当时与工作区一致。LocaleManager side-effect import 触发 Vite 输出根 CSS，正式 Side Panel 只引用固定 `ui/tool-shell.css`，该额外 CSS 未被引用。这是本轮 UI 所有权的真实交付失败，不能归给 Bridge 或放宽包白名单。

修复仅把原 `locale-manager.css` 用 `?raw` 引入 `main.tsx`，追加到已存在 `style[data-opendesk-trusted-react-css]`；移除组件 side-effect import。CSS 字节未改，唯一 React Root、Portal、生命周期与权限合同不改。独立 Architect Ampere 源码复核通过该方案。

- 新 Vite IIFE 回归先真实复现额外 CSS asset；修复后1/1 PASS，验证无额外 asset，AST 中包含完整规范 CSS。日志 `style-bundle-before.log`、`style-bundle-final.log`。
- 中间两版测试只因字符串引号/模板表示差异失败；改为解析后的 Literal/无插值 TemplateLiteral 全量字节比较，不要求生产代码迎合测试表示。原中间日志保留，不把其称全绿。
- 原组件 compile 测试仍期待独立 CSS asset，现同步为不得输出脱离 Root 的 asset，定向1/1 PASS，见 `locale-component-compile.log`。
- 原单 Root/正式页面 SSR/转义/无第二 Host 五项 PASS，见 `style-regression-after.log`；此日志包含前一版 CSS 断言失败，该项以最终 `style-bundle-final.log` 取代。
- `node scripts/check-source.mjs` PASS：1170 文件及固定入口/CSP/MIT 合同；`git diff --check` PASS。无权限、SDK、Installer 或第三方库变更。

### 原 production 打包器复验

独立目录 `artifacts/extension-ui-r23-local-20261025/source-snapshot/` 由当前指定源文件和依赖物理 APFS clone 组成，不是 Git worktree、符号链接或日常加载副本；使用独立 guard43173、独立 `.wxt`/dist/证据。预备快照首次缺失官方 catalog，在编译前报 ENOENT，保留 `snapshot-preflight-missing-catalog.log`，补齐唯一 catalog 声明的54个原发行输入后才运行构建。此环境补齐不修改产品。

原 `npm run build` **PASS**，112 assets，packageHash `f0c11683e90a8432b28d3d48a554842d7d5c0630b1b9dda173793f7a08e33473`，714项输入、构建期间零漂移、无根 `tool-shell.css`；未放宽任何包、来源或 CSP 校验。原始日志 `build-production.log`，原打包器完整收据 `build/build-production.json`，摘要 `production-snapshot-result.json`。原有体积告警（sidebar-tool-host剩14861 B及SW/Settings软阈值）保留，未提高预算。

这是修复实际 CSS 阻断的独立静态快照 BUILD_PASS，**不是当前工作区整包或正式安装 PASS**。复验后发现 Bridge owner 又修改 `scripts/bundle-provenance.mjs`、`src/native-agent/chatgpt-fixed-bridge-page.js`，并新增 site adapter；最终 main 又收到上面的 Prompt 提交。输入差异保留在摘要，未追赶重建其他工作流。当前正式生产候选尚须原 owner 稳定/审阅来源；本轮没有安装此混合未提交快照。

### 当前 React 同源预览

初次 `--check` exit0，104项输入与旧 CI 无漂移，所以没有重生成。之后实际修复改变两项源码输入，才使用原生成器再生成并 `--check` exit0：

| 身份 | 当前值 |
| --- | --- |
| HTML | `prototypes/sidebar/react-preview/index.html`，1554675 B |
| HTML SHA256 | `f97fc37ca2fbba565b4fa7fd41bbc9ceb8703c87da906fa12981a6740df3069f` |
| inputSha256 | `8a0a3c861c690a57b5e982fc0424feed32baf8cbd53a2570f40b22b554e74907` |
| bundleInputSha256 | `af797facc7d665f0d54ea67a4841da97331e89df046119764ab3111a75543cb9` |
| 入口 | `prototypes/sidebar/extension-ui-showcase/index.html` 继续引用同一 React HTML，未复制组件或手改生成 HTML |

日志 `preview-regenerate.log`、`preview-check-after.log` 记录完整104项来源。单 Root、唯一 Tokens、`UI_PREVIEW_ONLY`、禁止远程连接与真实 Host/安装/权限/模型的源码边界保留。预览语言使用专用 localStorage，组件复制按钮可写剪贴板，不能笼统声称所有操作只在内存。

原 Chromium156.0.8078.47 的320/360/400/440/960浅色、360深色与 Escape/焦点记录保留原 HTML SHA；新 HTML 的运行、全键盘及三语组合 `NOT_TESTED`。本轮内置浏览器拒绝 `file://` 并明确禁止换入口绕行，因此未用 HTTP/其他浏览器绕过该拒绝；没有新增本机离线交互 PASS。Quick Notes 独立共享来源锁输入未修改，不运行无关 `--update-lock`。

### 六领域独立复核与产品评分

三名初始独立 reviewer 加一名最终样式 reviewer 覆盖六领域；不是六次独立原生验收。

| 领域 | 结论与证据边界 |
| --- | --- |
| 产品设计/效率 | R23 已记录全局、工具独立、跟随、预览确认及重开；当前入口不可重新进入，正式完整闭环未证 |
| React/组件复用 | Pascal、Ampere：唯一 Root 与原组件/样式管道复用；没有第二 UI 框架，新增样式修复的包验证与浏览器层分开 |
| 国际化/资源 | Anscombe：当前 en/zh/ja99键及占位符匹配；修正四处旧测试前提，保持导入不切语言；历史55条导出与当前样例匹配 |
| 无障碍/焦点 | Pascal：原候选 Escape、分层关闭及部分焦点有证，新产物全键盘/三语覆盖未执行，不评分 |
| 权限/数据/安装安全 | Maxwell：Prompt 正式包版本差异，安全/admission失败归原 owner；不晋升、不改 pin 或安装身份，升级数据未证 |
| 反方/证据可信度 | 候选、环境、证据层级异质；禁止把 NODE/SSR/Vite/旧 Chromium/开发安装合并成当前 Mac production PASS；没有正式升级证据 |

| 产品评分维度 | 独立得分 |
| --- | --- |
| 视觉一致性 | NOT_SCORED |
| 交互易理解程度 | NOT_SCORED |
| 架构复用 | NOT_SCORED |
| 可维护性 | NOT_SCORED |
| 扩展兼容性 | NOT_SCORED |
| 验证可信度 | NOT_SCORED |
| 算术平均 | NOT_SCORED（缺数值，不能计算） |

方案源码审阅有证，≥95/100正式产品分没有当前稳定 production/安装升级证据，故不编造数字；平均分不抵消 P0。

## 当前六目标状态及资源交接

| 原始目标 | 当前分类 |
| --- | --- |
| 单一可信设置启停 | SOURCE_WIRED；原预览证据按旧候选保留，当前 Mac入口 BLOCKED_BY_OTHER_OWNER |
| 语言完整操作 | 原 R21/R22/R23开发候选的已记录操作 DONE_VERIFIED；当前 source/Node有证，正式升级与故障恢复原生 NOT_TESTED |
| 共享交互组件 | SOURCE_WIRED；保留原组件及局部 Chromium，当前完整键盘组合 NOT_TESTED |
| React 同源离线预览 | 当前生成/来源检查 DONE_VERIFIED；新 HTML运行 NOT_TESTED |
| Prompt 正式包 | BLOCKED_BY_OTHER_OWNER：源码1.1.19/正式JSON1.1.18；本轮未接管源码、pin或晋升 |
| 自定义HTML/React/Vue及SDK兼容 | 本轮未改变其合同；当前正式安装/升级兼容 NOT_TESTED |

本轮不重做 R53 数据数量、旧 Escape 修复、组件开发、历史原生八项或三项异主 CI 断言；不恢复旧 Workflow/定时计划布局。CSS修复造成的新输入只触发受影响的包/Root/来源验证。

当前最重要后续动作：共享 dev writer 的 Bridge/开发环境 owner（`01a17350-d6d6-7371-b365-71632bafde22`）按其已记录的受控恢复方案恢复原 `dist/development/sidepanel.html` 与 serve 连接；本轮不停止其进程或替换加载目录。恢复后由当前 UI owner 从真实“扩展→语言与翻译”补当前候选增量操作，再在独立稳定正式候选进行安装升级。原 CFT/Profile/demo服务均保留，本轮浏览器已停止操作；独立原生子 agent 任务结束后关闭。

最终 `final-input-check.json` 在 main `03f7cda72c5c2f19855ca4562e79a2407547ea70` 上逐项比较新预览104项输入，零漂移；当前 `dist/development/sidepanel.html` 仍不存在。独立快照构建已结束，guard正常释放；不触碰其他服务/窗口。只暂存本轮8个文件并安全 main 提交/正常推送，其余 dirty 文件与所有权保留。共享 Git 提交事务后释放。

R2.3正式目标未完成。Native goal 仍 active，未暂停/迁移/伪报 complete；本轮检查点不意味着正式验收通过。

## 后续增量：生产原生操作与最新 CI

本对话继续拥有 `locale-manager.tsx`、`extension-center-locale-manager-r21.test.mjs`、本记录及原生成 React HTML。最新 CI `40202919561/job121197701725` 的同源检查通过，Chromium 在高级管理展开后立即 Escape 时超时，属于本轮待定位增量；仅补快速展开/分层关闭回归和必要修复。独立 reviewer Singer 只读复核，不占源码或浏览器。

### 新 Mac production 实操，取代“本轮没有加载快照”的旧状态

为绕开共享开发输出缺失，按既有 Chrome 隔离启动 Skill 启动本对话独立物理 CFT 副本及临时 Profile，加载上面已构建、此后未修改的 production 快照。真实 Mac CFT155.0.8059.39 arm64 / macOS26.5.1，MV3版本0.1.0 Standard，实际 ID `jmheceahaoolgdgnoobjgoceomohjcpk`，packageHash仍 `f0c11683…`；未改 Native 配对或日常加载路径。这是独立 unpacked production 候选，不能称当前整份 main 的正式交付包。

实际完成：正式五 Tab打开；Reading TOC1.0.11自动显示；扩展→语言；全局 English 保存后管理界面和跟随的网页目录即时变英文；工具独立日本語后网页目录即时变日文，管理界面保持英文、正文保持原样；工具下拉仅 Follow/en/ja/zh-CN；高级管理正常显示55/55资源和原生文件入口。`native-production/01-version.*`、`02-language-initial.*`、`03-global-en-tool-ja.*` 为实际 AX/截图，完整边界见同目录 `result.json`。

打开导入文件框后，CUA 路由到了并行 Send Queue 的同名 CFT 文件框；按精确 `.app` 路径重新绑定仍未隔离，已立即停止输入。没有确认导入，不把串窗当 LocaleManager 故障。该 production Profile 的导入预览/确认/取消/导出/补译、关闭重开、JSON安装升级与数据保留、HTML/React/Vue兼容均 `NOT_TESTED`。未修改任何并行文件或关闭其窗口。仅核实并 SIGTERM 自己的PID35784，启动器退出0并清理自己的临时Profile；本轮浏览器资源已释放。其他 CFT、watcher、demo服务保留。

### 当前 CI 差量与 Escape 最小修复

此前修复已 main 提交/推送 `ccf62a74b99eae637de9ccb18269fffab0fa23e9`。最新相关 [R5.3 run40202919561 / job121197701725](https://github.com/shopable-ai/opendesk-browser/actions/runs/40202919561/job/121197701725) 在该提交上来源三步通过；HTML SHA `f97fc37…` 的320/360/400/440/960浅色及360深色均无横向溢出，菜单、弹窗、输入、Switch及真实语言面板共九项交互通过。随后高级管理打开后立即Escape超时，后续列表、六Tab与包检查SKIPPED，不能称本次R5.3全绿。原始日志 `latest-ci/r53-job-121197701725.log`。

根因源码：summary默认动作先改变原生details.open，异步toggle随后才更新React；中间的Escape可能读取旧maintenanceOpen，错误关闭整个Host。独立Singer认可这是合法快操作竞态；该次CI超时本身没有Host关闭快照，不能过度断言其具体分支。修复仅summary点击中preventDefault并函数式提交原有maintenanceOpen，保留onToggle回读和原共享Dialog，不加等待、不改全局Escape。

`maintenance-queued-toggle-before.log` 在旧源码上模拟原生默认动作及尚未派发的toggle，首次Escape后仍open而FAIL；修复后完整组件与正式样式定向回归50/50 PASS，`maintenance-component-final.log`。模拟DOM只证明逻辑，不冒充Chromium或原生时序PASS。完整文件首次47/50时的三项为旧测试问题：异步控件未出现就读disabled、日语资源标题已经本地化为日本語、原文一词可在中日同形；仅同步断言/等待前提，不改产品资源或减弱存储/未知结果保护。中间失败日志保留。

另 [六Tab run40202919518 / package-gates121197701410](https://github.com/shopable-ai/opendesk-browser/actions/runs/40202919518/job/121197701410) 仍有16个跨模块Node失败及旧Provider文字断言（HTTPS模型 vs HTTPS Chat Completions）；production/development的直接阻断是 `examples/programs/chatgpt-send-queue/src/site.js` 不得进入可信固定包。分别交原扩展中心/Debug/My-Schedule/Workflow及Bridge来源owner，不以恢复旧UI、放宽来源或接管pin来修绿。其原始完整日志 `latest-ci/six-package-job-121197701410.log`。六Tab另一个渲染job读取时仍在运行，不冒称最终结果。

### 当前生成物、剩余边界与资源

Escape源码改变后才用原生成器更新HTML，`maintenance-preview-generate.log`、`maintenance-preview-check.log` 来源检查PASS，104项当前输入零漂移；HTML1554735 B，SHA256 `512dd47fcb8f3baec00cd4f1f4b64bce9a0aad6dabcfdbdf79465cd3b36019c1`，bundleInputSha256 `24c548c1dcf3c600b0c9577c4b09da5c490ed4a4616a11c5a616f9aa681c3cf9`。新HTML和Escape修复的Chromium/原生复测仍 `NOT_TESTED`；上面Mac操作属于旧静态快照，不含新Escape补丁。没有另启浏览器或CDP绕过内置预览入口拒绝。

最新 `app:update -- prompt-shortcuts --check` 仍 `READY_WITH_VERSION` /1.1.19 /installed:false /chrome:NOT_TESTED；正式JSON1.1.18差异、安全审阅及晋升继续 `BLOCKED_BY_OTHER_OWNER`。未触碰包、业务、pin、打包器或CI。远端新提交仅Knowledge Answers/独立热预览示例，已安全fast-forward至 `73f280a46cdcbef051f9b844a1de34c81fae3a5a`，与本轮来源无交集，不重跑无关构建。

本次只提交上述Escape源码、对应测试、同源HTML与本文四文件；并行Bridge/Send Queue的所有dirty保留。无新增依赖、组件、Host、SDK、权限或安装器。六项正式评分和平均继续 `NOT_SCORED`：已有局部Mac及Chromium证据，缺少当前最终候选完整原生闭环和正式升级。下一条本轮操作为新Escape候选的Chromium分层关闭复验，随后需可独占的原生UI完成生产语言导入/重开与真实升级；当前包来源稳定仍依赖Bridge/Prompt原owner。

独立 reviewer Singer 对最终四文件差异给出 COMMENT：无必须修改项，支持最小修复；三处断言修正未削弱安全保护，新增回归覆盖延迟 toggle 与分层 Escape。reviewer 未自行执行测试，修复后 Chromium 仍 NOT_TESTED。完整结论保存 `maintenance-independent-review.json`。Git 事务仅含本轮四文件，提交后释放；不包含并行 dirty。
