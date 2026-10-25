# OpenDesk Extension UI · R2.5 Layout Recipes / Group 组合手册

> 状态：`REFERENCE_SAVED / SOURCE_REVIEWED / JS_PARSE_PASS / BROWSER_NOT_TESTED`。该文档和演示页面只负责设计参考，不修改任何生产 UI、Host、SDK、安装器或工具包。审阅日期：2026-10-26；来源为当时 GitHub 最新 `main`。

- [R2.5 互动 HTML](../../prototypes/sidebar/extension-ui-showcase/r25-layout-patterns.html)
- [R2.5 源码索引](../../prototypes/sidebar/extension-ui-showcase/r25-source-index.zh-CN.md)
- [R2.3、R2.4 旧版入口](../../prototypes/sidebar/extension-ui-showcase/README.zh-CN.md)
- [原 R2.5 设计矩阵](./extension-ui-reference-patterns-r25.zh-CN.md)

## 1. 先选 Group 类型，不先选组件库

| 需求 | 首选语义与布局 | 明确不应使用 |
|---|---|---|
| 单一页面身份与高频动作 | Page Header + Action Group；1–2 高频按钮直显 | 重复宿主标题、8 个操作并列 |
| 多个独立主题 | **无边框 Section**：标题 + 间距即可 | 每一节都 Card、Card 套 Card |
| 同一目的的 2–5 项设置 | **有边界 Settings Group**：一层 `od-surface` | 每字段单独边框、主列表再放启停状态 |
| 一个可输入字段 | **Field Group**：label + 单表面 input，必要时内嵌前缀 / 清除 / 眼睛 | 额外边框套图标、小到不可触控的按钮 |
| 一组检索动作 | Search / Filter Toolbar：搜索优先，筛选次级 | 两行重复过滤栏 |
| 编辑完整对象 | 320–440px **完整子页面**；容器足够宽才并排详情 | 默认 PC Drawer 或大 Bottom Sheet |
| 低频诊断 / 高级属性 | Disclosure (`details/summary` 或既有组件) | 重要保存按钮藏进折叠 |
| 删除 / 卸载 / 撤权 | Danger / Permission Section + 独立确认 | 与普通保存混在同一个设置开关 |
| 结果未知 / 冲突 | 保留草稿 + 人工读回 / 核对 + 明确下一步 | 未知效果时自动重写、宣称成功 |

**Tokens 源头：** `src/ui/design-tokens.css` 定义 `--space-1` 至 `--space-4`、`--radius-control`、`--radius-surface`、`--od-icon-size`、语义配色与深色值；`src/ui/design-system.css` 定义 `.od-page-head`、`.od-stack`、`.od-surface`、`.od-input-group` 与 `.od-input-action`。**两文件属于可信 UI，不能自动注入任意网页或独立 Tool iframe。** HTML/React/Vue 共用布局决策，实际样式加载与权限通过各自既有构建和 SDK 契约。

## 2. 16 种 Pattern → 真实源码 → 交互与窄屏决策

表内代码摘录均可在所列源码定位，但需要**在原消费者上下文使用**；不要将局部表达式误以为可独立运行的新公共 API。

