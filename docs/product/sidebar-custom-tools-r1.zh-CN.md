# OpenDesk Browser：侧栏自定义工具 R1

> 2026-10-09；目标：在原生 Chrome MV3 Side Panel 内以**工具选项卡**显示用户提供的 HTML/CSS/JS 页面，不要求每个工具另建独立扩展。此文定义 R1 的实际能力与剩余边界，非发布验收证明。

## 用户怎么使用

- 原有的「我的任务 / 发现 / 开发」三个一级页签保留，任务管理与 RunHost 不重构。
- 打开「我的任务」→「我的工具」→「导入工具包」→选择由本地命令生成的 .opendesk-tool.json →查看能力列表→**确认安装**。
- 安装不会执行界面；点击工具内部选项卡才创建隔离 iframe。点击「任务」即可关闭工具页面，返回既有任务表单。每次卸载确认后删除此工具的本地数据。
- 本地示例：执行 npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes。输出路径由命令打印，选择输出的 .opendesk-tool.json 文件即可。
- 原生工具使用独立 sandbox 文档、内容私有 CSS 和 JavaScript，Chrome 不在宿主 Side Panel 中执行用户代码。
- 一个工具只在明确打开时创建文档；关闭或切换后销毁 iframe。长生命周期运行任务仍由既有 RunHost 负责；不要把 iframe 内计时器当成持久任务。

## 项目开发格式

开发目录示例：examples/sidebar-tools/quick-notes/

- tool.config.json：稳定 ID、版本、中文标题、说明、明确 capabilities 和三个源文件路径。
- src/index.html：只包含工具根内容，不含 script/iframe/style/link 或内联事件。
- src/style.css：只作用于工具自己的展示文档。
- src/main.js：经典浏览器 JavaScript，脚本运行时可通过 globalThis.OpenDeskTool 访问根元素与受控调用。
- assets/：可选的本地 PNG/JPEG/WebP 图片；在 HTML/CSS 中写 {{asset:assets/name.png}}，打包器转成固定的 data URI。不要从网络动态加载 UI 脚本或样式。

命令：
~~~sh
npm ci --ignore-scripts
npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes
# 或保存至指定位置
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/quick-notes --out /tmp/my-tool.opendesk-tool.json
~~~

原生 HTML/CSS/JS 不依赖 React/Vue/Tailwind。**React、Vue、Tailwind 仍为可选的构建期工具**：作者可在本地用现有项目编译为一个**不依赖远程 URL、不使用动态 import** 的经典 IIFE JavaScript 文件及静态 CSS，再将这些文件路径写进 tool.config.json；打包器只负责读取经过构建的 JS/CSS/HTML 与本地图片，并进行有限验证。仓库 R1 没有内置 JSX/TSX/.vue/Tailwind 编译预设。本机对预编译 React＋Tailwind、Vue 样例已有所列候选上的原生安装与状态更新证据，详见下方验收记录；这不代表源码直接导入或完整框架支持。

tool.config.json 所有字段均为代码仓库 example 中所示格式。最终工具包 format 是 opendesk.sidebar-tool.v1，独立于已有 opendesk.task.v1；任务源码、任务权限、版本和结果不被该包修改。最大安装 12 个工具，单包不超过 320 KB，单工具数据最多 32 KB。容量是 R1 的预算，扩大时须复核整个消息与存储链。

## 自定义工具接口 R1

sandbox 已声明只读对象：

~~~javascript
const {root,request} = globalThis.OpenDeskTool;
const info = await request('currentPage.info');  // {status,title,url} 或 unavailable
const saved = await request('storage.get',{key:'note'}); // {value}
await request('storage.set',{key:'note',value:'你好'}); // {saved:true}
await request('tasks.open',{taskId:'my-installed-task'}); // 切换到既有任务 UI，不执行
~~~

工具 config 的 capabilities 只能取以下三项，未声明则拒绝：
- currentPage.read：读取由原 CurrentPageTarget 观察到的普通 HTTP(S) 网页标题与 URL，不能访问网页 DOM。
- storage.local：操作该工具 ID 专属的本地数据；单项 JSON 不超过 8 KB，总数据不超过 32 KB，每工具 32 个键。存储不等于密码保管库。
- tasks.open：仅跳转到用户已安装并启用的任务 UI；启动/停止/权限仍走已有可信点击和 RunHost，不提供任意代码的直接执行或权限请求。

以上接口是**本批实施目标**，必须待真实安装包验收才标记 Native PASS。尚**没有**任意浏览器 API 桥、自动化 tasks.start、axiosx、跨域 HTTP 代理、GM API、Native Host 直通、React/Vue 官方构建模板、完整侧栏工具商店或多端发布保证。若要增加能力，须扩展有明确定义的 allowlist、授权、审计、取消和版本合同，而非直接暴露 chrome、RunHost 或 SW 原语。

## 沙箱与消息

