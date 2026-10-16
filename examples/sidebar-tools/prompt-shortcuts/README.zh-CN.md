# 提示词快捷按钮（Prompt Shortcuts）

> 正式工具 ID：`prompt-shortcuts`，版本 `1.1.1`。ChatGPT 内置适配器已完成，其他网站可配置自定义规则。源码在本目录；不是额外的 Chrome Extension。

## 使用流程

1. 在 OpenDesk Browser「扩展」找到「提示词快捷按钮」，从官方可选目录审阅并安装，再打开管理界面。
2. 点击右上角的「新建」图标，**只输入完整提示词正文**即可保存。短标签和显示名称默认取最前两个可见 Unicode 字素；均可留空，按钮外形统一为圆角方形。
3. 已安装且启用时，`https://chatgpt.com` 主内容区左侧直接显示快捷按钮，不需要逐站二次授权。点击网页按钮只尝试插入当前草稿，不自动发送；失败时尝试直接复制，复制仍不可用才显示明确失败反馈。
4. 选中文字后快速创建属于**可选**的 Chrome 原生右键功能：可在工具详情的受信任「设置」中启用，只有这一功能可能需要原生菜单许可；选区预填新建表单后仍需**显式保存**。
5. 列表第一视觉层级为提示词正文；点击正文直接复制，不弹出额外复制窗口。每条仅常显「更多」图标，展开后用六个 SVG 操作图标完成编辑、启停、排序、复制与确认删除。关闭 Side Panel 后，已安装且启用的网页按钮独立运行。

## 存储和安全边界

- 使用现有 `OpenDeskTool.request('storage.get'/'storage.set')` 隔离存储。全部提示词存入 `library` 单一 JSON 项，现有上限 **8192 UTF-8 字节**，按完整 JSON 计算。正文不会自动截断；超限时拒绝保存并保留草稿。
- ETag / ifMatch 在同一工具锁下保护并发编辑。工具停用、版本变动、卸载与页面切换都必须经过可信运行时验证。
- 网页适配器：`trusted/page.js`；精确 ChatGPT Origin 与工具安装/启用检查：`trusted/policy.js`。工具的 Sandbox JS 不能直接获取 ChatGPT DOM；网页插入不读取聊天历史、不上传提示词、不触发发送按钮。
- 共享 Unicode 数据模型：`trusted/model.js`，既以固定摘要依赖打进独立工具包，也受现有构建源码来源白名单限定进入固定页面模块。不能将此目录的任意脚本动态注入网页。
- **原生菜单**由现有 Browser SDK v2 的 `browser.contextMenu`、`browser.launch.consume()` 和既有 Chrome 菜单 Host 提供；不维护第二个菜单服务。
- 工具停用与卸载会停止网页按钮。保留全局网页按钮开关供用户自行关闭；卸载会清理本工具的数据及旧版授权记录，重要内容请先手动备份。

## 范围、验收与后续

当前仅 `https://chatgpt.com` 有已验证的内置适配器。其他普通 HTTP(S) 网站可由用户按精确 Origin 自行配置，但仍需对实际编辑器单独验收。Claude、Gemini 等尚未完成真实网站验证，**不能宣称为已验证预设**；不得扩大授权或凭 DOM 猜测自动兼容。

运行不修改正式 build 输出的定向测试：

```sh
node --test tests/environment/prompt-shortcuts-r14*.test.mjs
```

对应 CI：`.github/workflows/prompt-shortcuts-r14.yml`。该 CI 覆盖工具包、存储、授权、构建来源边界以及模拟网页生命周期/草稿插入（[R1.4 9/9 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738460330)），仍不能代替生产构建、真实 Chrome 安装、实时 ChatGPT 富文本输入、Undo 与中文输入法验收。实际候选及交接记录见 `docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md`。

### R1.5 安全插入补充

