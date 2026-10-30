# 视频倍速 R1.1 · Mac Chrome 开发环境实测

日期：2026-10-30（Asia/Shanghai）。范围：现有正式产品的真实播放验证；本轮不设计 UI，不新建播放器、扩展或权限层。

> 当前整体状态：BLOCKED（Mac 原生 UI 被其他活跃对话占用）。核心最终恢复操作、权限与生命周期尚未全部完成，不能宣布整轮 PASS。Node 模拟和构建结果不替代下列 Chrome 观察。

## 来源与安装身份

| 字段 | 实际观察 |
| --- | --- |
| Source Commit | 开始时 main / origin main：`0eb5392cc3af4644e7c0bf0f4e51b45417da6d9e`；操作中并行 main 前进到 `cde8e228207fe8189370320d5acfae64b8f57cc2`。两 SHA 之间本产品及两份视频定向测试没有差异。 |
| Chrome Version | Mac Google Chrome for Testing `155.0.8059.39` arm64；原生 `chrome://version` 读到，非 headless。macOS 26.5.1 (25F80)。 |
| Installation | 已启用 OpenDesk Browser Developer `0.1.0`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；实际启动参数加载本仓库 `dist/development`。沿用已有 Profile，未复制个人 Chrome 数据。 |
| 运行阶段 | 优先持续开发：复用并行 owner 的 `npm run dev` / `dist/development`；不启动第二个 writer。服务监听不能单独证明当前页面的客户端连接；当前客户端连接及已加载字节绑定仍未验证。 |
| 产品安装 | 通过现有官方 Catalog 搜索“视频倍速”→“审阅并安装”→确认安装；产品 `video-speed-controller` / `opendesk/video-speed-controller`，版本 `1.0.0`，能力 `page.videoSpeed`。未导入同名本地 JSON。 |
| 官方身份 | 原生安装审阅显示“OpenDesk 官方发行 · 安装包已校验”。技术详情 raw SHA256 与候选 SHA256 均为 `ef4bfd5ef2fc7b5f02190b9c1bea5ba043308154c7a358bf8223a41886f13f8e`；与开发输出中官方 Catalog 和 6,650 字节安装包一致。 |
| 安装后行为 | 提示“无需再次启用，可直接打开应用界面”；打开后检测到视频。正常倍速设置未重复弹授权。 |

产品源码 SHA256（上述 main 间未变）：

```text
src/main.js         3ca6e78a20dad7c5b0458bf40fe51ae99fb7ef7496337103c2eda0e59cb87aa5
trusted/host.js     0b5e14bb0802d08f259f9c2801979ec58f81d9bd534bbb0a3a6131000a7e63f3
trusted/admission.js b1b586f8fcd7539fd53818f0ca798f5a1eb9190532be7acb91be8e06e7a99dc1
trusted/policy.js   07181481966702749719630f4b1a744a49c7062bc7b6c80f09f962c0dd72d10a
```

开发输出包含其他 owner 的未提交共享 UI 等改动，不能称为纯 main 冻结候选或 production 验收。`dist/development/ui/sidebar-tool-host.js` 在一次只读核对时 SHA256 为 `840064d7a8959014e3293a1ba985d85152406d86f1ef01f1d232d0cb4cc88be3`；共享 writer 后续可能更新，不把目录名等同于已加载字节证明。

## 独立视频 Fixture 与复现

Fixture 仅使用标准 HTML5 `<video>`，读回与计时不调用 OpenDesk API。视频是 ffmpeg 生成的真实 90 秒 WebM 运动测试图案；时间与总视频帧统计由网页 DOM 读取。`readyState=4`、`paused=false`、`currentTime` 与总视频帧统计递增共同证明正在播放。不是修改页面文字模拟播放。环境：Node `v24.16.0`，ffmpeg `8.1.2`。

在仓库根目录执行（媒体为忽略的临时产物，不提交二进制）：

```sh
mkdir -p artifacts/video-speed-r11-20261030
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=640x360:rate=30 -t 90 -c:v libvpx-vp9 -b:v 250k -an -y artifacts/video-speed-r11-20261030/clock.webm
node projects/video-speed-controller/evidence/fixture.mjs
```

