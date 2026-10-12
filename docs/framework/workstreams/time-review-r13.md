# Time Review R1.3 · Canvas V3 单行时间线

日期：2026-10-12。目标仓库：shopable-ai/opendesk-browser，正式主分支 main。

## 仓库和执行环境

本轮最初通过 GitHub 连接核查远端 main=61715bd8fc6cf56542af90fc2a135d69ac2c7bcf，初始实现经 Draft PR #70 已合入 main。无法访问用户 Mac 工作目录的 staged/unstaged 差异；后续测试/文档差异用独立 PR 保护并行源码，不能据此宣称个人本地完成。

## 已编写的改造

    工具 UI：Canvas V3 紧凑卡片、单行时间带、分类编辑、所选日期和七天排行
    视觉：保持 V3 分类颜色与卡片结构，避免沙箱 CSS 污染其他工具
    数据模型：兼容旧 v1 日汇总，新增域名六分类、未来分钟采集同意、按日分钟桶
    安全：仍复用固定 time.review 服务的包身份、安装代际和 documentId 验证
    隐私：默认无分钟明细；只记录域名、日期、分钟、毫秒；关闭会清除分钟数据
    测试：新增 R1.3 Node 单元测试；已有 R1.2 用例保留

## 已获得且绑定候选的验证证据

