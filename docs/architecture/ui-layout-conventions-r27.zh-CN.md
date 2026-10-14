# OpenDesk Browser UI 布局与样式规范 · R27

日期：2026-10-12。状态：**现行跨界面规范**。适用于维护者新建 UI 和增量修改，不代表所有历史页面已迁移或完成原生验收。

这份文件是**跨界面使用约定**；具体变量唯一来源为 [`src/ui/design-tokens.css`](../../src/ui/design-tokens.css)。Side Panel 实施细则继续由 [Sidebar R20/R26](sidebar-design-system-r20.zh-CN.md) 维护，Native Workspace 历史构建/验收证据由 [R22 工作流](../framework/workstreams/native-workspace-tailwind-r22.zh-CN.md) 维护。不要复制出第二份颜色/间距权威表。

## 1. 技术选择与信任边界

| 产品界面 | 真实源码 | 样式及基线 | 禁止事项 |
| --- | --- | --- | --- |
| Side Panel 六个正式选项卡（开发版七个）、工具列表/详情 | `src/ui/tool.html`、`src/ui/design-system.css`、`src/ui/tool-shell.css` | 引用设计 token，使用 `od-page / od-toolbar / od-stack / od-surface / od-button / od-field` 原语 | 不因有 Tailwind 依赖就加载 Workspace CSS；不向 sandbox iframe 注入宿主 CSS |
| Native Workspace | `src/native-agent/workspace.tailwind.css`、`scripts/build-workspace-style.mjs` | **Tailwind CSS v4.3.3 离线编译**，token CSS 在构建阶段内联到单个 `workspace.css` | 不使用 CDN、浏览器端 JIT、`npx` 联网下载；不把 Tailwind Preflight 扩散到 Sidebar |
| Native Settings | `src/native-agent/settings.css` | 原生 CSS + 共享 tokens，页面允许自然滚动 | 不引入 Sidebar 的 `html,body{overflow:hidden}` |
| 应用市场扩展标签页 | `src/marketplace/marketplace.css` | 独立响应式排版 + 共享 tokens | 不直接复制窄 Side Panel 的布局约束 |
| 已安装侧栏工具（网页笔记、知识收件箱、阅读目录等） | `examples/sidebar-tools/*/src/style.css` | 独立 opaque-origin sandbox，每个工具自己的 CSS，只做数值和语义映射 | 不授予宿主 CSS/JS 或扩展权限，不动态引入远程 Tailwind/Quasar |
| 注入网页的 Page UI | `src/scripting/user-scripts/page-ui-mount.js` 等 | 明确的实例容器/ShadowRoot 或受控目标网页样式通道 | 不全局覆盖网站 reset；ShadowRoot 不是 JavaScript 安全沙箱 |

**隔离工具的特殊规则：**沙箱仍然使用自己的 CSS 文件，只映射与宿主一致的尺寸和视觉语义，绝不加载宿主 Preflight、特权脚本或完整应用设计系统。

**原则：统一视觉契约，不强制统一框架。** Quasar/Vue 的统一间距思想可以借鉴，但本仓库不是 Quasar 运行时；已使用 Tailwind 的页面只负责自己的隔离构建产物，不能要求所有原生小工具先编译才能使用。

## 2. 尺寸、间距、字体、色彩

基准空间单位为 **4px**。团队统一使用已有 `--space-1/2/3/4`，不是随时决定 `7px`、`9px`、`11px`。

| 场景 | 规范 | 原生 CSS | Tailwind v4（Workspace） |
| --- | --- | --- | --- |
| 紧密关联：文字与徽章、小提示 | 4px | `var(--space-1)` | `gap-1`, `mt-1` |
| 同行操作、表单标签与表单控件 | 8px | `var(--space-2)` | `gap-2`, `mt-2`, `py-2` |
| 容器/卡片留白、正文分组 | 12px | `var(--space-3)` | `p-3`, `gap-3` |
| 独立章节、跨组分隔 | 16px | `var(--space-4)` | `gap-4`, `mt-4`, `p-4` |
| 桌面大页面外层宽松留白 | 24px | `calc(var(--space-3) * 2)` | `p-6`, `lg:px-6` |
| 普通表单控件最小高度 | 36px | 既有控件 36px 规格 | `min-h-9` |
| 紧凑 Side Panel icon 按钮 | 34px | `var(--od-icon-size)` | 需要时使用 `size-(--od-icon-size)`，不能误写 `size-9` |
| 圆角：按钮 / 卡片 | 8px / 12px | `--radius-control` / `--radius-surface` | `rounded-lg` / `rounded-xl`（须核对实际生成值） |

