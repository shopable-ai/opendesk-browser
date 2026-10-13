# Page UI TOC · React、HTTPS ESM 与 ECharts

本项目在原 React 网页目录中加入真实 **ECharts 5.6.0 SVG 柱状图**。目录仍读取当前正文的 H1–H6，支持章节跳转和动态更新；“统计”使用 ECharts 绘图，原 D3 `max` 继续参与计算。React、图表依赖和组件在同一个获准的 **Page USER_SCRIPT** 世界执行。

源码、固定原始缓存、锁、许可证和冻结 JSON 均在本目录。实际证据及尚未验收的项目见[本轮工作记录](../../../docs/framework/workstreams/react-url-import-echarts-20261012.md)；构建成功不等于 Chrome 已绘制或安装完成。

## 顶部的 URL 就是实际依赖

`src/main.js` 直接包含以下标准静态 import：

```js
import {createElement, useEffect, useMemo, useRef, useState} from 'react';
import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
import {init, use as useECharts} from 'https://cdn.jsdelivr.net/npm/echarts@5.6.0/core.js';
import {install as BarChart} from 'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/chart/bar/install.js';
import {install as GridComponent} from 'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/component/grid/install.js';
import {install as SVGRenderer} from 'https://cdn.jsdelivr.net/npm/echarts@5.6.0/lib/renderer/installSVGRenderer.js';

useECharts([BarChart, GridComponent, SVGRenderer]);
```

这些是真实固定版本 ESM 和实际 exports。传递依赖中的 `zrender/`、`tslib` 由本项目 `opendesk.remoteDependencies.imports` 固定映射到 `zrender@5.6.1`、`tslib@2.3.0`，不在运行时进行 npm 解析。

React 继续由 OpenDesk 固定 React 19.2.0 框架提供，第三方代码在准备期链接进原程序。作者无需修改扩展的 `src/libs`、manifest 或 Service Worker，无需手写 `@require`、添加 CDN 标签或使用网站的 `window.echarts`。

## 三个入口分别如何使用

### 1. 导入本目录的冻结 JSON

安装者使用 [page-ui-toc-react-direct.opendesk-draft.json](page-ui-toc-react-direct.opendesk-draft.json)，无需安装 Native、Node、npm 或访问 CDN。需要包含本轮格式适配的 OpenDesk；旧版本会拒绝未知草稿格式。

1. 打开获准的测试网页。项目规则覆盖 `http://127.0.0.1:43111/*`，排除 `/private/*`；`localhost` 是另一来源，不在此规则内。
2. 在 OpenDesk 原程序目录导入 JSON，进入“开发”查看。源码列表的 `src/main.js` 显示上述 URL；`program.js` 是实际执行内容，源码快照只读。
3. 确认 Chrome 已允许 OpenDesk 用户脚本，目标网站已授权。明确点击 **Run／运行**，网页才出现 `CONTENTS`；点击“统计”查看 ECharts，其他视图继续提供目录和章节跳转。
4. **保存**只准备并保存 Candidate，不运行网页、不安装。**Stop／停止**清理本次受管组件。
5. 如需安装，先 Stop，再按原流程 **Verify／验证**该 Candidate，审阅版本、来源、规则和执行哈希后点击 **Install／安装**。安装面向之后匹配规则的新文档，不把安装动作当作当前网页的隐式 Run。

标准测试页由仓库维护者按原约定启动：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

访问 `http://127.0.0.1:43111/demo-form.html`；同一服务也有 `reading-toc-article.html`。安装者只需访问已提供的测试站点，不必自己构建依赖。

冻结 JSON 含完整固定执行字节和作者源码/依赖锁快照。运行复验这些字节，不下载原始模块。SHA-256 证明字节身份，不能证明展示的作者源码一定生成了执行产物；请同时审阅实际执行代码。再次分发时，将本目录 `licenses/` 的许可证及 NOTICE 一并提供。

### 2. 本地项目：沿用原解析器和离线构建

完整缓存已提交。本示例目录不需要 `npm install`；维护者使用仓库已有构建工具：

