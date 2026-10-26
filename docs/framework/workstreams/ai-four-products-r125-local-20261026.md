# AI 四产品 R1.2.5 LOCAL · 本机原生安装

原负责人：Codex 对话 `01a176d6-c6b3-7160-8672-f3e06b024942`；本次接收方 `01a176f8-97f4-7de3-90ef-4f2bfc253837`。2026-10-26 用户再次要求创建新对话，并明确“避免重复执行、增量测试、很多已经完成，只是从一个扩展拆成多个”。最新交接状态见文末，旧阶段叙述只保留历史证据，不恢复全量验收。

## 目标与门禁

先全新 Chrome Profile 加载同源冻结 production 候选，验证 Prompt 默认预装及只填草稿不发送；再经现有 Page 导入界面安装 Scroll 0.4.0/r1，验证三站权限与独立生命周期。没有这些原生证据不批准 Scroll 官方发行。Mind Map 无许可保持 BLOCKED_LICENSE；Send Queue 无最新业务 owner 交接只读。

验收证据依次为真实 UI 操作、安装持久读回、精确源码/包哈希、相关定向测试和同源晋升。未执行及失败项保留原始结果，不以 Node/CI 代替 Chrome。复用 R122/R123/R124/R125-WEB，不重复业务实现。

## W0 与最小所有权

- 起始本地 main `20791f48d97c1021b229195d8bc61ae8a13476d0`；远端实读 `3690552e1693dc0fc2d75de694ebc2fbd7c95b7c`。两侧独有提交文件集合互不重叠，正常 merge 保留双方工作；不建分支/worktree/PR。
- 保留他人未提交 `docs/framework/workstreams/ai-knowledge-answers-r132-local-20261026.md`、`examples/sidebar-tools/dev-hot-preview-p0/README.zh-CN.md`，以及后续新出现的其他 owner 文件。
- 本对话写入：本文；独立 `artifacts/ai-four-products-r125/` 原始证据与冻结输入；经 owner 核对释放后才接管 Prompt 唯一正式 JSON。`official-pages/sources.json` 仅在真实 Scroll 门禁达成后改批准状态。来源 pin 只在证实固定 bundle 实际阻塞并完成审阅后最小修改；写前重新核对 owner。
- 只读子 agent Kepler：固定 bundle pin/导入链、Mind Map 许可与 Queue owner 状态；不写文件、不操作 Chrome、不运行构建。
- 不占用日常 Chrome/Native。日常 watcher npm PID 76837 / node PID 76857、`dist/development` 和 `.wxt/public` 留原 owner；开发端连接由原 owner 管理，本轮未以进程存在冒充连接 PASS。
- 独立 production 快照/输出及全新 Profile 由本对话独占，后续记录真实路径/PID/ID。没有第二个 dev watcher。不更改 Native manifest 配对。

## 已完成与证据

