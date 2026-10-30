# 视频下载 · Video Downloader R0.3.0（默认 MP4）

唯一业务目录：`projects/video-downloader/`。UI 源为 `src/index.html`、`src/style.css`、`src/main.js`，通过原 `OpenDeskTool.request` 调用固定可信 Host。`trusted/` 由已有 Side Panel Host 静态编译，八个来源文件按精确 Git blob 审查（包含固定转封装库子集）；普通导入包不能携带或替换这些特权代码。

## 当前用户操作

在有权保存视频的普通 HTTP(S) 网页中播放视频，打开 OpenDesk「扩展 → 视频下载」，点击「检测」。工具读取当前已授权文档中的 `<video>` / `<source>`，并在一次检测中读取最近 30 秒资源记录末尾最多 256 条明确媒体 URL；最多返回 48 个去重候选。临时 blob 播放器的 VOD 清单可能只在初始化时请求；若已超出最近 30 秒窗口，请重新加载播放器后立即检测。没有后台监听、全站抓包、播放器改写或持久化媒体 URL。

- 同源直接 MP4/WebM 经文档、工具身份、网站权限复查后交给 Chrome 下载。
- HLS master 展示真实清晰度、码率和分段数，默认选择最低已知码率的可用档。只有已获源站 Chrome 权限、完整、非加密且当前封装受支持的 VOD 可下载。跨源 HLS 的每个清单、初始化段和分段都分别校验来源与权限；不自动申请扩权。
- HLS 收齐分段后才提交一次 Chrome 保存。支持的 H.264/ADTS AAC TS 自动无重编码转封装为真正 `.mp4`；已有 fMP4 仍复用初始化段与媒体段。界面分别显示分段、封装 MP4、保存和 Chrome 下载状态。不支持的编码或缺少必要 AAC 配置时明确中断，不改后缀、不丢音轨、不回退 TS。
- `complete` 必须从 Chrome 记录确认文件存在且收到字节；所有回执仍为 `playbackVerified=false`，只有独立解码/播放才是可播放证据。
- 停止会中止分段并取消已知 Chrome 下载。导航、撤权和卸载使旧候选失效，迟到的 native ID 仍被接收并请求取消。已知终态才释放 Blob；原生回执或取消结果未知时保留 `unknown`，不重新下载。

清单最多 256 KiB，单段最多 8 MiB，总读取最多 128 MiB、2048 段、30 分钟；并发 3，每次读取超时 15 秒。请求不携带 Cookie、不发送引用页信息、拒绝重定向，失败不自动重试。拒绝私网/本地 URL、加密/DRM、直播、缺失分段、分离外部音轨及当前不支持的清单特性。DASH 合并与 YouTube 只读结构诊断延期；不提供未经授权的 YouTube 下载。

## 0.3.0 自动 MP4 实现与本轮验证

原入口仍是「扩展 → 视频下载 → 检测 → 下载」；真实消费者 `trusted/host.js` 沿原 `downloadHlsVod` → Blob → Chrome 保存。新增纯字节处理 `trusted/remux.js`，只静态进入原固定 Side Panel Host，不新增 Host、Worker、Native 服务、任意 URL SDK 或网站权限。按 TS 顺序保留 H.264/AAC 码流：空初始化 sample table 的 movie/track/media duration 为零，完整时长写入 `mvex/mehd`，防止 QuickTime 累加为双倍。音视频描述在同一 fragment 内，AAC 初始化、采样时钟与每段时间值一致；主清单的 `CODECS` 传入显式 HE-AAC/SBR 配置。未知低采样率 AAC 缺少主清单声明时拒绝，避免凭采样率猜测 SBR。只接受单 H.264 视频与至多一条 ADTS AAC，未知 PMT 编码、额外媒体轨道或不支持配置拒绝，不静默丢轨。

封装按包边界分批让出事件循环，Stop、导航、停用/卸载可使原 AbortSignal 和安装代际失效；封装前后及保存前复查原文档、安装身份和每个实际来源权限。128 MiB 的输入及输出上限保留，分段上限、并发、无 Cookie/无引用页、拒重定向和 unknown/迟到 ID 所有权不变。直接 MP4/WebM 和已有 fMP4 不进入 TS 转封装。

固定依赖仅归本项目：`trusted/vendor/mux-transmuxer.js` 是 `mux.js@7.1.1` 的 24 个纯转封装源文件子集，68,886 字节，Apache-2.0。来源、tarball SHA-512 SRI、每个输入 SHA-256 和产物 SHA-256 在 `mux.provenance.json`，许可证为 `mux.LICENSE.txt`，Browser 原静态资源表随包提供 `licenses/video-downloader-mux-Apache-2.0.txt`。原根 npm 依赖未添加 mux.js；浏览器无 npm 下载、远程脚本或 FFmpeg。原本机残留 node_modules 不能当来源证据，已从 npm 官方固定 tarball 验 SRI 后独立重建并 `--check` 逐字节复现。开发者复现：

```sh
npm pack mux.js@7.1.1 --ignore-scripts --pack-destination artifacts/video-downloader/tooling
node projects/video-downloader/scripts/build-remux-vendor.mjs artifacts/video-downloader/tooling/mux.js-7.1.1.tgz --check
```

