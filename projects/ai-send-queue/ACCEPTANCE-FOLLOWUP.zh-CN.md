# 原生追加提问后的队列恢复（2026-11-09）

## 最新实测（2026-11-09 16:50，Asia/Shanghai）

本节取代下文关于「r17 文档执行、忙时 FIFO、原生追加提问仍未测试」的当前判断；旧记录保留为历史。接手对话为 `01a1bf56-714b-7301-b271-387a2a6add9d`，本对话未建立原生 Goal，也未更改其他对话 Goal。

- **原安装的新文档确实执行了同一 r17。** 原 Chrome 扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf` 的只读记录仍为 revision `17`、enabled `true`、nativeState `registered`、error `null`、原 installationId `817878f0-d69e-4e58-95cd-f900cc5e1468`、authorization `active`、generation `5`。本任务 tab `560070677` 的新文档 `7BC0E0D85DAE81997690399842FE9055` 执行记录为 completed / error null，sourceHash `fe06673fab98f51c63576f1d507f3b862fa4126380fc62d8b036a271aff3d81e`、manifestHash `7bc0dc837ed8ac064ca0881c47b3a5a3b887d21d6d3ec75d77c77bafe5f42c69`、原 installationId / generation `5` 全部一致。记录最初在首页读取；随后本任务通过原生发送创建下述测试会话，未刷新该文档。
- **忙时双条 FIFO：PASS。** 在原生 80 行测试回复仍生成时，通过现有 Ctrl + Enter 依次加入 A、B。忙时可见两条待发；随后原生历史按 A → ACK_A → B → ACK_B 出现，A/B 正文各一次，队列清空。未点击提前发送、停止、重试或手动补发 A/B。
- **原生追加提问后的恢复：PASS。** 将 C 加入队列，原生历史确认 C 入站且正在回复后加入 D，再直接用原生 Enter 发送一次追加提问 E。最终历史为 C → E → E 的完整回复（末行 EXTRA_DONE）→ D → ACK_D；C/E/D 正文各一次，队列清空。现场覆盖了已确认排队消息后新增原生 user、再等待最新 assistant 的路径；没有清除回复栅栏、重放 unknown 或改写内部状态。
- [独立测试会话](https://chatgpt.com/c/6af18496-036c-83ec-b5cf-c412661c8248)。本机忽略目录保留 `artifacts/stalled-followup-20261109/r17-native-final.ax.txt`（原始最终 AX）、`r17-native-followup.png`（现场截图）。从该 AX 定向计数，A/B/C/E/D 的正文文本节点各 1、ACK_A/ACK_B/EXTRA_DONE/ACK_D 各 1、待发项行数 0。这些是可见历史与队列证据，不是网络请求回执，也不证明所有计时边界或 production 验收。
- **安装请求的完整终态仍未知。** 同次只读核对仍为 `managedCleanup={scope:'managed-ui-only',state:'unknown',records:150}`。业务验证成功不能替代旧实例清理终态或原导入请求完整成功回执；本轮未重装、重放导入、重建清理凭据或清除 unknown。
- 持续开发仍沿用 `dist/development`，未启动第二个 watcher、构建或重载扩展。现有 dev 进程端口有连接，但运行中 Browser 指纹仍为 `7a05ff6f4a2c6fc04d0a9e816550cec8a2c392d80315591f9bb9bae55d5ce57f`，UI 明示因任务/原生请求/未知结果而延后刷新；磁盘产物已变化不能证明旧运行页已采用公共安装 catch UI 修复。r17 Page 的执行身份按上文单独证实。
- 本轮未修改产品源码或重新运行未变化的测试。独立只读复核确认六个源码模块、两个资源、构建 program.js 和原候选 sourceUtf8 仍逐字节匹配；未升 r18、未改正式包、Catalog 或 Host pin。历史 Site/Engine 179/179、入口 35/35、安装 UI 42/42 是已有记录，不能写成本轮重跑。
- 测试首页同步出现用户未发送草稿，发送测试前已完整备份至本机忽略目录 `artifacts/stalled-followup-20261109/native-unsent-draft-backup.txt`，没有发送该草稿。原文为 1294 字符，去除备份文件末尾附加换行后的 UTF-8 SHA-256 为 `12265a8fa622f0f5a5441ff4c9e5deae80ca8135c9be48dc9cfef60da965e364`。测试后草稿还原与 Work 模式恢复 **NOT_VERIFIED**：本任务另建首页 tab `560070683` 用于还原，定向填入调用超时，副作用未知；随后 Chrome 持续被切回另一任务的 DevTools，未在无法确认目标时继续输入。该首页已标记 handoff 保留；恢复前须先读取现值，不能把备份或填入尝试写成已还原，也不能发送原草稿。

ego TaskSpace 61 只用于独立环境核对，未安装/更新该 Page；其同 ID 扩展未找到本程序安装或执行记录。`artifacts/stalled-followup-20261109/ego-followup-61.json` 记录该环境差异。ego 首页另有已有草稿，未修改。收尾时该 TaskSpace 已无法取得，空间清单也未找到本任务活动空间；本轮没有取得成功 finish 回执，不将其写成由本任务关闭。ego 实查不能替代上面的原 Chrome 证据。

## 最新接手核对（2026-11-09 15:26，Asia/Shanghai）

本节取代下文 04:51 / 04:52 的当前状态判断；下文保留历史。接手对话为 `01a1bf27-acc4-7122-a48b-568b86f83393`，新 Goal 已建立为 active。原对话 Goal 上次实读 blocked，未自动迁移、暂停或完成。

- 原 Chrome 审阅确实同时显示「当前 r15 → 新 r17」「已安装 r15；确认后…」及「已查询到原安装 r17（registered）」。随后前台被其他操作切换到 AI Proxy；本任务未点击重试、启停、卸载或刷新旧页。
- **r17 已写入原安装并在 Chrome 注册，旧实例清理仍未确认。** 原安装 `installationId=817878f0-d69e-4e58-95cd-f900cc5e1468`，generation `5`，enabled `true`，authorization `active`，nativeState `registered`，error `null`。manifestHash `7bc0dc837ed8ac064ca0881c47b3a5a3b887d21d6d3ec75d77c77bafe5f42c69`，sourceHash 与下文 r17 候选完全一致。Chrome `getScripts` 读到原 bootstrap ID `opendesk-page-boot-44f0871e2c9802124570d651c27994f067b96d4153b1e782`，匹配 `https://chatgpt.com/*`、顶层 USER_SCRIPT / document_idle。
- pending 的直接缺口为 `managedCleanup={scope:'managed-ui-only',state:'unknown',records:150}`；registered 不能代替清理终态或本次请求完整成功回执。未重建清理凭据、未清除 unknown、未改写安装记录。本次未取得原导入请求完整原始回执。
- 原问题页当前文档 `419066703C02BD0931A8DC0A166B77E6`、tab `560070608` 的执行记录仍为 **r15 / generation 4**，sourceHash `61fdf8665b8ff557d345fed5325be211793abf6610698a85ef6a536daed5e5cb`，completed；精确文档查询返回 active。不能把后台 r17 注册写成该旧页已执行 r17。原队列与输入框在接手首查时为空，原消息仍在历史中。
- 本次直接读取扩展详情确认加载来源 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`、扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，扩展及「允许运行用户脚本」开启。serve 连接 **NOT_VERIFIED**；未重建或重载 Browser、未更换 Profile / Native 配对。
- 六个源码模块、两个资源及安装包 sourceUtf8 重新按 SHA 核对，仍匹配原 **0.1.15/r17** 候选；未重编译、未升 r18、未改正式包 / Catalog / Host pin。
- 已修复公共 UI 缺陷：`src/ui/sidebar-tools.js` 的安装 catch 原先只追加查询提示，原审阅基线未重新标注，因而误把 r15 继续显示为「当前」。现在进入核对时即标明审阅基线，读回后展示当前 revision、注册、授权和清理缺口；读回失败显示当前未读回。完整安装身份及摘要放原折叠技术详情。安装 Authority、原 CAS、禁用安装和未知结果不重放保护保持。`tests/environment/extension-center-page-import.test.mjs` **42/42 PASS**，覆盖清理未知、丢回执、缺记录、revision/源码不符及读回抛错；两文件语法与 diff 检查通过。**仅源码已修，未重建 / 重载 Browser，当前 Chrome UI 尚未应用该改动。**
- 在同 Profile 新建了本任务诊断窗口和空白 ChatGPT 测试页，未发送测试消息。首页尚无 `/c/<id>`，队列适配器不会在该路由挂载皇冠；不能凭此认定 r17 启动失败。**r17 实际执行身份、忙时双条 FIFO、原生追加提问链均仍为 NOT_TESTED。** 原生焦点反复被外部操作切回其他窗口，已请求协调；不抢占用户页面继续输入。

上述安装和文档事实来自本次 CUA 原生 DevTools 中的只读 IndexedDB / Chrome API 查询及 AX 观察；这是观察摘要，不是保存的原始浏览器回执。后续从本任务测试窗口继续，先核对同候选执行身份，使用明确测试内容；旧页、草稿、unknown 与并行服务继续保留。

### ego 能力实查（2026-11-09）

用户建议使用 ego 并行任务后，按当前 `ego-browser skill` 在本任务专用 TaskSpace 58 实查。ego 能打开同 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 的扩展详情及普通 `sidepanel.html` 标签页，但该扩展存储中 **没有 `opendesk.ai-send-queue` 安装或执行记录**；不能用相同扩展 ID 推断它与系统 Chrome 共用安装数据，也不能以 ego 新装替代原安装 r17 的验收。没有安装、更新、导入 Cookie 或更换 Profile。该诊断空间已 `finish({keep:[]})` 释放。

普通网页任务可通过独立 TaskSpace 并行；当前原生 UI 锁由滚动导航任务 `01a1bf22-eecd-7502-835d-ee73451d80c3` 持有，本任务不抢占。ego 提示 0.6.2.8 有更新，未升级；升级不是当前队列验证的前置条件。FIFO 和追加提问的原安装验证仍待原生 UI 可用。

也尝试通过原 Chrome 已列出的本任务空白标签 `560070656` 直接绑定，以减少前台输入需求；绑定超时，恢复绑定仍超时，未继续重复尝试。未发送测试消息或刷新任何旧页。此轮得到 ego 安装数据差异的新证据，原 r17 的执行和自动队列验证未推进；Goal 未标完成。

### 续跑停止点（2026-11-09 15:49，Asia/Shanghai）

- 仍为 main。原生 UI 锁再次申请失败，owner 仍为滚动导航任务 `01a1bf22-eecd-7502-835d-ee73451d80c3`；原生键鼠未抢占，也未借用其他 owner 释放租约。
- 依浏览器工具故障指南尝试定向控制替代路径：本任务新建标签 `560070664` 成功，元数据后来确认已导航至 `https://chatgpt.com/`，title 为 ChatGPT；但 DOM snapshot 和启动日志读取均超时。该页没有测试消息、队列或用户草稿；作为临时诊断页未标记保留，交由浏览器工具正常回收。没有重复导航、刷新旧页或重放任何发送。
- 上轮 ego 实查提供了会改变路线的新证据；本轮只完成控制路径诊断，核心安装请求终态、r17 文档执行身份、FIFO 及追加提问均未取得新证明，按主链 **no progress** 记录。同一前台资源阻塞已连续跨三轮复现，安全替代路径也未恢复。
- 后续从原测试窗口的空白 ChatGPT 页继续；仅当原生前台资源可用或定向控制恢复时，先核验新文档 r17 / sourceHash / manifestHash / installationId / generation，再发送明确测试内容。原安装请求完整终态、旧 managedCleanup unknown 仍需如实核对，不能以新页业务运行替代安装确认。原页面、旧草稿、队列、unknown、安装身份和并行服务继续保留。

