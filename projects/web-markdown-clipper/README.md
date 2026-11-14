# 网页剪藏 · 1.2.12

## 剪藏帮助入口优化（2026-11-14）

范围选择行右上角使用问号帮助图标，原「如何保存选中文字？」不再单独占用正文行。点击展开当前模式的提示；区域模式展示点选、↑/↓ 调整与 Esc 取消，选区/引用模式展示选中文字及右键保存说明。弹层支持再次点击、外部点击、Tab 移出和 Esc 关闭，Esc 后焦点回到图标。

验证：ego 正式源码/模拟 Host 预览中，开合不推动正文，鼠标及 Enter/Space/Esc/Tab 交互通过，320px 下五个模式及图标均可见、弹层无溢出；原剪藏 UI 28 项通过。包/沙箱检查 7 项通过；整组命令另有一条无关宿主样式旧断言失败（要求 48px，当前标题栏为 53px），本轮未修改。唯一安装包已由原打包器从 **1.2.11 → 1.2.12** 晋升并通过 `--check-project`；ID、权限、右键菜单与存储不变。SHA-256：`8c72ca09b86b0da0e279c33e1c9c8096c60c5fcc95af72a6971073e0ea65acc7`。**PACKAGE_READY_INSTALL_NOT_TESTED**：本轮未更新已安装工具；下方记录保留其原阶段和证据边界。

## 接收端连接修复与真实 ego UI 目标（2026-11-14）

当前目标：修复「点选网页区域」报 `Could not establish connection. Receiving end does not exist.`，并用真实 ego 已安装侧栏验证启动、高亮、点击回填、Esc/按钮取消、重选及受限/未授权页面拒绝。

已通过 **50 项连接/Host 测试 + 6 项来源准入测试**。真实扩展已复现接收端缺失；修复仅在原授权文档中准备固定 relay，正文点选仍只发一次，取消/切页/撤权继续生效。共享 watcher 现已恢复，已安装扩展应用 revision `47e3fa79fb8a…`，Host/relay 资源与磁盘指纹一致。当前真实 UI 验证 **BLOCKED**：原生侧栏输入仍被其他任务的 UI 锁占用，连续三轮未获锁；不能把下方历史源码/Mock 结果称为本次真实安装 PASS。详细目标、结果、续测入口和资源见 [连接修复记录](evidence/connection-repair-ego-20261114.json)。工具仍为 1.2.11，本次固定代码不靠 JSON 更新交付。

## 当前目标与关键测试条件（2026-11-14）

目标：在网页仅显示长回答中部时，点选一次即可把**同一条回答已加载的 DOM** 转为 Markdown；范围可修正，操作可取消，旧页面或旧请求不能回填。复制、下载、主动保存和全文读回复用现有入口，不自动保存。

本轮按核心开发验证收尾：**ego 源码浏览器检查 17/17 PASS**，同源 UI 的点选、取消、复制/下载演示、保存后搜索与全文读回已操作；320px 和 400px 界面已检查。UI Host、存储、复制与下载为模拟，不能证明系统剪贴板、实际文件或 Chrome 持久化。机器可读证据见 [本轮测试记录](evidence/region-picker-ego-20261114.json)，可复跑检查在 [region-browser-checks.mjs](tests/region-browser-checks.mjs)。

| 关键条件 | 本轮结果与证据边界 |
| --- | --- |
| 长内容一次点选 | ego 在 36 章回答中部点选，输出包含第 1–36 章及末尾标记；不混入其他回答、隐藏文本或输入值 |
| Markdown 格式 | 标题、粗斜体、嵌套列表、链接、引用、表格、代码栅栏保留；实际复用正式转换器 |
| 纠正范围与重选 | ↑/↓ 调整父子范围，鼠标/Enter 提交高亮范围；重新选择另一回答不混入旧内容 |
| 原网页事件安全 | 点选链接不导航；Esc 后原网页按钮恢复；合成点击不能提交选择 |
| 页面与生命周期失效 | ego 验证 SPA、超时及失效瞬间 Enter/空格不穿透；Node 验证切页、撤权、停用、安装代际、实例更换和迟到回执 |
| 即时取消 | Host 等待网页点击时不占用安装/存储锁；取消发往最初绑定的 tab/document，而不是新活动页 |
| 重复使用 | 同一 Host 实例连续 140 次点选通过，防重放记录有界回收，不再于第 129 次永久拒绝 |
| 动态回答 | 标记流式输出和“仅已加载内容”；结果是点击时快照，未加载/虚拟化内容不承诺完整 |
| 容量 | 159,999 / 160,000 UTF-8 字节成功，160,001 明确拒绝；140KB 反斜杠代码不会因 JSON 转义膨胀而被误拒；不截断 |
| 保存与导出 | 同源 UI 保存后搜索、全文读回不混入相邻回答；Node 核对容量及完整正文；复制/下载在 UI 仅演示 |
| 旧模式与构建保护 | UI 28 项回归、旧 150KB 边界、固定来源与准入 5 项、打包/晋升保护 5 项通过；未跑全仓 CI |
| 真实扩展及网站 | **NOT_TESTED**：同 ID 安装升级、Chrome 网站权限、ChatGPT/Claude/Gemini、真实剪贴板/下载和重启持久化；production、跨宽度/主题完整矩阵与评分未开展 |

