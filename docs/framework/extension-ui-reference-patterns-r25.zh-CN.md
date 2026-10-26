# OpenDesk Extension UI · 业务布局与组件组合参考（R2.5-WEB 设计基线）

> **状态：`DESIGN_REFERENCE / IMPLEMENTATION_PENDING`**。这是 R2.3 / R2.4 设计对照与下一阶段工作入口，不取代 [React 共享 UI 架构合同](../architecture/react-ui-shared-components-r33.zh-CN.md)、[正式 Tokens](../../src/ui/design-tokens.css)、SDK/Host/Installer 合同，也不代表正式浏览器验收通过。

## 1. 原始最高目标：以后开发新扩展，能够直接参考

为 OpenDesk Browser 的「开发」「扩展」和**独立 Sidebar Tool** 提供一套可查阅、可点击、可复制合适代码片段的 **UI Reference**：

- **Foundation：** 沿用 OpenDesk Tokens、字体/间距/半径/状态、已有 `Button` / `IconButton` / React Aria `Switch` 等组件。
- **Patterns：** 基于用户任务组织布局模式，如 Section/Group、List、Toolbar、Master–Detail、Form、Editor、Import、Permission、Dialog、Feedback，不是增加十几个包装组件。
- **Business Examples：** 用开发、扩展管理、Prompt Shortcuts、Bookmark Manager、Cookie Editor、语言资源等已有真实 UI 展示组合方式。
- **Starter / Recipes：** 分清宿主可信 React 与独立 HTML/React/Vue 扩展，逐项说明源码路径、依赖/作用域、必要 HTML/JSX 和完整使用/错误恢复流程；新扩展开发者不必浏览整个仓库。
- **Proof：** 设计适配 HTML、来自真实源码的 React 预览和正式 Mac Chrome 验收分开记录，不得互相冒充。

> 原则：**业务任务 → 页面信息架构 → Layout Pattern → 最少组件 → 状态恢复与权限 → 验收**。默认 360px；320 / 400 / 440 以及真实 React 内容区宽 960px 作为尺寸检查。旧 HTML、React、Vue 自定义 UI 不需要迁移，业务不进入宿主 `src/`，不建立第二 React Root / UI 库 / Host。

## 2. 源文件分层与已保存预览

| 类别 | 应使用的证据或入口 | 说明 |
| --- | --- | --- |
| 唯一配色/间距/半径 | `src/ui/design-tokens.css`、`src/ui/design-system.css` | 宿主私有样式作用域，不对 iframe 和网站全局注入 |
| 可信 React 组件 | `src/ui/react/components/ui/button.tsx`、`card.tsx`、`switch.tsx`、`sidebar-shared.css` | 不假设所有旧业务已改用同一个组件 |
| 真实 React 场景入口 | `src/ui/react/preview/extension-ui-showcase.tsx`；`prototypes/sidebar/extension-ui-showcase/index.html`；`prototypes/sidebar/react-preview/index.html` | `UI_PREVIEW_ONLY`；产物需锁定当前候选 |
| R2.3 适配历史 | `prototypes/sidebar/extension-ui-showcase/archive/r23-web-chat-adapter.html` | 六场景：工具设置、语言、语言资源、表单、浮层、状态；组件覆盖比业务组合更强 |
| R2.3 Git Blob 获取器 | `prototypes/sidebar/extension-ui-showcase/archive/r23-source-html-loader.html` | 固定历史 blob/大小，不等于最新 main |
| R2.4 业务 HTML | `prototypes/sidebar/extension-ui-showcase/r24-business-review.html` | 六业务及输入细节，内存状态，`CHAT_ADAPTER_NOT_SOURCE_HTML` |

此阶段已归档上述三份独立 HTML，没有改写已有同源 React 预览入口、业务文件、正式扩展包或安装器。

## 3. 先选业务布局：分组 / 排版模式矩阵

下表是 **Pattern Inventory，不是待新增组件 API 列表**。R2.5 优先把每一类做成真实源码映射的交互示例卡，点击即可进入对应业务演示，附“在哪里用 / 何时不用 / 代码取自哪里”：

