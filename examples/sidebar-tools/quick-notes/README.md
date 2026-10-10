# Side Panel 网页笔记（R18.1，v1.1.1）

这里的 `quick-notes.opendesk-tool.json` 是**正式打包好的离线示例**。不用启动本地开发服务器、API 或任务，也不需要先执行构建即可从 Side Panel「工具」导入。示例使用三项 R1 能力：`storage.local`、`currentPage.read`、`tasks.open`；**没有网络请求能力**。

## Mac Chrome 安装与验收

1. 在本地仓库 `main` 执行 `npm ci --ignore-scripts` 和 `npm run build:dev`；在 `chrome://extensions` 确认真正加载的是该仓库的 `dist/development`，而不是旧版或其他 Profile 的同名扩展。重新加载扩展并关闭/重开 Side Panel。
2. 打开「工具」：空列表有导入入口；选择 `examples/sidebar-tools/quick-notes/quick-notes.opendesk-tool.json`，核对名称、**v1.1.1**、权限与文件名。文件选择和安装不会执行代码；必须点击「确认安装」，再显式点击「打开」。
3. 新版网页笔记：查看 24px Logo、紧凑工具栏、图标按钮。悬停检查 Tooltip，用 Tab 检查焦点与操作名称。输入中文 → 点击保存图标（支持 macOS Cmd+S）→ 新建第二条 → 切换笔记编辑 → 删除并确认。返回、再次打开和 Chrome 完整重启后检查保存内容。切换「我的」「发现」「工作流」「开发」应销毁 iframe，重开须再次主动点击「打开」。
4. 在 `http://127.0.0.1:43111/demo-form.html` 读取真实标题和地址。若本机未提供该服务，在项目根目录**确认端口未被其他任务占用**后执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。点击网页更新图标，勾选「关联当前网页」后再保存，检查记录关联信息。测试受限页面（如 `chrome://extensions`）时显示「当前页面暂不支持读取」，仍可离线编辑、保存和删除。
5. 把 Side Panel 调到 320、360、400、600px（也可在独立测试窗口调节宽度），并分别检查 200% 缩放、长网址和长笔记，不应出现横向页面滚动或大量 iframe 留白。确认卸载是二次确认：**卸载会删除所有该工具数据**。测试删除前请备份有用内容。
6. 对已经安装 v1.0.0 的用户：用 v1.1.1 JSON 走正常「导入 → 预览 → 确认更新」；同一工具 ID 的本地数据不会被更新动作删除。旧 `note` 字段会在新版界面恢复；再次「保存」后变为新 `notes` 数据。请勿卸载旧版后再安装，否则原数据会按安全合同清除。

## 从源码重新打包

修改 `src/index.html`、`src/style.css`、`src/main.js` 或 `assets/mark.png` 后，在仓库根目录运行：

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes --out examples/sidebar-tools/quick-notes/quick-notes.opendesk-tool.json
node --test tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-quick-notes.test.mjs
```

注意：默认不传 `--out` 时生成物会放到 `artifacts/sidebar-tools/quick-notes/<version>/`，**不会自动更新仓库中的正式导入文件**。提交前要运行上面的定向输出命令，并确认源码和 JSON 内容一致。格式为 `.opendesk-tool.json`，不能用任务文件 `.opendesk-task.json` 替代。

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
