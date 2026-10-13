# Cloud Control R5.3 · G3-02 UI-08 增量实施记录

日期：2026-10-13。唯一集成分支：`main`。权威账本仍为 `cloud-control-r5-02-function-matrix.json`，此处不复制 110 项。

## 受控范围与所有权

- 本批只修改 `src/cloud-control/service.js`、`src/ui/cloud-hosting.js`、`src/ui/tool.html`、`src/ui/tool-shell.css`、`tests/cloud-control/r52-product-ui.test.mjs` 及原矩阵，新增本增量日志。
- 复用唯一可信 Host 的 `cloudStatus({limit,offset})`、原始 Run/Result 的 `snapshotControllerRun` 和现有「开发」查询控件；不创建 Provider 路由、数据库、执行器、Runner、权限或 observer 新权能。
- 仅受信 Host status 投影允许携带经原 Run 与 request 绑定校验的 `runId`；公共 `cloudObserve` 继续不返回任何 ID/凭据/正文。
- 本轮由 GitHub 接口读取并在唯一 `main` 中进行有父 SHA 前置条件的原子提交；用户 Mac 工作区、Chrome/端口/dist/Provider 状态无法读取或占用，未宣称无本机冲突。若远端 HEAD 更新造成租约失败，放弃此次提交并重新核对。
- 无 Chrome 资源、Provider 资源、端口、dist、ZIP 和本地 Git index 占用。

## 本批实现与边界

- UI-08 `SOURCE_IMPLEMENTED`（非 `COMPONENT_TESTED`）：生产 Side Panel 请求历史每页 5 条翻页、只读任务详情、原始 Run 链接；按钮仅前往原有开发页的授权查询，不执行/重放云任务。
- 列表保留任务名、状态、回执与资源释放；高级详情仅经点击展示原 Run ID，不显示网页 URL、输入参数、Client 密钥和结果正文；授权撤销后原 Controller Result 查询仍需自身权限检查。
- 添加相关回归用例；实际 Node/构建/Chrome 由同输入候选 CI 或 Mac 持有人运行后再登记。不能根据源码和静态断言宣布 95+。
- 旧 #38379208965 Cloud 45 PASS、Authority 105 后 OOM FAIL 保留；Mock 递归修复在前置源码中存在，不以存在修复代替新 CI PASS。
- 原生 Task A/B 身份、PackageHash、截图、公网跨设备闭环仍为空/待验证，`OPS-05` 继续 `NOT_IMPLEMENTED`/`REMOTE_NATIVE_PENDING`。

## 后续真实验收

1. 在实际 Mac 工作目录只读确认此提交的文件 SHA 与当前并行改动是否兼容。
2. 同一候选运行 `node --test tests/cloud-control/r52-product-ui.test.mjs`、`npm run test:cloud`、`node --test tests/framework/k3-controller-authority.test.mjs`、`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify`。
3. 真实 Chrome Side Panel 验收 300/320/360/420/520 CSS px、125%/200% Zoom、分页/键盘/焦点/大历史，记录截图和 PackageHash。
4. 按 G2 取得真实安装 Task A/B 的 Worker、Run、Result、retirement、receipt；按 G4 取得经批准的跨网部署环境（否则继续 Pending）。
5. 经有效测试证据才能将 `UI-08` 从 `NOT_VERIFIED` 提升，15 项专家评分保持独立 `NOT_VERIFIED`。

状态：**源码实施候选，测试与原生均未在本对话执行；未满足 PRODUCT_CLOSED。**

## 已核实的 GitHub 集成身份与 CI

- 正式源码提交：[21c5a0dacb7ae0dfea18ea85d414ac157b09b34a](https://github.com/shopable-ai/opendesk-browser/commit/21c5a0dacb7ae0dfea18ea85d414ac157b09b34a)；已确认当时为 `main` HEAD。
- GitHub Cloud R5.2 专项 Actions：[38413468963](https://github.com/shopable-ai/opendesk-browser/actions/runs/38413468963)，提交 SHA 与源码提交一致；2026-10-13T14:27:10Z 观测状态为 `queued`，无通过/失败结论，不能记 `COMPONENT_TESTED`。
- 已提交新的 UI-08 脱敏详情/分页/回原始 Run 的测试用例，`npm run test:cloud` 包含 `tests/cloud-control/*.test.mjs`；尚无本轮实际 Node 测试输出。旧 45 PASS / K3 OOM FAIL 保留。
- 相关源码 Blob：Cloud Service `66163178693a7adbef84ce53820b3da24f73378b`；Side Panel 控制 `5bab57784785e60fc319ed782a49693f7602b1a9`；生产 HTML `a772687e4a47bebf34230a007bd1ae7d3df40bd8`；CSS `ca839abb27e3c33aad63552a7074edf66413c8be`；UI 回归测试 `fd7ef5d2ed33d62bafe67e38153c27ed01e9ff8c`。
- R5.3 原生 Task A/B、完整 Worker/Run/Result/Receipt、截图及生产/开发 PackageHash 尚无证据，不作虚构补录；专家评分维持 `NOT_VERIFIED`。
