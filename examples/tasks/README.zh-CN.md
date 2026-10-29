# OpenDesk Task Package v1：本地表单演示

> R10.1 当前中文使用入口：[快速入门](../../docs/api/quickstart.zh-CN.md)，[七个 MCP 工具](../../docs/api/mcp-local-development.zh-CN.md)。复用原候选证据，按相关输入判断是否需要重测；不以示例运行代替安装/F3。

这个目录提供 **真实源码、清单 SHA-256 和 HTML 演示页**。JSON 导入后的初始状态必须是 **待验证**，不是自动审核通过或直接安装。

## ChatGPT「OpenDesk · 浏览器任务」怎么用

入口调用扩展已有的 **Controller Task**，使用框架的 Playwright 风格 `page` / Locator。页面标记只是候选；用户点击执行或单独批准本次自动执行后，原 RunHost / Authority 打开独立目标网页、执行已安装脚本，再将持久结果发送回发起请求的同一聊天。这里不经过 ChatGPT 原生 MCP，因此不会出现原生 MCP 工具卡片。

两个快捷示例是**读取示例网页**（`page.read.fixed`）和**百度搜索前三条**（`baidu.search.top3`）。选择「从已安装脚本中选择…」会从原任务目录读取当前可用、未停用的安装，显示名称、唯一 ID 和版本；同名脚本按 ID 区分。该路径填写完整目标网址及 JSON 参数，按安装清单的参数 schema 核验并补齐默认值，绑定安装身份、代次、源码和版本。更换已安装 Task 不需要给宿主增加一个写死分支。目标必须属于该安装已批准的网站，网页或模型不能传入任意源码执行。

下拉框出现快捷示例不代表已安装。首次由开发操作者在「我的 → 添加任务 → 浏览任务目录」导入本目录对应的 `.opendesk-task.json`，用相同源码的真实运行记录完成验证、设为本地可用，再审阅并安装确定版本及所需网站范围。正常安装后即可使用，无需再次通用启用；主动停用的任务需由用户恢复。

日常使用：

1. 打开官方 `https://chatgpt.com` 的一个已有对话，并点击 Chrome 工具栏的 OpenDesk 图标，让**同一窗口的 OpenDesk 侧栏保持打开**。真实任务宿主在该侧栏中；网页浮层单独出现不代表宿主已就绪。首页或新聊天尚无会话 ID 时，先发送一条普通消息并等待回复，或从左侧选择已有对话。首页不会执行浏览器任务。
2. 确认 ChatGPT 已停止生成、输入框没有自己的草稿或附件、输入法已完成编辑。在「OpenDesk · 浏览器任务」选择脚本。通用安装入口填写目标网址和参数 JSON；例如选择安装的 `page.read.fixed`，网址 `https://httpbingo.org/html`、参数 `{}`。百度快捷示例默认关键词为 `OpenDesk Browser`，最多读取三条自然结果。
3. 固定五字段 `opendesk-task` 命令按下节操作，完整回复会自动识别。需要旧请求方式时展开「更多请求方式」，点击「建立请求」。这一步只把本次请求填入官网输入框，**尚未发送或运行**。核对后，用 ChatGPT 的发送按钮发送，不改写其中的请求身份、任务和参数。
4. **手动执行**：等待官网本轮回复完整结束，再点击面板「执行」。回复必须含唯一完整且与本次请求匹配的候选，模型文字不能代替批准。
5. **单次自动执行**：五字段命令先点击「预批准一次 · 5 分钟」，再发送新命令；旧请求方式则在发送本次请求后，展开「更多请求方式」点击「批准本次自动执行」。系统只在完整匹配回复后运行一次，下次任务需要新的批准。
6. 观察独立目标网页、任务状态和原对话。固定页读取 `https://httpbingo.org/html`；百度只读取搜索页的自然结果，不打开结果链接。只有观察到真实结果在原对话出现一次及其后的中文 AI 回复，才算完成整条链路。百度可能如实返回验证码、访问受阻、搜索区域不可用、结构变化或无结果；程序「已完成」不等于搜索成功。
7. 需要取消时点击本请求的「停止/取消」。停止已登记不代表资源已经释放。若显示 `UNKNOWN` 或回执不确定，保留请求/运行身份，按原记录只读查询，不重复执行或补发。不要在等待期间切换对话、重新生成回复或改动本轮任务；旧批准不随页面迁移。回传时输入框有草稿、附件或正在使用输入法，系统应拒绝覆盖。