- **PR #70 已合并 main**（候选 `07b2fab0c650a7111b64f4e91916bbce97a63c84`）。Time Review 专项 [Actions 38158863298](https://github.com/shopable-ai/opendesk-browser/actions/runs/38158863298) 通过：R1.2/R1.3/R5.1 Node **51/51**；`npm run check`；工具包构建与 SHA/能力验证；WXT Production/Development 构建、`npm run verify`。生成 Time Review v1.3.0 工具包为 **35,131 B**，SHA-256 `355449b333c84f7cca2cee823754d25686c9cd1783af2dc4b1c6a5e0cb7e1f88`。
- 相同候选的生产 MV3 包 packageHash：`234747d2075085f75feef6680ca963dddac22c25156b54e8b585f8f32275a482`（74 assets），开发包 packageHash：`716b5e2b044971dd0c6956909ad240ff63911376ee51779fbff6e5deab2cb04b`（105 assets）。共享 `ui/tool-shell.js` 404,529 B 超过 327,680 B 软件提醒线，但低于既有 524,288 B 硬限；预算未放宽。
- [同候选 Chromium 真实源码渲染](https://github.com/shopable-ai/opendesk-browser/actions/runs/38158863298)（测试数据夹具，并非真实已安装 Side Panel）：320/360/400/600px 没有水平溢出，Canvas 键盘/鼠标/触摸选择了真实坐标 1/540/600；DPR=2 背板符合 Canvas CSS 像素。原始 Artifact `time-review-r13-chromium-fixture-NOT_NATIVE` ID `11708703700`。**旧截图由于 CI 缺中文字体出现方框，不能宣称已验证视觉可读性，新增 Noto CJK 后须重测。DPR2 也不是 Chrome 浏览器真正 200% 缩放。**
- 同候选官方 Side Panel 回归与构建预算工作流 PASS；独立 `Local directory MCP real Chrome` 的 Sidebar Controller `runId` 超时为 **FAIL**，且不能被 Time Review 的通过项抵消。
- Time Review R1.3 **真实 Mac Chrome 已安装/权限/下载/整浏览器重启/卸载：NOT_TESTED**（当前旧候选），不能把 Chromium 夹具当作原生验收。新增 Mac 专项 `time-review-r13-native.yml` 在独立 macOS-15 CFT、独立 profile 下测试实装、SIDE_PANEL、受信任分钟采集选择及撤回、Chrome 实际 JSON 下载；新候选该项须以匹配 SHA 和 Artifact 验收，CI 未完成前仍为 NOT_TESTED。开始/暂停/实际追踪、浏览器重启和卸载未被新最小原生测试宣称覆盖。
- 用户本机 `/Users/shopme/Documents/workspace/opendesk-browser` 工作区的 `git status --short --branch`、实际安装的个人 Chrome Profile：NOT_TESTED。此处不能访问用户 Mac；只写入受保护的远端隔离候选与 PR，需独立本地核验工作区后集成。

## 证据复用与风险

旧 R1.2 工作流 docs/framework/workstreams/time-review-r12-01a12b0d.md 的组件和 candidate2 原生结果都是历史候选证据。R1.3 修改了服务与 UI 输入，旧 PASS 不自动等于新候选 PASS。PR #68 已合并到 main。R1.3 随后按受信任详情按钮模式增量修改 host-controls.js 和 src/ui/sidebar-tools.js：沙箱请求 time.start/time.clear/time.minuteConsent 只打开详情并被拒绝直接执行，只有受信任主界面真实 click 可向可信后台转发；分钟明细关闭和全部清空采用宿主页面内确认，无 JavaScript 弹窗。合入时仍须检查共享文件最新差异归属。

## 最短补验流程

    1. 在 Mac 工作区检查 git status --short --branch 和所有并行修改；审阅候选差异
    2. node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-host-controls-r51.test.mjs tests/environment/time-review-r13*.test.mjs
    3. npm run build:sidebar-tool -- examples/sidebar-tools/time-review，核对真实包尺寸、SHA、capabilities
    4. npm run check，npm run build，npm run build:dev，npm run verify
    5. 隔离 Chrome Profile 完成授权、开始/暂停/恢复、分钟/分类持久化、切换日期、撤权和下载落盘
    6. Chromium/Playwright 对 320/360/400/600px + 200% 缩放测试并截图，保存绑定 packageHash 的原始证据
    7. 核对已合并 PR #68 及本轮新增分钟受信任同意，不得恢复 JS confirm 或绕过用户手势
    8. 只有以上证据齐全后，才能给各项质量真实评分并决定是否达到 95+。

受限 V8 的 9 项模型断言属于早期临时烟雾测试；现在以带 SHA 的真实 Node 51/51 与包构建证据为准。旧 R1.2 结果不提升为 R1.3 原生结果。

## Mac CI 首次故障与修复（2026-10-12）

- GitHub Actions 运行 [38203749966](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203749966) 的 macOS-15 CFT 155 安装、Node 回归和 Production 构建/verify 已通过，但原生测试在准备阶段 **FAIL**：工作流 YAML 中 `CHROME_BIN` 多了一个字面值反斜杠，路径变成 `\\/Users/runner/...`，未启动 Chrome；此日志不是应用功能失败或 Mac Chrome PASS。
- 后续候选删除了 YAML 误加的反斜杠，仍保留先前失败历史。只有下一个同候选 Actions 的原生实装、授权和下载回执成功，才提升对应子项为 PASS。

- Mac Actions 第二次运行 [38203931569](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203931569) 的 CFT 155 已真正启动，并通过可信 `Input.dispatchMouseEvent` 打开真正的 `SIDE_PANEL`（`chrome.runtime.getContexts` 返回原生上下文）。随后出现 **FAIL**：测试驱动仍点击已删除的 `#sidebar-tool-discover-tab`，而当前生产 UI 已改用紧凑 `#sidebar-tool-discover-toggle`（该按钮位于 `src/ui/tool.html`）。属于测试选择器陈旧，尚未执行官方 Time Review 安装；保留原始失败回执 `time-review-r13-actual-macos-chrome-...`，不提升安装/授权/下载状态。
- 新候选改用主分支存在的“添加工具”真实按钮，并等待 `#sidebar-tool-discover-panel` 可见。后续 Mac CI 需重新运行，不能将第二次 PARTIAL 视为完整 PASS。

- Mac Actions 第三次运行 [38204197416](https://github.com/shopable-ai/opendesk-browser/actions/runs/38204197416) **已通过真正的官方 Catalog 安装并从存储读回版本 1.3.0**，且先前真正 SIDE_PANEL 上下文已通过。随后在沙箱页面 `#minute-canvas` 刚挂载时即断言四张分类卡片，异步 `time.status` 尚未回传，得到 `0 !== 4`，此为测试读取时序错误，**不等于分类数据缺失**。新增对四张分类卡片、额外两类及状态加载完成的显式等待；失败时保留真实 side/iframe 截图。权限、导出、重启仍 NOT_TESTED，等待下一次运行核实。

## R1.3 Mac 下载诊断与主分支收敛（2026-10-12）

- Actions [38204821069](https://github.com/shopable-ai/opendesk-browser/actions/runs/38204821069) 的真实 macOS Chrome 155，在正式扩展下完成官方安装/受信任 Side Panel/Canvas 六分类和分钟明细开启、取消关闭、确认删除。原生记录为 `install=PASS`、`realSidePanel=PASS`、`minuteConsent=PASS`，归属于其记录的候选和包哈希，不是用户个人 Mac Profile 验收。
- 该次运行尝试 JSON 导出时，界面提示“已请求下载”，但测试只轮询固定的 `<isolated profile>/owned-downloads/time-review.json`，30 秒无文件，故实际文件落盘 **NOT_TESTED / FAILED_TO_CONFIRM**；不能从下载请求回执推断成功，也不能因其他 PASS 消除该失败。原生证据包括 `native-report.json`、受信任设置截图和最终失败截图。
- 后续只在 `main` 修改测试和工作流。新增 Chrome `downloads.search()` 只读观察：先验证新 downloadId，再判断 `complete/interrupted`，核对实际 `filename`、是否位于专属 Profile 文件夹和真正的 JSON 磁盘字节。失败记录只包含状态、文件基名及是否落入本次隔离路径，不读取/复制任何用户下载目录。生产下载代码暂不更改；取得 interrupted 错误码或实际路径证据后再决定是否需要修复。
- 真实网站开始/暂停/恢复、浏览器及 SW 重启、分类持久化、撤权卸载和真正 Chrome 200% 缩放仍 `NOT_TESTED`，各项另列证据。新增 main-only 原生定向 CI `push` 入口，以后本模块测试改动可在主分支进行，不创建 PR 或额外分支。用户 Mac 本机工作区状态此会话不可检查。

- [Actions 38206716855](https://github.com/shopable-ai/opendesk-browser/actions/runs/38206716855) 的 main 版原生下载诊断表明：`chrome.downloads.search()` 在隔离 Profile 内得到新记录 `id=1`、`state=complete`、`error=null`、`bytesReceived=241`，实际保存路径也属于本轮专属文件夹，但文件基名为 `download`，并非请求的 `time-review.json`。这证明实际磁盘下载**已发生**，同时原始格式/文件名约定**未满足**。测试保持 FAIL，不凭受理回执虚报 JSON 导出全部成功。
- 按最小修复对 JSON/CSV 增加精确媒体类型和 `name=...` 参数，并继续显式设置 `downloads.download.filename`；保留 `saveAs:false` 避免额外浏览器弹窗，`conflictAction:'uniquify'` 避免覆盖旧文件。新增 Node 固定接口回归，仍要求原生文件名和真实 JSON 内容双验证；这项更改经主分支定向 Mac CI 后才可判断是否成功。

## 主分支 Mac 导出回归与下一步（2026-10-12）

- 仅对 `main` 的两个提交开展定向修复，不创建额外开发分支：`ba9f29a5bf85f310357fedb66fab2074b571ecee` 加强原生下载观测，`c03f1ccd39f59352d862cae2cd263fc95c10322a` 调整导出 MIME / `name` 参数并补 R1.2 请求格式断言。
- 同一候选 [Actions 38206716855](https://github.com/shopable-ai/opendesk-browser/actions/runs/38206716855)：真实 Chrome 下载 ID=1，`state=complete`，`error=null`，241 字节真正写入被 CI 独占的临时目录，但 basename 为 `download`，**预期文件名 time-review.json 未满足；本轮不能声称完整导出 PASS**。
- MIME/名称参数调整后 [Actions 38207101247](https://github.com/shopable-ai/opendesk-browser/actions/runs/38207101247)：真实 Chrome 155 仍为 `state=complete`、`error=null`、241 字节和正确的隔离目录，文件名变为 `download.json`，而非 `time-review.json`。因此仅可声明落盘 PASS、Chrome 正确命名 **FAIL**；本轮没有读回并断言真实 JSON 字节内容，继续 `NOT_TESTED`。保留原始失败及 Artifacts。
- 后续严格流程：先修改原生观察器，让其在受控 Profile 内读回实际文件并校验 `opendesk.time-review.export.v1` / minuteConsent / 分类数据，命名仍单独作为失败；再审计 Chrome 155 是否忽略 `chrome.downloads.download().filename`。若确需 `downloads.onDeterminingFilename` 覆盖，必须避免永久安装影响**其他**工具导出命名的通用监听器，要求只有精确工具身份和精确待下载标识可以命名，补跨工具并发、SW 恢复与负向测试后再动可信后台。不能仅为使 CI 绿而将 `download.json` 当作通过。
- 下一优先级：真实网页的有效活动计时、域名分类持久化、暂停恢复/空闲/跨日/整浏览器重启、更新撤权与卸载；最后做真实 Side Panel 320/360/400/600px 和 Chrome 200% 缩放及长内容双滚动排版。未由匹配候选绑定的原生证据支撑时保持 `NOT_TESTED`；此处仍无法查看用户 Mac 本地 `git status`。

## R1.3 Final · P0 导出文件名修复候选（2026-10-12）

- 基于真实 Mac [Actions 38207101247](https://github.com/shopable-ai/opendesk-browser/actions/runs/38207101247) 明确区分：`downloadCreated=PASS`、`complete=PASS`、`ownedDisk=PASS`、`filename=FAIL (download.json)`、`content=NOT_TESTED`（历史测试先断言文件名）。历史结论不能改写成 PASS。
- 直接修改 `src/time-review/service.js` 并增加 Time Review 范围内 `src/time-review/download-naming.js`：每次 JSON/CSV 先写短期 `chrome.storage.session` 授权的随机导出令牌，然后调用原有 `chrome.downloads.download({filename,saveAs:false,conflictAction:'uniquify'})`。唯一 `onDeterminingFilename` 监听器在 SW 初始化注册，但**只有**下载记录的 `byExtensionId` 是当前扩展、数据 URL 媒体类型、固定文件名与会话令牌同时匹配才建议文件名；所有普通下载、其他扩展及其他 OpenDesk 工具均保持原始默认命名。失去会话、过期或读取失败只建议不修改，不阻塞浏览器。短期表不存网站和导出内容，最多保留 64 条。
- 增加 `tests/environment/time-review-r13-downloads.test.mjs` 覆盖作用域、并发调用的串行登记、SW 监听重载、过期、异常和其他工具隔离；更新 R1.2 参数约定；`tests/framework/time-review-r13-native.test.mjs` 逐个验收 JSON/CSV 创建/终态/独占目录/磁盘可读/内容/实际文件名，并且先做内容检测后做文件名检测；CI 绑定 SHA 上传失败证据。
- 开发与权限边界：未扩大 host permissions、无浏览器保存弹窗、仍只返回 `requested` 而非下载成功；没有改变 v1 持久化键或 `time-review` ID，也不创建新的时间数据服务。
- 验证状态：本次远端直接提交之前未在用户 Mac 运行；需等待绑定**本次提交 SHA** 的 GitHub Actions 原生 macOS Chrome 155 结果。本机真实活动时间、重启、撤权、200% 缩放维持 NOT_TESTED；组件验证以 Actions 结果为准。

- P0 首次绑定 `e4a128582b86420abe19707b6629ee751813e26f` 的 [Mac 专项 Actions 38213480341](https://github.com/shopable-ai/opendesk-browser/actions/runs/38213480341)：R1.3 组件 **41 PASS / 1 FAIL**，失败点为未知 ticket 仍需要在 `onDeterminingFilename` 回调里异步 `suggest()` 无参数，但测试错误地要求返回同步 false。修正该断言并保留实际“不更名”语义，旧 run 仍标记 FAIL；其真实 Chrome 阶段未执行。

- [Actions 38213643444](https://github.com/shopable-ai/opendesk-browser/actions/runs/38213643444)，候选 `34ad1dcdc268b141f79bd3d022e474094afb2a0e`：R1.2/R1.3 组件 53/53 PASS，真实 Mac CFT 的 JSON/CSV **创建、完成、独占文件夹、文件存在和内容解析均 PASS**，但最终文件名分别 `download.json`/`download.csv`，故 P0 原生仍 FAIL。进一步检查 native driver：此前使用 CDP `Browser.setDownloadBehavior` 介入浏览器下载决策，本次调整为**启动前配置独占 Chrome Profile 的默认下载目录**，不在下载期间通过 CDP 覆盖下载行为。需以新 SHA 的真实 run 证明是否属于测试环境干预，未通过前不得关闭 P0。
