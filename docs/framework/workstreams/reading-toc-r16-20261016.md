# Reading TOC R1.6 · 2026-10-16 实证与剩余验收

> 本文的测试结论**只对明确标注的 Commit/Actions 成立**，不自动适用于更晚的并行 `main`。禁止以离线预览或 Linux Chromium 冒充用户 Mac 原生验收。

## 正式发行

- 工具：`reading-toc`，正式包 v`1.0.7`，`examples/sidebar-tools/reading-toc/reading-toc.opendesk-tool.json`。
- 已核验源包与构建生产包完全相同，大小 **17,574 B**，SHA-256：`3d5ac0b4ca7bace06c4d4c013e5366b6e21ccc71c6ce92558a191ccd1f7a4573`（Actions `38883411105`）。
- 官方 `reading-kit` 新增 revision **6**，分别固定阅读目录 `1.0.7`、网页剪藏 `1.0.1`、网页笔记 `1.1.9`。Revision 1–5 不改写；固定历史版本没有被升级为当前包。
- 本轮仅调整安装市场集合及验收代码，Reading TOC 的 `src/`、`src/reading-toc/` 和两份已存 HTML 从 R1.5 Native 基线至当前校验点源码摘要未变。用户数据、`installEpoch` 和撤权语义未改。

## 已取得的真实证据

| 候选 Commit / Actions | 范围与实际结果 |
|---|---|
| `b3ee5d79` · [R1.5 基线](https://github.com/shopable-ai/opendesk-browser/actions/runs/38873689396) | 阅读定向 67 PASS；Chrome Native 1 PASS；Chromium 双预览 1 PASS；宿主 95 PASS。工作流整体 FAIL，不是完整绿灯。 |
| `791a1de1` · [R1.6 定向](https://github.com/shopable-ai/opendesk-browser/actions/runs/38883411105) | 阅读定向 **67/67**、发行定向 **2/2**、生产及开发构建通过、真实 Chrome Native **1/1**、Chromium 交互预览 **1/1**、Side Panel 宿主 **95/95**。全仓 Node **3263 PASS / 7 FAIL / 12 SKIP**，其中 Reading TOC 新增发行断言已通过。 |
| `f1c10ee8` · [市场跨平台回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/38885930109) | Ubuntu 与 GitHub 托管 **macos-15** 的真实 Chrome HTTP 市场 E2E 分别 **1/1 PASS**。包括首次安装、受控旧版本升级、撤权、Worker/浏览器重启、卸载恢复的市场主链路。仅是受控旧版本 `0.0.1`，不冒充历史发行包 `1.0.4` 升级。 |
| `faaa9bcb` · [官方市场生产回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/38890565201) | 经身份校验的 Time Review 可信内置 UI 验证已成功推进至后续工具；生产 Chrome 阻断定位为 **Stay Focus `E_FOCUS_SENDER`**，不属于 Reading TOC。仍不得标记整体 CI PASS。 |

R1.6 变更：`791a1de1`（集合 rev6 与 R5 回归）、`c58ebe03`（旧 R3 最新集合假设）、`c852cec3`（开发语言预处理夹具）、`fe80ca1d`（安装列表测试状态）、`34ec58e3`（Reading TOC 默认网站可用语义）、`f1c10ee8`（真实键盘重连）、`faaa9bcb`（可信内置 UI vs 沙箱的原生测试）。这些测试修复**没有扩大工具授权范围或绕过撤权**。

## 双 HTML 源码身份

- `preview/reading-toc-r12-interactive-preview.html`：SHA-256 `8cf6704a66271d49077cef4f448df007ecfd4f2a0d2b64d38d5a1a726f8c5f3f`。
- `preview/reading-toc-r12-overlay-preview.html`：SHA-256 `fa5ac0a6826d5410886322b629716197ed8bad259533d1d36a4fa963c28f5ba6`。
- 两份预览内嵌 UI SHA-256 均为 `e88fe1c02467473c215b94a13900427a15b86d5f1ad3c7bccfae744b077c9f8f`，与正式工具包计算结果相同。原存预览 `sourceCommit` 是 `0e105aec`，不等于最新 HEAD；CI 从 `791a1de1` 重新生成预览，实际 Chromium 交互通过。离线模拟不能代替真实安装。

## 仍未关闭的边界

1. **用户 Mac：NOT_TESTED。** GitHub 托管 macOS PASS 不等于用户安装升级验收；需要真实 Mac 开发版 Chrome 验证同 ID `1.0.4 → 1.0.7`、语言/模式/来源/站点例外/位置数据保留，以及真正卸载后的权限与数据清理。
2. **线上站点：NOT_TESTED。** Chrome fixture 中的多 AI 回答、重复 H2 与 SPA 回归已通过；真实登录 ChatGPT、知乎不是这份自动化通过的证据。
3. **共享市场生产 E2E：FAIL（独立模块）。** `Stay Focus` 在安装审阅后返回 `E_TOOL_RUNTIME_UNAVAILABLE / E_FOCUS_SENDER`。应交由对应模块核对服务身份链路，不能删除预检或伪造成功。
4. **已观察到的交互风险：** macOS 市场帮助页底部重连控件可能被默认网页悬浮目录遮住。真实 Chrome 键盘聚焦并 Enter 重连已 PASS；鼠标遮挡本身尚未从产品 UI 层根治，不应作为视觉/操作体验 ≥95 的证据。
5. **六维独立 95+ 尚未评定。** 视觉与操作效率存在上述实证风险；完整 Mac 产品升级及键盘无障碍矩阵未覆盖前，维度评分应标记 `NOT_TESTED`，不能假设综合或各维 ≥95。

## 下一步最小验收

在最新 `main` 先运行 Reading TOC 专项 CI 的 Node/Build/Chrome Native/双预览；保留既有 `installEpoch` 撤权验证。Mac 本地用受控测试 Profile、安全原位升级并截图逐项读回偏好，禁用/恢复后再测试卸载清理。其他 Agent 的独立问题单独处理。
