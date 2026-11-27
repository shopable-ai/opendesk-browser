# 视频下载 · Video Downloader

唯一业务目录：`projects/video-downloader/`。UI 源为 `src/index.html`、`src/style.css`、`src/main.js`，通过原 `OpenDeskTool.request` 调用固定可信 Host。`trusted/` 由已有 Side Panel Host 静态编译，八个来源文件按精确 Git blob 审查（包含固定转封装库子集）；普通导入包不能携带或替换这些特权代码。

## 0.4.4：同一视频只占一行（2026-11-27）

同一个播放器提供的 MP4、WebM 等备选源共用一行；已识别 HLS 主清单的清晰度也放在同一行。检测无法证明两个来源属于同一个视频时，保留独立结果。列表默认选择当前格式下可保存的来源，直接点下载图标即可；有不同来源或清晰度时，可在同一行切换。

## 0.4.3：在侧栏设置一次下载格式（2026-11-27）

列表上方的「下载格式」默认为「原格式（默认）」，可改为「MP4」。设置保存在同一 Chrome Profile 的工具数据中，切换网页或重开工具仍沿用。每条可下载视频只有一个「下载」按钮；更改设置不会创建任务，已开始的下载继续使用点击时的格式。

单文件 MP4 或 WebM 在原格式下直存；支持的 HLS 分段按实际容器合并为 TS 或 MP4。选择 MP4 后，现有 MP4 直存，支持的 TS 自动转封装。WebM 等已知不兼容的来源会说明原因，并提示切回原格式、换清晰度或重新检测。加密、分段失败、撤权与下载回执未知的原保护继续生效。

开发验收：本机 Chrome 155.0.8059.39 的真实 360 CSS px 侧栏，从现有审阅入口安装 0.4.3，并读回开发 revision `ff7dd3e14a3b`。鼠标选 MP4 无新增下载，切页、重开侧栏仍保留；HLS 下载中用键盘切回原格式，该任务仍保存 MP4，下一次保存为 MPEG-TS，WebM 恢复可下载。Chrome 原生保存的五个文件均通过容器探测和完整解码，三个直存文件与源文件逐字节一致。

本机证据目录：`artifacts/video-downloader/0.4.1/v043-native-2/`，包含截图、`events.jsonl`、`file-verification.json` 和实际保存文件。加密、分段失败及回执未知防重放由定向 Node 回归覆盖。未进行 production 或 CWS 验收。

## 0.4.0 历史：验证默认保留原格式

单文件一步下载并保留原封装；分段流只做所选输出所需的处理。新的 TS 默认方式与可选 MP4 均需要同版固定 Host；新界面连到只支持 MP4 的旧 Host 时，将旧 TS 动作明确标成「封装并下载 MP4」。

| 操作 | 通过条件 |
| --- | --- |
| 检测同源 MP4 / WebM，点击「下载原文件」 | 按钮标出格式；一次点击，保存后缀正确，文件与样片字节一致且能独立解码。 |
| 对支持的 HLS 选择清晰度并使用默认方式 | TS 按原顺序合并为 `.ts`，明确提示需支持 TS 的播放器；fMP4 合并初始化段和媒体段，保留 `.mp4`。两条路径都不进入 MP4 封装阶段。 |
| 对 TS 点「另存为 MP4…」 | 取消不启动任务或保存；确认只启动一次，输出真实 MP4，保持原音视频编码。 |
| 遇到加密流或分段失败 | 加密候选标明原因且不可下载；读取失败不保存半成品，保留原因及重新检测入口。分段、合并／封装、保存和完成状态可以区分。 |

0.4.0 验证记录：源码通过 93 项定向 Node 检查，正式工具包已通过候选晋升和同源校验。ego(lite) 用实际包界面和可信 Host 源码完成 8 项本地夹具检查；5 个保存文件均通过 FFmpeg 解码，原格式路径另外核对了源文件或分段字节。夹具使用 Chrome API 适配层。

持续开发目录已包含 0.4.0 工具包；原 watcher 重编译时仍使用旧来源 pin，固定 Host 产物未更新。新版 Chrome 安装、原生侧栏与 Chrome 下载 API 未验证。

## 开发验证：授权的 AES-128 HLS 分段导出

项目内的 [Node 开发入口](scripts/export-authorized-aes128.mjs) 只用于自有或内容方明确允许导出的来源。它不接入侧栏；普通加密播放清单和 DRM 仍不可下载，原安装和站点授权不变。

有内容方明确授权后，将其通过可信渠道提供的授权单和独立的 16 字节原始密钥保存在本机。授权单采用 JSON：

| 字段 | 值 |
| --- | --- |
| `kind` | `authorized-aes128-export.v1` |
| `manifestUrl` | 内容方允许导出的 HTTPS 媒体清单地址 |
| `manifestSha256` | 清单原始字节的 SHA-256（小写十六进制） |
| `expiresAtMs` | Unix 毫秒到期时间 |
| `segments` | 按清单顺序列出的各段；每项包含 `encryptedSha256` 和 `plainSha256`（小写十六进制） |

~~~sh
node projects/video-downloader/scripts/export-authorized-aes128.mjs --rights-confirmed ./owner-grant.json ./owner-key.bin ./exports
~~~

确认参数和本地 JSON 本身不能证明内容权利，也没有发行方签名验证。当前只接受单密钥、同源 HTTPS 的完整 MPEG-TS VOD；不读取播放清单中的密钥地址，不携带 Cookie，不跟随重定向。脚本按序校验网络返回的密文、用独立密钥在内存核对明文字节与 TS 结构，再保存编号的原始 `.ts.enc` 文件。`receipt.json` 记录段数、序号、声明时长、IV、字节数和密文 SHA-256，无密钥、明文或源 URL。任何一段失败、授权单过期或被移除／替换，均不发布导出目录。线上授权失效以源站拒绝请求为准；无独立的在线撤销查询。

