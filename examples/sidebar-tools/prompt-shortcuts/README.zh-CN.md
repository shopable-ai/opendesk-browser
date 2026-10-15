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

对应 CI：`.github/workflows/prompt-shortcuts-r14.yml`。该 CI 覆盖工具包、存储、授权、构建来源边界以及模拟网页生命周期/草稿插入（[8/8 PASS](https://github.com/shopable-ai/opendesk-browser/actions/runs/38737382042)），仍不能代替生产构建、真实 Chrome 安装、实时 ChatGPT 富文本输入、Undo 与中文输入法验收。实际候选及交接记录见 `docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md`。