- 正常 merge 后冻结源码 `e8f6070ab75b165eb45363810bb7319c778db83d`；快照为 `artifacts/ai-four-products-r125/frozen-source`，归档 SHA256 `385a842bb1a8482918d60829508e4ec8eaeb456edf34ee427b9c622e8ed51e26`。不是 worktree。独立 production 构建 PASS，Browser package SHA256 `e4fcae3b09f9854756ce997d09605cc3f7846b10ee24d67d89b7d02b0bef68de`，receipt `build-evidence/build-production.json`。初次 node_modules 软链接被来源守卫拒绝；改用本地克隆依赖后通过，未放宽守卫，失败日志保留。
- 用户明确答复「已释放，由本对话完成晋升」。原 builder 生成 Prompt candidate；`node --test` 对 trusted-prompt-admission、sidebar-default-preinstall-r48、prompt-shortcuts-r14-management、prompt-shortcuts-r14-scroll-navigation、prompt-shortcuts-r16-persistence、sidebar-tools 六个文件结果 105 PASS / 0 FAIL / 0 SKIP，原始 `prompt-targeted-tests.log`。随后 `--promote-from` 返回 PROJECT_PACKAGE_PROMOTED，`--check-project` 返回 PROJECT_PACKAGE_MATCH。
- Prompt 唯一正式 JSON 已修改但未提交：1.1.19，143608 bytes，SHA256 `a041ded61a10f4c2b0b78918e77207f9723e8aa1388f5943302737fe23f97474`，Git blob `5438fe970e37a24064b36d9eb1801b71a2c11307`。正式 JSON、candidate、已加载 Browser 内的 official-tools 资源逐字节相等；所以旧正式 JSON 1.1.18 不曾造成这次新 Profile 预装失败。
- CFT 155.0.8059.39，独立 Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-o_rmrl1g`，实际 ID `aefmgiiajjfjpgajdbjibgfodcanpejg`。Chrome 原生详情显示加载本轮 frozen-source/dist/production。真实 SIDE_PANEL 五 Tab，Prompt 首次默认预装 complete、仅一条安装记录；新建/保存/关闭重开成功。真实 ChatGPT 未登录页的闭合 Shadow DOM 提示词按钮实际点击后，已有草稿保留并追加测试提示词，user/assistant messages 均为 0。站点有 conversation/prepare POST，不能表述为无网络请求；未观察到消息提交。证据 `fresh-first-storage.json`、`prompt-after-save-storage.json`、`prompt-native-draft-proof.json/png`、`native-cdp.jsonl`。
- Scroll 复用正式包 0.4.0/r1，Git blob `3d120ce0864596bb7172653f0773adf08abec194`，sourceHash `7e7f8377447e176cf9fa3bed1848f9e6979af7143e10279ad1fc15bcbec5a9bd`，packageHash `7500942dc0c2115f80a14342ccabc1031f23b47e5ead7b71547f4842844a3d4a`，未重建/修改。原生扩展中心导入显示三站范围、顶层网页与新 ID；取消后没有安装，确认后未伪报成功。

## 真实 Scroll 阻塞与下一条操作

Chrome 默认用户脚本开关关闭时返回 E_PAGE_INSTALL_PENDING，未自动重试。经 chrome://extensions 原生开关授权后，安装恢复仍 E_EFFECT_UNKNOWN「原生注册内容尚未确认」。Authority installationId `9ab5d810-e421-4f95-a313-224fe8d5be1b`，r1/sourceHash 正确，nativeState blocked；清理后 getScripts=[]。停用操作可确认 disabled 和空原生清单。

通过只读 CDP 断点捕获真实 getScripts：matches 回包为 DeepSeek、ChatGPT、Gemini，期望为 ChatGPT、DeepSeek、Gemini；其余注册字段一致，excludeMatches 省略已被现有代码正确归一化。`src/scripting/user-scripts/installed-programs.js` 的 nativeEqual 按数组顺序比较，导致错误拒绝等价范围。原始 `scroll-native-registration-mismatch.json`、`native-sw-diagnostic.jsonl`，最终 UI `scroll-final-blocked-detail.txt/png`。调试暂停过久后的 Worker deadline 是诊断产生的另一个 unknown，不能混作原始产品错误。所有断点已移除、Debugger 已 disable 后恢复执行；没有修改运行时源码。

接收方先确认无其他 writer，最小修复 nativeEqual 对无序 matches/excludeMatches 的比较，保留精确代码、世界、身份、时序和范围增删的拒绝；添加相应 Chrome 排序读回及扩权/代码变化负例。然后定向测试、独立构建新候选，重新通过原生 UI 安装和三站真实导航/生命周期。旧候选证据不能冒充修复后的包。未满足全部门禁，official-pages/sources.json 继续 blocked。

## 独立阻塞与未测

- conversation.js 当前 blob `ea1dcb3114175c2b79e134df1794a1fdd93460c9` 不进入当前 Prompt 固定导入闭包；旧 cca839ec pin 不阻断实际构建，保持不改。
- Mind Map 许可 review redistributionApproved=false，BLOCKED_LICENSE；四个原始 vendor 资源共 4042573 bytes，不代表生产许可/完整正式资源通过。Queue 新身份及正式包仍未收到最新业务 owner 交接，OWNED_ELSEWHERE；保留最新皇冠和 FIFO/unknown-effect 保护，不自动迁移旧队列。
- Prompt 历史 Profile 升级、主动卸载后重启、原生并发/存储失败/unknown-effect；Scroll 三站实际导航、恢复成功、刷新重启/撤权/卸载、旧新身份并存、官方可安装入口，以及 P1 全状态仍未验完。节点测试不替代这些证据；八维未具备原生证据的项 NOT_SCORED，平均分暂不计算。

## 移交与资源释放

- 用户授权向并行对话 `01a176f0-18a9-7cc2-8376-4e00097f7f6a`「完成 R1.2.5 AI 产品交付」发送当前进展并协调单一 writer，已发送；后续用户又明确要求创建新对话继续。本轮未提交 Prompt 正式包和本文交接给新接收 owner。Git 尚未暂存/提交/推送本轮这两文件。
- 独占 CFT 已 Browser.close 正常退出，launcher session 70289 已 exit 0；adapter-cleanup PASS、residual=[]、临时 Profile removed。原生日志/截图仍留 artifacts。接收方需要用现有 launcher 创建自己的新窗口/Profile，不能连接已释放的52033端口，也不能把旧Profile路径写成当前运行环境。
- frozen-source 和所有 artifacts 保留，可只读使用；修复后另建自己的独立快照/输出，不能改旧冻结产物。日常 watcher/Chrome/Native 未停止或配对。
- 原对话 goal 实读 ACTIVE；创建新对话不自动暂停/完成/迁移 goal，原目标尚未达成，未伪报 complete/blocked。移交后旧对话不重复操作已交接文件和资源。

## 接收方继续：原生排序修复（2026-10-26，IN_PROGRESS）

本续接对话接管原生验收与以下文件：`src/scripting/user-scripts/installed-programs.js`、`tests/environment/page-installed-programs.test.mjs`、已晋升的 Prompt 正式 JSON 及本文。起点仍为 main `e8f6070ab75b165eb45363810bb7319c778db83d`；fetch 后相对 origin/main 为 ahead 2 / behind 0，索引为空。其他 owner dirty 全部保留。

已实读原始排序差异。通用调用链仍为扩展中心真实手势 → 原 Page Authority → SW 注册 → 固定 USER_SCRIPT bootstrap → 安装身份/代际/文档核验 → 固定源码；没有新增 API、权限或业务判断。唯一运行时变更是对原生 `matches/excludeMatches` 的副本排序比较，身份、代码、world/worldId、时序与 allFrames 继续精确。新增排序回包测试先在旧实现失败；修复后两个安装测试文件共 81 PASS，九类范围/代码/身份/世界/时序篡改负例通过。日志 `artifacts/ai-four-products-r125-native-fix/page-targeted-tests.log`。

独占新的 `artifacts/ai-four-products-r125-native-fix/`、快照 frozen-source、构建守卫端口 55126、独立生产候选和后续 launcher Profile。旧 `ai-four-products-r125/frozen-source` 只读。正常 dev watcher、dist/development、日常 Chrome/Native 不占用。Scroll publication 仍 blocked，等真实门禁。

## 再次交接：只做拆分增量（2026-10-26，HANDOFF_PREPARED）

用户最新纠偏优先：已有业务不重做、已通过操作不重跑；后续只处理拆成独立产品引起的安装身份、授权、存储、注册和生命周期增量。没有新变更或证据失效，不重复测试、构建和浏览器配置；完整矩阵、原生故障注入及八维评分不作为下一阶段前置。本文历史未测清单不自动全部激活。

### 本轮完成

- 排序修复及 81 项定向测试如上；运行时 SHA256 `5faa4833009bfefb9722fccf90fe2d34b91b7b794ecf7fffaa5b48e234397906`；测试文件 SHA256 `cfbeabb664665044bbb6cada2af80ddf8e0e4af7a4edb1e1124a3615a72b4285`。没有 UI 源码修改。
- 独立新 frozen-source 基线 e8f6070，仅覆盖上述两文件及 Prompt 正式包；production 构建成功，package SHA256 `6d1d8492aaac404bf595cc43e3595b610050c355660795ea0002e1058ddcabb6`，receipt `artifacts/ai-four-products-r125-native-fix/build-evidence/build-production.json`。首轮构建因依赖克隆未完成而失败，随后依赖就绪重建通过，失败日志保留；未放宽来源守卫。
- 真实 CFT 155.0.8059.39 加载新 frozen-source/dist/production，ID `mbjianpjmiafflgmlkkpdpdhbhedjkbd`，静态 production 五 Tab。为避免 CUA 绑定其他 owner 的同名 CFT，使用临时 APFS 克隆浏览器，仅改临时 CFBundleIdentifier 为 `com.google.chrome.for.testing.r125nativefix`；未改 Browser 产品身份、日常 Chrome 或 Native。
- Scroll 正式 0.4.0/r1 原字节从真实导入 UI 安装成功；原生 matches 仍按 DeepSeek/ChatGPT/Gemini 返回，修复后 registered。停用、恢复、刷新不同文档回执、用户脚本开关撤回后新文档不执行均有原始证据。撤权后清理 unknown 时拒绝更新；关闭本任务原网页并重载同包后收敛 retired。原始 JSON 均在新 evidence 目录。
- 通过原 builder 临时生成同源码 r2，仅用于更新测试，不覆盖/晋升正式包。原审阅提示保留停用；清理确认后更新成功，installationId 相同、r2 disabled、getScripts=[]。证据 `scroll-disabled-update-pass.json`。
- 旧 `opendesk.chatgpt-jump-top` 与新 ID 可同时独立安装、active，两个不同 installationId/nativeId，证据 `scroll-old-new-coexist.json`。取消新 ID 卸载后两安装仍在；确认后新 ID 记录及注册移除、旧 ID 保留。新 ID 第一次卸载 UI 保守提示“未完整确认”，实际读回已移除；旧 ID 随后卸载 UI/回执完整成功。前者原因未确证，不猜测改 UI、不冒称所有反馈 PASS。证据 `scroll-uninstall-readback.json`、`uninstall-feedback-diagnosis.json`、`scroll-both-uninstalled.json`；只读诊断断点均已移除。
- 三站真实页面均产生固定源码启动回执；ChatGPT/Gemini 为未登录空页、DeepSeek /sign_in。没有真实长对话，实际滚动/导航按钮动作仍 NOT_TESTED；没有注入假对话或发送消息。官方目录 blocked 真实显示且无安装按钮；Scroll publication 未改，Mind Map/Queue 继续独立 blocked。旧冻结目录 blockedReason 尚是旧说明，不代表本轮安装仍失败。
- Prompt 主动卸载后扩展重载未重新预装；bootstrap complete、Prompt 不在安装列表。证据 `prompt-uninstall-after-extension-reload.json` 与对应 UI。
- 另建专用生命周期 Profile，原 launcher 最小临时适配支持同 Profile 三次启动，无个人登录资料。由 Git e8f6070 提取真实历史 Prompt 1.1.18 原包 SHA256 `7158d16bff8143bef8a6a4ebac54b0fecbf6dba364025ed192c27e397ed0d116`，经 UI 安装、保存测试提示词，再 UI 更新正式 1.1.19。安装仅一条，工具数据逐字一致，真实界面显示“R125 历史升级保留”。这是受控历史版本场景，不冒称用户个人历史 Profile。
- 同生命周期 Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-34pv376o` 从 PID 28666 正常退出后 PID 29562 重开：Prompt 版本/数据/UI 保留；Scroll 正式 r1 installationId `ffc06b44-854c-4b24-8928-c9afc4f77449` 不变、registered。真实 ChatGPT 空页新文档执行 completed，证据 `lifecycle-after-restart.json`、`scroll-after-process-restart-site-boot.json`。然后关闭空页，Scroll 停用 disabled、managedCleanup retired、getScripts=[]，证据 `handoff-stop-after-scroll-disabled.json`。