| 编号 | Pattern / Group | 适用用户任务 | 应复用的真实参考 | 360px 首选 |
| --- | --- | --- | --- | --- |
| P01 | Page Header / Action Group | 知道当前页、返回、主要操作 | `develop-editor.tsx#DevelopContextHeader`；`tool-host.tsx#ToolHost` | 单行短标题 + 1–2 高频图标，次要操作进菜单 |
| P02 | Section / Settings Group | 多项相关设置；显示条件与作用域 | `locale-manager.tsx#LocaleManager`；`tool-host.tsx#ToolHost` | 分组标题 + 2–5 条设置；不套多层卡片 |
| P03 | Filter Toolbar / Search Group | 搜索、过滤和新建列表 | `tools.tsx#ExtensionToolbar`；`cookie-editor/src/index.html` | 单视觉表面的搜索 + 右侧少量操作 |
| P04 | List Row / Row Action Group | 打开扩展、提示词、Cookie | `tools.tsx#ExtensionRows`；`prompt-shortcuts/src/index.html` | 一行主体 + 摘要，更多操作收纳；不重复编辑入口 |
| P05 | Folder Tree / Hierarchy | 展开文件夹、定位书签 | `bookmark-manager/src/react/App.jsx#Tree` | 列表树独占滚动；保持 44px 行高与键盘层级操作 |
| P06 | List → Detail → Edit | 浏览、查看、修改、返回 | `tools.tsx#ExtensionDetail`；`bookmark-manager/src/react/App.jsx#Inspector` | **同容器完整子页**；宽屏才可并排详情 |
| P07 | Form Layout / Field Group | 保存名称、URL、正文、数字或敏感值 | `prompt-shortcuts/src/index.html`；`cookie-editor/src/react.css` | 按语义选标签上置/同行；拒绝固定 2:3 通用表格 |
| P08 | Code Workbench / Run Result | 编辑 JS/React/Vue、运行、查看回执 | `tabs/develop*.tsx` | 编辑器优先；执行状态次之；诊断折叠 |
| P09 | Dense Metadata / Inspector | Cookie 属性、版本、来源、网站范围 | `cookie-editor/src/index.html`；`tools.tsx#ExtensionDetail` | 属性键值堆叠 / 按行展开，避免压缩桌面表格 |
| P10 | Import → Validate → Preview | 导入包、备份、语言资源 | `tool-host.tsx#ToolHost`；`locale-manager.tsx#LocaleManager` | 多步全宽子页；最后一次确认，结果未知则读回 |
| P11 | Permission / Scope Group | 网站授权、撤销、可见范围 | `tool-host.tsx#ToolHost`；`tools.tsx#ExtensionDetail` | 当前状态先行，撤权单独确认，不能模拟为真实授权 |
| P12 | Menu / Popover / Confirm | 更多、少数选项、删除 | `tools.tsx#ExtensionRowMenu` / `UninstallDialog` | 少量选择用有视口定位的 Popover；高风险确认用 Dialog |
| P13 | Feedback / Recovery Group | 保存失败、冲突、未知、撤权、空态 | `bookmark-manager/src/react/App.jsx#humanError`；`develop-execution.tsx` | 草稿不丢；重试需明确；未知禁止自动二次写入 |
| P14 | Locale Daily / Resource Advanced | 选语言、回退、导入翻译 | `locale-manager.tsx#LocaleManager` | 日常 2–3 项，语言资源管理另页；不要同弹窗全塞 |
| P15 | Responsive Detail Pane | 960px 下同时浏览和查详情 | `bookmark-manager/src/react/App.jsx#PreviewPane` | **仅真实内容宽足够**才双栏；容器而非外壳宽度决定 |
| P16 | Empty / Loading / Disabled | 第一次使用、等待服务、无结果 | `tools.tsx#ExtensionEmpty`；`develop-execution.tsx` | 简短原因 + 唯一可执行恢复动作 |

### Group 的决策规则

- **Section**：独立功能主题（如“来源与版本”“权限与网站”）。先使用分组标题和间距；只有需要显性边界时才有 `od-surface` 卡片。
- **Setting Group**：同一目的的 2–5 个偏好项。常规开关、选择框可纵排；必要开关置尾；不复制第二个启停入口。
- **Inline Action Group**：同一对象的 1–3 个高频动作。图标 18px 视觉尺寸、34px 宿主默认热区；触控条件下按现有 44px 规则。功能低频则折入“更多”。
- **Field Group**：一个字段的前缀、正文、清除 / 眼睛图标属于**单一表面**；不要为图标再画一个有边框的小按钮；必填字段始终可理解。
- **Disclosure / Advanced Group**：低频诊断、解释和高级字段，不给正常主流程新增一层“点击才能找到保存”。
- **Danger Group**：删除、撤权、批量覆盖、写入敏感数据与普通“保存”分开；明确范围与可恢复行为。
- **卡片禁忌**：每个字段一个卡片、多层嵌套卡片、重复页面标题、重复描述、列表下常驻巨大详情块；这些模式一律先从业务意义上删减。

