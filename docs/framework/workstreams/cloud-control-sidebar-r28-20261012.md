# Cloud Control · Side Panel 第六页与横向导航（R2.8）

日期：2026-10-12。目标 main。范围仅侧栏信息架构和 UI；不更改真实 Authority／RunHost／Worker／ChromePage／IDB 运行协议。

## 产品决定
- 用户希望在网页正在执行任务时继续观察和操作云控，正式新增「云控」为第六个 Side Panel 一级页签，开发版「调试」排第七，生产版仍默认隐藏调试。
- 「我的」仅保留简短状态、可点击的云控图标入口；原有唯一 `cloud-hosting` 控件整体迁移到云控 Tab，没有复制配对、授权或执行实例。
- 与目标网页并排显示配对、连接、Host、执行槽、批准任务、云请求状态；请求列表只显示最多 5 条经过枚举白名单筛选的状态，不输出 ID、URL、密钥、结果或服务器管理 API。
- 页面顶栏使用独立 `overflow-x:auto` + 触控板滑动、自然 Tab 键、箭头/Home/End 和被选中 Tab 自动滚入可见区域；页面正文保持纵向滚动，控件通过 token 和 `minmax(0,1fr)` 适配窄屏。
- Cloud Tab 只有 Chrome Side Panel 身份确认后才能展示和恢复选择；完整任务目录/工具独立标签页不显示 Cloud 且不能生成第二个 Cloud Host。切换页签保留原 Stop 按钮的运行所有权。
- 独立全页面控制台留作未来复杂队列、统计、长期 RunHost 和定时任务管理，不是本轮强制入口；创建时必须使用 Observer-only 身份而非复制真正的执行 Host。

## 验收
关联 `tests/environment/cloud-control-sidebar-r28.test.mjs`、`cloud-control-debug-r14.test.mjs`、`sidebar-tab-memory.test.mjs`、`workflow-r15.test.mjs` 及原 R21/R19 静态门禁。
单纯 Node 或 CI 构建通过不等于真实 Mac Chrome 验收。需要按候选身份检查 300/360/420/520px、200% Zoom、鼠标/触摸板水平滚动、键盘导航、站点切换、真实云控领取/停止/退出 Side Panel 后恢复。未实测项目保留 NOT_TESTED，不能宣称每项达到 95。
