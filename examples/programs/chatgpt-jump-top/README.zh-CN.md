# ChatGPT 长内容回顶 · OpenDesk Page 增强（R0.2）

仅面向 `https://chatgpt.com/*` 的顶层 Page USER_SCRIPT，复用 `@opendesk/ui` 和现有 Page Authority。R0.2 修复区域绑定与滚动定位；**真实已登录 ChatGPT 与正式安装验收尚未通过，不能声明 UX 95+。**

## 按钮在哪里

- 在可明确关联长内容的原生 `header` 内，紧邻 `Open editor`；没有该按钮时使用同栏最后一个原生操作按钮作为插入位置。按钮为 34 × 34px，继承页面颜色，使用原生 `button`、中文 aria-label/title 和可见键盘焦点。
- 操作栏与目标分别保存。优先使用原生按钮的唯一 `aria-controls`；否则只接受同一局部容器里唯一的内容节点与唯一工具栏。候选内容包括 `pre`、消息正文节点、`textarea`、可编辑区域。不依赖 CSS 类名、SVG 内容或资源哈希。
- 各独立长内容最多一枚按钮。模糊关联、隐藏区域、侧栏、弹窗、没有有效滚动距离的区域不插入。消息没有可确认的操作栏时，也不会随意新增操作栏。
- 全局回退只用于明确的对话顶部工具栏，目标为第一条对话消息。含 `Open editor` 却无法解析目标的工具栏不会被当成全局工具栏。这是源码策略，**尚未由指定的登录态页面确认其真实结构**。

## 点击后到哪里

目标为绑定内容元素的真实布局起点，绝不使用 Sticky 工具栏当前的视觉坐标。普通内容只操作最近的实际纵向滚动容器；独立编辑器只操作自身，无法确认自身滚动时拒绝执行。

普通内容首先以 `目标矩形.top − 滚动口.top + scrollTop − 12px` 计算绝对落点，并限制在有效范围。随后读取落点处 Sticky/Fixed 元素的真实矩形，按目标与滚动口的横向交集、首行高度和实际遮挡再做最多一次同步补偿。不会预测下方尚未吸顶的工具栏，也不会将其他栏位的工具栏算成遮挡。两次操作均为 `instant`，由一次点击完成。12px 是可见间距，遮挡高度来自实时几何；原生工具栏解除吸顶后仍按其自然布局排列。

独立编辑器直接回到自身 `scrollTop=0`，保留外层和横向滚动值。不写入正文、输入值、草稿、光标、选区或编辑状态；不采集或上传对话内容。

## 动态页面与清理

React 替换工具栏、内容、整个 `main`，或仅移除注入按钮时，重新建立绑定。点击时再次核对身份，旧按钮不能操作新内容。观察相关 DOM/ID 变化并以 120ms 合并刷新；忽略自身插入、侧栏无关变化，无滚动事件扫描。存在显式 ID 关联时，每轮只建立一次 ID 索引；没有关联时不扫描全页 ID。

同模块重装先清理旧实例。事件、Observer、延时和宿主沿用受管生命周期；Stop 清理已在组件级浏览器测试验证。真实 Authority 停用、撤权及卸载仍为 `NOT_TESTED`，不能以合成 owner 替代。

## 构建与交付

从仓库根目录执行：

```bash
node --test examples/programs/chatgpt-jump-top/tests/conversation.test.mjs tests/environment/chatgpt-jump-top.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-jump-top
npm run build:program -- examples/programs/chatgpt-jump-top
```

正式格式的离线包为 [`chatgpt-jump-top.opendesk-page.json`](chatgpt-jump-top.opendesk-page.json)，固定身份 `opendesk.chatgpt-jump-top`、版本 `0.2.0`、revision `2`。它由原有 `build-page-install-package.mjs` 从编译草稿逐字节生成并校验，**没有携带安装授权或运行证明**。编译产物的 `BUILT_UNVERIFIED` 不表示正式安装成功。

本地开发入口仍为 `opendesk browser dev "$PWD/examples/programs/chatgpt-jump-top"`，然后通过现有界面明确 Run。正式包走「扩展 → 导入」和原有审阅/Authority 流程；提交源码不会自动升级浏览器。

## 本轮证据与缺口

[`evidence/r02.json`](evidence/r02.json) 记录最终源码/包身份、命令结果、脱敏测试矩阵和独立复审结论；[`evidence/r02-browser-layout.json`](evidence/r02-browser-layout.json) 保存 Chromium 155 **合成页面**的逐项几何与滚动证据。回归入口为 `tests/browser-checks.mjs`，由调用方提供专用 `about:blank` Playwright 页面，测试后清理；它不连接账户，不证明 ChatGPT 或 Authority 安装通过。

系统 Chrome 已找到用户指定的对话，但 AppleScript 实际返回错误 12（Apple 事件 JavaScript 关闭）；控制台探针未能可靠确认该目标，因此登录态长输入、用户消息、助手回复、真实 Sticky 结构均 `NOT_TESTED`。结束时已核对该脚本访问开关为关闭。

可连接的测试 Chrome 未登录 ChatGPT；现有 Native 目录接入随后返回 `E_NATIVE_NOT_READY`，测试用侧栏页面的导航也未正常显示。安装、停用、恢复、升级、重启和卸载没有取得有效回执，均 `NOT_TESTED`。两种主题、键盘与 320/360/400px、200% 缩放也没有登录态产品证据。各维度不能据此宣布达到 95 分。
