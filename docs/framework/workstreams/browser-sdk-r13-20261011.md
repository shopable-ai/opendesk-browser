# OpenDesk Browser Browser SDK R1.3 实施工作流与 R2 网络观察冻结合同

日期：2026-10-11。仓库 `shopable-ai/opendesk-browser`。原执行环境不能访问用户 Mac 本地工作目录，GitHub 远端仅在隔离分支 `agent/browser-sdk-r13-20261011` 安全提交；**不得将该分支提交冒充 main 或本机验收**。

## 这轮真实写入的增量（源码，不等于验收通过）

- `src/framework/sdk/browser.js`、`browser-contract.js`：受控 `OpenDeskSDK.browser` 便捷 API 与操作描述，Page 仅本地查询状态，**不扩大**旧 `ADMITTED_METHODS`。
- `src/framework/sdk/entry.js`、`src/sidebar-tools/bridge.js`：分别在原 SDK 冻结前和工具 sandbox 初始化时挂载 Browser API；`OpenDeskTool.request` 等保持原入口。
- `src/ui/sidebar-tools/package.js`、`installation.js`、`scripts/build-sidebar-tool.mjs`、`src/sidebar-tools/official-catalog.js`：v1 保持严格，v2 菜单贡献、浏览器能力、包序列化与卸载/升级撤权。菜单授权绑定安装包规范摘要，避免同版本任意替换复用授权。
- `src/platform/chrome/context-menus.js`、`src/sw.js`：菜单同步器；同步注册 Chrome 原生监听、独立异步执行；按安装/更新/删除/权限与导航事件协调菜单、每工具一次性票据与验证。
- `src/ui/sidebar-tools.js`、`src/ui/tool.html`、`src/ui/tool-shell.js`：工具详情按钮、受控调用、原生点击后的 Side Panel 工具定位和唯一实例领取。
- `examples/sidebar-tools/browser-sdk-r13/`：选区保存 JSON、能力查看 JSON、普通网页拒绝示例、手动使用说明。
- `tests/environment/browser-sdk-r13.test.mjs`：合成 Chrome API 安全/生命周期回归，**不能提升为原生 PASS**。
- `docs/api/browser-sdk.zh-CN.md`、`browser-capability-universe.zh-CN.md`：接口目录与 18 领域能力树。

## R2 网络观察冻结合同

```text
OpenDeskSDK.browser.network.observe.*      仅未来授权已安装工具
       ↓ 原工具 request + 宿主受控 RPC
src/platform/host/network-observation.js  R2 新增：授权会话、身份、限额、存储
       ↓ 可信且有界的观察驱动
src/platform/chrome/network-observer.js   R2 新增：webRequest 事件、Origin/Tab 过滤
       ↓
chrome.webRequest.onBeforeRequest/onCompleted/onErrorOccurred
```

- 主动 HTTP 原服务**不重写**：`src/platform/chrome/network.js`、`src/framework/sdk/http.js`、`src/framework/sdk/registry.js`、`src/platform/host/sdk-broker.js`、`src/platform/host/controller-network-scope.js`。Controller 与 `axiosx` 保持旧语义。
- 首次仅支持用户明确开启的**单个普通 HTTP(S) 标签页**和已核准的目标 Origin；使用不扩大范围的 `tabRef`、来源 `documentId`、工具身份、网站授权、`webRequest` 可选权限。权限获得必须从工具详情可信点击开始，不能后台自动申请。
- 冻结接口：
  - `browser.network.observe.start({tabRef,origins,durationMs=30000,maxEvents=500,maxBufferedBytes=524288}) → {observationId,expiresAt,status}`
  - `browser.network.observe.getStatus({observationId}) → {state,observedCount,droppedCount,gapCount,expiresAt}`
  - `browser.network.observe.stop({observationId}) → {state,stoppedAt}`
  - `browser.network.observe.export({observationId,format:'json'}) → {resourceRef,bytes,truncated}`
  - `browser.events.read({sessionRef,cursor,limit}) → {events,nextCursor,droppedCount,gapCount}`
  - `browser.events.close({sessionRef}) → {closed:true}`