```sh
npm run build:program -- examples/programs/page-ui-toc-react-direct
```

以输出的 `outputDirectory` 为准，导入其中的 `program.opendesk-draft.json`。`package.json` 是作者配置，不能当作安装包。输出状态仍为 `BUILT_UNVERIFIED`，需要浏览器原流程运行、验证和安装。

修改 URL、固定映射或版本时，复用原显式准备流程：

```sh
node scripts/lock-program-remote.mjs examples/programs/page-ui-toc-react-direct
# 审阅刚输出的真实来源与 token 后再确认：
node scripts/lock-program-remote.mjs examples/programs/page-ui-toc-react-direct --approve REVIEW_TOKEN
```

新传递来源也需要审阅；不能复制另一 URL 或旧版本的批准。缺锁、缓存缺失、篡改分别阻断为 `E_REMOTE_UNLOCKED`、`E_REMOTE_CACHE`、`E_REMOTE_HASH`，构建及 Run 不会联网修复。

原 `opendesk browser dev .` 仍适用于具备相应能力的 Native Host。本轮为较大固定产物增加能力协商和分块读取，**仓库内 Node 参考 Host 已适配，正式外部 Go Host 尚未实现该能力**；旧 Host 明确提示升级。本示例尚未在用户 Mac 的直接本地入口验收。主动 MCP `session.run` 大报文仍受原 60 KiB 限制。完整 ECharts 可走上述冻结 JSON 入口，无需 Native。

### 3. 只有浏览器组件源码编辑权限

在原“开发”单文件编辑器选择 React，可以直接编写：

```jsx
import {createElement} from 'react';
import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';

export default function App() {
  return createElement('div', null, 'D3 max = ' + max([2, 5, 3]));
}
```

点击 **检查依赖**只解析并列出来源；点击 **确认获取所列模块**才取得已列出的新代码。发现新的传递 URL 后继续逐批确认。完整图就绪后，查看 URL、实际字节数、SHA-256 和可提取的许可证信息，再点 **确认固定此版本**。来源未声明许可证时，由作者核对，界面不会虚构许可结论。

固定后，保存和 Run 只读批准锁及原始缓存，缓存损坏立即失败。多个已固定版本需要明确选择；源码变化、取消或 Stop 使迟到准备结果失效，不能重新挂载。

另一个已配置的目标是 `http://192.168.30.8:8000/`（局域网网页）。

在**另一个**终端连接本项目（不要继续选择原 `page-ui-react-direct`，它只是计数器）：

当前浏览器源码入口支持小型静态 ESM 图：最多 **32 模块、单模块 128 KiB、整图 256 KiB、链接结果 100 KB**。不承诺任意 URL、UMD、动态 import 或本地示例的完整 ECharts 图都能在单文件入口编译。大型 ECharts 使用本项目固定 JSON；本地构建成功不能替代浏览器源码入口验收。

浏览器作者已经确认的准备记录和原始缓存按现有持久缓存规则保留。Stop 和卸载自包含 Page 程序不会删除这些可复用作者缓存；当前没有独立的“遗忘固定版本”或原始缓存回收入口。

## 实际大小与格式选择

包规则覆盖 `http://127.0.0.1:43111/*` 与 `http://192.168.30.8:8000/*`，两个网站的 `/private/*` 均排除。`localhost` 和其他网站不在允许范围内；另一个端口或域名需要在项目规则与网站授权层同时调整，不能只改 URL。保存规则只自动准备，仍须明确点击「运行本地项目」。网站中的 `h1` 及其 `id` 不会被这个 Demo 修改。来源 URL 是**库的来源**，不是自动授予该来源站点的网页执行权限。普通安装者使用冻结 JSON 的路径与作者本地开发不同，不能把这里的 Native 前提套给安装者。

下列数值来自真实模块和生产构建，完整输入身份见工作记录：

