# OpenDesk Browser Preview Contract R1 — 构建期设计复用与离线模拟

日期：2026-10-15；2026-10-30 增量修订。适用：独立 Sidebar Tool，首个样板 quick-notes。网页对话的可编辑设计稿采用已有 [Sidebar Preview Kit](../../api/sidebar-preview-kit.zh-CN.md)；本方案只实现正式工具源码同源预览，二者共享规范但不混淆证据级别。此文仅描述**构建和验证契约**，不复制设计 Token、颜色/尺寸表。权威视觉规则：
- ../ui-layout-conventions-r27.zh-CN.md
- ../sidebar-design-system-r20.zh-CN.md
- ../../../src/ui/design-tokens.css
- ../../../src/ui/design-system.css

## 真实根因与边界

正式 Side Panel 使用 canonical Token + od-* 语义组件；旧 quick-notes/src/style.css 则手写一套按钮颜色、边框、字号及表单状态。沙箱预览会复用真正 UI 包，但无法单独保证当前 ChatGPT 对话输出的任意 HTML 也遵循正式设计。原仓库 scripts/stage-sidebar-tool.mjs / src/ui/sidebar-tools/preview-session.js 用于安装前受控沙箱会话，不是单文件离线设计预览。

沙箱是无扩展特权的 opaque-origin iframe，正式扩展的全局 CSS 与安全能力不能直接加载。R1 不复制完整宿主 CSS，也不绕过这条安全边界。构建时仅从 canonical CSS 提取通用基础选择器和从 Shared primitives 边界内选取的语义组件样式，连同原 Token 声明嵌入独立工具发行 CSS。样式所有权仍由这两份正式 CSS 维护。工具独立样式只允许布局、内容流和工具专属列表选择状态，不拥有按钮、颜色字面值或 Token。

## 唯一构建链

    src/ui/design-tokens.css + src/ui/design-system.css
       |-- scripts/preview/shared-tool-design.mjs (fail closed; CSS only)
       |-- scripts/build-sidebar-tool.mjs (官方包构建；opt-in)
              |-- 安装用 opendesk-tool.json
              |-- scripts/preview/build-preview.mjs (同包 HTML/CSS/JS)
                       |-- opaque sandbox iframe
                       |-- scripts/preview/quick-notes-mock.js (仅替换 SDK 边界)
                       |-- 离线 HTML + 来源/模式/主题/模拟声明

两个既有预览生成器共同消费 `scripts/templates/sidebar-tool-preview-shell.html`，作为唯一完整宿主 DOM；`scripts/preview/sidebar-shell-behavior.js` 是唯一共享导航、返回及模拟卸载行为。`scripts/templates/sidebar-preview.html` 仅是设计内容/模拟逻辑 fragment，kit 仍输出完整单文件 HTML、prompt 和 manifest。共享 helper 配置只读、纯模拟，不写入平台，也不改变公开 API。

两个既有预览生成器共用 `scripts/preview/sidebar-shell-source.mjs`，从真实 `src/ui/react/` 导航/工具栏及 `src/ui/tool-shell.css` 提取基础壳。React SSR 当前含 7 项，预览仅显示正式五 Tab；隐藏的 `app-debug` 等项目不应触发硬编码总数失败，也不载入其业务。

正式静态工具页面和预览内 iframe 的布局标记、业务 JS、编译后 CSS 必须来自同一次官方构建接口 createSidebarToolPackage()，禁止另存或手写第二份工具 UI。R1 无法为 HTML/JSX/Vue 创建通用热重载编辑器，不声明该能力。

既有生成入口（实际证据见本轮生成文件与报告，示例不代表已通过验证）：

    node scripts/build-sidebar-tool.mjs projects/quick-notes --out artifacts/quick-notes-contract.opendesk-tool.json
    node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760

默认预览：artifacts/previews/quick-notes/side-panel-success-light-360.html。文件可通过 file:// 离线打开；CSS、图像与 JS 皆已内联为 CSS 文本或 data URI。所有网络请求由 iframe CSP 阻止；sandbox 只允许脚本，不授予 allow-same-origin、弹窗、下载或表单。显示的“离线模拟”声明必须保留。

