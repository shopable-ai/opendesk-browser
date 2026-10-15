# OpenDesk Browser Preview Contract R1 — 构建期设计复用与离线模拟

日期：2026-10-15。适用：独立 Sidebar Tool，首个样板 quick-notes。网页对话的可编辑设计稿采用已有 [Sidebar Preview Kit](../../api/sidebar-preview-kit.zh-CN.md)；本方案只实现正式工具源码同源预览，二者共享规范但不混淆证据级别。此文仅描述**构建和验证契约**，不复制设计 Token、颜色/尺寸表。权威视觉规则：
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

正式静态工具页面和预览内 iframe 的布局标记、业务 JS、编译后 CSS 必须来自同一次官方构建接口 createSidebarToolPackage()，禁止另存或手写第二份工具 UI。R1 无法为 HTML/JSX/Vue 创建通用热重载编辑器，不声明该能力。

构建：

    node scripts/build-sidebar-tool.mjs examples/sidebar-tools/quick-notes --out artifacts/quick-notes-contract.opendesk-tool.json
    node scripts/preview/build-preview.mjs --tool quick-notes --surface side-panel --scenario success --theme light --width 360 --height 760

默认预览：artifacts/previews/quick-notes/side-panel-success-light-360.html。文件可通过 file:// 离线打开；CSS、图像与 JS 皆已内联为 CSS 文本或 data URI。所有网络请求由 iframe CSP 阻止；sandbox 只允许脚本，不授予 allow-same-origin、弹窗、下载或表单。显示的“离线模拟”声明必须保留。

输入：固定工具 ID、surface、scenario、theme、width、height。输出元数据包含 sourceCommit（Git HEAD）、designSha256、uiSha256、toolVersion、build 版本、模拟操作及明确“非安装/无权限”。不能只用 HEAD 判定未提交样式的身份，应同时比对文件源码锁和构建摘要。相同源码和参数必须得到字节一致的 HTML，不含时间戳和随机 ID。

## 模拟能力与失败闭锁

现有模拟适配器只处理 quick-notes 的 storage.get、storage.set、currentPage.info、tasks.open。模拟存储仅驻留 iframe 内存，etag 仅供状态机模拟；成功/空/故障/持续加载/权限不足及恶意文本五类边界可复现。tasks.open 永不执行真实任务；currentPage.info 只返回明确的虚拟域名。所有内容由真实业务 JS 的 textContent 路径渲染。预览不接触已安装工具、真实站点、磁盘或 Chrome API。

尚无可靠正式注入 UI Adapter 或独立页面 Adapter：请求这些 surface 时 fail closed；不使用漂亮但不相同的 iframe 结果冒充真实 ShadowRoot/弹窗。

## CI、新鲜度和反例

    node scripts/preview/check-preview-contract.mjs
    node --test tests/environment/sidebar-preview-contract.test.mjs tests/environment/sidebar-quick-notes.test.mjs

contracts/ui-preview/quick-notes.lock.json 是**输入源码的 Git blob SHA-1 映射**，与 HTML 元数据的 SHA-256 是不同用途。Token、正式组件、工具 UI、Mock 和 builder 任何变化都必须先重新生成预览、审核差异，再显式执行：

    node scripts/preview/check-preview-contract.mjs --update-lock

仅执行生成不会悄悄修改来源锁。CI 根据实际磁盘字节计算 Git blob SHA，逐文件拒绝过期锁；测试另验证两次独立生成结果完全一致，且模拟私有按钮颜色和更改 token 哈希时**必须失败**。这不意味着视觉检查已经通过。

## 本地真实验收矩阵（本轮不代跑 Mac Chrome）

基于当前 source SHA/package SHA，安装正式扩展和 quick-notes，先在真实 Side Panel sandbox iframe 中截图，再打开相同输入的离线预览 HTML。逐组使用同视口 320/360/400/480、真实浏览器 zoom 100/125/150%、light/dark、空数据/加载/故障、长中文/长 URL/不可信标签字符串。

对每组记录：Chrome/CFT 版本与候选 SHA、实际扩展 ID 与工具版本、截图文件和 SHA、DOM 中 od-* 组件来源、font-family/font-size/height/width/padding/background/border/radius/focus-outline 的 computed-style 对照、scrollWidth、可见焦点、键盘操作、控制台错误。设置鼠标 hover/active/disabled、列表选择、删除确认与返回；实际权限与磁盘存储仅验正式安装，模拟状态单独标识。不要通过放宽像素阈值掩盖失真。

源文件已改≠构建 PASS；CI Node PASS≠真实安装 PASS；离线 HTML≠已安装工具。R1 每项交付按目标 GOAL 的五维权重记录证据，Mac 原生对照未完成时不能给总分 95+。

## 扩展到其他工具时

先审计工具发行平台和正式挂载形式。再保留它原有 SDK 行为，新增专有模拟 SDK 边界，并把静态 HTML/CSS/JS 构建升级为与正式产品一致的契约。禁止把 Mock SDK 合入安装包或把第一方宿主特权脚本放入动态工具 iframe。首个样板验证后，再评估组件抽取而非一次性重写所有旧工具。