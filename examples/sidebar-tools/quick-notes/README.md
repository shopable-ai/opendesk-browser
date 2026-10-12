# Side Panel 网页笔记（R18.1 / R26 密度统一，v1.1.8）

本项目是随扩展发行的官方网页笔记工具。新配置按官方预装意图安装，已有配置不会被自动覆盖；可在 Side Panel「工具」中检查已安装版本并显式更新，本地文件导入须先运行下方打包命令。工具使用 `storage.local`、`currentPage.read`、`tasks.open` 三项能力，没有网络请求能力。正式资源由统一 [Catalog](../../../docs/api/official-tools-catalog.zh-CN.md) 从本项目源码生成。

## Mac Chrome 安装与验收

1. 在本地仓库 `main` 执行 `npm ci --ignore-scripts` 和 `npm run build:dev`；在 `chrome://extensions` 确认真正加载的是该仓库的 `dist/development`，而不是旧版或其他 Profile 的同名扩展。重新加载扩展并关闭/重开 Side Panel。
2. 打开「工具」：选择官方候选「网页笔记 → 安装」，或先打包再从「＋ 导入」选择 `artifacts/sidebar-tools/quick-notes/<version>/quick-notes.opendesk-tool.json`，核对名称、**v1.1.8**、权限与文件名。文件选择和安装不会执行代码；必须点击「确认安装」，再显式点击「打开」。
3. 新版网页笔记：查看 24px Logo、紧凑工具栏、图标按钮。悬停检查 Tooltip，用 Tab 检查焦点与操作名称。输入中文 → 点击保存图标（支持 macOS Cmd+S）→ 新建第二条 → 切换笔记编辑 → 删除并确认。返回、再次打开和 Chrome 完整重启后检查保存内容。切换「我的」「发现」「工作流」「开发」应销毁 iframe，重开须再次主动点击「打开」。
4. 在 `http://127.0.0.1:43111/demo-form.html` 读取真实标题和地址。若本机未提供该服务，在项目根目录**确认端口未被其他任务占用**后执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。点击网页更新图标，勾选「关联当前网页」后再保存，检查记录关联信息。测试受限页面（如 `chrome://extensions`）时显示「当前页面暂不支持读取」，仍可离线编辑、保存和删除。
5. 把 Side Panel 调到 320、360、400、600px（也可在独立测试窗口调节宽度），并分别检查 200% 缩放、长网址和长笔记，不应出现横向页面滚动或大量 iframe 留白。确认卸载是二次确认：**卸载会删除所有该工具数据**。测试删除前请备份有用内容。
6. 对已经安装 v1.0.0 的用户：用 v1.1.8 JSON 走正常「导入 → 预览 → 确认更新」；同一工具 ID 的本地数据不会被更新动作删除。旧 `note` 字段会在新版界面恢复；再次「保存」后变为新 `notes` 数据。请勿卸载旧版后再安装，否则原数据会按安全合同清除。

## R26 页面间距与宿主边界

- Side Panel 自身左右保留一层 11px 内容边距（≤340px 为 9px）；工具 iframe 负向抵消宿主边距、不再叠加边框；`.notes-app` 自己负责 12px 统一内容留白，正文、编辑器外框与辅助说明保持对齐。
- 不加载高权限宿主样式到工具沙箱。`src/style.css` 单独映射 4/8/12/16px、8/12px 圆角和 34px 图标按钮；编辑框文字的 8px 内边距属于控件内容区，不作为新一层页面留白。
- 320/360/420/520px、125%/200% 缩放、长网址和长笔记标题需复核无页面级横向滚动。交互、权限及本地存储协议保持不变。
- 规范详见 [Sidebar 设计系统](../../../docs/architecture/sidebar-design-system-r20.zh-CN.md)。已安装的旧版本需在「工具」中手动确认更新，保留相同工具 ID 数据。

## R26.2 窄屏补充与布局验收

