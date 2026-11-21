# AI VIP Share · 预览说明

<a id="current-test-entry"></a>

## 当前测试入口（1.4.35，2026-11-19）

复用本目录 `index.html` / `main.jsx`，它们消费原 `src/App.jsx` / `src/main.js`。从仓库根构建并启动静态预览，打开命令输出的本机 URL：

```sh
npm run build:preview --prefix projects/ai-vip-share
node node_modules/vite/bin/vite.js preview --config projects/ai-vip-share/preview/vite.config.mjs --host 127.0.0.1
```

1. 场景选 **开发实验（非安装版）**：初始未连接；点「连接本地开发」，会员卡应显示权益有效；点「测试网站登录」展开原两个测试网站选项。下方“已选择”只表示选择，不证明真实服务连接。普通工作台的实际登录需要原测试服务及已安装工具，此场景不模拟其完整后端。
2. 场景选 **首次连接服务**。输入 `https://vip.example.com/activate?activation_code=DEMO-VIP-01`，连接后核对激活内容。先取消，再输入 `DEMO-VIP-01` 重新预检并确认。确认后有一条兑换记录和分配账号。再次连接同一链接时复用有效权益。
3. 场景选 **网站登录测试**：登录并打开网站 → 查看合成写入回执及“到网站核对实际登录”提示。预览不会打开真实网站、写 Cookie 或出现真实 Host 逐批确认。
4. 场景选 **兑换回执待核对**。用同一体验激活码完成预检并确认。模拟后端记录兑换后丢失回执，工具应保留待核对状态。点「核对上次兑换」后应读回原笔。

从 URL 打开 `?scene=connect&width=390&run=core-1` 或 `?scene=recovery&width=390&run=core-2`，可在同一标签页重载后继续原合成账本。新的 `run` 值创建独立账本，通过场景下拉框切换时恢复默认临时场景。测试浏览器的既有 Cookie 和登录不参与夹具。

用 ego-browser 复用本任务的测试页。将下例的 TaskSpace ID、文件绝对路径和端口替换为当前值，然后执行核心断言。

```sh
ego-browser nodejs <<'EOF'
const task = await taskSpace(123);
const {testCoreUi} = await import('file:///path/to/opendesk-browser/projects/ai-vip-share/preview/test-core-ui.mjs');
await testCoreUi(task.page('p1'), 'http://127.0.0.1:4173/');
EOF
```

