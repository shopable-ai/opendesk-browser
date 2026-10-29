# scrapyjs P0 页面接口升级记录

2026-10-30（北京时间，续接 2026-10-29）。**本轮核心升级闭环已完成**：App 1.6.1 / Task 0.4.0 在原 CFT 149 通过安装、动态三页采集、JSON/CSV 下载、保存配置重开复跑、Stop 与四类下一页拒绝检查；已有 CSDN 配置取得 9 条真实记录。正式包晋升、production、AI 配置生成与全量验收不在本轮完成范围。

当前环境为持续开发：Chrome 实际加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，侧栏实读开发服务已连接，构建指纹 `2913e20b31e8b8c3d9872611db0d79f30b09b40b6b3e01da89335a34155dc44c`。使用已有 watcher，没有重建或替换整个扩展。

## 已修复的用户行为

| 行为 | 当前实现及证据 |
| --- | --- |
| 分页不会漏掉晚到的第二批 | 现代路径通过唯一 Locator 读取 href，经原 `page.goto()` 授权交接，确认新文档后等待配置的完整页标记。取消现代路径的 300ms 静止判定。两批之间相隔 750ms 的 fixture 保留 B、C 两条；来源模块、固定 Task 的真实 Chromium 组件及实际安装 App 均取得完整结果。 |
| 明确空末页正常结束 | `.page-ready` 可存在于零记录文档；下一页控件不存在时结束为 `site_exhausted`。测试结果 A/第一页、B/首批、C/第二批，三页，最后一页零条。 |
| 不猜测异步分页已完成 | 无 href、同文档锚点、显式现代 click 模式或缺少完成标记时返回 `NOT_SUPPORTED`。不点击按钮后猜测结果。完整页标记必须由配置者选择为真正完成信号，首条记录出现不代表整页完成。 |
| 多个下一页控件不会取第一项 | 核心现代路径检查基数，并在读取 href 时保留真实 Locator 的严格重定位。适配层保留原来源限制，直接 goto 也不能绕过允许的三个 origin。相对链接按 `document.baseURI` 解析。 |
| 字段规则继续正确抽取 | `h1::text`、`a::href`、one/many、嵌套和空值仍由原 ItemLoader 处理；不作为 Locator CSS。中文、冒号、特殊属性、重复文本容器的独立黄金通过。Scheduler、Request/callback/Item、`start() → Array`、详情 URL/ID 关联和 page_limit 状态保留。 |
| focus 后替换输入框不会误报成功 | 已复现通用 Page/Locator 的同步 focus 处理器替换/禁用目标后仍写旧节点的问题。平台最小修复在 focus 后重查节点身份及可操作性；失效返回已发生 focus、未达到状态，不写旧节点、不自动重放。替换、disabled、hidden、readonly、inert、遮挡六个场景先失败后通过。真实 Chrome 的专项 focus 行为仍为 NOT_TESTED，分页成功不能替代该项证据。 |

公开配置首选 `pageConfig`；旧 `puppeteerConfig` 仍可读，`pageConfig` 同名字段优先。无 `locator` 的旧页面消费者保留历史路径，其稳定窗口不具有现代完成保证。没有替换原引擎、安装器、Host、Authority 或字段 DSL。

现代路径用 `performance.timeOrigin` 的改变保守确认新文档；不可读、非数值或相同则拒绝支持，不以 URL 变化替代新文档。禁用态检查仍是瞬时快照，不承诺页面修改期间的原子性。

## 来源与候选身份