- 原生点击插入前再次检查安装、工具启停、适用网站、按钮和草稿；IME 组合期间拒绝触碰输入框；同一轮异步验证只处理一次点击。
- 富文本段落不能仅用 `textContent` 或“忽略全部空白后包含正文”确认成功。当前可信 ChatGPT 模块会核对原有正文、顺序及完整多行内容。结果不明确则提示检查并手动复制，绝不自动重试或发送。
- R1.5 已有独立 Chromium **模拟编辑器** 的多行与撤销实验，仍需在安装的 Chrome 和**真实 ChatGPT** 富文本编辑器中验收；可持续查看同一 [交接文档](../../../../docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md) 的状态。

## 仓库内正式可安装工具包与本地测试

**直接使用本目录的正式文件：** [`prompt-shortcuts.opendesk-tool.json`](./prompt-shortcuts.opendesk-tool.json)。
这是随 `main` 提交的 **Sidebar Tool v2** 可移植 JSON 包，不需要下载 CI ZIP，也不是独立 Chrome Extension。
首次入库提交：[`ddd386ba2`](https://github.com/shopable-ai/opendesk-browser/commit/ddd386ba220213192bc7b0bf3a4ea8d8bbcc77a1)；当时大小 35,083 bytes，SHA-256
`1f09804545c2a654cccab76c1a863c29453b1239b7e387e0d6e4225df3bed412`。

本地更新源码后，在仓库根目录按统一门禁执行（**未通过测试时不覆盖本目录的旧正式包**）：

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts \
  --out artifacts/sidebar-tools/prompt-shortcuts/candidate.opendesk-tool.json

node --test tests/environment/prompt-shortcuts-r14*.test.mjs

node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts \
  --promote-from artifacts/sidebar-tools/prompt-shortcuts/candidate.opendesk-tool.json

node scripts/build-sidebar-tool.mjs examples/sidebar-tools/prompt-shortcuts --check-project
git diff -- examples/sidebar-tools/prompt-shortcuts/
```

现有打包器负责全部 `tool.config.json`/HTML/CSS/JS 的确定性编译，`--promote-from` 只接受与当前源码逐字节一致的已测试候选；不同版本的临时包保存在忽略的 artifacts 目录即可，工具根只保留 `prompt-shortcuts.opendesk-tool.json`。自动测试通过代表 `PACKAGE_PASS`，真实 ChatGPT/IME、安装、停用与卸载仍需原生验收。常规打包不再自动刷新根目录文件；不要使用 `--out` 直接写正式路径。

本地真实安装：先确认日常 OpenDesk 浏览器仍加载标准 `dist/development` 与现有唯一 `npm run dev` watcher；在 OpenDesk「扩展」的已有工具导入入口选择上述 **JSON 文件**，完成原有权限/来源审阅后安装并打开。若同 ID/版本的正式官方工具已经安装，先核对当前包身份与原有数据，禁止绕过版本、授权或更新审核硬替换。也可使用已有「官方可选工具」入口安装，二者不能造成第二个工具身份。

**R1.5 CI 证据：** [Run 38743743798](https://github.com/shopable-ai/opendesk-browser/actions/runs/38743743798) 为 **11/11 Node PASS、语法 PASS、可移植 v2 PACKAGE_PASS**；[Run 38747308859](https://github.com/shopable-ai/opendesk-browser/actions/runs/38747308859) 验证并提交了本目录的同字节工具包。它们仍不代表完整 production WXT 构建、真实 Chrome、ChatGPT 富文本、Mac 中文 IME、原生右键或卸载/重装已经通过；原始证据和缺口记录在唯一 [交接文档](../../../../docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md)。

### R1.7 双预览映射与正式工具更新

- `preview/index.html` 和 `preview/mock.html` 是用户确认过的原版设计基准，**没有重建或覆盖**。正式管理 UI 对齐卡片、原位删除、两个独立开关、内容优先表单、最终短标签/形状预览与 8192 B 配额。
- 网页可信按钮栏紧凑化，修复窄内容区折叠类名，完整长文本 Tooltip 可滚动，针对快速双击增加重复抑制。真实草稿仍采用原生插入、完整读回、撤权及中文输入法组合保护。
- 工具更新候选版本为 **1.0.1**：通过已有 OpenDesk 扩展安装器审阅和升级，**不能将新字节强行覆盖已安装同版本 1.0.0**；正式包的版本/摘要改变后需要在工具详情重新确认 chatgpt.com 网站授权。
- 在管理工具沙箱内，无法权威读取网页授权状态时明确要求去宿主工具详情确认，不能根据右键菜单许可推断网站授权。
- 当前远端开发环境不可访问用户 Mac 的 `dist/development` watcher、真实 Extension ID、Native 配对或已登录 ChatGPT。Node/CI 不等于原生安装、Cmd+Z 或 Mac 中文 IME 验收；详情见唯一主交接文档。

### R1.13 免重复授权与紧凑设置（候选验收）

- `preview/index.html`：删除独立网站授权模拟页；新增可交互的宿主设置视图，仅保留工具启停、适用网站说明和可选的原生右键功能。
- `src/index.html` / `src/style.css` / `src/main.js`：列表正文优先、单击直接复制、编辑表单默认三行且滚动、按钮设置为紧凑的 Label/Input 行，统一圆角正方形。
- `trusted/page.js` / `trusted/policy.js`：安装启用后仅在 `https://chatgpt.com` 原点运行，仍保留安装身份、用户开关、可信点击、IME 与不自动发送的校验；不把旧逐站授权当成额外的阻塞条件。
- `src/ui/sidebar-tools.js` / `src/ui/tool.html` / `src/ui/tool-shell.css`：对本工具隐藏重复的网站授权按钮与清单；Chrome 原生右键功能在受信任的宿主设置内独立管理，不影响其他工具的权限体系。
- 正式候选包为同 ID `1.0.2`，更新必须通过正常审核/版本升级。当前版本的 CI、正式 Chrome 安装、真实网页富文本编辑器与 Mac IME 验收应查看最新 GitHub Actions 回执，不能用旧版历史 PASS 代替。

### R2.0 网站适配扩展（1.1.0）

正式工具现支持在「适用网站」中为非 ChatGPT 的 HTTP(S) 网站手动设置两项：**按钮容器**和**目标输入框**。打开网站后选择、测试并保存，网页再次打开或刷新将按精确 Origin 和路径作用域显示快捷按钮。列表、提示词正文和原生右键不受影响。规则保存到本工具独立 `sites` 数据项，支持编辑、启停与删除，错误恢复遵循与提示词库相同的 ETag 并发规则。

安全边界：未配置网站不生效，不会自动发送；登录、密码、支付或含糊的输入框不应被强行填入。复杂富文本编辑器必须通过真实网站验证后才能宣称兼容。Claude、Gemini 等目前仅属待验收目标，不能以模拟页面通过代替真实网站通过。

## R1.17 正式图标交互

- 列表卡片默认只有一个 40px「更多」图标；展开后为编辑、启停、上移、下移、复制、删除六个无文字 SVG 操作。每个按钮保留 title / aria-label、键盘焦点、Esc 关闭及删除前的文字确认；禁用的提示词也可以通过展开工具栏复制完整正文。
- 新建采用工具内右上角 Plus 图标；宿主仍负责自己的标题与通用安装设置，不新增宿主 Action Slot 或第二套 Header。
- 新建／编辑表单隐藏无价值的固定字节提示和占位预览，接近 8 KiB 时才显示存储计数；新增「保存并继续」，成功的 Host 持久回执后才清空并聚焦新建正文，异常保留草稿。
- 内置 ChatGPT／多网站双选择器、原生右键、权限与可信 Host 未变。Chromium 模拟 Host 验证不等于已安装的 Mac Chrome 验收。