本轮修复了取消锁阻塞及目标绑定、SPA/切页清理、键盘确认范围和失效按键穿透、160KB 区域预算与 JSON 膨胀误拒，以及累计 128 次后的会话耗尽。文章/选区保留原 150KB 提取预算；最终保存仍以含来源元数据的完整 Markdown 160,000 字节为限，超限须缩小范围或减少附加来源信息。

**交付状态：PACKAGE_READY_INSTALL_NOT_TESTED。** 原打包器已将唯一正式 JSON 从 **1.2.10 → 1.2.11** 晋升，`--check-project` 同源通过；ID、能力和存储命名空间不变。包 SHA-256：`f1a0f2a284897cb22225520793acbbc8b248117b503d8c8749d26f9d3932b29f`。安装文件：[web-markdown-clipper.opendesk-tool.json](web-markdown-clipper.opendesk-tool.json)。

`trusted/region-picker.js`、`trusted/page.js`、共享转换器和 `src/ui/sidebar-tools.js` 属于 Browser 固定编译代码，**不随工具 JSON 更新**。本轮没有启动/覆盖日常 `dist/development` watcher，没有安装或重载现有扩展；上述修复在当前扩展的运行生效状态为 **NOT_TESTED**。

复跑时先启动自己的本地 HTTP 服务，用 `ego-browser skill` 创建或复用本目标 TaskSpace，再在 `ego-browser nodejs` 中将已获取的 Page 传给 `runRegionBrowserChecks(page,{baseUrl})`。检查设置该 Page 禁用缓存，读取真实模块，结束后释放自己的 TaskSpace 和服务；不新建浏览器 Profile，不触碰其他任务。

## 历史：2026-11-12 及以前的 R2–R4 记录

以下版本、阻塞和“本轮”均为当时观察，不覆盖上方 2026-11-14 的开发验证与包状态。

**R4 当时增量证据：** 已定位并差量修复共享构建准入与 Clipper 区域可信源码锁，四工具 Mock 合同 10/10 PASS；仍未晋升正式包、未完成真实 Chrome 同 ID 验收。详情见 [R4 增量验收记录](docs/region-picker-r4-acceptance.zh-CN.md)。本记录不替代 R2/R3 历史证据。

**R3 本机发布收口复核（2026-11-12）：** 已从 GitHub 核实当前 `main` 与区域点选源码/App CI 记录；Mac CodexPro 和 OpenDesk Desktop 通道仍不可用，GitHub Actions 对当前 HEAD 的相关任务仍排队。独立容器无法解析 github.com 且无完整仓库，未执行真实 Node/React/Chrome 测试。保持 `1.2.10` 正式包，不作候选晋升；具体回执、退出码与剩余门禁见 [R3 验收账本](docs/region-picker-r3-acceptance.zh-CN.md)。

**R3 增量修复仍未发布（2026-11-12）**：已修复区域候选识别时的 ES Module 未声明变量错误，并将 `region-picker.test.mjs` 加入正式 App CI；原有 R2 设计与安装身份均不变。目前本地 Node/CI、正式 React 预览、候选包晋升及真实 Chrome 同 ID 升级验收仍未完成，正式包仍为 `1.2.10`。完整可追溯结果见 [R3 验收账本](docs/region-picker-r3-acceptance.zh-CN.md)。**禁止把源码修复称为已发布。**

保存开始时收起未保存确认；保存尚未完成时，返回、取消与迟到的放弃操作均保留编辑状态及正文，成功后回到更新后的阅读页。工具 ID、权限与本地数据命名空间不变，已安装版本通过同 ID 更新。

正式 React 同源预览：[打开网页剪藏](preview/index.html)。预览复用正式 ToolHost 与工具源码，Host 数据和权限均为隔离模拟；不能代替 Chrome 安装、存储和权限证据。