| ID | 用来完成什么 / 组件组合 | 真实源码 / 最小现有摘录 | 320–440px / 960px | 必要键盘与故障状态 |
|---|---|---|---|---|
| P01 Header | 当前页身份 + Action Group；不双标题 | `src/ui/react/tabs/develop-editor.tsx`：`className="developer-source-switch od-toolbar od-page-head"` | 图标收敛 / 仍单 Header | 图标 `aria-label`、焦点返回 |
| P02 Section/Group | 无边界主题 + 单层 Settings Group | `src/ui/design-system.css`：`.od-surface{min-width:0;background:var(--od-paper);border:1px solid var(--od-line);border-radius:var(--radius-surface)}` | 一列 / 可分栏 | 禁用/失权状态可理解，避免重复开关 |
| P03 Search | 单边框搜索 + 清除 + 次级筛选 | `src/ui/react/tabs/tools.tsx`：`<label className="ec-search" htmlFor="extension-center-search">` | 搜索优先 / 操作可展开 | 输入保持光标、Esc 关闭菜单、无结果可恢复 |
| P04 List Row | 主体 + 两行摘要 + 单个 More | `src/ui/extension-center.css`：`.ec-row-main{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:8px;width:100%}` | 一行主体 / 更多元数据 | 更多按钮可 Tab、选中与删除返回 |
| P05 Tree | 文件夹层级 + 搜索 + 虚拟化 | `examples/sidebar-tools/bookmark-manager/src/react/App.jsx`：`const rowHeight=TREE_ROW_HEIGHT,virtual=rows.length>120;` | 树独占 / 可 Inspector | 上下键、折叠展开、外部更改后重新读 |
| P06 List→Detail→Edit | 对象选择 + 完整详情 + 编辑草稿 | `examples/sidebar-tools/bookmark-manager/src/react/App.jsx`：`function dirtyDraft(d){return Boolean(d&&(d.title!==d.initial.title||d.url!==d.initial.url||d.parentId!==d.initial.parentId))}` | 完整子页面 / 并列 | 未保存离开保护、冲突保留草稿 |
| P07 Form/Input | 正文先行 + 选填按钮设置 Group | `examples/sidebar-tools/prompt-shortcuts/src/index.html`：`<textarea id="ps-body" class="od-field" rows="3"` | 主字段上置 / 紧凑字段适当同行 | 必填、8192 B、失败/未知状态 |
| P08 Code+Result | 编辑器 + Run/Stop + 回执 + 诊断折叠 | `src/ui/react/tabs/develop-execution.tsx`：`className="developer-run-feedback" role="status" aria-live="polite"` | 上下 / 可并排 | 区分运行/停止/未知，不虚报真正执行 |
| P09 Dense Data | Cookie 属性以 key-value 分组 | `examples/sidebar-tools/cookie-editor/src/index.html`：`id="browser-state" class="browser-state" role="group"` | 堆叠 / 非敏感项可两列 | 眼睛按钮、无权限保护、错误恢复 |
| P10 Import | 选择 → 校验 → 预览 → 确认 | `src/ui/react/tabs/tool-host.tsx`：`<ImportSheet open={importOpen}` | 独立全宽页 / 可摘要对照 | 取消零写入，解析不等于正式包 Schema |
| P11 Permission | 可信来源、网站范围、撤权后果 | `src/ui/react/tabs/tool-host.tsx`：`className="sidebar-tool-capabilities od-surface"` | 权限子页 / 可详情 | 真实状态只由 Host 查询，撤权二次确认 |
| P12 Menu/Dialog | 已定位 Popover + 高风险 Dialog | `src/ui/react/tabs/tools.tsx`：`menu.style.left=Math.max(gutter,Math.min(rect.right-width,screenW-width-gutter))+'px';` | 避免裁剪 / 保留定位 | Esc/Tab/方向键、焦点限制和恢复 |
| P13 Recovery | 保存失败、冲突、结果未知、权限撤权 | `examples/sidebar-tools/bookmark-manager/src/react/App.jsx`：`if(code==='E_OUTCOME_UNKNOWN')return (error.partialWrite?'部分写入风险':'写入结果未知')+'：已停止重复提交。请刷新核对数据后再决定。';` | 失败位置旁反馈 / 可诊断 | 结果未知不自动重试；手动读回 |
| P14 Locale | 日常语言与资源维护分离 | `src/ui/react/tabs/locale-manager.tsx`：`<span className="od-input-prefix" aria-hidden="true">BCP47</span>` | 日常少字段 / 维护页面 | 系统跟随、资源无效、存储未知 |
| P15 Responsive | Tree + Inspector 仅内容宽允许时并列 | `examples/sidebar-tools/bookmark-manager/src/react/App.jsx`：`data-testid="bookmark-inspector"` | 单子页 / 960 双栏 | 切换大小后可见，焦点和滚动不丢 |
| P16 Empty/Loading | 空态、加载、不可用都给下一步 | `src/ui/extension-center.css`：`.ec-list:empty{display:none}` | 单列 / 一致提示 | 清除搜索、重读、拒绝时解释原因 |

