# ChatGPT 长内容回顶 · OpenDesk Page 增强

仅面向 `https://chatgpt.com/*` 的顶层 Page USER_SCRIPT，复用 `@opendesk/ui` 和现有 Page Authority。2026-10-20 已在真实已登录 ChatGPT 页面通过七条核心点击操作；正式安装、升级和 production 扩展验收仍为 `NOT_TESTED`，独立 95+ 评分为 `NOT_SCORED`。

## 按钮在哪里

- 长用户消息：在原生“复制消息 / 编辑消息”操作组旁显示回到开头箭头。
- 长助手回复：在对应回复的原生“评价回复 / 复制 / 重新生成回复”操作组旁显示箭头。正文与操作栏可以是独立兄弟节点，绑定不能跨到第二条助手回复。
- writing block：在原生 `header` 中，紧邻 `Open editor / 打开编辑器`。点击原生“打开编辑器”进入独立查看器后，箭头位于含 `Close viewer / 关闭查看器` 的工具栏；原生打开、关闭功能保持原样。
- 其他可明确关联的长内容：优先使用原生按钮的唯一 `aria-controls`；否则只接受同一局部容器里唯一的内容节点与唯一工具栏。候选包括 `pre`、消息正文、可编辑区域和确实自身滚动的 `textarea`。没有打开编辑器按钮时，使用同栏最后一个原生操作按钮作为插入位置。

按钮为 34 × 34px，继承页面颜色，使用原生 `button`、中文 aria-label/title 和可见键盘焦点。插入位置与滚动目标分别保存，保留原生 span/tooltip 包装节点的所有权；不依赖 CSS 类名、SVG 内容或资源哈希。新增消息操作栏识别依赖精确中文 aria-label，其他语言或网站 DOM 变化可能不显示按钮。

各独立长内容最多一枚按钮。目标或操作组缺失、关联歧义、隐藏、inert、弹窗、没有有效滚动距离的区域均退出。普通 `aside` 仍排除；仅允许包含唯一直接 `header`、唯一编辑区域、唯一“关闭查看器”操作，且具有 aside 内部纵向滚动容器的 writing viewer。其 header 不作为全局对话工具栏。

全局回退仅用于可明确识别的对话顶部工具栏，目标为第一条对话消息。含“打开编辑器”却无法解析目标的工具栏不会被当成全局工具栏。此回退有组件测试，本次七条真实点击未单独验收它。

## 点击后到哪里

目标为绑定内容的真实布局起点，工具栏的吸顶视觉位置不能作为正文起点。普通内容滚动最近的实际纵向滚动容器；自然高度的 `contenteditable` writing block 或 viewer 正文滚动其合格祖先。确实自身滚动的编辑器只滚自身；溢出但不可滚动、被裁剪的编辑器及不能确认自身滚动的 `textarea` 拒绝执行。

普通内容先以 `目标矩形.top − 滚动口.top + scrollTop − 12px` 计算绝对落点，并限制在有效范围。随后读取落点处 Sticky/Fixed 元素的真实矩形，按横向交集、首行高度和实际遮挡最多做一次同步补偿。不会预测下方尚未吸顶的工具栏，也不会将其他栏位的工具栏算成遮挡。两次操作均为 `instant`，由一次点击完成。

目标本身为滚动容器时只将它的 `scrollTop` 设为 0。实际查看器为内部 div 滚动，内容起点滚到局部工具栏下方；不会无条件将整页滚到 0。保留其他容器与横向滚动值，不写入正文、输入、草稿、光标、选区或编辑状态，不采集或上传对话内容。

## 动态页面与清理

React 替换工具栏、内容、整个 `main`，或仅移除注入按钮时，重新建立绑定。点击时再次核对身份，旧按钮不能操作新内容。观察相关 DOM/ID、原生操作 aria-label、消息身份属性变化，以 120ms 合并刷新；忽略自身插入和无关侧栏变化，无滚动事件扫描。存在显式 ID 关联时，每轮只建立一次 ID 索引；没有关联时不扫描全页 ID。

同模块重装先清理旧实例。事件、Observer、延时和宿主沿用受管生命周期；Stop 清理保留组件级证据。真实 Authority 停用、撤权及卸载仍为 `NOT_TESTED`。本次未另做真实切换对话、React 重绘矩阵或关闭 viewer 后重新挂载箭头检查。

## 开发与现有安装包

从仓库根目录执行定向校验；环境测试入口已导入业务单测，使用一个入口即可：

