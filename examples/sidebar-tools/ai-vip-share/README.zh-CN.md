# AI VIP Share · 独立 Sidebar Tool

正式工具 ID：`ai-vip-share`；源码目录：`examples/sidebar-tools/ai-vip-share/`。
用户从 OpenDesk Browser「扩展」安装，不需要持有浏览器项目源码；本工具不提供任意节点、PAC 编辑器、Cookie 会话移植或常驻日志。

## 产品设计与原型（R4）

会员账号、兑换码/时长、专属激活链接、安装引导及更多商品的**待实现**规范：[`DESIGN.zh-CN.md`](DESIGN.zh-CN.md)。
可离线交互的 HTML 评审页：[`preview/ai-vip-share-r4-preview.html`](preview/ai-vip-share-r4-preview.html)，仅供审查，不接入真实账号、支付或代理。

## 本地构建与验证

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/ai-vip-share
node --test tests/environment/ai-vip-share-r2.test.mjs
```

## 安装身份迁移

`ai-vip-share` 是新的独立安装身份，不能自动继承 `ai-smart-access` 的安装授权、epoch、激活租约或启用状态。
旧版工具应在代理释放后明确卸载，再审核安装新版。旧版卸载只能清理旧身份数据，不能覆盖新版可能持有的代理设置。

## 当前过渡架构与阻塞

新目录目前承载 UI 和声明式包配置；Chrome 全局代理控制仍由旧的宿主
`src/ai-smart-access/` 的 R1 可信模块提供。`aiAccess.*` 只是内部过渡协议，
**不属于已正式批准的公共 SDK Managed Proxy Capability**。
后续须把域名、激活、服务商配置等业务迁入此工具，复用 SDK R11 审核通过的公共代理框架，并删除专用 Host/Service。
不得借更名重复开发 SDK 或授予沙箱 `chrome.proxy` 权限。

正式服务未配置：`PROVIDER_BLOCKED`；受控 Chrome 网络、重启与生产激活需在 Mac/CFT 补齐原生证据。
历史基线：`docs/framework/workstreams/ai-smart-access-r1.md`。