### 实际停止点、剩余与资源

- 用户要求交接时停止业务验收：Prompt 在第二 Profile 仍安装；没有执行“Prompt 卸载后完整浏览器重启不回装”，只有前一 Profile 的卸载后扩展重载 PASS。Scroll 停用后再次完整浏览器启动的持久状态也未读回，不把它写 PASS。临时 adapter 已自动启动第三阶段 PID 31267，但只为释放资源正常退出，未执行产品检查；后续是否需要补测由最新拆分增量相关性决定，不默认重启整套验证。
- 所有本轮 CFT 已正常退出：第一轮 session 40981 exit 0、Profile pa4pjbbb removed；三启动 session 57966 exit 0、Profile 34pv376o removed、residual=[]，`handoff-cleanup.json` PASS。不要连接已关闭端口/已删除 Profile。临时 browser/fixture/frozen-source/evidence 留原目录，只读复用，不批量提交。
- 最后 HEAD `d5de00e8016aba16cc1935f51ae2587b77bfe441`，main ahead 4 / behind 0 是相对本地 origin/main 的上次观察，远端应开始时只读重查。索引为空。本轮未提交/未推送四个 owner 文件：installed-programs.js、page-installed-programs.test.mjs、Prompt 唯一正式 JSON、本文（可能 ignore，精准 add -f）。提交推送已在原任务授权，交接本身不额外触发提交/构建/测试。
- 其他 owner 新 dirty 包含打包 Skill/文档、官方工具 catalog/builder/测试、Cookie README、Reading TOC 源码/文档/测试、src/ui/sidebar-tools.js、AI knowledge workstream、dev hot preview README。全部保留，开始时 git status/diff 查实际，不因它们存在停工，不夹带。日常 watcher 76837/76857、dist/development、.wxt/public 与日常 Chrome/Native 不占用。
- 本对话 get_goal 实读 null；更早原对话 01a176d6 goal 上次观察 ACTIVE，当前跨对话状态未知。创建不暂停/迁移/完成该旧目标；不伪报 lifecycle 同步。本对话移交后不重复操作文件/浏览器/输出。
- 后续先核对本轮 diff/证据对应输入，安全收尾提交；只补与独立安装使用有关的当前未完成操作。有真实内容再补三站实际导航动作，必要门禁齐备才批准 Scroll 官方发现安装；否则继续写 BLOCKED_CONTENT/NOT_TESTED。Mind Map 许可、Queue owner 阻塞不越权处理。八维均 NOT_SCORED，平均 NOT_SCORED，无虚构 95。

