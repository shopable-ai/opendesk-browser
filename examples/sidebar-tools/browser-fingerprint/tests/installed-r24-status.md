# Browser Fingerprint R2.4 — 正式安装验收阻断记录

> 以下为早期历史状态，已被 [R2.5 归因与结果](r25-last-mile.md) 和 [实际证据](r25-evidence.json) 更新。2026-10-29 同候选 Linux 安装全链已 PASS；Mac 原生安装仍因 CFT 文件选择框崩溃 NOT_TESTED。不要重新排查下文已解决的安装入口问题。

时间：2026-10-29。状态：**CHROMIUM_INSTALLED_FULL_CHAIN = BLOCKED**。

## 原始产品目标
正式安装 OpenDesk Browser Fingerprint 0.2.2，从正式 React 应用选取美国/德国/日本/自定义环境，保存并应用到当前已授权 Chrome Tab。经可信 SDK/Host 调用原生 CDP，独立读取目标网页 MAIN 世界的 UA、UA-CH 低熵平台、语言、时区和视口。停止后再独立验证恢复。不得冒充公网 IP、真实 OS、物理屏幕、Chrome Profile 或防关联能力。

## 已验证、无需重复开发
- `tool.config.json` 0.2.2 含 `browser.fingerprint.control`。
- App CI 候选包 88599 bytes；SHA256：
  `ed80ae800e486b862393aac6f308f77046c7c9d03e598014ab8084f640515d95`。
- WXT Manifest 含非 optional `debugger` 权限；生产 Host 构建有 `Emulation.setUserAgentOverride` 和 `Emulation.setTimezoneOverride`。
- R2.3 原生驱动（隔离测试扩展）通过美/德模拟、独立 JS 读回和恢复；既有 Node、React BUILD、React Chromium 预览 PASS。
- 仓库正式可安装 `browser-fingerprint.opendesk-tool.json` 仍是旧 0.2.1。未晋升 0.2.2，未发布 Catalog。

## R2.4 实际 Chrome 阻断（不是指纹产品失败）
新增 `tests/installed-r24.mjs` 为正式安装候选包验收测试，但没有获得全链路 PASS：

1. Chrome for Testing 155 / Linux Xvfb 可加载 WXT、SW、候选包，真实 SIDE_PANEL Context 可打开。
2. 对真实 Side Panel 的 CDP 鼠标和 Enter 输入未成功切换 `My → Extensions`；仍是 My Tab，扩展中心不可用。
3. 单独打开正式 `sidepanel.html?hostInstanceId=...` 扩展页面，显示“本地任务目录”，不是物理 Side Panel 的业务页面。独立记录视口 1050×861，`#tab-tools` 存在但布局矩形 `0×0`，不能作为替代 UI。
4. 因此全部尝试止于正式安装审阅**之前**；证据标记 `installedOpenDeskHost=false`、`installedReact=false`、`cycles=[]`。不能据此断言正式 Host 或指纹 CDP 执行器故障，也不得把隔离驱动 PASS 写成正式安装 PASS。
5. `MAC_CHROME=NOT_TESTED`。HTTP Accept-Language 网络证据仍 `UNVERIFIABLE`；地理位置 `UNSUPPORTED`。

代表性失败回执：
- [R2.4 / sidepanel input](https://github.com/shopable-ai/opendesk-browser/actions/runs/40884704069)
- [R2.4 / real panel navigation](https://github.com/shopable-ai/opendesk-browser/actions/runs/40885458145)
- [R2.4 / catalog instead of panel](https://github.com/shopable-ai/opendesk-browser/actions/runs/40887479651)

## 只继续剩余阻断
1. 先准备可真正操控 **Chrome 物理 Side Panel** 的 GUI 验收入口（例如可信 OS 层键鼠、真实 Mac Chrome），检查原生 `isTrusted` 交互，不能模拟授权或预写 Grant，也不能跳过正式安装审阅。不要再重复源码预设、React、SDK、CDP 驱动。
2. 使用 0.2.2 **真实候选包**按官方流程导入安装，证明安装身份、Debugger 权限、单站点授权、Host 操作结果，再做 **美国和德国**两轮独立 JS 网页读回与停止恢复。
3. P2 完成后验证切 Tab/导航撤销、停用/卸载/更新清理、调试器断开、`restore_unknown` 不重试，和 `restored_limited` 的来源约束。
4. 仅全部通过后执行既有 candidate→release 晋升门禁；不得手改旧包版本或提前发布 Catalog。
5. 实验脚本 `installed-r24.mjs` 保留供下一轮精准修复，但不再挂到必过 App CI；主线保留原已稳定 React Chromium 预览测试，不能把未跑通的 CI 误计为功能 FAIL 或 PASS。
