# ChatGPT 知识收件箱

复用 OpenDesk Browser 的 `.opendesk-tool.json` 工具机制。在 ChatGPT 回答的官方操作区下面增加保存、Markdown 和更多操作，留下来源清楚、后续可以整理的知识记录。

## 使用

1. 更新 OpenDesk Browser 到包含本工具的版本。在侧栏 **工具 → 知识收件箱 → 安装** 中审阅能力，确认安装。
2. 打开 `https://chatgpt.com` 的对话，回到工具列表点击知识收件箱旁的 **网站按钮**，单独启用当前网站。安装本身不会授权正文捕获。
3. 等回答生成完成，点击回答下面的 **保存**。**更多** 中可保存为灵感、草稿，或只保存这一条回答内的选中文字。**Markdown** 直接请求完整 MD 文件下载。
4. 打开 **知识收件箱**，搜索正文、提问、标签或备注。记录可归类为待整理、灵感、草稿、归档；修改标题、标签、备注后点击 **保存修改**。
5. 勾选 **编辑草稿** 编辑正文，Ctrl/Cmd+S 保存。原始回答始终独立保留。修改未保存时，内部返回和宿主工具切换会提示确认；浏览器关闭时的确认取决于 Chrome，未实现浏览器崩溃后的未保存草稿恢复。
6. **结构导图** 根据 Markdown 标题与列表呈现可折叠树，不会调用 AI 改写内容。
7. **复制 MD / 下载 MD** 包含来源、捕获时间、分类、标签、备注、对应提问和当前草稿。自动复制不可用时显示并选中完整文本，供 Ctrl/Cmd+C 手动复制。

## 保存到本地目录

在已保存的记录中点击 **本地工作区**：扩展会创建一个受信任的工作区标签页，保留十分钟的单次待载入草稿。连接既有 OpenDesk Native 文件工作区，并选择一个具备读写授权的目录后，点击 **载入知识草稿**。核对文件内容、目录和相对路径，再点击 **创建新文件**。

发送到工作区和载入草稿均不会写磁盘。创建通过现有 `files.create`、回执、读回及 SHA 校验完成；同名文件不会由导入动作自动覆盖。临时失联或结果未知不会自动重试。导入稿尚未创建时，切换文件/目录需要明确放弃。可以选择 Obsidian 文件库或网盘的本地同步目录，但本地写入成功不能证明网盘服务端已同步。

当前 Native 文本合同上限为 **32 KiB（含导出元数据）**，超限请使用完整 MD 下载；未增加二进制图片写入 Native 协议。

## 图片与容量

- 更多菜单只列出当前回答中已显示且已加载的图片，最多 12 个单独下载入口。受限于 HTTPS ChatGPT / OpenAI 内容域；blob、第三方域或已过期地址会明确失败。
- Markdown 保留转换器可识别的图片链接，链接可能过期。没有把 Markdown 和图片自动打成离线附件包，也没有后台抓取所有图片。
- 单条正文/草稿最多 150,000 UTF-8 bytes；收件箱最多 200 条 / 4 MiB。满额时拒绝新写入，不清理旧记录。
- 同一来源、消息、选区模式、内容的重复保存复用原记录，保留分类、备注和编辑稿；内容不同会另存记录。没有实现可视版本差异比较。
- **备份全部** 下载 JSON，包含原始内容和草稿。当前提供导出备份，尚未提供备份导入界面。
- 卸载工具会删除本机收件箱、该工具的网站授权和未载入的工作区交接草稿。请先备份。

## 实现与授权

工具 ID：`knowledge-inbox`，版本：`1.0.0`。声明能力：`page.capture`、`knowledge.store`、`user.export`。

页面捕获由扩展固定 content script 按真实点击执行；收件箱沙箱不能任意读取页面，也不能直接使用 Chrome 或 Native API。捕获站点授权独立于阅读目录与网页剪藏；撤销授权移除页面按钮，已收藏内容保留。服务端在每次操作时复核工具包哈希、真实 sender/document、站点权限和当前文档。

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/knowledge-inbox --out examples/sidebar-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json
```

更新源码后应同时更新内置 JSON：`src/sidebar-tools/knowledge-inbox.opendesk-tool.json`。旧版 OpenDesk 不认识新增能力，必须先更新扩展框架，不能只把新工具 JSON 导入旧版本。

产品排序与分期见 `docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md`；实际验证等级见 `docs/framework/workstreams/knowledge-inbox-r1-20261011.md`。本工具尚未接入博客、Notion、飞书、企业云盘 API，也不会自动发布文章。
