# 单工具双展示界面 + 页头插槽教学示例

在原有 `header-actions-demo` 的基础上，复用**同一个 Tool ID**：`header-actions-demo`。没有第二安装包、Host、工具注册项、业务存储或权限系统。侧栏继续演示 R14 `headerActions`，新增 PC 页面导航与配置保存链。源配置版本从 `1.0.0` 调整为 `1.1.0`，增加 `storage.local` capability；若正式安装此新版，须经过原工具更新审阅，不能静默继承许可。

## 如何直接查看交互 Demo（源码夹具，不是正式 Chrome 安装）

仓库依赖就绪时在仓库根执行：

```sh
node examples/sidebar-tools/header-actions-demo/preview/serve.mjs
```

用终端输出的本机 URL 打开 `preview/index.html`，可以通过原 Side Panel 模拟宿主点击 **打开 PC 首选项**。新版 Browser SDK 接受请求后，预览夹具会把原生工具标签动作映射为独立的 `/?surface=page&view=settings&section=preferences` 页面；浏览器阻止弹窗时使用顶部“直接打开 PC 演示”链接。侧栏和 PC 均复用**真实的工具源码 + Bridge + ToolHost**，只是源夹具的安装记录、Chrome 标签和持久化本地存储被明确模拟，不能证明真实安装、权限或系统代理行为。

建议完成以下可复验动作：

1. 在侧栏查看“已保存”摘要，点击 **打开 PC 首选项**；目标不携带任意 URL/Tool ID。
2. 在 PC 管理工作台修改工作台名称及紧凑模式；观察未保存状态，点击 **保存配置**。
3. 仅当 `storage.set` 返回 `saved:true` 且 `storage.get` 读回匹配时，页面才显示“保存已确认”；遇到冲突、超时和未知结果不自动重放。
4. 回到原侧栏点击“重新读取已保存设置”；显示 PC 页已保存的数据。再次从 PC 直接打开“关于”栏目确认栏目路由。
5. 可并行打开两个 PC 实例修改同一设置：后写入者的旧 ETag 会被拒绝，草稿不会被静默覆盖。
6. 原 R14 More → 资料库 → 宿主返回及关闭插槽后的内容入口仍正常；原演示的实例计数仍保留。

示例内的页面布局彼此独立：Side Panel 是短摘要 + 操作，PC 是带侧导航、独立滚动、表单和状态的完整管理工作台；**共用的是受控存储与同一安装身份，不共享 React state / 未保存草稿**。Demo 没有代理网络、自动脚本和跨权限调用。

## 公共接口与降级规则

```js
// 必须在真正的用户 click/Enter 回调中同步调用：
const promise=OpenDeskTool.openOwnPage({view:'settings',section:'preferences'});
void promise.then(({opened}) => { /* opened 只表示标签页创建回执 */ });

// PC 页面初始化；只读路由提示，不是认证或权限：
if (OpenDeskTool.surface === 'page') {
  const section=OpenDeskTool.initialPage?.section || 'preferences';
  // 业务自己校验 'preferences' / 'about' 白名单。
}
```

实际沙箱没有 `chrome.tabs`；Host 将接收单次真实用户交互产生的闭包私有凭据，并按活动安装、启停、撤权/代际、dirty/busy 防护打开**同一工具**的固定扩展页面。旧 Host 没有 `openOwnPage` 时，示例显示能力不可用，原页头和内容入口继续可用，不伪报成功。

公开规范见 [Sidebar Tool API](../../../docs/api/sidebar-tools.zh-CN.md#打开当前工具自己的-pc-页面源码已接线真实-chrome-待验收) 和 [多界面框架合同](../../../docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md)。

## 验收分级

- **SOURCE**：源码已接入该示例与 PC/Sidebar 公共 API；参照 `tests/environment/sidebar-own-page-contract.test.mjs`。
- **NODE/BUILD**：新增代码必须由可用的本地 Node / Vite 测试与构建证据确认。
- **CHROME**：必须在真实已安装 OpenDesk Browser 中点击原侧栏工具、打开 PC、保存/回读、测试停用撤权、并行冲突与旧 HTML/Vue/React 工具。
- **PACKAGE**：新版能力涉及 Browser 框架静态源码，须在框架 Build/Chrome 通过之后再决定正式包晋升；仅修改 `tool.config.json` 不会自动更新安装。

本轮 GitHub 远端源码修改与本机验收必须分层报告。原 2026-11-08 Header Actions 测试记录仅对当日源码候选成立，不继承为当前双界面版本 PASS。
