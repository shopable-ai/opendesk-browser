# Video SVIP FUTURE-R1 · 私有自制媒体双机 PoC-1

> 状态：隔离代码候选，**真实两网播放尚未验收**。本目录只验证自有或获明确跨设备许可的 MP4/WebM。不得使用 VIP/DRM 视频、官方受保护离线缓存或未授权再分发的影片。
>
> 不修改正式 Video SVIP 的 src/、trusted/、Host、Runtime、Preview 和 video-downloader。实验网页不是产品 UI，Chrome MV3 Service Worker 不作 24×7 媒体服务器。

## 用户要验证的事

设备 A（家庭电脑）只提供自己明确选择的一个合法媒体文件 → 两端各安装并授权 Tailscale → A 通过私有 Tailscale Serve 暴露仅该文件的受限 HTTP Range 服务 → 不同网络的 B 在真实 Chrome 输入 A 终端的临时配对码 → 点击播放 → 独立记录 HTTPS/Range/首帧/15 秒/连接路径 → 再测试中断和撤权。

这套 Demo **不能保证** NAT 直连，也不意味着 VIP 订阅可转发。B 要使用 Tailscale 系统客户端（浏览器本身不提供 Tailscale/WireGuard VPN）。Tailscale 登录、设备准入和 Serve 首次开启 HTTPS 证书可能需要用户交互；不承诺零配置或每次免授权。

## 先决条件

- 设备 A：macOS/Windows/Linux，Node.js 20+、Tailscale 客户端；能运行终端，电脑在线且不会睡眠。
- 设备 B：另一个真实互联网网络（例如另一运营商、手机热点），Tailscale 客户端和真实 Chrome。
- A/B 在同一受控 tailnet；管理员按官方 Grants/ACL **仅授权指定 B 的身份访问指定 A 的 Serve 端口**；开启 HTTPS 证书。核实 tailnet 内没有过宽的现有规则。
- 一份用户自制 30–60 秒、可在 Chrome 解码的 H.264/AAC MP4（建议 moov faststart），不大于 64 MiB。记录本人创作/许可证据、文件 SHA-256。代码没有法律上的版权鉴定能力。

有 FFmpeg 时可以自己生成一个 30 秒的合成画面，不涉及其他视频网站；生成后应在 Chrome 独立确认可解码：

    ffmpeg -f lavfi -i testsrc2=size=640x360:rate=30 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 30 -c:v libx264 -preset veryfast -crf 28 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$HOME/Movies/svip-owned-test.mp4"
    shasum -a 256 "$HOME/Movies/svip-owned-test.mp4"

## 第一步：本地 NODE 合同回归

在仓库根目录执行：

    node --check projects/video-svip/poc/personal-media/server.mjs
    node --check projects/video-svip/poc/personal-media/client.js
    node --test projects/video-svip/poc/personal-media/server.test.mjs

测试只证明 Node 级别的权限、Range、上传预算、会话撤销等，不证明 Chrome 解码、两网直连、中继或版权许可。不要使用 R0.4A 的 1 秒 tiny.mp4 申报 15 秒播放成功。

## 第二步：A 开启仅本机服务

    node projects/video-svip/poc/personal-media/server.mjs --file "$HOME/Movies/svip-owned-test.mp4"

它只监听 127.0.0.1:43188，不接受公开监听参数；不会打开任何路由器端口，也不会安装后台服务。启动时在**设备 A 本机终端**显示一串临时配对码。**不要把配对码、浏览器 Cookie、终端截图中的秘密提交到 GitHub 或公开日志**，仅通过安全私有通道发给自己设备 B。

默认限制：仅一个普通非符号链接的非空 MP4/WebM（≤64 MiB）；单路媒体传输；近似限速 2 MiB/s；本次进程累计上传预算 256 MiB；会话 15 分钟。文件大小/mtime/inode 变化会拒绝后续读取。每次重新启动临时配对码自动变化。无自动文件扫描或任意目录读取。

## 第三步：A 通过私有 tailnet 暴露 HTTPS

先检查已存在的配置与 Funnel 状态，以免覆盖其他应用：

    tailscale status
    tailscale serve status
    tailscale funnel status

确认该设备上的默认 Serve 入口没有冲突、tailnet 已启用 HTTPS 后，**另开 A 的终端**运行（保持前台，便于停止）：

    tailscale serve 43188

官方 Tailscale Serve 会公布仅 tailnet 成员可访问的 https 地址，并反向代理到 127.0.0.1:43188。A 的 Mac App Store 版本也支持这种**端口代理**；不要用 Tailscale Serve 的“共享文件夹”模式。只可使用 Serve，**不得使用 Funnel**；Funnel 会让服务进入公共互联网。若原有 443 Serve/路由占用，停止本实验并先人工排查，严禁 reset 其他服务。

参考官方文档：
- https://tailscale.com/docs/reference/tailscale-cli/serve
- https://tailscale.com/docs/features/tailscale-serve
- https://tailscale.com/docs/reference/connection-types