## 接手增量收尾（2026-10-26，LOCAL_COMPLETE）

- 接收对话 `01a17744-943f-79e3-bfc5-721a66140588` 已接管上述四个文件；起始 main/HEAD `d5de00e8016aba16cc1935f51ae2587b77bfe441`，索引为空。未接管其他 dirty 文件、日常 watcher、Chrome 或 Native。
- 实读三份交付输入的 SHA256 与上文一致，且逐字节等于 `ai-four-products-r125-native-fix/frozen-source` 对应文件。原 81/105 PASS 日志、production receipt 与原生 JSON 均可读，复用原候选的证据，不重跑测试、晋升或构建；不将其提升为新 main 整包验收。
- fetch 后远端 main 为 `9a3d7b4c86f9bda731246b76980df60615a4724c`；新增内容没有修改本轮三个交付文件。远端同时修改了其他 owner 尚未提交的 `src/ui/sidebar-tools.js`，Git 集成必须保护其现有改动，不自动 stash、暂存或覆盖。先精确提交本轮四文件，再处理远端集成边界。
- 当前不占用浏览器/Profile/端口/构建输出。Scroll 内容、Mind Map 许可、Queue owner 门禁保持原状态；完整矩阵和评分继续延期。

### 两项生命周期增量（VERIFIED）

四文件已精确提交为 `e6752699ddcce9b4f992d345a9ef6bb3189db193`，提交后索引为空，其他 owner 的全部 dirty 保留。用户随后明确授权“协调后继续合并推送”；相关 owner 释放与远端集成结果见下文。

本次仅补 Prompt 主动卸载后完整进程重启不回装、Scroll 停用后完整进程重启保持 disabled 两个未测操作。二者直接证明拆分后用户独立管理意图的持久性；已有扩展重载和运行态重启不能完全替代。复用同一 frozen-source/dist/production，不构建或晋升；新证据仅写 `artifacts/ai-four-products-r125-native-fix/incremental-lifecycle/`。沿现有 launcher 的最小两启动适配使用全新专用临时 Profile；临时 browser 沿用原 owner 已释放的独立克隆，不接触个人登录资料、旧已删 Profile、日常 Chrome/Native/watchers。安装只作为本次停用场景前置，不重复历史升级、三站业务、完整故障注入或评分。

- **Prompt 卸载持久性 PASS**：真实扩展中心确认卸载后，安装列表无 Prompt、默认预装 bootstrap 为 complete。正常退出整个浏览器再重开同一 Profile，真实侧栏仍无 Prompt，安装持久数据与 bootstrap 读回一致，没有重新预装。证据 `prompt-uninstalled-before-restart.json`、`after-full-restart.json`。
- **Scroll 停用持久性 PASS**：真实 UI 安装原正式 0.4.0/r1 后停用，重启前后 installationId 均为 `9b801f82-46f8-44b6-a392-2ebc9754425a`，enabled=false、nativeState/authorization=disabled、managedCleanup=retired、原生 getScripts=[]。没有把停用后的 UI 隐藏等同于原生清理。证据 `before-full-restart.json`、`after-full-restart.json`。
- 运行身份为同一冻结 production 包 SHA256 `6d1d8492aaac404bf595cc43e3595b610050c355660795ea0002e1058ddcabb6`，CFT 155.0.8059.39、扩展 ID `mbjianpjmiafflgmlkkpdpdhbhedjkbd`。同一临时 Profile `codex-cft-727bpfsl` 由 PID 40196 正常退出后以 PID 55889 启动；SIDE_PANEL 通过实际工具栏重开。只读 CDP 用于安装、storage 与注册读回，没有改写运行时状态或注入伪回执。`incremental-result.json` 保存两项 PASS 及四份原始证据 SHA256，收尾再次核对一致。
- 两次启动已结束，launcher exit 0；`cleanup.json` 确认临时 Profile removed、residual=[]。日常 Chrome/Native、watcher、dist/development 未占用或替换。当前无浏览器、Profile、端口或构建输出占用。

