# OD-AI-PROXY-PREVIEW-TO-PRODUCTION-R2 · 差异映射与验收边界

- 仓库：`shopable-ai/opendesk-browser`，唯一分支 `main`
- 唯一设计参考：`projects/ai-proxy/preview/preview.html`（既有提交 `9b1e7e53a894560d967db3099337cb979b84d3fe`）
- 本轮目标：在既有正式 React App 中同步网络诊断的视觉语言、按钮与状态；不复制 HTML 模拟服务，不改 Host/SDK/代理授权。
- 本轮源代码提交基线：`7f2aa3ab8a2c819c1b04c5969b7c60273d5a8169`（正式诊断 React、规则入口、主 CSS、三语、定向测试）。本文件、PC CSS 补充及 README 以所在提交为准。

## HTML → 正式组件差异映射

| 预览交互 / 视觉 | 正式 owner | 本轮结果 | 边界 |
| --- | --- | --- | --- |
| 浅灰蓝诊断标题、左品牌线、白色未验证卡、当前所选线路 | `src/ui/DiagnosticsPage.tsx` + `src/styles/options.css` + `src/styles/management.css` | DONE（源码） | 未验证不渲染成功状态；尚无当前 Chrome computed style |
| 五个诊断子页面、可键盘切换的 Tab | `DiagnosticsPage.tsx`、`optionsRoute.ts` | DONE（复用五个现有页面）；样式更新 | 未执行真实 Chrome 点击验收 |
| 概览、AI 网站、关键网站 Top5/10、测速、基础诊断 | `DiagnosticsPage.tsx`、`UsageControls.tsx`、`service.ts` | PARTIAL | 正式 HTTP 检测、诊断收藏、使用统计和测速能力尚未接入，不借模拟数据装作有效 |
| 「查看全部／检测／取消／收藏」等次级按钮 | `DiagnosticsPage.tsx` + `options.css` | PARTIAL | 可导航入口有明确边框与 Hover/Focus；未接入的业务按钮主动禁用并说明 |
| 「切换到按规则」 | `Settings.tsx` | DONE（源码） | 只发送显式 `SELECT`，与 `APPLY/STOP` 独立；真实交互待测试 |
| 代理列表四个 Icon | `Settings.tsx` + `sidebar-settings.css` | PARTIAL | 核查到选择、编辑、删除三个真实操作；未找到独立「收藏」能力，本轮不伪造状态或存储 |
| PC 设置七区 / Side Panel 统一状态 | 原 `App.jsx`、`Settings.tsx`、`QuickPanel.tsx`、`environment.ts`、`service.ts` | DONE（原结构保留），R2 回归 NOT_TESTED | 未重建第二状态机、Header Action Slot 或权限 API |
| 来源编辑按钮缺少可见边框 | `options.css` 的 `.sourceEditorHead button` | DONE（源码） | 测量及颜色对比度尚未验证 |

## 真正的能力边界

`src/service.ts` 的 `previewOnly()` 在 `preview === false` 时对 `GET_DIAGNOSTICS`、`RUN_DIAGNOSTICS`、收藏和使用统计返回 `E_NOT_CONNECTED`；仅隔离预览使用内存模拟，并产生标记模拟的失败观测。本轮正式 React 不再把预览特有的「模拟成功/可点」表现当成运行能力。真实 `Status` 组件读取 Chrome 的代理状态，手动 `PROBE` 是扩展请求，不能证明标签页流量、AI 登录或模型可用。

本轮没有修改 `service.ts`、`environment.ts`、任何 Browser Framework/Host/SDK、代理 APPLY/STOP、安装权限、持久化 ETag、草稿、unknown 保护或实际 Chrome Profile。正式安装包仍是先前的 0.3.15 候选；**当前源码领先于正式安装包**，后续需要按原打包流程处理并验证同源。

## 证据分级与待验任务

| 项目 | 本轮结果 |
| --- | --- |
| GitHub `main` 源码写入与回读 | DONE（见本轮两个提交） |
| 通过源码检查唯一 Service 的 preview / production 分支 | DONE |
| 新增 `tests/diagnostics-ui-runtime.test.mjs` 回归测试 | DONE（文件已写入，**执行尚未证实**） |
| `npm --prefix projects/ai-proxy test` | NOT_TESTED：本机 CodexPro / Mac 工具连接不可用，本环境无法访问 GitHub 或本机依赖 |
| `npm --prefix projects/ai-proxy run build` | NOT_TESTED：同上；GitHub Actions 的当前任务需以运行完成后的回执为准 |
| 1200 / 900 / 680 / 390 / 320px 与 200% 缩放、computed style、WCAG AA | CHROME_NOT_TESTED；不提供伪截图 |
| Chrome 正式包安装、真实代理请求/控制权/回读与 Side Panel-PC 同步 | CHROME_NOT_TESTED |
| 旧测试回归与其他并行改动 | NOT_TESTED，不因历史 CI 或候选成功推断通过 |
| 包候选、原打包器同源晋升、唯一 JSON 更新 | NOT_TESTED / PACKAGE_OUT_OF_DATE_WITH_SOURCE；禁止未经门禁直接修改 JSON |

## 后续只做差量

1. 等待与当前提交绑定的 GitHub App CI 真实回执；若失败按源头区分本轮测试 / 旧失败，最小修复。
2. 在可用的本地 Node/Codex 工作区运行项目测试、Vite 构建及新增回归，记录结果；必要时修复 R2 引入的缺陷。
3. 使用真实 React 工作台完成各宽度、200% 与键盘、颜色、弹性布局实测；截取真实截图及 computed style，不把 HTML Preview 当验收。
4. 通过旧打包器候选校验、晋升及同源核查更新唯一正式 JSON，在隔离 Chrome Profile 经授权安装、验证两 Surface 与真实 Chrome 状态。
5. 诊断真实 HTTP、收藏、统计、测速是更大能力缺口；没有批准的网络授权/合法 SDK 时保持 BLOCKED，不在本视觉同步任务里造第二套能力。

## 审查与评分规则

UI、UX、前端工程、可访问性和 QA/安全必须各自按 100 分独立评估，算术平均值而非累加。**没有 Node/Chrome 真实证据前，不给本轮宣称 ≥95 的最终评分。** 至少在相同冻结候选的 Chrome 视口实测和安全回归证据齐备后，才填写正式专家得分；不能沿用旧版评分。
