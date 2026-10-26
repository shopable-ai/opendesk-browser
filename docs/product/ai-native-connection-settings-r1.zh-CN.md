# OpenDesk Browser · AI 来源与本机连接设置 R1

> 状态：**MAIN 源码实现已提交；完整真实浏览器验收 NOT_TESTED**。该文档记录当前唯一交互合同与验收入口，不建立第二套 Native / Provider / Host，也不把静态视觉稿当作可运行产品。

## 1. 原始目标与使用者任务

原始业务目标：用户在多个可信 AI 对话入口点击齿轮后，**直接知道本机 OpenDesk 过去是否连接成功、当前是否在线、是否启用**；不必每次跳到 `native-agent/settings.html` 才能知道是否需要重新配置。独立设置页精简排版，最常用的操作处于第一屏；高风险授权和技术诊断保留可信边界。

完成定义：

1. 在统一 `AI 设置` 中切换「本机 Codex / HTTPS 模型」，选择本机 Codex 时显示真实 Native 连接状态和 **Switch**，有「重新检测」「高级设置」。
2. **Switch 控制启用意愿，不是“已连接”指示灯**。启用后的在线 / 离线 / 握手中 / 需重载分别显示；权限拒绝或状态读取失败不得伪装成功。
3. 已有合法授权与有效连接时打开弹窗，直接看到「已连接」，无需重复配对；当前离线时可看到之前的握手时间（若存在），明确过去成功不等于现在在线。
4. 首次启用才走 Chrome 原生可选权限 `nativeMessaging`；没有用户手势不得自动申请或启用。关闭连接不要求取消所有 Chrome 权限。
5. `取消 / 保存 AI 设置` 只管理 AI 来源、HTTPS Endpoint、模型和当前会话 API Key；**连接 Switch 即时生效**，不会因为点击「取消」回滚或重新执行任何任务。
6. 独立 `本机连接` 页仍由 `manifest.json` 的 `options_ui` 打开，用于首次配对、原生诊断、文件工作区与可选统计；不能成为普通查询连接状态的必经跳转。

## 2. 现行入口与文件所有权

| 入口 | 唯一所有者 | 负责范围 |
|---|---|---|
| 多业务 AI 对话的齿轮 | `src/ui/react/components/provider-settings.tsx`（由 `app-shell.tsx` 挂载） | AI 来源选择、连接状态卡、Switch、重新检测、按需进入高级 |
| 可信 Side Panel 与 Native 状态桥 | `src/ui/tool-shell.js` | 调用同一 `AGENT_CONFIG_PROTOCOL`，权限请求从可信手势同步开始 |
| Native Agent 状态与启停 | `src/native-agent/service-worker.js`、`protocol.js` | 唯一真实状态、持久启用位、Host hello/welcome、受信发送者鉴权 |
| 独立 Options 页面 | `src/native-agent/settings.html` / `settings.css` / `settings.js` | 状态在首屏、开发诊断默认折叠、工作区入口、统计显式同意 |
| 文案与语言 | `src/i18n/locales/*`、`src/i18n/index.js` | 复用当前语言注册表；协议字段和原生授权不翻译 |

仓库：`shopable-ai/opendesk-browser`，唯一允许写入分支 `main`；本机目标目录 `/Users/shopme/Documents/workspace/opendesk-browser`。不创建分支、worktree、PR 或第二套服务；与并行对话已完成的功能去重。

## 3. 状态与显示语义

| 真实状态 | AI 弹窗 / Options | Switch | 用户下一步 |
|---|---|---|---|
| `enabled=false` | 未启用；如有历史时间标注上次连接 | 关 | 需要时启用 |
| `enabled=true, connecting=true` | 正在连接 | 开 | 等待有限次刷新；不要重复配对 |
| `nativeConnected=true` | 已连接 | 开 | 可返回 AI；Codex 能力在实际发送时另行校验 |
| `enabled=true, nativeConnected=false` | 已启用 · 当前离线 | 开 | 检查本机程序或重新检测 |
| `requiresReload=true` | 需要重载扩展 | 开 | 完成正在运行的任务后重载，避免中断 |
| 状态接口失败或回执不合法 | 连接状态未知 / 无法确认 | 禁止新切换 | 明示错误并允许重新检测 |

