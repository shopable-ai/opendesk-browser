# AI VIP Share · 预览说明

## 视觉设计评审（当前优先核对）

- [`design.html`](design.html)：简短固定文件名；基于 R4.2 历史视觉与 R2.5 增强交互的完整、离线 HTML 设计预览。激活码为普通文本输入框，无眼睛图标；会员、兑换预检、历史、网络状态及各种失败场景均为离线演示。
- [`shop.html`](shop.html)：独立商品页演示。设计预览中「更多商品」与「查看更多商品」均为指向该页面的新标签页链接，不再使用弹窗；商品只是示例，不显示真实价格或提供支付/购买。
- 直接打开 `design.html` 可评审视觉；保持这两个文件同目录，商品链接方能工作。
- **这两页是尚待最终确认的视觉/交互契约，不是正式安装的 React 代码，也不参加业务包构建。** 不能把离线操作、模拟兑换和演示目录说成生产功能已完成。

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
