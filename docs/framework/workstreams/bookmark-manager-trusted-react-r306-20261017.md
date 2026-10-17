# Bookmark Manager R3.0.6 · 固定可信 React UI 非发布试点（2026-10-17）

> 状态：**SOURCE_INTEGRATED / TEST_PENDING**。本记录仅说明真实写入的源码。
> 未经 `preview:chrome`、正式 WXT Build、负向安全测试和 Mac 原生安装验证，
> 绝不将代码存在等同于 `TRUSTED_PILOT_READY`、`MIGRATION_READY` 或 UX 95 分。

## 已实施（不等于测试通过）

- 官方身份入口：`src/ui/trusted-bookmark-admission.js`。固定 `bookmark-manager`、
  官方 `0.3.8`、可信 React 组件 `R3.0.6`，要求安装完整包、官方发行 SHA-256、
  独立来源记录、启用状态及安装/撤权 epoch 全部吻合；错误安全拒绝。
- 仅开发者可显式选择：`debugEnabled` 且固定 `ui/tool.html` URL 含
  `bookmarkReactPilot=1`。普通 Side Panel、用户导入、AI 生成和市场工具
  仍沿用 opaque-origin iframe，可信身份不由工具包文字/脚本自主声明。
- `src/ui/react/main.tsx` 使用现有唯一 `createRoot` 的 React Portal，
  静态导入已经审核的 Bookmark Model/Service、唯一 `App.jsx`。
  不创建第二个 Host、SDK、安装器、组件库或 React Root。
- `src/ui/sidebar-tools.js` 的私有 Symbol 仅在本地固定 UI 的调用闭包可见；
  SDK `capabilities.*`、`bookmarks.*`、`page.getContext` 仍经过原始
  `dispatch` / 安装身份和代际校验 / 正式 Browser Host / 危险操作确认。
  不能从 iframe 消息伪造 Symbol。
- React App 接受 SDK/Service Adapter，维护读写前核对、写后回读、结果未知保护；
  可信模式启动/读取/终止限时书签监听，必要时丢弃敏感树缓存；
  绑定“收藏当前页”的 TabRef、DocumentRef、URL；保存设置同步给原 Host 的未保存保护。
- Chrome bookmarks 权限撤销、工具停用/卸载、安装代际变化、官方来源变化等路径
  关闭可信视图。页面关闭时 React 卸载并尝试终止观察会话。
- 预览保持唯一 `App.jsx`，CSS 限定 `.bm-app`，预览两个入口自己加载同一个 CSS；
  `preview/dev.html` 自动生成且被精确忽略；
  `preview/index.html` 仍是之前批准的提交版本，本轮未以未测候选覆盖。
  `preview/react/.opendesk-preview/` 不再是候选 HTML 目标。
- WXT Vite 配置去重 `react` / `react-dom` 模块解析，沿用 React 19.2.0。
  不放宽 CSP、权限、脚本执行或动态工具包大小限制。

## 如何开启 / 定向验证

1. 在具有调试功能的开发版 Chrome，以本扩展自己的
   `ui/tool.html?hostInstanceId=<实际 UUID>&bookmarkReactPilot=1`
   打开可信工具 Host（`hostInstanceId` 必须是真实、已登记的值，
   不可复制示例占位符）；必须具备官方、已安装且启用的 0.3.8 包和匹配发行目录/来源。
2. 在扩展 Side Panel 中主动打开“书签管理”；仅身份校验成功时使用现有 React Root。
   失败应退回正常 iframe 或安全拒绝，不得从安装包执行 JSX。
3. Preview：在
   `examples/sidebar-tools/bookmark-manager/preview/react/` 运行
   `npm run preview:watch`，访问邻近的 `../dev.html`；
   同目录执行 `npm run preview:build`、`npm run preview:check`、
   `npm run preview:chrome`。保留旧版 `../index.html` 直到真实 Chrome 验证通过。
4. 定向 Node 测试：
   `node --test tests/environment/bookmark-manager-r306-trusted-react.test.mjs tests/environment/bookmark-manager-r24-lifecycle.test.mjs`。
   固定 WXT Build 和 `scripts/verify-package.mjs` 在已有标准环境执行。
5. 在隔离 Chrome Profile/测试 Fixture 复核 2,159+ 节点、130+ 文件夹，
   360/400/960px、保存/编辑/删除/撤权/跨窗口事件；禁止操作用户真实书签。
   真实 Mac Chrome 是另一项独立门槛，不以 CI Chromium/Mock 代替。