- `v1.1.8` 同时修复工具内确认区域（取消/确定）在超窄窗口出现竖向折字：两按钮保持完整中文、同一行，保留 8px 间隔；空间更小时允许整按钮换行，不拆开按钮文字。
- `v1.1.8` 修复超窄内容宽度下「关联当前网页」被两个图标按钮挤成三行的问题：不超过 220 CSS px 时，勾选项独占一行，删除/保存图标仍维持 34px、8px 间距并在右侧对齐。普通 300～520px Side Panel 仍保持单行操作栏。
- 800 CSS px 及以上的独立标签页将笔记内容限制为 760px 并居中；不会让文本框无限延伸。未改变存储键、权限、HTML/JS 执行协议和用户数据。
- 增加 `scripts/tests/sidebar-quick-notes-layout-visual.mjs`：使用**当前官方工具源码**生成无脚本静态 Chrome 渲染夹具，12 种宽度 × 4 种状态，共 48 个布局断言，并保存度量与截图。160/180/210 CSS px 用于模拟缩放导致的有效窄宽，不代表浏览器真实 200% Zoom 或扩展已安装 E2E。
- `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 和原有笔记存储/权限组件回归必须仍然通过。真实 Mac Chrome 安装、更新后数据保留及 200% 缩放继续按证据明确记录，不得由静态夹具冒充正式原生验收。

## 从源码重新打包

修改 `src/index.html`、`src/style.css`、`src/main.js` 或 `assets/mark.png` 后，在仓库根目录运行：

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes
node --test tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-quick-notes.test.mjs tests/environment/sidebar-tool-spacing-contract.test.mjs
# 使用已安装的 Chromium / Chrome 检查真实 HTML/CSS 布局
CHROME_BIN=/path/to/chrome node scripts/tests/sidebar-quick-notes-layout-visual.mjs artifacts/quick-notes-layout-visual
```

打包器默认输出到 `artifacts/sidebar-tools/quick-notes/<version>/`。正式扩展构建会生成 `dist/production/official-tools/quick-notes/quick-notes.opendesk-tool.json`，不在源码目录保存另一份生成包。审阅源码与生成内容，更新必须由用户明确确认；文件格式仍为 `.opendesk-tool.json`。

## 边界

最多 16 条笔记，工具宿主单个 `notes` 存储字段限制 8 KiB（所有笔记共享，不是每条都可以保存 8 KiB）（工具隔离数据总上限 32 KiB）；达到限额时需精简或删除旧笔记。浏览器/扩展被卸载、用户清除扩展存储、或卸载该工具时内容会丢失，当前没有同步/导出功能。当前网页信息仅在主动打开/刷新时获取；受限页面或导航后请刷新，页面读取失败不影响本地笔记。任务入口只打开已安装任务，不会自动运行任务。

网络 API 演示仍需未来新增独立的 `network.fetch` 授权合同（域名白名单、安装时明确授权、禁凭据、超时、响应上限与重定向策略），**不得**放宽 sandbox CSP 实现。本 README 是手动验收指引，不宣称已经获得当前提交的 Mac Native PASS。

## R18.1 存储与并发安全

- 初次读取前编辑器不可修改，读取失败时不会以空数据覆盖本地笔记；请返回工具列表并重新打开排查。
- `storage.get({key:'notes',withEtag:true})` 返回当前值和 SHA-256 条件标记，保存用 `storage.set({key:'notes',value:next,ifMatch:etag})`；比较发生在已有宿主 Web Lock 内。其他旧工具不提供这些可选字段时继续遵守原 R1 协议。
- 多个侧栏或独立标签页同时修改同一个笔记集合时，后写入的旧版本会被拒绝并保留当前文本。请先复制尚未保存的内容，然后重新打开核对最新数据。
- 删除旧版笔记时优先持久化 `notes:[]`（空数组也是权威状态）。清理旧 `note` 字段失败只提示部分完成，不会复活已经删除的笔记；下次保存会重试清理。
- 当前网页切换时，存活的工具页面会撤销上一次读取的网页信息；保存网页关联之前再次验证目标 URL。网页不可用不影响纯离线笔记。
- 存储操作超时或结果不确定时不要盲目重复删除；保留输入，关闭后重新打开核对实际状态。工具仍没有自动备份或跨设备同步。

## 草稿与确认（Final R2）

新建、切换和删除使用工具内确认控件；隔离页面不能调用原生 `confirm()`。取消或按 Escape 保留原输入，确认期间停止编辑和任务跳转。返回工具列表、切换一级选项卡和打开任务前，由可信宿主确认是否放弃草稿；保存或删除未完成时阻止这些操作。

`OpenDeskTool.setState?.({dirty,busy})` 仅报告两个布尔 UI 状态，不授予额外能力。旧工具仍兼容，无法报告保存完成的旧工具会保守地提示未保存。

独立工具标签页采用浏览器 `beforeunload` 提示；Chrome 可能限制提示、关闭 Side Panel 或直接终止进程。未保存草稿仅在当前编辑器内，不具有退出/崩溃持久恢复能力。保存超时表示结果未知，先复制输入并重新打开核对；并发冲突保留输入，不覆盖其他窗口。条件摘要忽略对象键顺序，数组顺序和内容仍参与校验。
