# OpenDesk Browser UI 布局与样式规范 · R27

日期：2026-10-12；语义与组合规则补充：2026-11-10。状态：**现行跨界面规范**。适用于维护者新建 UI 和增量修改，不代表所有历史页面已迁移或完成原生验收。

这份文件是**跨界面使用约定**；最新五 Tab 导航与应用/网页增强术语由 [现行 R4 产品规格](../product/sidebar-ui-spec.zh-CN.md) 拥有；具体变量唯一来源为 [`src/ui/design-tokens.css`](../../src/ui/design-tokens.css)。Side Panel 实施细则继续由 [Sidebar R20/R26](sidebar-design-system-r20.zh-CN.md) 维护，Native Workspace 历史构建/验收证据由 [R22 工作流](../framework/workstreams/native-workspace-tailwind-r22.zh-CN.md) 维护。不要复制出第二份颜色/间距权威表。

## 1. 技术选择与信任边界

| 产品界面 | 真实源码 | 样式及基线 | 禁止事项 |
| --- | --- | --- | --- |
| Side Panel 五个正式选项卡（开发版另有隐藏调试页）、扩展统一列表/详情 | `src/ui/sidepanel.html`、`src/ui/react/app-shell.tsx`、`src/ui/react/tabs/`；公共 CSS 与各自布局 CSS | 构建入口为 `sidepanel.html`；唯一可信 React 根与现有 `od-*` 原语共同消费 tokens，五 Tab 布局映射见 R20 | 不沿用退役 `tool.html`；不因有 Tailwind 依赖就加载 Workspace CSS；不向 sandbox iframe 注入宿主 CSS |
| Native Workspace | `src/native-agent/workspace.tailwind.css`、`scripts/build-workspace-style.mjs` | **Tailwind CSS v4.3.3 离线编译**，token CSS 在构建阶段内联到单个 `workspace.css` | 不使用 CDN、浏览器端 JIT、`npx` 联网下载；不把 Tailwind Preflight 扩散到 Sidebar |
| Native Settings | `src/native-agent/settings.css` | 原生 CSS + 共享 tokens，页面允许自然滚动 | 不引入 Sidebar 的 `html,body{overflow:hidden}` |
| 应用市场扩展标签页 | `src/marketplace/marketplace.css` | 独立响应式排版 + 共享 tokens | 不直接复制窄 Side Panel 的布局约束 |
| 已安装侧栏工具 | 实际项目 README 指定的业务 owner，新正式产品默认 `projects/<id>/`，教学示例 `examples/sidebar-tools/<id>/` | 动态工具在独立 opaque-origin sandbox 使用自己的 CSS；固定可信消费者按既有准入合同接入原 React 根 | 不按目录或名称自行提权，不授予宿主 CSS/JS 或扩展权限，不动态引入远程 Tailwind/Quasar |
| 注入网页的 Page UI | `src/scripting/user-scripts/page-ui-mount.js` 等 | 明确的实例容器/ShadowRoot 或受控目标网页样式通道 | 不全局覆盖网站 reset；ShadowRoot 不是 JavaScript 安全沙箱 |

**隔离工具的特殊规则：**沙箱仍然使用自己的 CSS 文件，只映射与宿主一致的尺寸和视觉语义，绝不加载宿主 Preflight、特权脚本或完整应用设计系统。

**原则：统一视觉契约，不强制统一框架。** Quasar/Vue 的统一间距思想可以借鉴，但本仓库不是 Quasar 运行时；已使用 Tailwind 的页面只负责自己的隔离构建产物，不能要求所有原生小工具先编译才能使用。

## 2. 尺寸、间距、字体、色彩

基准空间单位为 **4px**。团队统一使用已有 `--space-1/2/3/4`，不是随时决定 `7px`、`9px`、`11px`。下表解释现有 token 的场景映射，不定义新变量；取值、主题及覆盖范围只在 `design-tokens.css` 维护。

