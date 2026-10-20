# ChatGPT 回到对话顶部 · OpenDesk Page 增强（R0.1）

仅面向 `https://chatgpt.com/*` 的顶层 Page USER_SCRIPT。该功能不修改浏览器内核、ChatGPT 消息内容、会话数据或思维导图业务代码。

## 产品交互

- 在**当前对话顶部工具栏**显示一个 34 × 34 px 的向上箭头图标按钮，紧邻原有操作图标。优先选择用户提供的 `button[aria-label="Open editor"]` 所在 `header`，找不到时只考虑当前对话顶部的可见主工具栏。
- 只有在当前 `main` 存在对话消息时才挂载；如果两个候选顶部工具栏无法区分，则不插入，避免乱入多个 `header`。
- 点击立即将**对话自身的纵向滚动容器**回到顶部；不会滚动内嵌代码块、编辑器或侧边栏。没有有效滚动容器时不伪报成功。
- SPA 切换对话、React 工具栏重绘后重新定位；同一页面仅保留一个自有按钮。Page Stop、网站撤权或离开文档时沿用 OpenDesk 原有受管清理。
- 受管 Shadow DOM 限定图标样式；不引用 ChatGPT 易变的 `Icon-*` 样式、`/cdn/assets/icons-*.svg` 哈希；不读取、复制或上传对话正文。

## 开发与发布

当前仓库已有 `@opendesk/ui`、Page Authority 和 Page 正式安装流程，不为此功能添加第二套 Host/SDK。

```sh
# 在仓库根目录
node --test examples/programs/chatgpt-jump-top/tests/conversation.test.mjs
node scripts/validate-program-project.mjs examples/programs/chatgpt-jump-top
npm run build:program -- examples/programs/chatgpt-jump-top
```

可在 Mac 本地通过 `opendesk browser dev "$PWD/examples/programs/chatgpt-jump-top"` 连接原项目并显式 Run；正式安装使用现有 Page 安装包构建、权限授权及「扩展 → 导入」流程。**源码加入 main 不等于已自动安装或更新浏览器。**

## 真实 Chrome 验收清单（未执行项必须标记 NOT_TESTED）

1. 已登录的 ChatGPT 长对话：滚动至中部和底部，确认顶部工具栏只有一枚新图标；点击一次应到该对话的首条消息。
2. 一页有多个 `header`、对话中打开编辑器 / Canvas：确认按钮只位于对话主工具栏，不进入消息内、Canvas、侧边栏。
3. 切换两条长对话、新建空对话、历史路由、React 重绘、刷新、浏览器重启；不重复按钮、不访问旧对话。
4. Chrome 浅色 / 深色、320/360/400px、200% 缩放、键盘 Tab/Enter/Space、Shadow DOM 的 `aria-label` 与可见性。
5. 正式 Page 包构建 → 安装 → 权限授予 → 页面自动运行 → 停用/撤权/升级/卸载，证据来自真实 Mac Chrome 回执；Node Fixture PASS **不能**冒充以上验收。

**当前状态：**代码待本机真实已登录 ChatGPT 核对 DOM 与产品验收。用户提供的 HTML 是定位线索，不等同于完整页面 DOM；因此未把该选择器声明为已验证的稳定合同。
