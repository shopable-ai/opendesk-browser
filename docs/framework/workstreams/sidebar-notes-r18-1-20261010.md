# OpenDesk Browser R18.1：网页笔记数据可靠性与 Side Panel 工具收口

记录日期：2026-10-10。基线：`8f6e5a3fcd13c17514ca08a54b9c7c72a05b732c`。本文件只记录 R18.1，不改写 R18/R19/R4.1 历史证据。

## 已确认的源码缺陷及本轮改动

1. v1.1.0 读取恢复未完成时可保存或新建，可能用空状态覆盖旧笔记。v1.1.1 在完整读取 `notes`、旧版 `note` 成功前锁定编辑，失败时禁止写入。
2. v1.1.0 删除旧数据先写 `notes`，再清理 `note`；第二次失败会误报整个删除失败。现先提交权威数组（`[]` 是永久删除标记），之后清理旧值，清理失败明确提示、下一次保存重试。
3. 原 R1 Web Lock 原本只串行化单个 `storage.set`。两个 Side Panel 同时基于旧版 `notes` 进行整数组写入仍会丢更新。宿主支持可选 `withEtag` / `ifMatch`，在既有 Web Lock 内以 SHA-256 内容标记执行条件写入；不改变旧工具的非条件请求格式，不添加存储字段或扩大权限。
4. 保存中多次点击、新建、切换和删除不再覆盖本次写入；发生错误保留编辑器文本，显示结果不确定或并发冲突的恢复办法。
5. 页面切换通知只发送到活跃工具 frame，经现有实例、toolId、source 条件校验在隔离桥中传递事件；保存 URL 关联之前主动复核。受限网页不阻断纯离线存储。
6. 复用 R19 控件 8px、表面 12px、4/8/12/16px 节奏。工具 iframe 的 78vh CSS 上限改为与原消息尺寸上限一致的 1600px，减少宿主与 iframe 的嵌套滚动；独立工具标签页保留既有 max-height:none。

## 改动与自动测试定位