## 4. 代码示例的最低质量要求

**每个 R2.5 模式都要同时呈现：真实用户场景、源码位置、最少代码片段、适用/不适用宽度、交互状态、键盘与焦点、错误恢复，以及实际验证等级。** 示例应取真实实现并标明包裹层，不能把为了展示而临时造的状态机当成正式代码。

### 4.1 可信 React 宿主（现有 `IconButton`，不创建新 React Root）

```tsx
// 仅说明组合方式；本示例用于受信任的宿主 React 代码，不是任意工具 iframe API。
import {IconButton} from '../components/ui/button.tsx';

function ListHeader({onRefresh}) {
  return (
    <div className="od-page-head">
      <strong className="od-page-title">扩展</strong>
      <div className="od-page-actions">
        <IconButton label="刷新扩展" onClick={onRefresh}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.4 5.7M20 4v7h-7" />
          </svg>
        </IconButton>
      </div>
    </div>
  );
}
```

实际外观使用 `design-system.css` 的 `od-page-head`、`od-page-actions`、`od-icon-button` 与 Tokens。若该结构在业务页面已存在，只展示原实现，**不可再复制第二个 Header**。

### 4.2 独立 HTML Tool（跟随已有工具自己的样式作用域）

```html
<!-- 参考 prompt-shortcuts/src/index.html 的紧凑字段排版，不暗示宿主 CSS 会跨 iframe 自动注入 -->
<div class="ps-compact-row">
  <label class="od-field-label" for="ps-label">按钮短标签</label>
  <input id="ps-label" class="od-field" maxlength="24" placeholder="自动生成前 2 字">
</div>
```

HTML Tool 必须明确加载自己的 `style.css` 与打包后的受限样式；Vue SFC 也应沿用该扩展已经使用的 CSS 作用域。**不导入宿主内部 TSX，不从 Sandbox 操控受信任 React DOM，不共享跨信任根 CSS**。只有经过原公开 SDK/构建器验证后才提供 React/Vue 适配示例。

### 4.3 本轮已证实的组件差异（不是重做基础组件）

- `src/ui/react/preview/extension-ui-showcase.tsx`：搜索多余标签、密码明文操作按钮、重复前缀和强制同行 `Row` 是**演示层待修**，不能直接变成推荐代码。
- `src/ui/extension-center.css`：搜索图标 17px，可评估约 19px；现有单视觉表面应保留。
- `examples/sidebar-tools/cookie-editor/src/react.css`：`max-width:400px` 单列表单和 `cookie-value-toggle` 眼睛按钮已经存在，标记 `ALREADY_FIXED`，只审证据。
- `src/ui/react/tabs/tools.tsx#ExtensionRowMenu`：已使用 body Portal、边缘位置约束和焦点逻辑，不再另造菜单实现。
- `examples/sidebar-tools/bookmark-manager/src/react/App.jsx#PreviewPane` 和 `style.css`：窄屏浮动详情是可评估改为全宽子页的差异点；宽屏并排模式保留。

## 5. 下一轮需要的“示例完整性”而非更多组件

R2.5 交互参考页至少应有两层导航（**预览外壳专用，不加入正式侧栏 Tabs**）：

1. **按布局模式看：** 页面头部、Section Group、设置分组、搜索+过滤、列表行/树、列表→详情→编辑、表单与输入组、代码工作台、密集数据、导入/校验、授权、菜单/确认、错误恢复；每卡直接示范“可点击完整流程”。
2. **按真实业务看：** 开发、扩展管理、Prompt Shortcuts、Bookmark Manager、Cookie Editor、语言设置/资源；复用正式源码/现有预览，不重新开发工具逻辑。

