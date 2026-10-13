# Side Panel 折叠区排版统一 · 2026-10-14

## R32 续接执行范围（2026-10-14）

追加定向测试所有权：`tests/environment/workflow-focus.test.mjs`（DOM fixture 需要按 class token 匹配，保留焦点行为）、`tests/environment/developer-layout.test.mjs`（旧 174px/600 字重断言与 R29 已实施的 216px/公共 650 字重不一致）。编辑前两文件 diff 均为空。`scheduled-task-ui-r1`、`sidebar-product-contract`、`sidebar-tools-host` 已有其他负责人未提交修改，本轮不覆盖或混入提交。

- 负责人：当前 Codex R32 对话；只在 `main` 写入。起始及远端基线均为 `89c3b298dc3cf8927b227b041b101770780ce58a`。已有 Cookie / Import / Cloud 未提交改动保留，不加入本轮提交。
- 本轮写入：`src/ui/design-system.css`、`src/ui/tool-shell.css`、`src/ui/tool.html`、`src/ui/cloud-hosting.css`；根据清单对可信动态模板仅追加公共类；`tests/environment/sidebar-component-contract.test.mjs`、`scripts/tests/sidebar-r19-layout-visual.mjs`、本工作流。跨模块行为/权限合同不变；R21 最小修复另按诊断登记具体路径。
- 执行：先关闭粗指针定时表单真实溢出，保留既有回归约束；再按一级卡片/二级技术详情迁移逐Tab并删除重复外观；最后定向Node、静态Chrome、构建与原生验收。已有回归覆盖先运行，缺失场景先补测再修复。不是重新设计信息架构。
- 资源：现有 PID 67778/67794 `npm run dev` 是 `dist/development` 写入者，不另起 watcher 或 build:dev 覆盖；静态Chrome使用本任务临时 profile、系统随机端口和 `artifacts/sidebar-r32-*` 独立证据目录。真实Chrome不占用其他Cloud/Cookie验收profile。
- 当前CI日志已重新取得：R19 run 38436690386 / job 115432404797，360px coarse 的操作列34px而按钮44px，右边界359超出父349；R21 run 38436690356 / job 115432404399，156 PASS / 1 FAIL；R1 run 38436690362 / job 115432405349，319 PASS / 16 FAIL，只分析本轮影响。
- 清单核查与R21诊断由两个原生子Agent只读并行，主负责人统一落盘CSS/模板和共享Git状态。所有结果按当前相关输入哈希登记，静态证据不提升为原生PASS；未独立审阅评分保持 `NOT_SCORED`。
- 动态模板追加公共类的具体写入文件：`src/ui/task-workbench.js`、`src/ui/scheduled-task-workbench.js`、`src/ui/installed-page-tools.js`、`src/ui/cloud-hosting.js`、`src/ui/workflow/workflow-view.js`。编辑前这些文件diff为空；仅修改details的class，不改事件、授权或运行行为。静态视觉脚本由原生子Agent Hume 独占编辑，主负责人收集真实Chrome证据。
- 迁移后的测试写入补充：`tests/environment/sidebar-r21-design-system.test.mjs`、`tests/environment/task-workbench.test.mjs`、`tests/environment/workflow-ui-states.test.mjs`。后两者编辑前diff为空，仅将旧的完整class字符串断言改为原业务类与公共折叠类并存，保留原隐私、冻结源码、授权和交互断言。

## R32 实施结果与验收边界（2026-10-14）

R32 原生验收续接写入范围：`src/ui/task-workbench.js`、`src/ui/sidebar-tab-memory.js`、`tests/environment/task-workbench.test.mjs`、`tests/environment/sidebar-tab-memory.test.mjs` 与本工作流。最新用户要求正式云控 Tab；R14 历史合并导航不再覆盖该要求。当前可见 `tab-cloud` 没有 click/键盘绑定，且旧偏好强制回到 tasks。独立只读核查确认现有 Cloud 页及单一 Side Panel Hosting 仍在，没有第二份消费者；只修复页签导航/ARIA/记忆，保留 Tools veto、Run Dock 所有权、一次性授权和 pagehide 清理。修复前先读取现有 diff，相关路径没有其他未提交修改。

续接 CI 范围追加 `.github/workflows/sidebar-r21-ui-quality.yml`、`.github/workflows/sidebar-r19-layout-visual.yml`：两文件当前 diff 为空；导航与记忆修改触发既有检查，R21 运行已有页签记忆测试，R19 继续验证同候选真实静态标记，证据等级仍为 STATIC_MARKUP_CHROME。负责人为本 R32 主 Agent，不占用 watcher、Chrome profile 或其他工作流产物。

