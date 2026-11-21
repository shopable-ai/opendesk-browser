# AI Proxy 0.3.36 核心验收判定

本页记录早一轮公开对照和测试订阅的实测。真实订阅及当前完整裁定见[全功能验收结论](FULL-ACCEPTANCE-036.zh-CN.md)。

**可以结束这轮核心验收。** 隔离浏览器里的公网代理切换与释放、测试订阅的下载与重开、原生界面从保存到应用均有实测证据。

**真实订阅线路可用性仍待验。** 这轮使用三条分类夹具，未拿真实订阅节点连接。日常 Profile 上次看到的是 0.3.30，逐步操作与结论均绑定隔离安装的 0.3.36。

## 业务线

### 公网代理与暂停 · PASS

**怎么测。** 在同一个隔离 Profile 打开 ip111.cn 的「从国内测试」。未接管时取基线，应用 Clash 本地入口 `127.0.0.1:7897` 后新开查询，暂停后再新开查询。暂停通过要同时满足两条，Chrome 报告 `system` 且 AI Proxy 已释放控制，公网读数回到这一轮的系统基线。

**关键证据。** 下图是 2026-11-19 系统代理关闭时的三次实际结果，IP 后两段已遮蔽。

| ① 未接管 | ② 确认应用代理 | ③ 暂停并释放 |
| --- | --- | --- |
| **成都 · 117.172.x.x** | **东京 · 43.167.x.x** | **成都 · 117.172.x.x** |
| ![未接管时国内测试显示成都](../../../artifacts/ai-proxy-ego-20261119/ip111-os-off-baseline.png) | ![应用后国内测试显示东京](../../../artifacts/ai-proxy-ego-20261119/ip111-os-off-proxy.png) | ![暂停后国内测试显示成都](../../../artifacts/ai-proxy-ego-20261119/ip111-os-off-paused.png) |

同一 Profile 在**系统代理开启**时，系统基线和暂停结果均为东京；明确应用「直接连接」时为成都。因此在系统代理开启的环境下，看到暂停后仍为东京也可通过。测试城市和 IP 随线路变化，判断时比较同轮的基线。回环和局域网探针只用于核对网关是否介入其自身的请求。[两种系统条件](../../../artifacts/ai-proxy-ego-20261119/public-egress.md) · [七次查询读数](../../../artifacts/ai-proxy-ego-20261119/public-egress.jsonl)

### 测试订阅读取与重开 · PASS

| 操作 | 应看到 | 实际看到 |
| --- | --- | --- |
| 「订阅管理 → 测试来源 → 读取订阅」，输入测试 HTTPS 链接，点「下载并读取」。 | 返回内容能识别，三类各 1 条。 | 通过原生下载入口得到 3 条。HTTP 原生无认证、SOCKS5 需本地客户端、SSH 不支持各 1 条，0 无效、0 去重。[成功回执和分类](../../../artifacts/ai-proxy-ego-20261119/subscription-classes.png) · [测试输入](../../../artifacts/ai-proxy-ego-20261119/subscription-fixture.txt) |
| 关闭管理页后重开，再进入该来源的读取面板。 | 保留 1 条来源信息，完整 URL 输入为空。 | 重开后仍有 1 条来源，状态为「未同步」。现场复核时输入框仅显示占位符，实际值为空，旧解析结果也未恢复。[来源清单](../../../artifacts/ai-proxy-ego-20261119/subscription-reopened.png) · [空 URL 输入框](../../../artifacts/ai-proxy-ego-20261119/current-subscription-empty-url.png) |

「未同步」表示来源列表保留的是元数据，在线解析结果只在读取当次可见。下载与分类可以签收。真实节点连通性为 **NOT_TESTED**，签收它需要授权节点、显式应用，以及一条独立的新请求命中该节点。

## 功能界面 · PASS

从「扩展 → AI Proxy → 打开 → 设置 → 管理全部」进入。按下表读回，不靠状态颜色判断线路。

| 你点什么 | 界面上找什么 | 实测如何确认 |
| --- | --- | --- |
| **保存或选择代理** | 「代理配置已保存，未自动应用」或「待应用选择」。 | 原生侧栏保存后，管理页读回新配置，独立 Chrome 状态保持原值。[保存回执](../../../artifacts/ai-proxy-ego-20261119/proxy-paused.png) · [保存记录](../../../artifacts/ai-proxy/acceptance-current/sidebar-036-r5/result.json) |
| **应用配置 → 取消** | 审阅写出线路端点与「所有网站和标签页」。取消后原模式继续生效。 | 原生 SOCKS5 试验取消后，测试驱动比较 Chrome 设置，仍等于应用前的 `system` 基线；夹具请求直接到源站。[审阅截图（Clash）](../../../artifacts/ai-proxy-ego-20261119/public-route-review.png) · [取消与确认记录（SOCKS5）](../../../artifacts/ai-proxy/acceptance-current/surfaces-036-r3/result.json) |
| **再次应用 → 允许此线路** | 「浏览器已应用当前选择」。 | 同一 SOCKS5 试验确认后 Chrome 回报 `pac_script` 且由该扩展控制，网关与源站均记录到新请求。[应用后界面（Clash）](../../../artifacts/ai-proxy-ego-20261119/public-proxy-mode.png) · [确认后的 Chrome 与请求记录（SOCKS5）](../../../artifacts/ai-proxy/acceptance-current/surfaces-036-r3/result.json) |
| **暂停 → 查看真实控制状态 → 基础诊断** | 顶部「尚未管理浏览器代理」。基础诊断「尚未接管 · Chrome 模式：system」。 | 现场读取 Chrome API 回报 `system / controllable_by_this_extension`，与界面一致。已选线路仍可作为待应用项保留。[暂停读回](../../../artifacts/ai-proxy-ego-20261119/current-system-readback.png) |
| **选「直接连接」→ 切换为直连** | 「浏览器已应用当前选择 · 直连」。 | 历史 ego 记录中，明确应用后出口为成都。同轮跟随系统的基线是东京。[直连界面](../../../artifacts/ai-proxy-ego-20261119/public-direct-mode.png) · [直连公网读数](../../../artifacts/ai-proxy-ego-20261119/ip111-direct.png) |

## 何时继续

- **立即复测对应步骤**，如果取消后 Chrome 设置变化、确认后请求走错路径、暂停后仍由 AI Proxy 控制或公网未回同轮基线，或者重开时带回了完整 URL。
- **相关条件改变时复测一次**。路由或系统策略变更，重跑同站出口对照。审阅、停用或订阅逻辑变更，重跑对应的界面或订阅操作。P04 以暂停释放后恢复系统基线为准。[P04 验收判据](UI-FUNCTIONAL-TESTS.zh-CN.md#导航代理和规则)
- **当前可以停。** 0.3.36 的核心项已满足。需要交付真实订阅节点连通性时再取得授权样本并验证。生产部署、认证代理、任意 PAC、AI 登录和模型能力各需对应证据。

**证据归属。** 公网和在线下载来自 2026-11-19 的隔离 ego (lite) 实测。后续在同一 TaskSpace 172 复核已安装包内容、Chrome 模式和订阅 URL，保留截图后释放了空间。取消与确认来自隔离 Chrome for Testing 155.0.8059.39 的同包原生侧栏，使用受控 SOCKS5 网关。正式 JSON 复核 SHA-256 为 `724a08e800508a36af376ec2e45815b1e593769bd2198a383c4b5994835e113b`。本次修订复查上述证据，未启动浏览器或重测流量。