| 层级 | 字节 / 数量 |
| --- | ---: |
| ECharts、ZRender、tslib 传递图 | 234 模块 / 1,744,184 B |
| 加上原 D3 后的完整远端图 | 235 模块 / 1,744,686 B |
| 最大原始模块 | 84,388 B |
| 自包含 Page `sourceUtf8` | 482,082 B |
| 含源码与锁的格式化 JSON | 558,789 B |
| 加上固定 React 和内置资源的完整单一 JS | 718,450 B |
| 完整 `chrome.userScripts.execute` JSON 测量包络 | 732,232 B |

实际图超过原小项目预算，因此本项目使用 Page 专用 `page-library-v1`、`opendesk.remote-lock.v2` 和自包含 `opendesk.page-linked-resource.v1`。资源仍在原 `sourceUtf8` 中，没有旁路网络加载或第二个执行器。

该版本限定整图 256 模块/2 MiB、单模块仍 128 KiB，linked JS 512 KiB、描述 4 KiB、v2 草稿 JSON 768 KiB。普通 Page、Controller、Native Messaging 的全局上限不变。Native reverse 路径将同一固定源分为 24 KiB 原始块，完整帧仍不得超过 61,440 B。

最终示例 `sourceHash`：

```text
8d3eedccdf62d90ddafcad3752e184ccd975479b51f649cb0b12595028ab2146
```

## 图表生命周期与错误

`src/heading-chart.js` 在容器挂载、连通且宽高有效后调用 `init`。标题数据变化调用同一实例的 `setOption`；容器尺寸变化由 `ResizeObserver` 调用 `resize`。切换出统计、折叠或 effect 清理时，断开 observer、取消待处理 RAF 并 `dispose`。初始化或更新失败显示明确错误，不用手画柱状条或备用库替换 ECharts。

原目录 observer、scroll/resize/hashchange 监听仍在 React 卸载时清理。未知执行效果查询原 preview 回执，不自动重放 Run。导入新冻结版本前须停止原受管预览；各版本保持独立 sourceHash、Candidate 与安装身份。

## 文件与针对性验证

| 文件 | 职责 |
| --- | --- |
| `src/main.js` | 可见 HTTPS import、React 目录、D3 统计、ECharts UI |
| `src/heading-chart.js` | init / setOption / resize / dispose |
| `src/toc-model.js`、`src/heading-stats.js` | 正文扫描、章节定位、统计模型 |
| `opendesk.remote-lock.json`、`.opendesk/remote-cache/` | 完整固定图和未修改的原始字节 |
| `licenses/` | ECharts Apache-2.0 及 NOTICE、ZRender、tslib、D3 许可及来源哈希 |
| `page-ui-toc-react-direct.opendesk-draft.json` | 可导入的完整固定草稿 |

```sh
node --test examples/programs/page-ui-toc-react-direct/src/heading-chart.test.mjs
node --test examples/programs/page-ui-toc-react-direct/src/heading-stats.test.mjs
node --test tests/environment/page-ui-toc-react-direct.test.mjs
```

五项 builder 回归验证真实缓存的离线构建、确定性 JSON，以及缺锁、丢失、篡改和 URL 变化拒绝。生命周期模型不能代替 Chrome SVG、尺寸变化或 Stop 验收。

专用 CI 为 `React HTTPS ECharts JSON Run Stop and Install`，驱动 `tests/framework/page-url-import-linux-cft.mjs` 使用真实 Chrome、原 Sidebar、可信输入和原执行回执。具体 PASS、失败和未测试项以[工作记录](../../../docs/framework/workstreams/react-url-import-echarts-20261012.md)及原始证据为准。本地 Linux 拒绝 AF_UNIX，不能据此伪造 Chrome 或用户 Mac 的结果。

[React Direct](../page-ui-react-direct/README.md) · [Page 框架](../../../docs/api/page-ui-frameworks.zh-CN.md) · [原 HTTPS ESM 合同](../../../docs/architecture/browser-framework/https-esm-imports-r1.zh-CN.md) · [项目与 JSON 执行边界](../../../docs/architecture/browser-framework/project-dependencies-json-and-execution.zh-CN.md)
