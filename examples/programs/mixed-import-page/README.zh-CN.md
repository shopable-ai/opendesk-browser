# Page 混合 Import：三条 ESM + 按需库 + 默认库

本项目是 Page USER_SCRIPT 中真实的 `opendesk.project.v1` 多文件 ESM 示例。核心 [src/main.js](src/main.js) 只有三个标准 JS import 和一个零参数 `main()`，没有新的 UI、DOM 代码或调试按钮。

## 五种依赖机制

| 依赖来源 | 作者代码 | 真实用途 |
| --- | --- | --- |
| HTTPS ESM | `import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js'` | 调用 D3 上游 `max([2,5,3])` |
| npm ESM | `import escape from 'lodash-es/escape.js'` | 调用锁定的 `lodash-es@4.17.21` 的 `escape()` |
| 相对 ESM | `import {getScores} from './lib/scores.js'` | 调用当前项目内的 `getScores()` |
| 按需固定预装库 | `package.json#opendesk.libraries: ["query-string"]` | 直接用 `queryString.parse()`，不是虚假的第四条 import |
| 默认库 | `_`、`dayjs`、`OpenDeskLibs` | 世界初始化时默认提供，无需导入或再次安装 |

`queryString` 仅在已声明的 USER_SCRIPT 世界内加载，网站 MAIN、Controller、Background 和工具 iframe 不会自动拥有它。`document.title` 仅用于读取当前用户网页标题。

## 文件与真实身份

- `package-lock.json` 的 `lodash-es@4.17.21` HTTPS tarball / SHA-512 完整性条目沿用仓库现有 npm 生成的 `page-npm-lodash` 锁条目，根包名改为本项目；应再通过项目自己的 `npm ci` 验证。不要以根工程 `lodash-es@4.18.1` 冒充 4.17.21。
- `opendesk.remote-lock.json` 从原有可信项目中提取精确 D3 URL 对应的固定锁项，并保存原始缓存 `.opendesk/remote-cache/691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d.mjs`。
- 固定 D3 源码为原始 502 字节，SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`，不是自行编造的哈希；独立 Node 校验与真实构建还需要运行。
- 源码变更后必须重新冻结下一次主动运行的 Revision，不能自动替换先前固定运行字节。构建及浏览器不应该在运行期下载 JavaScript。

## 本地验证

从仓库根目录执行：

~~~sh
npm ci --ignore-scripts
(cd examples/programs/mixed-import-page && npm ci --ignore-scripts)
node scripts/validate-program-project.mjs examples/programs/mixed-import-page
node --test tests/environment/mixed-import-projects.test.mjs
OPENDESK_MIXED_IMPORT_BUILD=1 node --test tests/environment/mixed-import-projects.test.mjs
npm run build:program -- examples/programs/mixed-import-page
~~~

若要完整执行测试文件的双项目构建用例，也先对 `examples/programs/mixed-import-controller` 执行 `npm ci --ignore-scripts`。不设环境变量时，定向测试只检查离线源/锁合同与可复制的验证层负向，真实构建部分会明确 `SKIP`，绝不能将 SKIP 算成成功。

在 Chrome 复用仓库已有 localhost 测试站点服务（未启动时才执行）：

~~~sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
~~~

打开 `http://127.0.0.1:43111/demo-form.html`；在 Side Panel「开发」通过既有项目连接入口绑定本目录，检查 Chrome 的 USER_SCRIPT 开关、实际网站许可，并主动 Run。权限被拒绝时必须安全失败。生产代码只在真实 Page USER_SCRIPT 运行；Node VM 不构成浏览器验收。

同一次 `main()` 的预期结果：`imports.https = 5`，`imports.npm = "A &amp; B"`，`imports.relative = [2,5,3]`，`packaged = "demo"`，`defaults.words = 2`，`defaults.date = "2026-10-14"`，`pageTitle` 等于真实网页标题。应记录实际 `receiptNonce/documentId/sourceHash` 与当前扩展 `packageHash`。没有这些原始回执就保持 `CHROME_NOT_TESTED`。
