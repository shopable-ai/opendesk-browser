# Background / 可信 Side Panel / 扩展自定义页：静态 ESM 导入示例

**这是三种可信扩展入口的可运行 JavaScript 函数，不是待安装的 Chrome 扩展，也不是三个自动注册的 WXT entry。** 只用仓库根目录已锁定的 npm 包，源文件供扩展维护者参考；不要在浏览器运行时远程导入 CDN，或直接把 examples 源码并入特权 SW（正式构建的来源审查不允许 examples 作为特权入口）。

| 示例 | 应放到哪里 | 运行时访问方式 |
| --- | --- | --- |
| [background.mjs](background.mjs) | 现有受信 Background/SW 入口内部，需要此功能时才静态 import | `import dayjs from 'dayjs'`、`import {words} from 'lodash-es'`；没有 Controller `page` |
| [sidebar-host.mjs](sidebar-host.mjs) | 现有受信 Side Panel shell 的源码模块 | `import queryString from 'query-string'`、`import dayjs from 'dayjs'`；不传到 sandbox 工具 |
| [extension-page.mjs](extension-page.mjs) | 自有受信扩展 HTML 页的独立构建入口 | `import {uniq,words} from 'lodash-es'`；调用方传 DOM 节点、使用 `textContent` |

实际接入生产时，请在仓库现有的、已批准的 `src/**` WXT 入口按需添加这些静态 import，把使用的模块编入**该入口自己的构建图**，而不是新建第二套公共库注册表、在所有世界安装 `globalThis.dayjs`，或者把全部预装库打入 Background。修改受信扩展源码需要重新构建扩展；普通用户 Controller/Page 项目无需这样做。

Node 定向验证（仓库根目录）：

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test tests/environment/runtime-libs-trusted-worlds.test.mjs
```

这三个函数实际从锁定的 npm 包导入并执行，测试不创建 Chrome 页面；属于 **L2** 依赖用法验证，不能代替对应 WXT 入口产物/SW 体积/真实 Chrome 证据。

普通用户请优先使用[零参数 Controller Demo](../../programs/controller-globals-zero-arg/README.md)或者[目标网页 Page Demo](../../programs/page-globals-zero-arg/README.md)，那两个执行世界已有默认的 `_` 和 `dayjs`，**无需手工 import**。Side Panel「工具」里的独立小工具请运行[可导入工具 Demo](../../sidebar-tools/runtime-globals-demo/README.md)，它只用 `OpenDeskTool` 授权桥。

完整世界矩阵与 ABI：[`docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`](../../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。