```bash
node --check examples/programs/chatgpt-jump-top/src/conversation.js
node --test tests/environment/chatgpt-jump-top.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-jump-top
```

需要新的脚本候选时使用原编译器 `npm run build:program -- examples/programs/chatgpt-jump-top`，不必为文档收尾重建。已验证候选的 sourceHash/buildHash 为 `b0495ecffa05106cc93b942ad4d4b649890fd03e025b5af00be629ff31c6a303`，编译状态为 `BUILT_UNVERIFIED`、`installable:false`；`buildMode:production` 仅指业务脚本静态编译，不代表 production 扩展验收。

本地项目入口仍为 `opendesk browser dev "$PWD/examples/programs/chatgpt-jump-top"`，随后通过界面明确 Run。本次真实操作使用「开发 → 直接编辑 → JavaScript → Page·当前网页 DOM → 运行」执行最终候选，并获得 Page `active` 返回。界面未提供该次 Page 的精确 `previewId/sourceHash/documentId`，不能用旧 Controller 的 runId/SHA 补作收据。

现有离线包 [`chatgpt-jump-top.opendesk-page.json`](chatgpt-jump-top.opendesk-page.json) 保持身份 `opendesk.chatgpt-jump-top`、版本 `0.2.0`、revision `2`，sourceHash 为 `2f8c1667e0047e4c6a7152b5da121f0d1438abdfa470b139db9cc30c911cc791`。**旧包不含本次修复，本轮未晋升安装包。** 它由原 `build-page-install-package.mjs` 生成，不携带安装授权或运行证明；后续安装/升级仍走「扩展 → 导入」及原有审阅/Authority 流程，提交源码不会自动升级浏览器。

## 真实核心操作证据

[`evidence/development-20261020.json`](evidence/development-20261020.json) 保存最终候选与源码摘要、七份原始 JSON 的脱敏数值与文件摘要、操作方法、开发环境身份及限制。以下 scrollTop 均属于对应滚动容器，单位 CSS px：

| 操作位置 | 点击前 → 点击后 scrollTop | 内容顶部 | 首字符 top..bottom | 遮挡底边 |
| --- | --- | --- | --- | --- |
| 长用户消息 | 390 → 72 | 64 | 76..104 | 52 |
| 第一条长助手回复 | 5614 → 716 | 64 | 67..86 | 52 |
| 最后一条长助手回复 | 16832 → 2973.5 | 64 | 67..86 | 52 |
| writing 中部 | 10953 → 5142 | 115 | 117..145 | 115 |
| writing 底部 | 16023.5 → 5142 | 115 | 117..145 | 115 |
| viewer 中部 | 5945 → 0 | 64 | 66..94 | 52 |
| viewer 底部 | 10947.5 → 0 | 64 | 66..94 | 52 |

七次均使用 AXPress，事件报告 `trusted:true`。独立 DOM Range 测首字符，`elementFromPoint` 确认它可见且属于目标；输入、DOM 选择区、横向和其他真实滚动容器基线均未变化。测试页签 composer 当时为空，没有专设非空草稿或非折叠选区测试；原有非空草稿页签保持未触及。

中间候选曾一次报告 `otherScrollsUnchanged:false`，未捕获具体 delta，后续 detail 为 `[]/true`，根因未定位。最终诊断将基线限定为真实滚动容器并在 pointerdown 立即采集，最终两个 viewer 场景均通过；不据此声称已查明或修复该异常根因。

既有定向验证为 **55 PASS、0 fail**，项目校验为 `AUTHORING_VALID_NOT_PACKAGED`；本次收尾核对原输出与候选哈希，没有源码新变化时不重复运行。真实环境使用日常 `dist/development`，watcher/serve 客户端连接未验证；没有扩展全量构建、重装或改动其他会话输出。

[`evidence/r02.json`](evidence/r02.json) 与 [`evidence/r02-browser-layout.json`](evidence/r02-browser-layout.json) 保留旧 revision 2 及 Chromium 155 合成页面的历史范围。`tests/browser-checks.mjs` 由调用方提供专用 `about:blank` Playwright 页面，不证明登录态 ChatGPT 或 Authority 安装通过。历史 Apple event JavaScript 错误 12、测试 Chrome 未登录与 `E_NATIVE_NOT_READY` 不再代表本次七条真实点击未执行。

正式安装、升级、停用、恢复、撤权、卸载、重启与 production 扩展验收延期，均 `NOT_TESTED`；主题与专门键盘验收未测，宽度/缩放专项为 `OUT_OF_SCOPE`，独立 95+ 评分为 `NOT_SCORED`。
