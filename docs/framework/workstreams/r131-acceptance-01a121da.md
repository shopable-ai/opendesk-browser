# R13.1 实际 WXT 插件与自动化验收

2026-10-10，工作流 `r131-acceptance-01a121da`。实际 WXT production/development 的限定原生范围通过；整体框架最终 F3、ZIP 和专家 95+ 尚未关闭。机器索引见同名 JSON；原始观察、构建收据、失败与校验结果在 `../evidence/r131-acceptance-01a121da/`，不改历史收据或正式全局账本。

## 候选与资源

- 构建基线：`2b2dca89c5b8c4f09299a581a0a220f820819d88`，已含 R12 PR #52；未重复 SW 瘦身。
- 集成基线：`43dae9809c61d13cceeab07fddf413cd8398b8b0`。构建收据全部 `sourceInputs` 与此 main 逐字节一致，`sourceDriftDuringBuild=[]`。后续只读复核须重新核对这些输入，不以 HEAD 相同或不同直接判断复用。
- production packageHash：`feaf5ca1bbc01c07057fd9c7495322fbcf50ff031f4637536c00fbcdb9293456`。
- development packageHash：`a19b857dd6443c7df01ab5177480b23fffbf392ff532d299670aa8738765f2f8`。
- Chrome for Testing `155.0.8059.39`，独立复制的应用和 launcher 创建的 fresh `0700` profile；实际加载本工作区的 `dist/production` / `dist/development`。不是独立 webpack fixture 扩展。
- `http://127.0.0.1:43111/demo-form.html` 使用已有服务，服务响应与候选文件 SHA-256 一致；没有修改/关闭该服务。附加表单负例使用专属临时端口，fixture 是测试网页，加载的扩展仍为实际 WXT 包。
- 主仓库有并行未提交修改和分叉，本轮独立 `agent/r131-acceptance-01a121da` worktree；未覆盖主仓库、其他 profile、dist、Native Host 或 R12 分支。

## 验证与真实运行

