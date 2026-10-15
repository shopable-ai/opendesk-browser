# 提示词快捷按钮（Prompt Shortcuts）

> 正式工具 ID：`prompt-shortcuts`，版本 `1.0.0`。当前仅有 ChatGPT 站点适配器。源码在本目录；不是额外的 Chrome Extension。

## 使用流程

1. 在 OpenDesk Browser「扩展」找到「提示词快捷按钮」，从官方可选目录审阅并安装，再打开管理界面。
2. 点击「＋ 新建」，**只输入完整提示词正文**即可保存。短标签和显示名称默认取最前两个非空白 Unicode 字素；名称、外观、单项启用状态均可自定义。
3. 在工具详情的受信任「设置」中，对当前 `https://chatgpt.com` 明确授权网页按钮。回到 ChatGPT 页面，主内容区域左边出现按钮栏；点击标签只在当前编辑草稿末尾插入内容，不自动发送。若插入无法确认，按照页面的手动复制提示操作。
4. 如需选中文字后快速创建，另在工具详情对当前 ChatGPT 站点启用 Chrome 原生右键菜单（可能需要浏览器许可）。选中文字 → Chrome 原生右键菜单「添加为提示词快捷按钮」→ 新建表单预填 → **显式保存**。右键快捷添加开关与网页按钮开关互不依赖。
5. 列表每项使用「编辑」「更多」进行排序、启停、复制、确认删除。关闭 Side Panel 后，已授权且已启用的网站按钮独立运行。

## 存储和安全边界

- 使用现有 `OpenDeskTool.request('storage.get'/'storage.set')` 隔离存储。全部提示词存入 `library` 单一 JSON 项，现有上限 **8192 UTF-8 字节**，按完整 JSON 计算。正文不会自动截断；超限时拒绝保存并保留草稿。
- ETag / ifMatch 在同一工具锁下保护并发编辑。权限撤回、工具更新、卸载与页面切换都必须经过可信运行时验证。
- 网页适配器：`trusted/page.js`；网站许可与身份：`trusted/policy.js`。工具的 Sandbox JS 不能直接获取 ChatGPT DOM；网页插入不读取聊天历史、不上传提示词、不触发发送按钮。
- 共享 Unicode 数据模型：`trusted/model.js`，既以固定摘要依赖打进独立工具包，也受现有构建源码来源白名单限定进入固定页面模块。不能将此目录的任意脚本动态注入网页。
- **原生菜单**由现有 Browser SDK v2 的 `browser.contextMenu`、`browser.launch.consume()` 和既有 Chrome 菜单 Host 提供；不维护第二个菜单服务。
- 工具禁用、站点撤权与卸载不会默许网页按钮继续运行。卸载会清理本工具的数据及站点授权，重要内容请先手动备份。

## 范围、验收与后续

本版本只支持 `https://chatgpt.com`。Claude、Gemini 等是后续独立授权的适配候选，**目前没有实现**；不得扩大通配网站权限或凭 DOM 猜测自动兼容。

运行不修改正式 build 输出的定向测试：

```sh
node --test tests/environment/prompt-shortcuts-r14*.test.mjs
```

对应 CI：`.github/workflows/prompt-shortcuts-r14.yml`。该 CI 覆盖工具包、存储、授权、构建来源边界以及模拟网页生命周期/草稿插入（[R1.4 9/9 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38738460330)），仍不能代替生产构建、真实 Chrome 安装、实时 ChatGPT 富文本输入、Undo 与中文输入法验收。实际候选及交接记录见 `docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md`。

### R1.5 安全插入补充

- 原生点击插入前再次检查安装、站点授权、按钮和草稿；IME 组合期间拒绝触碰输入框；同一轮异步验证只处理一次点击。
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
