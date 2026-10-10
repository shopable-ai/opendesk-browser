# 本地 JS 与项目格式

[返回总入口](README.md)。短脚本用单文件；需要相对模块、CSS/图片、npm 或 HTTPS 时使用目录项目。保存只改变下次明确运行的输入，已入场运行和旧结果保持冻结。

## Go 原生单文件 Provider（无需 Node Host）

从 2026-10-10 的 Go 候选开始，**已安装且已经绑定真实扩展 ID 的 OpenDesk** 能自己读取一个用户明确授权的 `.js/.mjs` 文件，通过原 Native Messaging v1 `projects.list/project.resolve` 让 Sidebar 列出和读取该脚本。Chrome 仍执行原 RunHost/Controller/Page，不存在第二个 Go 网页执行器。

当前这是**开发者/AI 可操作的最小接口**，不是“应用安装后自动扫描硬盘”或已经完成的普通用户 GUI 文件选择器。用户正常浏览器草稿功能本来就不需要 Node；Go 原生 Provider 不等于 npm、多文件 ESM 和 HTTPS Resolver 已去 Node。

只有在 Go Host 已安装后才使用以下命令；其中绝对路径与精确网站来源必须来自用户实际希望授权的对象：

```sh
opendesk browser project add --path /absolute/path/to/title.js --runtime-kind controller --site-origin http://127.0.0.1:43111
opendesk browser project list
# 需要撤权时，使用 list 返回的真实 bindingId：
opendesk browser project revoke --binding-id local-xxxxxxxxxxxxxxxxxxxx
```

Page 单文件则使用 `--runtime-kind page-userscript --entry-format classic-userscript` 或 `async-main`；Controller 只支持 `async-main`。最多 8 个文件授权、每份源码 48 KiB、HTTP(S) 精确 origin。目录、父路径符号链接、文件身份替换、过大/非 UTF-8、非法来源一律拒绝；编辑同一文件不会自动 Run。源内容的真实 `sourceHash` 和大小由 Sidebar 再校验，实际网站权限需在 Chrome 独立授予。

授权完成后，Go Host 的 `project.changed` 会通知已经连接的扩展更新来源；如果扩展未连接，下一次 Native 连接会读取授权。在 Sidebar「开发 → 本地项目」可以刷新当前来源，再选择文件并明确点击运行。R17 Go Host 将新的多个目录 Provider、旧 MCP 与 Go 单文件聚合；R2.2 的 Node MCP 独占优先级仅代表旧协议历史状态。目录命令使用 [R17 直连指南](../framework/local-directory-cli-r17.zh-CN.md)，不自动把只读 Workspace 伪装成可运行程序。此模型目前只支持单文件，没有自动停止原业务任务的“热替换”。

正式项目安装、官方 Extension ID、用户可见的原生文件授权对话框及 Node→Go 安装迁移仍需独立完成和真实 Chrome 验收。参见 [Native 兼容台账](../architecture/browser-framework/native-convergence-compatibility-r3.zh-CN.md)。

## 单文件

使用 [single-file/title.js](../../examples/programs/single-file/title.js)：

```js
async function main() {
  return {title:await page.title(),url:await page.url(),value:params.value ?? 0};
}
```

若使用**高级 Codex MCP 方案**（npm/HTTPS、多文件或需要与现有 Resolver 完全一致的高级诊断），把此**文件本身的绝对路径**加入 MCP `--allow-project`；目录授权不自动允许其中一个文件作为独立绑定。再由 MCP 客户端调用：

```json
{"name":"opendesk.dev.attach","arguments":{"path":"/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/single-file/title.js","runtimeKind":"controller","entryFormat":"async-main","siteOrigin":"http://127.0.0.1:43111"}}
```

`runtimeKind` 必须是 controller 或 page-userscript；entryFormat 默认 async-main，classic-userscript 仅用于 Page 经典顶层脚本。siteOrigin 是精确 HTTP(S) origin，无路径/末尾斜杠，不能写完整 demo-form URL。本例 run 可传 `params:{"value":101}`，完成值包含 101。

单文件不强制 package，也没有项目 npm/资产上下文；静态 import 改为目录项目。Page 最小源码是 `async function main(){return document.title;}`，attach 改为 page-userscript，查询用 previewId；无受管资源的脚本不支持受管 Stop。

