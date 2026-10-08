# Program R3.1 验收记录与续接

更新：2026-10-09。本记录属于 `agent/program-r3-native-01a11bdf`，只代表下列精确候选的组件验收。当前状态：实现与本轮组件验证已保存，后续交接；尚未完成安装/重启及 main 集成，不是最终 F3 或 ZIP 安装 PASS。

## 候选与原始证据

- 工作区：`/Users/shopme/Documents/workspace/opendesk-browser-program-r3`；产品源码 HEAD：`30754f86938608163b0e2e6508d3f619dffbe517`。本轮基于 main `704dd8c`，交接时观察到 origin/main `736884656fdab4229aad21889dbeeda1f14d4558`，尚未同步，不将旧候选结果宣称为最新 main 验收。
- Chrome：受控 CFT `149.0.7827.55`，独立新 profile、独立端口和扩展数据库；扩展包完整指纹 `7f83330d5e45375ba9659de02ec35f9c14f283c8788c0f5cbf8b37fe3fe04118`。
- 主要网页沿用 `examples/tasks/demo-form.html`。驱动只为本轮提供同一页面及确定性 HTTP 200/503 接口；没有新建另一套同类业务测试页面。`d1-userscript.html` 本轮未执行库兼容矩阵。
- [证据索引](program-r31-01a11c05-evidence.json)保存具体 runId/resultId、结果自身 revision/sourceHash、目标、retirement、Page 精确文档回执，以及每个原始文件的 SHA-256。原始记录在本工作区被忽略的 `docs/framework/evidence/program-r31-01a11c05/final/`，保留本机，不移用其他聊天的回执。
- 真实网站权限和用户脚本开关通过 Chrome UI 完成；输入使用原生 UI/CDP Input，存储观察只读。没有 DOM 赋值、synthetic event、数据库回写或伪造 native ack。

## 已完成的验证

| 实际功能 | 结果与范围 | 原始证据（相对上述 final 目录） |
| --- | --- | --- |
| 单文件 HTTP 与页面读取 | 200、标题/URL 正常；持久结果完成，retirement released | `http-only.json`、`single-title.json` |
| 单文件 Locator + HTTP | 真实填充/点击；关键词 `Program R3.1`，搜索提交次数只增加一次；返回 HTTP 200 | `locator-success.json`、`server-events.json` |
| 多文件 Controller dev/prod | 两种构建返回相同标题；执行 SHA 对应各自真实产物 | `controller-dev-success.json`、`controller-prod-success.json` |
| helper 源码查看 | 切换到 `src/title.js` 后再运行，执行 SHA 仍为原 dev 产物，结果相同 | `controller-helper-repeat.json` |
| 单文件 Page | 实际创建 DOM 输出、返回 title/effect；取得真实精确文档回执 | `single-page-success.json`、`single-page-native-receipt.json` |
| 多文件 Page dev/prod | 同样返回 `{found:true,heading:"网页交互示例"}`；各自 SHA 与原生 document/frame 回执匹配 | `page-dev-success.json`、`page-prod-success.json`及各自 `*-native-receipt.json` |
| 经典单文件顶层执行 | 实际 DOM 标记与原生回执；不声称等待异步 IIFE 或停止其监听器 | `classic-and-locator-missing.json`、`classic-page-native-receipt.json` |
| 真实异常诊断 | 原始 Error 堆栈、HTTP 503→`E_HTTP`、非法选项拒绝、缺失 Locator→`E_TIMEOUT` | `runtime-fault.json`、`http-503-failure.json`、`locator-failure.json`、`classic-and-locator-missing.json` |
| 多文件异常定位 | 真实 Worker helper 异常通过对应本地 dev map 映射到 `src/helper.js:2`；无映射的适配器帧保留未知 | `helper-runtime-fault.json`、`helper-runtime-mapping.json`、`fault-built/program.js.map` |
| 跨标签与 Stop | 当前网页切到 B，运行仍冻结 A；真实 Stop→`E_CANCELLED`，retirement released | `running-cross-tab.json`、`stop-cross-tab-settled.json` |
| Sidebar 关闭重开 | 真实关闭/重开后持久记录仍在；新 Host 可再次完成运行 | `panel-closed.json`、`panel-reopened.json`、`post-reopen-run.json` |
| 编译产物保存 | 真实 Save click 为 isTrusted；显示入口源码 126 字节，保存完整产物 758 字节，r1 的字节 SHA 为生产 `c8788deb…`；随后该产物草稿运行成功 | `saved-production-version.json`、`saved-production-run.json` |
| 360px Sidebar | 原三页签、底栏和 Page 折叠入口保留，实际文档宽度 360，无横向溢出 | 源码导入观察记录、`project-source-360.png`（Page 结果区域） |
| 本轮资源与清理 | 完成/停止后观察到 pending/timers/workers/blobs 为 0，subscriptions 57、ports 1；仅此活跃 Sidebar 的稳定观察，不替代正式六项 baseline。自己的 Chrome 退出、profile 删除，无残留 | 各次 settled 记录、`cleanup.json` |