- 每个事件只输出序号、时间、经脱敏的 Origin/URL、HTTP 方法、类型、状态码、耗时及完成/失败标志；默认**不采集** Cookie、Authorization、任意头字段、请求正文、响应正文、WebSocket message body；敏感查询参数按允许名单输出或只保留 Origin。
- Chrome SW 冷启动/崩溃、队列溢出、权限撤销、标签关闭、导航以及页面进入非活动生命周期，**必须**停用观察并向状态记录 `gap` / `droppedCount`；不保证无缝 HAR，不默默回填错过事件。同步注册 webRequest 监听，异步授权会话复核；监听器早期事件在未恢复会话前**丢弃并计 gap**，不回放。
- 观察 session/token、可见状态与操作回执需绑定工具包摘要、安装/撤权代际及站点权限的最新快照，超时/明确 stop 以后不可继续导出新敏感数据；操作结果未知时只读核对，不重发有副作用 start。
- DNR 独立授权；R2 不支持流量修改、任意 CDP、全局代理、完整 HAR、TCP/UDP、隐式站点凭证。

## R3 预留职责（不创建假实现）

- `browser.screenshot.captureVisible`：复用 Controller 现有截图与精确目标验证，后续授权给工具另需确定可见 Tab 身份。
- `browser.media.recording.*`：前台媒体源选择与用户手势，受控录制会话、停止、弃用、大文件分块引用；区分 tab/window/desktop。
- `browser.speech.*`：分别处理 STT、TTS 和语音控制，录音与远端提供者的授权独立；R1.3 不实施语音产品。
- 未来接口只有真实 Host 代码、声明权限和正/负测试齐全后才从 `PLANNED` 晋级 `IMPLEMENTED`。

## 验收阶段与阻塞

| 层级 | 目标 | 当前可声称的结果 |
| --- | --- | --- |
| 源码提交 | branch 上安全增量、无强推远端 main | 已提交隔离分支；提交 SHA 以分支最新 HEAD 为准 |
| R1.3 定向测试 | `node --test tests/environment/browser-sdk-r13.test.mjs` 以及旧 v1/官方 Catalog 兼容 | **NOT_TESTED（等待同候选 CI/本地日志）** |
| 静态检查 | `npm run check` | **NOT_TESTED** |
| 生产/开发构建与 verify | `npm run build; npm run build:dev; npm run verify` | **NOT_TESTED**，已知 main 历史生产 SW 超出 327,680 字节硬限，不得放宽 |
| Chrome 原生右键菜单 | 实际 macOS CFT 打开选区、首次授权、自动打开、领取、保存 | **NOT_TESTED** |
| 极端导航竞态/Worker 复苏 | 菜单点击与同 URL 替换、撤权时无选区泄露，Worker 恢复无重复菜单 | **NOT_TESTED** |
| 原 Controller/Page 回归 | Authority、SDK 旧协议、知识收件箱/剪藏/目录正常 | **NOT_TESTED** |

### 本地 Mac Chrome 真实操作最小核验

1. 先从隔离分支取得完全相同的源码，不覆盖本地其他 Agent；`git status` 审核并锁定测试端口/Profile。
2. 执行 `npm ci --ignore-scripts`（仅当前 lockfile）、`node --test tests/environment/browser-sdk-r13.test.mjs`、`npm run check`，再执行相关既有环境回归，发现失败立即修复。
3. 严格执行 `npm run build`、`npm run build:dev`、`npm run verify`，记录 SW 物理字节和 dist 的 SHA；预算失败时停止宣告安装候选成功。
4. 受控 Chrome `chrome://extensions` 加载**相同候选** `dist/production/`，导入 `examples/sidebar-tools/browser-sdk-r13/selection-notes.opendesk-tool.json`，允许指定 HTTP(S) 站点。
5. 真实手点工具详情右键菜单开关，观察 Chrome 原生权限；选中文字，Chrome 右键菜单选择「OpenDesk Browser → 保存到选区笔记」，确认自动打开工具、选择可见、再次领取被拒绝、点击“确认保存”后重开能读本机记录。
6. 验证升级同版本不同内容、卸载、跨工具冒用、不同网站、Chrome 权限撤销、Worker 冷启动与整个 Chrome 重启的菜单状态；对导航/重复消息/未知回执保留原始结果。
7. 记录 `HEAD`、包哈希、Chrome 版本、真实 profile/PID、权限快照、截图或录像、console 错误与每个测试的 PASS/FAIL/BLOCKED/NOT_TESTED；不把模拟/静态核查冒充真实 Chrome 结果。