| 场景 | 规范 | 原生 CSS | Tailwind v4（Workspace） |
| --- | --- | --- | --- |
| 紧密关联：文字与徽章、小提示 | 4px | `var(--space-1)` | `gap-1`, `mt-1` |
| 同行操作、工具栏标签与控件组、同区域内容 | 8px | `var(--space-2)` | `gap-2`, `mt-2`, `py-2` |
| 容器/卡片留白、正文分组 | 12px | `var(--space-3)` | `p-3`, `gap-3` |
| 独立章节、跨组分隔 | 16px | `var(--space-4)` | `gap-4`, `mt-4`, `p-4` |
| 桌面大页面外层宽松留白 | 24px | `calc(var(--space-3) * 2)` | `p-6`, `lg:px-6` |
| 普通表单控件最小高度 | 36px | 既有控件 36px 规格 | `min-h-9` |
| 紧凑 Side Panel icon 按钮 | 34px | `var(--od-icon-size)` | 需要时使用 `size-(--od-icon-size)`，不能误写 `size-9` |
| 圆角：按钮 / 卡片 | 8px / 12px | `--radius-control` / `--radius-surface` | `rounded-lg` / `rounded-xl`（须核对实际生成值） |

- **一个容器只能有一个页面级 gutter 负责人**。Side Panel 宿主使用 `--od-page-gutter:12px`，窄屏保持同一对齐线；普通页的上下留白由工作区统一提供，通栏 ToolHost 头部与独立画布的例外见 [Side Panel 留白所有权](sidebar-design-system-r20.zh-CN.md#留白所有权和使用原则2026-11-10-修订)。工具详情 iframe 由宿主铺成全宽，再由 sandbox 工具自己决定内部留白。父子不能各加一层“页面” padding。弹窗、卡片内部留白不属于页面 gutter。
- 字体层级遵循角色：Side Panel 正文/列表名称消费 `--od-body-size`，次说明消费 `--od-note-size`，低频技术值消费 `--od-meta-size`。紧凑页首使用 `od-page-title`，不因为是 H1/H2 就放大到桌面标题；独立 Settings/大页面可按内容层级使用较大正文与标题。技术小字不能承载重要错误、授权范围或恢复操作；字重、行高与对齐见 [R20 字阶与密度](sidebar-design-system-r20.zh-CN.md#字阶密度与对齐2026-11-10)。
- 控件尺寸：桌面图标操作 34px、普通表单至少 36px；粗指针/触摸界面宜提供至少 44×44px 的实际点击区域。长中文、URL、Zoom 200% 时应自然换行；操作只因有足够空间才允许同一行显示。
- 颜色、边框、状态色以 `--od-ink`、`--od-sub`、`--od-line`、`--od-paper`、`--od-bg`、`--od-brand`、`--od-positive`、`--od-negative` 为权威。新功能不得随意新造高对比度不足的灰色作为正文；危险操作必须具备文字/ARIA，不仅用红色识别。
- 布局选 `flex/grid + gap`，不以给每个孩子加不同方向 margin 模拟 gap。横向 flex 子元素需要 `min-width:0`，固定列应使用 `minmax(0,1fr)`，长文字可换行或局部滚动，页面不得横向滚动。
- 只有真实职责差异（例如固定 232px 目录栏、编辑器最小高度、网站注入 UI 定位、滚动容器）才允许独立数值；在 CSS 旁说明原因并有对应响应式/视觉检查。**禁止为通过检测而到处堆 `!important` 或覆盖原选择器。**

### Token 语义与使用决策（2026-11-10）

先判断内容角色，再选择 token；不要按某张截图的色值、某个工具名称或“看起来更淡”另造变量。下表只维护语义与场景，不复制调色板或暗色值。

| 语义角色 | 现有 token | 适用场景与边界 |
| --- | --- | --- |
| 阅读主次 | `--od-ink` / `--od-sub` | 名称、正文、当前值用主文字；描述、时间和辅助说明用次文字。失败原因与权限范围须完整可读，不靠淡化降级 |
| 画布与内容表面 | `--od-bg` / `--od-paper` | 页面背景与卡片/字段表面；浅色两者当前同为白色，仍保留不同语义，暗色不硬编码白底 |
| 结构分隔 | `--od-line` | 集合外框、内部行分隔、普通卡片边界；不承担输入框识别或键盘焦点 |
| 输入边界 | `--od-input-border` | 字段、选择器及组合输入的可交互轮廓；不因为列表需要轻边框就一并减淡所有控件 |
| 品牌与交互强调 | `--od-brand` / `--od-on-brand` / `--od-accent-ink` | 主要执行及其前景、主题下的强调文字；普通复制/刷新使用次级或 Ghost，避免整页主按钮 |
| 键盘焦点 | `--od-focus` | 当前键盘操作位置的可见焦点；与持久选中、展开、已运行状态分别表达 |
| 轻状态表面 | `--od-muted` | Hover、只读、轻选中背景；配合文字/ARIA，不代替禁用逻辑或成功回执 |
| 正常与风险反馈 | `--od-positive`、`--od-warning*`、`--od-negative*` | 成功、待处理、失败/危险语义；提示同时有文字，危险按钮仍经原确认与权限链 |
| 次级动作 | `--od-action-bg` / `--od-action-border` / `--od-action-ink` | 公共次按钮外观；业务不借调整该组变量重绘整个页面的卡片边界 |
| 空间与轮廓 | `--space-*`、`--radius-control` / `--radius-surface` / `--radius-pill` | 空间表达关联强弱；控件、集合表面与状态徽章各自使用对应轮廓。不是每行都要圆角卡片 |
| 正文与辅助字阶 | `--od-body-size` / `--od-note-size` / `--od-meta-size` | 按正文、说明、技术信息选择；禁止通过整体缩小字体挤入更多操作 |

默认主题与显式 `.od-theme-shadcn` 均由同一 token 文件拥有；后者是选择接入的局部主题，不是五 Tab 默认或第二套全局 token。公共组件读取当前语义，业务 CSS 不逐页声明 `:root`，不直接选择 `--od-dark-*` 绕过现行主题。声明了 token 不证明对比度已通过，仍须按受影响前景/背景实测。

### 已安装 Sidebar Tool 共享页头：可见路径与唯一返回（现行）

同一宿主页头连续显示工具与子页路径，根页显示工具名，子页显示如「scrapyjs 采集/配置库」。只保留一个返回入口，逐级返回子页、工具根页、扩展列表；正文不重复同级标题、返回或主操作。不要把父子标题拆成各自伸展的 Flex 文本；完整 `title` / ARIA 补充可访问名称，不能替代可见路径。历史“只显示末级短标题、完整路径仅放提示”规则已失效。导航和草稿/busy 保护仍归原 owner，详见[唯一导航合同](sidebar-tool-navigation-contract-r1.zh-CN.md#同一宿主页头的可见路径与唯一返回现行)。

### Tailwind v4 `rem` 基线：必须避免 13px 根字号的隐性缩放

Tailwind v4 默认 `--spacing:0.25rem`、`text-xs:0.75rem`，默认 `sm:40rem` / `lg:64rem`。若 Workspace 将 `:root` 字号设为 **13px**，则 `gap-2` 实际只有 **6.5px**、`p-3` 只有 **9.75px**、`text-xs` 只有 **9.75px**，与本项目既定的 8/12/12px 尺寸不一致。**注意：媒体查询中的 `rem` 参照浏览器初始字号而非 CSS 设置的根字号**，因此普通浏览器下 `sm:40rem` 仍是约 640px；R27 修复的是组件实际间距和字号，而不是改写 Tailwind 默认断点。

Workspace **`:root{font-size:16px}`，紧凑正文只在 `body{font-size:13px}`**。这样 `1rem=16px`、`gap-2=8px`、`p-3=12px`、`text-xs=12px`，而未标注文本仍维持 13px 密度。不要在 Tailwind 文档根节点用 `font-size:13px` 来压缩全体尺寸；如需更紧凑，仅调整组件正文类/设计 token。Side Panel/Settings 使用原生 CSS 像素 token，并不要求各自的 `:root` 都改成 16px。

Tailwind 源码仍使用固定依赖版本、`@import "tailwindcss" source(none)` + 显式 `@source`，由 CLI 在构建时生成静态 CSS；以 `@apply` 整理复用区域，少量 utilities 可直接用于可信 Workspace 的 HTML。绝不动态拼接未知类名，也不从网站/工具输入读取任意类名作为运行时需求。包含 Preflight 的完整 Tailwind 产物只装进 Workspace 自己的受信页面，不注入 Side Panel、第三方工具或目标网站。

参考官方文档：[Tailwind v4 spacing](https://tailwindcss.com/docs/padding)、[响应式断点](https://tailwindcss.com/docs/responsive-design)、[显式扫描](https://tailwindcss.com/docs/detecting-classes-in-source-files)、[Preflight](https://tailwindcss.com/docs/preflight)。

## 3. 组件与区域组合约定

页面、区域、卡片、集合是组合角色，不是必须逐层嵌套的 DOM 模板。按真实信息关系选用：

- **页面**：`page` 负责滚动方向、最大宽度及外层 gutter；同一个页面不出现多个任意嵌套的页面容器。
  - **区域**：`section` 负责功能分组，组与组默认 16px；附属信息默认折叠，不占据首屏正文。
    - **卡片**：边框、背景、12px 内边距与 12px 圆角的所有权明确，只由卡片自身提供。
      - **工具栏**：按钮、搜索、筛选用 flex，`gap:8px`，宽度不足时换行；图标按钮必须有 `aria-label`、`title` 和可见焦点。
      - **表单行**：`od-form-field` 内标签、控件、说明/错误为紧密关联的 4px 节奏；工具栏标签与选项组之间用 8px；相邻独立字段组通常用 12px。控件常规高度 36px，字段错误与控件关联，不用第二层卡片包围整个正文。
      - **状态信息**：只在需要时出现；`hidden` 状态不预留空白；成功/错误/只读不能仅靠颜色表达。
      - **技术详情**：版本、SHA、权限诊断等低频项目放在可展开的 `details`，不能抢占主要编辑/操作空间。

### 间距所有权与集合选择（2026-11-10）

先确定两个元素的关系和共同父容器，再设置间距。`gap` 只作用于直接布局子项；React Fragment、额外 wrapper、隐藏节点和 Portal 必须按最终 DOM 核对，不能把外层写了 `od-stack` 当作行间距已经生效。

| 层级/关系 | 唯一负责人 | 组合原则 |
| --- | --- | --- |
| 页面到视口 | shell / 当前 surface | 页面 gutter 只应用一次；普通 Side Panel 由工作区负责，ToolHost/画布例外由 R20 维护 |
| 独立功能区之间 | 区域共同父容器 | 16px；任务集合到独立操作/结果区亦如此；按需参数 Sheet 的内部间距归 Sheet 自身。沿用集合底边分隔，不重复横线或第二重水平 padding，子区不补 margin 再叠一次 |
| 同区域页首、搜索、筛选与所属集合 | 区域布局容器 | 8px；只负责相邻关系，不给集合内部补页面 padding |
| 独立卡片内部 | 卡片内容层 | 12px；`od-surface--padded` 或真实 CardContent 二选一承担，不叠加两层 padding |
| 同类对象集合 | 集合自身 | 一层普通外框与外圆角、内部行分隔；行与行不再设卡片 gutter/独立圆角，分隔线不重复绘制 |
| 集合行内部 | 行布局与文案组 | 行内四周 12px、扩展图文 gap 8px、任务图文 gap 12px、名称到次信息 4px；不将这些值解释为相邻行之间的 gap |
| 控件组内部 | 工具栏/字段组/公共控件 | 同行操作 8px；字段紧密关联 4px；控件自身 padding 和命中尺寸归组件，不算页面 gutter |
| 集合与空/加载/错误状态 | 所属集合或区域 | 无数据时替换集合正文或就近显示，隐藏后不留空壳；错误恢复不只放 Toast |

**选择卡片还是集合：**重复的任务、扩展、普通记录优先连续集合；有独立摘要、审阅或编辑流程的功能区可使用独立卡片。集合被卡片包围时只保留一层有意义的边界。复杂树、会话、代码编辑器及权限审阅保持各自行为和布局，不因统一列表而机械改造成集合行。

2026-11-11 行内动作与参数调整：任务和扩展的菜单覆盖在完整行上，默认至少一个可见入口，悬停/聚焦跟随当前行；不为浮层另留 Grid 列或固定右 padding。重要状态放文字区，避免被覆盖。任务参数默认使用左侧内置标签的紧凑动态表单，可切换 JSON，仍由原 Schema 校验。新调整已做定向 Node 与 ego 源码预览；原 dev watcher 的并行 AI Proxy 来源锁阻塞使新原生运行态尚未验证，下一段评分只归原 `63879a1c…` 候选。

同日视觉完善：共享 Input/Textarea 的 React Aria 基底通过 MyControl 显式 opt-in 接入任务字段，其他字段与自定义工具不迁移。边框、聚焦由原 `od-input-group` 承担，业务 CSS 只布局左侧标签和右侧值；布尔行用可伸展标签加窄控件列，多行输入顶部对齐。模式切换采用共享 Button 与原 segmented 组合；不新建主题、Root、Portal 或执行 owner。当前 360px/320px 源码预览与相关 137 项 Node 检查通过，真实运行仍受上述来源锁阻塞。

现有 `design-system.css` 提供 `od-collection` / `od-collection-row`，扩展与我的共同消费；这是 CSS 组合类，不是新 React Collection API。源码预览及默认 360px 原生 Side Panel 已核对；任务参数使用同面板模态 Sheet，保留原表单、Schema 与执行权限链。Side Panel 的行选择、参数区位置、开发字段分组与五 Tab 映射见 [R20 集合布局](sidebar-design-system-r20.zh-CN.md#集合列表与独立参数区2026-11-10)。工作流/云控无当前缺陷则仅验证，不为套用共同规范批量改版。最终实现若调整只同步同一合同，不创建并列规范。

2026-11-11 独立复评：最终候选 `63879a1c65e8c698dcc451817f1151cd9b4bcb873ec1979083a5017bd3d4da13` 在默认 360×819 CSS px 原生 Side Panel 的本轮范围内获 `PASS_SCOPED`，综合 96.1/100、八维最低 95；[逐项评分与缺口](../../artifacts/five-tab-core-ui-20261111/review.json)绑定最终五 Tab 截图、只读 fixture 原验证/安装链及真实 Run→可见结果→Stop 回执。修正字段仅清除其所属的过期错误摘要，其他错误保持原 owner。此结论不覆盖 production、宽度/缩放矩阵、实体 OS IME、Native 本地项目或全部官方扩展安装验收。

原生 Side Panel 复用现有原语（不重新发明独立 utility 库）：

```html
<section class="od-page">
  <div class="od-toolbar"><strong>区块标题</strong><button class="od-icon-button" aria-label="刷新" title="刷新">…</button></div>
  <div class="od-stack">
    <div class="od-surface od-surface--padded"><!-- 公共类提供卡片内部留白 --></div>
  </div>
</section>
```

Native Workspace 独立编译 Tailwind 时，同等关系可写为：

```html
<section class="min-w-0 rounded-xl border p-3 md:p-4">
  <header class="flex min-w-0 flex-wrap items-center gap-2">…</header>
  <div class="mt-4 grid min-w-0 gap-3 md:grid-cols-2">…</div>
</section>
```

以上是布局约定示例，不是可直接塞进第三方 sandbox 的完整可执行工具。正式程序保留原 JS 生命周期、DOM ID、受信触发和已有数据写入语义。Vue/React 可选择对应组件封装，但仍需满足同样尺寸和作用域规则。

### R31：HTML 语义类即公共 CSS 外观契约（2026-10-15）

**唯一运行时权威：** `design-tokens.css` 定义全局语义值；`design-system.css` 实现可信 Side Panel 的 `od-*` 组件外观；`tool-shell.css` 只排列业务区块。Markdown/Skill 是开发约定，不是第二份 CSS 或尺寸配置。不得以 `#workbench-xxx > details > summary` 重新绘制标题高度、边框、圆角、背景、Hover、Focus 和暗色主题。

| 语义场景 | HTML 直接使用 | 现行规则 |
| --- | --- | --- |
| 一级独立可折叠功能区（包括当前网页、结果、参数、版本） | `<details class="od-disclosure"><summary>…</summary>…</details>` | 默认有边框和纸面、共享圆角、44px 最小标题高度，Hover/Focus 统一 |
| 内部技术信息、依赖 SHA、编译源码与历史 | `od-disclosure od-disclosure--flat` | 无外框的次级条目；默认 36px 标题，粗指针仍按 44px 处理 |
| 第一次使用说明 | `od-disclosure od-disclosure--info` | 只强调摘要标题，不给普通段落染色 |
| 普通内容卡片 | `od-surface od-surface--padded` | 共享边框、圆角和 12px 内边距；单独 `od-surface` 不自带内边距 |
| 控件、操作与结果 | `od-field`、`od-button`、`od-icon-button`、`od-toolbar`、`od-result` | 公共外观归 `design-system.css`；`od-toolbar` 负责同行对齐 |

同组内容使用 `od-stack` 的 8px gap；卡片内边距由 `od-surface--padded` 负责；独立主章节使用父容器的 `--space-4` 16px gap。开发页的来源行与当前网站属于一个上下文组，状态行与运行结果属于一个结果组，不能因为都在编辑页就把所有间距改成 12px。真实专用的编辑器尺寸、目标 URL 截断、状态色、局部滚动仍可由页面 CSS 维护，但不重绘公共 `summary` 外观。新增 Modifier 需先枚举至少两个语义一致的真实消费者。

这些 `od-*` 类可直接用于**加载了共享 CSS 的受信任 Sidebar HTML**；Native Workspace、Settings 与 Marketplace 仅映射视觉语义并保持各自样式构建，独立工具 opaque-origin iframe 及目标网页不得导入宿主 CSS/JS。结构性的源码合同与两 Tab 的真实 CSS 计算样式检查用于防退化；静态 Chrome、日常 `dist/development`、真实安装版及 Mac Chrome 缩放的证据等级必须分开，未运行标 `NOT_TESTED`。
### Side Panel 多功能区 Tab 的组合规范

**Side Panel 顶部和详情操作沿用 R30 记录的历史「工具」Tab 布局案例（现行产品入口是「扩展」）。** 使用 [R30 头部与垂直节奏细则](sidebar-design-system-r20.zh-CN.md#r30-工具-tab--工具详情作为跨-tab-排版基准2026-10-14)：12px 标题、34px 浅底带边框 icon、8px 同区域间隔、右侧所属区域动作。详情级动作进详情头部，结果/历史刷新等进各自区域头部；执行与权限确认仍保留明确的文字操作。本次开发页是首个增量消费者，不宣称其他历史页已全部迁移。

当一个现有 Tab 包含多个列表、独立功能区、创建表单、详情或设置，不要仅凭 `od-page/od-stack` 随意堆叠卡片；继承 [R28 多功能区 Tab 布局契约](sidebar-multi-section-tab-contract-r28.zh-CN.md)，以历史「工具」Tab 的 Index → Detail/Management 切换作为结构案例（现行扩展中心以 R4 统一列表为准），统一主次区域、返回、确认、信息密度与首屏优先级；确认展示按[公共确认与反馈合同](browser-framework/confirmation-and-feedback.zh-CN.md)选择，不固定要求行内插入。该契约**从属本 R27**，不重定义共享 Tokens 或扩展沙箱权限；首个完整改造目标为「我的 → 定时计划」及独立运行页。

## 4. 响应式、状态与无障碍验收

- 响应式设计保留 Side Panel 300/320/360/420/520 CSS px、大 Workspace 360/390/768/1024/1280/1440/1920px 及 125%/200% 缩放参考。它们是专项验收场景，不是每次开发或文档修订的必跑矩阵；是否执行以当前用户范围和 AGENTS.md 为准。
- `sm`（640px）、`md`（768px）、`lg`（1024px）是 Tailwind v4 默认的**下限**，不是“手机专用断点”。Side Panel 使用自身实际较窄的 CSS 媒体查询，禁止生搬 `lg` 断点压缩完整编辑器。
- 以 `min-width:0`、可换行标签、`minmax(0,1fr)`、局部 `overflow:auto` 避免横向溢出；独立 iframe 不可超出其宿主面板 `scrollWidth`。内容变化后应重新测量 iframe 高度，不预留 200px 无效留白。
- 键盘 Tab / Shift+Tab / Enter / Escape、焦点可见、重复打开/关闭、加载/空/错误/离线/已停用/保存中/长文本状态全部验收。普通文字对比度 WCAG AA ≥4.5:1（大字 ≥3:1）；不得依赖原生 `alert/confirm` 造成频繁打断。
- 颜色模式分别核对：目前部分历史界面仍有硬编码浅色背景，**共享 dark tokens 不等于所有界面已通过 dark-mode 验收**；不能据 `@media(prefers-color-scheme:dark)` 的存在宣称全站暗色达标。
- 遵守 `prefers-reduced-motion`；交互成功/失败显示可读状态，不进行自动重试带副作用的任务。样式修改不得影响网页授权、隔离 CSP、版本指纹、用户内容保留。

## 5. 工程验收门槛与独立评分

验证随本次变更选择；以下说明证据含义，不自动触发全量构建、浏览器、发布或评分。纯 Markdown 修订只检查规范一致性、源码引用、链接和差异。

1. **规范**：源码使用统一 tokens，单一页面 gutter、语义层级和适当的布局原语；例外有注释。
2. **组件**：受影响的 DOM IDs、ARIA、保存/删除和授权原生边界无回归；优先复用已有定向检查，不为可逆样式新增只断言源码字符串的测试。
3. **产物**：仅当本次改动需要产物证据时验证对应编译/资源加载；正式构建不替代现有 dev watcher。Workspace 相关变动才核对其静态 Tailwind 产物不含未处理指令与外链。
4. **视觉**：从真实扩展或静态 markup **分别标注证据级别**，对比不同宽度/缩放/状态，保留溢出、排版和焦点测量；人工 Mac Chrome 与 Linux 静态 Chrome 不能互换。
5. **安全**：沙箱不能因设计重用获得宿主权限，也不能放宽扩展 CSP；工具包更新继续经过用户确认。

专家评分逐项记录「布局统一、可读性、操作效率、响应式、无障碍、架构隔离、代码可维护性、测试证据」，每项都需有通过条件。**95/100 是各项的目标门槛，而不是静态检查后自动赋予的分数。** 任意一项仍为 `NOT_TESTED` 或存在阻断 FAIL，不得宣布全部评分 ≥95。

**例外记录与停止条件：**例外须指出真实消费者、用户行为、偏离的规则、布局/CSS owner、最小范围及待验证项，不能用“紧凑”泛化豁免字号、焦点和权限。已有 ToolHost、会话、编辑器及局部主题例外见 R20；新例外先在原 owner 解决，有跨消费者共同语义才提升到公共层。本轮文档以规则完整、引用有效、已有 dirty 保留为停止条件；实现、持久生效、浏览器视觉和评分由实施 owner 分别报告。

## 6. 现存差距与迁移方式

- R26 已修复网页笔记和宿主详情间距，R27 优先修正 Tailwind 的根字号对 `rem` 尺寸/断点的隐性影响；这两项不代表全部官方工具已跟随。
- `src/ui/tool-shell.css` 和部分独立工具仍含历史硬编码尺寸及互相覆盖的选择器，后续应**按功能和状态逐个迁移**；禁止一次性替换所有 CSS，避免破坏验证过的工具生命周期和原生页面。
- Marketplace 和 Settings 可继续保持原生 CSS，只需在各自的 CSS 内增量采用权威 tokens；复杂工具需要 Tailwind 时必须先有独立、受限、离线编译/打包合同。
- Workspace 修改 `:root` 可能改变历史截图对应的文字大小、间距和响应式断点，需要绑定新候选重新做视觉/缩放确认；不复用旧截图作为新候选 95 分证据。