| 对象 | 本轮身份与状态 |
| --- | --- |
| 上游核心 | `/Users/shopme/Documents/workspace/scrapyJs`，实际主分支 `master`；改动位于 `ChromeSpider.js`、`ChromeDownloaderMiddleware.js` 及测试/文档。 |
| SDK | 1.0.0 / protocol 1.0；sourceHash `4aab93d0bfa384bcc7a6502318cd365ecbab6f15c6cd3620f5c7d63bb83c5daf`；SDK SHA-256 `eeb549541b8d8434d393d1beba869af94fb8680042a8e434b2f86d9ec65cc13e`。 |
| 旧扩展消费者 | `scrapyJsChrome` 的 `main`；经原 `sdk-sync.cjs build → check → apply → check` 更新，最终 `current`。未手改 SDK。apply 备份为 `.sdk-backups/1793288288408-f0ead922-c71f-44c2-be2e-abf4176c7855`。 |
| OpenDesk 引擎 | 原完整 SDK、原构建回执及全部 39 个 `src/` 快照另行绑定；原 export-only 包装器保留所有模块。包装后 SHA-256 `9258082089d4b83441004e601adb748eeda37d5e237350e44fc5b30715ad87b3`。 |
| 固定 Task | `scrapyjs.capture` **0.4.0**；sourceHash `94313223c8fd3ea37d5cc89d0027c6e7446fc60f4393310aab04dc588db2b08e`；manifestHash `b0a7b212f244e16de772e54724f1e039a3c7d2d238b9443031a6f37a61af0e95`。`controller/scrapyjs.opendesk-task.json` 经原入口导入；同字节草稿成功运行后，核对持久结果与页面原生回执，再设为本地可用并安装。 |
| 当前 App | **1.6.1**；原打包器从 watcher 已准备的当前源码生成 `artifacts/scrapyjs/playwright-upgrade-20261029/continuation-20261030/candidate.opendesk-tool.json`；79,637 字节，SHA-256 `7cf0f59d500a0d755389d3310f89b0b0b5e0128164a5dabe41392bc3e310d826`。通过原审阅界面更新，详情读回版本和 SHA 一致，精确委派 Task 0.4.0；原有配置保留。 |
| 历史独立快照 | App 1.6.0，SHA-256 `44086092509ab8e49edb6c1b76641ccce1fdee447cd748455c85c060f0bcd26d`，保留在原 artifacts 目录；未用于安装。同版本另一候选已被 UI owner 安装，因此由其将源码版本递增至 1.6.1 后才继续；没有同版本替换不同字节。 |
| 正式 App | 唯一正式 JSON 仍为 1.3.1，本轮未晋升。新 Task 不会静默改写已安装旧 Revision。 |

历史独立快照使用 `artifacts/.../app-source`，当前 1.6.1 则复用工具现有 watcher 的准备结果和原打包器；本轮没有第二个输出 writer。当前包包含并行 UI/AI 源码，AI 生成行为仍归其 owner，未在本轮验证。

## 已执行的最小验证

- 核心页面测试 15 项通过（含独立复核发现并修复的旧 XPath 就绪回归），包含完整页等待、空页、baseURI、无文档转场、严格基数和明确拒绝路径。
- OpenDesk 引擎、适配、字段/详情/页数限制组件 19 项通过；新增来源完整性断言后，引擎定向 5 项再次通过。
- 分页 DOM/VM 测试 7 项通过，覆盖源码与固定 Task、第二批晚到、空末页，以及按钮/锚点/重复控件零导航拒绝。
- 平台 focus 六种变更及三项既有提交/回执保护通过。运行的是原模块与模拟 Chrome 回调，不能替代原生保护验证。
- 最终 SDK/Task 的引擎、配置及分页组件 17 项重新通过；旧 XPath 不再进入 CSS-only 下载前等待，旧请求级行为保留。
- 旧扩展协议 42/42、更新后的完整 SDK 消费合同 20/20 通过；均为组件证据。
- 原程序编译器生成 Task，规范校验器验证 Task；原 App 打包器验证独立快照，精确委派与规范字节重建一致。
- 续接先修复实际入口的 404：在现有标准测试服务器下建立临时 fixture 映射，四个测试文档 HTTP 200 且与源码逐字节相同；未重启服务器。
- 独立 CFT 149 组件检查 10/10：源码和固定 Task 各执行完整分页、无 href、锚点、重复控件、权限外 origin 五种场景；完整分页记录真实三文档 timeOrigin、晚到第二批和空末页，负向场景测得零点击、零后续导航请求。首次失败来自 Playwright 与公开 Page 的 evaluate 参数差异，仅修测试适配器；原失败日志保留。
- 本机真实安装、两次 App 分页运行、下载、Stop、四类拒绝及 CSDN 正常采集见下表；这些原生证据独立于 headless 组件报告。

