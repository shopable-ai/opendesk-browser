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

- **诊断收敛**：[Actions 38214014564](https://github.com/shopable-ai/opendesk-browser/actions/runs/38214014564)，候选 `357fe92057729995f2d4a5c578623fff7b61c311`，原生 Mac CFT 155 JSON/CSV 的创建、完成、受控目录、真实磁盘、内容完整性、实际预期文件名 **全部 PASS**。旧 Mac 失败驱动的 `Browser.setDownloadBehavior` 在下载启动前覆盖了文件名决定；改为预先写入专用 Chrome Profile 的 `Default/Preferences` 下载目录后恢复正确。
- **最小化消除副作用（待新候选验证）**：因文件名在正常浏览器下载条件下正确，移除实验性的 `src/time-review/download-naming.js` 以及其全局下载事件处理、会话令牌表和配套测试；保留原 `downloads.download({filename,saveAs:false,conflictAction:'uniquify'})` 的生产调用，并补充并发和请求受理非完成语义测试。之前阶段记录属于历史诊断方案，并非当前产品行为。若新候选 Mac 回归通过，P0 方可正式关闭。

## R1.3 Final · P0 正式关闭、P2 产品 UI 修复候选（2026-10-12）

- [Actions 38214396278](https://github.com/shopable-ai/opendesk-browser/actions/runs/38214396278)，候选 `23cf0f845a7c0f0b68fb8573a6ef1a3c32f432a5`，原生 macOS-15 CFT155 + 当前实装包下 JSON/CSV 均达到：Chrome 创建 PASS、完成 PASS、独占磁盘路径 PASS、磁盘实际字节 PASS、格式与保存状态一致 PASS、最终文件名分别 `time-review.json`/`time-review.csv` PASS；组件测试与生产构建亦 PASS。最终源码未添加 `onDeterminingFilename`，原生 harness 不再使用 CDP `Browser.setDownloadBehavior`。
- P2 本轮直接调整现有 Time Review 沙箱 `index.html/main.js/style.css` 的四象限名称为模型的规范六分类（不变更编码），去除重复的视觉副标题，改善紧凑排版、键盘焦点保持、点击分类筛选可切换返回、避免自动刷新抹去用户的编辑控件；保留 Canvas V3 **单条 24 小时时间线**。
- 宿主 `src/ui/sidebar-tools.js` 的 iframe 尺寸上限对 `time-review` 专门设为 4000px 并覆盖 CSS 全局 1600px cap，其他工具继续维持 1600px；防止长表单及高缩放下 iframe 内滚动+宿主滚动叠加。边界仍检查受信任 frame instance、null origin、同 tool ID 与 80-4000px 合法报文。
- 新候选需通过 R1.3 Chromium 合成状态四宽度和真实 Mac Chrome Side Panel；原生真正 Chrome 200% Zoom 和浏览器重启仍独立 NOT_TESTED。用户个人 Mac 工作区未访问，未覆盖任何本地修改。

## R1.3 Final · P1 源码隐私保护与实测扩展（2026-10-12）

- `src/time-review/model.js`：载入时如果 `minuteConsent=false` 但历史 / 异常写入留有分钟明细，只保留合法日汇总，绝不向 Side Panel / JSON 导出暴露陈旧明细；下一次经验证的写入清除残留。`readReview` 不会直接修改外部传入对象。
- `tests/framework/time-review-r13-native.test.mjs`：在 P0 原生下载之后，以用户真实信任操作尝试可选 idle 授权；获准才继续真实 localhost HTTP 标签打开、有效计时、暂停、SW 真实终止/恢复与恢复记录，不向 Chrome Storage 填充模拟计时。如果 Chrome 未授权则记录 `BLOCKED`，而非编造授权 / 活动 PASS。
- `time-review-r13-native.yml`：增加使用真实 Time Review 源码、仅请求数据由 Fixture 提供的 320/360/400/600、鼠标键盘触屏与 DPR2 视觉回归；**不把 DPR=2 等同 Chrome 真正 200% 缩放**。完整 Chrome 重启、空闲阈值、跨网站导航仍待独立验证。

- [Actions 38215717554](https://github.com/shopable-ai/opendesk-browser/actions/runs/38215717554) 在 `ee6c109019d84409424c52e07812faacfe3b0cdb`：P0 JSON/CSV 与真实 Side Panel、合成状态的 Chromium 320/360/400/600/DPR2/鼠标/键盘/触摸全部 PASS；P1 **FAIL**：真实授权和 HTTP loopback tab 创建成功，但检查点 10 秒未出现。检视 `src/time-review/service.js` 发现对 `chrome.permissions.contains(origins)` 传递 `new URL(tab.url).origin+'/*'`，非标准端口产生 `http://127.0.0.1:43111/*`，这不是应传递的 Chrome host match pattern。改为明确的 scheme + hostname + /*，仍逐网站验证，不加入 broad host grants。新候选应记录 window focus、真实 idle 状态和 host grant，只能通过真实 Mac 同 SHA 数据决定是否已修复。
- P3 CI 补充正式 `npm run build:sidebar-tool -- examples/sidebar-tools/time-review`、`npm run build:dev`、`npm run verify`，输出独立工具包及 sw.js 的 SHA-256；不增加第三方库、权限、版本号和存储 key。

## R1.3 Final · P1 原生 macOS 空闲输入核验（2026-10-12）

- [Actions 38216276174](https://github.com/shopable-ai/opendesk-browser/actions/runs/38216276174)（候选 `8b00de31c7ce1304c29e793b04c3bd718d02842f`）：R1.3 组件 **54 PASS / 0 FAIL**；真实 Chrome P0 JSON/CSV 内容和命名仍 PASS；真实网页活动阶段 FAIL，原生只读证据明确 `window.focused=true`、`window.type=normal`、`localhost HTTP tab active=true`、`host permission=true`，但 `chrome.idle.queryState(60)=idle`。这证明本轮拒绝累加是空闲安全策略生效，不能解除空闲检查来令 CI 通过。
- 原生测试驱动仅在 macOS Runner 的 idle 不为 active 时调用**仓库已有** `tests/framework/time-review-native-input.swift` 系统级输入辅助程序；辅助程序校验 Chrome for Testing 的运行进程、Accessibility 权限后发送真实 macOS 鼠标移动事件。然后读取真正的 Chrome `idle.queryState`、焦点、授权和活动网站。若平台无法产生可验证真实活动，则独立记录 `beginAndActiveCollection=BLOCKED` 并保留原始 gate，而非假造 PASS、存储造数据或让原生用例错误失败；只有读回实际非零统计及暂停数据不再增长才为活动 PASS。生产 `service.js`、`model.js`、授权与隐私策略未更改。
- 仍需在允许 OS 真实输入的用户 Mac Profile/CFT 验证 P1 活动、空闲切换、跨网站、整个 Chrome 重启；Blocked 与 Pass 分级必须保留。后续 CI 绑定新 SHA 后再记录结果。

- [Actions 38216871429](https://github.com/shopable-ai/opendesk-browser/actions/runs/38216871429)，候选 `bae975a733c0325fb3ebb20dfb79ea919007b448`：macOS 原生 `time-review-native-input.swift` 已以真实 CFT PID 发出系统鼠标事件，`chrome.idle` 从 `idle` 真实回到 `active`，窗口焦点/活动 HTTP 标签/host 权限都为 true；但 10 秒内无检查点而 FAIL。现确认当时仍在宿主设置视图，沙箱界面不活动，测试没有发起新的 `time.status`，且定时 heartbeat 30 秒，上述 10 秒等待不足以证明服务错误。新候选通过真实 Side Panel「返回工具 → 刷新」按钮发起状态读取，观察实际存储检查点，随后才判定时间统计；不会通过改 storage / mock idle 等手段硬凑 PASS。

- [Actions 38217283829](https://github.com/shopable-ai/opendesk-browser/actions/runs/38217283829)（`b599c4215d9838b3eb94705d47746a8bb68040c7`）真实 CFT 已确认：系统级鼠标输入后由真正 Side Panel `time.status` 建立 HTTP 活动检查点，**真实计时 1,827ms PASS、用户暂停后不累加 PASS**；随后原生 driver 使用 browser-root `ServiceWorker.enable` 报 `-32601`，故 SW 重启为 FAIL，未继续测试恢复。与功能性真实计时缺陷不同，这一失败来自 Chrome 155 不支持 root ServiceWorker CDP 方法。新候选改为先对本次独占 Profile 中唯一真实扩展 `service_worker` target 执行 `Target.closeTarget`；不支持时尝试 Page session 的 ServiceWorker CDP 操作，并核验新旧 targetId 必须不同、业务数据不增长、仍 paused。若平台无法实际终止/替换，则仅记 `swRestart=BLOCKED`；绝不将 CDP detach 或无证据 status 读回升级为原生 SW PASS。

- [Actions 38217769635](https://github.com/shopable-ai/opendesk-browser/actions/runs/38217769635)（`2b35d1fb1a7157d62d01144ac1f84c99533d4344`）真实 Mac CFT：P0 与浏览器布局及组件均 PASS；有真实活动网站记录、用户暂停后不继续累计；通过 `Target.closeTarget` **确实终止旧 MV3 Worker 并观察到新 Target ID**，2,123ms 原始业务数据保持不变；受信任宿主恢复记录且 `paused=false` 也 PASS。原生尾部 FAIL 为测试对隐藏时保持旧状态的沙箱 iframe 直接寻找启用的暂停按钮（`actionable #pause timed out`）。新候选先返回工具，通过真实「刷新」获取当前状态，确认按钮启用后才进行最终暂停，不绕过受信任点击和沙箱状态更新。旧 CI 保留 FAIL，证据中的 SW/P1 单项 PASS 不等于旧 run 整体 PASS。

## R1.3 Final · 真正 Chrome 整进程重启与非空导出候选（2026-10-12）

- [Actions 38218213760](https://github.com/shopable-ai/opendesk-browser/actions/runs/38218213760) 在 `31db41a34addb5dfcb69f3bed3db17c1b50dcf99`：54/54 组件通过，原生 macOS CFT 155 JSON/CSV 文件名和内容、安装、权限隔离、Canvas、真实活动计时、停止计时、实际 SW target 终止/更换和宿主恢复 **全部 PASS**。未测整进程重启和非空统计实际导出。
- 本候选原生扩展测试增加：在真实有效网站活动停止后再次点击正式工具导出 JSON/CSV，读取隔离目录中 Chrome 实际产生的 **uniquify** 新文件，分别核对非空原始站点时长、完整 JSON 字段和既有 CSV 协议；随后关闭并等待原 CFT OS 进程终止，在**同一个唯一拥有的临时 Profile** 中启动新的 CFT 进程，读取扩展真实存储，验证工具安装版本、原始 days/categories/minuteDays、paused 状态无伪增长，浏览器会话 UUID 必须改变。没有向 Chrome Storage 注入数据，也没有新增数据服务或新的分支。该范围验证的是**暂停后的完整浏览器重启**，不等同活跃期间的异常关机。尚待新的 main SHA 对应 Actions。

## R1.3 Final · 动态包版本、原生测试语法与 CI 修复（2026-10-12）

- [Mac CI 38219113994](https://github.com/shopable-ai/opendesk-browser/actions/runs/38219113994) 的 `a181b0a4b7af37194e7353af4004d93a7d518447`：组件、两种 Chrome MV3 构建、四宽度合成 UI 均通过，但原生测试因非空二次下载文件名断言的字符串未闭合产生 `SyntaxError`，整个真实 Mac native **FAIL / NOT_RUN**。并行市场 R5 提交 `5d1d87431188d74a7d23900ff7477ddef3b585a4` 已修复该行，并让原生安装版号从当前工具配置/生产 catalog 读取，不应回滚并行修复。
- [Mac CI 38219728343](https://github.com/shopable-ai/opendesk-browser/actions/runs/38219728343) 在 `5d1d87431188d74a7d23900ff7477ddef3b585a4`：Time Review 真正配置版本已是 `1.3.1`，构建成功写入 `artifacts/sidebar-tools/time-review/1.3.1/...`，但 CI `shasum` 仍指向旧 `1.3.0`，故工作流在构建校验阶段失败，原生测试未运行。此为 CI 脚本候选版本硬编码，而非工具包编译失败。
- 本轮移除工作流里写死的 `1.3.0` 工具包 SHA 路径，改为读取现有 `tool.config.json` 的版本号；在任何耗时构建之前执行 `node --check tests/framework/time-review-r13-native.test.mjs`，防止语法错误到 Mac Chrome 阶段才暴露。**不改变产品版本、ID、权限、模型或数据键**。之后 GitHub Actions 的成功状态以本提交 SHA 为准。

- [Mac CI 38221941200](https://github.com/shopable-ai/opendesk-browser/actions/runs/38221941200)（`490e1232085b3be7c2ed98f9240e03eb9b627f05`）已通过 54 项组件测试、独立 1.3.1 工具构建与 SHA、生产/开发 MV3 构建/verify、原生测试语法检测和 320/360/400/600px 合成视觉。**真实 Mac Native FAIL**：官方工具完成安装并读回真实版本 `1.3.1`，原生测试第 212 行仍要求旧 `1.3.0`。本次修复唯一遗漏的固定安装版本断言，改与 `pkg.version` 比较，并继续要求构建配置、官方发布目录哈希一致。不降低真实安装验收门槛。

## R1.3 Final · 六分类与可信工具生命周期原生验收（2026-10-12）

- 当前 `1.3.1` 真实主分支候选 `f4719da31a876fc4f82b6b0658176fd2693c4a26` 已在 [Mac Actions 38222319502](https://github.com/shopable-ai/opendesk-browser/actions/runs/38222319502) 取得完整 **SUCCESS**：54/54 组件，生产/开发包、浏览器侧栏与视觉，非空真实网站 JSON/CSV 二次导出文件 `time-review (1).json`、`time-review (1).csv` 分别落盘且不覆盖，真实 Chrome 关闭原 OS PID 并以相同临时 Profile 启动新 PID，扩展版号、日统计、分钟同意、暂停与浏览器会话变更均 PASS。该候选的整进程重启是**暂停状态**，不能宣称活动期间崩溃恢复已完成。
- 本阶段继续在**真实已安装工具**的 Side Panel 完成：鼠标打开记录行分类编辑、原生键盘选择 `重要不紧急`（分类编码 2）、点击保存并读回持久分类，保证原网站时长不变、UI 显示一致，随后带分类导出与整 Chrome 重启。
- 在整个浏览器重启后通过真实扩展工具管理入口「停用 → 重新启用 → 卸载确认」测试：撤销 epoch 持久变化、历史总时长保留、重新启用不会未经用户重新开始、卸载清除 Time Review 业务记录和待清理标记，同时保留其他工具，稍后读回确保后台事件不会复活已卸载数据。仍不向 storage 注入/模拟任何时间数据。此验收不等于扩展自身的卸载（扩展卸载行为仍 NOT_TESTED）。
- 新原生覆盖需以提交本轮对应 SHA 的 Mac Actions 证实；当前仅为已写入源码的新增真实场景，未经过原生测试前不得称 PASS。Chrome 真正 200% 页面缩放、跨站有效计时与系统长期空闲仍需独立验收。

- [Mac CI 38223058106](https://github.com/shopable-ai/opendesk-browser/actions/runs/38223058106) 在 `27e9f06d74ce6bd37679cfd81a40aebddee8fae3`：Time Review 54/54 组件、独立工具和双包构建、真正原生网站计时/暂停/SW 重启此前步骤通过；原生分类编辑阶段 **FAIL**，因为 Chrome 155 macOS 原生 `<select>` 菜单不响应 OOPIF 的 CDP 箭头键命令，UI 值仍是 0 而非 2。根因是测试键盘输入作用域，不是用户分类业务数据断言失败。保留该 run FAIL，卸载/重启尾段尚未执行。
- 修复：在现有 `tests/framework/time-review-native-input.swift` 的真实本机 CFT 专用键盘输入中补 Home/Down/Up/End；它继续检查实际 PID、CFT Bundle、Accessibility 授权和前台所有权。分类测试通过**真正 macOS 系统按键**选择下拉选项并确认，绝不使用 `select.value=`、`dispatchEvent` 或直接修改 Chrome Storage 来伪造通过。后续仍须以新 SHA 的 Mac run 判定保存、持久化和工具停用/卸载是否通过。

- [Mac Actions 38223472073](https://github.com/shopable-ai/opendesk-browser/actions/runs/38223472073) 在 `651a174168a084306b02c888df3a620677fe08e2`：54/54 组件、真实活动计时、分类编码 2 的**原生 macOS 键盘选择和 UI 保存 PASS**，随后 JSON/CSV 非空分类内容与完整浏览器重启也 PASS；新增工具生命周期阶段 **FAIL**，原因是重启后仅打开 `/ui/tool.html` 的独立官方目录标签页。该页面的 `#tab-tools` 工作台导航按设计隐藏，故不能当成真正 Side Panel 点击，报 `actionable #tab-tools timed out`。本次调整测试：通过该目录页现有「打开开发侧栏」按钮执行**真正 Chrome 受信任点击**、读回 `chrome.runtime.getContexts(SIDE_PANEL)` 的文档 ID、绑定新的 Side Panel CDP target；停用/启用/卸载全部在该真正 Side Panel 中操作。不修改生产工具行为或扩大权限。新提交必须重新验收尾部操作才能算生命周期 PASS。

## R1.3 Final · Mac 原生卸载完成条件修复（2026-10-12）

- [Actions 38224127005](https://github.com/shopable-ai/opendesk-browser/actions/runs/38224127005)，候选 `80005b5e7bad2ae07f717e8620fd72f774bd8596`：54/54 组件、实际 Side Panel 重启后真实恢复、分类、非空 JSON/CSV、完整 Chrome 重启、受信任停用/重新启用及撤权 epoch 轮换均已独立观察到 PASS，但整条 Mac 测试仍 FAIL：卸载观察器中 `until(async()=>evaluate(...))` 仅凭任意 truthy 对象就返回，在安装列表尚未删除时立即断言 `timeInstalled===false`。
- 仅修改原生验收驱动：轮询直到**工具确实不存在于安装列表、Time Review 的本机记录确实删除、卸载恢复标记确实清除**三条件同时为真；失败时保存当前只读状态，不改变实际卸载服务或放宽合同。另检查其他工具仍安装且异步事件不会复活已清理记录。新候选 SHA 对应 Mac 原生测试通过前不可关闭卸载验收。

## R1.3 Final · 真正 Chrome 200% 缩放原生验收候选（2026-10-12）

- 在隔离 macOS Chrome for Testing 155 的真实 SIDE_PANEL 中，保留已有工具 Canvas V3 与原生权限、计时闭环；新增通过仓库已有 CFT PID + macOS Accessibility 可信输入辅助程序发送 **Command + Plus**，逐次读取 Chrome **实际** `devicePixelRatio` 倍率和 iframe `innerWidth`，只有约 2 倍 zoom 的真实浏览器结果才允许记 `realBrowserZoom=PASS`。不使用 CDP `Emulation.setDeviceMetricsOverride` 或把 DPR=2 夹具当作 Chrome 200% 缩放。
- 达到真实 200% 后，检查单行 Canvas 宽度不超屏、无 iframe 内水平溢出和额外内层纵向滚动，保存真正 SIDE_PANEL 截图，并通过 macOS Command+0 恢复原比例，保护同一原生验收里的权限操作。如果 CI 无法将真正 SIDE_PANEL 放大，则保留 `BLOCKED` 和原始比例数据，绝不假报 PASS；如果已确认 200% 但布局出错则验收 FAIL，需修产品 UI。
- `tests/framework/time-review-native-input.swift` 新增真正 Chrome 系统快捷键 zoom-in/zoom-out/zoom-reset，仍限已验证的专属 CFT PID 和前台拥有者，不能操作用户正在运行的个人浏览器。

## R1.3 Final · 真正网站切换与系统空闲恢复（2026-10-12）

- [Actions 38229698394](https://github.com/shopable-ai/opendesk-browser/actions/runs/38229698394)，候选 `2afc31a0e83d60f33fb94f39f7562cdc4c512de1` **SUCCESS**：macOS CFT 原生系统级 Command+Plus 5 次，Side Panel iframe CSS 349→174px、设备比 1→2，真实 Chrome **200% zoom PASS**；同包 Canvas 单行、不横向溢出、iframe 无二次内部滚动、Command+0 恢复亦 PASS。54/54 组件、真实计时、分类、非空导出、完整浏览器重启、停用启用及卸载等既有回归全部通过。
- 本新候选增补真实 HTTP(S) 计时中两个**不同 hostname**（`127.0.0.1`、`localhost`）真实浏览器标签切换，分别对两个 host 产生有来源的统计且原网站在切换后停止增长，不通过模拟 tab 事件制造业务数据。第二目标无法实际激活时仅记 `BLOCKED` 并说明原因，不得假报跨网站 PASS。
- 进一步在真实 macOS Chrome 中，**停止发送用户 OS 输入**，最多观察 73 秒以等待实际 `chrome.idle.queryState(60)=idle`。如果真的空闲，必须观测 Time Review 检查点退休，日统计在空闲期间冻结；随后使用已有验证 CFT PID 的系统级鼠标活动输入真正恢复 `chrome.idle=active`，正式 Side Panel 刷新后再次出现检查点且仅恢复后的时间增长。不能调用假的 `onStateChanged`、修改存储或绕过 Chrome idle；CI 宿主如果始终不空闲则保守标记 `BLOCKED`。真实行为的 PASS 需与本新候选 SHA 绑定。
- 多网站排序后分类编辑通过真实 DOM 的**只读行索引**定位 `127.0.0.1`，继续使用 macOS 原生系统按键和受信任按钮保存，不创建/伪造 DOM 节点，也不改写采集数据。

## R1.3 Final · macOS 自然空闲恢复计时的异步回执闭环（2026-10-12）

- [Mac Actions 38230832833](https://github.com/shopable-ai/opendesk-browser/actions/runs/38230832833)，候选 `3db3d69bd74d750d82c4b40f963e9a3ffef5d24c`：54/54 组件、官方安装、真正 Chrome 200% 缩放、JSON/CSV、两个真实网站（`127.0.0.1`、`localhost`）切换时的独立累计及旧站停止累计均原生通过。自然空闲后的恢复阶段在点击真实 Side Panel「刷新」后立即读 Storage，报 `actual post-idle activity ... must accumulate`，整体 Mac CI FAIL；该读数尚不能区分异步写入延迟与真实时钟采集问题。
- 新候选只修真实浏览器测试驱动：保持真正的 Chrome idle->active 观察、空闲统计冻结和 macOS OS 输入；必须在刷新后的 **9 秒内读回真实网站毫秒值严格增长**才 PASS。若超时，以只读 Chrome idle、checkpoint、paused、前后网站时长及错误原因形成原生故障证据并继续 FAIL。禁止伪造存储、权限/Idle 事件或把超时判为成功。产品 `src/time-review/service.js`、权限、数据模型不变。

## R1.3 Final · 独立验收状态与专家评分（2026-10-12）

### 同一输入身份与证据等级

- 历史 **macOS-15 Chrome for Testing 155 原生 SUCCESS**：[Actions 38229698394](https://github.com/shopable-ai/opendesk-browser/actions/runs/38229698394)，源码候选 \`2afc31a0e83d60f33fb94f39f7562cdc4c512de1\`。该候选 Time Review \`1.3.1\` 独立工具包 SHA-256：\`d6e5bffd17db96bea08d26d5d437061d4d92790ac921bc7b35bb04e00ee59be5\`；WXT production packageHash \`bbb9b5e5a576b47581ee6b93eb6c077b5e06f583f4a692db2944ff2fa0083f19\`，development packageHash \`809fb337624fd369e0d132e874be6c23013236b26868ae315d722d6eaffff95d\`；生产 \`sw.js\` SHA-256 \`7870796087b47fea7e4771b76ddefa443fb6c054543b52ab8b631898cc9f2fe3\`，实际报告大小约 327.13 kB（未提高预算）。
- 上述 **54/54 组件 PASS、双包 build/verify PASS、真实 CFT 官方安装/SIDE_PANEL/权限隔离/Canvas V3/真实网站计时/暂停与恢复/SW 实际重启/分类与 JSON/CSV 非空导出及文件名防覆盖/整浏览器暂停态重启/真实 200% Chrome Zoom/受信任启停及卸载清理 PASS**。200% 属于 macOS Command+Plus 实际浏览器缩放，绝不是 \`deviceScaleFactor=2\` 夹具。
- 新增双网站/自然空闲候选 \`3db3d69bd74d750d82c4b40f963e9a3ffef5d24c\` 在 [Actions 38230832833](https://github.com/shopable-ai/opendesk-browser/actions/runs/38230832833) **整体 FAIL**。其中不同 hostname 的 \`127.0.0.1\` 与 \`localhost\` 实际切换、双方分别累计且旧站冻结均有真实 Chrome PASS 日志；自然空闲恢复后的最终增长断言 FAIL，不得提升为 PASS。
- 本轮提交 \`3646789508843d45bad7fe0321adc857df6b68c5\` 把空闲恢复后的立即读改为限时轮询真实持久化正增长。对应 [Actions 38234734682](https://github.com/shopable-ai/opendesk-browser/actions/runs/38234734682) 当前为 **QUEUED / NOT_TESTED**；未产生新候选原生通过证据前，不能宣称 R1.3 Final 全部关闭。所有旧 SHA 的 PASS 都是历史候选证据，不能自动绑定当前生产包。
- 用户本人 Mac 工作目录 \`/Users/shopme/Documents/workspace/opendesk-browser\` 的 \`git status --short --branch\`、当前个人 Chrome Profile、200% 人工可读性和用户数据仍 **NOT_TESTED**；本轮只用授权 GitHub API 安全写入远端 \`main\`，没有触及用户本地文件、创建其他分支/Worktree/PR 或伪造本机测试。

### 独立评分（临时专家评估；不是认证通过）

| 维度 | 当前暂评分 | 扣分与仍需证据 |
| --- | ---: | --- |
| 功能完整性 | 92/100 | 核心计时、导出、分类、授权和卸载已原生验证；活动状态下异常浏览器关闭、更新过程及部分完整生命周期仍无同一最终包原生证据 |
| 数据准确性 | 92/100 | 跨站与跨午夜组件合同通过；本轮自然 idle→active 恢复后持久增长仍待最新原生 CI，跨夏令时的真实 OS 验收未完成 |
| 隐私与权限安全 | 94/100 | 分钟默认关闭、可信宿主点击、撤回清理与无敏感 URL 记录已有证据；Chrome idle 实际撤权与运行中包更新的独立正向路径仍待补验 |
| UI/UX | 94/100 | 320/360/400/600px 真实源码夹具与真正 Mac Chrome 200%/Canvas/iframe 滚动通过；用户个人 Mac 字体、长内容及 200% 手工体验未最终签收 |
| 性能与资源控制 | 91/100 | SW 预算未放宽、工具包有 SHA；长周期统计增长、存储上限及多日资源曲线缺少原生压力证据 |
| 稳定性与恢复 | 92/100 | 实际 SW 重启、暂停后的 Chrome 整进程重启与防重复累加 PASS；活动中异常崩溃与长期休眠后用户恢复仍需测 |
| 可维护性 | 94/100 | 复用同一 tool ID、storage key、服务和权限边界，移除了实验性全局下载监听器；共享宿主 UI 仍需跨模块集成回归 |
| 测试覆盖与证据可信度 | 92/100 | 有真正 macOS CFT、原始 SHA、磁盘内容和用户输入证据；最新 idle 用例尚无新候选 PASS，本机 Mac 不能由 CI 冒充 |

以上各项独立于目标 \`≥95\`，**未达目标不能标记整套 Final PASS**。每项后续需按真实缺口修复、运行、记录，而非调整分母或凭历史截图提分。

### 用户 Mac 本地补验入口

\`\`\`bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git status --short --branch
git rev-parse HEAD
git fetch origin main
# 有未提交或并行修改时禁止直接覆盖；先核对 remote/local 差异
node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-host-controls-r51.test.mjs
node --test tests/environment/time-review-r13.test.mjs tests/environment/time-review-r13-service.test.mjs tests/environment/time-review-r13-consent.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/time-review
npm run check && npm run build && npm run build:dev && npm run verify
\`\`\`

使用**新建且完全独占**的 Mac Chrome for Testing Profile 安装该候选 \`dist/production\`；从官方发现入口审阅安装 Time Review 1.3.1，通过受信任设置授权并开始，依次真实测试不同网站切换、持续空闲 60 秒与恢复、暂停/恢复、分类、分钟授权与撤回、两种重复下载及磁盘实际读取、Service Worker 终止、整浏览器关闭重开、用户实际 200% 浏览器缩放、停用/启用与最后的确认卸载。务必保存候选 SHA、pack packageHash、真实时间/浏览器 Profile、截图、下载 SHA、PASS/FAIL/NOT_TESTED，不对个人 Chrome Profile 执行自动清理。
