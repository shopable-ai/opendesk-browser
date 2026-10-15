# AI VIP Share — 产品 UI 交互预览

**主入口：** [index.html](index.html)。下载 HTML 后通过 Chrome 直接打开，无需构建或连接本地服务。

**历史视觉基准：** [ai-vip-share-r4-preview.html](ai-vip-share-r4-preview.html)（R4.2 已确认版；保留原版和 [test-r41.mjs](test-r41.mjs)，不覆写）。

## 这一版在预览中可以操作什么？

- 顶部 **场景 / 390·360·320px / 浅色·深色** 是扩展外部的预览实验台，不属于正式工具 UI。
- 主界面沿用：会员主卡 → **兑换激活** → 外部更多商品 → 常驻 **AI 网站访问** 单一启停按钮 → 低优先级详情。
- 在会员场景填写 `DEMO-ACCESS-2026`，点击「预检兑换」→ 样例权益和脱敏账号 → 显式「确认兑换（模拟）」或取消。也可以点击右侧实验台的「填入演示兑换码」。
- 异常可输入 `DEMO-USED-2026`、`DEMO-EXPIRED-2026`、`DEMO-WRONG-ACCOUNT-2026`。**任意未知兑换码不会出现假成功**，未配置 Provider 不核验商业会员。
- 通过场景切换体验已登录、未购买、会员到期、时间/额度/功能权益、专属激活链接（宿主/工具未安装）、服务未配置、代理冲突、STOP 失败、Provider 离线与**兑换回执未知的手动核对**。
- 两个「更多商品」入口在新标签页打开 `https://example.com/`，这是外部 HTTPS 演示目标，不是真实商城，**不是弹窗**。

## 技术边界和正式 UI 迁移

这份 HTML 无商业 Provider、无支付、无安装动作、无代理 SDK 调用，也没有 HTTP CONNECT / SOCKS5 / PAC 测试。会员或代理状态只是预览固定数据；模拟「启用」不意味着 Chrome 已联网，模拟 STOP 不表示真实设置已释放。

正式工具源码在 `../src/index.html`、`../src/style.css`、`../src/main.js`。当前正式 UI 与已确认 R4.2 预览在卡片顺序、单按钮代理操作上仍有差异。**下一阶段**以此 `index.html` 审核确认稿做原位迁移，正式页复用 OpenDesk Design System 与公共 SDK；不要把离线模型、示例账号/兑换码和固定商品网址拷贝成正式权益服务。

## 回归测试

在实际仓库本地运行：

```sh
node --test examples/sidebar-tools/ai-vip-share/preview/test-r41.mjs examples/sidebar-tools/ai-vip-share/preview/test-ui.mjs
```

新测试只说明离线模型、结构和 JS 语法层面的行为；不能代替 Chrome Native、SDK、会员后端或 7897/7898 联网验收。
