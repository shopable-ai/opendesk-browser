# 连播助手

在 OpenDesk 原生侧栏给当前作品保存片头、片尾和连播规则。仅已确认兼容的剧集继承作品默认；iYF 历史作品级规则保留在存储中，但未经季/版本验证时不自动跨集执行，明确的本集规则继续生效。已保存的规则由网页模块执行，关闭侧栏后仍有效。

> **四语言侧栏（0.2.17）**：侧栏自动跟随 OpenDesk 界面语言，支持简体中文、英语、日语和繁体中文。切换语言保留未保存的输入和焦点，不执行保存、跳过或切集。独立 Chrome 已验证 320/360/400px、200% 缩放、同 ID 升级和旧规则读回。网页播放提示仍为中文。详见 [R1 接入与 R2 本地验收](LOCALIZATION-PLAN.zh-CN.md#9-r2-本地验收与正式包2026-11-22)。

> **统一账号、VIP 云同步与跨设备恢复（R1 方案，尚未实施）：** 本工具是公共账号与同步平台的首个接入候选，未来按产品范围同步已保存的片头、片尾与连播规则，保留本地优先、原存储身份和播放安全校验；不上传网页 Cookie、密码、浏览历史、播放动作或临时运行态。当前 rules.v1 仍仅使用工具私有本地存储，**登录、云同步、新设备恢复和历史恢复尚不可用**。公共需求树、功能树、冲突/数据契约与验收草案见[统一账号与云同步 R1 设计](../../docs/architecture/unified-account-cloud-sync-r1.zh-CN.md)。


**清除时间端点**：片头开始／结束、片尾开始／结束四个时间框均设有按需出现的 `×`。清除片头开始恢复 `00:00`；清除片尾结束恢复 `End`，随当前视频时长换算。清除片头结束或片尾开始后，该段规则尚未形成有效区间；点击「保存设置」才修改已保存的规则，放弃修改可还原。详见 [时间端点回归](tests/editor.test.mjs)。

**片尾诊断**：片尾结束跟随正片时，结束框显示 `End`，片尾状态显示实际换算区间。排查没有跳过时，在播放页控制台启用 Verbose（详细）并筛选 `[连播助手][片尾]`。`invalid-interval` 表示已应用的规则不适用于本集，`rules-unavailable` 表示规则暂不可读，`before-start` 表示还没到起点，`target-not-seekable` 表示播放器无法从当前位置跳到目标。`triggered` 记录发起的定位；只有同一动作编号随后出现 `confirmed` 才能确认到达。遇到 `unconfirmed` 时先核对当前集、播放时间和 `reason`。日志只显示在本地页面控制台，同一状态不随每次播放进度重复打印。

**可导入安装包：[连播助手 0.2.17](video-auto-skip.opendesk-tool.json)**（网页模块 Revision 17）。通过 OpenDesk「扩展」审阅导入；已有规则时直接更新同一工具，不必先卸载。更新后刷新正在播放的网页以启用新模块。首次设置片头或片尾时，保存有效区间后才会执行跳过。片尾结束留空或输入 End 时，规则保存距片尾的秒数，换集时按正片时长换算。时间轴可切换五档显示范围；关闭跳过后仍可编辑和保留时间。iYF 第 200、201 集未用此版本实播验证。

侧栏显示当前视频换算后的片尾区间，并标明是否来自作品默认。固定区间超出当前片长时，原规则不会自动跳过；若原片尾时长小于当前视频时长，可点「按原片尾时长匹配」把这段时长应用到当前视频结尾，再核对并保存。例如原区间 19:15–20:43 长 88 秒，视频长 19:16 时会算出 17:48–End。点击匹配只改草稿；保存范围以实际回执为准，iYF 保存到当前集。

0.2.6 修复了 iYF 在跳转片尾时轻微上调总时长，导致播放器已抵达目标却被标为未确认的问题。自动跳过确认后，播放网页顶部显示「连播助手：已跳过片头／片尾」，约两秒后自动消失。关闭侧栏仍会提示，手动预览不弹出。

0.2.4 已在 Chrome for Testing 155 的独立配置中验证：首装刷新一次自动识别、视频完全离屏仍可编辑、正片暂不可识别时保留草稿并禁用保存和定位、同一播放器恢复后继续编辑，以及跨集不串用草稿。见[原生侧栏验收回执](artifacts/sidebar-status-native/0.2.4-native.json)。

历史：0.2.1 的网页模块与 0.2.0 使用同一个 Revision 1，但源码不同，原生安装器拒绝更新并保留原数据。0.2.2 使用 Revision 2，见[拒绝回执和包对比](artifacts/page-revision-0.2.2/upgrade-revision-check.json)。侧栏交互以[精简交互预览](preview/index.html)为参照。

| 0.2.1 验证环境 | 当前结果 |
| --- | --- |
| ego(lite) · iYF 实站与 OpenDesk 原生侧栏 | 同一标签已打开《凡人修仙传》第 200 集正片与原生侧栏。安装器拒绝了 0.2.1；须换用 0.2.2 确认更新后，再验证四手柄、范围和继承、保存后重开及片尾随正片时长换算。见[媒体读数](artifacts/preview-aligned-0.2.1/ego-iyf-space37-site.json)和[原生审阅回执](artifacts/preview-aligned-0.2.1/ego-iyf-space37-native-review.json)。 |
| Chrome 155 · 独立测试配置与本机媒体站 | 已验证四手柄、保存与重开、草稿确认、实播跳过、换源与自动下一集。见[主流程](artifacts/preview-aligned-0.2.1/native-journey.json)和[长视频及草稿保护](artifacts/preview-aligned-0.2.1/native-guards.json)。 |
| ego(lite) · 本机 UI 测试壳 | [8 项通过](artifacts/preview-aligned-0.2.1/ego-ui.json)。加载同一包的 HTML、CSS、JS；播放器、存储和确认由模拟 SDK 提供。 |

下表保留 0.2.0 的验证记录。

| 使用场景 | 实际结果 |
| --- | --- |
| 本机测试站（0.2.0） | 同一候选在真实侧栏识别作品、季、集和线路；暂停保存不定位、不恢复播放，重开读回。关侧栏实播各跳一次片头和片尾；关闭连播留在第 1 集，开启只到第 2 集主线路一次并持续播放。 |
| iYF 实站（0.2.0，ego lite） | 已审阅安装并授权。真实侧栏识别《凡人修仙传》第 200 集，保存和重开读回；实播一次跳到 90 秒、一次跳到 1090 秒。季号和线路未核实，相对片尾未实测。站点曾自行切集，助手的自动下一集维持禁用。 |

候选、真实侧栏与授权回执、实播记录和最短复跑步骤见 [R1 验收记录](LOCAL-R1-ACCEPTANCE.zh-CN.md#iyf-实站复跑与完成条件)。双站整体验收尚未通过，当前候选未评分。

当前候选的顶层网页模块匹配 `http://127.0.0.1/video-auto-skip-fixture/*` 和 `https://www.iyf.tv/play/*`。[离线预览](preview/ACCEPTANCE.zh-CN.md) 使用模拟数据。

1. 用 OpenDesk「扩展」导入并审阅[安装包](video-auto-skip.opendesk-tool.json)，批准所用站点的网页功能。首次安装或更新后，如果已打开的播放页提示网页功能未连接或需要重新加载，请刷新该播放页一次，侧栏会重新识别。已安装的同一版本可直接复用。
2. 核对作品、集数和站点提供的季号、线路，编辑后点「保存设置」。已核实的同季兼容视频可共用设置；iYF 季和版本未核实时只保存当前集。已有本集例外继续优先，「恢复继承」可以去掉该项例外。有草稿时可用「放弃修改」回到已保存设置。
3. 时间轴范围可选 1／2／3／5／10 分钟，也可恢复推荐。拖动活动手柄、用方向键逐秒调整，或在时间框输入秒数或分:秒。片尾结束留空或输入 End，保存后按倒数秒数随实际片长换算；填入早于结尾的时间则保存固定区间，可保留后面的内容。片尾卡片显示待保存或已保存的状态。「播放位置校准」中的标记只改草稿；查看和返回可以定位，但不会主动恢复播放。
4. 保存首先更新规则，并在规则已确认写入后尽力保存该作品可阅读名称；名称索引写入失败不会影响规则。此后从有效起点正常播放才执行相应动作；未知时长不执行时间规则。自动下一集独立控制，正常播放到结尾才尝试选择唯一目标，且分别显示到集与实际起播。若动作结果未知，只核对当前播放器状态。

实现由沙箱 Sidebar Tool v2 和同包顶层 `USER_SCRIPT` 组成。使用 [Page Module 公开合同](../../docs/api/sidebar-tool-page-module.zh-CN.md)、工具私有存储与条件写入，不需要修改 Browser Framework。页面地址和媒体源只用于当前文档的内存绑定，不进入规则、下一集收据或导出的验收日志。

存储沿用 SDK 的额度：单键 8 KiB、总计 32 KiB、最多 32 个 Key。当前规则保存在一个键中；未设置的项目不会占用单集记录，保存超限时保留既存规则和草稿。没有自动淘汰。

**R13 作品名称持久化（源码已接入，正式安装/真实 Chrome 仍待验收）：** 继续使用 `opendesk.sidebar-tools.data.v1:video-auto-skip` 私有命名空间；`rules.v1` 与 `next-receipts.v1` 不更名、不迁移。作品名称存放在独立的 `work-index.v1` 中：`{works:{[seriesKey]:{seriesKey,displayTitle,siteId,titleSource,updatedAt}}}`。只为已经有规则的作品保存可信标题，旧作品在被网页适配器重新识别时补录。索引的名称只用于阅读，不用于跨集匹配，也不保存 URL、Cookie、Token 或播放历史。名称更新使用存储 CAS；冲突重读合并，写入结果未知先读回，额度不足不改变 `rules.v1`。同名不同 ID 不混合，改名不改变规则身份。

**历史 iYF 安全保护：** 早期保存的 `series.defaults` 完整留存，但由于 iYF 尚未提供可验证的季/版本兼容集合，播放器仅自动采用明确的单集规则；历史作品默认不能自动授权跨集跳过。侧栏仍允许使用 R10 已有的「按原片尾时长匹配」将历史固定片尾转成当前集草稿，须用户保存后才能生效。已确认的 local 测试适配器继续原有默认继承。正式包升级、真实浏览器数据读回和播放回归结果另行记录，不以源码接入宣称通过。

## 本地真实视频联调页（R1）

新增面向日常调试的[最小本地视频测试页与联调说明](dev/README.md)：复用原生媒体夹具，提供 60／60／75 秒真实 WebM、一个原生播放器、正序三集、同节点换源和简短事件状态。启动命令：`node projects/video-auto-skip/dev/server.mjs`；默认地址：`http://127.0.0.1:8765/video-auto-skip-fixture/ep-1`。页面**不实现**自动跳过/连播，仍由已安装的实际网页模块与侧栏执行。此入口只表示开发夹具已提供，不代表本轮 Chrome 实播或 iYF 实站已验证。
## iYF 手动验收

**用进度条判断：保存时保持暂停，关侧栏实播后片头只跳到 1:30 一次、固定片尾只跳到 18:10 一次，才算这两项通过。** 不需要终端或调试工具。

1. **打开。** 在装有 OpenDesk Browser 的 ego(lite) 中打开 [《凡人修仙传》第 200 集](https://www.iyf.tv/play/O3MkOSlztbO?id=nWwHoSxqG04)，通过原生侧栏「扩展 → 连播助手」进入。复测新版时，从「扩展」导入并审阅[当前安装包](video-auto-skip.opendesk-tool.json)。若停留在旧包的审阅页，点「更换安装包」重新选取该文件，核对目标版本后确认。装好后若已打开的标签提示连接未完成，刷新一次。侧栏应显示作品、第 200 集和约 19:16 的正片时长；季号和线路可能未提供。若停在站点安全验证、还没出现正片，记为**入口受阻**。若正片已出现但侧栏报未授权，从「扩展 → 筛选和管理扩展 → 网页功能帮助」运行一次「检查网页功能 · 连播助手」，按提示处理并刷新。
2. **保存。** 让正片自然播到约 0:29 后暂停。开启「跳过片头」，填开始 **0:00**、结束 **1:30**；开启「跳过片尾」，填 **18:00–18:10**。点「保存设置」。通过条件：提示已保存至当前集，进度和暂停状态都不变；关开侧栏后仍能读到两个区间。
3. **看片头。** 关侧栏，点网页播放。通过条件：从约 0:29 一次跳到 **1:30**，随后时间继续走。可以在回拖前重开侧栏看「跳过片头：… → 01:30」；回拖到约 0:35 后，应该能从那里继续看。已经跳过的页面直接拖回区间，助手会尊重手动回看；要重测可把片头开始改为 **0:45**，从 **0:40** 左右自然播过 0:45。
4. **看片尾。** 确认侧栏已关闭，拖到 **17:57** 左右，让视频正常播过 18:00；如果拖动后已经在播，就不用再点。通过条件：一次跳到 **18:10**，并继续播放第 200 集。也可在短媒体出现前重开侧栏看「跳过片尾：… → 18:10」。不要把进度条直接拖进 18:00–18:10，也不要点「查看」代替实播。

如果 iYF 自带「跳过片头 / 片尾」已开启，可先记下原设置、试验时关闭、结束后恢复，避免把网站的跳过记给助手。测试只需改「仅本集」；测完可恢复原来的本集设置。

**整体验收目前未完成。** 本机测试站已实测连播关闭时留在第 1 集、开启后只到第 2 集一次且播放时间继续走。iYF 的「自动下一集」当前是禁用的；即使网站自己到了第 201 集，也不能算助手通过。iYF 还需验证季和线路、正常换源后的相对片尾，以及助手自己的切集回执、正确到集和正片持续播放。各项结果与原始回执见 [R1 验收记录](LOCAL-R1-ACCEPTANCE.zh-CN.md#iyf-实站复跑与完成条件)。

## 本地播放调试页

### iYF 片尾继承

已有的作品级 End 规则按各集正片的实际时长重算，关闭侧栏仍可运行。固定结束时间只跳到指定位置。用原有时间条编辑本集；清空自定义片尾开始并保存会恢复继承。旧的停用记录可用「恢复继承」明确移除。

实站回归用 [ego-iyf-tail-follow.js](tests/ego-iyf-tail-follow.js)。先在原生侧栏核对安装版本、网页模块 Revision 和第 200、201 集均继承同一个启用的作品尾长，关闭侧栏并把 Space 的 `p2` 留在第 200 集。给脚本传入 `spaceId`、`version`、`revision`、尾长 `seconds`、原生回执 `nativeEvidence` 和输出绝对路径 `output`。脚本刷新第 200 集，分别从两集片尾起点前开始观测，记录自然跨点、同编号的跳过和落点，以及站点的换集结果；脚本不保存任何规则。

### 本机夹具

日常先在这页复现片头、片尾、换源和换集，再到 iYF 验证站点特有的行为。从仓库根目录运行（需要 Node.js 和 ffmpeg）：

```sh
npm --prefix projects/video-auto-skip run dev:player
```

打开终端打印的 [本地第 1 集](http://127.0.0.1:4178/video-auto-skip-fixture/ep-1)。端口被占用时可加 `-- --port 0`，按打印的实际地址打开。按 Ctrl+C 停止。媒体是本机生成的测试片段，页面显示当前时间、总时长和最近一次实际定位；定位读数包含手动操作，单凭它无法判断是哪一方触发的。

- **查扩展行为：**在该播放页打开已安装的「扩展 → 连播助手」，按原流程允许本地站点的网页功能。第 1 集长 210 秒，可以设片头 `20–40` 秒、片尾 `190–200` 秒；暂停保存，分别定位到 18 或 188 秒，再播放自然跨过起点，看是否到达 40 或 200 秒。也可用页面按钮换源，或开启助手的连播后从第 1 集结尾检查是否切到下一集。若要看切集后是否起播，可勾选测试页的自动起播；助手切集与页面起播各看一次。
- **查侧栏样式：**用[离线侧栏预览](preview/index.html)或「开发 → 本地项目 → 在侧栏调试」。本页复用原生测试的真实 HTML 视频夹具；调试页的验证不能代替已安装网页模块的跳过验证，也不能代替对 iYF 正片识别和换源的实站验证。

## 本机复跑

先用 ego(lite) 从已打开且可接入的产品入口验「编辑 → 保存 → 播放 → 跳过／下一集」。核对候选 SHA、已安装身份和授权、作品/季/集/线路、播放器时长和暂停状态。同一候选和会话继续使用，已有同 SHA 的有效回执直接沿用。ego 无法取得的原生侧栏、USER_SCRIPT 或撤权证据单列；仅在明确执行独立原生专项时使用下方复跑入口。仅在空的验收 Profile 上审阅一次，或在单独测试安装、升级和撤权时变更安装状态。

**iYF 第 201 集片尾回归。** 用 `ego-browser skill` 打开任务自有 `p1`：[《凡人修仙传》第 201 集](https://www.iyf.tv/play/O3MkOSlztbO?id=fanqXazJzVZ)。通过「扩展」核对安装版本、授权和有效规则；下例使用已启用的 **1155–1243 秒**区间。准备新的页面播放会话，关侧栏，把正片留在视口内；离屏场景另开一个页面会话，打开侧栏，滚出正片后关掉 iYF 的小窗，确认「播放器已连接 · 视频在屏幕外」，修改一项草稿后取消。页面滚动和侧栏状态由操作者准备，脚本不会修改保存的规则。

```sh
iyf_space_id=42  # 替换为本次任务空间
iyf_offscreen=false  # 离屏场景填 true
iyf_report=$(mktemp -d)/iyf-201-outro.json
{
  node -e 'const [space,candidate,output,offscreen]=process.argv.slice(1); console.log("const options = " + JSON.stringify({spaceId:Number(space),candidate,output,offscreen:offscreen==="true",start:1155,end:1243,replay:true,reload:false}));' \
    "$iyf_space_id" "$PWD/projects/video-auto-skip/video-auto-skip.opendesk-tool.json" "$iyf_report" "$iyf_offscreen"
  cat projects/video-auto-skip/tests/ego-iyf-outro.js
} | ego-browser nodejs
```

脚本校验实际执行的网页模块，先定位到阈值前，再以 1 倍速自然跨过；要求同一正片恰好一次定位，在目标 ±0.25 秒内确认落点，再出现一次「已跳过片尾」，随后在同一网页消失。若站点在回看前换源，将回看结果单列；可用 `replay:false` 只验证第一次跳过。受控媒体中的最后 N 秒、无有效规则、回看和独立连播开关由 `npm --prefix projects/video-auto-skip test` 覆盖。

复跑 ego UI 测试壳时，从仓库根目录启动新的本机服务。每次使用新服务打印的端口，避免复用上次模拟存储：

```sh
node projects/video-auto-skip/tests/fixtures/ego-ui-server.mjs \
  projects/video-auto-skip/artifacts/preview-aligned-0.2.1/candidate.opendesk-tool.json
```

运行 `ego-browser skill`，按指南创建专用 TaskSpace。在该空间的 `p1` 上运行下列脚本，替换示例端口和空间 ID。报告和截图写入独立目录：

```sh
ego_result_dir=$(mktemp -d)
ego_fixture_url=http://127.0.0.1:12345/
ego_space_id=36
{
  node -e 'const [spaceId,url,candidate,outputDirectory]=process.argv.slice(1); console.log("const options = " + JSON.stringify({spaceId:Number(spaceId),url,candidate,outputDirectory}));' \
    "$ego_space_id" "$ego_fixture_url" \
    "$PWD/projects/video-auto-skip/artifacts/preview-aligned-0.2.1/candidate.opendesk-tool.json" "$ego_result_dir"
  cat projects/video-auto-skip/tests/ego-ui.js
} | ego-browser nodejs
```

核对报告后用 `task.finish({keep: []})` 结束该空间，并停止本次启动的本机服务。

需要独立复算时，从仓库根目录运行下列命令。Node 22+、`ffmpeg`、`ffprobe`、Chrome for Testing 155；读取现有 `dist/development`，启动专用临时 Profile 和本机媒体站。直接使用已有冻结候选，源码变更后才按原编译和打包器生成新候选。测试 Profile 不用于真实账户或网站。

```sh
node projects/video-auto-skip/tests/native.mjs --allow-browser --allow-user-scripts --interactive \
  --package projects/video-auto-skip/artifacts/preview-aligned-0.2.1/candidate.opendesk-tool.json \
  > projects/video-auto-skip/artifacts/preview-aligned-0.2.1/native-replay.json
```

分段顺序：规则 → 播放 → 下一集 → 编辑及校准 → 换源 → 撤权。每段开始前打印当前状态；输入 `observe` 仅观察，`next` 核对状态后开始下一段，`quit` 结束本次会话、清理临时 Profile 并保留已测结果。撤权段会改变本次测试 Profile 的站点访问。出现未知写入、定位或导航结果时先读回，不重复点击。`--segment rules` 只跑规则；`--segment guards` 只跑长视频输入、绑定变化和导航回执专项；去掉 `--interactive` 可连续运行所选范围。此入口只用于本机夹具。

复跑本轮侧栏状态专项时，使用 `--segment sidebar-status` 替代 `--interactive`，`--package` 指向当前安装包。测试在独立配置中先打开本机播放页再审阅安装，随后校验滚动坐标、草稿和换集，输出 JSON 回执。

复跑 R9 主流程时，使用 `--segment r9 --screenshots <输出目录>` 替代 `--interactive`，`--package` 指向当前安装包。专项使用 45:00 和 48:00 的本机视频，核对 360px 与 320px 侧栏、拖动与保存、重开持久化、片尾换算、放弃草稿和播放器跳转回执。

复跑网页提示专项时，使用 `--segment page-toast` 替代 `--interactive`，`--package` 指向当前安装包。通过条件：手动预览不弹提示；关闭原生侧栏后，真实播放越过片头和片尾起点，在各自跳转确认后只显示一条对应提示，提示不抢焦点、自动消失，视频继续播放。

开发入口独立检查：用已授权的 Native Workspace 从「开发 → 本地项目 → 在侧栏调试」打开，核对本地快照与冻结候选 SHA。调试存储隔离，无法借用已安装包的网页授权；安装侧栏与实播仍以各自证据为准。实际安装、浏览器授权、站点动作和评分见 [R1 验收记录](LOCAL-R1-ACCEPTANCE.zh-CN.md)。