每种模式标注 `SOURCE_REACT`、`SOURCE_TOOL_HTML`、`CHAT_ADAPTER_NOT_SOURCE_HTML`、`NOT_TESTED` 等真实来源。默认“360px、浅色、中文”，外壳提供 320/400/440/960、深色、中英日长文案以及失败/未知切换。

### 必须能操作的状态门槛

- 搜索 → 清除；列表行 → 更多 → 操作 → 返回（Escape / 点击外部 / Tab / 焦点恢复）。
- 列表 → 详情 → 编辑 → 保存；编辑 → 修改 → 取消；未保存返回保护。
- 表单空值/超限/URL 错误、密码显示切换、数字边界、同表面前后缀。
- 导入 → 文件校验 → 预览 → 确认/取消；取消不写入。
- 写入失败保留草稿；结果未知禁止自动重试，先人工读回；撤权、删除明确风险。
- 大于内容宽度时不产生横向滚动；可点元素不会被浮层、滚动容器裁剪。

## 6. 实施边界、验收与反方审计

- **仅网页对话 R2.5-WEB**：先最新 `main` 的 `AGENTS.md` / Owner / 差异核对，优先只读与可点击 HTML，先业务/模式参考，不修改正式运行逻辑。用户明确授权持久化参考资料时才向 `main` 新增/更新审阅文件，不新建分支、PR 或 worktree。
- **本地 Codex**：只有页面体验确认后才提修复清单，优先针对现有 `tsx/css` 或工具源码的最小修正，按现有测试与 Mac Chrome 真实验收。不同对话正在修改的文件不得无证据重复改。
- **不要新增** 第二套 `Button` / `Field` / `Group` 底层库，不强迫自定义工具改 React，不替换现有 Host / Installer，不把虚拟草稿写进 Chrome。
- **逐维专家评分（满分 100，算术均值）**：业务合理性、组件覆盖及示例可检索性、视觉与 Tokens、一致的 Group/Layout、320–440px 交互、键盘/焦点/无障碍、状态恢复、真实源码与预览一致性。未浏览器验证标 `NOT_SCORED`，不能为达到 ≥95 目标编造 PASS。
- **P0 补缺**：模式分类与 Group 组合；一点击即查看真实代码；清晰的可信 React / 独立 HTML / React / Vue 实现边界；每种模式真实的交互状态和错误恢复；版本化可长期保存的入口。
- **保留旧成果**：R2.3 组件覆盖的价值、R2.4 业务布局的价值、已实现 React Aria/Token/Extension Center/ToolHost/LocaleManager/正式开发页及已通过的局部验收证据。

**本轮原始最高目标：** 形成 **“可复用布局模式 + 完整交互组件示例 + 真实业务应用 + 源码入口 + 验收证据”** 的开发参考，使未来每次新增 OpenDesk 扩展无需从零决定 UI 排版，不是再堆一个组件陈列馆。

---

## 当前执行契约 · 统一 UI Reference（2026-10-27）

> 本节是对 R2.5 历史设计状态的当前补充。正式视觉来源仍只有 `src/ui/design-tokens.css` 和 `src/ui/design-system.css`，可信 React 根与安全边界仍由 R33 架构文档决定；不得因本节增加第二套组件包、React Root、CSS Palette 或 Host。

**用户目标与先后顺序：** 先统一视觉，再检索正式组件，再选布局（P01–P16），最后用六个业务范例验证。Bookmark Tree 是业务质量参照，属于专项 owner，不再担当主设计 P0。当前 [index.html](../../prototypes/sidebar/extension-ui-showcase/index.html) 直接进入已有 [Atlas](../../prototypes/sidebar/extension-ui-showcase/r27-source-aligned-atlas.html)。Atlas 中的 SOURCE / PREVIEW / HISTORICAL / NOT_TESTED 不能相互升级。

### 视觉决策（真实 Token 优先，不人工写第二套值）