## 目标与现场

修复系统 Chrome 中 [原问题对话](https://chatgpt.com/g/g-p-6aec96027de881918b37eaec3df3746f-opendesk-broswer/c/6af0cb54-fcf8-83ee-8629-0dfa242f249e) 的队列停滞，保留待发内容、原生草稿、FIFO 和未知结果不重放保护。原生 Goal 已建立；本记录只覆盖当前故障，不恢复完整 production 验收或评分。

现场只有一条普通待发项：`这个版本可以，确保修改交互预览，和扩展业务逻辑代码。` 原生输入框为空，最新回复已经完成，但「提前发送」返回「当前状态不能强制发送」。只读 DOM 观察发现同一原生 turn 内有两条 user 节点及其后的一个 completed assistant。旧回复栅栏只允许已确认 user 后恰好一个 assistant、且已确认 user 必须一直是最后一条 user；原生追加提问会令这一条件永久不成立。此缺陷已用定向回归证明，与现场结构吻合；未直接读到该页面私有 answerGate 或执行 sourceHash，运行中具体卡点仍属有证据支持的判断。页面另有历史列表请求 429，未取得发送请求失败证据，不能将其认定为本故障原因。

已先备份原文，再通过原「取回输入框编辑」入口恢复到原生编辑器，原生发送按钮仅点击一次。随后观察到原文在原生历史中出现一次、输入框和队列为空，ChatGPT 先思考后给出回复。**这是原消息恢复的真实 Chrome 证据，不是新自动队列的验收。** 观察摘要在本机忽略目录 `artifacts/stalled-followup-20261109/recovery.json`，不是原始 AX 归档。

## 关键测试条件

1. 已确认消息后允许原生继续追加提问；只有原节点身份、顺序和当前对话仍可核验，且最新 user 之后的 assistant 完成、网页空闲稳定，才继续下一条 FIFO。
2. 网页忙、旧回复已完成但最新 user 未获回复、或空闲稳定窗口内出现新一轮时，继续等待；队列显示等待原因。
3. 原生发送确认仍要求原会话、精确正文和精确新增节点；后续提问或回复不能冒充原消息入站。
4. 节点替换、重排、内部丢失、全部旧锚点丢失，以及旧快照恢复，均不能解除回复栅栏。仅容许确已脱离 DOM 的历史前缀被卸载。
5. 已发送和 unknown 项不得自动重放；换对话不发送，原生草稿、IME、Stop 与发送就绪保护保持有效。
6. 新安装候选须保持原 programId、USER_SCRIPT、网站范围和权限；安装证据、源码测试与原消息手动恢复分别报告。

## 当前交付状态

- 源码：已修复。回复等待允许确认后的单调追加历史，忙时也保存节点观察点；历史身份断裂后锁定，旧快照不能恢复放行。最新回复改变时重新计算稳定空闲窗口。等待显示原因，真正继续后清除。
- 验证：Site / Engine 179/179、现有入口及真实模块组合回归 35/35 通过；四文件语法和 diff 格式检查通过。独立只读审查无阻断发现。未执行全仓测试或 Browser 构建。
- 原消息恢复：PASS，原生发送一次并收到回复。
- 新候选自动队列及原生追加提问：NOT_TESTED，须绑定最终候选。
- 候选：Page `0.1.15/r17`，`sourceHash=fe06673fab98f51c63576f1d507f3b862fa4126380fc62d8b036a271aff3d81e`，`packageHash=93f2984e689b8fafd339e6f0c07c61a2a12f07fd528b06657e6bd793d6f1d4ba`。现有 builder 和安装包校验通过，六个源码模块及两个资源与当前项目 SHA 一致。安装包位于本机忽略目录 `artifacts/stalled-followup-20261109/ai-send-queue-r17.opendesk-page.json`，核对回执为同目录 `candidate-verification.json`。
- 安装：Chrome 原安装器已读入 r17，显示当前 r15 → r17、网站权限范围未变化；尚未点击「确认更新」。历史安装存在 unknown managed cleanup，另有保留用户草稿的旧页；升级会尝试清理同 Profile 的旧实例，不能无视其他页面内存状态。已请求用户选择保留旧实例或先逐页备份，未收到选择前不更新、清空或刷新这些旧页，不重建清理凭据。
- 环境：沿用系统 Chrome 的 `ccfcjegpkdlgbclopjmadlcjedelidmf`。历史加载目录为仓库 `dist/development`，本轮未重验路径及 serve 状态，未构建或重载 Browser。
- 并行工作：保留另一任务的 `main.js`、快捷键测试、README 和 r16 候选；本候选包含构建时的这些入口修改，但未覆盖正式包、Host pin 或其证据。修改保留在 main 工作区，未提交或推送。

续跑核对（2026-11-09 04:51，Asia/Shanghai）：六个源码模块与两个资源仍匹配 r17，未重复测试或构建。系统 Chrome 仍在同一原问题页，原消息已在历史，队列及草稿为空；安装器仍显示已安装 r15、r17 待确认，源码与包 SHA 均匹配上述候选。未收到旧页处理选择，安装阻塞未解除。上一目标轮完成源码、候选和原消息恢复，属于 progress；本轮仅核实同一阻塞仍在，无可验证存活的后台任务可等待。目标继续 active，未标完成。

第三轮阻塞核对（2026-11-09 04:52，Asia/Shanghai）：当前源码/资源仍匹配候选；Chrome 审阅仍是 r15 → r17 待确认，未执行更新。上一轮属于 no progress，本轮同一旧页内存状态保留问题仍未取得用户选择；没有可安全执行的剩余安装步骤或存活后台任务。原生 Goal 已由工具返回 **blocked**，完整目标保持不变，未标 complete。收到旧页处理选择后，从现有安装审阅继续；r17 安装、执行身份及自动 FIFO 仍为 NOT_TESTED。保留原页面、所有旧实例、草稿、正式包、扩展 ID 和现有服务。
