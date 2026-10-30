# 视频下载 · Video Downloader R0.1

唯一正式业务目录：`projects/video-downloader/`。这是 OpenDesk Browser 中的独立 Sidebar Tool，不是第二个 Chrome 插件，也不是 Desktop 自动化框架。正式 UI 唯一源为 `src/index.html`、`src/style.css`、`src/main.js`；专用可信边界为 `trusted/`，由已有固定 Side Panel Host 静态引入。

## 本版真实操作与边界

1. 浏览器访问已授予 Chrome 网站权限的普通 HTTP(S) 网页，网页中的 HTML5 `<video>`/`<source>` 有明确的媒体 URL。
2. 在扩展中心审阅并安装官方 `video-downloader` 0.1.0（optional），打开「视频下载」，点击「检测」。
3. 固定可信函数在活动文档的 ISOLATED world 读取有界媒体 URL，按绝对 URL 去重。不接收沙箱上传的 URL、tabId、JS、选择器或 Cookie。
4. **只有与当前顶层网页同源、明确识别为 MP4 或 WebM 的直接 URL**出现「下载」操作。可信 Host 在正式安装/发行 SHA/启停/撤权代际与 Document 二次检查后调用一次 `chrome.downloads.download`。返回 downloadId 仅表示已提交给 Chrome。
5. 使用 `downloads.search({id})` 查询实际进度、`complete/interrupted` 状态；只有 `state=complete && exists=true && bytesReceived>0` 才展示「Chrome 下载完成」，并且 `playbackVerified=false`。独立解码、文件类型、播放验证必须在本机人工完成。停止通过 `chrome.downloads.cancel`，异步启动迟到回包不会被当成成功。
6. HLS `.m3u8` 同源资源可在**不携带 Cookie、拒绝重定向、有限时间和字节数**的情况下读取 master/media playlist，报告候选清晰度/码率、声明的音轨、分段数、是否 VOD、加密状态。即使非 DRM，本版仍为 `DETECTED_ONLY`，不下载片段，不伪装合并 MP4。DASH/跨源/无法读取/加密及 DRM 内容不下载。

无后台全站监听、无 webRequest 抓包、无密码/Cookie 存储、无脱离活动文档下载或网页播放器修改。签名 URL 只留在当前可信 Side Panel 的内存候选表，UI 只收到 opaque candidateId/媒体类型/有限元信息；不持久化 URL。任意下载 URL、Cookie/HTTP 请求头、跨站和 Native 命令不对沙箱开放。用户必须有权保存相应媒体；不绕过付费墙或 DRM；不将未经授权的 YouTube 下载作为发行功能。

## 真实可复现 Fixture

`tests/fixtures/index.html` 是仅用于本机回环服务器的合法自制媒体页。随项目提交的自制 `tiny.mp4` 和 `tiny-seg00.ts` 可直接作为本机 HTTP Fixture 播放；无需为运行下载 Demo 安装 FFmpeg。若需要重新生成样本，才运行 `generate-media.sh`（开发环境需 FFmpeg）：

```sh
sh projects/video-downloader/tests/fixtures/generate-media.sh
python3 -m http.server 43112 --bind 127.0.0.1 --directory projects/video-downloader/tests/fixtures
```

在 Chrome 打开 `http://127.0.0.1:43112/index.html`，由官方应用检测 `tiny.mp4` 并下载；到系统下载目录找到实际文件后，用视频播放器打开或运行：

```sh
ffprobe -v error -show_entries format=format_name,duration -of json /实际/下载目录/opendesk-video-*.mp4
```

`master.m3u8`、`media.m3u8`、`encrypted.m3u8`、`drm.m3u8` 是测试样本；HLS master 虽能由可信服务解析，但页面需要 `video.src` 明确使用它，或在同源自有 Fixture 页面中增加测试视频，才能通过 HTML5 源发现；本版并不主动扫描网页里的普通 HLS 超链接。R0.1 不能把解析成功记成视频合并成功。

## 开发与验收

定向 Node 测试：`node --test projects/video-downloader/tests/core.test.mjs`。

候选包（仅构建，不安装）：`node scripts/build-sidebar-tool.mjs projects/video-downloader --out artifacts/sidebar-tools/video-downloader/candidate.opendesk-tool.json`。官方发行由既有 `scripts/build-official-tools.mjs` 在 Browser 构建时从 `official-tools/catalog.json` 生成，沿用正式审核/安装/撤权。此官方特权扩展需要最新 Browser 构建，不能单独把普通本地开发候选 JSON 当成可信官方发行；开发和安装阶段身份不能互相代替。

本地 Mac Chrome 验收需核对：安装来源与权限、直接 MP4 downloadId 和进度、下载目录文件及 ffprobe/播放器、停止/页面导航/权限撤销/过期 403、无视频/去重、HLS 显示 `DETECTED_ONLY`。Node mock、GitHub commit、JS 代码存在或构建成功都不代表上述 Chrome 结果 PASS。真实网站兼容、跨源/CDN、分离音轨、HLS remux、文件真实播放验证的自动读回暂不提供。

### 状态合同（供 R0.2 使用，不重画 UI）

检测：`available | no-video`，候选 `ready | detected_only`，HLS `clear | encrypted | drm | unknown`。下载：`starting → started → in_progress → complete | complete_unverified | interrupted | cancelled | unknown`；并行 Stop 为 `cancel_requested`，不提供「已成功保存」的乐观状态。错误按 `E_MEDIA_* / E_DOCUMENT_STALE / E_OUTCOME_UNKNOWN`，不得自动重新触发下载。

R0.2 才考虑最简洁的正式交互原型、网站适配器与更多真实站点；在完整播放验收之前不声称「任何视频下载均可用」。