输入：固定工具 ID、surface、scenario、theme、width、height。输出元数据包含 sourceCommit（Git HEAD）、designSha256、uiSha256、toolVersion、build 版本、模拟操作及明确“非安装/无权限”。不能只用 HEAD 判定未提交样式的身份，应同时比对文件源码锁和构建摘要。相同源码和参数必须得到字节一致的 HTML，不含时间戳和随机 ID。

## 模拟能力与失败闭锁

quick-notes 模拟适配器处理的边界为 storage.get、storage.set、currentPage.info、tasks.open。模拟存储仅驻留 iframe 内存，etag 仅供状态机模拟；支持的场景为 `success / permission-denied / revoked / loading / empty / error / untrusted / long`。外部控件切换场景、工具主题或恢复时重建纯内存 iframe，并明确提示模拟数据会重置；不伪装真实授权、撤权或持久化恢复。宿主始终 light，light/dark 只改变工具应用。重置只涉及模拟内存，没有真实结果未知（unknown）的操作；产品未知副作用保护不变。tasks.open 永不执行真实任务；currentPage.info 只返回明确的虚拟域名。所有内容由真实业务 JS 的 textContent 路径渲染。预览不接触已安装工具、真实站点、磁盘或 Chrome API。

bookmark-manager 外部选择支持既有六场景 `success / empty / error / loading / permission-denied / untrusted` 及 light/dark，切换同样重建内存 iframe。8 项专属 lab 另用于运行时故障及 revoke/restore；不支持 quick-notes 的 `revoked / long` 场景值，`revoke` 命令与 `revoked` 场景不可混用。未接入控件的工具明确不支持。

设计稿只允许修改 `#od-preview-app` 内部，以及 `#od-preview-behavior` 中 `/* DESIGN_APP_BEHAVIOR */` 之后的工具逻辑；前面的共享宿主交互由 check 保护。顶部正式工具标题已有 `role="heading"`，应用无重复 `h1`。未保存表单期间禁用外部状态/主题/恢复，取消或 Escape 返回后恢复这些控件。

尚无可靠正式注入 UI Adapter 或独立页面 Adapter：请求这些 surface 时 fail closed；不使用漂亮但不相同的 iframe 结果冒充真实 ShadowRoot/弹窗。

## CI、新鲜度和反例

来源变更后按需执行相关检查；结果以生成文件和报告记录为准，生成成功不等于交互终验或测试 PASS，不默认启动 Browser 构建或完整 CI。

    node scripts/preview/check-preview-contract.mjs
    node --test tests/environment/sidebar-preview-contract.test.mjs tests/environment/sidebar-quick-notes.test.mjs

contracts/ui-preview/quick-notes.lock.json 是**输入源码的 Git blob SHA-1 映射**，与 HTML 元数据的 SHA-256 是不同用途。Token、正式组件、工具 UI、Mock 和 builder 任何变化都必须先重新生成预览、审核差异，再显式执行：

    node scripts/preview/check-preview-contract.mjs --update-lock

仅执行生成不会悄悄修改来源锁。CI 根据实际磁盘字节计算 Git blob SHA，逐文件拒绝过期锁；测试另验证两次独立生成结果完全一致，且模拟私有按钮颜色和更改 token 哈希时**必须失败**。这不意味着视觉检查已经通过。

## 历史真实验收矩阵（按需另行触发）

以下保留历史对照方法，不作为普通离线模板迭代前置。多档缩放及物理宽度矩阵默认 OUT_OF_SCOPE；安装、完整矩阵和评分仅在用户当前明确要求时执行。

基于当前 source SHA/package SHA，安装正式扩展和 quick-notes，先在真实 Side Panel sandbox iframe 中截图，再打开相同输入的离线预览 HTML。逐组使用同视口 320/360/400/480、真实浏览器 zoom 100/125/150%、light/dark、空数据/加载/故障、长中文/长 URL/不可信标签字符串。