**R2 区域点选：源码已接线，正式发布及 Chrome 尚未验收。** [R1 需求基线](docs/region-picker-r1.zh-CN.md) · [R2 源码和测试证据](docs/region-picker-r2-acceptance.zh-CN.md)。正式 UI 新增「区域」，用户点击「点选网页区域」后可在授权普通网页中高亮并单击内容块，自动经可信 Host 和既有 `domToMarkdown` 返回预览；支持 Esc、取消、重新选择和父子范围调整，继续复用「我的摘录」的复制/下载/保存。该功能仅提取目标时刻的已加载 DOM，并不承诺虚拟化/跨源 iframe 内容完整。

**当前重要边界：正式已晋升安装包仍为 1.2.10，不含 R2；源码已变化，`--check-project` 在正式打包晋升前预期不匹配。** `preview/stage.html` 已按正式 HTML/CSS/JS 及模拟 Host 重新生成；`preview/index.html` 仍导向现有 React 预构建页面，须在本地重新执行其构建并实测，不能仅凭 stage 源码一致性宣称 React 预览已更新。已添加 UI/DOM 测试，但完整 Node、CI、正式候选包、原位升级及真实 Chrome 操作均需取得实测回执。严禁更换工具 ID、删除旧数据或模拟验收。



本轮核心验证：

```bash
node --test projects/web-markdown-clipper/tests/navigation-r14.test.mjs
node scripts/tests/clipper-react-preview-interaction.mjs --core-navigation
node scripts/build-sidebar-tool.mjs projects/web-markdown-clipper --check-project
```

`--core-navigation` 仅验证保存期间导航、继续/放弃草稿及搜索/滚动恢复，不运行旧宽度矩阵。1.2.7 的真实安装更新尚未验证；下方旧版本记录保留历史含义。

## 历史：R1.2 · 层级返回与内容优先

正式安装版本：**1.2.4**。适配 React 可信标题栏，左上角固定单返回按钮，子页面返回由正式 src/notes.js 控制；右上角按上下文显示新建、编辑或保存图标，“在新标签页打开”移入可信设置。网页剪藏主页和最近摘录仍同屏；卡片正文优先、来源移至阅读详情，触屏可发现卡片编辑/删除。

兼容边界：保留旧存储命名空间、ID、完整 Markdown、Host 读回和同 ID 升级；不得卸载旧版后重装。未接入导航契约的第三方工具使用旧行为。正式包已同步当前源码，标准构建核对和 Mac Chrome 安装升级仍需真实执行，不得以演示预览代替。

真实交互预览：`projects/web-markdown-clipper/preview/index.html`，业务 JS/CSS 同源，宿主标题栏及数据为模拟，不代表正式 React Host 和 Chrome 授权通过。

