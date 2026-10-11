# Side Panel 可安装小工具 API 参考

> 本页只说明 **`opendesk.sidebar-tool.v1` 的当前接口合同**。**所有同类型工具的统一开发方法**（选型、目录规范、预览、打包、安装、测试）请先阅读 [Side Panel 工具统一开发规范](sidebar-tool-development.zh-CN.md)。示例见 [examples/sidebar-tools](../../examples/sidebar-tools/README.zh-CN.md)；AI/Codex 用 [开发 Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)。

这是 Side Panel「工具」中的可安装 HTML/CSS/JS 工具包，不是单独的 Chrome 扩展，不是 `opendesk.task.v1`，也不是 Controller/Page USER_SCRIPT 项目。**源代码与运行合同的最终依据**为 `src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`scripts/build-sidebar-tool.mjs`。

## 1. 工具源配置与运行包的区别

开发者维护的 `tool.config.json`：

```json
{
  "id": "sample-notes",
  "version": "1.0.0",
  "title": "示例笔记",
  "description": "保存个人笔记。",
  "capabilities": ["storage.local"],
  "files": {"html":"src/index.html","css":"src/style.css","js":"src/main.js"},
  "assets": []
}
```

`scripts/build-sidebar-tool.mjs` 输出的 `<id>.opendesk-tool.json` 是扁平包：

```json
{
  "format": "opendesk.sidebar-tool.v1",
  "id": "sample-notes",
  "version": "1.0.0",
  "title": "示例笔记",
  "description": "保存个人笔记。",
  "capabilities": ["storage.local"],
  "html": "<main>...</main>",
  "css": "...",
  "js": "..."
}
```

这里的字符串是**字段示意**，不是可安装的完整示例；请用打包器从真实文件生成。最终 JSON 只允许 `format/id/version/title/description/capabilities/html/css/js`，不是 `manifest.json`。源配置只允许 `id/version/title/description/capabilities/files/assets`。

| 项目 | 当前约束 |
| --- | --- |
| 格式 | `opendesk.sidebar-tool.v1` |
| id | `^[a-z][a-z0-9-]{1,39}$`，稳定且安装时按 ID 区分 |
| version | 数字 `major.minor.patch`，没有前缀/预发布标签 |
| title / description | 最长 80 / 300 字符 |
| HTML / CSS / JS | 最长 64,000 / 120,000 / 220,000 字符（源文件还有相应字节预算） |
| 完整包 | 最大 320,000 UTF-8 bytes |
| 安装数量 | 最多 12 个 |
| 图片 assets | 最多 16 个；每张 ≤96 KiB；PNG/JPEG/WebP，本地预嵌入 |

HTML 不允许 `script/iframe/object/embed/base/link/meta/style` 标签、内联事件、`javascript:` 等；CSS 不允许远程 `@import`、HTTP/JS 资源；JS 必须是单个本地经典脚本，不能直接保留顶层 `import/export`。校验器不能代替 CSP、安全审计或真实浏览器验收。

## 2. 工具的运行 API

隔离沙箱的唯一工具对象：

```javascript
const {root, request} = globalThis.OpenDeskTool;
const status = root.querySelector('#status');
const {value,etag} = await request('storage.get', {key:'note',withEtag:true});
await request('storage.set', {key:'note',value:'hello',ifMatch:etag});
status.textContent = '已保存';
```

`root` 是该工具 UI 自己的根元素。`request(operation,payload)` 异步返回经过宿主验证的结果，或以错误拒绝。任何需要用户数据/站点内容的操作都应在明确的用户动作后执行，不吞掉异步错误。

### 普通第三方小工具的基础操作

| capability（安装时审阅） | request operation | 行为与限制 |
| --- | --- | --- |
| `storage.local` | `storage.get`：`{key,withEtag?}` | `{value}` 或 `{value,etag}`，数据属于当前工具命名空间 |
| `storage.local` | `storage.set`：`{key,value,ifMatch?}` | `{saved:true}`；若提供 `ifMatch`，按相同工具 Web Lock 下的 ETag 防冲突写入 |
| `currentPage.read` | `currentPage.info` | `{status:'available',title,url}` 或 `{status:'unavailable',message}`；只提供当前目标标题/URL |
| `tasks.open` | `tasks.open`：`{taskId}` | 聚焦已安装、已启用任务的 UI，不执行/停止任务 |
| `user.export` | `clipboard.writeText`：`{text}` | 环境允许时复制纯文本，成功返回 `{copied:true}` |
| `user.export` | `file.download`：`{text,filename}` | 请求 Chrome 下载安全文件名的 `.md`；返回 `{downloadId}` 不能单独证明真实落盘 |

普通 `storage.local` 当前最多 32 个键，每项 JSON ≤8,192 字节，工具数据对象总 JSON ≤32,768 字节。`key` 须以英文字母开头，仅允许英文字母/数字/点/下划线/连字符，最长 60 字符。`withEtag/ifMatch` 是可选的条件更新；发生冲突应重新读回并让用户决定，不自动覆盖。

`clipboard.writeText`、`file.download` 的文本须非空且 UTF-8 ≤150,000 bytes。`file.download` 仅允许不含路径分隔符等危险字符的 `.md` 文件名（长度 ≤90）；一般网络下载、二进制文件和任意绝对路径写入都**不是**此 API 的能力。工具不使用宿主的任意网络代理。

### 官方固定网页增强能力（不是任意 DOM API）

| capability | 现有固定操作/服务 | 限制 |
| --- | --- | --- |
| `page.toc` | `toc.snapshot`、`toc.navigate` | 复用阅读目录可信 Content Script、明确网站许可及目标文档再校验；非通用页面选择器 |
| `page.clip` | `clip.article`、`clip.selection`、`clip.link` 等固定剪藏操作 | 复用剪藏可信 Content Script、单独的网站许可及定向结果 |
| `page.capture` | ChatGPT 知识保存专用页面捕获 | 已批准网站和官方扩展固定入口；不能自行定义任意采集脚本 |
| `knowledge.store` | `knowledge.list/get/update/remove/backup/download/openSource/workspace` 等 | 只有 `knowledge-inbox` 固定宿主与服务识别的工具身份允许相应操作；不是通用存储配额 |

**重要区别**：schema 接受某能力名称，**不代表**任何安装的第三方工具都得到相同的可信宿主逻辑，更不能直接调用 `chrome.tabs`、网页 DOM、Native Messaging 或网络。开发新的跨网页能力必须先设计并实现受信任宿主、站点授权、sender/document 校验、撤权和负向测试。专项工具的具体业务接口与版本由其源码和项目文档维护，不在通用 API 中承诺扩展能力。

## 3. 页面变更、生命周期与安全边界

- 只有用户**主动打开**工具才创建 iframe。切换/关闭销毁旧 iframe 与未完成请求；iframe 的定时器不是可持续执行的后台任务。
- 已安装工具和只读开发预览彼此隔离；只读预览对 `storage.get` 仅返回模拟空值，对 `currentPage.info` 返回 unavailable，拒绝真实写入、任务打开或网页控制。
- 可信宿主使用 sandbox `event.source`、opaque `origin`、`instance`、工具 ID、当前安装包和能力权限约束消息。`origin=null` 本身并不是可信身份。
- 宿主可给工具的 `root` 派发 `opendesk-page-changed` 事件，用于在页面目标变化后重新查询信息；不能假定旧目标仍可继续使用。
- 工具里显示不可信正文时应使用 `textContent`，避免把用户输入、网页内容或远端 HTML 当成可信 DOM 注入。
- 工具安装不会自动授予网站权限；独立标签页的页面目标/剪藏权限不等于原 Side Panel 的已绑定目标。对敏感操作需由实际 UI 授权并处理不可用状态。
- 更新、卸载与工具写入使用既有宿主锁和重新验证，卸载还会删除本工具本地数据。交付前必须明确提醒用户备份重要数据。

## 4. 维护和排错入口

- **开发方法**：[统一开发规范](sidebar-tool-development.zh-CN.md)。
- **示例**：[quick-notes](../../examples/sidebar-tools/quick-notes/README.md)、[React starter](../../examples/sidebar-tools/react-starter/README.md)、[Vue starter](../../examples/sidebar-tools/vue-starter/README.md)。
- **专项网页工具**：[阅读目录](../../examples/sidebar-tools/reading-toc/README.md)（含文章/AI 对话手工 fixture）、[网页剪藏](../../examples/sidebar-tools/web-markdown-clipper/README.md)、[知识收件箱](../../examples/sidebar-tools/knowledge-inbox/README.zh-CN.md)。
- **开发者与 AI**：[API 首页](README.md)、[AI Skill](../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)、[测试指南](../framework/testing-guide.md)。
- **源码合同**：`src/ui/sidebar-tools/package.js`、`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`scripts/build-sidebar-tool.mjs`。

本页记录现有 `v1` 能力，不表示正在设计中的应用市场远端安装、批量迁移、自动发布、完整 React 热同步或通用 Native API 已落地。
