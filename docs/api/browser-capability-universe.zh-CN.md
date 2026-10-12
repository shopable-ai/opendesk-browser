# Browser Capability Universe · OpenDesk Browser R1.3

> 当前状态：2026-10-12，main，API 1.0.0。[32 操作的当前实施/测试矩阵](../framework/workstreams/browser-sdk-r13-20261011.md) 与 [机器记录](../framework/workstreams/browser-sdk-r13-acceptance.json) 为最新验收入口。以下 18 域/74 叶子仍是能力规划，不能与公开操作数相加或推导完成百分比。

本轮接通规范 Browser clipboard/downloads 请求并使前台可调用状态一致；菜单注销、过期、包摘要和 BFCache 生命周期已修复并有组件回归，原生结果按独立记录。`tabs.open/focus/sidePanel.openSelf` 缺受控引用、网站批准/真实手势合同，继续 PLANNED；通知 NOT_EXPOSED，网络请求/截图 HOST_ONLY。R2 被动观察仍 PLANNED，未提前实现。


**核查范围**：18 个浏览器功能域、74 个叶子能力；以本次目标仓库的 Chrome 138+ Manifest、当前源码及 R1.3 变更为依据。此矩阵是**审计和扩展规划**，不构成额外的权限批准名单，不能据此直接向工具沙箱开放 `chrome.*`。

## 状态与证据规则

- **IMPLEMENTED**：已有真实代码或新增代码接线，但本次新增的 Chrome 正向能力尚未完成原生验收。不是 PASS。
- **HOST_ONLY**：已有可信 Host/Controller/Page 服务，但当前普通第三方 Side Panel 工具没有对应 `OpenDeskSDK.browser.*` 接入权。
- **NOT_EXPOSED**：API 或已知能力未作为普通工具服务开放（可能属于内部受限能力）。
- **PLANNED**：只冻结命名/责任/合同，**不能实际调用**。
- **UNSUPPORTED**：当前模型明确不支持这种越权模式。

**证据编码**：表中标记“既有”的叶子来自可定位源码，尚未作为本轮真实浏览器重新验收；标记“R1.3”的叶子仅为当前开发实现，需要 `tests/environment/browser-sdk-r13.test.mjs` 的定向结果以及独立 Mac Chrome 验收；“R2/R3”尚无可运行代码。最终每项原生 PASS 需在工作流记录中绑定 HEAD、dist 哈希、Chrome 版本和原始操作记录。即使 Controller 有截图/HTTP/Cookie，也不能将其计入普通工具公开接口。

## 18 个领域功能树与状态矩阵

### 右键菜单、快捷键、地址栏与扩展入口

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 右键菜单安装/同步 | chrome.contextMenus.create/update/remove | src/platform/chrome/context-menus.js | browser.contextMenu.register | 工具沙箱/可信 SW | contextMenus + browser.contextMenu | HTTP(S) 精确 Origin | 138 | 高 | IMPLEMENTED | R1.3 |
| 右键菜单用户点击与选区 | chrome.contextMenus.onClicked + webNavigation.getFrame | src/platform/chrome/context-menus.js | browser.launch.consume | 工具沙箱/可信 SW | contextMenus + browser.contextMenu | 绑定工具/来源文档 | 138 | 高 | IMPLEMENTED | R1.3 |
| 扩展 action 开入口 | chrome.action.onClicked | src/sw.js | — | 可信 SW | action（内置） | 来源标签页 | 138 | 中 | HOST_ONLY | 既有 |
| 快捷键 commands | chrome.commands | manifest.json（未见当前命令贡献） | — | 可信 SW | 待申请 | 无 | 138 | 中 | PLANNED | R3 |
| Omnibox 地址栏 | chrome.omnibox | 未接线 | — | 可信 SW | omnibox | 无 | 138 | 中 | PLANNED | R3 |