本地关键验收：

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git switch main && git pull --ff-only
node --test tests/environment/sidebar-tool-hierarchical-back-r12.test.mjs projects/web-markdown-clipper/tests/*.test.mjs
node scripts/build-sidebar-tool.mjs projects/web-markdown-clipper --check-project
npm run build
python3 -m http.server 8765 --bind 127.0.0.1
```

在真实 Chrome 中以相同 ID **升级到 1.2.4**，验收逐级返回、未保存草稿保护、剪藏保存→重开读回、权限与卸载确认；不以本地预览数据冒充真实持久化。

---

## 历史：R1.11 / 1.2.3


安装包版本：**1.2.3**。本次是真实功能升级，市场安装流程拒绝同版本覆盖，因此从 1.2.2 升级到 1.2.3；存储 ID、命名空间及正文限制不变。**通过同 ID 更新安装，不得先卸载旧版**。

- **正式 UI**：主页下方直接显示最近 4 条，左侧数字表示完整资料库总数。保存后留在主页，读回确认后刷新列表。`+` 与列表图标为新建和查看全部；悬浮/键盘聚焦显示编辑与删除，触屏在详情内操作。
- **图标语义**：16 个本地 SVG symbol 统一按钮和卡片图标。返回、刷新、新建、编辑等使用纯图标，保留 `title` 和 `aria-label`；保存、复制、下载和危险确认保留文字。
- **真实同源**：正式 `src/notes.js` 实现最近列表、全文阅读、编辑、删除确认、搜索/类型筛选、加载更多和返回位置恢复。预览嵌入同一份正式 HTML、加载相同的 CSS/JS，不再依赖预览版 `ux.js` 导航。
- **响应式正文**：可信 Side Panel Host 提供通用只读尺寸变量 `--opendesk-host-available-height`，隔离 iframe 仍按内容自动缩放；正式 CSS 约束中部可滚动、底部按钮可见。预览缩放补偿只存在于 stage。
- **存储安全**：复用旧 `clipNotes.*`、逐字段写后读回、ETag、结果未知人工核对、单条 160,000 字节与总库 4 MiB 上限。Host `clipNotes.list` 新增可选 `kind`，在分页前完成筛选；旧数据不迁移或覆盖。
- **验收边界**：预览使用 sessionStorage 模拟 Host，不能证明真实 Chrome Storage、右键授权、剪贴板、下载和安装升级。Mac/Chromium 实际证据未取得时明确 NOT_TESTED。

## Mac 本地最小验收

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git switch main && git pull --ff-only
node --test projects/web-markdown-clipper/tests/*.test.mjs
node scripts/build-sidebar-tool.mjs projects/web-markdown-clipper --check-project
python3 -m http.server 8765 --bind 127.0.0.1
```

预览：`http://127.0.0.1:8765/projects/web-markdown-clipper/preview/index.html`。随后使用真实 Chrome **同 ID 升级 1.2.3**，实测保存→主页列表→全文→编辑→删除→重启读回，搜索筛选、320–440px、低高度与缩放。

---
# 历史：Web Markdown Clipper R1.8 · 完整网页保存与「我的摘录」

正式安装包版本：**1.2.2**（四种模式无损切换、保存后进入摘录列表及页面切换时旧正文失效）。唯一业务源码：`src/index.html`、`src/style.css`、`src/main.js`、`src/notes.js`；可信存储适配器：`trusted/notes-store.js`。仅使用既有 Sidebar Tool、Browser SDK、可信 Host 与 Chrome Storage，不新增云服务或数据库平台。

## 用户如何使用

1. 在当前网页选择「文章」「选区」「引用」「链接」，点击提取；或从 Chrome 原生右键菜单预填选区。
2. 点击「保存摘录」。可信 Host 保存完整 Markdown、标题、来源、创建/修改时间并核实存储，工具再次按 ID 读取完整正文。成功后自动进入「我的摘录」。
3. 顶部「我的摘录 · 数量」是始终存在的入口：搜索历史，点击卡片打开全文阅读。阅读页提供「编辑」「复制」「下载 .md」「删除」，列表可以刷新或加载更多；还可以「新建便签」。
4. 点击「导出备份」导出包含所有正文的 JSON。所有资料都在当前 Chrome Profile 本地；卸载、重置 Profile 或清空 Chrome 存储前请备份，当前版本不含备份导入或云同步。

## 四种模式无损切换（R1.8.2 / 1.2.2）

- 再点当前模式不会执行任何清空或 Host 请求；切换未提取模式显示空状态，并禁止保存、复制、下载，切回仍属于同一页面的模式恢复原始快照。
- 选区与引用复用同一次可信 `clip.selection`，保留富 Markdown；文章全文不能作为选区。链接只由当前已验证来源和标题构建，绝不混入正文。
- `currentPage.info` 与 `opendesk-page-changed` 约束页面会话；活动网页变化后清空最多四个模式缓存，忽略旧请求回执与不一致来源；不将私有浏览器文档 ID 暴露给工具，也不新增存储权限。
- 只读预览、Markdown 源码、保存、复制和下载使用同一份完整输出。来源格式（文末、YAML、不添加）基于原始正文重新合成，避免重复元数据。引用只对选区正文添加引用样式。
- 保存时冻结正文、标题和来源，并锁定模式与导出直到确认；手动便签的未保存编辑文本不随模式或网页切换销毁。

**安装包状态（2026-10-21）：**仓库唯一正式 JSON 已由原打包器生成候选，经过四项包格式、安全与晋升门禁后晋升至 `1.2.2`，并通过 `--check-project` 逐字节同源核对。用户提供的另一对话结果：真实 Chrome 已由 `1.1.5` 更新至 `1.2.2`，保存后进入列表、数量更新、全文与来源读回、搜索、编辑、重开持久化、删除测试记录及切换页面后禁止旧正文保存均通过，原有一条摘录保留。本次仅重建安装包，未独立复跑这些 Chrome 操作；ChatGPT 右键流程仍为 `NOT_TESTED`，官方 `app-release` 发布未执行。

## 容量与存储

- **单条 Markdown 正文上限 160,000 UTF-8 字节**（比提取器约 150,000 字节边界额外预留来源/YAML 包装空间）；**整个 `clips` 资料库 4 MiB JSON**，最多 **1000 条**。不会自动截断。
- 仅为官方安装的 `web-markdown-clipper` 开通独立 `clipNotes.*` 可信 Host 操作。标准工具 `storage.get/set` 的单项 8 KiB / 总计 32 KiB 限制**原样保留**，不扩张其他扩展权限。
- 本工具尚未上线，本轮**不设置旧版数据迁移或旧授权升级验收门槛**。从新的 Chrome Profile 空库开始使用；资料仅属于本工具的 `clips` 命名空间，不会读取 Knowledge Inbox 数据。
- 列表搜索在可信 Host 中执行，最多每次返回 50 条摘要；只有用户打开一条记录时才跨宿主边界返回完整 Markdown。全部原文仍存储于既有 Chrome 本地持久层。
- 可信 Host 持有与安装/卸载共用的工具锁，写入前后核实工具身份、版本、授权和启用状态；修改、删除使用存储版本条件，防止过期视图覆盖新内容；写入后读回，丢失回执/结果不确定时拒绝冒称成功。
- Chrome 存储容量与实际磁盘仍可能成为更外层的硬限制。超过记录、资料库或实际磁盘限额会拒绝保存并告知，不会缩短正文后谎称成功。

右键剪藏优先展示同次右键选区的 Markdown，保留标题层级、普通/有序/嵌套列表及已有链接、强调、代码语义。局部选区只包含选中的字符；保存仍需点击，容量以本页全文保存合同为准。需要同时更新可信扩展框架（日常固定 `dist/development`）；只导入 JSON 无法让旧宿主提供富选区。未取得格式时会明确提示，可保持网页选区后使用备用提取入口。已有同 ID 工具直接导入更新，勿卸载清数据。

本次通用 SDK 缺口已由源码及组件复现证明：原 `launch.consume()` 只有 Chrome `selectionText`，不含 DOM，工具沙箱无法恢复标题/列表，也无法在打开侧栏后可靠找回原选区。最小公共扩展为同一 ticket 的可空 `selectionMarkdown`，由通用 Content 快照与原菜单 Host 提供，供任何已批准菜单工具使用，无 ChatGPT 分支或新增权限/依赖。复用共用转换器及可见 Range 克隆，保留安装身份、精确文档/URL、一次消费、导航/撤权与原限额。API 合同见 [Browser SDK](../../docs/api/browser-sdk.zh-CN.md)。真实用户 ChatGPT 右键→预览→保存重开尚未实测，标记 `NOT_TESTED`；DOM/Range、Host 与存储组件证据不能替代该结论。

## 预览

从仓库根目录执行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

然后打开：

`http://127.0.0.1:8765/projects/web-markdown-clipper/preview/index.html`

预览舞台直接加载正式 HTML/CSS/JS，含全文阅读、列表、搜索、编辑、删除、夜间/浅色、320/360/400/440 px、200% 缩放及故障注入。**舞台只使用演示会话存储，点击「模拟重开侧栏」仅验证演示数据恢复，不代表已通过真实 Chrome Storage 持久化。**演示复制/下载不写入真实系统。

## 建议本地 Codex 验收

```bash
npm ci
node --test projects/web-markdown-clipper/tests/*.test.mjs
node --test tests/environment/markdown-tools-r22.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-storage-unlimited.test.mjs
node scripts/build-sidebar-tool.mjs projects/web-markdown-clipper --check-project
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

## R1.0 · 四工具统一视觉增量与规范预览（2026-10-26）

本轮只精简正式 `src/`：移除重复产品标题，选中文字右键说明默认折叠，「我的摘录」的备份收进「更多」，保存说明只有超出 160,000 字节限制时才提示。文章/选区/引用/链接、正文提取、最近摘录、检索、详情、编辑、删除、Markdown 备份、异常与读回原逻辑不重建。保留已有独立 [交互预览](preview/index.html) 作为历史产品测试入口。

新增**现有统一预览生成器**适配：仓库根目录运行 `node scripts/preview/build-preview.mjs --tool web-markdown-clipper --surface side-panel --scenario success --theme light --width 360`，输出忽略目录 `artifacts/previews/web-markdown-clipper/side-panel-success-light-360.html` 及 `.context.json`；宽度可改 320/400/440，主题 dark，场景 empty/error/permission-denied。生成器直接编入打包后的真实工具 HTML/CSS/JS，并重用本目录既有 `preview/mock-host.js` 作为离线 SDK 边界；不运行真实网页授权、剪藏或下载，不具备 Chrome 持久化证据。所有生成操作及 Chrome 安装必须在本地实际执行；本轮远端源码修改不等于正式发行包已晋升。