- **一个容器只能有一个页面级 gutter 负责人**。Side Panel 宿主默认为 `--od-page-gutter:11px`，≤340px 为 9px；工具详情 iframe 由宿主铺成全宽，再由 sandbox 工具自己决定内部 12px。父子不能各加一层“页面” padding。弹窗、卡片内部留白不属于页面 gutter。
- 字体层级遵循角色：11px 技术辅助、12px 次要说明、13px Side Panel 密集正文、14px Settings/大页面普通正文、16px 组标题、20–24px 页面主标题（桌面按层级可调整）。11px 不能承载重要的错误解决步骤或主要操作；正文按可读性优先。
- 控件尺寸：桌面图标操作 34px、普通表单至少 36px；粗指针/触摸界面宜提供至少 44×44px 的实际点击区域。长中文、URL、Zoom 200% 时应自然换行；操作只因有足够空间才允许同一行显示。
- 颜色、边框、状态色以 `--od-ink`、`--od-sub`、`--od-line`、`--od-paper`、`--od-bg`、`--od-brand`、`--od-positive`、`--od-negative` 为权威。新功能不得随意新造高对比度不足的灰色作为正文；危险操作必须具备文字/ARIA，不仅用红色识别。
- 布局选 `flex/grid + gap`，不以给每个孩子加不同方向 margin 模拟 gap。横向 flex 子元素需要 `min-width:0`，固定列应使用 `minmax(0,1fr)`，长文字可换行或局部滚动，页面不得横向滚动。
- 只有真实职责差异（例如固定 232px 目录栏、编辑器最小高度、网站注入 UI 定位、滚动容器）才允许独立数值；在 CSS 旁说明原因并有对应响应式/视觉检查。**禁止为通过检测而到处堆 `!important` 或覆盖原选择器。**

### Tailwind v4 `rem` 基线：必须避免 13px 根字号的隐性缩放

Tailwind v4 默认 `--spacing:0.25rem`、`text-xs:0.75rem`，默认 `sm:40rem` / `lg:64rem`。若 Workspace 将 `:root` 字号设为 **13px**，则 `gap-2` 实际只有 **6.5px**、`p-3` 只有 **9.75px**、`text-xs` 只有 **9.75px**，与本项目既定的 8/12/12px 尺寸不一致。**注意：媒体查询中的 `rem` 参照浏览器初始字号而非 CSS 设置的根字号**，因此普通浏览器下 `sm:40rem` 仍是约 640px；R27 修复的是组件实际间距和字号，而不是改写 Tailwind 默认断点。

Workspace **`:root{font-size:16px}`，紧凑正文只在 `body{font-size:13px}`**。这样 `1rem=16px`、`gap-2=8px`、`p-3=12px`、`text-xs=12px`，而未标注文本仍维持 13px 密度。不要在 Tailwind 文档根节点用 `font-size:13px` 来压缩全体尺寸；如需更紧凑，仅调整组件正文类/设计 token。Side Panel/Settings 使用原生 CSS 像素 token，并不要求各自的 `:root` 都改成 16px。

Tailwind 源码仍使用固定依赖版本、`@import "tailwindcss" source(none)` + 显式 `@source`，由 CLI 在构建时生成静态 CSS；以 `@apply` 整理复用区域，少量 utilities 可直接用于可信 Workspace 的 HTML。绝不动态拼接未知类名，也不从网站/工具输入读取任意类名作为运行时需求。包含 Preflight 的完整 Tailwind 产物只装进 Workspace 自己的受信页面，不注入 Side Panel、第三方工具或目标网站。

