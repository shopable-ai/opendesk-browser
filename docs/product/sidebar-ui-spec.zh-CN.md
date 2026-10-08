# OpenDesk Browser Sidebar UI SPEC · R2

> 版本：2026-10-08 · 状态：UI 实施候选。此文档定义视觉、交互和页面分工，不取代 `docs/architecture/sidebar-product-contract.zh-CN.md` 的目标、权限、运行与持久结果合同。
> 原型追溯：**ORIGINAL_PROTOTYPE_NOT_RECOVERED**。历史对话确认了标题“OpenDesk Sidebar · 工作台体验预览 R2”、三页签、任务卡下的运行历史、开发草稿及发现安装，但未取得可独立校验的原始 HTML 文件字节；`prototypes/sidebar/sidebar-ui-interactive-preview.html` 是忠实设计候选而非原件。

## 1. 首要产品结论

OpenDesk Browser 是独立 Chrome 扩展；日常使用不依赖 Codex / Native Messaging / MCP。

- Sidebar 保留两个**持续挂载**的工作视图：**我的任务**和**开发**。发现入口始终在头部，明确打开扩展自己的完整页面；不把整个目录压进 300–420px 宽的 Side Panel。
- 完整发现页沿用同一个受信任的 `ui/tool.html` 入口及同一套 `createTaskWorkbench` / Host Client、任务服务；只能被证明已 Available 的版本才能安装。页面切换不重建 RunHost 或销毁当前草稿。
- **不设顶层“运行记录”页签**。运行历史只出现在对应已安装任务卡的展开区域中；结果与历史对齐具体脚本版本、runId 与持久结果，但普通用户仅看清楚状态和输出，技术身份放入次级详情。
- “我的任务”不是 select + 长表单；任务卡片本身是导航及信息容器。安装版本身份固定，运行准入、授权、Stop 与结果由现有服务负责，UI 不加第二套执行器/存储。
- “开发”允许修改后的 `async function main()` 直接按当前编辑区草稿运行；点击“保存版本”是独立动作。 `page`、`params` 为运行时受控接口，`return` 是脚本结果。草稿预览不得自动转成正式 Available 任务。

## 2. Sidebar 信息层次

```text
固定品牌头部   OpenDesk Browser                 发现任务 ↗
当前网页状态   可运行 / 正在确认 / 不支持（详细 URL 折叠）
固定导航       我的任务 | 开发
独立滚动区
  我的任务
    已安装任务卡 A（名称／用途／启停）
       当前站点匹配与必需权限
       参数表单（尽量简短；必要输入标签与帮助）
       最近一次执行结果
       运行记录（折叠，可逐条展开结果，最多先显示 8 条）
       次要操作／任务管理（折叠）
    已安装任务卡 B（默认折叠）
    空状态 / 安装入口
  开发
    当前网页摘要（详细 document 身份折叠）
    JavaScript 编辑器（主工作空间，支持粘贴与长代码）
    参数 JSON（可折叠）
    当前结果与运行日志
    脚本保存／加载／版本管理（折叠）
    高级目标／SDK／健康检查（保留原有入口）
固定操作栏
  我的任务：运行任务 | 停止
  开发：运行草稿 | 保存版本 | 停止
```

切换 Tab 或打开目录不能隐式运行、保存或停止；离开开发视图不得清空未保存代码、参数、当前结果或运行占用。正在运行时 Stop 必须保留；任务 Stop 只能停止由该任务视图确认拥有的 runId，不能停止开发视图其他运行。任务卡切换只能改变观察目标，不改变 Running Target。

## 3. UI 设计系统

| 项目 | 规定 |
| --- | --- |
| 基本表面 | 主画布 #F6F8FC，内容卡 #FFFFFF，浅边框 #E1E7F0；避免深色文字叠深色表面 |
| 字体 | 系统无衬线正文 12–14px；品牌标题 15px；视图标题 16–18px；辅助 11–12px。代码为等宽字体 12–13px |
| 字色 | 一级 #182B45，正文 #344663，辅助 #6F819A，弱提示 #8392A7；文本对比须通过 WCAG 2.2 AA（常规 4.5:1） |
| 语义色 | 主操作 #355ED2；成功 #18734F；失败 #AE3D4B；警告 #92651A；禁用同时显示文字和 `disabled` 状态，不单靠颜色 |
| 间距 | 4px 基准：4 / 8 / 12 / 16 / 20 / 24；Side Panel 内边距 12–16px，卡片间 8–12px |
| 圆角 | 内容卡 12px，表单 8px，按钮 9px。使用低强度阴影区分层次，不用大量灰色表单边框模拟布局 |
| 固定区域 | 头部、双视图导航、底部操作栏不随内容滚动；只允许中部内容区纵向滚动 |
| 表单和列表 | 保留键盘顺序、清楚的 `label`、焦点轮廓、输入错误解释、任务按钮可按 Enter/Space 操作 |
| 代码区 | 占开发可滚动区的主要视觉面积；至少 220px 可编辑高度，长代码内部可滚动/可扩展，不得横向顶破布局 |
| 结果 | 长 JSON 允许换行并有最大高度及内部滚动；保留 `undefined`、false、0 和失败错误类型，不把长 runId 作为标题 |

## 4. 宽度和可访问性