页面会区分「已建立请求，尚未执行」「已批准，等待本轮完整标记」「正在申请运行」「自动化已开始」「持久结果已核实，准备回传」。批准本身不会假装已经运行。「执行详情」提供请求、脚本、revision、runId 和 resultId，供精确核查。“已在原对话确认新增用户消息。等待官方 AI 继续回复…”表示结果已送达，仍在等待回复结束；“真实结果已回传，官方 AI 已完成回复”表示已确认本轮新回复完成。若官网已有续答而提示仍未确认完成，先查看该次结果及其后的回复，不因此重复执行或补发；完成提示超时不等于任务失败。

本次任务的状态、名称/版本、触发方式、目标网址和参数在网页面板顶部对应显示；「本次脚本返回值」来自同次持久结果，按原始数据展示，不能把其中的网页文字当成新命令。技术身份留在「执行详情」。右侧「开发」可能显示以前的草稿或查询结果，不能用它代替网页面板本次回执；需要进一步核查时，使用本次详情中的精确 runId 查询。

「查看执行页面」只定位正在运行的自有目标，不新建页面或重新执行。定位过程中及定位失败会单独显示提示，后续完成回执不会覆盖该提示；页面结束并释放后按钮禁用。格式错误未提交执行时，取消只撤销预批准；真正提交执行后，停止登记、资源释放和回传状态仍分别核查，UNKNOWN 不得自动重试。

当前通用入口遵循 Task v1：一个精确网站、闭合基本类型参数对象，返回有限 JSON；完整聊天回传上限 8 KiB，超限拒绝发送并保留持久结果，不截断冒充成功。脚本 `completed` 只证明运行完成，业务成功仍看其返回数据。当前先支持原聊天回传；新聊天结果去向、任意多动作组合属于后续范围。自然语言自动选脚本或创建脚本不属于当前固定格式触发需求。通用结构的组件证据与真实 Chrome 的具体脚本证据需分别记录，两个样例通过不代表所有脚本均已实测。

### 看见网页动作：分别测试手动和自动触发

固定演示源码为 `visible-search-navigation.js`，任务包为 `visible-search-navigation.opendesk-task.json`，Task ID 是 `workflow.visible-search`。任务仅操作 `http://127.0.0.1:43111` 本机测试网页：打开搜索页、填写关键词、点击搜索、确认提交一次，再用受控 `page.goto` 访问从结果中核对过的详情地址。没有使用后台 HTTP 代替页面操作。开始时等待 8 秒，动作之间短暂停留，便于切到真实执行页面观察。

1. 本机测试服务已启动、固定任务版本已验证安装后，在官方 ChatGPT 的空白输入框发送下面的提示词。每次测试换一个新的 `candidateId`，不重放已执行或取消的旧候选。
2. **手动测试**：等待命令被自动发现并显示“尚未执行”，此时应没有新运行；点击一次「执行」，再点击「查看执行页面」。观察 `OpenDesk` 被填入、搜索提交一次、地址变成 `workflow-search.html?detail=opendesk`，然后回原聊天核对实际返回数据。
3. **自动测试**：从「从已安装脚本中选择…」选择 `workflow.visible-search`，目标填写 `http://127.0.0.1:43111/demo-form.html`，参数填写 `{"keyword":"Workflow"}`，点击「预批准一次 · 5 分钟」，再发送新候选，字段与预批准完全相同。回复完整后应自动运行，无需点击「采用」或「执行」；只点击「查看执行页面」观察。详情地址应为 `workflow-search.html?detail=workflow`。
4. 每轮都核对：搜索页提交次数为 1、详情标题与关键词匹配、原聊天收到一次结果及中文解释、运行最终已完成且资源已释放。详情页本身是新文档，其“提交次数：0”不代表上一搜索页没有提交；以搜索页观察和持久结果中的 `submissions` 交叉核对。

