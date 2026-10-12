# Page UI TOC · React Direct 网页目录 Demo

这个项目是一个 **Page USER_SCRIPT React 组件示例**，用于学习「本地文件保存 → 自动准备 → 明确运行 → 悬浮 UI → 停止后清理」。它不是 `examples/sidebar-tools/reading-toc` 的替代实现，也不是 Side Panel 工具 iframe。

## 默认入口直接使用 HTTPS URL import

打开 `src/main.js`，顶部就是实际生效的代码，不用再切换本地包装文件：

```js
import {createElement, useEffect, useMemo, useRef, useState} from 'react';
import {chooseActiveTocItem, createTocScanner, sameToc, selectTocItems} from './toc-model.js';
import {summarizeHeadingLevels} from './heading-stats.js';
import max from 'https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js';
```

组件内部实际使用外部模块计算标题统计条的比例上限：

```js
const stats = useMemo(() => summarizeHeadingLevels(items, max), [items]);
```

这是标准**静态 ESM import**，不是 `import(url)`、`@require` 或向网页插入 CDN `<script>`。来源为 D3 官方上游固定版本的 HTTPS 源码地址；HTTP 下载站不必是某一家 CDN。已有 `remote-esm-page` 中的 jsDelivr URL 走同一套解析机制。

React 仍由 OpenDesk 固定框架资源提供；外部 max 模块由原项目解析器从已核验缓存链接到用户程序，二者在同一 USER_SCRIPT 环境供组件使用，不写入网站 MAIN 全局、不修改扩展源码。`package.json` 的项目类型、框架、权限规则和入口均保持不变，不需要重复添加 npm 依赖字段。

## 文件与职责

- `package.json`：独立项目 ID `sample.page-ui-toc-react-direct`、React 固定运行时、组件入口、限定测试网站。
- `src/main.js`：官方 React Hooks、可见 HTTPS import；悬浮目录、概览/当前/全部/统计四种视图、定位与动态更新。
- `src/toc-model.js`：读取当前网页主要正文 H1–H6，保留元素身份，最多扫描 160 个标题，不修改网站 ID。
- `src/heading-stats.js`：纯统计模型，App 传入 URL 导入的 max；默认数学实现仅服务模型独立测试，不是缺锁后的自动回退。
- `src/heading-stats-cdn.js`：保留给旧调用方的适配器，已对齐同一个 HTTPS URL；不再是主示例的导入入口。
- `opendesk.remote-lock.json` 与 `.opendesk/remote-cache/`：原 `opendesk.remote-lock.v1` 格式的固定来源、字节大小、SHA-256 与原始模块。
- `licenses/d3-array-ISC.txt`：随原始模块保留的 ISC 许可证；再分发含该代码的导出包时也需附带此许可证。

## 固定来源与证据边界

本项目已随源码提交所需锁和缓存，普通运行不需再执行首次锁定命令，也不需要在本示例目录运行 npm install。缓存为官方 `d3/d3-array@v3.2.4/src/max.js` 的 **502 个 UTF-8 字节**：

```text
Git blob: ce287368eb4402d359f18ec1c6c81dde0c774cc5
SHA-256: 691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d
```

本次通过 GitHub 连接器读取官方上游源码，并核对 Git blob 和 SHA-256 后纳入项目。**没有伪造 jsDelivr 下载回执，也没有将上游源码标记为已完成 CDN HTTP 实测。** 本示例的 URL 因而明确指向同一官方上游；此前 jsDelivr 包装示例不再决定默认入口。缓存和锁没有新增权限或新的生产下载器。

原有解析器仍必须拒绝缺锁、缓存缺失或篡改，分别报告 `E_REMOTE_UNLOCKED`、`E_REMOTE_CACHE`、`E_REMOTE_HASH`，不偷偷联网修复或退回本地数学函数。修改 URL、增加其他模块或升级版本时，应重新审阅并通过原有流程准备新的依赖，而不是复制另一 URL 的批准记录：

```sh
# 以下是维护者在仓库根目录的显式依赖变更流程，不是每次 Run 的前置步骤。
node scripts/lock-program-remote.mjs examples/programs/page-ui-toc-react-direct
# 审阅输出后，将 REVIEW_TOKEN 换成刚返回的真实 token。
node scripts/lock-program-remote.mjs examples/programs/page-ui-toc-react-direct --approve REVIEW_TOKEN
```

