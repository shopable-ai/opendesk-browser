# Web Markdown Clipper R1.8 · 完整网页保存与「我的摘录」

正式产品版本：**1.2.1**（合并右键富选区、块内语义与嵌套列表预览）。唯一业务源码：`src/index.html`、`src/style.css`、`src/main.js`、`src/notes.js`；可信存储适配器：`trusted/notes-store.js`。仅使用既有 Sidebar Tool、Browser SDK、可信 Host 与 Chrome Storage，不新增云服务或数据库平台。

## 用户如何使用

1. 在当前网页选择「文章」「选区」「引用」「链接」，点击提取；或从 Chrome 原生右键菜单预填选区。
2. 点击「保存摘录」。可信 Host 保存完整 Markdown、标题、来源、创建/修改时间并核实存储，工具再次按 ID 读取完整正文。成功后自动进入「我的摘录」。
3. 顶部「我的摘录 · 数量」是始终存在的入口：搜索历史，点击卡片打开全文阅读。阅读页提供「编辑」「复制」「下载 .md」「删除」，列表可以刷新或加载更多；还可以「新建便签」。
4. 点击「导出备份」导出包含所有正文的 JSON。所有资料都在当前 Chrome Profile 本地；卸载、重置 Profile 或清空 Chrome 存储前请备份，当前版本不含备份导入或云同步。

## 四种模式无损切换（R1.8.2 / 1.2.2 源码候选）

- 再点当前模式不会执行任何清空或 Host 请求；切换未提取模式显示空状态，并禁止保存、复制、下载，切回仍属于同一页面的模式恢复原始快照。
- 选区与引用复用同一次可信 `clip.selection`，保留富 Markdown；文章全文不能作为选区。链接只由当前已验证来源和标题构建，绝不混入正文。
- `currentPage.info` 与 `opendesk-page-changed` 约束页面会话；活动网页变化后清空最多四个模式缓存，忽略旧请求回执与不一致来源；不将私有浏览器文档 ID 暴露给工具，也不新增存储权限。
- 只读预览、Markdown 源码、保存、复制和下载使用同一份完整输出。来源格式（文末、YAML、不添加）基于原始正文重新合成，避免重复元数据。引用只对选区正文添加引用样式。
- 保存时冻结正文、标题和来源，并锁定模式与导出直到确认；手动便签的未保存编辑文本不随模式或网页切换销毁。

**发布状态：**当前已晋升的富选区版本为 `1.2.1`。本次 `1.2.2` 源码变更须经过 App CI / macOS Chrome 验证及官方 `app-release` 晋升；未晋升前仓库 `.opendesk-tool.json` 仍反映旧版本，不得手工拼包或宣称已发布。

## 容量与存储

- **单条 Markdown 正文上限 160,000 UTF-8 字节**（比提取器约 150,000 字节边界额外预留来源/YAML 包装空间）；**整个 `clips` 资料库 4 MiB JSON**，最多 **1000 条**。不会自动截断。
- 仅为官方安装的 `web-markdown-clipper` 开通独立 `clipNotes.*` 可信 Host 操作。标准工具 `storage.get/set` 的单项 8 KiB / 总计 32 KiB 限制**原样保留**，不扩张其他扩展权限。
- 本工具尚未上线，本轮**不设置旧版数据迁移或旧授权升级验收门槛**。从新的 Chrome Profile 空库开始使用；资料仅属于本工具的 `clips` 命名空间，不会读取 Knowledge Inbox 数据。
- 列表搜索在可信 Host 中执行，最多每次返回 50 条摘要；只有用户打开一条记录时才跨宿主边界返回完整 Markdown。全部原文仍存储于既有 Chrome 本地持久层。
- 可信 Host 持有与安装/卸载共用的工具锁，写入前后核实工具身份、版本、授权和启用状态；修改、删除使用存储版本条件，防止过期视图覆盖新内容；写入后读回，丢失回执/结果不确定时拒绝冒称成功。
- Chrome 存储容量与实际磁盘仍可能成为更外层的硬限制。超过记录、资料库或实际磁盘限额会拒绝保存并告知，不会缩短正文后谎称成功。

右键剪藏优先展示同次右键选区的 Markdown，保留标题层级、普通/有序/嵌套列表及已有链接、强调、代码语义。局部选区只包含选中的字符；保存仍需点击，容量以本页全文保存合同为准。需要同时更新可信扩展框架（日常固定 `dist/development`）；只导入 JSON 无法让旧宿主提供富选区。未取得格式时会明确提示，可保持网页选区后使用备用提取入口。已有同 ID 工具直接导入更新，勿卸载清数据。

本次通用 SDK 缺口已由源码及组件复现证明：原 `launch.consume()` 只有 Chrome `selectionText`，不含 DOM，工具沙箱无法恢复标题/列表，也无法在打开侧栏后可靠找回原选区。最小公共扩展为同一 ticket 的可空 `selectionMarkdown`，由通用 Content 快照与原菜单 Host 提供，供任何已批准菜单工具使用，无 ChatGPT 分支或新增权限/依赖。复用共用转换器及可见 Range 克隆，保留安装身份、精确文档/URL、一次消费、导航/撤权与原限额。API 合同见 [Browser SDK](../../../docs/api/browser-sdk.zh-CN.md)。真实用户 ChatGPT 右键→预览→保存重开尚未实测，标记 `NOT_TESTED`；DOM/Range、Host 与存储组件证据不能替代该结论。

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

1.2.0 原验收计划（保留历史，未代表合并后的 1.2.1 已通过）：**全新独立 Profile 安装 1.2.0** → 10/50/100/150 KB 网页保存与来源元数据核对 → 搜索/编辑/删除/备份 → 完全关闭 Chrome 并重启读回 → 原生右键授权与网页剪藏 → 浅深色及键盘/窄屏；结果必须逐项记录 PASS、FAIL、BLOCKED 或 NOT_TESTED。旧版升级不作为本轮交付条件。

合并后的 1.2.1 仅补冲突相关组件及包同源检查；真实 Chrome、安装和升级仍为 `NOT_TESTED`。

新版验收记录见 `ACCEPTANCE-R1.8-WEB.md`。历史 1.1.4 的 Chrome 验收不代表新版已经通过；本轮重点是全新安装后的全文持久化、重启读回和权限隔离。

R1.8.2 网页开发验收记录：`ACCEPTANCE-R1.8.2-WEB.md`。目前真实 Chrome、正式 CI 和安装包晋升须按实际回执确认，不能把模拟预览作为 PASS。