续接实施：移除 Cloud→My 的历史重定向，将现有 `workbench-cloud` 纳入唯一导航、click、方向键、ARIA 与页签记忆；没有新建 Hosting 或改变授权。新增可见 Cloud 点击/零 Run/零授权、Tools dirty-veto、记忆恢复和原任务 Stop 跨 Cloud 使用的回归。修复前 60 项测试 55 PASS / 5 FAIL（`/tmp/sidebar-r32-cloud-navigation-before.log`）；修复后云控/导航定向 91 PASS / 0 FAIL（`/tmp/sidebar-r32-cloud-navigation-final.log`），相关集成 214 PASS / 0 FAIL（`/tmp/sidebar-r32-cloud-r21-final.log`）；`npm run check` 检查 668 文件 PASS，限定 diff 检查 PASS。

续接原生观察：日常 Chrome 的实际 Side Panel `ccfcjegpkdlgbclopjmadlcjedelidmf`、`hostInstanceId=04b9e8a8-ab75-4905-8cc5-a33d8dfbba98`，测试页仍为 `127.0.0.1:43111/demo-form.html`。通过原生 Window 菜单选中测试窗口后，真实 Cloud 点击切换 ARIA selected 并显示既有云控管理内容；运行环境折叠真实点击后获得焦点。未点击配对/连接/运行，未创建消费者。该记录仅为当前增量开发产物的局部原生观察；完整宽度、Side Panel 自身 125%/200% 缩放仍 NOT_TESTED，拖拽工具出现 `native_hook_stdin_oversized`，不得提升为 95+ 或完整候选 NATIVE_PASS。

