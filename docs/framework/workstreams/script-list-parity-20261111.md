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
