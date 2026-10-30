# ScrapyJS R2.0-NODE · 私有 Android 手机双网络技术 PoC

> 2026-10-30｜POC_SOURCE_ONLY / ANDROID_DEVICE: NOT_TESTED / REAL_NETWORK: NOT_TESTED。
> 本目录仅是隔离的 Android 前台实验与 Mac 局域网 HTTPS 接收器，不是正式安装版、任务市场、开放代理、云 Broker 或已完成设备验证。

## 目标与边界

用户自己的 Android 手机在 Wi-Fi 局域网与 Mac 交换任务回执，手机将 1–3 个已批准公共 HTTPS 测试页面的 GET 请求绑定到蜂窝 Network，返回真实页面字节（Base64）、SHA-256 和出口 IP。每页不超过 24 KiB，整次不得超过 45–60 秒，无 Cookie、登录态、任意脚本、开放 TCP/HTTP/SOCKS 代理、后台运行、收费或共享网络出口。若所需网络消失，立即失败，不自动改走另一网络。Wi-Fi 只需要可达 Mac，**不要求 Wi-Fi 有公网 Internet**。

拓扑：Mac TLS 接收器 ←Wi-Fi→ Android 前台 Agent →CELLULAR→ 自有 HTTPS Fixture；Android 另通过 CELLULAR 请求 api.ipify.org 获取出口诊断。无需手机入站公网 IP、NAT 穿透或端口映射。

现有 ScrapyJS React、Browser Host / Managed Proxy、Controller Task 0.4.0 及权限没有修改。对话中的可点击 HTML 仅是交互设计，不是已安装的正式侧栏节点管理界面。

## A0 手机热点零代码对照

在 Mac 原 Wi-Fi 及手机热点两种连接方式分别执行：

~~~sh
curl --noproxy '*' -sS https://api.ipify.org?format=json
route -n get default
~~~

记录当前 Mac 接口、手机运营商/系统/VPN/省流策略、服务端实际出口，并在测试后还原原 Wi-Fi。热点对照只说明整个 Mac 通过手机热点走的网络，**不是双网络 Android Agent 证明**。Pixel 官方文档说明 Mac 不支持 Android USB 网络共享，不能预设它是备用方案。

## A1 Mac 局域网接收器

需要 Mac 与手机在同一可信 Wi-Fi，Mac Node.js 22+、OpenSSL 和一个本人拥有或有明确采集授权的**公共 HTTPS 站点**，预备最多 3 个小于 24 KiB 的无登录、无重定向静态测试页面。站点应有服务端访问日志，以便独立核对手机出口 IP。

在 Mac 私有工作目录中生成短期 TLS 证书，SAN 必须包含当前 Wi-Fi LAN IPv4；示例：

~~~sh
cd examples/sidebar-tools/scrapyjs/nodes/poc/mac
LAN_IP=192.168.1.10 # 必须替换为 Mac 实际 LAN IPv4
openssl req -x509 -newkey rsa:3072 -sha256 -nodes -days 1 \
  -keyout mac.key -out mac.crt \
  -subj '/CN=ScrapyJS private node' \
  -addext "subjectAltName=IP:$LAN_IP"
openssl x509 -in mac.crt -outform DER | shasum -a 256

export SCRAPYJS_POC_CERT="$PWD/mac.crt"
export SCRAPYJS_POC_KEY="$PWD/mac.key"
export SCRAPYJS_TEST_ORIGIN="https://qa.your-real-domain.tld"
node collector.mjs
~~~

Mac 系统 OpenSSL/LibreSSL 可能不支持 -addext；使用支持该选项的 OpenSSL 或配置 SAN 文件，**不可**为赶进度关闭 TLS 主机名/证书验证。Mac 防火墙只允许可信 LAN，禁止端口映射与公网暴露。

接收器默认为 4443，启动时一次性打印随机临时配对令牌（64 位 hex）。私有结果默认保存到 mac/.private-node-evidence/，权限 0600。**禁止将 mac.key、mac.crt、任何配对令牌、完整结果或隐私数据提交 Git**。停止接收器后配对令牌立即失效。

## A1 Android 编译与前台测试