## 第四步：B 真实浏览器播放、收集证据

1. 让 B 使用不同的真实网络，登录获授权的 Tailscale，确认 B 可访问指定 A。用真实 Chrome 打开 A 的 Serve HTTPS 地址；不要用公网地址或 localhost 模拟跨网。
2. 输入 A 本机终端显示的临时配对码。浏览器使用同源 POST 创建短时 HttpOnly/Secure/SameSite=Strict Cookie；**配对码不放 URL、localStorage 或服务端审计日志**。
3. 点击“播放”。受保护的 /media 实现真实 GET/HEAD、200/206、Range 与 416；浏览器用 requestVideoFrameCallback 记录 FIRST_FRAME_OBSERVED，用连续播放至少 15 秒且媒体进度增长至少 12 秒记录 PLAYING_15S_OBSERVED。浏览器自身的观察仍须 Mac Chrome 人工或独立自动化截图/录像复核。
4. 点击“流量状态”和“复制脱敏播放证据”，保留服务端脱敏 JSON 事件与 Chrome 截图；仅记录受限字段，不提交完整文件、密码、IP 和 Cookie。
5. B 在视频播放期间记录 Tailscale 选路、时间和双方网络类型，例如：

       tailscale ping <A-device-name>
       tailscale status

   注意：首次 ping 可能先经 DERP 后建立直连；必须以**实际媒体传输期间**的当前选路证据为准。没有真正观察到 direct 时 DIRECT_VERIFIED=NOT_TESTED，只有直连不代表 RELAY_VERIFIED。测试 relay 需真实受限 UDP/NAT 环境，不应凭模拟文字或主动伪造日志。
6. 测试 B 换网、A 离线、暂停/停止、非法路径、过期会话、文件修改、上传预算耗尽、播放中撤权；记录原因及独立结果，未知不要自动重试。
7. 点击“撤销全部访问”后已签发 Session 失效、服务停止正在进行的流并生成新配对码。已送达 B 浏览器缓存的字节**不能远程删除**；如撤权请求失败，在 A 终端立即停止服务。结束实验时分别 Ctrl+C 停止 Node 和 Serve，并再检查 Serve/Funnel 状态。

## 功能边界与权利合同

- RightsCapability 仅在用户有权跨设备播放时成立，网络能通并不等于版权允许。此实验只接受用户指定的个人媒体文件，不实现 VIP 提取/会员共享/DRM 绕过/公共 CDN。
- 一个设备的 tailnet 访问许可 **不等于**文件读取许可；浏览器还需一次配对并持有短时会话。测试期间保留合法的设备 ACL/Grants。
- 不接受来自任意网页的跨站凭据请求、不返回目录清单、关闭 CORS、拒绝未知 URL 和查询密钥；仅绑定 loopback。安全水平仅适用于**受控实验**，不是经过渗透测试的生产家庭媒体云。
- B 浏览器需要 HTTPS Serve，不能将设备 A 的 localhost HTTP 地址给跨网用户。直接将 Node 端口开放到公网属于禁止场景。
- 浏览器首帧是观测性事件，不可从 NODE 测试或首个 HTTP 206 推断出 PLAYBACK_VERIFIED。若缺少第二台设备或 Tailscale 客户端，双机结果保持 NOT_TESTED。

## 证据分级（逐项独立）

| 级别 | 需要的实际证据 | 本次 GitHub 源码提交是否能证明 |
| --- | --- | --- |
| DESIGN | 本文及 FUTURE-DELIVERY-OPTIONS 选型/状态合同 | 是 |
| NODE | 可复现测试命令、Node 版本、真实退出码 | 需 CI/本地运行 |
| BUILD | 应用/实验的构建日志与退出码（本 PoC 无独立构建） | NOT_APPLICABLE；不能代替正式扩展 BUILD |
| LAN_REAL | 两真实设备、同 LAN 播放与记录 | 否 |
| TWO_NETWORK_REAL | 两种真实网络、实际媒体传输 | 否 |
| DIRECT_VERIFIED | 传输期间当前 peer direct 证据 | 否 |
| RELAY_VERIFIED | 经 DERP/Peer Relay 的实际媒体传输证据 | 否 |
| MAC_CHROME | 真实 Mac Chrome + 浏览器证据 | 否 |
| PLAYBACK_VERIFIED | 独立确认首帧及连续至少 15 秒 | 否 |
| LICENSE_VERIFIED | 自制媒体的创作/许可与 SHA-256 可核验记录 | 否 |

必要的审计数据：运行时间、提交 SHA、文件 SHA-256（不含真实文件名）、A/B 网络类别、已授权身份、请求范围与状态、播放事件、连接类型、A 上传/B 下载、近似中继字节及费用（未知标 UNKNOWN）、失败码和脱敏证据路径。**测试断言不能证明可盈利、自动打洞一定成功或 VIP 可复制。**

下一步为本地 Mac Codex 实际双机验收。PoC-2 WebRTC 和授权 P2P/CDN 均不应由本轮自动引入。
