# 当前预览入口（2026-10-29）

- **唯一主原型：R2.5.4 `preview/cookie-editor.html`**（2026-10-29；正式 `main` 提交 `932a1e70d6ea65a0b79764a7d299a8237c541bbb`）。已确认交互：账号顶部当前快照无背景更新图标，账号列表恢复已应用/切换/更多；新建账号默认选中全部 Cookie、明细可展开，顶部保存成功后返回列表并提示底部 Toast；分享配置匿名链接排在指定用户之前且默认选中。此文件是独立 HTML 模拟数据，**不代表正式 React/可信 Cookie 写入已同步完成**。
- **后续实施规则**：仅以该主原型作为设计/交互契约，对照 `app/`、`trusted/`、`src/react.css` 的正式既有实现做增量接线；禁止从模拟脚本复制虚构 Cookie、绕开 Host/SDK，禁止创建平行 Mock。历史截图、旧版本原型、视觉审计锁及旧测试证据不得冒充该基线的正式通过。


- **最新经用户交互评审的 HTML 视觉参考：** [cookie-editor.html](./cookie-editor.html)。六个 Tab（Cookie / 账号 / 企业 / 市场 / 定制 / 圈子）、Cookie Expiration、账号分享七档链接有效期、匿名领取 1/3/5/10 次，以及订阅/外部社群入口；这是**原生 HTML/CSS/JavaScript 模拟原型，非 React，不访问真实 Cookie 或可信 Host**。
- **正式产品同源 React 预览：** [react/index.html](./react/index.html)，必须从 `../app/`、`../src/react.css`、`react/src/` 构建生成，预览虚构数据来自 SDK Mock，不能直接修改生成后的 HTML 代替源码修改。
- **历史兼容入口：** `index.html` 是 R4.6 旧静态预览；`cookie-editor-r4.3-preview.html` 与 `cookie-editor-r4.9.2-approved.html` 是历史参考。为免破坏历史测试/链接，本轮不覆盖、删除或改名，**均不是新的开发视觉标准**。
- **UI 迁移原则：** 从 `cookie-editor.html` 提取布局/样式/可访问交互转成真正 JSX；仅复用可信 Controller、SDK Adapter、Host、Domain、安全边界和经验证的账号操作。**禁止**把演示账号/Cookie、DOM 内事件代理、伪结果或任意 HTML 脚本直接搬进生产 React。
- **发布门槛：** 先完成正式 React 同状态视觉和功能，不对安装 JSON、生产身份、Trusted Host 或安全权限做无证据变更；实际构建、CI 和 Mac Chrome 验收分别记录。

---

# Cookie Editor R4.3 原始设计预览

- `cookie-editor-r4.3-preview.html` 延续已确认 R4.3 原始布局；历史 Git Blob `7a129f509814805ab78827eaccbc77a64b20010f` 可从历史找回。2026-10-16 定向修复默认 SameSite=Lax 导致的新建误报未保存，不涉及真实 Chrome 操作。
- 正式 UI 在 `../src/index.html`、`../src/style.css`、`../src/main.js`；`../cookie-editor.opendesk-tool.json` 是可安装包。
- 原型操作仅处理虚构数据。正式 Cookie 读取、显示值、导入导出、写入、删除及撤权必须依赖原有可信 Host 和 `OpenDeskSDK.browser.cookies`，不能把原型脚本直接打包。
- 定向检查：`node --test tests/environment/cookie-editor-r43-parity.test.mjs tests/environment/cookie-editor-ui.test.mjs`；安装包再通过 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor` 复核。

- R4.5：打开新建或编辑即 clean；仅实际变更为 dirty，撤销恢复 clean；空白新建可直接取消、切换或离开。正式 src 使用字段快照进行相同判断。

- R4.5.1 补充：编辑被遮蔽 Cookie 的值字段后再次清空，是明确写入空值的意图，仍属于未保存状态；未触碰的空值输入框才表示保留旧值，模拟逻辑与正式 Chrome SDK 契约一致。

## R4.6 唯一可编辑主预览（2026-10-16）

- **主入口：** `preview/index.html`，由原始确认 Git Blob `7a129f509814805ab78827eaccbc77a64b20010f` 的完整 HTML 派生，继承 384px 设计、原位编辑和显式导入／导出／新建工具栏。无需构建，`file://` 打开即可交互。
- **历史基准：** `preview/cookie-editor-r4.3-preview.html` 是原版预览文件路径；已确认的原始内容为 45,133 UTF-8 字节。请特别注意：2026-10-16 并行提交对该路径做过定向修补，因此当前 main 此文件可能不再与历史 Blob 完全同字节；R4.6 主入口明确使用不可变 Git 历史 Blob 作为输入。未在本阶段回滚或覆盖其他 Agent 的提交。
- **改动边界：** UI 状态机、语义化 dirty 基线、空白新建、取消、筛选不丢草稿、排序、导入冲突信息、显式敏感备份确认、模拟失败保留草稿、空列表／只读／受限／深色等场景。实验台和模拟数据永不迁入正式工具。
- **正式产品：** `../src/index.html`、`../src/style.css`、`../src/main.js` 由 `../tool.config.json` 作为正式打包输入；安装包 `../cookie-editor.opendesk-tool.json` 不受本次预览修改影响。
- **阶段门槛：** 预览先由用户审核确认，**确认前不得因本预览自动迁移正式源码或更新安装包**。
- **定向自动回归：** `node --test tests/environment/cookie-editor-preview-r46.test.mjs`。这些测试是模拟状态与 DOM 事件回归，不能替代 Playwright/Chromium 真浏览器截图及真实 Chrome Cookie Host 验收。
- **R4.6.1 Value 语义：** 编辑已有 Cookie 时，空白 Value 输入框初始代表“未触碰、保留旧值”；用户输入后再次清空是明确写入空字符串的待保存意图。可点击“撤销值修改 · 保留旧值”回到 clean 状态。新建时输入后删空则恢复初始 clean。此处仅预览模拟，不修改正式 Chrome Cookie。
- **R4.6.2 Partition 安全：** 预览导入不将已分区 Cookie 与同名、同域、同路径的未分区 Cookie 当作同一身份；没有精确 PartitionKey 的分区 JSON 直接报错，不会隐式转为普通 Cookie。正式产品须继续使用可信 Host 的 Store/Partition 精确身份。