浏览器取证见[核心 UI 验收账本](../dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#core-ui-20261119)。

所有场景仅用隔离合成数据。开发场景现在使用原控制器的新连接端口 7903，并接受原只读会员 POST，不再预选旧 7898；没有连接真实 Provider。两开发按钮只在 `dev/main.jsx` 中组装，正式 `src/main.jsx` 不导入它们。真实网络/Cookie/代理应从已安装工具原权限链测试；本轮未验证安装更新、双 Surface、第三方身份或 VIP。最新事实见[唯一账本](../dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#test-entrances-20261115)。以下为历史记录。

## 历史预览与原生边界（1.4.22，2026-11-06）

预览继续消费正式React组件与控制器，前端文件入口和本机导入分支已移除；原兑换卡承接服务器会话摘要与逐批确认，不增加独立区域。预览只用合成数据，未包含授权原文件或真实Cookie。

本轮复核工具及预览build-ready中的全部源码/产物摘要匹配；工具buildId为`d2f366480f80f5eade740e93d5b553fa5e2722e7bbd4cc7872a73d3b5aef8891`，预览为`6e9a17f85eae06137b8cdea2c50e3be9c22d00961ea3e7132f7a7909f7b57960`。预览不证明原生授权、写入或登录。

独立的已安装1.4.22本轮已有7903原事务恢复、服务器交付、21+1可信写入及ChatGPT写后菜单/设置/退出布尔核对；已有登录基线明确保留。框架HTTP预算修复不改工具字节。真实证据与未测边界见[唯一账本](../dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#server-cookie-1422-20261106)；LAN、production、商业/真实代理及评分继续延期。下方均为历史。

## 2026-11-06 更新（1.4.20，历史）

同源预览已重建为1.4.20，消费正式React与控制器：默认没有独立文件登录卡，服务器交付的会话显示在原「兑换激活」卡内。本机文件只经批准开发测试入口主动揭示，普通用户无需选择JSON。预览继续只含合成fixture，真实文件没有进入预览或服务器；它不能证明真实ChatGPT服务端交付或登录。实际安装和合成服务操作见[唯一测试记录](../dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#server-flow-1420-20261106)。下方默认文件/折叠布局按历史阅读。

## 2026-11-06 更新（1.4.19，历史）

正式包与同源预览为 **1.4.19**，修正可信取消后准备到期仍提示可确认的问题。预览继续只用合成数据；真实Cookie文件未进入此预览。工具收据14输入/2输出，预览收据27输入/5输出，本轮逐项字节与摘要核对一致。真实1.4.18登录、1.4.19取消/到期和升级授权限制分别见[唯一测试记录](../dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#cancel-expiry-1419-20261106)，不能用预览或来源收据代替原生结果。以下版本按历史阅读。

## 2026-11-06 更新（1.4.18）

正式包及同源预览已更新为 **1.4.18**，默认展开快速登录、显示三步入口，完整校验后跳过合法过期项并报告总/保留/跳过数。预览仅使用合成数据，真实文件只在已安装工具原入口处理；预览不能证明可信权限、Cookie 写入或 ChatGPT 登录。来源与操作证据见[唯一测试记录](../dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#expired-filter-1418-20261106)。下节及后文版本为历史。

## 2026-11-06 更新（1.4.16）

该阶段正式包和同源预览为 **1.4.16**。本地 ChatGPT 登录默认展开，显示版本、三步入口及精确过期反馈；下面“默认折叠/1.4.13”均为历史。1.4.16 已在 ego 原扩展中心审阅安装并以真实用户文件触发过期拒绝；文件未进入此预览。预览的 Cookie 写入仍为受限合成 fixture，不能作为真实写入或登录证据。当前来源与未测项见[唯一测试记录](../dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#visible-login-1416-20261106)。

## 当前参照、入口与版本（2026-11-01）

用户明确以 [`design.html`](design.html) 为参照，随后要求复用 Neutral shadcn aria-nova 并简化网站登录；[`index.html`](index.html) 是消费正式 React/控制器的同源交互入口。唯一正式包为 **1.4.13**，未执行原生安装更新；日常 1.4.8 与 Core Profile 1.4.11 均为历史观察。目标、来源回执及未测项见[唯一当前账本](../dev/local-test/EXTENSION-VIP-TEST.zh-CN.md#design-alignment-20261101)。

`preview/dist` 是生成物，源码变化后按原 `build:preview` 重建。1.4.13 buildId 为 `3055b3f8fb6a460d84d3c845ec8355c84d0a4273aaa5484945339c2540eca9be`，25 项输入和 5 项输出逐一核对通过。正式包与预览使用同一公共 CSS 抽取器，设计稿也消费生成的 `dist/design.css`；没有引入第二套组件或依赖。正式工具仍从宿主取得 Shared UI，预览静态解析组件；新包宿主配对尚未执行。

默认会员及兑换场景不提供网站目录，也不因本地开发 profile 存在就展示普通工作台。「网站登录测试」场景提供一个虚构已批准网站：初始只显示可展开的名称/域名；只有多站时才显示站点按钮。展开后准备 → 账号/目标/替换提示 → 确认，取消不写入 Cookie、不打开网页并回焦；unknown/partial 保留禁止重放。顶部场景/主题/模拟回执控制只属于预览外壳，不进入正式工具。

预览构建把 `OpenDeskTool` / `OpenDeskSDK` 引用隔离为专用 fixture 别名，避免覆盖 Browser 在 localhost 注入的只读 SDK，也不使用真实能力。正式构建不包含这些别名或 fixture。预览观察不证明安装或升级；各版本/Profile 的实际证据见[项目 README](../README.zh-CN.md)，本轮 UI 对齐尚未通过签署。

## 本轮选定设计参照：`design.html`

- [`design.html`](design.html) 源于 R4.2，用户本轮明确指定为对齐基线；其模拟数据/状态机仍只供评审。兑换码是**普通文本输入框**，不应出现密码眼睛按钮。
- **商品入口只保留一个「查看更多商品」按钮**，在批准的外部 HTTP(S) 地址配置后，单击直接打开新标签页；不需要内部商品页面、商品列表、弹窗或额外确认。
- 「AI 网站访问」下方有独立的小型**「推荐 AI 代理电脑客户端」推广卡**，内含「推广」标识、一句说明和一个「了解桌面客户端」按钮。它使用**另一个**外部 HTTP(S) 地址；不会改变会员、兑换、Cookie、Chrome 代理状态。
- 目前**没有收到实际商品目录或桌面客户端 URL**，因此原型中这两个链接均未配置。点击时只提示缺少地址，不伪造跳转、支付或购买成功。可仅在离线预览测试时附加 `?catalogUrl=<URL编码后的HTTP(S)地址>&desktopUrl=<URL编码后的HTTP(S)地址>` 验证用户点击打开外部页；**正式扩展不得接受未受信的 query 参数作为目标网址**。
- 设计文件仅用于评审。已删除不需要的本地商品页；保留正式同源预览 `index.html` 及历史原型归档，避免覆盖产品构建。
- R2.7/R2.8 和 1.4.12 品牌删除均为历史。1.4.13 已按用户最新要求同步共享样式，保留原型模拟数据/场景及正式业务差异；截图比较不宣称像素相同或真实会员/代理通过。

## 正式 React 同源预览


现有 [`index.html`](index.html) 与 `main.jsx` 保持原位，继续通过正式 `../src/App.jsx`、`../src/style.css`、`../src/main.js` 构建。R2.8 六档宽度等检查只属历史，本轮仅正常窗口、默认缩放；不运行现有脚本中的宽度/缩放矩阵。仍需核对与选定设计稿的差异，并保留原有授权、兑换事务、Cookie journal、代理 STOP 合同。生产商品地址/会员 Provider 未配置时不能擅自增加真实购买跳转。

---

# AI VIP Share · 正式 React 同源交互预览

主入口：[`index.html`](index.html)。浏览器访问需要先执行 `npm run build:preview --prefix examples/sidebar-tools/ai-vip-share`，打开生成的 `preview/dist/index.html`；这不是另一份产品 Mock。

**界面三层职责：** 正式 `../src/App.jsx` 只负责会员、兑换、历史、代理及条件网站会话；`index.html` 的演示场景栏属于预览外壳；`sdk-fixture.js` 只提供虚构会员/响应，不调用真实网站或 Chrome API。仅外壳保留一次「虚构数据 · 仅供评审」说明，不把“演示会员/演示网站访问”等测试名当真实产品字体设计的组成部分。

## 如何检验整套交互

场景下拉可查看**有效会员、网站登录测试、待兑换、额度会员、已到期、未登录、服务异常、未接入服务**；所有状态使用同一正式 React 与控制器。会员有效期、额度、功能权益和测试账号均为虚构评审数据，不代表第三方订阅或登录。网站登录按上述条件展示，服务器交付后才显示待确认会话。

选择「待兑换」，展开预览外壳的「演示设置」，点击「填入体验激活码」，它只写入表单草稿，不自动预检或兑换。实际流程由产品界面的普通明文输入框、内嵌清空按钮、预检激活、确认兑换执行，保留错误、结果未知、恢复核验等原业务逻辑。体验码为 `DEMO-VIP-01`。

在「演示设置」还可切换 Cookie 成功/部分成功/结果未知与代理启停/冲突/STOP 待确认，随后由产品自身按钮执行并显示回执。**公司共享账号 A/B 仅保留在自动化后端测试夹具中，不再有用户可见账户管理界面。**

产物构建与同源 CI：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build --prefix examples/sidebar-tools/ai-vip-share
npm run build:preview --prefix examples/sidebar-tools/ai-vip-share
```

历史静态原型归档于 [`archive/r57.html`](archive/r57.html)，不作为当前产品验收依据。Chromium Fixture PASS 不等于已安装扩展或真实 Chrome Cookie/代理/第三方网站身份通过；宿主来源锁失败不允许绕过。

## R2.9：首次安装、未激活与授权状态

正式同源交互入口仍为 [`index.html`](index.html)，调用唯一正式 `src/App.jsx`、`src/main.js`、`src/style.css`；未创建第二套业务 React。预览中的 12 状态包括首次安装、账号无权益、Provider 未配置、会员连接异常、会员有效、到期、专属激活链接待确认、代理权限缺失、代理启用、控制权冲突、STOP 结果未确认及服务器交付的网站会话。原有会员额度、兑换流程、Cookie 三种写入结果回归测试仍然保留。

预览外壳新增宽度、外观和会员断线场景控制；这些控制和虚构 SDK 数据不进入正式 JSON。断线测试必须保留最后核验的权益与兑换历史，同时锁住新兑换、新网站会话与代理 START；不应锁住 STOP。专属激活链接必须通过 Host 受信来源校验，仅带入待确认表单，不能自动兑换。

商业 Provider、正式激活来源、商城/电脑客户端 URL 和生产代理接入仍需配置；构建通过不等于 Mac Chrome 安装、第三方网站 Cookie 及代理验收。