| 可用宽度 | 布局规则 |
| --- | --- |
| 300px | 单列任务卡；状态文本允许换行；主操作优先，停止次要但可见；无横向滚动 |
| 360px | 标准 Side Panel，显示 2 个一级导航项；任务副标题最多 2 行；底部操作栏始终可访问 |
| 420px | 推荐预览宽度；卡片展开后参数、最近结果和历史形成连续纵向关系 |
| 520px | 用额外宽度改善内容阅读和按钮间隔，不增设独立历史列 |
| 全页发现（≥900px） | 搜索及分类在上，目录卡片网格与阅读式详情两栏；窄屏退化单列；详情不与搜索区争抢视线 |

系统缩放 125%/200% 不应遮挡主按钮；`:focus-visible` 有 ≥2px 轮廓；`aria-live=polite` 用于异步状态和执行结果但避免重复播报全文日志。历史可用原生 `details/summary` 展开。每张任务卡的状态文案必须同时说明已启用/停用、可运行/不适用、运行中/完成/失败等原因。

## 5. 行为矩阵及错误

| 操作／状态 | 可见行为 | 真正负责人 |
| --- | --- | --- |
| 无已安装任务 | 说明空状态、显著“发现任务”入口，禁用运行 | listTaskCatalog |
| 任务选中 | 展开卡内参数/结果/历史，保留其他卡标题；仅更改 UI 观察 | task-workbench |
| 当前网页不匹配 | 显示不适用的 URL/origin 原因，运行置灰，不回退历史页面 | CurrentPageTarget + manifest |
| 待授权 | 描述所需目标网站能力，原生可信点击触发权限，不能把演示结果当授权 | chrome.permissions + CurrentPageTarget |
| 运行中 | 固定栏停止入口；Running Target 继续冻结不随切页变化 | RunHost |
| 成功/失败/停止/不明结果 | 最近结果显示准确终态；历史条目可展开，原始标识留在详情 | Host snapshot / durable Result |
| 运行记录 | 按当前任务的脚本版本归属查找；查询迟到不得覆盖新选择 | Controller snapshot |
| 开发草稿运行 | 使用编辑器此刻的未保存源码及 params；运行不自动保存 | createScriptEditor |
| 保存脚本 | 保存明确 revision，不自动运行，显示 dirty/revision 状态 | Controller script store |
| 发现安装 | 只从已验证 Available 候选通过既有 installTask 完成；显示明确反馈 | Task Catalog service |
| 多窗口跨页变更 | 完整目录安装后发送非权威通知，Side Panel 重新查询 Task Catalog 服务；不复制任务状态 | 相同扩展域 BroadcastChannel + listTaskCatalog |
| JSON / JS 导入 | JSON 进入待验证候选；JS 进入未保存编辑草稿。不能假称已安装 | importTaskPackage / 开发编辑器 |

**无市场 API**：只能展示本机真实任务目录，禁止虚构评分、认证、审核、作者真实性、云端在线状态。当前 HTML 原型所有示例任务、安装、结果均为**交互模拟**。

## 6. 实现映射与保留边界

- 入口：`src/ui/tool.html`；现有 DOM ID 为外部 JS 契约，不得无检查更名；固定头部/导航/运行栏由 `src/ui/tool-shell.css` 提供。
- 运行/保存/结果/当前网页：`src/ui/script-editor.js`、`src/ui/current-page-target.js`、现有 RunHost；本轮不得修改 Controller、Worker、安全身份或持久数据格式。
- 任务/目录：`src/ui/task-workbench.js`；已安装卡内显示任务参数和对应的运行历史，目录打开完整扩展页，依旧走真实 `listTaskCatalog` / `installTask` / `uninstallTask` / `resolveInstalledTask`。
- 独立目录使用同一 `ui/tool.html` 真实 Host Client，不另开前端 fake Task Store。
- 完整 HTML 演示：`prototypes/sidebar/sidebar-ui-interactive-preview.html`；与正式运行不可互相替代。

## 7. 分层验收与停止标准

**静态/组件层**：核对 DOM ID 唯一、所有现有 handler 仍可定位、窄屏无横向溢出、卡内历史绑定、记录展开、空/不可运行/错误/长任务名称、目录搜索安装按钮和状态、切换不丢草稿、停止不串任务。使用定向测试 `node --test tests/environment/task-workbench.test.mjs tests/environment/sidebar-product-contract.test.mjs tests/environment/script-editor.test.mjs` 与 `npm run check`；只有执行后才能报告 PASS。

**Chrome 原生层**：以受控 Chrome/CFT 的实际扩展 Side Panel 检查 300/360/420/520px、125% 缩放、网站权限弹窗、A/B 同 URL 冻结目标、实际 `async function main()` DOM 效果、Stop、安装后跨页刷新、重开后状态；没有真实浏览器回执一律写 **NATIVE_NOT_TESTED**。

**各项独立评估**：视觉、交互、开发体验、普通用户体验、无障碍分别给出证据、阻断项和评分，不能用综合“95分”替代真实验收；任何高危身份/权限问题直接阻断正式接受。

## 8. 历史恢复状态

- 证实存在过 R2 标题、任务/发现/开发三页签交互、卡片下历史、开发编辑、运行/停止、发现安装的历史描述。
- **未取得**指定 `opendesk-sidebar-ui-r2-interactive-preview.html` 的逐字原始源码或同名仓库文件；故禁止称“原版完全恢复”。
- 现行架构刻意把发现迁往完整扩展页；这是获认可的信息架构优化，不是丢功能。
- R2 示例原型仅用于设计审查；所有实际运行证据只来自受信任的 Host 和真实 Chrome。
