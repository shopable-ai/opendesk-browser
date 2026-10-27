# AI VIP Share · 与正式 React 组件同源的交互预览

唯一主入口：[`index.html`](index.html)。

## 三种界面边界

- **正式产品**：`../src/App.jsx` 是可安装应用的唯一 React 界面。只展示会员、兑换、共享会话、Cookie 交付、代理等业务；在 Side Panel 中不重复显示应用品牌标题，不包含开发连接、功能枚举或 Fixture 信息。
- **预览外壳**：本目录 `index.html` 的一行标题及默认收起的「演示设置」，仅用于切换会员场景、宽度、Cookie 回执、代理模拟状态。它位于 `#tool-app` 之外，绝不进入正式安装包。
- **演示服务适配器**：`sdk-fixture.js` 在预览页面中提供隔离的 `OpenDeskTool`/`OpenDeskSDK` 回执；不会请求商用服务器、读写 Chrome Cookie 或配置真实代理。正式工具 `tool.config.json` 仍只有 `src/index.html` 和经源码签收的 `dist/tool.js`/`dist/tool.css`。

## 本地编译与预览

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build --prefix examples/sidebar-tools/ai-vip-share
npm run build:preview --prefix examples/sidebar-tools/ai-vip-share
# 用静态 HTTP 服务打开 examples/sidebar-tools/ai-vip-share/preview/dist/index.html
```

`preview/index.html` 是 Vite 输入，未编译时直接双击无法执行 JSX；需打开构建后的 `preview/dist/index.html`。工具正式 IIFE 和预览都从相同的 `App.jsx`、`main.js`、`style.css` 构建，不在此维护第二套业务 React。

## 可体验的场景

「演示设置」默认折叠，不占据业务首屏。内有三个会员场景：

- **有效会员**：默认。使用虚构账号展示权益，切换由演示服务分配的 A/B 账号；点击产品自身「刷新会员信息」读取变化。
- **待兑换账号**：演示账号尚未领取权益，可在正式 UI 输入 `DEMO-VIP-01`，按真实业务预检和明确确认步骤完成演示兑换。页面切换场景会重建隔离 Fixture，不会重放既有事务。
- **正式服务未配置**：与未批准商业 Provider 一致的 fail-closed 入口，不出现演示会员、可用兑换或伪造登录。

演示设置另外提供 Cookie 成功、部分写入、结果未知，以及代理已启用、冲突、STOP 待确认等回执。刷新或启停只能由产品界面真实用户操作触发，**测试外壳不会伪造可信事件或绕过 Host 权限**。

历史 R5.7 静态 Mock 保存在 [`archive/r57.html`](archive/r57.html)，只供历史回归，不是新主预览，不应拿来检验现行产品。

## 验收边界

在 GitHub Actions 上先编译正式 React，再运行旧业务与 UI 的定向测试，然后编译同源预览并在真实 Chromium 上用隔离 SDK Fixture 执行。全部节点必须关联提交 SHA；这些步骤均**不等于已安装浏览器扩展、Chrome Cookie 真实写入或代理原生验证**。完整 Browser 构建若遭独立可信来源锁阻断，不允许跳过来源校验。