手动轮提示词（自动轮更换 `candidateId`，并将 `keyword` 改为 `Workflow`）：

````text
只回复一个语言标记为 opendesk-task 的代码块，原样包含以下 JSON。不要把网址变成 Markdown 链接，不要添加非法转义。收到后续真实执行结果时再用中文解释实际数据，不要模拟执行结果。
{"protocol":"opendesk.task.intent.v1","candidateId":"visible-manual-换成新的唯一标识","taskId":"workflow.visible-search","targetUrl":"http://127.0.0.1:43111/demo-form.html","args":{"keyword":"OpenDesk"}}
````

这证明固定命令到真实网页动作的机制；演示目录和数据是本机夹具，不代表已完成某个真实业务网站的任务。

2026-10-28 上一轮的独立网页证据与持久记录（仅绑定该轮源码和旧界面）：手动 `f133e92c-7454-4583-b33c-59f00ca9ef6c`，自动 `9212337c-e664-4daf-8729-de3dc4267ab9`，均为完成且资源释放，搜索页提交次数为 1。原始文件在 `artifacts/ai-workflow-visible-20261028/`。当时「查看执行页面」未确认成功；不能拿手动选择目标标签页的截图代替该按钮验证。

本轮在持续开发目录 `dist/development`、原扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf` 上，经用户确认没有其他运行任务后重载扩展，复用原 watcher 和 43111 服务。专用聊天为[测试就绪](https://chatgpt.com/c/6ae0df31-10fc-83ec-b1f7-920a8a11f04e)。仍使用 `workflow.visible-search@1.0.1`、revision 1，源码 SHA-256 为 `d436e12ee875be9eb5d38e81830c710c2ea98cf32c53ecec0d0a9c405d95a7bd`。

| 本轮操作 | runId | resultId | 实际证据 |
| --- | --- | --- | --- |
| 手动执行，OpenDesk | `a1855a8e-dc90-427f-a183-b32802ac1aa2` | `5fb07be7-ff35-4b2e-b0a8-313302565f53` | 候选识别后尚未执行；点击一次执行，再点击查看按钮，真实前台 URL 为 `?detail=opendesk` |
| 预批准自动执行，Workflow | `f3b48b88-bd24-4d7e-bdbe-59cde43a711a` | `55eae735-b278-4f7c-a148-deeee2b9b8a6` | 未点击采用或执行；顶部明确显示任务名称、版本、自动触发与本次返回值 |
| 自动轮补充查看页面，Workflow | `bc350dcc-bc9a-44b7-8361-e931e4e69adf` | `0c6e785d-b7d2-4755-b3e7-4c17e05dc447` | 新候选独立批准；只点击查看按钮，真实搜索页可见 Workflow、匹配结果与提交次数 1；返回值的详情为 `?detail=workflow` |

三轮均显示本次执行完成、资源已释放、真实结果回到原聊天一次及 AI 新回复完成；自动轮同时覆盖最终的任务名称显示。错误格式轮 `visible-format-ui-20261028-b5d294` 被严格拒绝，未启动执行，取消后明确显示“授权已撤销；不会执行”，没有误报 UNKNOWN。当前面板最多预览持久返回值的 2000 字符；完整结果仍通过本次精确 runId 查询。Node 定向检查 `chatgpt-task-discovery-p0`、`chatgpt-bridge-cancel-page-r21`、`chatgpt-independent-task-intent` 为 79/79 PASS，不能代替上述原生观察。

本轮原始证据仍在 `artifacts/ai-workflow-visible-20261028/`：`manual-ui-before-execute.ax.txt`、`manual-ui-view.ax.txt`、`manual-ui-completed.ax.txt`，`auto-ui-completed.ax.txt`、`auto-view-live.ax.txt` / `.png`、`auto-view-completed.ax.txt` / `.png`，以及 `format-ui-rejected.ax.txt`、`format-ui-cancelled.ax.txt`。这些是本机开发验证；production、其他业务网站与完整验收仍为 NOT_TESTED。

若看到 `E_CHAT_TARGET`，先检查是否已进入包含 `/c/<会话ID>` 的正式对话；不要反复点击执行。若执行后看到 `E_BRIDGE_TRANSPORT`，确认同一窗口的侧栏是否打开，但本次执行回执仍是不确定状态，不能因此重复执行。版本更新后，旧网页可能仍运行旧脚本，仅在没有进行中的请求、已保护草稿后重新打开页面。此前固定示例的真实运行记录见[核心链路记录](../../docs/framework/workstreams/ai-chat-bridge-r20-mac-codex-acceptance.zh-CN.md#当前核心链路续推2026-10-26-1700-起北京时间)；这些历史结果不替代新增通用入口的运行验证，也不代表 production 发布验收。

## 浏览器环境独立诊断页

复用本目录现有 HTTP 服务，访问 `http://127.0.0.1:43111/browser-fingerprint.html`，或从标准 `demo-form.html` 点击「浏览器环境诊断」。页面本身不依赖扩展，直接读取当前网页可见的 UA、低熵 UA-CH、首选语言、完整语言数组、时区、视口、屏幕和像素比。