生产运行字节保持：Page `623d850fadb321a8fca76883adb464f9600a6dbbc95414520981b4a34d3461e5`；Controller `c8788deb74810cc24be36f6740614e5beeb7aea2b217159372bd096daed9f3dd`。开发构建可读并附独立 map。V8 Worker `<anonymous>:LINE:COL` 转最终 `program.js` 为 `line=LINE-2`、`column=COL-1` 后使用 `mapProgramGeneratedPosition`；这只适用于本候选实测的 AsyncFunction 用户帧，不能套到 Blob runtime 帧或假定其它引擎偏移。

自动验证同一产品源码：187/187 测试通过，`npm run check` 检查 137 个文件通过；生产/开发构建与 `npm run verify` 通过。日志在上一级证据目录 `auto-test.log`、`auto-check.log`、`auto-build-*-final.log`、`auto-verify-final.log`。之后只调整文档与只读观察驱动，执行 `node --check tests/framework/program-native-acceptance.mjs` 和 `git diff --check`；没有因此重跑全量产品验收。

## 保留的失败与剩余项

前两次 Locator 运行超时，保留 `single-controller-settled.json`、`controller-enabled-settled.json`，不计 PASS。实际观察到关键词输入框 y=806.49、viewport height=799；真实滚动后 y=614.99，同一源码成功。没有 native commit 的 prepare 阶段与已提交未知 effect 必须继续区分，不能盲目重放。

系统文件选择器曾在深目录中禁用“打开”；换成字节相同的 `/tmp/program-r31-*.json` 后完成真实导入。非法 `timeoutMs` 测试得到真实 `E_OPTION_UNSUPPORTED`；缺失 Locator 的正式负向用例改用已约定的 `timeout`，两条记录分别保留。

仍为 `NOT_TESTED`：加载保存版本后的展示/运行、此候选的 Installed Task 完整链路、同 profile 整个 Chrome 关闭重启、正式冻结六项资源 baseline、完整框架合同/独立最终 F3/ZIP 安装。保存和草稿成功不替代这些项。没有执行 release/publish 或合入 main。

## 跨聊天去重规则

采用这份 Markdown 入口 + 分支专属 JSON 证据索引；无需另建测试平台或产品 UI。

1. 开始前读取最新 main、已有 PR、相关聊天状态及原始证据索引。明确自己负责的用例和独立资源，避免重复接管 R6.2/R6.3 原生桥或 axiosx 工作。
2. 用例身份至少包括实际功能、输入/fixture 哈希、相关产品输入、构建包身份、浏览器及权限条件、证据等级。旧候选 PASS 原样保留；不能改成新候选 PASS。
3. 同一候选、同一输入和环境且没有关联修改时，复用已有 PASS，不重新执行。文档编辑、另开聊天、观察器输出格式变化都不是重跑成功用例的理由。
4. 相关代码、依赖、fixture、权限/文档生命周期、构建或原生效果语义发生变化时，列出受影响用例及失效原因，只重跑需要重新证明的分支。环境阻断或前置条件未满足与产品失败分别记录；同一失败只有条件明确变化后才重试。
5. 多个 Agent 各维护自己的工作流记录；汇总者只读对照。CFT profile、固定端口、数据库、dist/ZIP 和集成 main 需各自明确占用与释放。共享 macOS 原生 UI 也可能互相干扰，操作前核对窗口/URL，不争用前台输入。
6. 正式最终验收仍按原已批准合同，在同一冻结候选集中执行；以上组件复用不能偷偷改变分母、降低合同或代替最终 F3。

用户于 2026-10-09 将旧 jQuery 版本适配明确降为边缘性低优先级，见[延期待办](../backlog/legacy-jquery-compatibility.md)。当前不扩展旧版本矩阵。

## 续接范围

新聊天只负责 Program R3.1 源码/产物分离的剩余收敛与测试证据复用。已通过的本候选用例先校验哈希并复用；先观察 main/PR 漂移和其它正在工作的聊天，再判断是否有真正缺口。继承本工作区和原始证据须明确完成 writer 交接；不要从 main 共享目录继续写，也不要重开已经释放的 profile 或改写旧 receipt。不得以旧候选验收覆盖更新后的 SDK/入口；必要时形成新候选并仅执行有明确依据的受影响验证。
