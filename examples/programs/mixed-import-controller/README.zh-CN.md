# Controller 混合 Import：三条 ESM + 受控 Axios + 默认库

本项目是 Controller Worker 的 `opendesk.project.v1` 标准多文件 ESM 示例，不是通过 Page 世界冒充 Controller。零参数 `export default async function main()` 在同一次运行中调用真实 D3、真实 npm lodash-es、相对模块、按需 Axios、默认库及原有 ChromePage 代理。

## 五种依赖机制

| 来源 | 作者写法 | 实际行为 |
| --- | --- | --- |
| HTTPS ESM | `import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js'` | 上游 D3 `max([2,5,3])` |
| npm ESM | `import escape from 'lodash-es/escape.js'` | 实际 `lodash-es@4.17.21` `escape('A & B')` |
| 相对 ESM | `import {getScores} from './lib/scores.js'` | 本项目 `scores.js` 实际函数 |
| 按需预装 | `opendesk.libraries: ["axios"]` | 受控 Worker 内真实 upstream Axios `axios.getUri()` |
| 默认预装 | `_`、`dayjs`、`OpenDeskLibs` | 世界初始化提供，不再写 import |

`page.url()` / `page.title()` 使用原 Controller Worker 的受授权词法 `page` 代理。此处没有网页 `document` 或 `globalThis.page`。Axios 只能经现有 Broker 的受限 transport 执行网络请求；`getUri()` 只是 Axios 自身的 URL 拼接方法，本示例不发送额外请求，也不会继承别的程序站点授权。

## 安装、构建、运行

仓库根目录：

~~~sh
npm ci --ignore-scripts
(cd examples/programs/mixed-import-controller && npm ci --ignore-scripts)
node scripts/validate-program-project.mjs examples/programs/mixed-import-controller
npm run build:program -- examples/programs/mixed-import-controller
# 完整自动化测试还需对 mixed-import-page 执行 npm ci
OPENDESK_MIXED_IMPORT_BUILD=1 node --test tests/environment/mixed-import-projects.test.mjs
~~~

npm 原始精确依赖 `lodash-es@4.17.21` 和 SHA-512 锁条目继承仓库已有经 npm 生成的示例锁，已针对新包名调整；务必在本项目目录通过 `npm ci` 验证，而不是从根工程 `4.18.1` 解析。D3 HTTPS 锁和 502 字节缓存来自仓库内已验 SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。普通构建必须离线使用固定缓存，不允许运行时从 CDN 动态下载代码。

本地测试服务复用现有 `http://127.0.0.1:43111/demo-form.html`；如未运行，才用 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks` 启动。通过已有 Side Panel「开发」→「本地项目」连接本目录，使用受控 Chrome 执行，取得实际站点 `http://127.0.0.1:43111` 的 `page.automation` 权限，再点击 Run。

同一个真实 `main()` 预期：

~~~json
{
  "imports": {"https":5,"npm":"A &amp; B","relative":[2,5,3]},
  "packaged": "http://127.0.0.1:43111/demo-form.html?mode=demo",
  "defaults": {"words":2,"date":"2026-10-14"},
  "pageTitle": "<actual demo page title>"
}
~~~

这里的 `pageTitle` 必须由真实 `page.title()` 返回。验收须核对当前候选扩展的 `packageHash`、`runId/resultId`、持久结果、`sourceHash`、目标 `documentId`、Worker 回收、撤权及离线重启。Node VM 的模拟 page 仅说明编译字节里的业务返回，不能升级成真实 Chrome PASS。

同一 D3 SHA 在两个项目中拥有完全一致的内容，不等于跨运行世界共享一个 JS 实例、共享授权或已证明物理缓存去重。