Android Studio 打开 nodes/poc/android/，需要 JDK 17、Android SDK 35、AGP 8.6.1、兼容的 Gradle 8.7+。该隔离 PoC 没有提交二进制 Gradle wrapper JAR；若本机已安装兼容 Gradle：

~~~sh
cd examples/sidebar-tools/scrapyjs/nodes/poc/android
gradle :app:assembleDebug -PscrapyJsTestOrigin=https://qa.your-real-domain.tld
adb install -r app/build/outputs/apk/debug/app-debug.apk
~~~

必须把 qa.your-real-domain.tld 换为本人可授权的真实公共 HTTPS 站点。构建时 -PscrapyJsTestOrigin 是固定单一 allowlist；未配置时默认为 .invalid，程序拒绝运行。不能让远程任务/用户修改 Origin。路径栏仅接收该 Origin 下 1–3 条以 / 开头的路径（例如 /fixture-1.html）。

Android App 输入 Mac HTTPS LAN IP、OpenSSL 证书 DER SHA256 的 64 位十六进制指纹、Mac 临时配对令牌、测试路径，**手动勾选**本次蜂窝流量使用，然后点击运行。Wi-Fi 用 Network.openConnection(HTTPS, Proxy.NO_PROXY) 与 Mac 配对、上传；手机以 ConnectivityManager.requestNetwork 获取 CELLULAR Network，目标 GET 同样在该 Network 单独打开。没有 bindProcessToNetwork、自动 IP 轮换、隐式代理回退或浏览器全局路由更改。

点击 Stop、离开 Activity、断链时断开连接并注销 NetworkCallback；提交后的未知结果不会自动重试。移动网络可能产生运营商实际流量费用，当前 PoC 没有运营商准确计费能力。Android 设备/ROM/移动运营商可能不支持所需并存模式，失败应记录 E_CELLULAR_UNAVAILABLE 等实际错误，不能假报成功。

## 独立读回与验收

手机显示真实 runId 后，Mac 使用本次临时令牌（不可使用 curl -k 关闭证书验证）：

~~~sh
RUN_ID='本次实际UUID'
PAIR='接收器本次临时配对令牌'
curl --cacert mac.crt -H "Authorization: Bearer $PAIR" \
  "https://$LAN_IP:4443/v1/evidence/$RUN_ID" > receipt.json
~~~

核对真实 report：相同 runId、Mac 观测的手机 Wi-Fi LAN 源 IP、CELLULAR 的公网出口回显、两个不同 Network handle、每页 URL 与正文哈希、Mac 保存时间，以及本人测试网站的**服务端**来源 IP/页面内容。不能只根据手机自报的 IP、Mac HTTP 200 或 Mock 页面证明实际采集成功。

Mac 接收器拒绝非 LAN 请求、错误令牌、与 Wi-Fi peer 不符的 LAN IP、非白名单 Origin、跨域/重复页、哈希被篡改、超额内容、重复 runId 的不一致结果。落盘已成功并重复提交完全相同结果可识别为 existing（幂等），但手机端不会自动重发未知结果。

Node 合同测试（须在真实本机运行后才能填写 PASS）：

~~~sh
node --test examples/sidebar-tools/scrapyjs/nodes/poc/mac/contract.test.mjs
~~~

## 当前证据等级与后续

| 等级 | 状态 | 达成条件 |
| --- | --- | --- |
| NODE | NOT_TESTED | Node 单测、HTTPS 配对拒绝、结果文件与重启读回 |
| ANDROID_DEVICE | NOT_TESTED | 编译、安装、实际 Wi-Fi / CELLULAR 网络判定和 Stop |
| MAC_CHROME | NOT_TESTED | 正式侧栏尚未接入节点功能 |
| REAL_NETWORK | NOT_TESTED | 真机蜂窝出口与受控站点服务端日志核对 |
| REAL_RUNHOST | NOT_TESTED | 本 PoC 未调用原 RunHost |
| CLOUD | NOT_TESTED | 未开发 Broker 和远程租约 |
| BILLING | NOT_TESTED | 没有结算或积分服务 |

先完成私有 A0/A1 真机验收，再考虑同一合法 Job 合同供 Mac/Android 自愿领取（B）；陌生用户网络共享与代理收费（C）需要独立合规审阅，默认永远关闭，不能由安装自动授权。
