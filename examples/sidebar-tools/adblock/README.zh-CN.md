# OpenDesk AdBlock · R1 产品交互原型

**状态：`DESIGN_PREVIEW_ONLY`（2026-10-14）**。本目录与 `examples/sidebar-tools/reading-toc/` 同级，计划成为独立安装的「AdBlock · 广告拦截」应用。**目前只有独立 HTML 交互原型和本说明，没有正式 `tool.config.json`、可安装包、过滤规则/后台服务、Catalog 登记或真实 Chrome 拦截。** 浏览器里打开原型可以操作开关、查看交互状态，但不会改动任何网页请求、权限或真实标签页。

## 查看原型

双击打开 `adblock-r1-interactive-preview.html`（单文件离线 HTML，无 CDN）。右侧选择模拟网页、切换深色模式、重置；左侧尝试全局启停、本站启停、例外列表恢复、设置和 Chrome 受限页面提示。原型数据为预设演示值，不能当作真实拦截统计。状态仅尝试写入当前浏览器的 localStorage，禁止上传或读取真实网页信息。

## 产品定位与第一阶段边界

参考 [AdGuard Browser Extension](https://github.com/AdguardTeam/AdguardBrowserExtension)、[uBlock Origin Lite](https://github.com/uBlockOrigin/uBOL-home) 和 [Chrome declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)。第一版只交付常用核心，不复制复杂配置：

| 阶段 | 能力 | 需要达到的真实产品行为 |
| --- | --- | --- |
| **P0** | 全局启停 | 有效关闭所有**本工具**过滤规则；重新开启后安全恢复，状态与真实 DNR 完成回读一致 |
| **P0** | 当前网站启停 | 仅 HTTP(S) 当前域名例外；不会把关闭本站误解成全局停用；权限不支持时禁用而非假报成功 |
| **P0** | 例外网站管理 | 增加、查看、恢复域名；重启后保持，卸载时按既有清理协议清除本工具数据 |
| **P0** | 推荐拦截规则 | 内置、版本固定、审查过的 MV3 DNR 规则（广告及常见跟踪请求）；保守排除主框架请求，避免误拦截整个站点 |
| **P0** | 实际过滤证明 | 原生 Chrome 网络级阻断、全局开关、例外优先级、浏览器重启、卸载回归；真实请求测试、规则所有权证明、失败处理 |
| **P1** | 页面元素隐藏 | 网络拦截后残余广告占位的 CSS cosmetic filtering，按站点权限，先验证安全与性能 |
| **P1** | 临时暂停、选择元素屏蔽、用户规则 | 只有真实 P0 稳定后才进入详细设计 |
| **P2** | 远端订阅源、复杂规则编辑器、统计图表 | 暂不进入首页；若不能可靠统计网络拦截数，产品不能展示伪精确数字 |

## 架构实施原则

- 业务项目归属 `examples/sidebar-tools/adblock/`；未来正式 UI 为 `tool.config.json + src/index.html + src/style.css + src/main.js`，通过现有 Sidebar Tool packer/安装器发行，不创建另一套 Chrome 扩展或另一个工具安装系统。
- Sandbox UI **不得直接调用 `chrome.declarativeNetRequest`、`chrome.tabs` 或任意远程代码**。在 Browser SDK 已具备经过审计、按工具身份分配权限的能力时优先复用其正式声明映射。若尚缺可靠 DNR 工具隔离，由已有固定构建入口增加最小可信 Host/Worker 适配层；项目过滤规则、配置和产品模型不散落在宿主通用模块。
- DNR 规则持有者按工具命名空间清理，并与 `stay-focus` 的 `730000–730199` 完全隔离；全局停用、例外修改、SW 重启、撤权、卸载必须仅影响 AdBlock 自己的规则。DNR 写入须回读验证，拒绝/失败明确告知用户，不得在还未完成时显示“已开启”。
- 不请求 Cookie、历史记录或用户账号；默认不上传 URL、访问记录或个人数据。官方规则源的版本与许可需固定并核查；不允许动态第三方工具包提权修改浏览器网络规则。
- 需要静态打包过滤规则时遵守 Chrome MV3/DNR 的规则容量与权限合同；先确认 Manifest 与跨版本配额，不能用远程可执行脚本/全量 `webRequestBlocking` 绕过。

## 当前验证及下一步

- **已验证（原型）：** Headless Chromium 加载并无 JS 异常；点击全局开关、本站开关、添加/恢复例外、受限页面禁用；320/360/420/760/1220px 没有页面横向溢出；深色切换和独立设置页可操作。
- **未实施：** `tool.config.json`、正式 UI 源码、受信任 Browser SDK/DNR 接入、权限审计、过滤规则内容、真实安装/卸载、Chrome 网络拦截、原生 Mac 验收与 CI。它们全部标记为 `NOT_IMPLEMENTED` / `NOT_TESTED`；**不得把原型的模拟统计与按钮当作已交付的广告拦截功能**。
- **继续次序：** 先确认交互 → 建立可安装独立工具 → 接入统一 SDK/最小可信 DNR 代理及内置保守规则 → 真机验收全局启停/例外/重启/卸载 → 审计与产品评分。没有真实请求证据前不得评为产品 95+ PASS。