- Manifest 声明额外 sidebar-tools/sandbox.html；同时保留现有计算 sandbox。两页共用 manifest sandbox CSP 的上限，计算 sandbox.html 的 Meta CSP 继续严格限制 style/img/script 来源；独立 UI 沙箱采用仅 self/blob 脚本、仅内联样式/data 图片、禁止 connect、object、form-action 等。
- 用户代码来自手工安装的固定 JSON，作为 blob: JavaScript 在**不具扩展权限的 opaque sandbox**执行；平台自身构建产物仍全为本地固定脚本。不能据此声称支持从服务器拉取动态代码。
- 宿主校验事件 source 是当前 iframe.contentWindow、origin 为 null、会话 instance 与工具 ID 一致，并逐项校验操作类型、能力声明、字段长度、工具存储命名空间与请求预算。origin=null 本身绝不是授权。
- 重新安装或更新工具不自动启动；关闭/切换 iframe 使旧会话消息失效。任务的完整验证、授权和运行记录仍由现有框架管理。
- 工具写入和卸载通过同一浏览器 Web Lock 协调，锁持有至存储提交完成；目录变更使用独立 catalog 锁，顺序固定为 tool→catalog。每次异步获取授权后重新核对实际安装包和当前实例；存储返回的属性顺序变化不等于权限变化。工具数据命名空间由宿主的当前工具 ID 决定，payload 中的 toolId/namespace 不能改写它。
- 宿主 CSP 限制子 frame 来源为 self；工具 frame 再次 load 后关闭旧实例，不重发授权 token。UI 沙箱和计算沙箱的 CSP 分别校验。
- HTML/CSS 的简单正则拒绝只是文件格式防线，**不是网页净化器**。真正的安全边界是 opaque-origin sandbox、CSP、消息窄接口和实际 Chrome 测试。不要将 HTML 放进宿主 DOM。

## 验收范围与证据等级

云端能运行源码检查、Node 合同/打包器测试以及 WXT 生产/开发构建和包验证；真实浏览器必须检查：
1. 原 R6 三页签及任务 Run/Stop/结果保持可用；
2. 在 Chrome 解压加载生产包，安装本地示例并切换工具，关闭重开恢复笔记；网络断开仍渲染图片和 CSS；
3. HTML/CSS 不覆盖宿主任务区；任意工具 JS 无法调用 chrome.runtime/tabs/storage；注入恶意 postMessage 无法调用其他工具存储；
4. activeTab 页面刷新、不同窗口、切换标签页/权限失效时 currentPage.info 准确返回不可用或新目标，不暴露误选标签页数据；
5. 连续切换/关闭 20 次，没有多个 iframe 或异步消息串到下一个工具；拒绝未知字段、外链样式/脚本、路径逃逸及超额包；
6. 320/400/600 CSS px 与 200% 缩放下界面可操作；针对 React/Vue/Tailwind 应分别额外提供**实际构建并导入**与卸载证据才能声称支持。

仓库 CI PASS 与本机 Chrome Native PASS 是两级不同证据；评分按功能、视觉、权限、生命周期、开发体验和性能分别评估，95 分为验收目标，不是未经测试的既成事实。

## 工程责任

R1 最小接线：
- src/ui/sidebar-tools/package.js：独立工具包合同；
- src/ui/sidebar-tools.js：宿主 UI、安装、存储、权限消息路由与 iframe 生命周期；
- src/sidebar-tools/bridge.js、sandbox.html：无权限文档与展示逻辑；
- scripts/build-sidebar-tool.mjs：本地打包；
- scripts/build-contract.mjs、build.mjs、verify-package.mjs、check-source.mjs、wxt.config.mjs、manifest.json：严格发行构建合同；
- tests/environment/sidebar-tools.test.mjs：合同和实例/打包器测试。

后续扩展只能复用现有 Owner/RunHost/Controller/PageAPI/权限/持久结果，不得新增第二套后台自动化引擎。 

## 2026-10-09 Mac 验收记录

当前详细结果、16个修改文件和原始日志见 [Sidebar R1 Mac 工作流](../framework/workstreams/sidebar-tools-r1-mac-01a11fa4.md)。最新实测源码为 `9ad3e494`，本地已交付生产包 `ab0086daba9ac453802cfdc39484570f1ff999d9f8f61d3865d1e57a5bb811ef`；真实受控 Chrome for Testing 为155.0.8059.39。随后合入的远端三份文档没有改变产品或验证输入。

最新包的选择/明确安装/主动打开、HTML/CSS/本地图片、页面title/URL、中文保存、20次销毁恢复、枚举消息/CSP攻击、双窗口绑定/网页导航/业务tab断网、原草稿完整Save/完成/停止/持久结果、卸载与任务记录保留，均有**限定场景的 NATIVE_PASS**。另一个精确b18包证明400/600 CSS px、工具自身实际200%（DPR4）、同profile重启、更新v1.0.1、React＋Tailwind/Vue预编译运行。各package身份分开，不提升为最新整包通过。

本轮修复200%极窄布局标题竖排及macOS项目根别名误拒。沙箱仍为无特权opaque文档；写入/卸载锁、每次异步后重新授权、实例/能力检查和计算沙箱严格CSP保留。官方JSX/TSX/Vue/Tailwind源码直接编译导入仍为**NOT_SUPPORTED**，预编译经典JS/静态CSS成功不代表全部框架支持。

**整体验收仍为 NATIVE_NOT_VERIFIED**。最新本机 `npm test` 是428 tests /427 pass /1 fail /0 skip，失败是已有Native安装的保护断言；现有安装未被覆盖。远端ef016762触发的六个workflow为CI_PASS，两个Mac握手diagnostic通过，但不覆盖本地尚未push的三个修改文件，也不代表完整Side Panel E2E。真实320px宿主受Chrome155最小360限制；延迟onChanged与已进入Chrome I/O的卸载竞态只有组件证据；最新9ad重启和已安装Task v1跳转未独立重验。全框架F3/ZIP合同不由本轮局部通过关闭。