1. 先停止已有环境模拟，再打开本页或点击「记录当前值为基线」。基线只是记录时的网页读数，不保证是未经覆盖的原始环境；刷新会重建。
2. 保持本 Tab 为目标，在浏览器指纹扩展选择环境并应用。本页每秒读取实际值；「已变化」只表示相对基线的差异，需要自行核对是否符合预期。暂停自动读取后仍可点击「立即读取」。
3. 点击扩展「停止 / 恢复」，同时核对本页读数和扩展的独立恢复报告。切换 Tab、导航等动作会结束原会话，不能将失效会话当作新网页的验证结果。

「复制报告」与「下载 JSON」包含本页基线、当前值、字段来源及差异。展开的原始 JSON 是固定快照，方便选取复制，重新展开可更新；自动刷新不改写选取中的报告。报告只在本页内存处理，由用户主动复制/下载，无远程依赖或上传。HTTP `Accept-Language` 仍为 `UNVERIFIABLE`，Geolocation 为 `UNSUPPORTED`；不采集公网 IP，也不宣称完整指纹、网络身份或反关联验证。此页是独立核验入口，不取代通用 Task/Page/Locator 标准演示页。

## 阅读目录（TOC）专项手工入口

目录小工具的开发与安装不是本页 Task v1 的验证流程；详细说明见 [Side Panel 小工具 API](../../docs/api/sidebar-tools.zh-CN.md) 和 [官方阅读目录示例](../sidebar-tools/reading-toc/README.md)。

复用本目录的 HTTP 服务：在确认 `43111` 端口空闲后执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`。浏览器访问：

- `http://127.0.0.1:43111/reading-toc-article.html`：真实可滚动的静态文章 DOM，1 个 H1 / 20 个 H2，检查概览上限、末尾章节高亮、拖动与位置记忆。
- `http://127.0.0.1:43111/reading-toc-conversation.html`：多回答模拟 DOM，检查每回答标题边界、同名标题、自动来源跟随/手动固定。
- `http://127.0.0.1:43111/demo-form.html`：原有标准任务/Page/Locator 手动入口，不被新 fixture 取代。

必须先在 `chrome://extensions` 加载本仓库构建的 `dist/production` 或 `dist/development`，在 Side Panel **工具**中明确安装阅读目录并给该 `127.0.0.1:43111` Origin 授权，网页才会出现目录。这两张静态测试页**不是**真实 ChatGPT/知乎的原生兼容性证据。

## 在本地 Chrome 验证