续接代码已提交并推送 [d2700659](https://github.com/shopable-ai/opendesk-browser/commit/d27006593e149964a57edb2d0db4923a04ef829d)。该 SHA 的 [R19](https://github.com/shopable-ai/opendesk-browser/actions/runs/38463647665) SUCCESS，292 个 STATIC_MARKUP_CHROME 状态通过；[R21](https://github.com/shopable-ai/opendesk-browser/actions/runs/38463647827) SUCCESS，208 项组件测试及 16 项构建包测试通过，`check/build/build:dev/verify` 全部通过。干净生产包 SHA-256 `8c0be923642df6313ae89334b66c4be2e8a0ad9ebf5cd2c947b296a537a0e6b9`，开发包 `ccc79d792b3359d48247524275e00c39a6bc75566f7d3105882d841e7e9bf386`。CI 源码检查 664 文件；本地包含并行未提交测试的 668 文件检查不与 CI 分母混算。

同 SHA [R1 P0](https://github.com/shopable-ai/opendesk-browser/actions/runs/38463647631) 仍 FAIL：语义编译 16 PASS，transport 320 PASS / 16 FAIL。保留依赖检查、Page/Controller 准备、Save/Stop 与生命周期失败；没有删除或减弱授权测试。它们不阻断本轮组件和几何专项检查，但整体产品验收仍未关闭。

Cloud 补充真实键盘验证：Left→Tools、Right→Cloud、Enter/Space 折叠详情通过，创建凭据仍禁用、授权任务数仍为 0。实际文档只读 DevTools 测量 `innerWidth/clientWidth/scrollWidth=363/363/363`、高 839、DPR 2：flat 标题 36px / 12px / 650 / padding 8px 0，两个一级标题 40px / 13px / 650 / padding 8px 12px，展开正文分别 315/315 和 339/339，无横向溢出。HTML 与三份受影响 CSS 的源码及日常 `dist/development/ui/` 字节一致。记录于 `artifacts/sidebar-r32-accepted-preserved/cloud-navigation-acceptance-d2700659.json`，不覆盖先前 receipt。原生完整 300–520 宽度和 Side Panel 自身缩放仍 NOT_TESTED，95+ 为 NOT_SCORED / NOT_ACCEPTED。

### 原生控制阻塞复核（第三连续 GOAL 回合）

当前 main `b2c0e1fa885328f986c3738f3ed4a3a8e1421d27`，本轮相关源码无未提交 diff，日常 Chrome PID 73139 及 watcher PID 25149/25173 仍存活。上轮为实质进展（Cloud 导航修复、代码/证据提交、同候选 CI 与真实几何），本轮只核验剩余控制路径。辅助功能树暴露「侧边栏大小调整手柄（可拖动）」及 Increment/Decrement；原生 Increment 没有得到尺寸变更，点击后 Left 进入页签键盘导航，未调整视口。实际扩展文档只读复测为 `innerWidth=363,height=839,clientWidth=363,scrollWidth=363,dpr=2,tab=我的`。已返回测试主窗口「我的」，未触发 Run、授权或替换日常扩展。该结果与前两回合的拖拽无尺寸变化、输入工具失败属于同一原生控制阻塞；完整宽度与 Side Panel 自身缩放仍 NOT_TESTED，等待可用的原生控制路径或独立人工矩阵证据后续接，GOAL 不宣称完成。

随后补查发现新的有效路径，取代上述“无可用控制路径”的判断：从 Side Panel 页签 Shift+Tab 经关闭、固定按钮到达原生 resize 手柄，让真实焦点落在手柄后 Left 实测 363→413，Right 收窄到 360 并钳制。GOAL 继续 active，不登记 blocked。原生测量需排除收起父 details 内的未显示内容，修正只用 boundingClientRect 宽度的观察方法；360px 开发页实际可见八个一级标题均为 40px/13px/650/padding 8px 12px，client/scrollWidth=360/360，无外层控件越界。

本 R32 Agent 原生续接资源：日常 Chrome PID 73139，现有 Side Panel/DevTools 与临时同源 `manifest.json` 只读普通 Tab。研究候选为通过 Chrome 原生 Zoom 菜单调节同源缩放并回测真正 Side Panel，不加载另一份 tool.html、不新建 Host，不改权限或运行脚本。先读取原始缩放百分比，测试后恢复；没有面板自身变化就仍标 NOT_TESTED。保留 watcher PID 25149/25173、dist 路径及扩展 ID，其他 CFT/profile 不占用。

### R32 原生宽度与缩放续验（2026-10-14，取代上述控制不可用的完整判断）

同一日常 Chrome `155.0.8059.40`、同一扩展 ID 与 `hostInstanceId` 已取得有效的原生调节路径。真实焦点在 resize 手柄时 Left 每次扩大 50 DIP，最小内容宽度实测 360；开发页在 360/410/460/510 CSS px 均无正文控件越界，页面 `clientWidth=scrollWidth`。七个 Tab 在 360 和 510px 的当前真实状态均无页面溢出。原生拖动未得到尺寸变化，不把 410/510 当作精确 420/520；300/320/420/520 的完整原生矩阵仍 NOT_TESTED，静态 300–520 证据单列。

通过 Chrome 原生快捷键调整同扩展来源的静态 `manifest.json` Tab 后，真正已有 Side Panel 自身同步缩放：125% 为 288×671 CSS px / DPR 2.5，200% 为 180×419 / DPR 4，七个 Tab 均 `clientWidth=scrollWidth`、正文控件越界数 0。100% 已恢复，实测 360×839 / DPR 2；临时 JSON Tab/其临时 Inspector 已关闭，没有加载第二份 tool.html 或新建 Host。一级标题统一 13px/650/8px 12px，二级为 12px/650/8px 0；200% 长标题自然换行增高，不固定裁切到 40px。开发页 125% 的一级标题均 40px。

观察器将导航条自身的局部滚动与正文溢出分开。200% 时存在四个非选中 Tab 在导航可视范围之外，但页面仍 180/180，Home/End 能把选中项滚入视野：Debug 实际边界 122–172 在 0–180 内；Home 回到「我的」的真实截图有清晰蓝色焦点轮廓。此前只用 boundingClientRect 的隐藏后代读数及截断 Console JSON 不作为通过依据，保留原始失败；唯一标签、可见性过滤与紧凑输出之后的读数才登记。长中文/URL/JSON 原生参数编辑已核对无溢出，参数精确恢复 `{"value":0}`。本续验未点击 Run、安装、授权或改变模型数据发送。

最后 Dock 到底检查遇到原生工具 `native_hook_stdin_oversized`；重新绑定完整 Chrome 路径、重建 CUA 会话仍失败，不能把尝试当作通过。最后可验证状态为 100% / 面板 510px，原始 363px 未精确恢复。底部 Dock、完整动态安装/工作流/Cookie 状态、本地项目/空及错误结果、原生深色与 reduced-motion 仍 NOT_TESTED。评分继续 NOT_SCORED，整体 95+ NOT_ACCEPTED。局部原生几何结果与缺口追加保存于 `artifacts/sidebar-r32-accepted-preserved/native-matrix-20261014.json`；这是 CUA 实际输出的转录及身份记录，截图已在本对话展示，未冒称持久化 PNG 原始包，不覆盖旧 receipt。

验收期间其他负责人已将 Import Runtime 保存逻辑合入 main `28f4730c05d71271c173f5f4f63fddc5aea5e71b`。九个本轮相关源码文件仍逐字匹配 d270，四项已加载 HTML/CSS 与源码相同；另有 `workflow-view.js` 并行未提交改动，本轮不纳入、不提升其动态状态。最新 [R1 P0 38472328661](https://github.com/shopable-ai/opendesk-browser/actions/runs/38472328661) 对应 **28f4730c：16+341+23+37=417 PASS / 0 FAIL**，原 d270 的 16 FAIL 保留历史，不能继续宣称当前阻断。R19/R21 的 d270 成功仍按未变的相关输入复用；没有该新 SHA 的对应 R19/R21 run 就明确标记未触发，不冒充新 HEAD 的完整构建、全量 npm test 或整体产品验收。提交窗口前已 fetch 核对 main 与 origin/main 同为 `238e279c2f3f07174d640a91e464ad1fbfa12291`，该后续提交未改 Side Panel 源码；共享索引为空，本次仅暂存本工作流，不纳入其他文件。

独立证据审阅 Hume 已核查新 receipt、metrics、相关源码与加载 HTML/CSS：未发现统计或证据等级被错误提升，结论为高置信度 **不能宣称 95+**。静态记录为 292 几何样本加 3 键盘样本；原生为限定状态的 PARTIAL_MAC_CHROME，不能提升为完整包验收。必要剩余项为精确原生矩阵、Dock、动态安装/工作流/Cookie、本地项目/空及错误结果、原生深色/reduced-motion，以及可独立核验的原始截图与最终评分。原 `/tmp` 输入指纹已嵌入本地新 receipt 的 `sourceInputs` 持久保留，旧 receipt 不覆盖。证据记录提交 `4af96ddd` 已推送，后续只追加独立审阅结论。

本轮修改真实 Side Panel，继续使用 `od-disclosure` / `--flat` / `--info`，没有新 UI、Tailwind、依赖、权限或 iframe 样式注入。独立审阅 Lovelace 检查了正文留白、hidden、标题布局及暂存边界；视觉驱动由 Hume 修改，最终修复和验证由本对话负责人执行。

| 页面 | 已迁移的真实组件 | 原生观察与缺口 |
|---|---|---|
| 开发 | 一级沿用运行结果标准；SDK 批准快照改为 flat；strong/b 继承公共字号和 650 字重 | 实际扩展中检查收起、展开及 Params JSON 的 Enter/Space/Tab/Shift+Tab；本地项目和完整宽度/缩放矩阵 NOT_TESTED |
| 我的 | 运行记录、网站权限、更多操作采用一级组件；动态历史、任务管理和定时高级详情采用 flat | 检查真实定时表单；当前没有已安装任务，安装任务详情的原生验收 NOT_TESTED |
| 发现 | 候选证据、冻结源码及版本身份采用 flat；不新增折叠层 | 实际空任务列表已观察；非空候选原生验收 NOT_TESTED |
| 工作流 | 管理折叠、参数/Schema、JavaScript、原值、技术身份、模型设置及动态步骤复用公共组件 | 原生展开高级参数和 Schema，正文与 Dock 不重叠；未发送模型请求 |
| 云控 | 连接/配对、外部应用采用一级组件；约束、运行身份及诊断采用 flat | 当前 main 导航把 cloud 归入 tasks，tabOrder 不含 cloud，而模板仍显示云控标签；真实点击没有切换。保留独立入口 FAIL，不恢复或重写 R14 授权流程 |
| 工具 | 可信 Cookie 主卡一级，变更记录、修改表单、网站授权 flat | 原生展开 Cookie 卡和技术详情；未读取 Cookie、批准网站或启动第三方工具 |
| Debug | 脱敏诊断快照一级组件 | 原生展开长 JSON；只读状态，无任务领取或执行 |

真实缺陷与删除的覆盖：

- R19 coarse 360px：两列固定 34px 容纳 44px 图标导致溢出。统一使用 `minmax(0,1fr) max-content max-content` 和 8px gap，删除后续 34px grid 覆盖；桌面图标仍 34px、coarse 仍至少 44px。
- 删除 tool-shell 中 33 处普通 summary 外观规则，保留 `#workflow-provider-settings>summary{display:none}` 这一独立设置子视图合同。删除 task、workflow、schedule、Cookie、Cloud 和 Debug 对公共卡片重复的 border/padding/radius；cloud-hosting 删除旧卡片 padding 及 summary 颜色覆盖。
- `#task-installed-detail`、`.task-tools .row`、两处 `.cloud-privacy-note` 的零横向 margin 覆盖公共 12px inset，造成左贴边、右空白 24px；删除后由公共正文规则提供对称留白。视觉驱动测量实际 margin 和左右边界，要求目标确实可见。
- SDK 批准快照中文标题在 360px 超出标题框约 5px。标题使用 span 包装，公共 `summary>span:only-child` 允许占据并收缩可用空间；没有针对 ID 加高优先级规则。独立复核后将规则限定为唯一标题 span，避免改变当前网页 label/hostname 的业务布局。
- 动态 JS 只追加组件类，保留原 ID、事件、授权及运行行为。workflow-view 的其他未提交规划/采用逻辑属于并行负责人，仅暂存 workflow-step 的 class 单行。

当前布局证据：

- `npm run check`：668 文件 PASS，`/tmp/sidebar-r32-check-accepted.log`。
- 七个定向 Node 文件：81 PASS / 0 FAIL，`/tmp/sidebar-r32-node-accepted.log`。
- R21 十文件本地集成：162 PASS / 0 FAIL，`/tmp/sidebar-r32-r21-accepted.log`。R10 修复由 Time Review 负责人提交于 `284b0d94`：短字节探测退役别名，保留 canonical 20KB、真实 click 和一次性授权断言，未增加延时或伪造 ack。
- 最终静态 Chrome：292 几何样本＋3 键盘样本 PASS，保留既有 my-cloud-open 场景；300/320/360/420/520、普通/粗指针、收起/单开/多开、长中文/URL/JSON、少量 dark/reduced-motion 场景。`artifacts/sidebar-r32-accepted-preserved/metrics.json` 的 `inputsStable=true`，六项 HTML/CSS 输入 SHA 绑定。metrics SHA-256：`81b1152ac49580708d49c44e735bb3bdd2d5ca0b655b924cdcda6ee484ea5cf5`。该证据严格为 `STATIC_MARKUP_CHROME`，不证明真实扩展导航、授权、安装或原生事件。
- 失败迭代日志与产物保留在 `/tmp/sidebar-r32-*`、`artifacts/sidebar-r32-*`；没有删除或提升历史 FAIL。

构建/全量验证的限制：生产和开发完整构建及 verify 曾 PASS，日志 `sidebar-r32-production-accepted.log`、`sidebar-r32-development-accepted.log`、`sidebar-r32-verify-accepted.log`；这些是最终唯一标题 span 收缩规则前的候选，不能冒充最终完整构建。最终重建被另一负责人重新启动的 npm run dev（PID 25149 / 输出 guard PID 25173、43120）拒绝，原始日志 `/tmp/sidebar-r32-build-final.log`。不停止他人 watcher、不改输出端口绕过资源锁。最终开发 watcher 已输出与源码相同的 HTML/CSS，但增量更新不代替完整候选 build/verify。

完整 npm test 曾记录 2283 / 2246 PASS / 35 FAIL / 2 SKIP（`/tmp/sidebar-r32-all-node-after-build.log`）：独立审阅分为 15 development 资源缺失、19 独立运行时/合同失败、1 production 模块来源断言。最终工作区重跑（`/tmp/sidebar-r32-all-node-current.log`）记录 **2290 / 2265 PASS / 23 FAIL / 2 SKIP**，包含独立 Cloud 撤权、市场证据、compiler 元数据、bundle 来源和旧工作流采用合同；没有剩余普通 disclosure class/字号/间距断言失败。当前 watcher 下 verify 的 production PASS，development 因 `Unexpected packaged asset` FAIL（`/tmp/sidebar-r32-verify-current-watcher.log`），增量开发输出不能视为可发布的完整候选。当前工作区包含其他 owner 未提交输入，全量结果不是纯 R32 提交验收。提交后 R19/R21 CI 按确切 SHA 另行更新，不隐藏这些失败。

原生身份与原始观察：通过 macOS CUA 操作 `/Users/shopme/Applications/Google Chrome.app` 的实际 Side Panel，扩展 UI 的加载路径为仓库 `dist/development`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`；Native manifest allowed_origins 与 `opendesk browser doctor` 的 local.extensionId 一致。实际 DevTools 只读测量工具页：363×857 CSS px、DPR 2、页面无横向溢出；一级 40px/13px/650/8px 12px，flat 36px/12px/650/8px 0。原生截图和 AX/Console 原始结果保留在本对话工具输出，不能与静态 PNG 混称。最终同候选完整原生验收仍为 NOT_TESTED：宽度拖动返回 `noWindowsAvailable`，滑块动作未证实尺寸变化；Chrome 125% 只改变测试网页缩放，没有证明 Side Panel 本身缩放，随后恢复 100%。200%、300–520 全矩阵、暗色原生与本地项目模式均未登记 PASS。

评分为 **NOT_SCORED**。云控入口 FAIL、独立运行时 CI FAIL 及完整原生矩阵未关闭，不能宣布 95+ 或整体产品完成。

### R32 提交与当前 CI（2026-10-14）

实现提交 [85de6add728a45167583b0308a8e31da7503d044](https://github.com/shopable-ai/opendesk-browser/commit/85de6add728a45167583b0308a8e31da7503d044) 已正常推送 main，共 17 个限定路径。`workflow-view.js` 只提交 `workflow-step` 的公共组件 class；同文件其他未提交运行时修改、其他工作流源码和构建 receipt 均保留原状。

- [R19 · 38455367169](https://github.com/shopable-ai/opendesk-browser/actions/runs/38455367169)：SUCCESS，292 个真实 Chrome 静态几何样本；证据等级仍是 `STATIC_MARKUP_CHROME`。
- [R21 · 38455367070](https://github.com/shopable-ai/opendesk-browser/actions/runs/38455367070)：SUCCESS，4+158 条组件/宿主测试全部通过，16 条 R23 构建后 CSS 测试通过。干净 runner 对该提交完成 `check`、生产构建、开发构建及包 verify；生产包 SHA 为 `50df977b9445e6bd68d965a11d564f05d13de24eef808312cb12062bb9fef449`，开发包 SHA 为 `fe3f0b582a317f684b13b78643f49630107f5e969f17e4be12c0fb849f01e0ad`。这些包是 CI 构建证据，不替代日常 Mac 已加载扩展验收。
- [Sidebar Tools R1 · 38455367079](https://github.com/shopable-ai/opendesk-browser/actions/runs/38455367079)：201 条中 198 PASS / 3 FAIL。一项是 R32 迁移后 `sidebar-product-contract.test.mjs` 仍匹配旧的完整 class 字符串；保留 `hidden` 和业务控件要求，只对齐公共 class。另两项来自 `sidebar-tool-multiscript-r72.test.mjs` 的沙箱终态等待，相关沙箱源码不在 R32 改动范围，保留 FAIL；工作区已有其他 owner 的终态等待修复，未混入本提交。
- [Sidebar R1 P0 · 38455367467](https://github.com/shopable-ai/opendesk-browser/actions/runs/38455367467)：R15 语义/多状态阶段 SUCCESS，后续运输/编辑器阶段 FAIL。17 项失败中同一项旧 class 断言由本轮修正；其余 16 项涉及依赖检查、Page/Controller 准备器及执行生命周期。实际错误包含 `E_DEPENDENCY_INSPECT`、`E_PAGE_COMPILER_WORKER`、`E_REMOTE_PERMISSION_PENDING`；CSS/class 迁移未修改准备器或其授权状态机，不扩大为运行时重写。

后续限定补丁范围增加 `tests/environment/sidebar-product-contract.test.mjs` 与 `tests/environment/scheduled-task-ui-r1.test.mjs`：读取并接受工作区已有、与 R32 公共 class/焦点/grid 一致的测试修改；独立只读 reviewer 确认未移除授权、删除确认、Stop、运行身份、保留历史、禁止清库及 hidden 断言。两份文件定向结果 **33 PASS / 0 FAIL**（`/tmp/sidebar-r32-related-test-fix.log`），以 [8ac00038](https://github.com/shopable-ai/opendesk-browser/commit/8ac000384699f7c77106a6b896bc462e37072b6c) 安全推送。该 SHA 的 [Scheduled R1 干净构建](https://github.com/shopable-ai/opendesk-browser/actions/runs/38456742060) SUCCESS，`check/build/build:dev/verify` 全通过，包 SHA 与前述 R21 相同。R32 三份最终 HTML/CSS 与 HEAD、工作区及日常 `dist/development/ui/` 字节再次核对一致。

该 SHA 的 [Sidebar R1 P0](https://github.com/shopable-ai/opendesk-browser/actions/runs/38456742100) 剩余 **16 FAIL**，旧 class 项已消失；[Tools R1](https://github.com/shopable-ai/opendesk-browser/actions/runs/38456742169) 为 **200 PASS / 1 FAIL**，剩余项变为同一沙箱 fixture 的 `second asset onerror blocks main script`，其固定 20 次 `setImmediate` 等待未绑定真实异步摘要终态，保留原日志，不以盲目重跑宣称关闭。

追加 CI 写入范围：`.github/workflows/sidebar-r19-layout-visual.yml`、`.github/workflows/sidebar-r21-ui-quality.yml`。现有 path filter 漏掉上述两份折叠区/定时表单回归契约，测试修正不会触发 R19/R21；各补两条 path，并把两份现有测试加入 R21 的受影响组件检查，不更改权限或环境，不删除原测试。这使最终 SHA 具有直接 R19/R21 证据，并让以后相同契约修改自动触发布局验收。日常 Chrome 未登录 GitHub，未登录或改变账号来调用手动 workflow；使用正常 main push 触发，不绕过权限。

复现本地布局验证：

```sh
node --test tests/environment/sidebar-component-contract.test.mjs tests/framework/sidebar-develop-layout-r29.test.mjs tests/environment/sidebar-r21-design-system.test.mjs tests/environment/sidebar-ui-preview.test.mjs
CHROME_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome for Testing' node scripts/tests/sidebar-r19-layout-visual.mjs artifacts/sidebar-r32-recheck
opendesk browser doctor
```

完整构建必须等待输出 owner 明确交接 43120，然后在 main 依次执行 `npm run build`、`npm run build:dev`、`npm run verify`；原生继续使用上述已加载路径和 ID，在 `http://127.0.0.1:43111/demo-form.html` 打开真正 Side Panel，通过原生窗口调整宽度与焦点操作，读 DevTools 几何并保存各页 300–520 /125%/200% 证据。不能用 DOM 赋值、伪造事件或另装扩展替代此项。

## 范围与负责人

以下是 R31 历史实施记录；本轮 R32 的扩展范围、当前证据和未关闭项见本文末节。

本对话只处理可信 Side Panel 折叠组件与「开发」Tab 的视觉一致性。初始核查 main 基线：e64af0b8a42fd4ae02eeeedf50da5f23a52802ae；提交前已核对新 main 的新增提交只涉及独立的 Scheduled Tasks 测试。写入文件：`src/ui/design-system.css`、`src/ui/tool-shell.css`、`src/ui/tool.html`、`tests/environment/sidebar-component-contract.test.mjs`、`scripts/tests/sidebar-r19-layout-visual.mjs` 和本文件。页面授权、代码执行、SDK、RunHost、Native Agent 和第三方工具沙箱均不在修改范围。

## 问题和实现

- 现状已存在 `od-disclosure`，但开发页对参数 JSON、运行结果、运行历史、网页身份、诊断区有多份冲突的标题字重 / 字号 / padding / 边框。折叠时高度与正文对齐不一致。
- 以「运行结果」的 `od-disclosure` 为公共标准：顶层标题统一 13px、650 字重、40px 最小高度、8px 纵向与 12px 水平 padding，居中对齐；触摸下最小 44px。统一折叠指示符，不取消原生 `details/summary` 键盘语义。
- 「当前网页」「参数 JSON」「运行目标与版本」和「Advanced / Diagnostics」收敛为同一顶层卡片；嵌套历史/高级详情继续 `od-disclosure--flat`，首次连接指引仅保留信息标题的强调色。
- 移除开发 Tab 对 summary 的局部字体和额外顶部 padding/border，保留功能控件结构、ID、动态状态与真实执行合同。
- 公共 CSS 不引入 Tailwind Preflight、新依赖、CDN、运行时 JS 或第三方工具宿主越权。

## 验证与留存

- 源码合同检查：`node --test tests/environment/sidebar-component-contract.test.mjs`，验证开发顶层/嵌套视觉语义和单一公共标题规则。
- 几何检查：`node scripts/tests/sidebar-r19-layout-visual.mjs <输出目录>`，验证侧边栏 300/320/360/420/520 CSS px 多状态、普通与粗指针下的折叠头尺寸及溢出，并保存实际 HTML/CSS 静态 Chrome 证据。
- 全局回归：`npm run check`、`npm test`、`npm run build`、`npm run build:dev`、`npm run verify`。以上必须以实际运行结果登记；仅修改源码不视为 PASS。
- 后续必须在用户 Mac 上核对 `dist/development` 的真实扩展身份与已安装 Side Panel，开发页手动/本地项目两种状态下折叠与展开、300–520px、125%/200% 缩放、暗色/键盘、运行/停止反馈。没有同候选原生证据时为 `NOT_TESTED`；不宣称整站或专家 95+ 已完成。
- 其他 Tab 的历史专用 `summary` 样式（任务、定时计划、工作流、云控、工具、Debug）需要按 R27/R30 分区域迁移，不能把本次公共基类的修复冒充全部已迁移。宽泛删除其局部 CSS 会破坏已有状态布局，须按实际渲染逐项验证。

## CI 真实失败核对（后续修复）

2026-10-14 `075a1ab` 的 Sidebar R19 静态 Chrome 工作流 [38433080226](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433080226) FAIL：`schedule-form` 场景宽度 300px，`.schedule-source-row` 实测间距 4px，违反原有 8px 动作组合同。根因是 `tool-shell.css` 的 `@media(max-width:340px)` 覆写共享 gap。这是「我的 → 定时计划」原有问题，不是开发页折叠交互的回归。删除窄屏覆写、保留既有按钮大小与排布，并在源码合同中增加防回归断言。修复后的静态 Chrome / 用户 Mac 证据按新候选单独记录，未执行前保持 `NOT_TESTED`。

## 第二轮 CI 的历史测试修正

`da6cb667` 的 R19 [38433689576](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433689576) 已通过原先失败的 `schedule-form 300px`，随后在 `develop 300px` 遇到 **旧验收规则**：编辑器圆角要求 12px，而 R30 `od-field` 的控制圆角为 8px。同步修订 R19 脚本为 8px 控件圆角，并根据 R27 `--space-3` 校正开发大区块 12px 布局间距（原脚本仍要求 8px）。保留溢出、折叠标题高度/字号/字重、操作组和状态覆盖。

R21 [38433689575](https://github.com/shopable-ai/opendesk-browser/actions/runs/38433689575) 则因原测试 `sidebar-develop-layout-r29.test.mjs` 用严格 `class="单一类"` 判断历史子折叠、并要求 R30 已删除的独立外观 CSS 而 FAIL。更新测试，改为核对包含共享类的组件语义、`design-system.css` 唯一外观、现有历史 RunHost 和触控 / 可访问性约束；不恢复旧版重复 CSS。下一候选的全部定向、静态 Chrome、用户 Mac 原生结果须继续单独核对，未运行不得写 PASS。

## 第三轮几何收敛与 R21 过时合同清理

`1f04bf3` 的 R19 [38434280184](https://github.com/shopable-ai/opendesk-browser/actions/runs/38434280184) 在 `develop 300px` 报实际间距向量 `[8,12,12,12,12,12,12,12,12,12]`。上层宿主 Tab 和编辑器内部为不同 gutter owner，分别按 8px/12px 检查，不改变产品以迁就旧断言。修复 `.developer-run-technical p` 直接覆盖水平 margin，使展开正文继承共享卡片左右 12px 留白。

R21 [38434280150](https://github.com/shopable-ai/opendesk-browser/actions/runs/38434280150) 的历史 Development R29 测试现已 4/4 PASS；集成套件其余旧断言仍认为 320px 额外静态 Chrome 场景不允许、源码新建按钮一定要业务 CSS 明写 12px、工作流卡片/警告与代码编辑器必须各自定义圆角，以及 stylesheet 数量永远等于3。这些与 R27/R30 公共视觉合同和既有 5 个宿主可信 CSS 资源不符。调整这几项断言以核对 **同一权威公共 CSS、真实 class 及动态资源数量**；没有删除组件真实断言。

另一个 `sidebar-tools-host.test.mjs` 的 `host state did not settle` 仍是与折叠外观无直接关联的业务运行时 FAIL，须单独复现和修复，不能通过提高评分或修改断言掩盖。新候选原生 Mac Chrome 仍 `NOT_TESTED`。

## 真实溢出定位

R19 [38434969667](https://github.com/shopable-ai/opendesk-browser/actions/runs/38434969667) 已通过 `develop` 和 `develop-local` 在 300px 下的统一标题尺寸/间距检查，但 `develop-details`（展开运行结果、网页 JS 试运行、版本管理）出现真实 `contentOverflow/panelOverflow=true`。不允许忽略溢出或调低断言；增强同一 Chrome 测试，报告超出面板右边界的可见 DOM 元素及 computed overflow 诊断，以便下一修复针对真实来源。

## 300px 展开场景真实 CSS 根因与修复

诊断版 Chrome R19 [38435389431](https://github.com/shopable-ai/opendesk-browser/actions/runs/38435389431) 明确报告 `develop-details 300px` 中五个直接子控件溢出：`#script-params`、`#page-program-list`、`#script-id`、`#script-owned-url`、`#script-document`，每项边界均为 `left=22,right=302,width=280`（面板右边界约 291）。**根因不是需要新增 Tailwind，而是 `.od-disclosure>:not(summary)` 的左右 12px margin 与控件自身 `width:100%` 相加，导致真实溢出**。在框架公共 CSS 的 disclosure 内容规则中增加 `max-width:calc(100% - var(--space-3) - var(--space-3))`，嵌套 `--flat` 无侧边 inset 时单独恢复 `max-width:100%`。新增双重 Node 合同和保留真实 Chrome 300px 展开溢出阻断。未重新实测的新候选仍标记 `NOT_TESTED`。

## 定时计划表单操作区的有意左对齐

`f767d52` R19 [38435698788](https://github.com/shopable-ai/opendesk-browser/actions/runs/38435698788) 证实 300px 和 320px 的所有场景均通过，包括 `develop-details` 的真实水平溢出检查。继续至 360px `schedule-form` 时，旧静态脚本把表单底部 **“检查并确认 / 返回列表”** 的明确左对齐错误当作必须右对齐。代码 `.schedule-form>.schedule-actions{justify-content:flex-start}` 属于计划表单 R2.7 已确定的布局。验收脚本现在只为存在 `schedule-save` 的该表单操作组验证 **左侧内边缘**，其余操作组仍严格验证右侧内边缘；绝不放松按钮高度、8px 间距、真实宽度和溢出规则。
