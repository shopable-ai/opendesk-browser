# AI VIP Share · R5.7 离线产品预览

**唯一主入口：** [index.html](index.html)（直接使用 Chrome 打开本地 HTML，无服务器、CDN、生产 SDK 或额外构建）。

**不修改的历史视觉参照：** [ai-vip-share-r4-preview.html](ai-vip-share-r4-preview.html)。R5.7 延续其品牌图形和会员主卡结构，不额外创建版本命名的主 HTML。

> **信任边界：** 本页是纯静态离线产品预览。账号、会员、商品、兑换、浏览器安装和代理状态都没有与真实服务连接。所有权益、回执和安装状态都只能作为**明确标记的演示结果**。不得据此声明商业产品或 Chrome 代理已上线。

## 在预览中完成完整体验

1. 打开主页面，查看「AI 会员 → 兑换激活 → 查看更多商品 → AI 网站访问 → 适用网站说明」的正式模拟视图。外侧的**实验台**负责切换会员、额度、功能、访客、过期、服务故障及代理控制状态，也可切换 390 / 360 / 320px 和浅色 / 深色主题。
2. 演示码 `DEMO-ACCESS-2026`：填写或从外侧实验台填入 → 使用 Enter 或「预检兑换」 → 核对「20 次**演示**额度」与脱敏产品账号 → 点击确认/取消 → 确认产生唯一标注的本次离线回执 `PREVIEW-RECEIPT-001` 与可展开的本次模拟记录。**没有正式额度发放、付款或代理自动开启**。
3. `DEMO-USED-2026`、`DEMO-EXPIRED-2026`、`DEMO-WRONG-ACCOUNT-2026` 分别演示已使用、过期、账号不符。格式不合法或未列入固定 fixture 的兑换码不会形成预检成功；未登录须先点击「模拟绑定账号」，服务不可用拒绝兑换。
4. 「预检请求超时」模拟超时后可以手动重试预检；「提交回执未知 · 可预检」在点击确认后将**交易锁定**，不能因无回执重新提交或改动会员数据；「兑换回执未知」场景提供只返回“仍未知”的核对入口。
5. 「激活链接 · 未安装浏览器插件」：先查看安装引导，再在**扩展 UI 之外**点击「实验台：模拟已确认安装浏览器」及「模拟已确认添加工具」。未完成步骤时不允许预检，完成两步后**仍须主动预检和确认**。工具未安装、两者已安装分别由独立场景复现。本 HTML 不调用 Chrome 安装 API。
6. 「使用现有网络」可测试「启用代理」过程中立即「停用代理」：旧启用回执不能复活代理；「停止失败」提供重试；「服务离线 · 仍可停用」「会员到期 · 仍可停用」「其他扩展/工具接管」检查停用独立于会员和 Provider 且不清理别的控制方。
7. 「查看更多商品」仅打开 `https://example.com/` 的**外部 HTTPS 新标签页**。这是示例网址而非商城，未提供订单、价格、支付或内部购买弹窗。

## R5.7 模型与源码约束

- `index.html` 保留 **3 段内联脚本**：原 R4.1 `proxy-demo-model`、离线 `business-preview-model`、**唯一** `preview-ui-controller`。旧的重复兑换控制器、捕获阶段强行拦截、重叠监听已移除。
- 状态分为 `account`、`install`、`redeem`、`proxy`。兑换、代理有独立请求 revision / generation 校验；场景切换取消旧预检，模拟提交处于途中则**保守转入未知**；已确认结果在单次预览会话中防重。
- 仅在内存持有模拟原始码，展示记录只含固定虚构回执和权益。不要将兑换码/账号/Token/长期 ticket 写入 `localStorage`、日志或外部 URL；所有动态文本通过 `textContent` / `replaceChildren` 渲染。
- 代理控制沿用 R4.2 的**单一常驻主按钮**：STOP 优先；不实现模式选择、节点编辑器、不弹额外确认框，不调用 `chrome.proxy`、不修改系统网络。
- 历史 R4.1 测试 `test-r41.mjs` 仍使用历史 HTML 的代理模型；不得为满足新 UI 无意修改历史视觉基线。

## 从预览迁入正式工具的边界

| 预览能力 | 后续正式实现应使用 | 不得照搬到生产 |
| --- | --- | --- |
| 头部、会员主卡、兑换卡、单代理按钮、辅助信息 | `src/index.html` + 独立 `src/style.css`，复用 OpenDesk Sidebar Tool Design System | 外侧实验台、固定演示文案和模拟账号 |
| 账号绑定、会员时间/额度/功能类型、历史记录 | 经审核的会员 Provider、可信账号标识、服务端校验时间 | 预置会员到期日、演示余额、`DEMO-*` 码 |
| 预检 / 明确确认 / 幂等回执 / 未知核对 | 商业 Provider HTTPS API、持久幂等键、可信终态和安全恢复 | `business-preview-model`、虚构 receipt 和 `setTimeout` |
| 专属链接意图续接及安装状态 | 浏览器可信安装管理器、工具身份及权限审核、已批准 origin / 短期 ticket | 实验台的「模拟已安装」按钮，不可静默安装 |
| 代理启用 / 停用 / 来源 / STOP 恢复 | `OpenDeskSDK.browser.proxy.managed.getStatus()`、`requestEnable(...)`、`requestDisable()`，可信宿主与 Chrome Native 回读 | `proxy-demo-model`、模拟启停回执、任意抢占其他工具 |
| 更多商品的单外链入口 | 经审核的正式 HTTPS 商城域名及受信任外链打开方式 | `https://example.com/` 当成真实商城 |
| 网络状态、会员/代理等互不污染 | 宿主/SDK/Provider 分层，独立安全验收 | HTML 原型当作已完成 Chrome 代理验收 |

**正式代码本轮不修改：** `../src/index.html`、`../src/style.css`、`../src/main.js`、SDK/Host/Dispatcher/Chrome driver 或已安装工具 JSON。

## 验证指令与证据等级

```sh
node --test examples/sidebar-tools/ai-vip-share/preview/test-r41.mjs examples/sidebar-tools/ai-vip-share/preview/test-ui.mjs
```

- R5.7 构建时已通过 **3 段控制器语法解析**，并用仓库代码与 Node 测试等价的自定义内存 DOM 驱动完成 **22/22 行为场景**；此项只能报告为 `SIMULATED_DOM_PASS`。
- 当前执行环境**没有挂载用户 Mac 工作目录、不能直接运行仓库 Node 命令或真实 Chromium 预览文件**，故 `NODE_NOT_RUN` 与 `VISUAL_NOT_TESTED`；需要在实际仓库和 Chrome 内按上面的命令、390/360/320px 与深浅主题分别复验。
- 不得因纯模拟测试通过就认定正式扩展、SDK、会员 Provider、Chrome Native 或视觉 95+ 已验收。

独立实施证据见 [R5.7 工作记录](../../../../docs/framework/workstreams/ai-vip-share-r57-preview-ux-20261016.md)。
