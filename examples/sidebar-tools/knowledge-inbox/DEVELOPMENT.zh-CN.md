# 知识收件箱：源码、打包、调试与验收

> **本页仅补充知识收件箱的专项可信实现**。所有同类型工具必须先遵循 [Side Panel 统一开发规范](../../../docs/api/sidebar-tool-development.zh-CN.md)；公共接口以 [Side Panel API](../../../docs/api/sidebar-tools.zh-CN.md) 与源码为准。普通用户读 [README](README.zh-CN.md)，AI/Codex 读 [AGENTS.md](AGENTS.md) 和 [统一工具开发 Skill](../../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)。

## 1. 工具项目、内置包和扩展不是同一件事

```text
examples/sidebar-tools/knowledge-inbox/
  tool.config.json                工具 ID、版本、声明能力、打包文件路径
  src/index.html                  收件箱 HTML
  src/style.css                   收件箱 CSS
  src/main.js                     隔离 iframe 中的经典 JavaScript
  knowledge-inbox.opendesk-tool.json  生成的可导入工具包
  README.zh-CN.md                 用户指南
  DEVELOPMENT.zh-CN.md            本文：开发者指南
  AGENTS.md                       AI 在本目录的约束

src/sidebar-tools/knowledge-inbox.opendesk-tool.json
                                   随扩展构建发布的正式内置包
dist/production/sidebar-tools/knowledge-inbox.opendesk-tool.json
                                   npm run build 后产生的扩展资源
artifacts/sidebar-tools/knowledge-inbox/1.1.0/
                                   默认打包命令的本地产物目录
```

`examples/.../src/` 是**可维护源码**。不要直接编辑 JSON 中长字符串的 `html/css/js` 字段。`.opendesk-tool.json` 是 `opendesk.sidebar-tool.v1` **工具包**，不是 Chrome 扩展或 Task v1；Chrome 要加载包含 `manifest.json` 的完整 `dist/production/`。

## 2. 跨层职责与修改入口

| 需求 | 主要文件 | 执行位置与边界 |
| --- | --- | --- |
| 列表、详情、分类按钮、草稿编辑 UI | `examples/sidebar-tools/knowledge-inbox/src/{index.html,style.css,main.js}` | Side Panel opaque 沙箱 |
| ChatGPT 回答下的「保存 / Markdown / 更多」 | `src/knowledge/page.js` | 已授权的可信固定 Content Script |
| 页面增强接线 | `src/entrypoints/page-relay.js` | WXT 打包的受信任入口 |
| 搜索、格式、数据迁移、去重与容量 | `src/knowledge/model.js` | 受控的数据模型 |
| 权限、站点范围、包哈希 | `src/knowledge/policy.js` | 可信校验，不在沙箱自授权 |
| 操作分派、下载、存储、写入并发锁 | `src/knowledge/service.js` | 可信扩展服务 |
| Native 工作区草稿交接 | `src/knowledge/workspace-handoff.js`、`src/native-agent/workspace*` | 只复用既有已授权目录流程 |
| 固定宿主构建入口 | `src/entrypoints/knowledge-host.js`、`scripts/build-contract.mjs` | WXT 生成资源 |
| 官方内置工具内容 | `src/sidebar-tools/knowledge-inbox.opendesk-tool.json` | 跟踪的发行输入；须重新构建 |

沙箱入口 `globalThis.OpenDeskTool` 提供 `root` 和 `request(operation,payload)`；不能直接访问 Chrome API、任意网页 DOM、Node 或 Native Host。`page.capture`、`knowledge.store` 和 `knowledge.*` 是**知识收件箱官方内置可信服务的能力/操作**，不是给第三方工具开放的通用页面读取 API。普通小工具只能使用公共文档列出的已授权操作。

实际声明文件 `tool.config.json`：

```json
{
  "id": "knowledge-inbox",
  "version": "1.1.0",
  "title": "知识收件箱",
  "description": "保存 ChatGPT 回答和灵感，整理草稿、标签与备注，导出自己的 Markdown。",
  "capabilities": ["page.capture", "knowledge.store", "user.export"],
  "files": {
    "html": "src/index.html",
    "css": "src/style.css",
    "js": "src/main.js"
  }
}
```

修改工具包版本、权限或脚本，需审查已有安装、网站独立批准和权限撤销。切勿把用户记录、Token、绝对磁盘路径和账号信息写入 JSON。React/Vue/ESM 若需要使用，先在本地编译为经典单文件 JS/CSS；不允许沙箱动态加载远端代码或放宽 CSP。

