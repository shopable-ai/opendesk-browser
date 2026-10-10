# R8.3：第 06 组真实 HTTP 第三方 axiosx 默认值修复

日期：2026-10-10。目标：直接集成 main，不创建额外分支、worktree 或替代网络驱动。

## 事实与归因

- 当前 main 的 Demo 场景 06 将 URL、通道及重置默认设置为本地 HTML + 网页 Fetch；SDK 能力虽存在，但测试初始路径没有真正覆盖 SDK 的第三方网络请求。
- 既有 axiosx 执行链的公开契约为 MAIN 页面 `OpenDeskSDK.axiosx.get/post`，独立 Worker 是另外的执行身份。受信 `NetworkService` 已负责凭据省略、目标授权、响应处理和状态保留，未发现需要增加一个网络驱动的证据。
- `E_SDK_NOT_INSTALLED` 指当前 document 没有网页 SDK，不能当作 HTTP 请求失败或绕过真实授权的理由。
- 原 `basic-browser-axiosx.test.mjs` 把错误的默认 Fetch 视为合法，主干 HTTP CI 又遗漏该测试；均属于回归防线不足。

## 修改合同

- 默认：SDK axiosx + `GET https://httpbingo.org/get?source=opendesk`；重置恢复同一个默认；页面加载、示例切换与重置永远不主动发送网络请求。
- 增加公网 GET/POST/429/500/延迟示例，POST 预设只更改 Method 和表单，保留现有同源测试资源及 Fetch 对照。
- 缺少 SDK 时在任何 HTTP 请求发出前展示准确目标 Origin 和扩展精确 document、network 的批准安装路径，HTTP/耗时显示未发送；缺少 SDK **不回退 Fetch**。
- SDK 非 2xx 的响应继续展示 status、headers、response 和原始错误，超时/撤权/其他权限错误保留类型；迟到 SDK 结果继续只丢弃展示，不伪称已取消底层 HTTP。
- 不改权限协议、SDK 公共 facade、网络驱动、用户签名任务源码、历史原始证据，也不创建新的服务或依赖。

## 证据/独立审计

| 维度 | 可验收事实 | 当前标记 |
| --- | --- | --- |
| 产品正确性 | 默认/重置 SDK + 公网 GET，Fetch 仅对照 | 需主干 CI 验证 |
| 浏览器安全 | 明确受信批准 network 和精确目标 Origin，缺 SDK 不发送/不降级 | 源码审计完成；Native 待验 |
| 响应保真 | HTTP status、headers、4096 UTF-8 字节文本预览、异常码 | 原有实现保留；Native 待验 |
| 生命周期 | 预设/切换/reset 无请求，旧响应不可覆盖新状态 | 回归已补；Native 待验 |
| 防回退 | 主干 CI 运行页面 + axiosx 场景回归 | 需在线 CI 回执 |

反方验收门槛：任何绕过授权的自动安装、Fetch 冒充 axiosx、仅靠 mock 状态宣称第三方网络成功、不同 HEAD 的 Native PASS 迁移，都直接判为不合格。95+ 只能在同一最终候选真实 Chrome 授权、网络、UI、失败路径的证据闭环后认定；静态检查与 CI 不能代替。

```sh
node --test tests/environment/basic-browser-page.test.mjs tests/environment/basic-browser-axiosx.test.mjs tests/environment/basic-browser-http.test.mjs
node --test tests/framework/k4-sdk.test.mjs tests/framework/k2-sdk-cross-origin-broker.test.mjs tests/framework/k4-network.test.mjs
npm run check
```

运行时如看到 `E_SDK_NOT_INSTALLED`：先检查网页是否由标准本地 HTTP 入口提供，并在扩展的「独立网页 SDK」中选择当前准确 document；勾选 network、额外 Origin `https://httpbingo.org`，使用真实用户手势批准并安装后重新点击发送。单独测试 Worker 可使用 `examples/tasks/http-worker-axiosx-draft.js`，其证据不代表 MAIN 页面 SDK 注入成功。