## R4.7 — 导出文本复制与文件下载双入口（2026-10-16）

- 唯一主预览仍为 `preview/index.html`；在原位导出表单中显示「复制到剪贴板」和「导出文件」，不再显示「导出模拟文件」等不适合正式产品的按钮文字。原 384px 视觉、R4.3 黄金 Blob、导入、编辑、Dirty 逻辑保持不变。
- 两个操作从同一个格式化过程生成相同内容；默认 JSON 仅导出不含 Value 的元数据清单，不可恢复登录。Cookie Header / Netscape 需要敏感值并受格式损失和分区限制约束。
- 「包含 Cookie 值」时，分别使用本站值读取授权及每次操作的最终确认；复制确认文案明确提醒系统剪贴板可被其他应用读取，下载确认说明文件泄露风险。取消确认不产生复制或文件。
- 复制采用浏览器页面 `navigator.clipboard.writeText` 演示成功／拒绝／不支持场景；仅在写入 Promise 实际完成后报成功，失败保留导出面板并提示可使用「导出文件」。文件采用原下载机制。**此处只操作虚构数据，不代表 Chrome/Host 已授权或真实复制能力已验收。**
- 定向回归文件 `tests/environment/cookie-editor-preview-r46.test.mjs` 新增剪贴板模拟测试。后续正式扩展迁移必须使用**现有公开 SDK** `OpenDeskSDK.browser.cookies`、`OpenDeskSDK.browser.clipboard` 和 `OpenDeskSDK.browser.downloads`（以实际 SDK 接口为准），继承真实网站身份、Store/Partition 精确权限、敏感值读授权、Epoch 失效保护，**不得把预览模拟脚本迁入产品**。
- 正式 `../src/index.html`、`../src/style.css`、`../src/main.js`、`../tool.config.json` 和安装包本轮均未改动；用户在新一轮明确授权后方可迁移正式 UI。


## R4.9.2 · 已确认的 UI 基线（2026-10-16）

- **React JSX/CSS 唯一候选：** `react/src/App.jsx`、`react/src/style.css`；用户确认左右布局、默认含值 JSON 备份、复制/下载两按钮及内联敏感确认。
- **设计冻结快照：** `cookie-editor-r4.9.2-approved.html`，独立可点击的虚构数据预览；此静态快照由本地 React16 兼容测试环境生成，仅作为用户确认的视觉和行为参考，不是 React19 构建、浏览器授权或正式工具。
- **真实 React19 产物：** `react/index.html` 必须从上述 JSX 通过 `npm run build` 生成，经 Chromium E2E 后由现有 `cookie-editor-r49-react-preview.yml` 晋升。旧产物不可自动视为与 R4.9.2 源码一致。
- **正式扩展保护：** 当前配置版本 2.0.14 的 `src/`、安装包、SDK/Host、本目录 R4.3 与 R4.6 历史预览本轮不变；正式业务迁移下轮才进行。
- **本地校正证据：** 8 组 Chromium 回归 PASS，320/384/520px 值显示图标中心偏差 0px；React19 构建、最新 CI、真实 Chrome 安装需分别核验。

## React 19 离线审核入口 · 380px 侧栏（2026-10-17）

- **当前推荐审核：** `preview/react/index.html`，React 19 与 CSS/JS 均内联的独立 HTML；宽屏打开时 Cookie 面板仍保持 380px，直接双击可用，无须构建或安装开发环境。
- **历史 R4.9.2 确认版：** `preview/cookie-editor-r4.9.2-approved.html` 已同步调整为 380px，但仍是 React 16 兼容快照，不是 React 19 产物。
- **唯一维护路径：** React 源码位于 `preview/react/src/`，修改后使用 `preview/react/package.json` 的 `npm run build` 重新生成并提交 `preview/react/index.html`；`npm run check` 验证源码与 HTML 构建一致性，`npm run test:chromium` 做真实 Chromium UI 回归。仅审核现有 HTML 无须执行这些命令。
- **历史预览保护：** `preview/index.html` 仍保留 R4.6 版本；此处不改正式工具源码或已安装 JSON 包。


## R4.10.4 · 导入／导出工具栏图标统一（2026-10-17）

- React 19 主预览 `preview/react/index.html` 与唯一 JSX 源码 `preview/react/src/App.jsx`：导入使用向下进入托盘，导出使用向上离开托盘，与正式 `src/index.html` 的方向一致。
- 旧入口 `preview/index.html` 仅交换工具栏文件向下／向上图标；冻结的 R4.9.2 approved 和 R4.3 原始历史文件不改写。
- 导出面板内的「下载」仍用向下图标，导入面板内的「选择文件」仍用上传/选取图标。工具栏按钮保持 34×34 CSS px、title 与 aria-label。
- 增加 React Chromium 图标方向回归与 R4.6 静态语义回归；预览只有虚构数据，不能代替真实 Cookie Host 验收。