### 标签、窗口、分组与会话

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 标签创建/聚焦 | chrome.tabs.create/update | src/platform/chrome/tabs.js（已有固定脚本注入，不等于公开页签管理） | browser.tabs.open/focus | 未来工具沙箱 | tabs + browser.tabs | 受控 tabRef | 138 | 中 | PLANNED | R2+ |
| 窗口查询/管理 | chrome.windows | src/ui/tool-shell.js（现有 windows.getCurrent） | — | 可信 Host | windows | 窗口范围 | 138 | 中 | NOT_EXPOSED | R3 |
| 标签分组 | chrome.tabGroups / tabs.group | manifest.json（可选 tabGroups） | — | 可信 Host | tabGroups | 用户可见 | 138 | 中 | PLANNED | R3 |
| 会话恢复 | chrome.sessions | 未接线 | — | 可信 Host | sessions | 用户显式授权 | 138 | 高 | PLANNED | R3 |

### 网页 DOM、选区、链接、框架和 USER_SCRIPT

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 当前网页标题和 URL | currentPage.info / chrome.tabs | src/ui/sidebar-tools.js | browser.page.getContext | 已安装工具 | currentPage.read | 当前页 | 138 | 低 | IMPLEMENTED | R1.3 |
| 当次菜单选区/链接 | contextMenus.onClicked | src/platform/chrome/context-menus.js | browser.page.getSelection | 已安装工具 | browser.contextMenu | 点击文档/限期 | 138 | 高 | IMPLEMENTED | R1.3 |
| DOM/Locator | scripting.userScripts / ChromePage | src/framework/ChromePage.js | 原 Controller page / Locator | Controller | 原 Authority | 绑定 document | 138 | 高 | HOST_ONLY | 既有 |
| 网页 JS 注入/UI | chrome.userScripts / scripting.executeScript | src/scripting/user-scripts/ | 原 Page USER_SCRIPT | Page Program | 批准网站及用户脚本 | 指定页面 | 138 | 高 | HOST_ONLY | 既有 |
| 跨 frame 读取 | chrome.webNavigation.getAllFrames | src/platform/host/sdk-methods.js | — | 受权 Controller/SDK | 精确 frame/document | 文档范围 | 138 | 高 | NOT_EXPOSED | R3 |

### HTTP/HTTPS、Fetch 和传输

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 现有主动请求 | fetch / axiosx | src/platform/chrome/network.js; src/framework/sdk/http.js | 原 axiosx | Page/Controller | 原网络能力 | 原目标 Origin | 138 | 高 | HOST_ONLY | 既有 |
| 普通工具主动请求便捷层 | 同一 HTTP driver | src/platform/host/sdk-broker.js | browser.network.request（未接线） | 未来已安装工具 | 独立网络能力 | 显式 Origin | 138 | 高 | PLANNED | R2+ |
| 自定义 Cookie/Auth 透传 | fetch credentials / cookie | src/platform/chrome/network.js; cookies.js | — | 可信 Host | Cookie/认证 | 强限制 | 138 | 极高 | NOT_EXPOSED | 不默认开放 |
| WebSocket 业务连接 | WebSocket | src/native-agent/（已有其他通信用途） | — | 各自可信驱动 | 连接权限 | 明确服务器 | 138 | 高 | NOT_EXPOSED | R3 |

### 网络监听、HAR 和协议

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HTTP 请求元数据 | chrome.webRequest | 计划 network-observer.js | browser.network.observe.start | 可信 SW/未来工具 | webRequest + 单站授权 | 单标签单 Origin | 138 | 高 | PLANNED | R2 |
| 会话状态/停止/导出 | storage.session/受控缓冲 | 计划 network-observation.js | browser.network.observe.getStatus/stop/export | 未来工具 | 观察会话 token | 原观察范围 | 138 | 高 | PLANNED | R2 |
| 有界事件读取 | 消息/分页 cursor | 计划 network-observation.js | browser.events.read/close | 未来工具 | 会话身份 | 单会话 | 138 | 高 | PLANNED | R2 |
| 完整 HAR 保真 | webRequest/CDP | 未实现 | — | 可信环境 | 调试强权限 | 敏感网络 | 138 | 极高 | PLANNED | R3+ |
| WebSocket message body | CDP Network | 未实现 | — | 可信调试 | debugger | 未开放 | 138 | 极高 | NOT_EXPOSED | 非 R2 |

### DNR、请求规则和浏览器代理

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 声明式规则 | declarativeNetRequest | manifest.json（可选权限） | — | 可信 SW | DNR 独立批准 | 站点 | 138 | 高 | PLANNED | R3 |
| 代理设置 | chrome.proxy | 当前 manifest 不含 proxy | — | 可信扩展 | proxy | 全局影响 | 138 | 极高 | NOT_EXPOSED | 独立产品 |
| 请求拦截修改 | debugger/enterprise webRequestBlocking | 未实现 | — | 可信调试 | 高级强权限 | 全部流量 | 138 | 极高 | NOT_EXPOSED | R3+ |