自有夹具通过本机网络验证了落盘字节，见[实测](PLAYBACK-AND-DOWNLOAD-VERIFICATION.zh-CN.md#授权-aes-128-hls-分段下载开发实测)。合并、MP4、FFmpeg、真实 Chrome 侧栏接入与生产验收不在这一步。

## 0.3.4 区分已识别和可下载（2026-11-27）

检测结果同时显示已识别的视频源数量和可下载数量。已确认加密或 DRM 的 HLS 会在对应条目说明原因，下载按钮保持不可用。该版只改工具界面；安装权限和固定 Host 不变。

在 ego(lite)「视频下载」TaskSpace 中，已安装的 0.3.3 在 PineShorts 第 1 集检测到两条 HLS 点播清单。播放器使用 `blob:`，清单可从媒体资源记录找到；两条均有 31 段和加密声明。0.3.3 也通过同一侧栏保存了本项目自制的 1 秒 MP4，磁盘文件与样片逐字节一致。0.3.4 的提示和可下载流程通过定向 Node 测试，已晋升并校验正式包。扩展中心可见新版，更新审阅入口未能打开；0.3.4 尚未安装实测。

## 批量网页下载与文件命名 R1（0.5.2）

**状态：已实现并打包。** 在「扩展 → 视频下载」中切换到「批量下载」，导入网页地址，打开第一条，选择要保存的视频和清晰度并加入队列，再开始下载。文件名可以在加入前或队列提交前编辑；默认完成后由用户打开下一条。

### 产品目标

在保留「当前页面单视频下载」的前提下，增加「批量下载」工作区：用户一次粘贴多个视频网页地址，逐页识别视频、选择候选与清晰度、设置保存文件名，按顺序下载并查看每项结果。批量输入的是**视频网页 URL**，不是直接下载 URL；每个媒体仍必须由当前已授权 Document 的 `media.detect` 产生 opaque candidateId。

### R1 产品决策

1. **两个入口并存**：「当前页面」继续使用原检测/清晰度/下载操作；「批量下载」提供多行地址输入和队列管理，不推倒原界面。
2. **地址输入**：一行一个绝对 HTTP(S) URL；最多 8 条；忽略空行和首尾空格；按 `new URL(value).href` 规范化后去重；保留 query/hash；拒绝非 HTTP(S)、嵌入用户名/密码、超过 2048 UTF-8 字节及非法地址。不把逗号当分隔符，不静默截断超量输入。
3. **8 条上限来自现有公共合同**：Browser Tabs Host 的 `MAX_OWNED=8`，并非任意 UI 数字。R1 不修改通用 Host 扩大上限；达到上限时明确提示用户关闭已处理的本工具标签页后再导入下一批，不能关闭用户原有标签页。
4. **逐页串行处理**：复用现有 `OpenDeskSDK.browser.tabs.create / getOwned / activateOwned / removeOwned` 与 `browser.tabs` capability；工具包同时保留 `page.mediaDownload`。每次只处理一个当前网页、只运行一个 `media.start`。用户切换到其他标签页时，先激活本工具拥有的 tabRef 并核对文档，再检测。不得使用原生 tabId、不得操作非本工具创建的标签页。
5. **授权按 Origin 分别处理**：打开网页和检测/下载仍使用现有 Browser Tabs、Chrome 网站权限及 `page.mediaDownload` 授权。缺少授权时提示用户通过现有可信流程批准，不自动申请全站权限、不增加 `<all_urls>`、不跨域抓取、不读取 Cookie。
6. **不自动播放或绕过网站流程**：网页没有媒体候选时显示「请在网页中正常播放视频后重新检测」，保留当前网页任务；登录、验证码、会员限制、DRM/加密、直播、DASH 或不支持格式均不绕过、不自动跳过。用户可明确选择重新检测或跳过。
7. **同页多媒体**：当前网页多个独立候选可以分别加入队列；同一 HLS master 的多个 rendition 是同一视频的清晰度选项，不得显示成多个视频。所有下载仍使用 Host 检测得到的 candidateId/variantId。
8. **任务严格串行**：现有 `trusted/host.js` 只有一个活动 `task`，并用 `nativeSaves` 保护未知原生副作用。R1 不做并发下载、不改造成多任务 Host。上一任务必须先得到可核对终态并由 UI 保存结果快照，才可提交下一任务。
9. **推进条件**：默认由用户点击「打开下一条」；可选「当前网页所选任务全部完成后自动打开下一条」，默认关闭。自动推进只允许在结果明确时发生。页面无视频、需人工播放、权限不足、下载中断、`complete_unverified` 或 `unknown` 时暂停队列并等待用户决定；`unknown` 只读核对原任务，绝不重发下载/停止。
10. **停止与暂停分开**：「暂停队列」只阻止提交后续任务，不假装暂停 Chrome 当前下载；「停止当前下载并暂停队列」才调用原 `media.stop`。停止/结果未知后不能自动进入下一项。
11. **会话边界**：R1 队列状态只在当前工具实例内管理，不在关闭/重载后自动重放。重新打开后允许用户重新导入地址；原 Chrome 下载结果仍按现有 Host 回执核对，不能从 UI 缓存推断完成。
12. **标签页关闭**：默认不自动关闭已处理网页。用户可手动关闭；只有用户明确选择关闭时，才可通过 `removeOwned({tabRef})` 关闭本工具创建且仍有效的标签页。引用失效/未知时不重试关闭。

### 文件名规则

- 下载前显示可编辑的「保存文件名」输入框，编辑的是**文件名主体**，不允许用户指定目录或路径。
- 默认优先使用当前网页标题；标题缺失时使用 URL 路径末段；仍不可用时使用安全时间戳 fallback。批量任务默认加稳定序号前缀（如 `001-页面标题`）；同页多个候选再加候选序号。
- `media.start` 增加可选 `filename` 主体字段，旧调用不传时保持兼容。可信 Host 必须再次校验和清理，不能信任沙箱输入。
- Host 清理控制字符、`<>:"/\\|?*` 等跨平台非法字符、首尾空白和尾部点，去除路径分隔/目录穿越，处理 Windows 保留设备名，并限制长度。清理后为空时使用安全 fallback。
- 最终扩展名由**真实输出格式**决定：HLS 经现有 H.264/AAC 封装后为 `.mp4`；直接 WebM 为 `.webm`。用户不能用输入后缀伪造格式；TS 输入不等于 TS 输出，也不能只改扩展名冒充 MP4。
- Chrome 保存继续使用 `conflictAction: 'uniquify'`，避免覆盖；UI 只展示文件名 basename，不展示本机完整路径。
- 一旦 Chrome 保存已提交或结果变成 `unknown`，文件名锁定；不能改名后重发。

### UI 结构

- 顶部保留工具标题；正文以「当前页面 / 批量下载」切换工作区。
- 批量区包含多行输入框、有效/重复/无效数量、「导入链接」按钮和最多 8 条网页任务列表。
- 每条网页任务显示标题或 URL、状态、候选数量和当前操作；长 URL 可折行/截断，支持查看完整地址。
- 候选区显示视频身份、清晰度、真实支持格式、文件名输入和「加入队列」。
- 下载队列显示网页序号、文件名、格式、清晰度、状态。仅当前活动任务显示实时进度；完成/失败历史只保留简明结果。
- 不重复显示同一下载状态，不在没有任务时显示空任务卡。暗色模式、键盘焦点、ARIA、中文长标题和 URL 溢出保持可用。

### 关键 UI / 功能验收条件

| 分组 | 必须通过的场景 |
| --- | --- |
| 地址导入 | 1/2/8 条输入；空行/空格；规范化去重；保留 query/hash；拒绝非法 scheme、嵌入凭据、超长 URL；第 9 条明确拒绝且不静默截断 |
| 标签页 | 两个不同 Origin 顺序打开；只操作 owned tabRef；用户切换标签后可重新激活正确页面；手动关闭/重定向/同 URL 新 Document 使旧引用失效；8 个引用上限明确反馈；不关闭用户原有标签页 |
| 授权 | 缺少 browser.tabs 或网站授权时明确提示；每个 Origin 独立审阅；撤权后停止后续操作；不自动扩权、不读取 Cookie |
| 识别 | MP4/WebM；HLS master rendition；同页多个独立候选；HLS 清晰度不重复成多个视频；未播放、登录、DRM/加密、直播、DASH、无候选分别提示 |
| 队列 | 多页按顺序处理；同页多个候选顺序下载；任意时刻最多一个 media.start；暂停只暂停后续；Stop 后队列暂停；无视频不自动跳过；自动打开下一页默认关闭 |
| 状态安全 | 页面导航使 candidateId 失效；重复点击不重复保存；unknown 只核对原任务；complete_unverified 不当作已验证成功；迟到回执不启动下一任务 |
| 文件名 | 中文标题默认值；空标题 fallback；非法字符/控制字符/尾部点/保留设备名清理；路径穿越拒绝；MP4/WebM 后缀与真实输出一致；重名 uniquify；旧版无 filename 调用兼容 |
| UI 回归 | 原单视频操作不退化；打开工具仍只自动检测一次、不自动下载；进度/状态不重复；换页保留原任务回执并清理候选；暗色、键盘、ARIA、长标题与窄侧栏可用 |

### 实施范围与顺序

预计由本项目 owner 修改：`tool.config.json`、`src/index.html`、`src/style.css`、`src/main.js`、`trusted/host.js`、必要的可信准入/版本 pin 文件，以及现有 `tests/ui.test.mjs`、`tests/core.test.mjs` 和 README。不要预先改通用 Browser Host；只复用已公开 SDK。

实施顺序：核对最新 main 和实际代码 → 地址解析/去重 → Browser Tabs 接入与授权反馈 → 页面/媒体双层队列 → 串行状态机 → 文件名 Host 校验 → 定向测试 → 原打包器候选/门禁/晋升/同源检查 → 同候选真实 Chrome 验收。

**可信代码特别注意**：`trusted/host.js` 是固定编译并按精确 Git blob 审查的代码；若修改它，必须按现有准入/来源 pin 流程审查并同步，不得修改摘要或 pin 来制造 PASS。核对 `trusted/policy.js` 中 `MEDIA_VERSION` 与当前工具和包的版本；若确认漂移，再按项目规则修复。

### 明确不做

不开发并发下载、DASH 合并、YouTube 下载、DRM 绕过、自动登录/播放、Cookie 读取、任意 URL 下载、任意目录保存、自动转码、第二套 Host/下载引擎/权限系统、通用 Browser SDK 扩容或自动关闭用户原有标签页。R1 的重点是多个网页顺序下载、真实文件命名和可恢复的任务反馈。

### 实现与验证状态

0.5.2 正式包已由原打包器晋升并通过源码同源校验。批量识别依赖配套 Browser 构建中的固定 Host；单独导入工具 JSON 不会更新它。224 项定向 Node 测试通过，覆盖网页与下载队列、文件名、授权、Document 以及未知或未核实结果的处理。

2026-11-27，Mac Chrome for Testing 156.0.8078.4 使用隔离 Profile 和配套 production 构建，经扩展中心安装 0.5.2。单页保存 `真实单页视频.mp4`；批量先在 hls.js Demo 选择 288p，保存 `批量一号 中文.mp4`，完成后再打开 MDN 示例页，保存 `批量二号 WebM.webm`。FFprobe 核对容器，FFmpeg 完整解码通过。本机双源夹具另验证同页两个独立候选依次下载，以及 Chrome 重名保存为 `批量二号 WebM (1).webm`。

在同一候选上，Chrome 正确中止慢下载且未保存成品，同 URL 重载清除旧候选并保留回执；隔离下载记录缺失时只核对原任务，零字节文件虽被 Chrome 标记完成，侧栏仍显示「文件未核实」。三种情况均未打开下一页。360 px 侧栏的暗色、长 URL、焦点、ARIA 和下载格式键盘操作已核对；HLS 清晰度选择经真实下拉控件触发，未验证该下拉框的原生键盘选择。

## 0.3.3 换页后保留原下载回执

换页会撤下旧媒体候选，并保留原下载的进度或结果。停止结果未知时，「核对下载状态」只读取原任务，不重复下载或停止。此行为需要对应版本的固定 Browser Host；单独导入工具包不能替换该 Host。

## 0.3.2 保留停止结果未知状态

Chrome 的停止回执丢失后，读回「仍在下载」时继续显示结果未知；确认终态后才结算，不重发停止请求。定向 Node 回归通过。[video-downloader.opendesk-tool.json](video-downloader.opendesk-tool.json) 已晋升并通过 `--check-project`，13,213 字节，SHA-256 `928a7088a896e1a1173f391633e3d79d1d3529c3f44d72ab14a6ecf5f249d62e`。JSON 仅更新版本；行为修复需要包含新固定 Host 的 Browser 构建。本版未验证 Browser 构建或 Chrome 安装。

## 当前用户操作

在有权保存视频的普通 HTTP(S) 网页中播放视频，打开 OpenDesk「扩展 → 视频下载」，工具自动检测一次，展示清晰度和对应的保存方式；保存仍须用户点击。若先打开工具再开始播放，或切换网页，点击「检测」刷新候选。工具读取当前已授权文档中的 `<video>` / `<source>`，并在一次检测中读取资源记录末尾最多 256 条明确媒体 URL；最多返回 48 个去重候选。普通媒体请求限最近 30 秒；当前文档存在 blob 视频时，也读取该有界记录中更早的 HLS/DASH 清单，避免初始化清单超过 30 秒后无法发现。没有后台监听、全站抓包、播放器改写或持久化媒体 URL。

- 同源直接 MP4/WebM 经文档、工具身份、网站权限复查后交给 Chrome 下载。
- HLS master 展示真实清晰度、码率和分段数，默认选择最低已知码率的可用档。只有已获源站 Chrome 权限、完整、非加密且当前封装受支持的 VOD 可下载。跨源 HLS 的每个清单、初始化段和分段都分别校验来源与权限；不自动申请扩权。
- HLS 收齐分段后才提交一次 Chrome 保存。TS 默认合并原分段，fMP4 复用初始化段与媒体段并保存为 MP4。只有用户确认「封装并下载 MP4」时，支持的 H.264/ADTS AAC TS 才会转封装。若编码或 AAC 配置不符合 MP4 要求，工具说明原因；用户可重新检测后选择原分段。界面分别显示分段、合并或封装 MP4、保存和 Chrome 下载状态。
- `complete` 必须从 Chrome 记录确认文件存在且收到字节；所有回执仍为 `playbackVerified=false`，只有独立解码/播放才是可播放证据。
- 停止会中止分段并取消已知 Chrome 下载。导航、撤权和卸载使旧候选失效，迟到的 native ID 仍被接收并请求取消。已知终态才释放 Blob；原生回执或取消结果未知时保留 `unknown`，不重新下载。

清单最多 256 KiB，单段最多 8 MiB，总读取最多 128 MiB、2048 段、30 分钟；并发 3，每次读取超时 15 秒。请求不携带 Cookie、不发送引用页信息、拒绝重定向，失败不自动重试。拒绝私网/本地 URL、加密/DRM、直播、缺失分段、分离外部音轨及当前不支持的清单特性。DASH 合并与 YouTube 只读结构诊断延期；不提供未经授权的 YouTube 下载。

## 0.3.1 侧栏下载按钮修复（2026-10-31）

真实 hls.js Big Buck Bunny 页面复现：播放器已加载 10:34 影片，右侧「视频下载」点击检测仍没有候选和下载按钮。原固定发现快照把初始化清单按 30 秒窗口过滤；另一个可发现性缺口是打开工具后必须再手动检测。

本版打开 UI 自动检测一次、不自动下载、不轮询；blob 视频在当前文档尾部 256 条资源记录中保留的旧清单可被发现。普通直接文件保持原时间窗，非法时间/URL、候选上限、文档/来源权限、安装准入和未知保存防重放不变。修复使用原项目 UI 与固定 `trusted/discovery.js`，不增加网页悬浮层、后台监听或通用 Host API。正式包及对应 Browser 固定代码需要配套更新，本地导入同 ID JSON 不能取得官方准入。

当时正式 UI 包 `0.3.1`，13,213 字节，SHA-256 `c56acd7ed951ac57548b2e871d356beef82dc5c62778f93821f1b9f178548e56`。原打包器候选校验、测试后晋升及 `--check-project` 同源检查通过，权限仍为 `page.mediaDownload`。

UI、发现、Host 核心与精确来源定向检查 52 项通过；新增用例先复现打开后无按钮、旧 blob 清单丢失，再验证修复及尾部扫描限制。**0.3.1 当前核心操作已在原普通 Chrome 通过**：用户明确允许恢复开发更新后，复用原 `dist/development` 与唯一 `npm run dev`，经原官方审阅从 0.3.0 更新到 0.3.1，权限未变。未刷新原 hls.js demo，打开工具自动检测到 3 个 HLS 候选；主清单显示真实 `320×184 / 246 kbps / 64 段` 与可点击下载按钮。

实际点击该主清单下载按钮，观察分段进度 `0/64 → 37/64` 和「Chrome 下载完成」，本次新保存 `/Users/mac/Downloads/opendesk-video-1793434651617.mp4`，**19,914,926 字节**。独立文件回读确认真实 ISO BMFF MP4、`ftyp/moov/moof/mdat`、H.264 `avc1` 视频与 AAC `mp4a` 音轨；SHA-256 `30d38f0eed9f9dcc6a13c76691f56bb0615d467b1225d815970f40a607d74c6b`，与下方历史完整解码及 QuickTime 验证过的 MP4 逐字节一致。瞬时 MP4 封装/保存 UI 未单独捕获，不据此虚报阶段截图；不重复历史全长解码/播放。新文件经下载前文件基线排除了旧文件，不是手工复制或转封装。

本次 Browser 编译 revision `cc24806c341794e9f5edeaa9f9495deac73e2ffd9888754dd9d6b70d609edb0e`，原输出 writer PID `73839`，43119/43120 实际监听；磁盘固定 Host sourcemap 的 discovery 与项目源码逐字节一致，官方 Catalog 和 UI 包同为上述 0.3.1。Chrome 管理页加载路径/真实 ID 未独立核实，不以磁盘产物替代该项。原共享 AI 的 unknown 与禁止重放仍保留，不将本次已获授权的更新写成该 AI 已退休。当前证据为 `artifacts/video-downloader/ui-core/current-entry-01a190d5.json` 与 `current-new-mp4-01a190d5.json`；来源分层与早先失败见 [`video-downloader-sidebar-20261031.md`](../../docs/framework/workstreams/video-downloader-sidebar-20261031.md)。此为当前日常 Chrome 核心通过，production/CWS、全站兼容及完整矩阵仍未测。

## 0.3.0 自动 MP4 实现与历史验证

原入口仍是「扩展 → 视频下载 → 检测 → 下载」；真实消费者 `trusted/host.js` 沿原 `downloadHlsVod` → Blob → Chrome 保存。新增纯字节处理 `trusted/remux.js`，只静态进入原固定 Side Panel Host，不新增 Host、Worker、Native 服务、任意 URL SDK 或网站权限。按 TS 顺序保留 H.264/AAC 码流：空初始化 sample table 的 movie/track/media duration 为零，完整时长写入 `mvex/mehd`，防止 QuickTime 累加为双倍。音视频描述在同一 fragment 内，AAC 初始化、采样时钟与每段时间值一致；主清单的 `CODECS` 传入显式 HE-AAC/SBR 配置。未知低采样率 AAC 缺少主清单声明时拒绝，避免凭采样率猜测 SBR。只接受单 H.264 视频与至多一条 ADTS AAC，未知 PMT 编码、额外媒体轨道或不支持配置拒绝，不静默丢轨。

封装按包边界分批让出事件循环，Stop、导航、停用/卸载可使原 AbortSignal 和安装代际失效；封装前后及保存前复查原文档、安装身份和每个实际来源权限。128 MiB 的输入及输出上限保留，分段上限、并发、无 Cookie/无引用页、拒重定向和 unknown/迟到 ID 所有权不变。直接 MP4/WebM 和已有 fMP4 不进入 TS 转封装。

固定依赖仅归本项目：`trusted/vendor/mux-transmuxer.js` 是 `mux.js@7.1.1` 的 24 个纯转封装源文件子集，68,886 字节，Apache-2.0。来源、tarball SHA-512 SRI、每个输入 SHA-256 和产物 SHA-256 在 `mux.provenance.json`，许可证为 `mux.LICENSE.txt`，Browser 原静态资源表随包提供 `licenses/video-downloader-mux-Apache-2.0.txt`。原根 npm 依赖未添加 mux.js；浏览器无 npm 下载、远程脚本或 FFmpeg。原本机残留 node_modules 不能当来源证据，已从 npm 官方固定 tarball 验 SRI 后独立重建并 `--check` 逐字节复现。开发者复现：

```sh
npm pack mux.js@7.1.1 --ignore-scripts --pack-destination artifacts/video-downloader/tooling
node projects/video-downloader/scripts/build-remux-vendor.mjs artifacts/video-downloader/tooling/mux.js-7.1.1.tgz --check
```

当时正式 UI 包 `0.3.0`，13,150 字节，SHA-256 `4b57c39c5dbe5c3bb2693760959d090c83ff0f30a376a8372738457a6514852a`。原候选 → 受影响门禁 → `--promote-from` → `--check-project` 已通过。47 项定向检查覆盖真实 TS→MP4、HE-AAC 配置/有限时长、网络顺序、封装中 Stop/导航/安装撤权/来源权限撤销、unknown/迟到 ID 和八个精确来源 pin。不是 Chrome 安装或播放证据。

本轮真实结果：沿原官方审阅从 `0.2.1` 更新到 `0.3.0`，权限未变化。公共 hls.js 播放器选择 Big Buck Bunny，检测后在主清单候选看到默认最低 `320×184 / 246 kbps / 64 段`；点击下载，界面实际经过「下载分段 → 正在封装 MP4 → Chrome 下载完成」。新文件为：

- `/Users/mac/Downloads/opendesk-video-1793390579975.mp4`，**19,914,926 字节**；SHA-256 `30d38f0eed9f9dcc6a13c76691f56bb0615d467b1225d815970f40a607d74c6b`。
- 独立固定 FFmpeg 对新文件严格、完整解码退出 `0`：H.264 320×184、**19,039 视频帧**，HE-AAC 双声道 44,100 Hz、**13,656 音频块**，**634.633333 秒**。与原 TS 的全部解码帧/音频块逐项 SHA-256 一致，没有重新编码、缺帧或音频内容损失。原始 framehash 与比较 JSON 位于同一 `ui-core` 目录。
- **QuickTime 实际播放通过**：新文件路径、正确 `10:34.633` 时长、正常运动画面、1.0 倍速推进。以带前台/文件窗口守卫的真实鼠标拖动时间线，从 `148.6227` 秒拖至 `498.905944` 秒（约 02:28 → 08:19），恢复后实读 `499.148127 → 511.111588` 秒。没有通过设置播放器时间属性冒充拖动。音量 1、未静音；物理扬声器实际听音与 Windows 原生播放仍 `NOT_TESTED`，未申请/使用麦克风。
- 这轮实际播放曾发现首个 MP4 `/Users/mac/Downloads/opendesk-video-1793389788043.mp4` 在 QuickTime 时长翻倍。它与中间算法样本仅保留作缺陷证据；当前交付文件是上面的 `1793390579975.mp4`，修正后重新从真实侧栏下载，未用手工转旧文件替代。
- 新封装中的 Stop、导航、安装撤权、来源权限撤销与原 unknown/迟到 ID 保护已过本轮定向 Node 检查。原生封装瞬间 Stop 两次未命中有效时序（一次已先完成，一次未捕获阶段）；较高档尝试未进入有效候选，**均不计 PASS**。形成的完整副本保留。未改传输/Host 的原真实 Stop、导航、停用/恢复、卸载证据保留原等级，不宣称完成新版全量安全矩阵。

真实 Browser 是固定 `dist/development` 的已加载候选，revision `a0ebb4a637379cd7ebd7da017db73c1612f4f3e88e4e41f45747c97a70a7132f`。八个可信源码与该实际产物 sourcemap 输入逐字节一致，131 个指纹文件零漂移；Host 698,166 字节，低于既有 1 MiB 上限。Chrome 管理页实际加载路径仍未独立核实，不能以指纹代替该项。正式包与 Browser 固定代码分别核对，普通本地项目仍不能冒充官方安装身份。

**开发服务冻结的历史记录**：新 Node writer `25735`（原路径、无第二 writer）在 `2026-10-31 04:13:45 CST` 以 `SIGSTOP` 暂停，保留锁和当时的 `a0ebb4a63737` 产物；后续接续实查该进程已不存在，详见上方当前状态。冻结原因是先前业务源码保存确实触发 WXT 自动重载，而另一原 AI 请求跨 Host 回执仍未知；不能假定普通安全客户端挡住了这些重载。冻结后完成最终 pin/源码保存，不再触发发布；Chrome、Go/Native、Cookie Relay/TLS/DB 与原 AI 请求未被停止/清理/重放。恢复 writer、重新构建或重载须先由原请求所属工作流完成生命周期对账或合法安全退休，不能另启第二 writer 绕锁。这不是该 AI 已完成/已退休或所有重载边界已释放的声明。

完整原始记录仍是 `artifacts/video-downloader/ui-core/progress.json` 的 `mp4Delivery`、原交接末尾、`mp4-final-file.json`、`mp4-final-ui-terminal-ax.json`、`mp4-final-decode-comparison.json`、`mp4-final-after-drag.png` 与播放器回读。生产/CWS、DASH/YouTube、评分、宽度/缩放及强制 Chrome 迟到回包继续延期。

`tests/fixtures/h264-aac.ts` 是自制 1 秒图案/正弦音的单元样本；`h264-he-aac.ts` 是原公共 Big Buck Bunny TS 的 1 秒原码流截取，© 2008 Blender Foundation / CC BY 3.0。小样本只供单元检查，不能替代完整公共 HLS 的 UI 与播放验收。

## 原 0.2.0 的真实 UI 下载与本轮原文件播放证据

已在真实 Mac Chrome 经「扩展 → 官方市场 → 视频下载」审阅安装 `0.2.0`，再在普通 hls.js 播放器网页检测公共 Big Buck Bunny 测试流，使用真实主清单默认最低档 `320×184 / 246 kbps / 64 段`，完成分段、合并及 Chrome 最终保存。

- 实际保存文件：`/Users/mac/Downloads/opendesk-video-1793376964608.ts`，`22,418,060` 字节；SHA-256 `dca82b4374ee198b5a605dc03b0924152f6122e594df577a3e9ce8b63a9db0d3`。
- 独立本机完整解码：固定、SRI 核对的 `@ffmpeg-installer/darwin-x64@4.1.0`，对该文件执行严格视频和音频解码，退出码 `0`；H.264 `320×184`、`19,039` 帧，双声道 HE-AAC，`634.633333` 秒。2026-10-31 又用 macOS QuickTime Player 直接打开同一原始 TS：看到正常影片画面，以 1.0 倍速推进，并实际拖动进度条从约 `03:37` 到 `08:08`，恢复后时间从 `487.742` 推进到 `508.135` 秒。播放器确认原文件路径、时长 `634.6` 秒、H.264 / HE-AAC、音量 1.0 且未静音；物理扬声器实际听音未测。曾尝试仅从 Oray 虚拟音频设备取证，但 macOS 仍要求麦克风权限；未获该额外授权，未扩大权限，也未选择内置麦克风，故不声称系统声音输出通过。原始截图 `quicktime-after-drag.png` 与状态回读保存在同一证据目录。没有将 TS 声称为 MP4。
- 真实安全操作：下载中的 Stop 最终为「已取消」；下载中刷新网页使旧候选和任务失效；工具停用/恢复未自动重放；下载中确认卸载清除安装身份后未新增文件。随后经原官方审阅链重新安装 `0.2.0`，保持可打开状态。
- 两次较早的 Stop 尝试分别先遇到大小上限、先完成下载，**不计为停止通过**。有效 Stop 证据是后续明确的「下载分段 → 停止中 → 已取消」。本轮共保存两份同长度完整 TS，停止、导航和卸载的后续检查未再新增文件。
- 迟到原生 ID、分段中撤权及 unknown 防重放继续复用当前未变源码的定向 Node 证据；没有额外制造 Chrome 回包延迟或撤销共享 Chrome 网站权限。

原始证据沿用 [`ui-core/progress.json`](../../artifacts/video-downloader/ui-core/progress.json)、[`decode-result.json`](../../artifacts/video-downloader/ui-core/decode-result.json) 和原交接；截图与解码日志仍放忽略的 `artifacts/video-downloader/ui-core/`，不打进安装包。公共测试影片署名：Big Buck Bunny © 2008 Blender Foundation，CC BY 3.0；完整输出保留原片尾。

## 持续开发与安装身份（以下先保留 0.2.0 历史现场）

复用固定 `/Users/mac/Documents/workspace/opendesk-browser/dist/development`。原 dev writer owner 明确移交后，已正常退出原进程并通过原 `npm run dev` 恢复，新 Node PID `65804`；没有第二 writer 或静态副本。侧栏「调试 → 本地开发服务」实测已连接，构建指纹 `967ea3877a19`，对应完整 revision `967ea3877a191cbb1726471799304dc014d589fab10667ddf795a85894d30a30`。实际操作的扩展 ID 为 `ljclbnojkhhgdpoaaggiihlmidgcoihi`。Chrome 管理页中的实际加载路径仍未独立核实；服务输出路径与已连接指纹分别记录，不用它们代替管理页证据。

`scripts/wxt-development.mjs` 已覆盖 Catalog 所属 `projects/` 的保存发布与恢复；相关 9 项定向检查已通过。新服务已载入该修复，磁盘官方视频包与项目正式包同为 `0.2.0` / `12143` 字节 / SHA-256 `622668f5dcea70d579ed3cd51b81bbe5b675ef934dfb1a2f82f117f56d5058cd`。重启服务后曾出现旧侧栏目录与新包不一致的 `E_PACKAGE_INTEGRITY`；正常关闭重开该测试窗口侧栏后，原校验通过，未放宽来源或摘要校验。

普通本地 JSON/项目不能凭同 ID 取得特权。当前真实安装走原官方目录、包摘要、可信 Host 和安装代际，未将 `page.mediaDownload` 扩给普通本地预览。

| 项目 | 当前证据范围 |
| --- | --- |
| SOURCE / NODE | 原定向来源、完整性、身份及竞态检查通过，未变输入复用 |
| BUILD | 当前持续开发服务已完整编译并真实连接；production 未测 |
| PACKAGE / INSTALL | 原打包晋升门禁通过；真实官方安装、卸载与重装通过 |
| HLS_SEGMENTS / HLS_PLAYABLE_FILE | 真实最低档完整文件及全长独立音视频解码通过 |
| MAC_CHROME | 上述真实日常开发环境 UI 核心操作通过，不代表 production/CWS 验收 |
| FILE_PLAYBACK | 原始 TS 的 QuickTime 画面、正常进度、拖动及恢复播放通过；物理扬声器听音未测 |
| SECURITY | 原生 Stop、导航失效、停用/恢复、卸载撤权通过；强制迟到原生回包及共享网站权限撤销未测 |
| DASH_TRACKS / DASH_MERGE / YOUTUBE_DIAGNOSTICS | 延期，未测 |

## 当前限制与后续完善

发现只读取当前文档末尾最多 256 条资源记录。0.3.1 允许 blob 视频复用该窗口中超过 30 秒的清单；记录已被网页缓冲区淘汰时仍可能无法发现，需要重新加载播放器后检测；并非任意网站抓包下载器。Chrome 内置直接 HLS 媒体文档实测无法确认活动主文档，普通播放器网页可以；未为此绕过文档身份要求。

`0.2.1` 修复了终态顶部旧提示，并在重新检测、换页时清空旧任务详情与进度；空检测改为提示长时间播放后需重载播放器再立即检测。现有 UI 状态测试先复现完成/取消的旧提示，再验证修复，unknown 仍阻止重试。更高码率可能触发原单段/总量上限，拒绝时不生成不完整文件。不将这些边界或未测项写成全站、全部格式及正式发布通过。

## 0.2.1 历史补丁与格式说明

当时唯一正式包版本 `0.2.1`，`12,544` 字节，SHA-256 `9107d305f21f01607e2d164a183879039b35eb7339633ebf497134b5ef70a6ab`；候选 → 31 项 core/UI/bundle 定向检查 → 原打包器晋升 → 同源核对已通过。可信策略仅同步版本，精确 blob pin 已重新审查，其余五个可信文件、媒体权限、传输及安装身份合同不变。本轮真实 Chrome 已通过「扩展 → 管理视频下载 → 审阅新版 → 确认更新」从 0.2.0 更新到 0.2.1（权限未变化，原数据保留）。随后在真实侧栏检测并点击自制 MP4 下载，原生保存 `/Users/mac/Downloads/opendesk-video-1793384240379.mp4`（1,491 字节，SHA-256 `e65f28fac94a8c419de41a6c55318d42da89886163be85045fa22573aca0cb5e`），与源 fixture 逐字节一致。顶部与任务卡都显示完成；重新检测清空旧进度/详情，换页清空旧候选和任务，无视频页面显示修正后的指引。证据 `patch-mp4-ui-complete.png`、`patch-rescan-reset.png`、`patch-navigation-reset.png`、`patch-empty-guidance.png` 及对应 AX 回读均在原目录。此 1 秒自制样本只用于补丁 UI 状态验证，不替代原真实 HLS 影片证据。

本轮通过原 stale-lock 存活检查恢复 `npm run dev`，Node PID `1240`，原固定输出路径。侧栏实读开发客户端已连接，revision `1d30b46339ef560ae0be0943007738c2000d698255c8912c277ab7f2b6bd9450`；130 个指纹文件无漂移，磁盘官方包与项目正式包逐字节一致。Chrome 管理页加载路径仍未独立核实。后续真实 HLS 补测页导航超时，没有产生新下载；HLS Stop/导航/卸载与迟到回执继续保留原 0.2.0 原生/未变传输源码 Node 的各自证据等级，不自动提升为新包全量复验。

TS 本身是音视频封装，当前下载文件已经包含 H.264 视频与 HE-AAC 音频，可由本机 QuickTime 直接播放。MP4 也是封装格式；若将来需要 MP4 输出，优先保留原码流转封装，只有编码不兼容才评估转码。本轮没有加入自动转封装/转码功能，也不以更改后缀冒充 MP4。

## 0.2.1 → 默认 MP4 的历史交接（2026-10-31）

用户已新增明确要求：下载过程中默认输出可直接播放的 MP4。此需求尚未实现；下一条操作是由新唯一 owner 在本项目固定可信边界内，对现有 H.264 + AAC HLS 评估并实现保留原码流的自动转封装，再经真实侧栏完成下载、核对 MP4 容器并用独立播放器打开。不得将 TS 改后缀冒充 MP4，不默认重编码；音轨/编码或容器特性不兼容时明确失败/保留可解释边界。继续复用现有 Host、Installer、下载身份、权限与 unknown 防重放保护，保留现有单段/总量资源上限。

本次实现与实测保存于 `6b085e8f93b834f9467cfbd8264d02482b6f7b78`，正式包 `0.2.1`。原始 TS 已由 QuickTime 实播，画面/时间推进/实际拖动和恢复播放通过；物理听音及虚拟音频输出未核实。`/Users/mac/Downloads/opendesk-video-1793384240379.mp4` 只是本轮 1 秒自制 UI 样本，不能作为 HLS 转封装已完成的证据。

旧 owner `01a18dee-98aa-74c1-b169-59fe58860cd2` 在此交接后停止本产品源码、Chrome/桌面/剪贴板、watcher 与输出操作。剩余自有虚拟音频采集进程已收尾；未启动新测试。原 `npm run dev` writer PID `1240` 留在固定 `dist/development` 供新 owner 接管，不停止共享服务；正常重启协调权一并移交，不含 Cookie Relay/TLS/DB。最近真实客户端连接证据为 `1d30b46339ef`，不是交接时刻再次观测的实时连接。

本次 `get_goal` 实读 `null`；原核心补测目标 complete 仅为历史范围，不表示默认 MP4、声音或完整产品验收完成。现有工具无跨任务暂停/迁移/改写目标能力，未声称暂停或迁移。新任务创建后由其接续；DASH/YouTube/production/CWS/评分及强制 Chrome 迟到回包继续延期。最新接续事实与资源边界见原 `ui-core/progress.json` 的 `mp4Handoff` 及原 `ui-core-handoff.md` 末尾。

## 定向验证与包

本次 UI/Host/来源变更的检查入口：

```sh
node --test projects/video-downloader/tests/remux.test.mjs projects/video-downloader/tests/stream.test.mjs projects/video-downloader/tests/core.test.mjs projects/video-downloader/tests/ui.test.mjs projects/video-downloader/tests/bundle.test.mjs
```

`tests/stream.test.mjs` 与 `tests/discovery.test.mjs` 分别覆盖有界读取/完整性和固定文档发现；相关模块没有新变化时复用有效证据，不因脚本存在重复全组测试。`tests/fixtures/tiny.mp4` 是合法自制的直接 MP4 样本，可在回环服务中验证直接下载。HLS transport 拒绝回环来源，不能将本地 Fixture 替代公共真实流验收。

仍使用唯一打包器：

```sh
node scripts/build-sidebar-tool.mjs projects/video-downloader --out artifacts/sidebar-tools/video-downloader/candidate.opendesk-tool.json
# 定向门禁通过后，才允许显式晋升并核对同源。
node scripts/build-sidebar-tool.mjs projects/video-downloader --promote-from artifacts/sidebar-tools/video-downloader/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs projects/video-downloader --check-project
```

项目唯一正式 UI JSON 为 `video-downloader.opendesk-tool.json`。特权调用仍依赖固定 Browser Host、已审阅的实际安装身份、有效授权和安装代际。Catalog 摘要用于校验官方更新资源，正常使用已审阅安装包不要求版本与当前 Catalog 相同。包晋升、Git 提交和构建不代表 Chrome 已安装。
