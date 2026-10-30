# 视频下载 · Video Downloader R0.2.1（核心测试与播放证据）

唯一业务目录：`projects/video-downloader/`。UI 源为 `src/index.html`、`src/style.css`、`src/main.js`，通过原 `OpenDeskTool.request` 调用固定可信 Host。`trusted/` 由已有 Side Panel Host 静态编译，六个来源文件按精确 Git blob 审查；普通导入包不能携带或替换这些特权代码。

## 当前用户操作

在有权保存视频的普通 HTTP(S) 网页中播放视频，打开 OpenDesk「扩展 → 视频下载」，点击「检测」。工具读取当前已授权文档中的 `<video>` / `<source>`，并在一次检测中读取最近 30 秒资源记录末尾最多 256 条明确媒体 URL；最多返回 48 个去重候选。临时 blob 播放器的 VOD 清单可能只在初始化时请求；若已超出最近 30 秒窗口，请重新加载播放器后立即检测。没有后台监听、全站抓包、播放器改写或持久化媒体 URL。

- 同源直接 MP4/WebM 经文档、工具身份、网站权限复查后交给 Chrome 下载。
- HLS master 展示真实清晰度、码率和分段数，默认选择最低已知码率的可用档。只有已获源站 Chrome 权限、完整、非加密且当前封装受支持的 VOD 可下载。跨源 HLS 的每个清单、初始化段和分段都分别校验来源与权限；不自动申请扩权。
- HLS 依序合并所有分段后才提交一次 Chrome 保存。TS 保持 `.ts`，fMP4 保存 `.mp4`；尚无 TS → MP4 转封装。界面分别显示分段、合并、保存及 Chrome 下载状态。
- `complete` 必须从 Chrome 记录确认文件存在且收到字节；所有回执仍为 `playbackVerified=false`，只有独立解码/播放才是可播放证据。
- 停止会中止分段并取消已知 Chrome 下载。导航、撤权和卸载使旧候选失效，迟到的 native ID 仍被接收并请求取消。已知终态才释放 Blob；原生回执或取消结果未知时保留 `unknown`，不重新下载。

清单最多 256 KiB，单段最多 8 MiB，总读取最多 128 MiB、2048 段、30 分钟；并发 3，每次读取超时 15 秒。请求不携带 Cookie、不发送引用页信息、拒绝重定向，失败不自动重试。拒绝私网/本地 URL、加密/DRM、直播、缺失分段、分离外部音轨及当前不支持的清单特性。DASH 合并与 YouTube 只读结构诊断延期；不提供未经授权的 YouTube 下载。

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

## 当前补丁与格式说明

当前唯一正式包版本 `0.2.1`，`12,544` 字节，SHA-256 `9107d305f21f01607e2d164a183879039b35eb7339633ebf497134b5ef70a6ab`；候选 → 31 项 core/UI/bundle 定向检查 → 原打包器晋升 → 同源核对已通过。可信策略仅同步版本，精确 blob pin 已重新审查，其余五个可信文件、媒体权限、传输及安装身份合同不变。本轮真实 Chrome 已通过「扩展 → 管理视频下载 → 审阅新版 → 确认更新」从 0.2.0 更新到 0.2.1（权限未变化，原数据保留）。随后在真实侧栏检测并点击自制 MP4 下载，原生保存 `/Users/mac/Downloads/opendesk-video-1793384240379.mp4`（1,491 字节，SHA-256 `e65f28fac94a8c419de41a6c55318d42da89886163be85045fa22573aca0cb5e`），与源 fixture 逐字节一致。顶部与任务卡都显示完成；重新检测清空旧进度/详情，换页清空旧候选和任务，无视频页面显示修正后的指引。证据 `patch-mp4-ui-complete.png`、`patch-rescan-reset.png`、`patch-navigation-reset.png`、`patch-empty-guidance.png` 及对应 AX 回读均在原目录。此 1 秒自制样本只用于补丁 UI 状态验证，不替代原真实 HLS 影片证据。

本轮通过原 stale-lock 存活检查恢复 `npm run dev`，Node PID `1240`，原固定输出路径。侧栏实读开发客户端已连接，revision `1d30b46339ef560ae0be0943007738c2000d698255c8912c277ab7f2b6bd9450`；130 个指纹文件无漂移，磁盘官方包与项目正式包逐字节一致。Chrome 管理页加载路径仍未独立核实。后续真实 HLS 补测页导航超时，没有产生新下载；HLS Stop/导航/卸载与迟到回执继续保留原 0.2.0 原生/未变传输源码 Node 的各自证据等级，不自动提升为新包全量复验。

TS 本身是音视频封装，当前下载文件已经包含 H.264 视频与 HE-AAC 音频，可由本机 QuickTime 直接播放。MP4 也是封装格式；若将来需要 MP4 输出，优先保留原码流转封装，只有编码不兼容才评估转码。本轮没有加入自动转封装/转码功能，也不以更改后缀冒充 MP4。

## 定向验证与包

本次 UI/Host/来源变更的检查入口：

```sh
node --test projects/video-downloader/tests/core.test.mjs projects/video-downloader/tests/ui.test.mjs projects/video-downloader/tests/bundle.test.mjs
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