## 3. 正确的源码 → JSON → 扩展开发流程

先核对 `main` 的 HEAD、`git status` 和并行 Agent 是否占用构建目录、Chrome Profile。尊重仓库根 `AGENTS.md`。

```sh
npm ci --ignore-scripts --no-audit --no-fund

# 修改 src/*.html/css/js 后生成示例包
node scripts/build-sidebar-tool.mjs \
  examples/sidebar-tools/knowledge-inbox \
  --out examples/sidebar-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json

# 审核实际打包差异，随后同步发行输入
git diff -- examples/sidebar-tools/knowledge-inbox/
cp examples/sidebar-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json \
   src/sidebar-tools/knowledge-inbox.opendesk-tool.json
cmp examples/sidebar-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json \
    src/sidebar-tools/knowledge-inbox.opendesk-tool.json
```

也可直接 `npm run build:sidebar-tool -- examples/sidebar-tools/knowledge-inbox`；此命令的**默认输出**是 `artifacts/sidebar-tools/knowledge-inbox/1.1.0/knowledge-inbox.opendesk-tool.json`，不会自动同步两个被 Git 跟踪的工具包。打包通过 ≠ 已安装工具。

修改 `src/knowledge/` 可信实现后，同样必须重新构建扩展；仅重新打包界面 JSON 不会更新 ChatGPT 网页捕获代码。

### 定向检查与正式构建

```sh
npm run check
node --test \
  tests/environment/knowledge-inbox-r1.test.mjs \
  tests/environment/sidebar-tools-host.test.mjs \
  tests/environment/workspace-integration.test.mjs \
  tests/environment/markdown-tools-r22.test.mjs

npm run build
npm run build:dev
npm run verify
```

`npm run verify` 要求 production 和 development 都已构建；只构建 production 时运行 `node scripts/verify-package.mjs dist/production`。`npm test` 是更广的环境回归，真实 Chrome 受控页面测试见 `tests/framework/knowledge-inbox-native-r1.test.mjs` 和 `.github/workflows/knowledge-inbox-r1.yml`。

### Chrome 手工检查

1. 在 `chrome://extensions` 开发者模式加载 `dist/production/` 文件夹，已有扩展则重新加载并刷新网页。
2. 在 Side Panel「工具」安装知识收件箱，再在工具条目**单独批准 ChatGPT 网站**。安装不等于站点授权。
3. 等待回答完成后检查按钮位置、单条保存、精确选区、重复保存、标签、草稿、Markdown 导出、图片入口。
4. 检查生成中/隐藏回答、SPA 对话切换、未保存草稿离开、权限撤销、卸载与备份；确保原文与用户草稿不互相覆盖。
5. 本地目录测试必须在已有授权的 Workspace 中明确点击**创建新文件**，取得写入回执、读回和哈希证据。发送/载入草稿只是交接，不代表写盘成功，也不证明云盘已同步。

## 4. 边界、容量、资料同步

知识收件箱最多 200 条 / 4 MiB，单条原文及草稿各不超过 150,000 UTF-8 bytes；Native MD 交接含元数据上限 32 KiB。工具有 JSON 备份导出，但尚未实现备份导入；图片当前只有逐张下载入口，不是离线附件包；固定 Markdown 追加、博客和企业系统连接器仍属后续需求。不要误套普通沙箱 `storage.local` 的配额或把后续需求描述为已完成。

| 文档读者 | 维护位置 | 需要更新的场景 |
| --- | --- | --- |
| 用户 | [README](README.zh-CN.md) | 可见按钮、容量、使用步骤变化 |
| 开发者 | 本文及 [通用工具 API](../../../docs/api/sidebar-tools.zh-CN.md) | 开发流程、公共 API/能力变化 |
| 产品人员 | [需求排序与路线图](../../../docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md) | 30 项需求、阶段计划、范围变化 |
| AI/Codex | [AGENTS.md](AGENTS.md)、[Skill](../../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md) | 开发约束、信任边界变化 |
| 验收人员 | [workstream](../../../docs/framework/workstreams/knowledge-inbox-r1-20261011.md) 及 `evidence/` | 按候选 SHA、包哈希记录原始测试 |

受控 Chrome fixture ≠ 线上 ChatGPT；macOS SW 冒烟 ≠ 用户 Mac 的 Native 磁盘写入；构建/提交 ≠ 完整 ZIP/F3 产品验收。