当前正式 UI 包 `0.3.0`，13,150 字节，SHA-256 `4b57c39c5dbe5c3bb2693760959d090c83ff0f30a376a8372738457a6514852a`。原候选 → 受影响门禁 → `--promote-from` → `--check-project` 已通过。47 项定向检查覆盖真实 TS→MP4、HE-AAC 配置/有限时长、网络顺序、封装中 Stop/导航/安装撤权/来源权限撤销、unknown/迟到 ID 和八个精确来源 pin。不是 Chrome 安装或播放证据。

本轮真实结果：沿原官方审阅从 `0.2.1` 更新到 `0.3.0`，权限未变化。公共 hls.js 播放器选择 Big Buck Bunny，检测后在主清单候选看到默认最低 `320×184 / 246 kbps / 64 段`；点击下载，界面实际经过「下载分段 → 正在封装 MP4 → Chrome 下载完成」。新文件为：

- `/Users/mac/Downloads/opendesk-video-1793390579975.mp4`，**19,914,926 字节**；SHA-256 `30d38f0eed9f9dcc6a13c76691f56bb0615d467b1225d815970f40a607d74c6b`。
- 独立固定 FFmpeg 对新文件严格、完整解码退出 `0`：H.264 320×184、**19,039 视频帧**，HE-AAC 双声道 44,100 Hz、**13,656 音频块**，**634.633333 秒**。与原 TS 的全部解码帧/音频块逐项 SHA-256 一致，没有重新编码、缺帧或音频内容损失。原始 framehash 与比较 JSON 位于同一 `ui-core` 目录。
- **QuickTime 实际播放通过**：新文件路径、正确 `10:34.633` 时长、正常运动画面、1.0 倍速推进。以带前台/文件窗口守卫的真实鼠标拖动时间线，从 `148.6227` 秒拖至 `498.905944` 秒（约 02:28 → 08:19），恢复后实读 `499.148127 → 511.111588` 秒。没有通过设置播放器时间属性冒充拖动。音量 1、未静音；物理扬声器实际听音与 Windows 原生播放仍 `NOT_TESTED`，未申请/使用麦克风。
- 这轮实际播放曾发现首个 MP4 `/Users/mac/Downloads/opendesk-video-1793389788043.mp4` 在 QuickTime 时长翻倍。它与中间算法样本仅保留作缺陷证据；当前交付文件是上面的 `1793390579975.mp4`，修正后重新从真实侧栏下载，未用手工转旧文件替代。
- 新封装中的 Stop、导航、安装撤权、来源权限撤销与原 unknown/迟到 ID 保护已过本轮定向 Node 检查。原生封装瞬间 Stop 两次未命中有效时序（一次已先完成，一次未捕获阶段）；较高档尝试未进入有效候选，**均不计 PASS**。形成的完整副本保留。未改传输/Host 的原真实 Stop、导航、停用/恢复、卸载证据保留原等级，不宣称完成新版全量安全矩阵。

真实 Browser 是固定 `dist/development` 的已加载候选，revision `a0ebb4a637379cd7ebd7da017db73c1612f4f3e88e4e41f45747c97a70a7132f`。八个可信源码与该实际产物 sourcemap 输入逐字节一致，131 个指纹文件零漂移；Host 698,166 字节，低于既有 1 MiB 上限。Chrome 管理页实际加载路径仍未独立核实，不能以指纹代替该项。正式包与 Browser 固定代码分别核对，普通本地项目仍不能冒充官方安装身份。

**开发服务当前冻结**：新 Node writer `25735`（原路径、无第二 writer）在 `2026-10-31 04:13:45 CST` 以 `SIGSTOP` 暂停，保留锁和当前 `a0ebb4a63737` 产物。原因是先前业务源码保存确实触发 WXT 自动重载，而另一原 AI 请求跨 Host 回执仍未知；不能假定普通安全客户端挡住了这些重载。冻结后完成最终 pin/源码保存，不再触发发布；Chrome、Go/Native、Cookie Relay/TLS/DB 与原 AI 请求未被停止/清理/重放。恢复 writer、重新构建或重载须先由原请求所属工作流完成生命周期对账或合法安全退休，不能另启第二 writer 绕锁。这不是该 AI 已完成/已退休或所有重载边界已释放的声明。

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

发现只读取最近 30 秒、末尾最多 256 条资源记录。长时间运行的 blob VOD 播放器可能已没有最近清单请求，需要重新加载后检测；并非任意网站抓包下载器。Chrome 内置直接 HLS 媒体文档实测无法确认活动主文档，普通播放器网页可以；未为此绕过文档身份要求。

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

项目唯一正式 UI JSON 为 `video-downloader.opendesk-tool.json`。真实特权准入还要求当前 Browser 固定代码、原官方 Catalog 的包 SHA、安装来源与撤权代际一致；单独从本地导入 JSON 不能冒充官方身份。不要绕过来源审阅来执行开发包，也不要把包晋升、Git 提交或定向编译当成 Chrome 安装成功。
