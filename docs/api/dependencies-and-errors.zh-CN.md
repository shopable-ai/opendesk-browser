# 依赖、限制和故障排查

[返回总入口](README.md)。多文件项目支持静态相对 ESM、已安装且精确锁定的 npm、已锁定/缓存的 HTTPS ESM。每次 dev.run 只读取与验证必要闭包并内存构建，不安装包、不联网补锁。手工草稿和独立单文件没有这些项目依赖上下文。

## npm：先准备项目自己的安装目录

使用已有 [page-npm-lodash](../../examples/programs/page-npm-lodash/README.md)，package 声明 `"dependencies":{"lodash-es":"4.17.21"}` 并提交独立 package-lock.json。入口通过相对模块读取 h1，模块内容为：

```js
import escape from 'lodash-es/escape.js';
export function describeHeading(doc) {
  const text=doc.querySelector('h1')?.textContent?.trim() || '';
  return {text,safeHtml:escape(text)};
}
```

1. 核查已有 package/lock，安装缺少时在仓库根执行 `npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts`。仓库根 npm ci 只安装工具，不会替用户项目安装依赖。本轮没有安装或新增依赖。
2. MCP --allow-project 包含此目录，attach **只传 path**；打开允许的 `http://127.0.0.1:43111/demo-form.html` 或 `https://example.com/`，批准网站与 USER_SCRIPT 权限。
3. 用 status 的 bindingId 调 run，参数 `{"bindingId":"实际 bindingId","requestId":"tutorial-npm-1"}`，不传 Controller params/deadline。
4. 用返回 previewId 查询 result。demo-form 上 result.resultText 展示 `{text:"OpenDesk Browser Test Lab",safeHtml:"OpenDesk Browser Test Lab"}`。这是普通 Page 结果，没有受管 UI 或 Controller resultId；该例不支持受管 Stop。
5. 修改本地 heading.js 的返回内容并保存，使用新 requestId 明确再运行，比较新 previewId/sourceHash；旧预览用原 previewId 查询，仍须满足原会话/Host/文档，不能承诺长期持久保存。

直接 npm 依赖要求精确版本，lockfile v2/v3 根 dependencies 与 package 一致；实际消费包需精确版本、HTTPS resolved、SHA-512 integrity，安装目录身份一致。npm ci 负责真实安装/tarball 校验；Resolver 的静态核对不替代这些动作。包不能依赖项目 shell、自定义 loader 或运行时代码生成。

## HTTPS：一次显式锁定，之后离线运行

使用 [remote-esm-page](../../examples/programs/remote-esm-page/README.md)。源码：

```js
import add from 'https://cdn.jsdelivr.net/npm/lodash-es@4.17.21/add.js';
export default async function main() {
  return {value:add(20,22),pageTitle:document.title};
}
```

示例仓库提供源码，**不假定你的目录已有远端锁和缓存**。需要首次准备时，先审阅 URL/第三方内容并明确授权锁定；以下是用户执行的独立动作，本轮不运行：

```sh
# 仓库根执行；输出使用项目外的全新临时目录，避免混入源码。
r101_lock_out="$(mktemp -d /tmp/opendesk-remote-lock.XXXXXX)/artifact"
npm run build:program -- examples/programs/remote-esm-page --lock-remote --out "$r101_lock_out"
```

检查项目内 `opendesk.remote-lock.json` 和 `.opendesk/remote-cache/*.mjs`；源码、锁、固定原始缓存字节一同版本化。临时产物只用于核对，可在确认路径后清理自己的临时目录。已有正确锁/缓存时跳过这一步，不在每次 run 或重试自动开启 --lock-remote。

之后的日常路径：

1. 授权并 attach remote-esm-page 目录，仅传 path；其 pageRules 默认 `https://example.com/*`。打开该页面及同窗口 Sidebar并授予权限。
2. status 取 bindingId，run 参数 `{"bindingId":"实际 bindingId","requestId":"tutorial-https-1"}`。
3. 用 previewId 查询，result.resultText 展示 value 42 和真实 pageTitle；dev.run 使用固定本地缓存，不让浏览器从 CDN 加载代码。
4. 本地改为 add(21,22)，保存后新 requestId 再运行，预期 43。仍查询原 previewId 看原记录，但 Page 回执不承诺持久结果；本例不是受管 UI，不支持受管 Stop。

可以在同一个项目中组合 npm 与 HTTPS 静态 import，仍分别需要 npm package/lock/安装目录和 remote lock/cache。首次远端锁只接受合同允许的公开 HTTPS URL/静态图，不接受 HTTP、凭据、私网、任意重定向或动态加载；详细限制复用[HTTPS 合同](../architecture/browser-framework/https-esm-imports-r1.zh-CN.md)。哈希只证明字节一致，不证明第三方代码可信。

正式冻结/导入时才另行 build:program 生成 program.js/草稿；构建状态 BUILT_UNVERIFIED 不证明浏览器运行、安装或 F3。

## 文件和体积限制