参考官方文档：[Tailwind v4 spacing](https://tailwindcss.com/docs/padding)、[响应式断点](https://tailwindcss.com/docs/responsive-design)、[显式扫描](https://tailwindcss.com/docs/detecting-classes-in-source-files)、[Preflight](https://tailwindcss.com/docs/preflight)。

## 3. 组件与区域组合约定

所有产品页面尽可能按下列层次描述：

- **页面**：`page` 负责滚动方向、最大宽度及外层 gutter；同一个页面不出现多个任意嵌套的页面容器。
  - **区域**：`section` 负责功能分组，组与组默认 16px；附属信息默认折叠，不占据首屏正文。
    - **卡片**：边框、背景、12px 内边距与 12px 圆角的所有权明确，只由卡片自身提供。
      - **工具栏**：按钮、搜索、筛选用 flex，`gap:8px`，宽度不足时换行；图标按钮必须有 `aria-label`、`title` 和可见焦点。
      - **表单行**：标签与字段按 8px 间隔、控件常规高度 36px，字段错误与控件关联，不用第二层卡片包围整个正文。
      - **状态信息**：只在需要时出现；`hidden` 状态不预留空白；成功/错误/只读不能仅靠颜色表达。
      - **技术详情**：版本、SHA、权限诊断等低频项目放在可展开的 `details`，不能抢占主要编辑/操作空间。

原生 Side Panel 复用现有原语（不重新发明独立 utility 库）：

```html
<section class="od-page">
  <div class="od-toolbar"><strong>区块标题</strong><button class="od-icon-button" aria-label="刷新" title="刷新">…</button></div>
  <div class="od-stack">
    <div class="od-surface"><!-- 卡片内部用当前区域约定的 12px 内边距 --></div>
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

### Side Panel 多功能区 Tab 的组合规范

**Side Panel 顶部和详情操作的视觉基准为「工具」Tab。** 使用 [R30 头部与垂直节奏细则](sidebar-design-system-r20.zh-CN.md#r30-工具-tab--工具详情作为跨-tab-排版基准2026-10-14)：12px 标题、34px 浅底带边框 icon、8px 同区域间隔、右侧所属区域动作。详情级动作进详情头部，结果/历史刷新等进各自区域头部；执行与权限确认仍保留明确的文字操作。本次开发页是首个增量消费者，不宣称其他历史页已全部迁移。

当一个现有 Tab 包含多个列表、独立功能区、创建表单、详情或设置，不要仅凭 `od-page/od-stack` 随意堆叠卡片；继承 [R28 多功能区 Tab 布局契约](sidebar-multi-section-tab-contract-r28.zh-CN.md)，以「工具」Tab 真实 Index → Detail/Management 切换为参照，统一主次区域、返回、内联确认、信息密度与首屏优先级。该契约**从属本 R27**，不重定义共享 Tokens 或扩展沙箱权限；首个完整改造目标为「我的 → 定时计划」及独立运行页。

## 4. 响应式、状态与无障碍验收

- Side Panel 宽度 300/320/360/420/520 CSS px；大 Workspace 至少 360/390/768/1024/1280/1440/1920px；所有相关界面覆盖 125% 和 200% 浏览器缩放。
- `sm`（640px）、`md`（768px）、`lg`（1024px）是 Tailwind v4 默认的**下限**，不是“手机专用断点”。Side Panel 使用自身实际较窄的 CSS 媒体查询，禁止生搬 `lg` 断点压缩完整编辑器。
- 以 `min-width:0`、可换行标签、`minmax(0,1fr)`、局部 `overflow:auto` 避免横向溢出；独立 iframe 不可超出其宿主面板 `scrollWidth`。内容变化后应重新测量 iframe 高度，不预留 200px 无效留白。
- 键盘 Tab / Shift+Tab / Enter / Escape、焦点可见、重复打开/关闭、加载/空/错误/离线/已停用/保存中/长文本状态全部验收。普通文字对比度 WCAG AA ≥4.5:1（大字 ≥3:1）；不得依赖原生 `alert/confirm` 造成频繁打断。
- 颜色模式分别核对：目前部分历史界面仍有硬编码浅色背景，**共享 dark tokens 不等于所有界面已通过 dark-mode 验收**；不能据 `@media(prefers-color-scheme:dark)` 的存在宣称全站暗色达标。
- 遵守 `prefers-reduced-motion`；交互成功/失败显示可读状态，不进行自动重试带副作用的任务。样式修改不得影响网页授权、隔离 CSP、版本指纹、用户内容保留。

## 5. 工程验收门槛与独立评分

新 UI 提交需要至少满足：

1. **规范**：源码使用统一 tokens，单一页面 gutter、语义层级和适当的布局原语；例外有注释。
2. **组件**：受影响的 DOM IDs、ARIA、保存/删除和授权原生边界无回归；新增静态契约测试加入 CI。
3. **构建**：`npm run check`、生产/开发构建、`npm run verify` 成功；Tailwind CSS 构建后无 `@import/@source/@apply` 与外链。
4. **视觉**：从真实扩展或静态 markup **分别标注证据级别**，对比不同宽度/缩放/状态，保留溢出、排版和焦点测量；人工 Mac Chrome 与 Linux 静态 Chrome 不能互换。
5. **安全**：沙箱不能因设计重用获得宿主权限，也不能放宽扩展 CSP；工具包更新继续经过用户确认。

专家评分逐项记录「布局统一、可读性、操作效率、响应式、无障碍、架构隔离、代码可维护性、测试证据」，每项都需有通过条件。**95/100 是各项的目标门槛，而不是静态检查后自动赋予的分数。** 任意一项仍为 `NOT_TESTED` 或存在阻断 FAIL，不得宣布全部评分 ≥95。

## 6. 现存差距与迁移方式

- R26 已修复网页笔记和宿主详情间距，R27 优先修正 Tailwind 的根字号对 `rem` 尺寸/断点的隐性影响；这两项不代表全部官方工具已跟随。
- `src/ui/tool-shell.css` 和部分独立工具仍含历史硬编码尺寸及互相覆盖的选择器，后续应**按功能和状态逐个迁移**；禁止一次性替换所有 CSS，避免破坏验证过的工具生命周期和原生页面。
- Marketplace 和 Settings 可继续保持原生 CSS，只需在各自的 CSS 内增量采用权威 tokens；复杂工具需要 Tailwind 时必须先有独立、受限、离线编译/打包合同。
- Workspace 修改 `:root` 可能改变历史截图对应的文字大小、间距和响应式断点，需要绑定新候选重新做视觉/缩放确认；不复用旧截图作为新候选 95 分证据。