### 协调、合并与提交边界

Reading TOC 对话 `01a17717-2d50-74b1-9879-36669acf0be9` 和书签导入对话 `01a17715-a966-7121-b8f8-b78c61798aee` 均明确释放 `src/ui/sidebar-tools.js` 对应本地改动；记录为同目录的 `reading-toc-prelaunch-owner-release-20261026.md` 与 `bookmark-import-update-20261026-01a17715.md`。只保护其改动，不将其顺带提交。

准备集成期间，用户另行启动的「拉取并合并 Git 更新」对话 `01a15352-d840-7250-893d-4c0af1c2930e` 已开始 Git 事务。本对话即时停止写入并协调，由该 owner 完成远端 `cd4c2f5a268b0fbf26b62e01f2a18876cd832f7f` 的正常合并：`c2bbc45f7c5c0c9d835abfb83991b21bbcf0b4ed`。唯一 README 冲突保留两方阶段记录；该 owner 最终明确恢复 32 项原文件改动、3 个未跟踪文件并释放 Git/index/HEAD，未推送。

本对话读回确认：main、索引空、无未解决冲突；`e6752699d` 和远端提交均为 HEAD 祖先；三份已提交交付输入与 e6752699d 逐字节相等。32 项已保存文件中，31 项与备份逐字节相等；共享 sidebar-tools.js 精确等于“原 owner 改动 + 已合入远端内容”的无冲突三方合并结果。保存的 stash 保留，未丢弃、重复应用或提交。收尾核对回执为 `artifacts/ai-four-products-r125-native-fix/remote-main-integration/restoration-check.json`。

后续只提交本文验证记录并正常推送 main，实际提交/推送 SHA 以 Git 回执和最终答复为准。其他 owner 新修改的 Prompt 源码、配置、正式 JSON 等全部保留且不纳入本轮提交；本轮原生证据只绑定冻结的 Prompt 1.1.19 和指定 Browser 包，不冒充更新中工作树或合并后整包的原生验收。

### 当前可交付与后续条件

ALREADY_DONE：原业务、历史升级与已通过生命周期证据复用。IMPLEMENTED：无序站点范围读回修复、对应定向测试和 Prompt 1.1.19 正式包已在 e6752699d 保存。VERIFIED：新增的完整浏览器重启后 Prompt 不回装、Scroll 保持停用两项均通过。

BLOCKED/REMAINING：Scroll 缺三站真实长对话导航证据，仍 BLOCKED_CONTENT/NOT_TESTED、官方发行未批准；Mind Map 仍 BLOCKED_LICENSE、redistributionApproved=false；Send Queue 仍 OWNED_ELSEWHERE，未接管旧队列或产生新身份正式包。八维及平均分仍 NOT_SCORED，完整矩阵继续延期。NEXT：只有取得真实内容后才补对应导航操作并按原门禁判断发行；许可与 Queue 由其 owner 独立解除。当前授权的增量开发和验证已收尾，不自动启动这些阻塞项，也不将更早跨对话目标伪报完成或迁移。

## 本次接收：安装说明收尾（2026-10-26）

- 负责人：本次接收对话；仅写本文、`examples/programs/chatgpt-jump-top/README.zh-CN.md`、`official-pages/sources.json` 的 Scroll 阻塞说明。类型为既有 Page USER_SCRIPT，使用原 Page 安装审阅与 Authority；本次不修改业务、SDK、身份、权限、包或发行状态。
- 起始 HEAD `7b57806f790ecccf1c029682639818c2a61e7254`，main 工作区及索引干净。前 Git owner 已完成提交和推送并 idle；本次单次 fetch 后仅快进至 `941927bd5`，四项远端预览文件与本次范围不重叠，不再循环追赶远端。
- 实际说明缺口：Scroll README 仍将新包和安装写为未完成，官方目录仍以缺 Chrome 安装、范围审阅和注册回读为阻塞原因。补正式原包的直接链接及原导入入口，把当前阻塞写为三站真实长对话导航缺证；`publication=blocked` 保持。
- Prompt 当前正式包为 1.1.20，SHA256 `e93e1bde0a9fb7953fafbba1f1a71266890706f412f47f6209389c7b4afbf5ef`，与其 README 对应；1.1.19 原生升级和卸载证据只保留原候选边界，不提升为 1.1.20 安装 PASS。Scroll 原包仍为 0.4.0/r1，sourceHash/packageHash 与上文相同。
- Mind Map 许可仍 `redistributionApproved=false`；Queue 源码和正式包仍为旧 ID，未收到新 owner 交接。两项只读保留阻塞，不重做业务或迁移数据。
- 验证仅核对 JSON 说明变更、文档包链接、原包身份/摘要及既有生命周期证据。无运行时代码变化，不重跑测试、构建、打包或浏览器操作；不占用日常 Chrome/Native、watcher、dist/development、旧 Profile 或冻结输出。

## 继续后三款：真实内容增量（2026-10-26，IN_PROGRESS）