服务只监听 `127.0.0.1:43233`；可传媒体路径和端口。路径：`/single` 单视频、`/dual` 双视频、`/iframe` 跨源 localhost iframe、`/reset` 主动覆盖倍速的播放器。网页“独立网页读回”每 200 ms 直接读取每个视频的 `playbackRate/currentTime/paused/readyState/getVideoPlaybackQuality()`；“测量真实播放 2 秒”以 `performance.now()` 计算媒体进度/墙钟时间，不经过可信 Host。

手动点击“播放 primary”后再操作侧栏。计时样本仅适用于连续播放、固定速度、不暂停、不 seek 且不跨 90 秒循环尾部的窗口；不满足条件时样本无效，不据此判定加速失败或成功。

## 已观察到的真实操作

| Website | Media Location | Detected Videos | Requested Speed | Actual Speed | Stability | Restore Result | Permissions | Result | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `http://127.0.0.1:43233/single` | 主文档 | 1 | 初始 1× | 1，播放与解码帧递增 | 正常 | 尚待最终同链恢复 | Chrome 扩展菜单显示此网站已允许；原生菜单显示所有网站始终允许 | PASS | 实际视频播放后打开产品，UI 1× / 正在播放，与网页一致。 |
| 同上 | 主文档 | 1 | 1.5× | 1.5 | 2.002 秒内视频从 73.937 到 76.940 秒，实际比率 1.500，帧 2304→2394 | 尚待最终同链恢复 | 单击后无重复授权 | PASS | 原生侧栏按钮设置；网页独立 DOM 与计时读取，UI 显示 1.5×。 |
| 同上 | 主文档 | 1 | 2× | 2 | 人工间隔约 17 秒仍读到 2；缺完整起止计时原始附件 | NOT_TESTED（待补最终恢复） | 无重复授权 | PASS（仅设置后的实际值观察） | 网页实际 `playbackRate=2`，UI 2×；后续 readonly 消息观察器读到 Host status speed=2；对应 2× set 回执尚未留证。 |
| 同上，用户式刷新 | 新主文档 | 1 | 刷新，不设置 | 新视频为 1，暂停状态 | 旧 4× 未自动延续到新文档 | 不属于恢复按钮验收 | 无额外授权 | PASS（仅新文档状态） | 新文档 currentTime=0，UI 自动读回 1× / 已检测到视频。 |

原生 DevTools 在沙箱上下文添加只读消息观察器，收集产品原有 Host 响应；不调用设置 API，不改安装、授权或视频状态：

```js
window.addEventListener('message', e => {
  const d = e.data;
  if (d?.kind === 'response' && d.toolId === 'video-speed-controller')
    console.log('R11_HOST ' + JSON.stringify({ok:d.ok,result:d.result,error:d.error}));
});
```

已捕获：

```json
{"ok":true,"result":{"status":"available","speed":2,"playing":true,"count":1,"partial":false}}
{"ok":true,"result":{"status":"available","speed":4,"requested":4,"verified":true,"playing":true,"count":1,"partial":false}}
{"ok":false,"error":{"code":"E_DOCUMENT_UNRESOLVED","message":"当前网页尚未完成加载，请等待页面稳定"}}
{"ok":true,"result":{"status":"available","speed":1,"playing":false,"count":1,"partial":false}}
```

4× 是诊断期间自动化错误复用了旧 AX 索引所触发，不是播放器自行重置或产品自行提速；不计为要求的 2×→1× 验收。后续改为先读取当前 UI 再操作。另发现并行对话取得 Mac 原生 UI 占用，后续须取得同一 UI 租约再继续，避免键鼠争用；未触发的点击不计 PASS。

以上 Chrome 版本、安装审阅、播放值和 Host 摘录来自本轮主 agent 的原生 AX/截图操作记录。下方独立 reviewer 只读审查本文及源码，没有重复操作 Chrome；证据目录暂未保存原生图片或完整 AX 附件，因此独立复核只能检查记录的一致性，不能重新证明浏览器事实。

## 当前缺口与业务修改

- 核心完整 1×→2×→1× 与 set 回执：NOT_TESTED（已有部分实测，待补最终闭环）。
- 多视频、切标签、跨源 iframe、主动覆盖速度、停用/卸载、缺网站权限与关侧栏：NOT_TESTED。
- 真实公开网站：NOT_TESTED；尚不能据本地 Fixture 声称优酷或 B 站兼容。
- 未发现需要改正式业务源码的已复现故障。本轮目前仅新增本证据与独立 Fixture。
- 曾为备用入口构建隔离静态开发快照（基于起始 main，加两份并行 owner 已修复的文件覆盖）；它不是最终采用的原生运行环境，也不是纯 main 或 production PASS。未改其对应根源码，未覆盖根 watcher 输出。