### 截图与区域采集

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 可见区域截图 | chrome.tabs.captureVisibleTab/Controller | src/platform/host/controller-methods.js; src/framework/control/native-driver.js | browser.screenshot.captureVisible（未开放） | Controller Host | 目标文档绑定 | 受权目标 | 138 | 高 | HOST_ONLY | R3 映射 |
| 区域裁剪 | canvas / ImageBitmap | 未建独立通用服务 | — | 可信 UI | screenshot | 单图资源 | 138 | 中 | PLANNED | R3 |
| 整页截图 | 受控滚动或 CDP | 未实现通用工具能力 | — | 可信 Host | 用户授权 | 目标文档 | 138 | 高 | PLANNED | R3 |

### 录屏、桌面共享

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 标签页录屏 | chrome.tabCapture / MediaRecorder | 未实现 | browser.media.recording.prepare/stop | 可信前台 | tabCapture + gesture | 单选标签 | 138 | 极高 | PLANNED | R3 |
| 窗口/桌面共享 | chrome.desktopCapture / getDisplayMedia | 未实现 | — | 可信前台 | 每次用户授权 | 用户选定源 | 138 | 极高 | PLANNED | R3 |
| 录屏会话与产物 | MediaRecorder / 原 Artifact 引用 | 未实现 | browser.media.recording.getStatus/discard | 可信 Host | 资源所有权 | 单会话 | 138 | 高 | PLANNED | R3 |

### 音频与语音

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 麦克风录音 | getUserMedia / MediaRecorder | 未实现 | — | 可信前台 | 浏览器媒体授权 | 显式选择 | 138 | 极高 | PLANNED | R3 |
| 标签音频 | chrome.tabCapture | 未实现 | — | 可信前台 | tabCapture | 选定标签 | 138 | 极高 | PLANNED | R3 |
| 语音转文字 STT | Web Speech / 受控 Provider | 未实现 | browser.speech.transcribe | 未来可信服务 | 单独语音授权 | 指定媒体 | 138 | 高 | PLANNED | R3+ |
| 语音播报 TTS | SpeechSynthesis | 未实现通用 SDK | browser.speech.speak/stop | 可信 UI | 用户可停止 | 本地设备 | 138 | 中 | PLANNED | R3+ |

### 存储、书签、历史、Cookie

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 工具本机数据 | chrome.storage.local | src/ui/sidebar-tools.js | 原 OpenDeskTool.request(storage.get/set) | 已安装工具 | storage.local | 单工具键空间 | 138 | 中 | HOST_ONLY | 既有 |
| 原 SDK 持久/会话存储 | chrome.storage / 原 Broker | src/framework/sdk/storage.js | AppStorage/AppLocal | Page SDK | 原 SDK authority | 单页面 grant | 138 | 高 | HOST_ONLY | 既有 |
| IndexedDB 基础数据 | indexedDB | src/platform/storage/ | — | 可信 Host | 原存储服务 | 原身份 | 138 | 高 | HOST_ONLY | 既有 |
| 书签读写 | chrome.bookmarks | manifest.json（可选） | — | 可信扩展 | bookmarks | 用户批准 | 138 | 高 | NOT_EXPOSED | R3 |
| 历史记录 | chrome.history | manifest.json（可选） | — | 可信扩展 | history | 用户批准 | 138 | 高 | NOT_EXPOSED | R3 |
| Cookie 服务 | chrome.cookies | src/platform/chrome/cookies.js | 原 Controller 能力 | Controller | cookies+站点 | 指定域 | 138 | 极高 | HOST_ONLY | 既有 |