用户最新要求继续 Scroll、Mind Map、Send Queue，并明确授权需要登录时通过 Cookie Editor 使用指定 ChatGPT Cookie 文件。仅补当前可执行的核心操作；不重复已通过生命周期，不恢复完整验收矩阵。Cookie 内容不得写入日志、证据或仓库，不发送聊天消息。

本次接收 owner 负责 Scroll 实际导航及必要的账号导入，使用新的专属临时 Profile、`artifacts/ai-four-products-r126-content-20261026/` 输出和原有 launcher；旧冻结包只读复用，不重建、不占用日常 Chrome/Native/watcher。只读子 agent Turing 核对 Mind Map 许可和 Queue 身份、现有证据及 owner 边界，不编辑或操作浏览器。确认旧 Queue owner 链已收尾后，由本对话接收新身份拆分，executor Erdos 仅写 Queue 项目指定文件；两个子 agent 均已完成并关闭。

### 本轮可核实的准备结果与当前停点

- **Scroll：**原正式 0.4.0/r1 未改字节。新临时 Profile 的原生导入页显示新 ID、ChatGPT/DeepSeek/Gemini 三站及顶层网页范围。确认后真实返回 `E_PAGE_INSTALL_PENDING`，原因是该 Profile 的 Chrome「允许运行用户脚本」为 off；没有自动重试、改写安装记录或以旧证据宣称本轮运行通过。新的真实长对话导航仍 `NOT_TESTED`。
- **Queue：**源码和项目身份改为 `opendesk.ai-send-queue`，0.1.2/r1，新增 `ai-send-queue.opendesk-page.json`。新入口在启动、轮询及用户操作前避让旧活动生命周期，仅清理自身资源；不迁移旧授权或旧内存队列。旧正式 JSON、engine/site/view/CSS/资源与本轮前 HEAD 字节一致。5 项身份/生命周期定向 Node 测试、语法、项目验证、原构建/打包器及候选同源检查通过。`sourceHash=01cad4e3f16f843aea6fe722c7989b4860ea11412a3f5cb6d22c4c714bcd31f1`，`packageHash=0cc2ab295f0141b53f2351215122f05632d07f7d1dd565de55c58d81311d8441`。原生导入审阅已显示新 ID、r1 和 ChatGPT 单站范围，尚未确认安装；发送、并存及撤权仍 `NOT_TESTED`。官方清单仅纠正陈旧阻塞说明，publication 保持 blocked。
- **Mind Map：**沿用 README 已有本机验证路径，原 `prepare:local` 生成固定资源 4,088,995 bytes，SHA256 `62c195b8c7e0cd81de0f24df58c4dacb44a123cd2696e6b0bcd3483579f0197f`，与既有资源相同；原 builder 和 Page packager 生成新 ID 0.2.7/r1 本机临时候选。`sourceHash=c8156358dfe0009876cc39fdd61a814201619b4f1b9d5cf6f53753af56efa8b8`，`packageHash=e2db52f59181d25622626a92f96261edaee5daf8fc15f1d52f0b9f2aaf68ca28`。包格式、哈希、编译源码字节及当前全部输入 SHA 通过核对，输出仅在 `mindmap-local-candidate/`，旁附 `local-validation.json` 标明 LOCAL_VALIDATION_ONLY/distributable=false。未生成项目正式 JSON、未改许可或开放官方发布，新 ID 原生核心开关仍 `NOT_TESTED`。旧 ID r8 的真实开关证据保留。
- **环境：**实际复用 `ai-four-products-r125-native-fix/frozen-source/dist/production`，静态 production 候选，扩展 ID `mbjianpjmiafflgmlkkpdpdhbhedjkbd`，没有 dev serve 连接。首次 CFT155 在系统文件选择器操作中 SIGTRAP 退出，launcher 已清理其临时 Profile；这是环境失败，不登记为程序故障。随后只在本轮 artifacts 内克隆已安装的官方 CFT156.0.8078.4，使用独立 bundle ID 和 launcher，PID 75835、Profile `codex-cft-lw_zujhn`（上次观察，续接须重查）。其他实例未操作。
- **账号与权限停点：**Cookie Editor 当前要求管理所有 HTTP/HTTPS 网站 Cookie，超出指定 ChatGPT 文件的单站范围；Chrome 用户脚本开关也仍关闭。已按电脑操作工具策略提交一项合并确认，等待用户选择；未点击这两项授权，未导入账号或发送消息。指定 Cookie 文件内容未进入日志、证据或仓库。下一步仅在对应授权到达后打开允许的开关、经原 Cookie Editor 导入，再用已有真实回复测试 Scroll 和本机 Mind Map；Queue 仅核对安装与空队列 UI，不发送测试消息。


### 新接收对话：账号已登录，CFT156 开发者模式授权待决（2026-10-26）