- 网页笔记：`examples/sidebar-tools/quick-notes/src/main.js`、`tool.config.json`、正式 `quick-notes.opendesk-tool.json`、`README.md`。
- 宿主和桥：`src/ui/sidebar-tools.js`、`src/sidebar-tools/bridge.js`、`src/ui/tool-shell.css`。
- 回归：`tests/environment/sidebar-quick-notes.test.mjs`、`tests/environment/sidebar-tools-host.test.mjs`；官方构建 JSON 比较路径已更新至 v1.1.1。
- 官方打包合同：`npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes --out examples/sidebar-tools/quick-notes/quick-notes.opendesk-tool.json`；正式 GitHub Actions 经官方打包器重建并通过 `cmp` 逐字节判等，版本 v1.1.1，PNG data URI 已校验。
- **CI_PASS（仅组件/构建）：** [Sidebar user tools R1 正式运行 #38064141768](https://github.com/shopable-ai/opendesk-browser/actions/runs/38064141768)，候选 SHA `ad66ff1eba0023fce70176267428c4a1dc65f603`，2026-10-10：相关环境套件 **104/104 PASS**，`npm run check`、官方工具打包/严格 `cmp`、React/Vue starter 编译、`npm run build`、`npm run build:dev`、`npm run verify` 全部 PASS。正式生产 packageHash `386929056fd2cad7490b572410bc19d5f7109774e913734a3f7ee61ac602d595`，开发 packageHash `174a6b7d91f241eefe2e7a2d58632ecc6ad508b9bba2bd1fcea884be140483a2`。此前两项回归测试断言/异步等待失败已保留在旧运行 #38063924344，并在最终候选修复验证。
- **STATIC_MARKUP_CHROME_PASS（不是 Native）：** [R19 静态页面布局 #38063797196](https://github.com/shopable-ai/opendesk-browser/actions/runs/38063797196)，对应 CSS 提交 SHA `2262779593f4198390c20583c1e09a5f6f21643c`，独立受控 Chrome 的真实 HTML/CSS 静态布局检查成功，不代表安装扩展/实际 Side Panel。
- 以上 CI 主线在证据采集时远端 `main` 相比组件候选 SHA 仅新增 `docs/framework/workstreams/r15-4-independent-libraries-20261010.md`，实际回归/构建输入未变化；每次后续写入仍须重新核对。

## 证据等级和缺口（不得冒充 Native）

本会话可操作 GitHub main 源码，但执行环境是 Linux 容器，不能读取或操作用户 Mac 的已安装 Chrome Profile，也不能确认扩展 ID、实际加载版本或原生安装流程。Mac Chrome 安装/更新/卸载/重启、真实网页标题、网络断开、实际 125%/200% 缩放、五个原生页签与独立工具页截图均为 **NATIVE_NOT_TESTED**；历史 R1 原生候选与 R19 STATIC_MARKUP_CHROME 结果只可有界复用。不存在当前版本 Native PASS 证明，不给出 95/100 的虚构评分。

## Mac 验收待办

使用独占 Chrome for Testing/Profile，绑定 main SHA、构建目录、manifest、扩展 ID 和截图元数据；核对旧 v1.0.0→v1.1.1 升级与中断恢复、双窗口冲突、限额/错误、真实受限页面及导航、展开/收起、320/360/400/600px 与 125%/200%、独立标签页、工具权限/撤销和 Task v1。按 `docs/framework/testing-guide.md` 保留原始结果并明确失败与 NOT_TESTED，完成才单独评分。

## Final R2 Mac 执行记录（2026-10-11）

- 状态：IN_PROGRESS；会话 `01a1268c-ffac-76b0-bcc8-6028e3834926`，默认 main，禁止分支/worktree。
- 起始本地 SHA `87f8330e64c21b61ffdefdc2bad160726bbd8647`，fetch 后 main 已由并行同步纳入远端 `cc2c4eafc5029c760bd8413edfdabf39081ab34b`。起始 tracked 文件无差异；其他工作流 `.runtime/` 保留。
- 独立产物根：`.runtime/sidebar-notes-r18-1-final-r2-01a1268c/`；源码冻结副本构建，独立 build receipt、Profile、随机调试端口；不写共享 dist、不使用他人 Profile。
- 资源核对：43111 尚无监听；共享目录已有 npm dev 进程 PID 31090，保护该进程及其 dist。旁路子代理只读。
- 历史 R18.1 CI 仅按原候选/组件等级引用；R19/R21 设计已在 main，相关宿主输入已变化，不能复用为当前 Native PASS。
- 已定位待修复：宿主返回/一级导航未保护已安装工具草稿；ETag digest 等待后缺少最终会话检查；删除等待期间编辑器新输入可能被成功回程清除。测试驱动旧 `note` 断言须对齐 `notes` 权威数组，保留历史 R1 证据。
- Native/双构建/Final R2 定向回归：尚未执行，NOT_TESTED。后续日志及状态追加于本节。

### Final R2 实施与验收追加（2026-10-11 01:20 CST）

状态：`BLOCKED_NATIVE / FINAL_NATIVE_NOT_VERIFIED`。以下更新上述起始状态，保留历史候选和失败。代码修复、定向组件验证、官方工具打包、生产/开发构建已完成；最终候选的全部原生交互未关闭。Mac 原生控制工具报告“Mac is locked and automatic unlock could not unlock it”，已请求人工解锁。没有以静态布局、旧候选或只读存储观察替代完整 Native PASS。

```text
网页笔记可靠性
  草稿/保存中导航保护：已实施；组件 PASS；较早候选原生取消确认 PASS
  迁移/删除/并发：已实施；组件 PASS；真实旧版更新及双 Side Panel 有限 PASS
  对象键顺序条件摘要：原生发现并修复；组件 PASS；修复候选连续保存 PASS
  sandbox 内确认：原生发现并修复；组件 PASS；修复候选取消/删除 PASS
工具 UI 与尺寸
  R19/R21 宿主样式：复用；96 STATIC_MARKUP_CHROME PASS
  工具内部圆角、URL、状态色、确认焦点：已修复；最后细节尚未 Native 验证
  360px 与 125%/200%：实际扩展观察已保留；完整尺寸/滚动矩阵未关闭
Mac MV3 验收
  旧版正式安装/更新：真实操作和存储证据已保留
  最新生产包同 Profile 重启：扩展 worker/已保存存储观察 PASS；界面恢复未验证
  卸载/重新安装、最终工具更新、Task v1 Run/Stop、完整安全攻击：NOT_TESTED
主分支交付
  仅 main 的本轮文件；提交前复核远端及并行修改；不推送
```

#### 缺陷与修复

| 缺陷位置/重现 | 原因与最小修复 | 回归与状态 |
| --- | --- | --- |
| `src/ui/sidebar-tools.js`：编辑后返回或一级导航；`task-workbench.js`：打开任务 | 原宿主先切换/销毁 iframe。先校验 `canLeave()`，dirty 弹宿主确认，busy 阻止离开；取消时保留原 pane/tab。`bridge.js` 可选 `setState({dirty,busy})` 仅报告布尔状态，不增加权限 | host/workbench 组件 PASS；真实返回、我的、发现、工作流、开发取消确认有 5 份可信 Chrome dialog 回执；最终构建复测 NOT_TESTED |
| `quick-notes/src/main.js`：保存等待时继续输入、删除等待时输入 | 保存成功回程曾可能清掉较新的编辑内容；删除等待没有锁定编辑。保存仅在原快照仍匹配时更新已保存状态，保留后续输入；删除 busy 锁定编辑/切换 | quick-notes 组件 PASS；保存中关闭/未知响应故障的最终原生测试 NOT_TESTED |
| `src/ui/sidebar-tools.js`：Chrome Storage 读回对象属性顺序改变，第二次保存误报冲突 | SHA256 原来依赖对象键插入顺序。摘要递归按对象键排序，数组顺序/内容仍参与比较；最终异步 digest 之后再检查会话有效性，撤权实例不能提交 | 保存前失败日志 `etag-normalization-before.log`；模拟真实重排的组件断言 PASS；修复包真实连续保存两条笔记 PASS |
| `quick-notes/src/main.js`：sandbox 的新建/切换/删除原生 confirm 被 Chrome 拒绝 | CSP `sandbox allow-scripts` 不允许原生 modal。增加工具内 `role=alertdialog`，默认焦点取消，Escape/Tab/取消恢复输入，确认期间禁用编辑、任务入口和关联控件；未放宽 CSP | 旧原生失败日志保留；组件 fixture 的原生 confirm 直接抛错，断言只使用内联确认；真实取消、删除确认及空 `notes` 写入 PASS |
| `src/ui/sidebar-tools.js`：超过 120 次请求后工具永远无法继续 | 改为 60 秒窗口 120 次，原 resize/source/instance/toolId 与权限校验保留；未放宽操作能力 | host 节流/窗口恢复/撤权回归 PASS；恶意消息场景完整 Native NOT_TESTED |
| 工具 `style.css/index.html`：URL 裁切、圆角及反馈/确认焦点 | URL 取消固定高度裁切并换行；8px 控件、12px 确认卡片、32px chip 点击高度；正文/次要色加深，未保存提示采用中性色，成功/失败分别着色；取消后被重建的 chip 不再成为失效焦点 | 真实确认与 200% 截图已审阅；最后中性色/焦点/任务禁用细节只有组件证据，待最终 Native |

官方工具为 **v1.1.3**：`examples/sidebar-tools/quick-notes/quick-notes.opendesk-tool.json`，由官方打包器生成，未手改包体；完整文件 SHA256 `4afc065f715f870892bfac1439fdcca5c944ada82cbdf9dde94476a07a72e70e`，UTF-8 文件大小 21798 bytes。仍为 16 条上限，所有笔记共享单个 `notes` 项 8 KiB，工具隔离数据合计 32 KiB。容量检查对整个序列化数组计算 UTF-8 字节数；README/错误提示没有宣称“每条 8 KiB”。未新增依赖、全局 CSS 或常驻草稿系统。

#### 源码、构建与组件证据

本节证据路径均相对独立根 `.runtime/sidebar-notes-r18-1-final-r2-01a1268c/`。基线 main `e699f00d81903bf7039ea5c84dbcda4aa73ca1a9` 加本轮未提交源码；最终提交 SHA 以本轮 git commit/log 为准。`evidence/final-source-identity.json` 对正式 build receipt 的 231 个扩展源码输入逐项比对，漂移为 0；工具包独立记录 SHA。文档/测试元数据变化不提升任何旧 Native 证据等级。

| 验证 | 结果 | 原始证据 |
| --- | --- | --- |
| `npm run check` | PASS，327 文件及固定入口/CSP/license 检查 | `evidence/source-check-latest-main.log` |
| 要求的 tools/host/quick-notes + task-workbench + R21 design-system 定向组件 | PASS，89/89，0 skipped | `evidence/component-final-reviewed.log` |
| 官方 `build:sidebar-tool` | PASS，v1.1.3/三项既有能力，未自动安装 | `evidence/tool-package-reviewed-final.log` |
| `npm run build` | PASS，独立源码副本 `source-final/dist/production` | `evidence/production-latest-main.log`、`evidence/builds-latest-main/build-production.json` |
| `npm run build:dev` | PASS，独立源码副本 `source-final/dist/development` | `evidence/development-latest-main.log`、`evidence/builds-latest-main/build-development.json` |
| `npm run verify` | PASS，两包入口、manifest、CSP、身份校验 | `evidence/package-verify-latest-main.log` |
| R19/R21 300/360/420/520 静态布局及状态 | 96 PASS；明确 `STATIC_MARKUP_CHROME` | `evidence/static-r19.log`、`evidence/static-r19/` metrics/PNG |

- 生产 packageHash：`bf16945a5bee87931b31d07347f9b85694419e08c7824571eacd09b74c1b5615`；SW 319827 bytes，tool-shell 305195 bytes。
- 开发 packageHash：`07b7a81ba35f50c45ce863b346491ba57c1e9d51f04e018d5da88360befe48ef`；SW 319993 bytes，tool-shell 305435 bytes。
- 本轮没有改变大小预算；SW 和 shell 均仍低于历史 320 KiB。最新 main 的预算政策来自并行提交，不由本轮放宽。
- 原 R18.1 CI `ad66ff1...` 及 R1/R19 历史证据保留，不作为本候选 Native PASS。复用 R19 间距/圆角/页面构件及 R21 token/状态/布局检查；本轮不重做 R20/R21 全局设计，不把其静态证据提升为原生证据。

#### Mac CFT 原生身份与有限通过

- Chrome for Testing **155.0.8059.39**，本轮独立 app：`cft-isolated/Google Chrome for Testing.app`；bundle ID `com.shopable.opendesk.r18notes.01a1268c`。只改独立副本 app 名称/bundle，主 executable SHA256 与受控原件相同：`316795971c05d253320fcc574168aa8ae7782eae9beb540e0595ebbd654ab965`。
- 扩展 ID `iegopfejkkjpbcajmhjnaeoccmecciof`；实际安装目录 `source/dist/production`；manifest/版本、PID、Profile、随机 loopback 调试端口和真实命令见 `evidence/native-v3/session*.json`。Profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-g0dwhseo`，全新 0700，`--use-mock-keychain`。
- 初始 PID 8057 / 调试端口 64414；01:18 CST 本轮自有 runner 正常关闭并同 Profile 重启为 PID 47392。最终生产包 `bf16945...` 已被实际扩展 worker 加载；`restart-before-final.json` / `restart-after-final.json` 对真实 storage 完整比对一致，2 条已保存笔记保持。此项为 **NATIVE_STORAGE_RESTART_PASS_LIMITED**，没有完成最终工具包更新或手动重新打开 UI 恢复。
- 原生交互主要绑定较早包 `eb27fde...` 和修复包 `92f6ac...`；旧文件保存在 `evidence/loaded-before-final-restart/` 与旧 session。官方工具最后的中性色/焦点/任务禁用微调未安装到 Native；不能把同版本号当作相同包体。
- 真实导入历史官方 v1.0.0 JSON，Chrome Input 输入中文/Emoji/换行并保存 `note`，经正式 v1.1.1 更新保留数据、不自动启动，恢复后真实修改保存 `notes`；没有通过预写 Chrome Storage 制造保存。
- 真实工具内删除取消不写入；确认后权威 `notes:[]` / 旧 `note:''`。清理故障注入仅组件级，不声称真实磁盘故障通过。
- Side Panel + 独立标签页、两个实际 `SIDE_PANEL` runtime contexts 同时写同一集合：一个成功，另一侧 ETag 冲突且未保存输入保留。精确 host/sandbox target ID、真实存储、原始 CDP trace 见 `concurrent-panel-tab-data.json`、`concurrent-two-panels-fixed-driver-data.json`。
- 独立工具标签页 Cmd+W 出现真实 beforeunload；原生 Escape 保留 draft，之后显式确认离开。浏览器弹层观察和工具内容证据分开保留。
- 真实 Logo 完成加载；多窗口目标绑定、实际业务页导航及 CDP 对该业务页禁网后的离线保存有 `windows-navigation-offline.json`；此项不是操作系统整体断网验收。
- 实际扩展观察宽度 360 CSSpx；125%/200% 原生 Chrome 缩放后宿主和 iframe DPR 分别 2.5/4，200% Side Panel CSS 宽 180、iframe 160，无横向 overflow。完整滚动/短高度/400/600px 未关闭；历史相同 Chrome 的最小 360px 限制不冒充本轮 320px Native PASS。
- 汇总与断言：`evidence/native-audit-final-r2.json`；原 `native-audit.json` 保留。截图各有 `*.png.identity.json` 关联源码基线、包身份、Profile、Chrome、时间及 raw observation；共有 39 张实际扩展截图，不与静态 PNG 混合。

#### 截图索引（均在 `evidence/native-v3/`）

| 类别 | 真实扩展截图；具体限制见同名 identity/JSON |
| --- | --- |
| 工具列表 | `update-installed-v111-771B307DA10289C340675E201C5D975B.png` |
| 导入预览 | `update-preview-final-771B307DA10289C340675E201C5D975B.png` |
| 网页笔记及旧数据恢复 | `migrated-v111-771B307DA10289C340675E201C5D975B.png` |
| 多条笔记、取消后草稿 | `draft-inline-cancel-final-A93A1A0BE1099EE583C7F469A539338F.png` |
| 受限页面提示 | `standalone-opened-7210C92742E1BABF4273E135F659342C.png`（扩展自身页面，未替代 chrome://extensions） |
| 360px 宽度 | `concurrent-two-panels-fixed-driver-B0FFFA864FBBB8E70211D18458BAF168.png` |
| 真 200% 缩放 | `zoom-200-A93A1A0BE1099EE583C7F469A539338F.png` |
| 独立工具标签页 | `standalone-opened-7210C92742E1BABF4273E135F659342C.png` |
| 草稿确认 | `draft-inline-confirm-final-A93A1A0BE1099EE583C7F469A539338F.png` |
| 删除确认 | `delete-confirm-771B307DA10289C340675E201C5D975B.png` |
| 并发失败保留输入 | `concurrent-panel-tab-7210C92742E1BABF4273E135F659342C.png` |

#### 失败、资源与剩余阻塞

保留旧 ETag 误冲突、sandbox modal 被拒绝、observer/错误 target/弹层结果不匹配等实际日志；测试 fixture 缺 beforeunload 接口、初次 symlink 依赖 provenance 不通过、构建输出 guard 端口占用和重复 43111 bind 失败均按测试/环境问题记录，没有删除安全断言或扩大超时。vendor `.DS_Store` 被可逆移到独立证据，未改 vendored JS。第三方只读 agent 复核当前 diff 未发现可复现 P0/P1，结论仅静态复核。

共享 dev PID 31090 的 dist 未写入；43111 后续由既有 python 服务 PID 98124 提供，不停止。另一个任务 CFT PID 99591 / `.runtime/tests/r16-r2-macos/01a12689/cft-profile` 从未输入/复用/终止。所有 Native 输入只面向本轮 app 与精确 target；正常流程未设置 DOM value、派发 synthetic event 或预写 storage。

仍需人工解锁后执行：最终 v1.1.3 包更新与界面恢复、Cmd+S、完整 Tab/Tooltip/焦点、400/600 和短高度/details/textarea resize、HTTPS/chrome://extensions/关联保存、卸载取消与确实删除后重装、真实写入失败与未知响应、完整安全攻击与 Task v1 Run/Stop。当前这些为 **NOT_TESTED / BLOCKED**，没有正式 F3/ZIP 发布验收。保存失败/冲突保留输入有组件和部分 Native 证据；“本轮不存在任何 P0 数据丢失风险”不能据此全面关闭。

受保护：工具内切换/新建/删除取消、宿主返回/一级导航/任务入口取消、保存/删除中导航拒绝；独立标签页有浏览器 beforeunload。浏览器可能抑制 beforeunload；关闭 Side Panel、正常退出未确认、强制关闭/崩溃的未保存 draft 不承诺持久恢复。已保存 storage 的同 Profile 正常重启观察通过。

五项评分暂为作者依据已执行证据的保守评分，**不是独立专家签收**：视觉 90、交互/无障碍 90、离线可靠性 92、MV3 安全/生命周期 92、可维护性/测试 94（均 /100）。扣分分别对应最终视觉/尺寸矩阵缺口、键盘与卸载路径缺口、真实存储故障/未知结果缺口、最终攻击/Task 回归缺口、驱动多实例与完整候选 Native 未关闭。目标 ≥95 尚未达成，不因组件测试数量提高评分。

01:22 CST 资源释放：仅本轮 runner 收到 `stop`。`evidence/native-v3/cleanup.json` 为 PASS，两个 owned generation 均正常退出、Profile 删除、residual 为空；另行 `ps`/路径观察确认 PID 47392 与 Profile 不存在。原始输入、storage、截图、包副本和生命周期回执保留。本轮调试端口不再占用，其他任务资源不变。

### Final R2 提交与最新 main 包身份追加（01:28 CST）

本轮代码提交 `d9836089e18d66b0e9fab92701028a1dd9a73127`：`Protect offline notes from lost drafts and false storage conflicts`，14 个文件；未推送。之后并行任务提交 `2f8a373665de187f149f7f0e764c7941f489da00`，仅改变 workflow AI 生命周期及其测试，本轮笔记文件不变。`postcommit-identity.json` 保留首次发现该输入变化的观察，不覆盖它冒充“始终无变化”。

为绑定最新已提交 main，再用 `git archive 2f8a3736` 建立独立源码副本 `source-main-2f8a3736`，重新构建/verify/check；本轮 notes 定向组件与 R19/R21 输入未变，沿用上述成功证据。

- 最新生产 packageHash **`46fe9fbe6ddcf67c91e6ed890c2af10a6e69e491287ced9d3eeb0efc31417580`**，开发 **`715577af08381228c26e9eec7e33b81d532d9c94f2e686c15c6f5843a9b35db6`**；SW/shell 大小不变，生产/开发 build、verify 和 327 文件 check 均 PASS。
- 原始日志：`evidence/production-final-main-2f8a3736.log`、`development-final-main-2f8a3736.log`、`package-verify-final-main-2f8a3736.log`、`source-check-final-main-2f8a3736.log`；独立 receipt `evidence/builds-final-main-2f8a3736/`。`evidence/identity-final-main-2f8a3736.json` 核对 231 个输入无漂移。
- 此最新包 **NOT_TESTED_NATIVE**。正常重启的实际加载包仍为 `bf16945...`；两者严格区分。最终文档提交不改变这 231 个构建输入，最终 main SHA 见本轮交付和 git log。
- Chrome 测试区间：2026-10-11 00:23:14 至 01:22:07 CST；初始调试端口 64414，正常重启后 65525。`cleanup.json` 记录退出 code 0、Profile removed、无残留。