### 下载、剪贴板、文件与 Native 文件

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 文本复制 | navigator.clipboard.writeText | src/ui/sidebar-tools.js | browser.clipboard.writeText | 已安装工具 | user.export | 用户前台 | 138 | 中 | IMPLEMENTED | R1.3 |
| Markdown 下载 | chrome.downloads.download | src/ui/sidebar-tools.js | browser.downloads.text | 已安装工具 | downloads+user.export | 用户前台 | 138 | 中 | IMPLEMENTED | R1.3 |
| 原持久 Artifact 下载 | chrome.downloads / Result Service | src/platform/downloads/ | 原 Controller 文件结果 | Controller | 原 authority | Result identity | 138 | 高 | HOST_ONLY | 既有 |
| Native 文件访问 | Native Host/本地 Provider | src/native-agent/ | — | 可信 Native | 本地授权目录 | Provider | 138 | 极高 | HOST_ONLY | 既有 |
| 剪贴板读取 | navigator.clipboard.readText | manifest.json（clipboardRead 可选） | — | 可信 UI | clipboardRead+gesture | 当前剪贴板 | 138 | 高 | NOT_EXPOSED | R3 |

### 事件、Alarm、升级与 MV3 生命周期

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 工具菜单开关/安装同步 | chrome.runtime.onInstalled / permissions / storage | src/sw.js; context-menus.js | — | 可信 SW | 菜单可选权限 | 工具安装状态 | 138 | 高 | IMPLEMENTED | R1.3 |
| 文档导航与标签关闭撤销 | webNavigation.onCommitted / tabs.onRemoved | src/sw.js; sdk-methods.js; context-menus.js | — | 可信 SW | webNavigation | tab/document | 138 | 高 | HOST_ONLY | 既有+R1.3 |
| Alarm 定时器 | chrome.alarms | 未见统一 Browser SDK 入口 | — | 可信 SW | alarms | 按任务限额 | 138 | 中 | PLANNED | R3 |
| 扩展更新恢复 | runtime.onInstalled / startup | src/sw.js | — | 可信 SW | MV3 | 扩展 | 138 | 高 | HOST_ONLY | R1.3 验收中 |

### Controller、Page、Locator 和自动化

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Controller 原48及 Locator | 原 Controller broker | src/framework/ChromePage.js; src/platform/host/controller-methods.js | 原 page/Locator | RunHost | 原 Authority | 绑定目标 | 138 | 高 | HOST_ONLY | 既有 |
| Page USER_SCRIPT | chrome.userScripts | src/scripting/user-scripts/installed-programs.js | 原 Page API | 已安装 Page | site/userScripts | 文档范围 | 138 | 高 | HOST_ONLY | 既有 |
| Task 自动化生命周期 | 原 RunHost | src/platform/host/authority.js | 原 Controller API | 受信 Controller | grant/Run identity | 选定 tab | 138 | 高 | HOST_ONLY | 既有 |
| 第三方任意 CDP | chrome.debugger | 未接入 Browser SDK | — | 普通工具禁止 | debugger | 全局强权限 | 138 | 极高 | NOT_EXPOSED | 不默认开放 |

### DevTools、Debugger、性能与诊断

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SDK 资源诊断 | SDK diagnostics | src/framework/sdk/entry.js | OpenDeskSDK.diagnostics | Page SDK | 原 SDK | 本 SDK 文档 | 138 | 低 | HOST_ONLY | 既有 |
| CDP Debugger | chrome.debugger | 未见通用工具 Broker | — | 可信开发 | debugger | 显式浏览器附着 | 138 | 极高 | NOT_EXPOSED | R3+ |
| Performance Timeline | Performance API | Page/Controller 原框架 | — | 目标网页 | Page 文档权限 | 当前文档 | 138 | 中 | HOST_ONLY | 既有 |
| DevTools 扩展页 | chrome.devtools.* | 无 DevTools 扩展入口 | — | DevTools | 专用入口 | 当前 tab | 138 | 高 | PLANNED | R3+ |

### Native Messaging、本地系统

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Native 连接 | chrome.runtime.connectNative | src/native-agent/transport.js | — | 可信 Host | nativeMessaging（可选） | 本地特定 Host | 138 | 极高 | HOST_ONLY | 既有 |
| 本地 Workspace 文件 | Native Provider RPC | src/native-agent/host-adapter.js | — | 可信 Workspace | 目录用户授权 | Provider | 138 | 极高 | HOST_ONLY | 既有 |
| 原生任意 Shell | Native 内部明确白名单 | 不提供任意命令公开接口 | — | 普通网页/工具禁止 | 不可开放 | 系统范围 | 138 | 极高 | NOT_EXPOSED | 不开放 |

