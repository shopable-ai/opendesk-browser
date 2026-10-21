# Web Markdown Clipper R1.8 · 完整网页保存与「我的摘录」

正式产品版本：**1.2.0**。唯一业务源码：`src/index.html`、`src/style.css`、`src/main.js`、`src/notes.js`；新的可信存储适配器：`trusted/notes-store.js`。仅使用既有 Sidebar Tool、Browser SDK、可信 Host 与 Chrome Storage，不新增云服务或数据库平台。

## 用户如何使用

1. 在当前网页选择「文章」「选区」「引用」「链接」，点击提取；或从 Chrome 原生右键菜单预填选区。
2. 点击「保存摘录」。可信 Host 保存完整 Markdown、标题、来源、创建/修改时间并核实存储，工具再次按 ID 读取完整正文。成功后自动进入「我的摘录」。
3. 顶部「我的摘录 · 数量」是始终存在的入口：搜索历史，点击卡片打开全文阅读。阅读页提供「编辑」「复制」「下载 .md」「删除」，列表可以刷新或加载更多；还可以「新建便签」。
4. 点击「导出备份」导出包含所有正文的 JSON。所有资料都在当前 Chrome Profile 本地；卸载、重置 Profile 或清空 Chrome 存储前请备份，当前版本不含备份导入或云同步。

## 容量与迁移

- **单条 Markdown 正文上限 160,000 UTF-8 字节**（比提取器约 150,000 字节边界额外预留来源/YAML 包装空间）；**整个 `clips` 资料库 4 MiB JSON**，最多 **1000 条**。不会自动截断。
- 仅为官方安装的 `web-markdown-clipper` 开通独立 `clipNotes.*` 可信 Host 操作。标准工具 `storage.get/set` 的单项 8 KiB / 总计 32 KiB 限制**原样保留**，不扩张其他扩展权限。
- 延用 **1.1.4 及更早的 `clips:{version:1,items:[...]}`** 格式和 `opendesk.sidebar-tools.data.v1:web-markdown-clipper` 命名空间。旧摘录不必迁移、重建或复制到 Knowledge Inbox；不会读取 Knowledge Inbox 数据。
- 列表搜索在可信 Host 中执行，最多每次返回 50 条摘要；只有用户打开一条记录时才跨宿主边界返回完整 Markdown。全部原文仍存储于既有 Chrome 本地持久层。
- 可信 Host 持有与安装/卸载共用的工具锁，写入前后核实工具身份、版本、授权和启用状态；修改、删除使用存储版本条件，防止过期视图覆盖新内容；写入后读回，丢失回执/结果不确定时拒绝冒称成功。
- Chrome 存储容量与实际磁盘仍可能成为更外层的硬限制。超过记录、资料库或实际磁盘限额会拒绝保存并告知，不会缩短正文后谎称成功。

## 预览

从仓库根目录执行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

然后打开：

`http://127.0.0.1:8765/examples/sidebar-tools/web-markdown-clipper/preview/index.html`

预览舞台直接加载正式 HTML/CSS/JS，含全文阅读、列表、搜索、编辑、删除、夜间/浅色、320/360/400/440 px、200% 缩放及故障注入。**舞台只使用演示会话存储，点击「模拟重开侧栏」仅验证演示数据恢复，不代表已通过真实 Chrome Storage 持久化。**演示复制/下载不写入真实系统。

## 建议本地 Codex 验收

```bash
npm ci
node --test examples/sidebar-tools/web-markdown-clipper/tests/*.test.mjs
node --test tests/environment/markdown-tools-r22.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-storage-unlimited.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project
APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan
node scripts/app-ci.mjs inspect web-markdown-clipper
node scripts/app-ci.mjs build web-markdown-clipper
node scripts/app-ci.mjs node web-markdown-clipper
npm run build
```

正式发布流程必须在具备完整仓库的本地环境重新使用原版 `scripts/build-sidebar-tool.mjs` 出 candidate、实际验证、`--promote-from`、`--check-project`，并验收官方发行目录与安装升级。不可把本项目中当前源码校验或交互预览误报为 Chrome 真正通过。

Mac 真实 Chrome 项目：从已安装 1.1.4 原位升级到 1.2.0 → 10/50/100/150/160 KB 网页保存 → 搜索/编辑/删除/备份 → 完全关闭 Chrome 并重启读回 → 原生右键授权与网页剪藏 → 浅深色及键盘/窄屏；结果必须逐项记录 PASS、FAIL、BLOCKED 或 NOT_TESTED。

历史 1.1.4 的真实验收资料在 `ACCEPTANCE-R1.7.5-LOCAL.md`。新版记录在 `ACCEPTANCE-R1.8-WEB.md`，**旧版 Chrome PASS 不能外推成 1.2.0 PASS**。