1. 在本仓库执行 `npm ci` 和 `npm run build:dev`，在 `chrome://extensions` 打开开发者模式，并加载 `dist/development`（解压扩展）。建议使用独立测试浏览器配置。
2. 在项目根目录执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，用普通 HTTP 标签页打开 `http://127.0.0.1:43111/demo-form.html`。
3. 点击 Sidebar「发现」旁的「导入」，在打开的独立完整扩展页面导入 `examples/tasks/form-fill.v1.opendesk-task.json`。Candidate 应显示 `sample.form-fill@1.0.0`、本地来源、准确网站、权限和 **待验证**。Sidebar「发现」只搜索已安装任务。
4. 返回演示网页，在 Sidebar「开发」编辑器中粘贴任务包的 `sourceUtf8`。也可在同窗口已打开 Sidebar 时，从独立任务目录导入 `.js` 草稿；源码会交给 Sidebar 编辑器，目录页保留原视图。把参数设置为 `{"name":"Alice"}`，明确运行草稿并批准当前网站，确认输入/提交与网页 `#done` 已出现，查看持久完成结果并记录本次 `runId`。无需先保存草稿。
5. 返回独立任务目录，选中 Candidate，**填写刚才的精确 `runId`**，点击「核对运行证据」。Sidebar 的最近运行 ID 不会自动填入另一个页面。只有后台确认 **相同源码哈希、相同网站、已释放执行资源、已持久结果和原生页面操作回执** 才能达到 Verified（本机验证通过）。
6. 明确点击「设为本地可用」达到 Available，再点击「安装确定版本」。返回演示网页，在 Sidebar「我的任务」填写姓名，点击「运行任务」，检查网页、运行状态和持久结果。示例使用 `page.type`，会在现有输入后键入；再次验证可先重新加载演示网页。
7. 停用任务后再尝试运行，必须被禁止；重新启用可运行。卸载后底层已保存 Task Script 也不得绕过安装直接运行。
8. 关闭并重新打开 Side Panel，确认已安装任务与历史仍存在。再完全退出和重启 Chrome，核实任务可再次使用。必要时先让上一次运行完成资源退休。

## 状态含义与边界

- 本地验证是由现有 Controller 持久运行结果支持的**本机事实**，不等于第三方安全审计、代码签名或云市场审核。
- 此示例只申请一个明确的 HTTP origin 和 `page.automation` 任务权限；浏览器站点权限仍必须独立批准。导入文件绝不能直接声明自己是 Verified / Available。
- 无需 Codex、MCP、Native Messaging 或外部运行服务；以上 `python3` 仅用于启动演示页面。
- 在没有实际 Chrome 原生运行回执的环境里，请标记 `NATIVE_NOT_VERIFIED`，不要把 Node 组件测试当作真正的网页验收。

## R5.1 接口 / R5.2 可靠性：现代 Page API 草稿（不用安装任务）

同一个 `demo-form.html` 现在有第二个简洁搜索表单（不会影响旧的姓名表单）。

打开开发版扩展 Sidebar「开发」，粘贴 `modern-search-draft.js`，参数为 `{"keyword":"OpenDesk"}`，直接运行草稿：

运行前用浏览器正常滚动，让搜索输入和按钮都位于视区。当前页面包含多组演示，窗口较小时搜索区域可能离屏；现代 Locator 不自动滚动，离屏会等待到 `E_TIMEOUT`。不要为测试成功修改 HTML 或让外部自动化代替 OpenDesk 填写、点击。

先核对服务返回的是当前仓库的 `demo-form.html`。2026-10-09 独立验收发现已有 43111 服务指向历史快照，因此保留该服务，改用空闲 43112 启动当前 `examples/tasks`；这只是隔离验收端口，正式人工入口仍是 43111。完整启动命令可使用 `--directory /Users/shopme/Documents/workspace/opendesk-browser/examples/tasks`，并在证据中记录实际 URL 与 HTML 哈希。

- `getByLabel('搜索关键词')` 的 `fill` 必须覆盖预填的「旧的预填内容」。
- 页面收到 input 后同文档重绘「搜索」按钮，并短暂禁用，`getByRole('button',{name:'搜索',exact:true}).click()` 应自动重新定位和等待。
- 等待「搜索完成」，`#results` 返回「结果：OpenDesk」，页面「提交次数」只增加 1。
- 再次直接运行相同草稿，检查第二次仅增加 1，并确认 Sidebar 最终持久结果。无需先候选/发布/安装，也无需外部 Playwright 或 MCP 做页面动作。
- 如果使用 AI，可先运行 `await page.observe({root:'#search-form'})` 读取表单角色/名称；其输出是有限预算的语义 DOM 摘要，而非浏览器原生 AX 树。