这是**已有本地项目 URL 导入机制的实际消费示例**，不表示浏览器单文件编辑器已经支持任意第三方 URL，也不表示 ECharts 已完成。当前统计图仍由 React 渲染，D3 只参与数值计算；ECharts 的真实 ESM 图、体积、渲染与清理应独立验证，不能用本例替代。

## 使用：选择本项目，保存后明确运行

本地项目开发的前提仍是已安装/配对相容 Native Host 和扩展、Chrome 已允许用户脚本、测试网站已授权。原目录开发链保持不变。

从仓库根目录启动标准测试页服务：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

在 Chrome 打开 `http://127.0.0.1:43111/demo-form.html`。需要检查长文章目录、重复标题和重复 ID 时，同一服务还提供 `reading-toc-article.html`。

在另一个终端连接项目：

```sh
cd "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/page-ui-toc-react-direct"
opendesk browser dev .
```

在 Side Panel →「开发」→「直接编辑本地项目」选择 `page-ui-toc-react-direct · 页面脚本`，不要误选仅展示计数器的 `page-ui-react-direct`。点击「运行本地项目」，预期网页出现 `CONTENTS`；点击「统计」检查 H1–H6 数量及比例，其他视图、章节跳转和自动目录扫描保持原行为。

保存源码只触发准备，不自动操作网页。再次明确运行才使用新代码；Stop 仍由原 React 受管卸载清理 DOM、MutationObserver、scroll/resize/hashchange 监听。URL 依赖导入没有增加额外事件或图表实例。

包规则只覆盖 `http://127.0.0.1:43111/*`，不覆盖 `localhost` 或远程网站。来源 URL 是**库的来源**，不是自动授予该来源站点的网页执行权限。普通安装者使用冻结 JSON 的路径与作者本地开发不同，不能把这里的 Native 前提套给安装者。

## 测试与 JSON 导出

```sh
node --test examples/programs/page-ui-toc-react-direct/src/heading-stats.test.mjs
node --test examples/programs/page-ui-toc-react-direct/src/toc-model.test.mjs
node --test tests/environment/page-ui-toc-react-direct.test.mjs
```

第一条包含 7 项模型/源码/固定字节测试，使用真实上游模块，而非以 Mock 函数冒充它。第三条在完整仓库工具链上验证原 builder 的固定缓存离线构建、确定性 JSON 导出及缺锁/篡改/丢失/URL 变化拒绝；HTTP fixture 明确不代表实际 CDN 请求。

需要导出固定草稿时才执行：

```sh
npm run build:program -- examples/programs/page-ui-toc-react-direct
```

输出位置以构建器 `outputDirectory` 为准，状态仍为 `BUILT_UNVERIFIED`，不是安装、真实 Chrome 或最终验收通过。请随导出的含 D3 代码的产物一起分发 `licenses/d3-array-ISC.txt`。

本轮已通过 7 项模型/源码检查和 JS 语法检查；完整 builder 回归、Native 传输、真实 Chrome Run/Stop 和 ECharts 尚未取得本轮 PASS。详见 [工作记录](../../../docs/framework/workstreams/react-url-import-20261012.md)。

## 与官方阅读目录的区别

| 项目 | 本 Demo | `reading-toc` 正式工具 |
| --- | --- | --- |
| 所在目录 | `examples/programs/page-ui-toc-react-direct` | `examples/sidebar-tools/reading-toc` |
| UI 运行位置 | 网页中的受管 React 悬浮组件 | Side Panel + 可信 Content Script 目录 |
| 权限/接口 | Page USER_SCRIPT 授权，读取同一网页 DOM | `page.toc` + 受控目录能力 |
| 复杂场景 | 单一主要正文、简单概览、URL 模块教学 | AI 多回答来源、站点适配、拖动及位置记忆 |
| 退出 | 开发 Tab Stop，React 卸载并断开监听 | 网站开关/卸载，正式工具生命周期 |

[React Direct](../page-ui-react-direct/README.md) · [Page 框架](../../../docs/api/page-ui-frameworks.zh-CN.md) · [原 HTTPS ESM 合同](../../../docs/architecture/browser-framework/https-esm-imports-r1.zh-CN.md) · [项目与 JSON 执行边界](../../../docs/architecture/browser-framework/project-dependencies-json-and-execution.zh-CN.md)