## 相对 ESM 目录

独立脚本 [single-file/title.js](../../examples/programs/single-file/title.js) 与下述多文件示例分开保存，避免改变项目目录中经过验证的文件结构。

复用 [local-controller](../../examples/programs/local-controller/README.md)：

```text
local-controller/
  package.json
  src/main.js
  src/extract.js
```

完整最小 package：

```json
{
  "name":"@opendesk-examples/local-controller",
  "version":"1.0.0",
  "private":true,
  "type":"module",
  "description":"本地网页标题示例",
  "opendesk":{
    "format":"opendesk.project.v1",
    "id":"sample.local-controller",
    "runtimeKind":"controller",
    "sourceFormat":"esm",
    "entry":"src/main.js",
    "siteOrigins":["http://127.0.0.1:43111"],
    "permissions":["page.automation"],
    "paramsSchema":{"type":"object","properties":{},"required":[],"additionalProperties":false}
  }
}
```

入口 [src/main.js](../../examples/programs/local-controller/src/main.js)：

```js
import {readSummary} from './extract.js';
export default async function main({page}) {
  return readSummary(page);
}
```

模块 [src/extract.js](../../examples/programs/local-controller/src/extract.js)：

```js
export async function readSummary(page) {
  return {version:1,title:await page.title()};
}
```

目录 attach 只传 path；类型和范围由 package 决定。id 最长 60 字符，以字母/数字开头，余下允许字母、数字、点、下划线、横线。入口必须 default export，模块使用 UTF-8 `.js/.mjs` 和静态相对 ESM。未支持 JSX/TSX、`.vue`、自定义 loader/config、动态 import、require 或 eval。

## 参数、Page 规则和资产

Controller siteOrigins 恰好一个，permissions 为 `["page.automation"]`；paramsSchema 验证 run 参数。示例只允许 `{}`，不能向它传 value。需要 value 时在自己的项目 schema 声明数字字段，并在 `main({params})` 中读取。Sidebar 本地参数与手工草稿参数分开保存。

Page 使用 pageRules 替代 Controller 网站/参数字段。下列是 [local-page-ui/package.json](../../examples/programs/local-page-ui/package.json) 的 opendesk 部分，外层 name/version/private/type/description 仍必需：

```json
{
  "format":"opendesk.project.v1",
  "id":"sample.local-page-ui",
  "runtimeKind":"page-userscript",
  "sourceFormat":"esm",
  "entry":"src/main.js",
  "pageRules":{"matches":["http://127.0.0.1/*"],"excludeMatches":[],"runAt":"document_idle","allFrames":false,"world":"USER_SCRIPT"},
  "assets":[{"path":"assets/ui.css","kind":"css"},{"path":"assets/mark.png","kind":"image"}]
}
```

这个 localhost 匹配模式不固定端口；运行仍检查实际 origin 和独立网站授权。资产显式声明，最多 32 项，kind 为 css/json/image；Controller 不支持 Page 资产。获取、挂载及清理见[Page](page-userscript.zh-CN.md)。

## 修改与绑定变化

1. 保存文件后检查 status/当前网页；只读 diagnostics 仅查看此前读取/解析错误，不校验刚保存的磁盘源码；lastError:null 不证明新代码有效。
2. 使用新的有意执行 requestId 或点 Run，重读依赖闭包、校验锁和资产、在内存中构建；错误不回退成旧代码。
3. 比较 source.inputHash（输入图、配置、工具身份）和 source.sourceHash（最终字节）。注释变化可能只改变输入哈希。
4. Controller 查新 runId，再查旧 runId 验证旧结果冻结。受管 Page 同文档再预览先确认旧清理；清理不返还预览世界预算。

项目 ID/类型改变报 E_DEV_CONFLICT，先显式 detach 再 attach。网站范围变更先收尾旧运行、detach、修改 package/单文件配置、核对新授权并 attach。允许路径变化需更新 MCP 启动配置。detach 不停止旧运行，也不抹掉其结果。

依赖与限制见[故障排查](dependencies-and-errors.zh-CN.md)。机器合同：[项目 schema](../../schemas/opendesk-program-project.v1.schema.json)、[验证器](../../scripts/validate-program-project.mjs)；冻结产物见[项目制作合同](../architecture/browser-framework/program-project-authoring-r1.zh-CN.md)。