命令、输入哈希、运行版本、结果和限制见 [证据索引](evidence/playwright-upgrade-20261029.json)。本机原始日志在 `artifacts/scrapyjs/playwright-upgrade-20261029/`。没有重复整仓构建或无关回归。

## 本机核心操作结果

前次观察中 CFT 被并行 UI owner 占用，因此当时没有抢占。续接只读确认其运行已因模型容量错误结束后，按既有 Profile 管理脚本释放过期 UI lease、取得本轮 UI lease。CFT 的 `chrome://version` 实读可执行文件 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing`、版本 149.0.7827.55 和默认 Profile；`chrome://extensions` 详情实读上述 ID 和仓库加载路径。未改网站权限、Native 配对或用户脚本设置。收尾已释放本轮 UI lease，所有既有 watcher/服务器保留。

| 操作 | 本轮真实结果 |
| --- | --- |
| Task 同字节验证与升级 | 草稿 Run `bffbb7b7-b910-49f0-88cb-a0bc9510163c`，匹配 sourceHash，完成并释放。任务目录核对本机持久结果和页面回执后，0.4.0 经 verified → available → installed，原 0.3.0 保留为历史可用版本。 |
| App 动态分页 | Run `b873eff0-a44b-4f95-bd61-039b84e7c4ee` / Result `c711aa31-680b-4148-8874-c39ad3fd3736`；A/第一页、B/首批、C/第二批，3 页，`completed` / `site_exhausted` / `released`。 |
| JSON / CSV | Chrome 下载列表确认完成；读取完整下载文件，与独立预期三条逐项一致。JSON 的 durableResult 绑定 `task:scrapyjs.capture:0.4.0`、同 sourceHash 与原 Run/Result。 |
| 保存后关闭重开、不调用 AI 复跑 | 配置「分页完成验证 0.4」恢复；新 Run `aea9a8fe-549c-46c5-9613-8a5c093e2cd5` / Result `b340e984-c123-483e-b676-540f87b7117e`，同三条、3 页、`site_exhausted`、完成并释放。 |
| Stop 原实例 | Run `0817871b-4c90-467f-8771-e822fa721152` / Result `44ecb888-e0a2-49c8-822a-2005b342329d`，等待不存在的完成标记期间点击 Stop；已受理，原 ID `stopped` / `released`。 |
| 四类下一页拒绝 | 无 href、同文档锚点、重复控件、权限外 origin 各执行一次；均 `failed` / `released`，测试页 URL 未离开、可见点击计数为 0。完整身份在证据索引。原生 AX 的错误正文被截短，因此精确错误码仅由独立 Chromium 测试证明；原生可见终态也不冒充网络抓包。 |
| 实际 CSDN 已有配置 | Run `03151e11-7433-476c-bf59-6160a101f6df` / Result `9e7c2f24-2cfa-4d56-8c9b-bc53d2fefc47`；9 条、7 字段、单页 `completed` / `released`，完整 JSON 下载读回。它不证明该站的分页配置。 |

首次 Stop 尝试 Run `8e19e1b3-a54b-4610-9924-c3f27e961ef9` 在未显示停止受理前已成为 `failed` / `released`；错误全文未展开，保留为初次观察，不算 Stop PASS，也不据此修改产品。随后新的有意 fixture 运行在运行期间及时 Stop，取得上表成功结果。没有重放未知效果。

当前核心流程已完成，未自动进入后续阶段。AI 配置生成、平台 focus 的原生专项、Node 分发产物、P1 可视选择、production、唯一正式 App 晋升与全量生命周期仍为 `NOT_TESTED`。旧 0.3.0 的豆瓣/下载/Stop 证据不推广到新版。

## 分支与并行保护

按用户最新澄清，有 `main` 使用 `main`，无 `main` 使用实际主分支。核心的开发分支已快进合入 `master` 并删除；旧扩展开发分支已快进合入 `main` 并删除，脏改动保留。`codex/wxt-baseline-20261003` 含独有未合并提交，安全删除被 Git 拒绝后保留，未强删或扩大合并范围。OpenDesk 全程留在 `main`；未创建分支、worktree、PR，未提交或推送。