上述每个 Pattern 在 R2.5 HTML 右栏另有「使用 / 不使用 / 宽度 / 源码链接 / 最小摘录 / 适用框架」说明，左栏可以一键切至相应业务演示。**最小摘录不是完整函数合同；实际使用须连同原组件、事件和 CSS 一并理解。**

## 3. 可用于原消费者的真实示例

### 3.1 可信 React：已有 IconButton，不要造新按钮

`src/ui/react/components/ui/button.tsx` 已真实实现：

~~~tsx
export function IconButton({children,label,className='',...props}){
  if(!label)throw new Error('IconButton requires an accessible label');
  return <button type="button" {...props} title={props.title||label}
    aria-label={label} className={['od-icon-button',className].filter(Boolean).join(' ')}>
    {children}
  </button>;
}
~~~

具体业务用法参见 `src/ui/react/tabs/tools.tsx` 的 `ExtensionToolbar`。源文件内 `onToggleMenu`、`onImport` 等调用属于**已有真实 controller model 回调**；不代表向独立 Tool 开放新接口。

### 3.2 独立 HTML Tool：正文与选填按钮设置

实际文件 `examples/sidebar-tools/prompt-shortcuts/src/index.html`：

~~~html
<div class="ps-primary">
  <label for="ps-body" class="ps-sr-only">提示词正文（必填）</label>
  <textarea id="ps-body" class="od-field" rows="3" spellcheck="true"
    required aria-required="true" aria-describedby="ps-body-error ps-quota"
    placeholder="输入或粘贴内容，支持多行…"></textarea>
  <p id="ps-body-error" class="ps-inline-error" role="alert" hidden></p>
</div>
~~~

同一正式文件有 `.ps-optional.od-surface`、`ps-setting-fields`、`ps-compact-row`；其字段紧凑 CSS 定义于该工具 `src/style.css`。上方是**结构摘录**，不要替换正式完整表单。

### 3.3 可信 React / React Aria Switch

`src/ui/react/components/ui/switch.tsx` 的实际基础为：

~~~tsx
import {composeRenderProps,Switch as AriaSwitch} from 'react-aria-components';
export function Switch({className='',size='default',children,...props}){
  return <AriaSwitch data-slot="switch" data-size={size}
    className={['od-shared-switch',className].filter(Boolean).join(' ')}
    {...props}>
    {composeRenderProps(children,(content,{isSelected})=><>
      <span data-slot="switch-thumb" data-selected={isSelected||undefined}
        className="od-shared-switch-thumb" aria-hidden="true"/>
      {content}
    </>)}
  </AriaSwitch>;
}
~~~

完整行为由 React Aria 和使用者状态控制。HTML/Vue Tool 仅共用 UX 语义，不能从 iframe 运行宿主 React 组件。

### 3.4 未知结果不是可自动重试

`examples/sidebar-tools/bookmark-manager/src/react/App.jsx` 现有：

~~~js
function humanError(error){
  const code=error?.code||'';
  if(code==='E_OUTCOME_UNKNOWN')return (error.partialWrite?'部分写入风险':'写入结果未知')+'：已停止重复提交。请刷新核对数据后再决定。';
  if(code==='E_GRANT_REVOKED'||code==='E_BOOKMARK_PERMISSION')return '书签访问权限失效，请在工具设置中核对授权后重新打开。';
  if(code==='E_BOOKMARK_STALE')return '该书签已被外部修改或删除。原草稿已保留，请核对后再处理。';
  return error?.message||'操作未完成，请重试。';
}
~~~

**勿直接把 Bookmark 的错误代码复制到其他 Tool，声称其 SDK 会返回同样结果。** 要按各工具真实合同映射。

## 4. HTML、React、Vue 的复用边界