### 下一条实际操作与资源

UI 租约最后实读（08:54 UTC 左右）：owner `01a18bf4-78f7-7353-addd-ffca6ced48c7`，对话“scrapyjs：排查真实 UI 不一致并完善核心体验”仍活跃。依 `chatgpt-test-profiles` 协议，不强抢、不关其浏览器、不发送未授权跨对话消息。租约释放后本对话申请 UI 锁，先重查当前窗口与实际加载身份，再继续：

1. 检查真实客户端开发服务连接与 Host 当前加载字节，不以监听 PID 代替。
2. 在原生 DevTools 中增加只读 focus/pointerdown/up/click 与 disabled/aria-busy 诊断，区分进入沙箱自动 read 导致首击禁用的业务时序和 UI 驱动争用。未复现前不修改源码。
3. 同一新鲜文档手动播放，完成 1×→2×→独立 DOM 与有效 2 秒计时→恢复按钮 1×→独立 DOM；保存两个 set 的 requested/speed/verified 回执。
4. 继续必要多视频、活动标签页/导航、权限拒绝/撤权与关闭侧栏验证，及 1～3 个可播放公开网页。不能验证者保留 BLOCKED/NOT_TESTED。

本对话 Fixture 进程执行会话 `99438`、端口 `43233`；并行根 watcher 原观察 PID `89002`，归其他 owner，不停止或重启。备用隔离 Chrome 原 PID `93274`，Profile 和快照只在忽略的 `artifacts/video-speed-r11-20261030/`，未作为测试 PASS 使用；清理前重查 PID/路径并在无桌面争用时正常关闭。所有正式业务文件未改；其他 owner 的未提交改动均保留。原生目标保持 active，未伪报完成；后续续跑须重查目标和租约，不重复已有有效操作。

## 独立证据评审与评分

只读 verifier `01a18c01-239a-7ee3-8ca6-7b1d6fd9bdb6` 审查上述进行中记录、Fixture 与必要产品源码，没有浏览器复验。结论 PARTIAL；提出媒体描述、计时适用条件、status/set 区分、连接未验证与资源续接问题，本文已据此澄清，未为改文字重新提高分数。

| 维度 | 分数 / 100 | 依据与限制 |
| --- | --- | --- |
| 功能正确性 | NOT_TESTED | 完整恢复链与两个 set 回执未完成。 |
| Chrome 真实性 | 78（仅现有记录） | 环境/身份/实际数值具体；缺原始附件、连接及加载字节闭环。 |
| 权限安全 | NOT_TESTED | 未重复授权的观察不能证明拒绝、撤权、停用与卸载。 |
| 兼容性 | NOT_TESTED | 仅本地单视频实测，不外推公开网站/iframe。 |
| 产品边界 | NOT_TESTED | 源码复用既有 Host；跨文档/生命周期未实测。 |
| 交接质量 | 80（仅评审时草稿） | 缺口明确，但原稿复现条件和资源信息不完整。 |

适用数字项平均 `(78+80)/2 = 79/100`。四项 NOT_TESTED 不计入分母；这不是整轮产品验收评分，不符合全面 95 分目标。

## UI_DESIGN_HANDOFF（暂存，尚未具备转入 UI 实施条件）

- 当前已证实：官方安装后直接打开、单个 HTML5 视频检测、预设 1.5×/2×、实际值展示与网页独立读回。
- 设计必须表达：检测中、没有视频、检测但暂停、正在播放、设置中、实际倍速、播放器覆盖、部分 iframe 无法访问、权限失败、失效文档、停用/卸载。未测状态不得标为已验收。
- 路径：网页播放视频→打开 OpenDesk→扩展→视频倍速→选预设→显示 Host 读回的实际速度→恢复 1×。
- 继续复用当前安装、可信 Host、Chrome 权限与生命周期；不加入第二播放器或后台强制保持速度。UI 阶段另行评审可点击 HTML 预览，本轮不实施。