- 接收原 Profile `codex-cft-lw_zujhn`，`check_instance.py` 实读 PID 75835、ready=true；准确应用路径及 bundle ID 与交接一致。同一静态 production 冻结 Browser 路径、扩展 ID 和三个 Page 包的 programId/version/revision/sourceHash/packageHash 均核对一致；未重建 Browser、未改源码或候选。main 从 d4762f200 正常快进到 7930c282a，Queue 的 2c0d88c97 已在 main 历史中。新的其他 owner 脏文件保留，不纳入本次写入。
- 按已有明确确认，在同一 Profile 的 Chrome 扩展详情把「允许运行用户脚本」切到 on，后续再次核对仍 on；Cookie Editor 全站授权界面已完成。系统选择器能选中指定账号 JSON，但「自定义文件」和「所有文件」均未使打开可用，改用 Cookie Editor 原粘贴导入入口读取同一用户文件，没有改写文件、Cookie DB 或 Chrome 配置。刷新 ChatGPT 后真实显示个人资料菜单，账号登录已确认；未发送消息、未操作会话草稿。
- 隐私异常如实记录：一次 AX 输出过滤未覆盖多行 JSON，导致 Cookie 预览进入本对话私有工具输出；已停止输出预览，改为严格控件行白名单。值与私人正文未写入仓库或本机证据；原账号文件保留。
- Scroll 原包导入审阅识别「此版本已经安装」，确认核对返回原 r1 blocked / `E_PAGE_INSTALL_PENDING`，提示打开用户脚本开关，与 Chrome on 状态冲突。为刷新现有运行状态，安全重载同一临时扩展；CFT156 随后显示该未打包扩展已停用，明确要求开启「开发者模式」。这是当前环境阻塞，不是已复现的 Scroll/Mind Map/Queue 业务缺陷；未修改产品适配环境。
- 新的开发者模式设置不在先前两项授权内，已按 CUA 策略单独询问，仅限同一临时 Profile；当前待用户回复，未打开、未绕过。Profile 暂留用于继续获批操作，当前 ownership 仍在本对话；测试结束时须正常退出并核对 launcher 清理。
- 脱敏观测：`artifacts/ai-four-products-r126-content-20261026/core-observations.json`。三个新身份的本轮核心内容操作仍 NOT_TESTED。Mind Map 本机候选仍 LOCAL_VALIDATION_ONLY/distributable=false、许可 BLOCKED；Queue 不发送消息；三站发行与完整矩阵、评分仍延期。

### 授权后的实际操作与本轮收尾（2026-10-26）

用户明确回复“允许，仅本次临时 Profile”。仅在原 `codex-cft-lw_zujhn` 打开 Chrome 开发者模式，实际读回开发者模式、OpenDesk 启用、允许运行用户脚本均为 on。继续复用同一静态 production 冻结 Browser，扩展 ID 和包 SHA256 不变；没有 dev serve 连接，不是新 main 整包或正式 production 验收。

- **Scroll 当前内容双向操作已观察**：恢复原安装后仍为 installationId `fe9b40cb-86a0-4988-8e05-c9a84bc97750`、r1、active / registered，固定源码仍为 `7e7f8377447e176cf9fa3bed1848f9e6979af7143e10279ad1fc15bcbec5a9bd`。在已登录 ChatGPT 的既有长回复中，实际点击「Back to start of this content」后看见内容首节，点击「Go to end of this content」后看见绑定内容区域末段。证据只覆盖该区域，不能提升为整段对话、全部内容类型、DeepSeek/Gemini 或三站正式通过。后两站仍 NOT_TESTED，官方目录保持 blocked。
- **Mind Map 新身份安装及两轮核心开关通过**：原 Page 导入入口审阅并安装 `opendesk.ai-reply-mindmap` 0.2.7/r1，本机候选 sourceHash/packageHash 与上文一致。详情为 installationId `fcb12cd7-fb43-4bf8-b656-87ef6c80adb9`、active / registered、r1、固定源码 `c8156358dfe0009876cc39fdd61a814201619b4f1b9d5cf6f53753af56efa8b8`。同一已有回复实际打开第一轮 XMind，截图观察到绘制的画布；第二轮再次出现 XMind 只读画布与操作栏。两轮关闭后画布均移除，等待过渡完成后的规范化回复 AX 均与基线相同（8357 字符，SHA256 `6c796e7203e6de8b6f9eda6dd0a22c6e82823b34cfd051c03b63de12f6b01762`）。这是 AX 原文恢复证据，不是 DOM 字节比较、控制台零错误或全部生命周期验收。触发器本身是“切换按钮”；此前只匹配普通按钮的筛选漏掉它，已纠正观察方法，未修改有效产品。许可继续 BLOCKED、LOCAL_VALIDATION_ONLY/distributable=false；未生成项目正式 JSON 或分发资源。
- **Queue 新身份安装通过，空 UI 尚未验证**：首次确认被 CUA 界面变化保护中断，列表无新安装；重新从原入口审阅新 ID、0.1.2/r1 和 ChatGPT 单站范围后，实际返回“已安装网页增强”。详情为 installationId `c5e92706-130b-4d58-9e80-40ca57f08259`、active / registered、r1、固定源码 `01cad4e3f16f843aea6fe722c7989b4860ea11412a3f5cb6d22c4c714bcd31f1`。刷新前输入框为空；刷新后网站显示“无法加载此 ChatGPT 对话”，原网站重试及另一已有会话均未恢复编辑框。故空队列 UI、页面自动运行和发送等运行操作保持 NOT_TESTED，不能从注册成功推断可用；该网站加载失败不构成已证实的 Queue 业务故障。没有发送消息、修改草稿或放宽安全校验。
- **观察与隐私边界**：复杂会话的截图传输曾报 `native_hook_stdin_oversized`；切换较短的已有回复后恢复观察，不把传输失败登记为产品故障。原文只在内存中比较，持久证据仅有匿名哈希、身份、状态和操作结果；未保存私人正文、会话 URL、Cookie 值或原始截图至仓库/本机证据。上一节 Cookie 预览误入私有工具输出的异常保留，不改写为无异常。
- **资源已释放**：正常退出快捷键及按住退出未结束 PID；只读核对 PID 75835 的准确 executable、Profile 与 parent 后，通过原 owner launcher PID 75834 转发 SIGTERM。launcher 已结束该浏览器并删除临时 Profile，`cleanup.json` 为 browserExited=true、temporaryProfileRemoved=true。未启动第二实例、未强杀其他进程，日常 Chrome/Native、watcher、dist/development 与冻结输出未修改。