### 权限、身份、隔离和撤权

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Page SDK grant | 原 SDK hello/grant | src/platform/host/sdk-methods.js; src/framework/sdk/registry.js | 原 SDK | 受权 Page | document/source identity | frame/doc | 138 | 极高 | HOST_ONLY | 既有 |
| 工具实例授权 | 沙箱会话与 Chrome storage | src/ui/sidebar-tools.js; installation.js | OpenDeskTool.request | 工具沙箱 | 声明 capability | 单工具 | 138 | 高 | HOST_ONLY | 既有 |
| 菜单安装包绑定/撤权 | SHA-256, Web Locks, storage.session | src/platform/chrome/context-menus.js | browser.contextMenu.* | 工具/可信 SW | 菜单能力+Chrome Permission | 指定 Origin | 138 | 极高 | IMPLEMENTED | R1.3 |
| 普通网页越权拒绝 | Page local discovery / RPC allowlist | src/framework/sdk/browser.js; registry.js | 仅 capabilities.* | Page SDK | 不授特权 | 当前文档 | 138 | 极高 | IMPLEMENTED | R1.3 |

### 工具安装、设置、更新、市场

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| v1/v2 严格包检验 | 本机包校验 | src/ui/sidebar-tools/package.js | — | 可信安装器 | 用户审阅 | 工具 id/version | 138 | 高 | IMPLEMENTED | R1.3 |
| 统一安装与卸载 | chrome.storage + Web Locks | src/ui/sidebar-tools/installation.js | — | 可信 UI | 安装/来源审阅 | 单工具 | 138 | 高 | HOST_ONLY | 既有 |
| 官方 Catalog/市场 | 静态官方发行包/摘要 | src/sidebar-tools/official-catalog.js | — | 可信 UI | 固定官方来源 | 官方 release | 138 | 中 | HOST_ONLY | 既有 |
| 公网作者发布后台 | 外部网络服务 | 未实现 | — | 市场后台 | 发行身份 | 远程 | 不适用 | 高 | PLANNED | R3+ |

### AI、云任务、WebSocket 和 Provider

| 子能力 | Chrome / Web / Native 接口 | 实际服务源码或拟新增位置 | Browser SDK/旧接口 | 允许环境 | 权限/能力 | 网站/身份范围 | Chrome | 风险 | 实施状态 | 阶段 / 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AI 编辑/开发 | UI/Native Provider | src/ui/workflow/; src/native-agent/ | — | 受权工作流 | 原工作流权限 | 项目/Provider | 138 | 高 | HOST_ONLY | 既有 |
| 云端 Socket 任务接入 | WebSocket/Native | 云控独立工作流（不属 Browser SDK R1.3） | — | 可信长连接 | 单独云控身份 | 账户/设备 | 138 | 极高 | NOT_EXPOSED | 云控 R2 |
| 第三方 Provider 请求 | 受控 HTTP/Native | src/platform/chrome/network.js; native-agent/ | — | 可信 Host | 原 Provider 合同 | Provider | 138 | 高 | NOT_EXPOSED | R3 |
| 远端网页直接控制宿主 | 无可信授权路径 | 禁止 | — | 普通网页禁止 | 不可开放 | 跨用户 | 不适用 | 极高 | UNSUPPORTED | 不开放 |


## Manifest 事实与后续阶段

实际 `manifest.json` 的必备权限包含 `storage/scripting/sidePanel/activeTab/downloads/tabs/webNavigation/userScripts/cookies/notifications/unlimitedStorage`，可选包含 `contextMenus/webRequest/tabGroups/bookmarks/history/clipboardRead/clipboardWrite/declarativeNetRequestWithHostAccess/nativeMessaging`。项目当前声明 `host_permissions: ["<all_urls>"]`，它不是工具或网站授权事实来源，也不代表可以默认被动采集所有网络请求。

R2 首要补齐 **浏览器网络请求被动观察**，保留 `src/platform/chrome/network.js` 中现有主动请求职责；R3 及之后按 Browser API 合同扩展 Tab/截图/录屏/语音/通知，不以第二套 SDK 代替现有 Authority/RunHost。完整接口和现实状态见 [browser-sdk.zh-CN.md](browser-sdk.zh-CN.md)。