对每组记录：Chrome/CFT 版本与候选 SHA、实际扩展 ID 与工具版本、截图文件和 SHA、DOM 中 od-* 组件来源、font-family/font-size/height/width/padding/background/border/radius/focus-outline 的 computed-style 对照、scrollWidth、可见焦点、键盘操作、控制台错误。设置鼠标 hover/active/disabled、列表选择、删除确认与返回；实际权限与磁盘存储仅验正式安装，模拟状态单独标识。不要通过放宽像素阈值掩盖失真。

源文件已改≠构建 PASS；CI Node PASS≠真实安装 PASS；离线 HTML≠已安装工具。按当前阶段记录证据；历史 GOAL 权重和 95 分评分不作为离线预览前置，无同候选原生证据则标 `NATIVE_CHROME=NOT_TESTED`。

## 扩展到其他工具时

先审计工具发行平台和正式挂载形式。再保留它原有 SDK 行为，新增专有模拟 SDK 边界，并把静态 HTML/CSS/JS 构建升级为与正式产品一致的契约。禁止把 Mock SDK 合入安装包或把第一方宿主特权脚本放入动态工具 iframe。首个样板验证后，再评估组件抽取而非一次性重写所有旧工具。

## R1.4：诊断控件归属与选择/编辑状态边界

书签 R2.8 暴露出两种容易被 Mock PASS 掩盖的 UI 混淆：其一，将“预览实验台”直接挂在 iframe 的 \`#tool-root\` 前，用户看到的工具似乎内置了测试菜单；其二，编辑时点击其他书签，由于未保存草稿确认提示位于编辑器底部，用户误以为点击新书签直接弹出了编辑器。这两种表现均违反正式产品交互归属。

必须遵守：

1. **生产内层**：工具真实 owner 下的 `src/` 与官方 \`createSidebarToolPackage()\` 的 HTML/CSS/JS 只呈现真正安装后的业务 UI。条目点击首先只读详情；明确点击“编辑”才转为表单。

2. **共享模板与专有 adapter**：允许为跨工具复用增加外部状态/工具主题/恢复辅助区，并同步来源锁及受影响检查；不要求无关工具字节永远不变。书签专有诊断 CSS、脚本和固定 8 项命令仍仅由目标 adapter 提供，其他工具不含书签 lab；未接入公共控件的工具明确显示不支持。
3. **预览外层**：测试操作板只能作为 \`scripts/templates/sidebar-tool-preview-shell.html\` 中模拟设备区 **之外** 的 \`aside\`/折叠区出现，由 builder 为需要的工具显式启用。没有测试需求的其他工具不能显示书签实验台。正式安装 JSON 不得打包外层测试代码。
4. **消息与权限**：外层 \`bookmark-manager-lab.js\` 的固定 8 项命令通过 \`postMessage\` 给 opaque iframe 中的 \`bookmark-manager-mock.js\`。内层检查 \`event.source===parent\`、精确消息类型、请求 ID、命令白名单；外层检查 \`event.source===iframe.contentWindow\`、opaque 来源 \`null\`、请求一致性再显示回执。消息只触发内存故障模拟，不获得真实书签/权限、网络、Storage 或 Host 写入能力。工具沙箱继续 **仅** \`sandbox="allow-scripts"\`。
5. **草稿与选择**：切换到其他书签时，干净的表单直接关闭并显示新节点只读详情；脏草稿维持旧选择、暂停编辑呈现并展示目标名称和保留/放弃操作，不能默许丢弃或自动保存；确认放弃后打开新节点**只读**详情；Escape/保留返回原草稿与焦点。
6. **证据分级**：按当前改动选择正式包/内层无辅助控件、外层归属及 Mock 状态交互检查；书签 read/edit/dirty-switch 与大数据回归仅在相关变更影响它们时执行，不把历史整组回归作为离线预览前置。Source-Bound/Mock 不升级为正式 Chrome Native PASS。更改模板/packer/工具 UI 后更新同候选源码锁，并记录失败与跨 Agent 输入变动。