## 包预算：现行权威，不自动扩容

| 项 | 当前限制或状态 |
| --- | --- |
| 单个动态 Sidebar Tool JS | 编译 JS UTF-8 220,000 bytes（构建器）；Schema 字符限制也为 220,000 |
| 单个完整 Sidebar Tool 包 | 320,000 UTF-8 bytes |
| 允许安装工具数量 | 12 |
| 宿主 `ui/tool-shell.js` | 生产硬门槛 1 MiB；640 KiB 为审阅线 |
| Browser SDK 请求 | 常规参数 12,000 bytes（某些接口有专用上限）；Host 继续分页/限流 |
| 256,000 JS / 512,000 包候选 | **未批准启用**：需要 Schema/安装/Host/存储/更新峰值的共同实测 |

本次先减少重复 React Runtime，不扩大动态包。构建后需要记录
`ui/tool-shell.js` 的实际增量、压缩产物、CSS 输出、固定 CSP 校验、
扩展总量，以及 12 工具与更新峰值的本地 `chrome.storage.local` 容量证据。

## 当前证据状态与反方审查

| 独立维度 | 当前情况 | 95+ 验收 |
| --- | --- | --- |
| 架构 | 单 Root/静态 JSX 代码路径存在；与 Cookie 并行试点共存 | NOT_SCORED（需 WXT 构建与实际挂载） |
| Browser 安全 | 哈希/安装来源/epoch 校验及原 Host 分发存在 | NOT_SCORED（需正反身份和恶意包实验） |
| SDK/业务 | Full Bookmarks、Tab/Document、写后回读在同 Service 中 | NOT_SCORED（需原生 CRUD） |
| React 生命周期 | Portal 卸载和异步观察释放在源码中 | NOT_SCORED（需挂载/撤销竞态） |
| 产品 UX | 保留 R3.0.5 JSX，未重做布局 | NOT_SCORED（需 360/400/960 实测） |
| 性能 | 虚拟行等既有实现保留 | NOT_SCORED（需 2,159+ 节点数据） |
| 容量 | 原正式包上限未修改 | NOT_SCORED（需真实生产 Bundle 与峰值） |
| 无障碍 | 原按键操作/ARIA 逻辑未删除 | NOT_SCORED（需键盘/焦点测试） |
| 异常恢复 | 重复点击、未知结果和撤权处理已接线 | NOT_SCORED（需真实注入异常） |
| CI/发布 | 新增定向测试合同；正式包/版本未更新 | NOT_SCORED（需 CI PASS 与 Mac Native） |

**未批准 R3.1**：不得替换正式 `src/main.js` 和已安装工具的沙箱 UI；
不得更新工具包或版本，不得将动态工具升格为可信代码。
待以上独立门槛均有可信证据且各项 ≥95/100，再呈交正式迁移批准清单。

## R3.0.8 网址直接点击 · UI 认可的小范围补丁（2026-10-17）

- 设计意图：书签详情内**直接点击整段网址**打开新标签页，外链小图标跟随网址；详情底部只保留复制与编辑，删除重复的“小按钮打开”。
- 正式共享 JSX：`preview/react/src/App.jsx` 的 `Inspector` 渲染原生 `<a target="_blank" rel="noopener noreferrer">`，由 `safeBookmarkHref` 仅允许不含凭据的 HTTP(S)，旧书签里的其他协议保留只读文本，不允许在可信 UI 中导航执行。
- 样式：`preview/react/src/style.css` 提升整个网址的点击/键盘聚焦区域，窄屏允许完整换行；保留 R3.0.7 360/400px 12px 四周间距底部浮动卡片和 960px 右侧详情，不重排书签树。
- 定向静态/URL 协议测试：`tests/environment/bookmark-manager-r308-clickable-detail-url.test.mjs`（是否 PASS 应以对应 Commit 的真实 Node/CI 记录为准）。
- 纯演示 HTML 在当前聊天中创建，不是可复用的正式 JSX 源码或通过 Chromium 的发行产物；`preview/index.html` 未晋升，`preview/dev.html` 仍为被 Git 忽略的构建候选。
- **仍未发布**：原正式 `examples/sidebar-tools/bookmark-manager/src/main.js`、工具版本 `0.3.8`、官方 Catalog、可安装 JSON 未被替换。下一轮先验证 R3.0.8 同源 React 预览和真实原生 SDK 行为，再明确实施范围与批准门槛。
