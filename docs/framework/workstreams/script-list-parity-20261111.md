# 我的 / Web Flow 脚本列表一致性 R1 · 2026-11-11

- Owner：当前「脚本列表体验」任务；仅写本记录和明确的 9 个源码/测试文件。唯一开发分支：main。
- 目标：已安装脚本的标题/网站/参数数量/运行方式统一信息层级；参数按真实 Schema 展示必填、类型、默认及固定值；桌面 Hover/Focus 仅显示快捷操作，触屏经常显菜单进入。
- 真实定位：「我的」采用 React MyTaskRows / MyTaskWorkspace / MyTaskParams，Schema 和执行由 TaskWorkbench 持有；Web Flow 在 opaque-origin iframe 内使用自己的 React taskCard、公开 SDK tasks.read/open/start 和本地纯展示模型。不能跨隔离边界直接导入宿主私有 React 组件。
- 复用与隔离：Host 保留 od-collection、od-input-group、TaskWorkbench；Web Flow 保留原 wf-task-list、SDK 和原持久 Pending。跨界复用信息层级、文案、视觉交互，不重建 Runner、Task/Permission Authority 或 DOM 桥接。
- 两个固定搜索任务：query 必填 1–120 字符；limit 固定 3；showExecutionTab 可选布尔值、默认 true。只有用户主动关闭时手动步骤传 showExecutionTab:false；默认仍传 {query,limit:3}；不改安装包、Schema、版本、Hash 或自动批准。
- 安全不变量：Hover/展开/配置不调用 tasks.start；prepare 保留原 storage.set + readback 才产生 ready；用户明确二次确认才走原唯一 tasks.start；保存参数使用冻结的 item.params；同一 clientRequestId；保留 UNKNOWN、retirement 和 A→B→A 机制。
- Web Flow 参数草稿按 taskId 仅保留本次应用挂载，未确认保存前保持 dirty；刷新和关闭后丢弃，不增设持久化授权与参数库。
- 并行写入：按固定 main HEAD 精确读取，并通过原子 Git tree commit 与预期 HEAD 引用移动提交，不覆盖其他任务文件。
- 定向验证建议：node --test tests/environment/react-my-page-core.test.mjs projects/webflow/tests/webflow-ui.test.mjs projects/webflow/tests/webflow-recovery-ui.test.mjs；npm run check；必要构建 npm run build。原 Web Flow 工具包还需经可信安装审阅。
- 本轮本地 Chrome/正式安装 NOT_TESTED。需 Codex 实测 360px、矮窗口、Hover/Focus/触屏、IME、Escape、参数错误/固定值、权限撤销、UNKNOWN 和单次确认唯一原请求，不可把脚本测试桩当真 Chrome 验收。

## OD-SCRIPT-LIST-UNIFY-ACCEPTANCE-R1 · 安装交付续验

检索：OD-AI-WORKFLOW-BRIDGE。起始 main 为 `52397e750b4b374b5602be13e0c08f8afdff7cb9`，包含 `3ee29e6`、`a14e2d7`、`7bc0886`。既有列表 UI 未重写。

- 定向 Node 四文件最终 **112/112 PASS**；TaskWorkbench/启动/委托包/委托恢复五文件 **158/158 PASS**。新增真实 React 委托事件回归证明关闭执行标签页保存为严格 `false`，保存/取消不启动，冻结参数含 `limit:3`，重复确认仅一次，重开仅查原 ID。测试替代 SDK 传输，不证明 Chrome 安装或原生手势。
- 旧 CI `42888281951` 为 FAILURE，源码 Node 67/67 通过，失败在驱动直接点击 Hover 隐藏收藏按钮，尚未晋升。驱动现按真实鼠标移入和常显更多菜单操作，适配当前「应用偏好」名称，保留可见性断言。
- 源码 Chromium **PASS**：Chrome 155.0.8059.39，320/360/400px，21 张截图；搜索、收藏、筛选、排序、键盘菜单/Escape 焦点、三项参数及默认折叠技术详情。回执 `artifacts/script-list-unify-acceptance-r1/source-chromium/receipt.json` 明确标 `SOURCE_COMPONENT_CHROMIUM_MOCK_SDK`，模拟派发零次。触屏、IME、矮窗口、PC 和真实安装新版仍 NOT_TESTED。
- 原打包器候选 → 同源逐字节晋升 → `--check-project` **PASS**。唯一正式文件 `projects/webflow/webflow.opendesk-tool.json` 为 **0.3.27 / 103849 B / 文件 SHA-256 `4008ed394a171ba91649e97e916d974e0352e1fe8c2c2e89580fa2cc3e02abca`**。ID、能力、站点范围及委托身份与 0.3.26 一致；百度 1.1.5、Google 1.0.3 未升级或重新授权。
- `my-sections.tsx` 原工作区已有一字符 JSX 闭合修复，属于本次 UI 的实际编译阻塞，保留并随本次交付提交。
- 原持续开发构建遭遇可信 settings 内含 React Workspace 后超普通 512 KiB 工程预算（530465 B）。仅在唯一预算函数为精确 `native-agent/settings.js` 设置 576 KiB，两模式边界/+1 B 和近似路径测试 **6/6 PASS**，CSP、来源、IIFE 与其他入口上限不变；压缩试探已撤回。原 `npm run dev` 恢复 RUNNING，输出仍 `dist/development`，首次发布 revision `7b378e273691c4c6700ef6721f1d70da78c17a50e7ce6feecd4598670befee34`。该构建含并行 owner 未提交的 `bundle-provenance.mjs` 来源 pin 更新，不能冒称干净 HEAD 构建或所有已打开文档均应用此 revision。
- 实际浏览器只读观察：既有扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，Web Flow 标题读回 **0.3.26**。通过原「扩展 → 导入扩展」选择正式 JSON 时，系统选择器「打开」持续 disabled，未进入包审阅、未安装；当前工具无法稳定定向绑定侧栏，已停止原生输入并释放原 UI 锁。实际安装包 Hash、新版宿主「我的」和 WebFlow 最终验收 **NOT_TESTED**。
- 既有手动请求 `webflow:fcd2a5b4-c77e-430e-ae7b-1cd2b5e68caa` 显示 UNKNOWN、资源未释放；原只查询/停止恢复路径仍可见。本轮未重放、未停止其他 owner 的请求、未创建新执行。因此新版可信手动运行、真实持久结果/释放及关闭重开均 **NOT_TESTED**。

收尾条件仍未满足：正式包可供原安装器审阅，但不能宣称已安装成功、六专家达标或正式验收完成。下一条用户操作是使用可稳定定向的原侧栏安装入口更新这一个正式包并读回身份，再续验同一次安装后的 UI 和合法全新手动请求。