**R5.2 补充验收**：`page.observe({root:'#search-form'})` 应返回有限节点和 `budget.visited/locatorChecks` 等计算量信息；定位建议仅在 `locator` 不为 null 时表示通过相同查询规则的一次唯一性验证。额外检查遮挡、disabled/aria-disabled、readOnly/aria-readonly、按钮动画、Locator 单次超时，以及动作回执缺失时 **不可再次提交**。组件模拟通过不等于 Chrome 实测；只有 Sidebar 原有 Controller 运行链返回真实 `runId/resultId`、提交回执和 Durable Result，才可对本机标记通过。修复细节和已有 CI 见 [R5.2 验收记录](../../docs/framework/workstreams/r5-2-modern-page-api-acceptance.md)。

本机受控 CFT 155 已按上述入口完成两轮相同文件字节的搜索，每轮恰好提交一次，结果都是「结果：OpenDesk」。无需 AI 重写；两个 Durable Result 分别带自己的 runId/resultId 和相同 sourceHash。证据及动画亚像素移动修复见同一验收记录；AI 生成任务的端到端流程另记 NOT_TESTED。

旧版 `form-fill.v1.opendesk-task.json` 的已发布源码、sourceHash 和 manifestHash **保持不变**：它仍然使用旧 `page.type` 追加输入；本轮不破坏已经发行任务。现代 API 具体边界见 `docs/framework/modern-page-api.zh-CN.md`。

## R7 基础交互测试：一个 HTML 即可

主入口仍是 `http://127.0.0.1:43111/demo-form.html`。页面是一张简单的内容/表单网页，**不是测试管理后台**。只需 Python 静态 HTTP 服务，不新增服务器依赖、API 或 HTML：

| 能力 | 页面选择器 | 可断言的结果 |
| --- | --- | --- |
| 读取标题和段落 | `#sample-title`、`#sample-text`、`#sample-list` | 固定中文内容 |
| 点击计数 | `#click-button` | `#click-count` 每次加一 |
| 展开文本 | `#toggle-button` | `#extra-text` 显隐以及 `aria-expanded` |
| 请求成功 | `#delay`、`#request-success` | `#async-status[data-state="loading"]` → `#async-done` |
| HTTP 错误 | `#request-failure` | 真实本地 HTTP 404 → `#async-error` |
| 取消/超时 | `#request-cancel`、`#request-timeout` | `data-state="cancelled"` 或 `"timeout"`，无迟到的成功结果 |
| 老版任务 | `#name`、`#submit`、`#done` | 填写姓名后出现“已提交：…” |
| 现代 Locator | `#keyword`、`#search-submit`、`#search-status`、`#results` | 搜索按钮重建且等待后结果正确 |
| HTTP 通道 | `#api-url`、`#api-channel`、`#api-method`、`#api-send`、`#api-status`、`#api-http-status` | 默认公网 `https://httpbingo.org/get?source=opendesk` + SDK `axiosx`；网页 Fetch 仅为显式对照，未安装 SDK 不回退 Fetch |

- **第 03 组异步 DOM 场景**：成功场景读取同源 `./request-sample.json`，错误场景访问固定不存在的路径。这是页面回归测试的可重复本地 Fixture，不是独立浏览器扩展的 API 前置条件。
- **延迟为客户端可控等待**（300ms、1.2s、3s），不是服务器真实变慢。超时按钮使用 700ms 客户端期限；所有异步结果均由实际 DOM 表达，不依赖伪造测试 PASS。
- 取消、新请求覆盖旧请求、重置均通过 `AbortController` 清理；不能出现已取消请求稍后将旧成功写回页面。
- 旧版任务包不自动清空 `#name`（它的 `page.type` 是追加输入）。重跑前可以点击顶部“重置页面”或刷新。
- 通过 `file://` 打开时真实同源 `fetch` 不受支持，必须使用上述本地 HTTP 地址。扩展侧 RunHost、权限和原生回执需要在真实 Chrome 单独验收。

定向静态/兼容契约检查：`node --test tests/environment/basic-browser-page.test.mjs`。

## R7.2 HTTP 通道与独立 Worker

