# AI VIP Share · 预览说明

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
