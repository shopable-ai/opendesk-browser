# axiosx 调用验收与 Worker 错误回传

本轮直接在 `main` 工作区修复。基线为 `b8cfc1f597ae1578e790f1b7fee89fb8aa1fcce9`，PR26 已合入。没有提交、推送或发布。

## 关键步骤与实际结果

1. 检查注入：通过真实 Sidebar 授权安装 MAIN SDK，确认 `OpenDeskSDK.axiosx` 可调用。
2. 检查请求：MAIN SDK 与独立 Controller Worker 分别执行 GET、POST，均收到真实 HTTP 200。
3. 检查后台：服务器请求日志、原生回执、持久操作记录相互对应，每个最终测试操作只有一次请求和一次原生回执。
4. 检查返回：404、429、500 的原生回执和后台记录已有完整正文；修复后 Worker 的 `catch` 同样能读取 `e.cause.status` 与 `e.cause.response`。
5. 保存身份：Worker `runId=44609272-8f86-41f5-b1bc-336c9cabe298`、`resultId=97145771-aec8-442c-8e8c-ad2d9f10491c`，结果完成且执行资源已释放。

缺口的价值：脚本可根据 429 限流、500 服务错误和服务器说明作出处理。正常成功请求原本已可用，本次补齐失败请求的错误信息。

## 修改与验证

- `src/platform/host/controller-methods.js`：首次 HTTP 失败也返回已持久保存的错误，仍通过返回阶段的授权检查。
- `src/scripting/sandbox/controller.js`：在现有编解码大小、深度和访问器限制内传递 HTTP 状态与响应，不扩大未知效果的重放权限。
- 两个定向测试文件覆盖首次返回、持久返回、授权失效与不可信错误内容；`72/72` 通过，`npm run check` 通过。

最终开发包哈希为 `69bb1a3111e1c38e6413cee6923c97c067ba5a1f780be7fca1eee13e20c4b392`。构建的 140 个源码输入均核对到当前 main 工作区；身份包含未提交补丁，不能标成纯基线提交的验收。

原始记录在 `docs/framework/evidence/axiosx-worker-final-01a11f42/`，入口为 `final-summary.json`、`main-source-binding.json` 和 `evidence-manifest.json`。早期失败及安全边界记录保留在 `docs/framework/evidence/axiosx-native-01a11f42/`，继续使用其原始 `c8d43791` 包身份。两个测试包保存在本地 `.native-packages/axiosx-01a11f42/`。

本轮 MAIN/Worker 调用范围通过。完整正式账本、独立最终 F3、生产包和 ZIP 安装验收仍未由本轮关闭。没有将普通 Fetch、旧候选结果或组件测试提升为当前包的原生通过。