| 范围 | 当前上限 / 行为 |
| --- | --- |
| 项目源码/资产读取图 | 100 文件、384 KiB；各类型还有更小验证限制 |
| npm 锁 / HTTPS 锁 | 分别 2 MiB / 128 KiB |
| 实际消费依赖快照 | 1024 文件、2 MiB；npm 单文件最多 1 MiB |
| HTTPS 模块 | 最多 32 个，单个 128 KiB，总计 256 KiB |
| 最终执行 JS | Controller 65536 bytes，Page 100000 bytes；独立单文件读取本身最多 65536 bytes |
| Native 传输 | 完整 JSON envelope 60 KiB，包含转义、参数和元数据，所以可发送源码通常更小 |

读取图不扫描整个 node_modules。越界、symlink、敏感/隐藏输入、依赖 hardlink、根替换、读取期间修改都按实际规则拒绝；O_NOFOLLOW/目录检查不是恶意同 UID 文件系统沙箱。源码/source map/绝对路径不作为整树传给网页；本地 MCP 可保留可用的真实位置映射。

## 出错后具体做什么

| 错误 / 状态 | 动作 |
| --- | --- |
| E_DEV_AUTH / E_DEV_PATH / E_DEV_DETACHED | 核对 exact --allow-project、绝对路径和 attach；不要扩大为整个工作区 |
| E_DEV_CONFLICT | 收尾旧执行后 detach/attach；核对项目 ID/类型或当前连接/选择 |
| E_ESM_BUILD_REQUIRED | 手工编辑器粘贴了原始 ESM；改为授权目录运行，或有意构建导入固定产物 |
| E_DEV_DEPENDENCY / E_DEV_DYNAMIC_CODE | 独立文件 @require 外部代码或动态加载不支持；改为静态、有完整锁的目录项目 |
| E_PROJECT_NPM_LOCK | 检查 package、lock 根声明与安装版本；恢复一致锁后 npm ci --ignore-scripts，不忽略锁 |
| E_REMOTE_UNLOCKED | 检查远端锁是否缺失；只有明确批准新依赖后才独立 --lock-remote |
| E_REMOTE_CACHE / E_REMOTE_HASH / E_REMOTE_LOCK | 从原版本恢复对应锁和准确缓存字节；确认完整性后新运行，不暗中联网补齐 |
| E_PROJECT_SYNTAX / E_PROJECT_BUILD | diagnostics 读取真实错误与可得位置，修正入口/default export/普通 ESM；无映射不猜行号 |
| E_PROJECT_CHANGED | 停止并发编辑后重新明确运行；根替换需重新绑定 |
| E_DEV_LIMIT / E_LIMIT | 减少实际依赖、资产、参数或执行字节，不能取消容量检查 |
| E_NATIVE_NOT_READY / E_DEV_DISCONNECTED | 核对原 MCP、Native 安装版本、授权、同窗口 Host，恢复后只读 status/result |
| E_PERMISSION | 核对 Native 或网站各自权限，用户恢复授权后再只读查询，撤权不证明未执行 |
| E_DOCUMENT_STALE / E_DOCUMENT_REPLACED | 原目标文档改变；查询原运行结果，不把旧请求送到新网页 |
| E_PAGE_PREVIEW_STOP_UNSUPPORTED | 当前预览非受管；不能作为 Controller 强停，也不能用删 DOM 冒充清理 |
| E_UI_MODE_CONFLICT | 移除 UI SDK 前先确认原受管实例已 Stop |
| E_EFFECT_UNKNOWN / OUTCOME_UNKNOWN | 按下节只读对账，不自动重发 run、Stop 或清理 |

## 断连和未知结果

1. 保存原 requestId 和已有 runId/previewId、sourceHash、Host/目标文档。断线后的 NOT_FOUND/OUTCOME_UNKNOWN 不证明业务没有执行。
2. 原 MCP 会话仍在、run 入场回执丢失时，由 MCP 客户端调用：

   ```json
   {"name":"opendesk.dev.result","arguments":{"admissionRequestId":"原 dev.run 的 requestId"}}
   ```

   或 `diagnostics` 使用相同 admissionRequestId。这是原请求 ledger 的只读恢复，不重新读盘编译、不重发 run.start/page.preview。可选 bindingId 只在 diagnostics 核对原项目归属。
3. Native 重连/撤权恢复后只读 status，再查原执行。恢复查询自身 NOT_DISPATCHED 不说明先前运行未派发。较晚的只读查询不覆盖已经核验的原 ACK。
4. Stop/清理丢回执时，只读查原 runId/previewId；admissionRequestId 指 run，不指 Stop。不要换 requestId 再 Stop/清理。
5. MCP 重启可重新自动绑定允许目录，但失去旧 Session 请求与 Run/Preview 归属；重新 attach、新 Sidebar Host 不接管旧运行。持久 Controller 结果仍按原存储/授权入口读取，MCP 新会话不能仅凭旧 runId 自动取回。
6. 未知 Page 清理保持栅栏，关闭原标签页后再使用新文档；未知业务效果先核对实际网页/系统状态，再决定明确的新操作。

迟到 ACK 只对原 pending 身份生效，不能借旧回执承认新执行。不要删除正在使用的 socket、伪造 ACK 或绕过原授权。诊断/本轮证据范围见[原实施工作流](../framework/workstreams/r101-development-01a12159.md)；完整失败整轮、正式 F3/ZIP 状态不因分项恢复成功改变。