| 决策 | 规则 | 禁止 |
| --- | --- | --- |
| 色彩 | 语义 `--od-ink/sub/bg/paper/line/brand/focus/positive/negative`；正式深色源也在 Tokens | 新组件硬编码品牌色、只靠颜色传递失败 |
| 字号 | 正文 `--od-body-size`、辅助 `--od-note-size`、技术 `--od-meta-size`；错误提示必须可读 | 主体/重要错误藏在 11px 灰字 |
| 间距 | `--space-1/2/3/4` 为 4/8/12/16px；父容器只持有一层 gutter | 嵌套 Card 连续增加内边距 |
| 控件 | `--od-icon-size`=34px，常规表单/按钮最小 36px；控制圆角 `--radius-control`，表面 `--radius-surface` | 任意新圆角、热区小于可触控要求 |
| 信息层级 | 当前视图仅一个页首；主要操作靠近上下文，详情/编辑 320–440px 优先完整子页 | 双页首、双保存、把高频动作埋入 More |
| 状态 | Hover、Focus、Disabled、Loading、Empty、Error、Unknown 和撤权均需语义反馈 | Unknown 自动重试写入、将演示交互当真实成功 |
| 适配 | 320/360/400/440px、960px、200% 缩放；`min-width:0`、局部滚动、长文本可换行 | 页面横向溢出、悬浮操作遮盖焦点 |
| 无障碍 | label/for 或 aria-label，焦点可见，菜单/对话框 Escape 与焦点返回，status/alert | 图标按钮无名称、模拟键盘通过 |

以上规范是**目标行为**，不是本轮已经完成八维产品验收的证明。数值随真实 CSS 修改而更新；视觉例外须能指向现有正式使用场景并有对照。

### 组件来源分级（不能误导 AI）

- `SHARED_REACT`：现有 `components/ui/button.tsx`、`card.tsx`、`switch.tsx` 可供合适的可信 React 消费者导入。
- `HOST_CSS_PRIMITIVE`：`design-system.css` 下的 Toolbar、Field、Surface、Disclosure、Icon Group 等，仅在可信 UI 有安全的现成样式。
- `REACT_ARIA_SAMPLE`：Showcase 使用的 Checkbox、Radio、Segmented、Popover、Menu、Tooltip 等，是基于已安装 React Aria 的示例，不自动成为通用共享 API。
- `BUSINESS_REACT`：Extension Center、ToolHost、Develop、Locale 的真实 UI；按原 owner 和业务依赖借鉴模式，不整段复制 Host 状态机。
- `SANDBOX_TOOL`：Bookmark Manager、Prompt Shortcuts、Cookie Editor 各自的 HTML/React Tool 代码，只在各自打包/SDK 规则内使用。
- `CHAT_ADAPTER_NOT_SOURCE_HTML`：R2.5/R2.6 内存交互模拟，供布局比较，禁止记录为正式产品或同源 React 实现。

### 三环境的最短安全开发路径

1. **可信 React（第一方经审计）**：选 [现有 JSX 根](../../src/ui/react/) 和 `components/ui`，通过已定义的 Tabs/Root 消费，不创建 `createRoot`；所有特权操作仍由现有可信 Controller/Host 裁定。
2. **HTML Tool（独立沙箱）**：复用 [Prompt Shortcuts 正式 HTML/CSS](../../examples/sidebar-tools/prompt-shortcuts/src/index.html) 的结构，使用自己的 `style.css` / 公开 SDK 和已有 Tool 打包器，不让 `design-tokens.css`、`design-system.css` 穿透 iframe；参考页 Guide 的完整 HTML 例子仅修改演示内存。
3. **React / Vue Tool（独立沙箱）**：在各自 Tool 目录中用原编译器生成静态 Tool 内容，React JSX / Vue SFC 仅借鉴尺寸、语义与模式，不能直接挂到可信 Root、导入私有 Host 或取得新增权限；Guide 的 Vue 片段需要原项目 Vue 构建上下文。

### AI 在创建扩展前必须完成的任务检查

以“设置页 / 搜索列表 / 编辑页”三种复用基准至少各实现一次新 UI 任务。逐一记录：选型→Pattern→实际组件/Token→初始/空/加载/失败/未知态→键盘/窄屏→真实构建与来源归属。设置页优先 P01/P02；搜索列表优先 P03/P04/P16；编辑页优先 P06/P07/P13。不得凭预览里一个可点击按钮就推断真实写入成功。

**证据门槛：** 真实 render 与正式产品版本关系、320/360/400/440/960px + 200% + 深浅主题、焦点/ARIA、HTML/React/Vue 编译、权限边界和三任务复用逐项保留 DONE_VALID/PARTIAL/MISSING/NOT_TESTED；八维独立评分不得空填 95。每维实证 ≥95 才能宣布正式质量通过。最小自动检查来自原测试目录，不新增独立验证基础设施。