| 技术 | 应复用 | 不应复用 |
|---|---|---|
| 宿主可信 React | 正式 Tokens / Design System / `src/ui/react/components/ui/`，已有 React Aria 交互及现成 controller | 新 UI package、第二 Root、模拟业务 Owner |
| 独立 HTML Tool | 既有 Tool 自己的 CSS、获准 SDK，及 R2.5 业务 Pattern 的信息架构 | 直接注入宿主 stylesheet、绕过 sandbox 操作可信 DOM |
| 独立 React Tool | 该 Tool 的真实 bundler、CSS scope、组件与权限合同 | 默认假定任意工具都可以 import `src/ui/react/` 并继承 Host 权限 |
| 独立 Vue Tool | 已有 Vue SFC 管线、局部样式与相同业务组合决策 | 未公开的 TSX 控件、Host 私有事件或跨根 CSS |

注意：`bookmark-manager/src/react/App.jsx` 确实存在对共享 React `button.tsx` 的构建期导入；这只说明**该现有工具源码有此构建关系**，不证明任意新 Tool 都拥有同样的公共依赖合同，更不等于运行时可信授权。

## 5. 预览验收等级与差异登记

R2.5 当前独立 HTML 已保存：16 Pattern、6 Business、320/360/400/440/960、浅深色、长文本、搜索清除、列表到详情编辑、菜单和 Dialog、模拟写入成功/失败/未知、JSON_PARSE_ONLY 文件导入。内嵌 JavaScript 已通过**V8 语法解析**；这不构成点击测试。

`ALREADY_FIXED / 源码已经存在`：
- 统一语义 Tokens、`.od-input-group` 和 `.od-surface`。
- `IconButton` 必须有可访问 label。
- `tools.tsx#ExtensionRowMenu` 已包含 Portal 定位/焦点逻辑；`UninstallDialog` 有独立确认。
- Cookie Editor 已有 `cookie-value-toggle` 眼睛控件、窄屏表单规则。
- LocaleManager 已区分日常偏好与资源维护，并有存储未知状态检查。

真正待验证/可能需局部修复（**尚未认定正式源码存在缺陷**）：
1. **P0** R2.5 交互 HTML 的真实键盘/焦点闭环与 320px、200% 缩放，没有浏览器证据。
2. **P0** R2.5 的“源码摘录”仅是定位起点；实际 React 构建产物与演示内容的差异还需针对代表性场景核对。
3. **P1** Bookmark 320–440px Inspector 是否应从当前样式彻底改为独立详情子页，需真实 Chrome 视口核查。
4. **P1** `extension-ui-showcase.tsx` 的搜索图标、密码文字按钮、重复 `Row`/强制同行排版仍要判断是否展示层误导；不能据此重做已修好的 Cookie 正式输入。
5. **P1** Menu 下缘避让、Esc/Tab 与未保存保护、结果未知读回的跨场景交互测试缺失。

**未测试：** 实际 Mac Chrome、React 真正运行产物、Tool iframe、200% 缩放、无障碍自动化、Host/SDK/Chrome 权限与存储、正式安装升级，均为 `NOT_TESTED`。R2.5 仍为 `CHAT_ADAPTER_NOT_SOURCE_HTML`，只能做 UX 参考。

## 6. 与 R2.3 / R2.4 的区别

| 版本 | 不应丢失的贡献 | R2.5 只补什么 |
|---|---|---|
| R2.3 | 控件行为、基础状态与历史 React 同源入口 | 不重做基础组件 |
| R2.4 | 六类真实扩展任务的页面组织、输入细节与模拟操作 | 不复制或覆盖旧 HTML |
| R2.5 | **选布局 Pattern → 看 Group 组合 → 点击业务流程 → 找真实代码 → 检查信任边界 / 状态** | 作为可长期使用的参考索引，而非正式 Tab |

下一阶段仅在用户反馈页面体验后，给本地 Codex 定向测试/最小修复提示词，不在本轮修改生产工具代码。