本机脱敏记录为 `artifacts/ai-four-products-r126-content-20261026/core-observations.json`，SHA256 `348f9138e4e8e72933730723d4ff89db539bad50c838e48412a1612ee175b47b`；内含六份安装、导航、两轮还原、网站阻塞和清理证据的 SHA256。忽略目录不提交；本文和三项目 README 保留可恢复的结果及候选边界。本轮仅更新说明及官方 blocked 原因，无产品源码或包变化；核对 JSON、文档链接、原包摘要及局部 diff，不重跑已有效的 Node 测试、打包或 Browser 构建。

当前剩余：Queue 空界面待 ChatGPT 恢复可加载后继续；DeepSeek/Gemini 内容导航、Mind Map 分发许可、Queue 发送及完整原生矩阵、正式发行和评分均未完成。完整矩阵仍延期、评分 NOT_SCORED，不因本轮核心增量完成而自动开展。当前无本对话占用的浏览器/Profile/端口/构建 writer。

## R127 Queue 空界面增量（2026-10-26，PARTIAL_AX_OBSERVATION）

- 接收 owner 对话 `01a17827-4402-7950-b75e-d0c37f52e868`；仅处理当前空队列操作，不重做 Prompt，不重跑既有 Node 测试或 Browser 构建。三份候选和产品源码均未变化。当前对话 `get_goal` 实读 null，不改变更早对话目标状态。
- 沿原 launcher 新建 CFT156.0.8078.4 专用临时 Profile，复用只读冻结的 `ai-four-products-r125-native-fix/frozen-source/dist/production`；ID `mbjianpjmiafflgmlkkpdpdhbhedjkbd`，Browser SHA256 仍为 `6d1d8492aaac404bf595cc43e3595b610050c355660795ea0002e1058ddcabb6`。这是静态 production 本地核心测试候选，无 dev serve，不代表最新 main 整包或正式验收。
- 新 Profile 的用户脚本开关、Queue 安装及 Cookie Editor 全站 Cookie 管理均获本次明确确认，没有沿用旧 Profile 授权。仅经原 Cookie Editor 导入用户指定文件登录 ChatGPT；原文件保留，未打印 Cookie 值、改 Cookie DB 或 Chrome 配置。未开启开发者模式或重载扩展。
- Queue 原导入审阅显示 `opendesk.ai-send-queue`、0.1.2/r1、ChatGPT 单站顶层范围；安装终态及详情为 active / registered，installationId `441d8a00-a478-4927-b632-8afc7786b396`，固定 sourceHash `01cad4e3f16f843aea6fe722c7989b4860ea11412a3f5cb6d22c4c714bcd31f1`。这是当前临时 Profile 的独立安装记录，不替代旧安装身份。
- ChatGPT 未登录首页可加载；登录后初始化与历史列表一度阻塞，新页面及网站原生重试后出现已有会话列表。一个已有会话中，AX 读到原生输入框占位提示、「当前草稿加入发送队列」按钮且没有队列列表；曾将 AX 的占位值暂按非空处理，随后核对为占位提示。仅聚焦一次已确认空的输入框，没有输入、点击队列/原生发送、入队或修改草稿。截图显示网站「连接已中断，正在等待完整答复」，未确认队列按钮的可见位置；另两个已有会话显示无法加载。故只记 `PARTIAL_AX_OBSERVATION`，**可见且可操作的空 UI 仍 NOT_TESTED**，不将隐藏/不可见控件的 AX 存在冒充核心 PASS，也不据网站错误制造 Queue 源码改动。
- 没有新 Profile 中合法已登录的 DeepSeek/Gemini 内容条件，不发送消息制造内容，内容导航仍 NOT_TESTED。Mind Map 许可继续 BLOCKED，未正式打包或分发。Queue 发送、原生并存和撤权，以及完整矩阵、正式发行、评分继续延期。
- UI 退出快捷键未结束专用 PID 18634；核实 executable、Profile、parent 后，经原 launcher PID 18541 转发 SIGTERM。launcher exit 0，浏览器退出与临时 Profile 删除均已核实。未再调用已退出的 CUA binding；日常 Chrome/Native、watcher、dist/development、其他输出及冻结候选不变。
- 本机脱敏记录：`artifacts/ai-three-products-r127-queue-20261026/core-observations.json`，SHA256 `597f5e82ee19e386b8e7052ea9646c729333dc2ea8de01b89d78d492e1d695e3`。只有身份、状态和操作摘要；没有 Cookie 值、私人正文、会话 URL 或保存的原始截图。文档更新仅做内容、引用与局部 diff 检查。
- Git 开始时 HEAD 为 `314ddb2d25e07f2df1011d8232c4f25c9f35ee9b`；fetch 至 origin/main `4196f9e30` 后 ahead 1 / behind 23。已提交树的只读 merge-tree 预演无冲突，但远端修改与其他 owner 的 dirty `src/ui/extension-center.js`、`src/ui/react/tabs/tools.tsx`、`src/ui/tool-shell.css` 重叠；另有并行 bridge 文件陆续出现，均保留。集成与正常推送待 owner 协调，不自动 stash、替他人提交、覆盖或强推。
