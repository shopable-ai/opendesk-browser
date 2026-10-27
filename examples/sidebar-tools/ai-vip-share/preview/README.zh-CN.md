# AI VIP Share · 预览说明

## 设计预览：唯一固定名称 `design.html`

- [`design.html`](design.html) 是 R4.2 历史视觉与后续交互补强的单文件 HTML 设计基线；兑换码是**普通文本输入框**，不应出现密码眼睛按钮。
- **商品入口只保留一个「查看更多商品」按钮**，在批准的外部 HTTP(S) 地址配置后，单击直接打开新标签页；不需要内部商品页面、商品列表、弹窗或额外确认。
- 「AI 网站访问」下方有独立的小型**「推荐 AI 代理电脑客户端」推广卡**，内含「推广」标识、一句说明和一个「了解桌面客户端」按钮。它使用**另一个**外部 HTTP(S) 地址；不会改变会员、兑换、Cookie、Chrome 代理状态。
- 目前**没有收到实际商品目录或桌面客户端 URL**，因此原型中这两个链接均未配置。点击时只提示缺少地址，不伪造跳转、支付或购买成功。可仅在离线预览测试时附加 `?catalogUrl=<URL编码后的HTTP(S)地址>&desktopUrl=<URL编码后的HTTP(S)地址>` 验证用户点击打开外部页；**正式扩展不得接受未受信的 query 参数作为目标网址**。
- 设计文件仅用于评审。已删除不需要的本地商品页；保留正式同源预览 `index.html` 及历史原型归档，避免覆盖产品构建。
- 本轮不修改 `../src/App.jsx`、`../src/main.js`、`../src/style.css`、`tool.config.json` 或已安装 JSON；待确认设计后再精确迁移 React。真实浏览器外链导航与已安装扩展行为需要单独验收。

## 正式 React 同源预览（待视觉收敛）


现有 [`index.html`](index.html) 与 `main.jsx` 保持原位，继续通过正式 `../src/App.jsx`、`../src/style.css`、`../src/main.js` 构建；**目前尚未按照 `design.html` 完成精确视觉迁移**。后续需在正式 React 和真实 Mac Chrome 验收中核对与设计稿的差异，并保留原有授权、兑换事务、Cookie journal、代理 STOP 合同。生产商品地址/会员 Provider 未配置时不能擅自增加真实购买跳转。

---

# AI VIP Share · 正式 React 同源交互预览

主入口：[`index.html`](index.html)。浏览器访问需要先执行 `npm run build:preview --prefix examples/sidebar-tools/ai-vip-share`，打开生成的 `preview/dist/index.html`；这不是另一份产品 Mock。

**界面三层职责：** 正式 `../src/App.jsx` 只负责会员、兑换、历史、代理及条件网站会话；`index.html` 的演示场景栏属于预览外壳；`sdk-fixture.js` 只提供虚构会员/响应，不调用真实网站或 Chrome API。仅外壳保留一次「虚构数据 · 仅供评审」说明，不把“演示会员/演示网站访问”等测试名当真实产品字体设计的组成部分。

## 如何检验整套交互

场景下拉可查看**有效会员、网站会话、待兑换、额度会员、已到期、未登录、服务异常、未接入服务**；所有状态使用同一正式 React 组件和原业务事务控制器。会员卡可显示有效期、额度与功能权益，但它们均为虚构评审数据，不代表第三方订阅或登录。默认有效会员不额外展示网站会话卡；只有模拟服务确实交付会话的独立「网站会话」场景，才显示该条件模块。主要权益已经在会员主卡展示，不再于列表重复。

选择「待兑换」，展开预览外壳的「演示设置」，点击「填入体验激活码」，它只写入表单草稿，不自动预检或兑换。实际流程由产品界面的遮蔽输入框、显示/清空按钮、预检激活、确认兑换执行，保留错误、结果未知、恢复核验等原业务逻辑。体验码为 `DEMO-VIP-01`。

在「演示设置」还可切换 Cookie 成功/部分成功/结果未知与代理启停/冲突/STOP 待确认，随后由产品自身按钮执行并显示回执。**公司共享账号 A/B 仅保留在自动化后端测试夹具中，不再有用户可见账户管理界面。**

产物构建与同源 CI：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build --prefix examples/sidebar-tools/ai-vip-share
npm run build:preview --prefix examples/sidebar-tools/ai-vip-share
```

历史静态原型归档于 [`archive/r57.html`](archive/r57.html)，不作为当前产品验收依据。Chromium Fixture PASS 不等于已安装扩展或真实 Chrome Cookie/代理/第三方网站身份通过；宿主来源锁失败不允许绕过。
