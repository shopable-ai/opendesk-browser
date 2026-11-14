# Mouse Gestures · 普通点击与菜单保护（0.3.5 / Page revision 9）

## 当前修复目标（2026-11-14）

用户再次确认“右键一按就弹菜单，无法画轨迹”，并要求修复完成、设置目标和关键测试条件；随后明确“右拖和普通单次右击原菜单都必须保留”。本对话 `01a1d64d-1185-7d93-9501-cbbe086fb915` 已创建原生持久目标，创建回执为 **active**；默认右键故障尚未修复。下文 2026-11-13 的 blocked、评分及“当前对话”均属于历史记录，不代表本对话目标状态。

完成条件是：日常 macOS Chrome 的同一安装候选、同一获准网页、同一默认右键设置下，普通单次右击原菜单与右拖手势同时可用；四方向动作恰好一次，短拖/无效不误触发，取消/停用/撤权/换文档无迟到或重复动作，网页原有交互正常，同 ID 更新保留数据并核实运行身份。Alt-left、双右击、Shift 菜单、自绘/合成菜单和仅源码/Node 通过均不能替代。

完整[当前目标与关键测试条件](docs/right-button-coexistence.zh-CN.md#当前修复目标与关键测试2026-11-14)沿用原文档；本机执行分工维护在[原 PRD](../../.omx/plans/prd-mouse-gestures-coexistence.md)和[原测试表](../../.omx/plans/test-spec-mouse-gestures-coexistence.md)。当前先解决菜单协调机制并完成最短双核心闭环；旧专家 ≥95、production、跨 OS、全量 CI 和压力测试延期。没有可交付的功能修复前不反复升版或替换正式 JSON。

最新[真实扩展 API 对照](docs/right-button-coexistence.zh-CN.md#实际扩展-api-与安全回退对照2026-11-14-续跑)：HTTP 拦截正对照可调用，但自身 WAR、data/blob、DNR 静态回退组合未形成动态决定通道。独立审阅确认尚无可部署修复；正式包与日常环境未改动，不能将原始 CDP 局部成功作为安装版成功。

**当前原生目标状态：blocked，未完成。** 本目标第三轮重新核对源码、包和原始记录后，同一底层缺口仍在，且没有待决运行或新的具体候选；原生工具已实际返回 blocked。完整双核心要求与关键测试保留，详见[本目标阻塞审计](docs/right-button-coexistence.zh-CN.md#本目标第三轮阻塞审计2026-11-14)。

## 历史方案与离线原型（2026-11-13 续接）

**当前目标状态：blocked，未完成。** 当前对话目标在原始轮和两次自动续跑均遇到同一原文档交付/原菜单保真缺口；第三轮再次核对默认关闭原型、0.3.5/revision 9 和未改变的包摘要后，原生 goal 工具已返回 blocked。完整目标与关键测试保留。解锁需要新的受支持机制或可审计适用实现材料；仅追加权限不足。详见[阻塞审计](docs/right-button-coexistence.zh-CN.md#当前目标第三轮阻塞审计)。

用户要求方案专家评分 ≥95；本次两位独立 AI 专家对当前可落地方案均评 **46/100，未达标**。核心机制和真实双 P0 证据缺失，不能用离线模型或文档质量替代。分项、整改顺序与重新评审门槛见[独立方案评审](docs/right-button-coexistence.zh-CN.md#方案独立评审与-95-分门槛用户本次要求)。

后续已按用户要求创建当前对话的原生持久目标，包含真实双 P0、K0–K9 关键测试和两位专家分别 ≥95；创建时状态 active。新修正旧授权回包的时钟污染/误取消新手势问题，先复现失败再修复，定向模型+分段 **26/26 PASS**；未实现原生交付，也未取得更高独立评分。见[目标、关键测试与逻辑完善](docs/right-button-coexistence.zh-CN.md#持久目标关键测试与本次逻辑完善)。

本轮新增接收端实测：原网页 A 确认后，同标签换页到 B，CDP 仍将 trusted 右键序列投给 B。该反例排除“先取网页回执，再按标签投递输入”的组合；不代表全部原生路线不可行，也不是安装版菜单测试。见[探针与证据边界](docs/right-button-coexistence.zh-CN.md#接收端条件交付本轮新增反例)。

推荐先验证可信 macOS 宿主的“暂留右键 → 短击交付真实点击 / 有效拖动执行手势”，参考 StrokeMouse 的行为设计，未复制其 AGPL 实现。已新增[默认关闭的离线分流模型](experiments/native-right-button.mjs)、[不请求权限的 macOS 预检](experiments/native-preflight.swift)及[定向回归](tests/native-right-button.test.mjs)。它们不进入正式打包入口，不创建 tap、不截流、不补发输入；模拟身份不构成 Authority，也不承诺真实菜单出现。

**原型结论：分流及取消算法已有可运行代码；原生输入到原 Chrome 文档的绑定尚未成立，日常 Chrome 故障未修复。** 原型复用现有 12px/56px/28px/12px、两段识别；覆盖原按下坐标、短拖/无效、授权待决取消、同 URL 换文档、旧回包和原右键抬起清理。macOS 只读探针的三项权限预检均为 true，但只说明当前探针的权限，不授权工具或未来原生程序；磁盘 Chrome 为 157.0.8103.78，运行版本未读取。

运行方式、三条路线比较、明确的绑定反例与下一步原生接入门槛见[方案与原型结果](docs/right-button-coexistence.zh-CN.md#当前方案与离线原型2026-11-13-续接)。正式包仍是 0.3.5 / revision 9，SHA256 未变化；没有新的可安装修复候选。下文“本轮不采用 Native”属于此前阶段决定，已由本次默认关闭的方案验证取代，不代表永久禁止研究。

## 最新目标与关键测试条件（2026-11-13 用户纠偏）

**当前默认右键链失败，双 P0 未完成。** 用户先澄清 Google Chrome 修改前手势和轨迹可用、ego 从未成功；随后在日常 Chrome 实测反馈“现在不行了”，并明确为“按下右键就弹菜单，无法画轨迹”。原生只读界面已核实鼠标手势 v0.3.5 已安装、开关开启。0.3.5 在提前菜单到达时清除手势，正对应此次失败；这已不只是 ego 环境推断。源码夹具四方向使用 Option / Alt + 左键，不能证明默认右键链成功。普通菜单的内容、位置与选择仍未完成验证。

**目标：同一已安装版本、同一已授权网页、同一默认右键设置下，普通右击菜单正常，按住右键拖动也正常。** 两条 P0 必须同时通过，不能用切换触发方式分别证明。

| 条件 | 操作 | 通过标准 |
| --- | --- | --- |
| P0-菜单 | 普通右击；带轻微抖动的右击；选择菜单项 | 原生或网站原有菜单正常出现，位置、内容、选择可用；普通左键正常 |
| P0-手势 | 按住右键 → 连续拖动 ≥56px → 松开，逐一验证四方向 | 提前菜单不夺走拖动输入；对应真实动作恰好一次，松开不多弹菜单 |
| T-短拖与无效 | 低于阈值、斜线、折返、不完整/未配置组合 | 不执行动作，不遗留会吞下一次点击或菜单的状态 |
| T-取消与权限 | Esc、失焦、隐藏、新点击、OFF、撤权；松开后授权待决时取消 | 清理轨迹及监听；无迟到导航、重复执行或未知效果重放 |
| T-网页交互 | 输入框、链接、网页按钮/菜单项、文字选区、键盘菜单 | 原有编辑、选择、点击和菜单交互保持可用 |
| T-更新 | 旧设置/数据在同 ID 正常更新后读回；刷新匹配网页 | 旧数据保留、权限不扩大；实际安装版本与当前网页运行源码匹配 |

先在当前真实环境记录受信 `mousedown/contextmenu/mousemove/mouseup` 时序和具体失败点，再选择修复。若 USER_SCRIPT 的公开能力无法同时满足两条 P0，记录可复现的能力缺口并评估受支持的最小公共能力；不能靠吞普通右键制造 PASS，也不能凭经验断言当前环境无解。

**不算通过**：菜单先出现就取消手势、改用 Option / Alt + 左键、只让练习画布可用、合成 `contextmenu`、自绘替代系统菜单，或仅有 Node/源码夹具证据。Alt-left 可继续作为可选功能。真实系统菜单必须以同环境、同安装候选的实际操作验证；不恢复旧的跨 OS 全矩阵。当前用户要求的两位专家 ≥95 按本文顶部门槛执行。

此前对话状态：`GOAL_BLOCKED / BOTH_P0_NOT_PASSED`。此前续接已回到日常 Chrome 核实安装版、开关及用户实际失败；连续三轮仍缺保留原菜单的可调用协调能力，当时目标工具返回 `blocked`，未缩减或完成目标。当前新建目标见本文顶部，不能从这段历史推定其状态。用户已委托专家判断技术路线，不再等待用户选择技术层；尚未证明原文档及授权绑定的 Native 拦截不启用。独立无界面 Chrome 探针中，`--blink-settings=showContextMenuOnMouseUp=true` 延后右键菜单事件，但 Control＋单击没有菜单事件；这不证明物理输入或日常 Chrome 的行为，故不作为正式修复，未更改日常浏览器配置。下面为 0.3.5 的已交付范围及历史证据，不代表该最新目标已完成。

Chrome 原生观察恢复后，已核实安装版与开关；网页 DOM 自动化仍在焦点模拟命令处超时，实际 Page revision/包摘要未读回。本轮单项 Node 诊断证实：提前 `contextmenu` 后继续移动及松开，动作次数为 0；同样轨迹无提前菜单时动作次数为 1。该诊断通过表示当前取消逻辑按源码执行，**不表示目标功能通过**。已定位为菜单时序与 0.3.5 保护逻辑冲突；现有公开 Page/Chrome SDK 仍无保留原菜单的延后/继续接口，单纯恢复吞菜单不能满足双 P0。详见[最新事实与验证边界](docs/right-button-coexistence.zh-CN.md#最新纠偏日常-google-chrome-优先)。

2026-11-13 后续诊断：ego(lite) 在右键仍按住时已派发可信 `contextmenu`；分别取消 `pointerdown` / `mousedown` 都未使其延后。公开 Page / Chrome / OpenDesk 菜单 API 未提供原生菜单的延后或继续接口。已记录[当前能力缺口、实测边界与下一步](docs/right-button-coexistence.zh-CN.md)，新增不加载手势源码、不替换菜单的[顶层观察页](tests/fixtures/native-menu.html)。本轮未修改运行逻辑、升版或替换正式包；两条 P0 仍未通过。

2026-11-13 本次续接已补查 smartUp、Gesturefy、crxMouse 和 macOS 原生 StrokeMouse。Gesturefy 依赖 Firefox 的公开菜单时序设置，Chrome 不支持；smartUp 用双右击折中；StrokeMouse 重新投递点击但缺少原网页绑定。当前 ego 的定向输入实测中，Ctrl＋右键仍在移动前触发菜单，不能靠加 Ctrl 修复。版本、永久源码链接、实测边界及判断见[第三方实现与 Ctrl 实测](docs/right-button-coexistence.zh-CN.md#本次续接第三方实现与-ctrl-实测)。运行源码和 0.3.5 正式包未变化，双 P0 仍未完成。

## 上轮 0.3.5 修复（2026-11-13）

目标：鼠标手势不得吞掉普通点击及网页原有菜单，只有明确识别到可执行动作时才拦截关联事件。

- 移除会拦截普通右键的“手势优先”选项；旧 `preferences.menuPolicy: gesture-first` 立即按菜单保护行为运行，无须先打开设置。下次用户明确保存时经原 CAS 归一为 `native-first`，保留启停、触发方式、轨迹、组合映射及其他字段；打开设置不写入数据。
- 12px 仍只代表拖动意图。短拖、斜线、折返、不完整或未配置组合、Esc 取消不再拦截菜单、mouseup 或后续点击；有效手势继续保留 56px 阈值及原 450ms/16px/目标匹配保护。
- 新一次鼠标任意按键点击取消旧手势、关联拦截及等待授权的动作；多键同时按下不当作手势。网页 `role=button/menu/menuitem` 等交互控件及输入、选择操作优先。
- 原 macOS 菜单先到时，保留菜单并取消本次手势；仍可选 Option / Alt + 左键拖动。不伪造或重放浏览器菜单。

源码测试页：[`tests/fixtures/menu.html`](tests/fixtures/menu.html)。在本项目目录提供本地 HTTP 服务后打开 `/tests/fixtures/menu.html`；它在子框架加载真实识别模块，避免顶层已安装模块重复处理，所有动作只记录，不导航。ego(lite) 真实可信鼠标事件已验证网页菜单打开/选择、普通点击、四方向、短拖、Esc 取消，以及输入框、网页按钮/菜单项排除；这是 `SOURCE_FIXTURE_PASS`，**不证明新版包已安装或物理鼠标的系统菜单时序通过**。

自动验证、正式包摘要与安装状态见下方本轮交付记录。原权限、网页范围、执行时机、同 ID 存储及逐动作授权读取保持原合同；未修改 Browser 框架或 `dist/development`。

### 本轮交付记录

唯一安装包：[`mouse-gestures.opendesk-tool.json`](mouse-gestures.opendesk-tool.json)，由工作区已有 `0.3.4 / revision 8` 升为 `0.3.5 / revision 9`；55,160 字节，SHA-256 `c5e086a7e272a817c9a3fc82c8402c2aced7af118bc3b1dff050f027e35378e7`。原打包器候选构建、门禁、显式晋升及 `--check-project` 同源检查均通过，能力和网页规则与前包一致。

项目组 92/92 Node PASS；收尾补充“松开后等待授权时按 Esc 同时清除菜单拦截”回归，最终手势组 33/33 PASS（与项目组重叠，不相加）。包合同、路径/符号链接、版本/修订晋升、身份/摘要及 document_end 保护共 11/11 PASS；相关 JS 语法和 `git diff --check` 通过。日志及浏览器操作回执保存在本机忽略目录 `artifacts/sidebar-tools/mouse-gestures/menu-repair-01a1d42c/`。浏览器源码验证覆盖收尾前的菜单和控件路径，最后的待决授权 Esc 清理由 Node 回归证明。

上次打包收尾记录为 `PACKAGE_READY / SOURCE_FIXTURE_PASS / INSTALL_NOT_TESTED / NATIVE_OS_MENU_NOT_TESTED`，当时未执行新候选安装。最新原生界面显示已安装 v0.3.5，但 Page revision/包摘要未核实，用户已报告默认右键失败，不能沿用历史 PASS 宣称可用。后续更新经原「扩展」审阅链同 ID 进行，无需卸载或重建 Browser。临时 HTTP 服务及 ego TaskSpace 已释放，未更改原开发 watcher、其他工具或浏览器版本。

## 历史：0.3.4 安装包（2026-11-13）

按用户要求重新编译并升版：工具与 Page 版本由 `0.3.3` 升至 `0.3.4`，Page revision 由 `7` 升至 `8`。默认开启鼠标手势，保留用户主动关闭的设置；本轮仅更新版本信息，业务代码、权限、网页范围及执行时机与上一版一致。

唯一可导入包：[`mouse-gestures.opendesk-tool.json`](mouse-gestures.opendesk-tool.json)，56,840 字节，SHA-256 `4e713d676f6774c940acacb68a1f4a1187afa737ae63ed2a8bc25ddda7af34e2`。

原打包器候选编译、4 项包合同/路径与符号链接/候选晋升/版本升级保护测试、候选身份及内容差异核对通过；正式 JSON 已晋升并通过 `--check-project` 同源检查。默认开启、关闭设置保留及撤权保护复用本对话升版前的 5 项定向 Node PASS（对应业务源码未变）。当前状态 `PACKAGE_READY / INSTALL_NOT_TESTED / CHROME_LATENCY_NOT_TESTED`；已生成新版安装包，未在浏览器中安装。

### 上轮 0.3.3 打包记录（历史）

按用户要求重新编译并升版：工具与 Page 版本由 `0.3.2` 升至 `0.3.3`，Page revision 由 `6` 升至 `7`。沿用原打包器生成候选、验证并晋升；权限、网页范围及执行时机不变，包内业务代码除版本信息外与上一版一致。

唯一可导入包：[`mouse-gestures.opendesk-tool.json`](mouse-gestures.opendesk-tool.json)，56,840 字节，SHA-256 `9935ef955f7372f5f422d2b5a099f5a63bcab8c9b84814e5e66d507ba586bd64`。

候选身份、Page 摘要与源码一致性校验通过。项目与公共工具包检查合计 95/96 通过；唯一失败是未改动的宿主 UI 旧断言（要求 48px，现有样式为 53px），与本次安装包无关，未修改宿主。原始日志：`artifacts/sidebar-tools/mouse-gestures/package-tests.log`。本次状态为 `PACKAGE_READY / INSTALL_NOT_TESTED / CHROME_LATENCY_NOT_TESTED`；新 JSON 需经原「扩展」安装审阅链更新，不代表当前运行版本已更新。

### 导入时仍提示只支持 document_idle

0.3.3 包已声明 `document_end`。旧提示“Page 模块只支持顶层 document_idle / USER_SCRIPT”属于 **Browser 运行代码与包合同不一致**；当前包通过原打包器同源检查，无需再次升版。先让同一 `dist/development` 的开发服务安全应用新 Browser 代码，再重新打开导入界面，沿原审阅链更新；不要卸载清数据或直接修改正式 JSON。源码、磁盘产物和 Chrome 已加载代码分别核对，开发服务连接及已应用 revision 的操作见[持续开发指南](../../docs/framework/extension-development-r131.zh-CN.md#已有扩展迭代与内部页限制处理2026-11-09)。框架运行合同已补入 Page 启动规则，用于阻止安装器与 Worker 混用不同规则；两端都旧时仍需先更新 Browser。

## 上轮 0.3.2 增量：动作响应与页面启动延迟

目标是减少“松开鼠标后才开始执行动作”的等待，以及页面打开后手势首次可用的等待。2026-11-12 本轮在 `main` 基线 `e0d8e5a233ec1b2f43bea2a27db5708090688971` 上完成差量修复：

- **动作路径**：`mouseup → 新鲜 storage.get → 动作`。删除未使用的 `readContext`，每次初始化/授权的跨桥请求由两次降为一次；读取自身的安装身份、文档和撤权校验保留，不缓存授权。
- **轮询让位**：只要仍有策略读取未完成，后台轮询就不再发起会延后手势的额外读取。用户显式刷新和每次新手势仍独立读取，不能复用旧 ON 快照。
- **启动路径**：项目改为 `document_end`。框架通用支持 DOM 完成后的自动启动，并让 bootstrap 探测、独立世界探测、源码执行接续尽早注入；已运行模块的请求和固定清理不再额外等待 idle。旧 idle 包、手动运行和原权限审阅仍沿原合同。
- **原手感保护**：12px 意图/56px 识别阈值、450ms 右键关联保护、方向/组合、rAF 轨迹、Esc、失焦、停用及迟到动作取消均保留。450ms 不是动作等待时间。

**验证**：项目 88/88 Node PASS；五个框架合同文件 213 项通过；清理文件初次出现固定事件循环次数等待不足，改为等待测试 main 的实际就绪信号后 45/45 通过，原失败日志保留。候选构建、原打包器晋升、`--check-project` 均通过；这不是用户 Chrome 的真实耗时或安装结果。

**交付**：唯一包 `mouse-gestures.opendesk-tool.json`，0.3.2 / Page revision 6，56,840 字节，SHA-256 `a0dccb7ebea18c856998b785845c92a8a955a52a43aa40b6ca991dc88109d772`。新包包含本轮开始时已在 main 的精简设置 UI，没有重做界面。当前 `PACKAGE_READY / INSTALL_NOT_TESTED / CHROME_LATENCY_NOT_TESTED`；改动尚未推送远端。

**生效顺序**：先让 Browser 固定框架包含本轮通用启动修复，再经原“扩展”审阅链更新手势包。只更新 JSON 不能替换旧 Browser 的启动代码。`runAt` 变化由原 scope 差异审阅处理，不改写旧授权；已保存设置沿原同 ID 存储保留。

完整修改、原始测试日志索引、包身份及本机下一步见[延迟优化工作记录](../../docs/framework/workstreams/mouse-gestures-latency.md)。下面的 R5/0.3.1 记录是历史证据，不覆盖本节当前状态。

## 历史：0.3.1 与设置 UI 增量

> **2026-11-12 UI 精简增量（仅源码与独立预览，尚未进入安装包）**：Side Panel 移除“操作偏好”混合表单，拆分为折叠的“自定义组合”和“兼容与显示”，菜单优先级降至带后果说明的高级项；默认四方向及开关直接可见。保留 `enabled/trigger/menuPolicy/showTrace/gestureMappings` 及既有保存/撤权/手势识别逻辑。对应提交：`37679ee70aa40cc139de048490aef37dbb9fddc9`（连同此前三个 UI 提交）。**下述 0.3.1/revision 5 包是 UI 修改前的已构建候选**：本次没有 Mac 本机 Node/打包/真实 Chrome 回执，正式包仍是旧界面；必须在本机核对其他 Agent 修改、定向测试，通过后按原打包器规则调整发布版本、构建、晋升与读回，不能直接同版本静默覆盖。正式安装及物理鼠标验收仍为 NOT_TESTED。

> 2026-11-12 本地验收：83/83 Node PASS；Page 开发构建、生产组合包、正式 JSON 同源校验 PASS；ego 独立预览 7 条操作反馈符合预期。正式候选已由 0.2.1 / revision 2 晋升为 0.3.1 / revision 5。真实 macOS / Windows Chrome 安装、原生菜单及撤权仍为 NOT_TESTED，**正式验收未通过**。见[本轮完整报告](docs/final-acceptance-r5.zh-CN.md)。

## 历史 R5 · 按下右键即弹原生菜单的兼容修复

> 下述 `gesture-first` 取舍已在 0.3.5 取消；它解释旧版本的菜单干扰，不能作为当前行为或待恢复需求。

**关键结论**：预览练习画布以前只处理左键，却默认提示右键。现在右键练习在画布内拦截右键菜单、按右键拖动识别方向；模拟不导航，画布外与键盘菜单不被拦截。可选 Option / Alt + 左键练习。

正式扩展新增 `preferences.menuPolicy`：

- `native-first`（默认）：保留普通原生右键；如果 macOS 在拖动前打开菜单，该次手势放弃。
- `gesture-first`（**用户主动启用**）：在已授权、可信鼠标按下、未命中排除元素时拦截提前弹出的右键菜单，右键拖动可继续；**普通空白区域右键菜单也会被阻止**。可用 Shift + 右键访问原生菜单，或在设置中切回默认；没有伪造浏览器菜单。
- 既有 Option / Alt + 左键方式与禁用、撤权、Esc、双阈值、两段识别和 CAS 存储均保留。

[原始目标、事件时序取舍、专家复核量表与 P01–B01 测试矩阵](docs/right-click-menu-r5.zh-CN.md)。

**R5 当时状态：NODE_PASS / PACKAGE_PASS / INSTALL_NOT_TESTED / NATIVE_CHROME_NOT_TESTED。** 下方旧验证数字及 0.2.1 包说明保留为历史记录，不代表当前候选状态；当前包身份和剩余验证以顶部延迟优化记录为准。

---

## 本轮增量功能（OD-MOUSE-GESTURES-DIRECTION-ARROWS-R1）

- **方向视觉**：每个达到 56px 的有效段，在实际轨迹段末端附近显示一枚 36×36px、9px 圆角的单向箭头（←、→、↑、↓），每枚箭头独立成块。保留纯 SVG 轨迹，不使用首尾相连或双头的箭头图标。候选段仍显示灰色虚线；无效、未配置组合转为橙色提示。鼠标附近的状态文字用“左 / 下”表述顺序，不拼接两个箭头 glyph。
- **有限两段识别**：单方向仍为 12px 意图、56px 激活、28px 侧向约束；转向以当前段的最远点为基准，转向达到 12px 开始锁定第二段、达到 56px 才认可。连续同向合并；超过 12px 回退、斜线、第三段或中途结束的第二段不执行。仍仅在松开鼠标后执行一次动作。
- **组合映射**：仅允许 8 种直角两段方向（左上、左下、右上、右下、上左、上右、下左、下右）。Side Panel「操作偏好」内可把某个组合映射为已有的后退、前进、刷新、滚到底部四种动作。默认映射为空，未配置的组合**不会回退执行第一段动作**。存储使用原 preferences.gestureMappings 和既有 ETag/CAS；不扩大浏览器权限。
- **原生右键保护**：新增可显式选择的手势优先模式；默认仍保留原来的右键、Menu-first/Mac 放弃、Menu-after 关联拦截、Esc、失焦、撤权取消和 Option/Alt + 左键替代路径。showTrace=false 同时隐藏路径、圆角箭头及文字反馈，但不禁用识别。未获取真实 Chrome 证据时，这些行为仍待原生验收。
- **预览**：preview/index.html 为完全离线的右键 / Option + 左键练习模拟，嵌入纯分段逻辑快照，并有源码一致性回归检查；它不安装真实插件、申请权限或执行网页导航。

## 验证分层

```bash
node --test projects/mouse-gestures/tests/*.test.mjs
node --check projects/mouse-gestures/src/page/segments.js
node --check projects/mouse-gestures/src/page/gesture.js
node --check projects/mouse-gestures/src/page/runtime.js
node --check projects/mouse-gestures/src/page/main.js
node --check projects/mouse-gestures/src/main.js
```

初步纯分段模块在隔离本地 Node v22.16.0 运行 **6/6 PASS**（未包含正式模块打包与 Chrome）。原仓库 Node 全套、构建/包一致性、Chrome macOS / Windows 原生手势 **等待本轮新增源代码候选的验证回执**，未执行或没有回执时保持 NOT_TESTED。真实安装授权和撤权测试必须使用仓库已有机制、同一候选版本，不用模拟替代。

---

## 历史 0.2.1 基线说明

> 当前为已提交到 main 的 SOURCE_WIRED 候选。真实 Chrome 原生鼠标菜单时序、安装/升级、网站权限、撤权与同一包身份尚未验收：NATIVE_CHROME_NOT_TESTED / INSTALL_NOT_TESTED。不能将页面模拟或隔离逻辑测试记成正式发布 PASS。

2026-11-11 合并前 R3 记录（OD-MOUSE-GESTURES-4DIR-LOCAL-CHROME-R3，历史标识 OD-MOUSE-GESTURES-4DIR-REAL）：当时预览 DOM 为四项、两列，开关两态都完整显示；未复现“只显示一项”，没有重写 UI。复现并修复了松开右键后等待授权期间 Escape 无法取消迟到动作的问题，新增先失败后通过的回归，业务 Node 测试 27/27 通过。本次合并保留该取消保护和上游双阈值、菜单仲裁及替代触发方式；合并前证据不代表当前源码、已安装 Side Panel 或真实 Chrome 验收。

唯一可导入包：[`mouse-gestures.opendesk-tool.json`](mouse-gestures.opendesk-tool.json)，版本 0.2.1，是合并前 R3 阶段由原打包器校验、晋升的侧栏与 Page Module 候选。本次仅 Git 合并，未重打包，不能将当前源码的新功能或取消保护视为该包已包含；尚未证明已在 Chrome 安装生效。

## 当前产品行为

- **安装后默认开启**：用户审阅并完成 Chrome 网站权限后，首次无 preferences 记录时 enabled=true，Side Panel 滑块同步显示开启，不增加第二次“启用”步骤。用户明确保存 enabled:false 则一直保持关闭；读取失败、值损坏、权限失败及撤权一律 fail-closed，不将“默认开启”当作授权。
- 默认触发方式为 **右键拖动**；四方向手势：← 后退、→ 前进、↑ 刷新、↓ 到文档底部。只处理顶层已授权普通 HTTP(S) 网页，不扩容标签、Native 或后台权限。
- **双阈值**：0–11px 视为普通单击/抖动；从 12px 起作为拖动意图，可显示灰色虚线；净位移达到 56px 且正交最大偏移不超过 28px 才识别方向。明显斜线和折返超过 12px 不执行。Esc、失焦、页面隐藏、停用及销毁取消。
- **原生菜单保护**：contextmenu 如果在有效动作识别前到达（常见于 Mac），保留原生或网页菜单并放弃该次手势。只有当前未取消且已识别可执行动作，才拦截后续与该次右键会话关联的菜单事件；释放后拦截需匹配按键、元素、位置（16px 内）和最多 450ms 的窗口，不拦截键盘菜单及其他目标。旧“手势优先”设置也不吞普通右键。
- **替代方式**：在 Side Panel 的折叠「操作偏好」中，可将触发方式改为 Option/Alt + 左键拖动，作为 Mac 原生菜单提前触发时的保守替代。该方式不能保证所有网页不劫持组合键；仍需真实验收。也可关闭「显示轨迹与动作提示」，不影响方向识别。
- 轨迹绘制复用受管 Page UI Shadow DOM 的 SVG，pointer-events:none，仅在意图阈值后显示。灰色候选轨迹、蓝色已识别动作及橙色无效反馈均不拦截网页点击；松开、取消或撤权清空路径与监听器。requestAnimationFrame 可用时合并绘图，点数上限 80。
- 偏好沿用父工具私有 storage.local 与 ETag/CAS，跨 Side Panel 和 Page 使用既有 OpenDeskAppPage / Page Authority；不增加权限或第二套安装器。Page 在执行前通过一次有身份及授权校验的 storage.get 重读设置；1200ms 同步不是跨标签实时广播，有读取未完成时后台轮询让位。本轮 Browser 变更仅为通用 DOM-ready 启动合同，业务仍在本项目。
- preview/index.html 是独立单文件、无权限的 Side Panel 模拟和右键 / Option + 左键拖动练习区。练习不会导航、读写真实设置或证明原生右键菜单可用。

## 定向验证及待办

    node --test projects/mouse-gestures/tests/*.test.mjs
    node --check projects/mouse-gestures/src/page/gesture.js
    node --check projects/mouse-gestures/src/page/runtime.js
    node --check projects/mouse-gestures/src/page/main.js
    node --check projects/mouse-gestures/src/main.js
    node scripts/build-sidebar-tool.mjs --help

已执行：当前 GitHub main 源码在隔离 V8 中通过 18 项直接行为/语法检查；三份仓库原有及新增测试源码经 Node API 适配后在隔离 V8 执行 **29/29 PASS**；本地对同一状态机设计的 10 项 Node 针对性用例 PASS。**这些不等于仓库 Node 全套测试、打包、正式 Chrome 扩展安装或生产验收已通过。** 后续须按上述命令在仓库工作区执行回归，打包同一个候选 0.2.1，然后在真实 macOS/Windows Chrome 验证普通右键、双阈值、四方向、Mac menu-first、Windows menu-after、Alt-left、滑块首次默认 ON、显式 OFF 持久化、刷新、撤权、卸载、升级及轨迹清理。若系统先打开原生菜单，默认策略是放弃当前手势，不牺牲普通右键。

pageRules 仍为 http://*/* 与 https://*/*，不代表已自动获得网站访问。Chrome 内部页、浏览器 PDF、不获准的 iframe 不支持。

---

## 历史试点记录（0.1.0）


> 2026-11-11：SOURCE_CREATED / Node 9/9 PASS / standalone headless DOM smoke PASS；正式 OpenDesk 安装、用户 Chrome/权限撤销、production `NOT_TESTED`；组合包 `NOT_BUILT`，不可冒称已正式交付。

## 目标与范围

长期产品参考 CrxMouse / Gesturefy / Grand Gesture，覆盖右键轨迹、导航、标签页操作、自定义映射、网站例外、超级拖拽、滚轮/摇杆手势及 PC/Side Panel 管理。本轮**只验证普通网页右键向左移动至少 56px，松开后 `window.history.back()`**，没有完整设置 UI。

试点仅匹配 `https://example.com/*` 顶层文档、`document_idle`、`USER_SCRIPT`，需经原安装器授权、Chrome 网站访问和用户脚本许可；没有后退历史时不会导航。以后扩大网页范围必须单独审阅权限差异。Chrome 内部页/PDF/子框架不是本轮支持范围。

## 架构复用

`Sidebar Tool v2 + pageModule` 组合式应用，唯一项目 `projects/mouse-gestures/`；Sidebar 沙箱源码为 `src/index.html` / `src/style.css` / `src/main.js`，仅提供说明；Page 模块由 `package.json` 声明的 `app.mouse-gestures` 执行 `src/page/main.js` → `gesture.js`。复用现有 `@opendesk/ui` 的 `createPageUI` / `ui.on` / `ui.onDispose`，不改通用 Host/SDK/Installer，不申请浏览器标签页权限。已安装 Page 的停用、撤权、卸载、升级清理由现有 Authority 请求受管 UI 销毁，未知清理必须保留原安全栅栏，不能自动重试或冒充成功。参照 [`reading-toc`](../reading-toc/README.md) 和 [`pageModule` 合同](../../docs/api/sidebar-tool-page-module.zh-CN.md)。

## 行为与限制

只接受 `isTrusted`、右键、净左移 ≥56px、相对按下点最大竖向偏移 ≤28px；命中后一次后退。普通右击、短滑、修饰键、选中文字、输入框/可编辑元素/链接/画布/视频排除；Escape、窗口失焦、隐藏、受管销毁取消。轨迹 SVG 使用 Shadow DOM、`pointer-events:none`，监听器和轨迹均登记到 UI 生命周期。

**真实风险**：本次 headless Chromium 观察到 `contextmenu` 在右键 `mousedown` 之后、首次 `mousemove` 之前触发。纯 USER_SCRIPT 若提前阻止该事件就会破坏普通原生右键菜单；若不阻止，则真实 OS 菜单可能遮挡手势。当前只证明 JS 手势识别，不声称“菜单正常 + 各 OS 真实右拖可靠”已同时通过。必须用真实 Chrome 原生验收后决定产品取舍。

## 定向测试

```bash
node --test projects/mouse-gestures/tests/gesture.test.mjs
node --check projects/mouse-gestures/src/page/gesture.js
node --check projects/mouse-gestures/src/page/main.js
node --check projects/mouse-gestures/src/main.js
```

本轮隔离运行 Node v22.16.0，9/9 PASS：左滑后退一次、右键菜单不误阻止、短滑不后退、ESC/失焦取消、编辑/选区/非可信输入排除、斜向/无历史/松开按钮保护、再次正常右击、销毁释放监听器与 SVG、页面隐藏取消。standalone headless Chromium + Playwright（模拟 Page UI 和可观察导航回调）结果：正常右击 0、短滑 0、左滑 1、ESC 后仍 1、输入框右拖仍 1、销毁后仍 1。它不是宿主安装、真实原生菜单显示或权限撤销的证据。

## 标签页控制（延期，不能暗中提权）

公开 `OpenDeskSDK.browser.tabs.*Owned` 只操作本工具 Owned TabRef，不能凭网页手势关闭/切换/恢复用户任意已有标签。Page `history.back()` 本轮不需要 SDK 增量。Chrome 原生 `tabs` API 属扩展页/Service Worker，`sessions.restore` 要独立 `sessions` 权限；这不等于 USER_SCRIPT 已获得调用权限。后续最小方案必须由平台 owner 独立证明 SDK Gap，限定当前真实 Sender/tabId/documentId、窗口与安装授权代数，并从可信来源证实用户手势，单独审阅恢复权限与破坏性动作，保守处理撤权和 UNKNOWN；不接受脚本自报 `isTrusted` 或任意 tabId。当前结论：`SDK_GAP_NOT_PROVEN`；普通 Page 直接控制他人标签 `BLOCKED`。

## 历史计划：当时的下一轮（0.1.0，非当前待办）

以下保留当时计划，不要求重做已经完成的预览、四方向或存储，也不覆盖顶部 R3 可安装候选与真实 Chrome 待验收状态。

只在既有代码上增量：先完成真实 Chrome 的右键菜单时序取舍；再在 `preview/` 制作可点击单文件 PC+Side Panel 预览，复用现有布局与 Tokens，配置最小字段为 `enabled` / `gestureThreshold` / `siteExclusions` / `gestureMappings` / `showTrace`；最终用应用私有 `storage.local` 与 ETag/CAS 保证保存→刷新→读取不覆盖并行设置。定向验证配置停用/站点撤权资源清理；预览、Node、Headless、已安装 Chrome/production 的证据严格分层。未验证前不发布正式包、不增加标签能力。

参考：[`AGENTS.md`](../../AGENTS.md)、[Extension Creation Workflow](../../.agents/workflows/extension-creation.md)、[Page 生命周期](../../docs/api/page-userscript.zh-CN.md)、[Browser SDK](../../docs/api/browser-sdk.zh-CN.md)、[Chrome Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)、[Chrome Sessions](https://developer.chrome.com/docs/extensions/reference/api/sessions)。
