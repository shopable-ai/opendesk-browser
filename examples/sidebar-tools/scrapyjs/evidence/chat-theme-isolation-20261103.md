# 公共 Chat 主题隔离：2026-11-03

状态：`SOURCE_COMPONENT_PASS / BUILD_PASS / PACKAGE_PASS / NATIVE_CORE_PASS`，均绑定下列 1.8.17 候选。本次处理 T1/T2 中已证实的外观差异，未完成 T1/T2 整项，不进入 T3/T4 正式验收或评分。收尾出现并行源码改动，当前源码已超出该候选构建回执，见末节。

用户反馈：在「扩展」右上角点击 AI 后，显示不像通用 AI Panel，要求按专家判断完善。目标是让原工具中的公共 Dock/Frame 保持框架外观，采集业务继续可用。

## 原因与修复

- 正式 `src/main.jsx` 已接公共 `SharedConversationDock` / `SharedConversationFrame` / session；Frame 和 Dock 自带公共样式，未发现需补一套 Chat 的证据。
- 原 `src/style.css` 的主题 scope 是整个 `.scrapyjs-workspace[data-theme="light"]`，包含业务和 Chat；自定义语义 tokens 与 `:focus-visible` 规则影响了公共输入和发送按钮。
- 在真实 App 与真实公共组件的同窗渲染中，修复前工具 Chat 输入背景为 `rgb(247,248,250)`、发送和输入焦点为 `rgb(54,94,218)`；公共对照输入为 `oklch(1 0 0)`、发送为 `oklch(.205 0 0)`、输入焦点为 `oklch(.708 0 0)`。
- 将原主题 scope 收窄到 `.capture-business`，在该业务容器重新应用原公共主题类，使业务语义别名在本地解析。Chat 保持外层框架主题。原占位的显示规则移出业务 scope，仍只有占位，无发送能力；固定预览三件套未重建或覆盖。
- 未修改公共组件、框架布局、高度管理、来源/设置、请求状态机、配置修改或采集逻辑。

## 本次验证

| 检查 | 结果与范围 |
| --- | --- |
| Chromium 155 真实组件渲染 | 修复前复现差异，修复后输入和发送按钮的背景、文字、边框、圆角、字号、焦点色及焦点偏移共七项计算样式与同一公共组件相等；采集开始按钮七项样式与原源码相等，页面错误 0 |
| 原 `ai-app.test.mjs` / `ai-panel.test.mjs` | 39/39，通过原页头展示事件、保持业务挂载、收起重开草稿、unknown/取消/迟到返回等现有场景；fixture 不证明原生设置或真实 AI |
| 原工具 Vite 构建 | PASS；仅生成工具 `dist/`，不编译 Browser。原引擎三条 PURE 注释位置警告不阻塞构建 |
| 原 `app:update` | 原包门禁 8/8，候选 → 晋升 → 同源检查通过；随后通过原可信安装审阅原位更新 |
| 包身份与授权 | 对照 Git 基线包，ID、格式、capabilities、requires、contributes、delegatedTasks、controller、uiRuntime 均未变化 |
| CFT149 安装外观 | 原安装 1.8.16 灰色输入、蓝色发送已留图；同 ID 更新 1.8.17 后公共 Chat 为白色输入、深色发送，采集业务保持原主题 |
| 原生设置与开合 | 未发送文本经设置 Esc、点击关闭和 Chat 收起重开后均保留；设置焦点回入口，业务区域继续挂载，Dock 均为 276 |
| 原生发送审阅取消 | 原可信审阅取消后保留本轮输入，返回可发送状态，Dock 为 276；没有用重载或清空会话解锁 |
| 真实本机 AI 只读问答 | 原可信审阅后完成一次真实配置解释；前后选中配置 JSON 深度相等，仍为已保存状态，无保存/采集动作，Dock 为 276 |

渲染使用内存 SDK，无网络/真实 AI/扩展安装，`1120×900` 单一窗口，并排区域只用于比较同一组件。稳定计算样式采样关闭控件过渡，避免动画时点差异；不是浏览器缩放或物理宽度矩阵。脚本复用现有 esbuild、Playwright 与 Chromium，无新增依赖或永久源码字符串测试。

本机渲染证据（不提交生成物）：[脚本](../../../../artifacts/scrapyjs/chat-style-20261103/compare.mjs)、[修复前](../../../../artifacts/scrapyjs/chat-style-20261103/baseline-stable.png)、[修复后](../../../../artifacts/scrapyjs/chat-style-20261103/after-stable.png)、[前计算样式](../../../../artifacts/scrapyjs/chat-style-20261103/baseline-stable.json)、[后计算样式](../../../../artifacts/scrapyjs/chat-style-20261103/after-stable.json)。这些使用源码组件，不冒充安装候选的原生截图。

复用命令：

```sh
node --test examples/sidebar-tools/scrapyjs/tests/ai-app.test.mjs examples/sidebar-tools/scrapyjs/tests/ai-panel.test.mjs
npm run build --prefix examples/sidebar-tools/scrapyjs
npm run app:update -- scrapyjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/scrapyjs --check-project
```

## 原生核心链与候选身份