第 06 组保留 `#api-*` 元素，**默认选中 OpenDesk SDK axiosx + 第三方 HTTPS GET `https://httpbingo.org/get?source=opendesk`**，而不是原生网页 Fetch 或本地 HTML。网页 Fetch 只作为用户显式切换的对照。第三方示例同时包含 GET、POST、429、500、延迟；选择 POST 预设会自动切换 HTTP Method。页面打开、选择示例、切换选项和重置都不会发送请求；只有点击「发送」才真正访问目标 URL。URL 解析为绝对 HTTP(S) 地址，POST 正文必须是 JSON；响应最多展示 4096 UTF-8 字节，以文本显示，headers 单独展示。网络驱动不携带 Cookie；第三方可观察请求和来源公网 IP。

先用 Python 静态服务检查 `/request-sample.json` 200 JSON、`/demo-form.html` 200 HTML 和缺失文件 404。需要 POST、真实延迟和精确状态码时，用本目录无依赖辅助服务替换同端口的自有 Python 服务：

```sh
node examples/tasks/http-test-server.mjs 43111
```

辅助路由：`POST /__test__/echo`、`GET /__test__/status?code=429` 或 `500`、`GET /__test__/delay?ms=1200`、`GET /__test__/text`。Python 不提供这些动态路由。

**SDK 自动安装（无需逐页批准）**：启用扩展后，固定 ISOLATED relay 和 MAIN SDK 自动进入允许访问的 HTTP(S) 文档。打开或刷新 `http://127.0.0.1:43111/demo-form.html`，无需手工选 document、勾选 network 或批准安装。用户**只有点击「发送」才会发出 HTTP**；默认 `https://httpbingo.org` 和 `https://api.ipify.org` 是本地实验页的精确预设目标。普通网站的默认 SDK 网络范围只有自身同源，不自动获得任意跨域、Cookie、存储或通知权限；额外权限仍由可信扩展侧明确管理。更新已加载的扩展后，需要刷新旧网页以重新加载固定脚本。

Fetch 的取消使用 AbortController。SDK 公共 facade 没有此页面所用的 AbortSignal 接口，因此 SDK 通道禁用取消按钮。更改输入或重置仅让旧响应失去显示资格，不宣称底层 SDK 请求已停止。

跨源测试用另一端口的同一辅助服务。服务不提供 Access-Control-Allow-Origin；普通网页 Fetch 应因 CORS 失败，未批准 SDK 应拒绝。SDK 额外目标 Origin 必须在精确批准快照中明确列出。固定的自动网络范围会在 Worker 重启后依据真实 document 和当前权限自动重建，无需重新批准。主动撤权、站点访问权限被移除或旧请求 ID 仍阻止恢复或重放；超出默认范围的额外授权不会自动恢复。

`http-fetch-draft.js` 用正式 Page API 驱动同一 DOM 表单；`worker-http-draft.js` 在 Sidebar 草稿 Runtime 内使用注入的 axiosx，与网页 MAIN SDK 的授权身份独立。原表单和现代搜索的 ID、签名任务包不变。

```sh
node --test tests/environment/basic-browser-page.test.mjs tests/environment/basic-browser-axiosx.test.mjs tests/environment/basic-browser-http.test.mjs
node --test tests/framework/k4-sdk.test.mjs tests/framework/k2-sdk-cross-origin-broker.test.mjs tests/framework/k4-network.test.mjs tests/framework/k3-context.test.mjs
```

本分支保留独立 CFT 的网页 SDK 与 Worker 真实证据；正式关闭情况见 `docs/framework/workstreams/r72-axiosx-01a11c27.json`。组件测试、浏览器 HTTP、原生持久回执分别记账；尚未完成的原生 Page API、撤权、390px 及最终 PR20 候选验收均为 `NOT_TESTED`，不将本分支回执冒充 PR20 最终 PASS。

## R6.2 Agent → Task：两个草稿，一个未验证 Candidate

新增两个可复用阶段样本，**无需更改**本页面、R6 Sidebar 三页签或已有旧版 Task 包：

