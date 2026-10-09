# 本地 JS 与项目格式

[返回总入口](README.md)。短脚本用单文件；需要相对模块、CSS/图片、npm 或 HTTPS 时使用目录项目。保存只改变下次明确运行的输入，已入场运行和旧结果保持冻结。

## 单文件

使用 [single-file/title.js](../../examples/programs/single-file/title.js)：

```js
async function main() {
  return {title:await page.title(),url:await page.url(),value:params.value ?? 0};
}
```

把此**文件本身的绝对路径**加入 MCP `--allow-project`；目录授权不自动允许其中一个文件作为独立绑定。再由 MCP 客户端调用：

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