`lastConnectedAt` 是 **本机浏览器存储中记录的最近一次 Native Host `hello` 与 `welcome` 交互时间**。未记录过为 `null`，**不能倒推未曾配对**；有时间也只说明曾有连接握手，不代表目前在线、Codex 推理已可用或网站权限已批准。不向页面脚本、任意扩展或第三方 HTTPS 模型暴露这项状态。

原 Native 状态查询可在“已启用且端口断开”时发起有限的原生重连发现，不触发 Chrome 权限申请、网页访问、文件操作、业务 RunHost 或任务重放。

## 4. 页面结构与信息层级

独立页面从上到下：

1. 页标题 `本机连接`、单一语言入口、简短用途。
2. 主连接卡：`OpenDesk` / Switch、真实状态主文案、故障解释、重新检测。
3. 本地文件工作区：仅提供入口，不在设置页引入文件访问。
4. `开发版配对与诊断`：原生身份、扩展 ID、登记数量、失败和配对操作，默认折叠。
5. `使用统计（可选）`：简短说明、完整原披露展开区域、**独立的明确同意选择**；不因本机连接开启而默认同意或扩大披露范围。

使用原 Token、既有 React/UI 组件、焦点和键盘语义。需以 320 / 360 / 400 / 440 / 720px，以及浏览器 200% 缩放实际审查。页面自然滚动，不引入二级 Nav；连接态与诊断详情是两级信息，而不是两个同级设置入口。

## 5. 安全与兼容红线

- 共享 Native 管理消息只接受当前扩展的受信 Options 或**有效顶层 Side Panel 文档**（sender.id、严格 document URL、documentId、frameId 约束）；未知发送者一律 `E_OWNER`。
- 安装工具 iframe、任意网页、content script、不同 Extension ID、内嵌 frame 与 URL 伪造不能启停 Native。Scheduled runner 等非交互上下文不能取得本机连接管理能力。
- Chrome `permissions.request({permissions:['nativeMessaging']})` 必须在真实 Switch 交互调用链的首次异步等待之前发起；拒绝后读回真实状态，**不在未知结果时乐观将 Switch 固定为开**。
- 不改 Codex Planner、HTTPS Provider 契约、AI 来源保存规则、原 Native 端口、RunHost、Authority、Worker、持久业务结果、现有安装身份或原统计授权版本。
- 关闭/打开设置弹窗、切换 AI 来源、检测连接均不能自动运行、重放或批准任何网页操作。权限撤回、Host 断开、标签关闭等事件的受控中断应保留。

## 6. 定向验收（每项独立记录）

| 测试 | 要观察的事实 |
|---|---|
| 组件 / 协议回归 | Node 定向测试保证当前 Side Panel 可读/启停，非受信来源拒绝，现有 Options 不退化 |
| 状态持久与撤权 | 禁用、重启 Worker、Host 断开、重新握手后真实状态与历史时间互不混淆 |
| Options Chromium | 真实 `isTrusted` Switch 事件，Chrome 可选权限弹窗，授权后读回、拒绝恢复 |
| 共享 AI 弹窗 Chromium | 在多个真实 AI 对话入口打开齿轮，直接看到状态，使用 Switch、重新检测、按需高级设置，返回后当前草稿保持 |
| 隔离与安全 | 自定义工具 iframe / scheduled runner / 外部页面无法发管理消息；无任务投递、权限扩权、凭证泄露 |
| 视觉与无障碍 | 320/360/400/440/720px、200% 缩放、浅色、键盘、焦点恢复、ARIA Switch、语言切换及长错误文案 |

**不得把 Node PASS、构建 PASS、GitHub 更新回执、静态预览等同于真实 Mac Chrome PASS。** 尚未拿到同候选真实浏览器证据时保留 `NATIVE_CHROME=NOT_TESTED`、`SHARED_DIALOG_CHROME=NOT_TESTED` 和 `RELEASE=NOT_TESTED`。

## 7. 独立专家评分标准

各维度独立满分 100，综合分只用算术平均（不累加）。设计目标：任务闭环 ≥95、信息架构 ≥95、状态语义 ≥95、权限安全 ≥95、可访问性 ≥95、响应式视觉 ≥95、可验证性 ≥95。**评分是专家设计评估，不是生产环境验收回执**；凡缺少运行证据的维度应明确写“待实测”，不能以目标分充当已获得的分数。

首次接手者只读核查最新 `main` 与已有证据，先运行最短真实用户链，再最小修复剩余差异。禁止从零重建页面/Native/AI Provider；只修未通过项，并更新本文件中对应验收状态。