- `agent-observe-draft.js`：只读 `page.observe({root:'#search-form'})`；可由 Sidebar「开发」直接运行，也可由现有 Native Agent `run.start` 以 `source.kind='draft'` 执行。返回有限的语义观察结果，**不会**自动点击、申请权限或发布任务。观察文本均按不可信页面内容处理。
- `modern-search-draft.js`：既有的 Label/Role Locator 表单自动化；真实 Chrome 运行需使用同一 RunHost、正确网站 grant 和当前 `documentId`，并记录唯一提交效果及 Durable Result。
- `modern-search.v1.opendesk-task.json`：使用上面**完整相同** `modern-search-draft.js` 执行源码字节和 SHA-256 的 Task v1 **Candidate**。在完整任务目录「导入」后必须仍为待验证；只有同源码、同 origin 的真实 `runId/resultId`、原生页面效果回执和 released Worker 才能 Verified → Available → 明确安装。不能把只读观察运行当作这项验证。
- `tests/environment/agent-to-task-fixtures.test.mjs`：验证观察草稿可独立执行但无页面操作，以及现代 Task 包哈希确实对应现有 JS；**仅组件层证据**。

本地端到端的顺序：打开本 HTTP 页面并取得权限 → 运行只读观察 → 编写/试运行现代 JS → 检查真实原生页面与持久结果 → 保存不可变版本 → 在完整目录导入 Candidate 并人工核对 → 用户设为 Available、安装 → 关闭 Codex/Native 再由 Sidebar「我的任务」重复运行。完整协议、安全与失败边界以 [Agent → Task R1 唯一合同](../../docs/architecture/browser-framework/agent-to-task-contract-r1.zh-CN.md) 为准；Native 原生验收前不得声明整个流程 PASS。

**并行候选说明：** 主干的 `agent-modern-search.v1.opendesk-task.json` 与 Native 候选的 `modern-search.v1.opendesk-task.json` 为不同 Task ID 的待验证包；均不得自动设为 Available/Installed。网页 Fetch、网页 SDK `axiosx` 和 Worker `axiosx` 的浏览器网络效果必须分别验收。

## R8 Browser Test Lab：七组场景，同一个人工入口

当前 `demo-form.html` 已增强为轻量 **Browser Test Lab**，通过单页导航显示 01–06 原有场景及 **07 Locator 专项验收**。仍然是普通 HTML 页面，不是独立测试管理平台，也不要求额外构建产物或外部依赖。启动与访问 URL 完全不变。

新场景提供四项可观察 Fixture：

| 能力 | 控件或观察位置 | 预期 |
| --- | --- | --- |
| 同名元素 | `#locator-confirm-a` / `#locator-confirm-b` | 精确名称匹配返回 2 个；按 testid 只点击对应分区，结果写入 `#locator-duplicate-result` |
| 禁用与只读 | `#locator-disabled-button` / `#locator-aria-disabled` / `#locator-readonly-field` | 禁用按钮不得被自动化提交；readonly 不允许 fill 覆盖 |
| 遮挡 | `#locator-covered-target` / `#locator-cover-toggle` / `#locator-cover-count` | 默认有覆盖层、解除后点击数真实增加 |
| 延迟 DOM | `#locator-late-launch` / 动态 `[data-testid="locator-late-target"]` | 点击后约 700 毫秒生成目标；重置或再次启动取消旧定时任务 |

第 07 组包含可以复制到 Sidebar「开发」的现代 `async function main()` 草稿。**页面仅表现可观察 DOM 事实**，不能代替 Sidebar → RunHost → 原生 Chrome → Controller Durable Result 的真实操作与身份回执。新测试回归与旧契约共同执行：

```sh
node --test tests/environment/basic-browser-page.test.mjs
```

完整的合并策略、场景矩阵、失败用例和独立专家质量评分门槛参阅 [Browser Test Lab R8 规格](../../docs/framework/browser-test-lab-r8.zh-CN.md)。

**历史临时入口**：`locator-acceptance.html` 与本机 64687 端口的 `/next` 均不属于当前仓库 `main` 受管理的人工测试页面。它们可能由本地专项运行器或遗留开发服务器提供。禁止将它们当成标准测试首页，也不要未确认调用者便删除资源；具体排查步骤见 [Browser Test Lab R8 规格](../../docs/framework/browser-test-lab-r8.zh-CN.md)。
