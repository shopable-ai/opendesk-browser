# AI VIP Share R4.1 · 代理控制原型与冲突退出 · 2026-10-15

## 本轮范围

负责人：当前 AI VIP Share 对话。仅更新 `main`；核查基线 `8dc346e0432e11115862b39614b2d46a04f5cebb`。集成时重新核对相关文件和最新 HEAD，保留其他会话修改。

写入文件：
- `examples/sidebar-tools/ai-vip-share/DESIGN.zh-CN.md`
- `examples/sidebar-tools/ai-vip-share/preview/ai-vip-share-r4-preview.html`
- `examples/sidebar-tools/ai-vip-share/preview/test-r41.mjs`
- 本记录。

不修改正式工具 src、manifest、Provider、SDK、代理 Host、安装器或其他工具。没有接触用户 Mac 的 Chrome/Profile、日常 dev watcher 或 dist；这里不是持续开发扩展环境，也不是 production 验收包。

## 已实施（设计 / 离线原型）

保留会员主卡、兑换和更多商品；把启停与切换从折叠详情提升为常驻「AI 网站访问」卡。两种方式为本工具代理、现有网络，先选择后确认；直接停用无需二次确认。新增外部扩展冲突、同宿主工具占用、不可控、未知、停止失败重试、Provider 离线和会员到期仍可停用等演示。

设计合同明确：只释放本工具所有权，不设置全局 DIRECT/system，不关闭其他扩展/系统 VPN；停止意图持久化、晚到启用副作用清理、被其他扩展遮蔽的旧偏好清理、同宿主 owner/epoch/锁校验必须由既有可信 SDK/宿主实现。内存原型不能证明这些原生行为已实现。

## 实际验证

- Node `v22.16.0`：`node --test examples/sidebar-tools/ai-vip-share/preview/test-r41.mjs`，**31 passed / 0 failed / 0 skipped**。只验证 HTML 内独立演示状态模型与控制标记。
- 容器 Chromium `144.0.7559.96` + Python Playwright：直接将相同 HTML 字节传入 `page.set_content`，**26 项具名离线 UI 检查通过**。包含启停、停止优先于晚到启用回执、选择不即应用、取消/Escape、冲突后保留其他控制来源、停止失败/未知状态、会员到期/Provider 离线停止、兑换不启用、原安装续接和商品弹层。
- 布局矩阵：15 个场景 × 320/360/390/768/1000px，文档无横向溢出。无页面 JS 错误、无外部 HTTP/HTTPS 请求。
- 已渲染并检查整页冲突、320px 窄屏；生成正常启用、冲突、停用后、切换弹层和控制卡截图。不是 Chrome 原生 Side Panel 截图或网络路由证据。
- 初次 `file://` 导航被容器浏览器策略拒绝，错误为 `net::ERR_BLOCKED_BY_ADMINISTRATOR`；未解除策略。随后仅用 `set_content` 做离线 HTML 渲染。因此不将本次结果称为文件协议安装/加载验收。

最终验证输入：

| 文件 | Git blob SHA | SHA-256 |
| --- | --- | --- |
| preview/ai-vip-share-r4-preview.html | `9ef4751e913d0a8f4597bd9340dafaf732f66936` | `edc800f3adb9fcbedf5963782cff80789dfc7a40e9eded50accb65ca46d3e099` |
| DESIGN.zh-CN.md | `6d60d4302a2c882f92a41d15e8dc8fbd39a6d515` | `87db5f939a6ce462358ea545c4c0157ae38964db71fc4c8f3369dc591587b6f5` |
| preview/test-r41.mjs | `f384fe5f6380b94579287e1bdfdc059b909c6269` | `0fa4e8aa4ff00b35f6f891a8b41f918b249cd4e5b3372ac9915f419fe0145bd3` |

## 尚未验证 / 不宣称

`PRODUCTION_UI_NOT_CHANGED / NATIVE_NOT_TESTED / PROVIDER_NOT_TESTED / BUILD_NOT_RUN`。没有新跑整仓 CI、production build、Mac Chrome、真实系统代理/双扩展竞争、真实支付/会员服务或正式公共 SDK 验收。31 个模型测试和 26 项 UI 检查不能推导真实产品完成百分比，也不是独立专家 95+ 工程验收。

下一步按 DESIGN 第 10 节接入既有可信控制组件，首先验证真实停止和同宿主 owner 隔离；不重新设计会员页面、不创建第二套代理运行时。
