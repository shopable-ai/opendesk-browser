# scrapyjs：功能与交互提炼

当前阶段：真实扩展持续开发与豆瓣/CSDN 线上核心操作。复用 Browser 开发服务，应用 Vite 编译与 stage watcher 发布源码锁定快照；本地 Mock 网页仅作辅助。正式包晋升、production 与完整验收延期。业务源码只在本工具目录；旧 `scrapyJsChrome`、`scrapyJs` 只读。旧入口是证据，不是逐项迁移清单。

最短操作链：选择已保存配置 → 确认当前网页 → 开始采集 → 查看记录 → 下载 CSV / 完整 JSON。修改规则时：打开采集规则 → 选择字段或新增 → 应用编辑 → 保存配置；未应用和无效 JSON 阻止运行/保存，切换配置先处理草稿。

| 实际用户操作 | 来源与意义 | 取舍 | 当前业务与本轮处理 |
| --- | --- | --- | --- |
| 选择当前网页、核对 URL | 旧 popup 的网页目标与定位入口 | 保留目标核对；重做紧凑摘要 | `app-model.js.refreshTarget/start` 已核对同源与运行前网页身份；UI 继续调用原链 |
| 保存、选择、复制、重命名、恢复采集配置 | 旧命名任务下拉 | 保留并明确名称 | 当前 `capture-config` 内的命名规则是同一固定 Task 的数据输入，不是任务市场/配置任务库；保留 CAS、容量和草稿保护 |
| 配置列表和字段，读取文本/属性 | 旧 Config；Headers 实际是显示列名 | 重做可理解的字段编辑 | CSS 文本/属性提供表单；复杂描述符、嵌套和 XPath 在完整 JSON 原样编辑，不强行转换 |
| 翻页、去重、列表关联详情 | 旧 Config/引擎选项；多页列表有直接价值 | 保留现有受控能力，放次级区域 | 固定 Task 已有 CSS 下一页、最多 10 页、100 条详情、共同身份核对；不增加滚动分页、断点、重试或导航权限 |
| 开始、停止、查看运行状态 | 旧 popup 开始工具栏 | 保留并区分状态 | 原 Task 请求身份、Stop 受理、原实例退休、未知结果不重放；UI 不把宿主终结当作退休 |
| 看数据、导出 | 旧 Data / Export / Headers | 保留结果表格和 CSV/JSON | 表格显示前 50 条、所有列可横滚；完整结果与下载保留原字段和顺序；下载请求与文件落盘分开陈述 |
| 在网页点选/高亮、生成选择器 | 旧定位及元素选择 | 有价值，后续独立评估 | 当前公开 App 合同未包含点选，不能用 iframe 预览伪装；本轮手输选择器可完成核心链，未证明 SDK 缺口 |
| 通用动作录制/回放 | 旧录制入口 | 本轮排除 | 通用浏览操作不是当前声明式采集配置；分页/详情所需动作已有固定 Task 承担，不迁入录制产品 |
| AI 配置助手、克隆 UI 区域、配置任务库 | 旧 AI / Clone / Task Library | 明确排除 | 不新增入口，不删除只读来源历史；命名配置不受此排除影响 |

## 职责和状态

- React：视图、字段/分页/详情草稿、JSON 错误、命名及放弃确认、焦点恢复、表格；只拥有沙箱 `#tool-app`。
- 原 App Model：配置校验、命名记录与 ETag CAS、当前目标、固定 Task 运行、停止、结果、退休、未知回执。原 SDK adapter 是唯一请求边界。
- Controller Task：保持 `scrapyjs.capture` 0.3.0、原 contentHash/manifestHash 与三个精确 origin；不因换 UI 再冻结身份或扩权。
- 运行：就绪 → 准备 → 运行/停止中 → 退休确认后完成/部分/已停止；结果未知只读刷新原请求，不自动重复开始。
- 编辑：已保存 → 未保存/未应用/无效 → 应用 → 保存；切页签保留草稿，切配置/新建/删除需先确认放弃，取消恢复原选择与焦点。保存失败保留草稿，存储冲突先读取再明确替换。

## React 选择

本工具已有多视图、关联表单、异步状态和多种草稿，采用 React 可让状态与界面保持一致。复用仓库已安装 Vite、公开 `opendesk.react-ui.v1`，外置 React 19.2.0 与 Shared UI；仅使用实际公开的 Button/IconButton 等能力。Select、输入框和 details 继续原生语义；不假定可信工作台的其他组件已对沙箱公开。无需新依赖、Tailwind、第二组件包或宿主修改，不迁移其他 HTML/Vue 工具。

当前 `npm run dev --prefix examples/sidebar-tools/scrapyjs` 只编译监听应用 IIFE/CSS，与 `node scripts/watch-sidebar-tool.mjs examples/sidebar-tools/scrapyjs` 配合，在真实 Chrome「开发 → 本地项目 → 在侧栏调试」消费快照。更新替换沙箱实例，不冒称 React Fast Refresh。本地调试仅支持隔离存储和当前页读取；委托 Task 与下载须经原安装审阅链使用安装态开发候选，不能继承同 ID 安装权限或放宽 Host。

辅助网页改为显式 `npm run dev:mock --prefix examples/sidebar-tools/scrapyjs`，访问 `http://127.0.0.1:43127/preview/dev.html`。它使用内存 Mock；此前网页 JSX/CSS 热更新、模拟采集、模拟保存和模拟下载不构成扩展更新或真实网站成功证据。

后续交付路径仍为 JSX → 本地 Vite 单 IIFE/静态 CSS → 原打包器。`dist/build-ready.json` 绑定源码与产物；离线 HTML 生成器复用同一 UI 和固定运行时，当前未生成本轮最新源码对应的离线文件，不沿用旧编译候选。

## 证据边界

上一轮 App 1.4.0 原生流程证据见 `artifacts/scrapyjs/legacy-ui-20261029/final-run-2/report.json`，仅适用于其候选；后续驱动 `driver-smoke-3` 的字段选择 FAIL 保留，尚不能归为产品故障。正式包本轮开始仍为 1.3.1；新 React 源码、编译候选、正式包、安装和运行分别核验，不能沿用旧 PASS。

本轮只验证变更影响的交互与保护。production 正式验收、独立 95+ 评分、全量迁移、缩放/物理宽度、压力测试不作为当前前置，未执行为 NOT_TESTED。

本轮 UI 证据见 `evidence/react-ui-dev-20261029.json`：配置管理、字段/分页编辑、无效 JSON 和草稿保护、模拟运行/停止/下载均已操作通过，无 React 运行错误；真实网页采集、最新包身份与原生安装未验证。旧来源定位：`scrapyJsChrome/www/popup_crawl.js:573` 为 Headers 展示列，`:2318` 为选择入口；`www/popup_crawl.html:469` 为定位、`:487` 为结果区域，不能据此宣称新 App 已包含网页点选。
