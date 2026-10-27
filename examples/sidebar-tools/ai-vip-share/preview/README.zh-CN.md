# AI VIP Share · 正式 React 同源交互预览

主入口：[`index.html`](index.html)。浏览器访问需要先执行 `npm run build:preview --prefix examples/sidebar-tools/ai-vip-share`，打开生成的 `preview/dist/index.html`；这不是另一份产品 Mock。

**界面三层职责：** 正式 `../src/App.jsx` 只负责会员、兑换、历史、代理及条件网站会话；`index.html` 的演示场景栏属于预览外壳；`sdk-fixture.js` 只提供虚构会员/响应，不调用真实网站或 Chrome API。仅外壳保留一次「虚构数据 · 仅供评审」说明，不把“演示会员/演示网站访问”等测试名当真实产品字体设计的组成部分。

## 如何检验整套交互

场景下拉可查看**有效会员、待兑换、额度会员、已到期、未登录、服务异常、未接入服务**；所有状态使用同一正式 React 组件和原业务事务控制器。会员卡可显示有效期、额度与功能权益，但它们均为编造的评审数据，不代表第三方订阅或登录。

选择「待兑换」，展开预览外壳的「演示设置」，点击「填入体验激活码」，它只写入表单草稿，不自动预检或兑换。实际流程由产品界面的遮蔽输入框、显示/清空按钮、预检激活、确认兑换执行，保留错误、结果未知、恢复核验等原业务逻辑。体验码为 `DEMO-VIP-01`。

在「演示设置」还可切换 Cookie 成功/部分成功/结果未知与代理启停/冲突/STOP 待确认，随后由产品自身按钮执行并显示回执。**公司共享账号 A/B 仅保留在自动化后端测试夹具中，不再有用户可见账户管理界面。**

产物构建与同源 CI：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build --prefix examples/sidebar-tools/ai-vip-share
npm run build:preview --prefix examples/sidebar-tools/ai-vip-share
```

历史静态原型归档于 [`archive/r57.html`](archive/r57.html)，不作为当前产品验收依据。Chromium Fixture PASS 不等于已安装扩展或真实 Chrome Cookie/代理/第三方网站身份通过；宿主来源锁失败不允许绕过。
