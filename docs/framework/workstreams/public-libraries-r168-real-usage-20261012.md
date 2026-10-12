# R16.8 实际运行场景、示例源码与真实回执追踪

日期：2026-10-12。此文档是操作/验收合同，不是 PASS 自证。唯一写入分支 main；不占用其他 Agent 的 Mac Chrome profile、dist 或固定端口。

## 四个基础用户入口（真实示例源和期望结果）

| 世界 | 可运行代码 | 用户在何处执行 | 当前自动化 | 本候选原生 |
|---|---|---|---|---|
| Controller 多文件 ESM | `examples/programs/controller-globals-zero-arg/src/main.js` | Side Panel → 开发 → 已授权本地项目 → 运行本地项目 | `runtime-globals-zero-arg.test.mjs` 的 Webpack 编译/Worker 词法；新原生驱动直接运行该 ESM 的编译产物 | 以当前 Mac CFT 候选回执为准 |
| Controller 单文件 | `examples/programs/single-file/controller-globals-zero-arg.js` | Side Panel → 开发 → Controller 草稿编辑器 → 运行草稿 | 同测试增加真实默认库零参数 L2；新原生驱动执行该**原文件字节** | 以当前 Mac CFT 候选回执为准 |
| Page USER_SCRIPT 单文件 | `examples/programs/single-file/page-globals-zero-arg.js` | Side Panel → 开发 → 网页 JavaScript 试运行 | Node Page 编译/执行，新增原生驱动真实试运行该原文件字节 | 以当前 Mac CFT 候选回执为准 |
| Page 多文件 ESM | `examples/programs/page-globals-zero-arg/src/main.js` | Side Panel → 开发 → 已授权 Page 项目 → 运行本地项目 | 真实 Webpack 编译/VM；新原生驱动直接运行编译源码 | 以当前 Mac CFT 候选回执为准 |

Controller 产出持久 runId/resultId；Page 产出 document-bound 预览回执；Page UI 还需 ShadowRoot、卸载及 Stop 的独立可见验收。默认 `_`、`dayjs` 无须 npm、参数或显式选择；Axios 等只有在允许的世界、声明后按需加载，网站 MAIN 不能继承 Controller 能力。

所有四个真实来源在 `tests/framework/page-content-native.mjs` 通过冻结源码 SHA 进入**受审扩展测试页**，由 `tests/framework/page-content-native-page.js` 使用真正 RunHost 或 chrome.userScripts.execute 调用。此操作不通过把用户代码注入网站 MAIN、伪造原生回执或手写测试替身实现。真实运行只使用测试候选，不能冒充生产 ZIP 安装验收。

## 另外三个容易混淆的扩展维护者场景

- Background / 可信 Side Panel / 扩展自定义页：`examples/libs/trusted-imports/{background,sidebar-host,extension-page}.mjs`，由自己的可信 WXT 入口静态 import；`tests/environment/runtime-libs-trusted-worlds.test.mjs` 是 Node L2，不是已安装真实扩展页面测试；不得承诺它们自动继承 `_`、`dayjs`、`page`。
- Side Panel 已安装工具 iframe：`examples/sidebar-tools/runtime-globals-demo/`，可打包 JSON，用户在「工具」明确安装，使用受限 `OpenDeskTool.request`。Node 有打包和 VM 桥测试；真实 Chrome 安装点击回执仍要单独取得。
- React + Axios + query-string：`examples/programs/page-ui-react-axios-query/`，已有 Webpack、多库声明/SHA 回归；可见 UI 的 Stop、AbortController 和 CORS 响应不能用 Node 编译测试冒充原生 PASS。

## 真实执行与每阶段的验收证据

1. `npm ci --ignore-scripts`、`npm run libs:check`、`npm run check`、运行上述源码对应的定向 Node 测试；每次输出 source SHA、PASS/FAIL、跳过数。
2. `npm run build && npm run build:dev && npm run libs:doctor -- --strict && npm run verify && npm run build:size && npm run pack && npm run pack:dev`，记录实际资源及 ZIP SHA。
3. 原生 macOS CFT：`OPENDESK_NATIVE_PAGE_LIBS=1 CHROME_FOR_TESTING_BIN=<真实绝对路径> node tests/framework/page-content-native.mjs`，必须见到四个带 `-user-example-` 的 case PASS 并核对案例源哈希、documentId、runId/resultId。此 runner 构建隔离测试扩展，不等于正式 dist/ZIP 安装。
4. 最后在用户 Mac Chrome 安装实际候选发行包，按上述四条 Side Panel 入口手动运行，同时核对权限、停止、重开、版本更新和持久结果。保留截图/原始结构化回执，关联 packageHash、ZIP SHA、运行时间和精确页面来源。

**状态约束**：源码存在=SOURCE_DONE；编译可用=BUILD_PASS；Node=TEST_PASS；CFT/实际用户 UI=需各自原生 PASS。没有最新同候选真实运行，不写 NATIVE_PASS/FINAL_ACCEPTED。