- 基线：`main` / `24fa6344cea4cc21425967995f50f30cbc453d73`，含本次未提交修改。开始时已有方案指导文档改动，保留并增补状态。
- 唯一正式文件：`scrapyjs.opendesk-tool.json`，版本 `1.8.17`，1,341,094 bytes。
- 包 SHA-256：`5d489d2fc64466b1f9060270c690e23ca8cb2aa1681b0bf0def8031a28dd699c`。
- 工具 buildId：`ef71b5981b34ead0acef6f14f79a780b67b156f82d37bcf9b02aa74970ab5670`；源码与编译字节回执由原构建器生成，原打包器复核。
- 运行入口：原 CFT149（`149.0.7827.55`），App `/Applications/Google Chrome.app`，豆瓣编程标签页上的「扩展 → scrapyjs 采集」，不是固定离线占位或只读调试。
- Browser 详情 UI 确认启用的扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，版本 `0.1.0`，加载路径 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。未取得 serve 在线证据，按静态开发包状态记录；未启动、停止、重建或覆盖 Browser 服务。
- 原可信安装审阅显示同 ID `1.8.16 → 1.8.17`、权限不变，候选 canonical SHA 与上方包 SHA 相同，确认更新后原入口显示 1.8.17。旧安装 canonical SHA 为 `38c34306de0eaf82a6d7d5471b5a4da51745f341dd06f5924da68bec2a91140d`。未直接改写安装存储。
- 原选中配置 `Chat-20261102` 保留。先用自有未发送文本“检查公共 Chat 草稿，不发送。”验证设置与开合；再发送“解释当前配置，不要修改、保存或采集。”。原发送审阅取消请求为 `ef33a290-5e1a-40d0-b519-16466cc3f3ce`，随后确认发送请求 `08994a49-41b3-407d-8d5f-6ba479e17c26`，既有 `local_codex` 返回有效解释。
- 从更新前与真实 AI 完成后的 AX 完整配置文本解析 JSON 并深度比较，相同；规范化配置 SHA-256 为 `74067aa172862ccb1d496f2f7ce2ef2578d0c27168fdfaaae0600c6071e26043`。仅证明当前选中配置保留，未重新核验全部配置库或执行保存/采集。
- 设置面板显示既有本机 Codex 来源、连接已开启且已连接，并保留连接即时生效文案；没有修改来源、连接开关、Endpoint、模型或凭据。Esc 与点击关闭均返回同一工作台，草稿和焦点保留。
- 历史 Dock 高度收缩为 `NOT_REPRODUCED_IN_THIS_SEQUENCE`：设置返回、发送审阅取消和真实 AI 成功后 AX 分隔条值均为 276，完整截图中的消息和输入可见；没有修改任何高度逻辑，不宣称找到或修复历史根因。
- 用户明确授权回收已核实失败且未加载的旧 owner 桌面锁。仅回收该锁、备份原注册表并通过原脚本取得操作权，其他 Profile 租约未变；最终 `ui-release` 返回 `native_ui_owner: null`。原浏览器、服务、配置与完成后的对话留在现场。

原生证据（本机生成物，不提交）：[更新前截图](../../../../artifacts/scrapyjs/chat-style-20261103/native-before.png)、[安装审阅](../../../../artifacts/scrapyjs/chat-style-20261103/native-install-review.ax.txt)、[设置返回截图](../../../../artifacts/scrapyjs/chat-style-20261103/native-settings-return.png)、[审阅取消状态](../../../../artifacts/scrapyjs/chat-style-20261103/native-review-cancel.ax.txt)、[真实 AI 成功截图](../../../../artifacts/scrapyjs/chat-style-20261103/native-readonly-success.png)、[真实 AI 完整状态](../../../../artifacts/scrapyjs/chat-style-20261103/native-readonly-success.ax.txt)、[扩展加载身份](../../../../artifacts/scrapyjs/chat-style-20261103/native-extension-identity.ax.txt)、[最终工作台](../../../../artifacts/scrapyjs/chat-style-20261103/native-final.ax.txt)、[核心结果 JSON](../../../../artifacts/scrapyjs/chat-style-20261103/native-summary.json)。

未测：其他 Chrome 窗口、Host 实际 Shared UI 导出字节指纹、完整宿主/iframe/workspace 几何测量及控制台巡检、来源切换和旧 generation、设置表单实际变更后取消、连接即时开关、真实 AI 配置修改、原按钮保存读回、采集/下载、production、完整安全矩阵与实现评分。已有 39 项控制测试只属于构建时源码，不能代替这些原生场景。

## 收尾并行改动边界

安装与上述核心操作完成后，发现 `src/AiPanel.jsx`、`src/ai-actions.js` 及相应测试出现新的并行语义修改，另有框架并行改动。本次均未覆盖、编译、晋升或评审。`App.jsx` / `style.css` 的本次主题修复仍保留，正式文件 SHA 仍绑定已验证的 1.8.17。

2026-11-03 01:09（北京时间）再次只读执行原 `--check-project`，返回 `E_TOOL_BUILD: compiled UI source changed since the successful build: src/AiPanel.jsx`。这是构建后并行源码漂移，不能沿用先前同源 PASS 声称当前工作区已编译；不把并行行为混进 1.8.17 或覆盖已验证包。后续 owner 需按其改动重新构建、验证和准备新候选。

原方案 100/99 评分仍只属于其记录中的原指纹；本次文档和产品候选没有实现评分。未提交或推送。
