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

## 接手增量收尾（2026-10-26，ACTIVE）

- 接收对话 `01a17744-943f-79e3-bfc5-721a66140588` 已接管上述四个文件；起始 main/HEAD `d5de00e8016aba16cc1935f51ae2587b77bfe441`，索引为空。未接管其他 dirty 文件、日常 watcher、Chrome 或 Native。
- 实读三份交付输入的 SHA256 与上文一致，且逐字节等于 `ai-four-products-r125-native-fix/frozen-source` 对应文件。原 81/105 PASS 日志、production receipt 与原生 JSON 均可读，复用原候选的证据，不重跑测试、晋升或构建；不将其提升为新 main 整包验收。
- fetch 后远端 main 为 `9a3d7b4c86f9bda731246b76980df60615a4724c`；新增内容没有修改本轮三个交付文件。远端同时修改了其他 owner 尚未提交的 `src/ui/sidebar-tools.js`，Git 集成必须保护其现有改动，不自动 stash、暂存或覆盖。先精确提交本轮四文件，再处理远端集成边界。
- 当前不占用浏览器/Profile/端口/构建输出。Scroll 内容、Mind Map 许可、Queue owner 门禁保持原状态；完整矩阵和评分继续延期。