执行 `npm ci --ignore-scripts --no-audit --no-fund`。指定三文件 Node 测试 57/57；Controller Authority、RunHost recovery、草稿入场、Sidebar 与 AI→Task 合同的补充定向测试 84/84。`npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 通过。未运行与本任务无关的全仓库或历史候选全量验收。

正式 WXT 的 CSP、classic 入口和依赖闭包通过原包校验器；production `sw.js` 288,895 字节。R12 原包 hash 相同的 SW 启动证据仅按原范围引用，本轮另有实际 SW stop/start 与持久结果核对。

真实 Sidebar 的代码和参数均用 CUA 原生输入；观察器仅读取状态、监听事件和读取 IndexedDB。标准 `examples/tasks/modern-search-draft.js` 的源码全文与编辑器一致。两包分别只新增一次搜索提交，保留动态按钮替换、异步完成、Controller Result 和资源释放。

| 实际入口 | runId | resultId |
|---|---|---|
| production 标准搜索 | `637eb9b7-9d43-472a-af9b-150953933807` | `97ced128-e98a-4288-8b01-3614774dec54` |
| development 标准搜索 | `5a13e2c0-c3c2-4018-854d-9f67546845fa` | 见 `acceptance.json` 的精确绑定 |
| production R13 矩阵 | `5e45bcfe-0121-4bda-bb48-478c5e26aef8` | 见 `acceptance.json` |
| development R13 矩阵 | `48f1ea7b-a1f4-478c-9773-c3f10242f3bf` | 见 `acceptance.json` |

离线校验 `node tests/framework/r131-wxt-evidence.mjs` 对 13 次运行逐项核对真实 `SIDE_PANEL`、唯一可信 Run 点击、完整 source/params、result 自身 revision/sourceHash、runId/resultId、操作原 documentId/ownerEpoch、submissionCount=1、workerRetired=true 和 retirementState=released。结果结构本身没有 ownerEpoch/documentId；这些绑定来自原 run 和 operation envelope，不能声称 result 新增了字段。

    标准搜索：双包原生通过；动态 DOM 替换、异步等待、一次提交、Durable Result
    R13 Locator：双包原生通过；placeholder/title/alt、first/last/nth、状态读取
      表单：fill 清空/替换、checkbox check/uncheck、radio check、single select
      严格拒绝：重复、越界、隐藏、禁用、遮挡、只读；零意外提交
      同值动作：check/uncheck 不额外切换；select 同值不新增 input/change
    安全：production 原生通过；Stop、30 秒期限、真实导航、Chrome 站点撤权
      未知回执：click/check/select 的实际回调暂扣；effect_unknown 保留、零自动重放
    生命周期：双包实际 SW 重启；development 新 Sidebar host 读取旧 Durable Result
    Codex 闭环：实际 observe → 唯一 Locator → 生成 JS → 普通 Sidebar 单独运行 → 核验

网页动作仍遵循已有合成 DOM 契约。Sidebar 的原生输入 `isTrusted=true` 不表示 Locator 的 DOM click 是物理键鼠；浏览器自身生成的 checkbox input/change 也不能作此推论。网页文本只作数据，未运行网页中提供的指令；没有开发第二套 Agent 或扩大 UI。

## 失败、修复与反方审计

未发现需要修改 R13 产品实现的已复现缺陷。本轮新增的都是验收驱动、fixture、校验器和专属记录。

- **修复验收驱动退出竞态。** development 首轮通过原生业务后，进程组 SIGINT 与 launcher 的 PID 检查竞争，cleanup 为 FAIL。原 PID 已退出、profile 已删除且无 residual，但不把原 FAIL 改为 PASS。原始记录 `native-development/cleanup.json` 保留。驱动改为先 `Browser.close`，只向本工作流 driver 发终止信号；新独立 profile 的 `cleanup-confirmation/cleanup.json` 为 PASS。没有修改全局 launcher 或放宽 ownership 检查。
- **修复离线观察时间顺序。** 校验器第一轮把 production SW 重启前后的结果与之后才发生的 R13 矩阵比较，失败日志保留。修正为重启发生时的真实 baseline；未重跑已通过浏览器业务来隐藏观察错误。
- **撤回 Stop 静态误报。** 可选 `expectedRunRevision` 是 CAS；公开 Stop 按唯一 runId 取消整次运行。host/registration fence 隔离归属。强制导航前 revision 会破坏用户停止同一 run 的现有合同，本轮未作破坏性变更。
- **未知效果反证。** 只对自己浏览器中的真实 `tabs.sendMessage` 回调暂扣，不造 native ACK，不修改包或网页赋值。三个原始响应均证明 `committed=true`，每项仅一个 commit；Journal 保持 `effect_unknown`、有 `commitIntent`、无 `commitNoEffect`，网页 toggle/change/click 各只发生一次。
- **真实撤权。** 由 Chrome 原生站点访问开关产生 `origins=[]`；活动 run `E_PERMISSION`、resultDeliveryRevoked=true、资源释放。没有用 required `<all_urls>` 的 `permissions.remove(false)` 冒充撤权。

## 限制与续接

本工作流验证受控 CFT 的 unpacked WXT 安装及产品入口。它不是最终发行 ZIP 安装，也不是普通个人 Chrome profile 的验收。未新增可信 `press()`、自动滚动、frame/shadow、复杂鼠标能力。

**尚无专家 95+ 的正式证据。** 本轮没有任意评分，也没有用测试数量计算完成比例。整体 603＋19、独立 B05、1000 mixed／10 reconnect／两轮禁插件、六项资源 baseline 的最终身份账本关闭、独立最终 F3 与一致 ZIP 安装仍须正式负责人在同一冻结候选验收。完整浏览器同 profile 重启本轮亦为 NOT_TESTED；本轮证明的是实际 SW 重启与 Sidebar host 重建。

后续复用先检查 `source-binding.json`、两包 hash、原始 manifest 哈希、fixture/观察器/环境。原记录中限定成功和失败均永久保留；不要把本轮 bounded native PASS 提升为正式 F3/ZIP。集成 PR 与最终 merge SHA 记录在本工作流的集成回执，不改旧 receipt。

## 最终只读反方复核

独立 reviewer 复核验收驱动与证据校验器；verifier 对限定原生范围给出 PASS，明确不包含最终 F3、ZIP 或专家评分。原始结论保存于 `../evidence/r131-acceptance-01a121da/final-audit.json`。

复核还发现校验器最初只在报告中提及清理失败，没有强制读取原 FAIL。现已要求原始 development 清理回执保持 FAIL、保留退出与清理错误，再独立要求修正复验 PASS。三项负例分别拒绝错包身份、未知效果缺少提交意图和把历史 FAIL 改写为 PASS；3/3 通过。此项修复属于验收校验层；本轮未发现需要改动 R13 产品实现的真实缺陷。
