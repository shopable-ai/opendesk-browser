# Bookmark AI Agent Loop R2.1.1 独立终审

审阅日期：2026-10-22（Asia/Shanghai）。本次增补核对实际写入后丢 Host 确认、真实 worker 停止/重启、刷新及关闭重开读回的特定 T8；保留先前最终候选闭环、T3 和 T9 裁决。已读 Native 清单截面为 `updatedAtUTC=2026-10-21T23:05:24.075858+00:00`。T9 状态与 T3 公开模型计划另有验收隔离 CODEX_HOME 的直接只读核对。本次仅读取既有工件并更新报告，未运行浏览器、测试、构建或新增 case，不扩大到完整 T10 矩阵。

**真实 Native 核心闭环已有充分证据，不能再归类为 mock 或仅模型口头完成；尚不足以宣布七维全面 95+ 或全部生命周期验收通过。限定变更未发现新增的明确 P0/P1 源码 blocker。** 本次仅检查文件、源码、截图与既有日志，未启动浏览器、测试、构建或修改产品；唯一写入为本报告。

## 版本与证据边界

- 业务与 CI 验收基线：`07e61ae702f2c600a92cd94b1d4d74cf451ea47e`。包含业务提交 `05218b090d1f47817e308cc66bd41845ffb6986e`，经 `d9e5e5099` 合入远端改动。本次增补时 `main` HEAD 已为 `1df5617e68e08b37f9bd38b08280f4747b57a7d44`；相对该基线，loop、bookmark-actions、workflow-view、current-page-refs、App.jsx 五项限定产品源码无差异。后续提交的其他范围不由本次审阅背书。
- 当前生产构建收据中的 loop、bookmark-actions、workflow-view、current-page-refs 四项源码 SHA 与实读文件一致；构建收据记录 `sourceDriftDuringBuild: []`。这证明该构建输入，不能替代安装后运行验证。
- [production-merged-build.log](production-merged-build.log)、[development-merged-build.log](development-merged-build.log)、[check-merged.log](check-merged.log)、[verify-merged.log](verify-merged.log) 记录通过。生产包 hash：`15e17f489da8798d8e3dfc603ba866cf88e544990c78fccd39d11a8c6891c19e`；开发包 hash：`81edd7e58ba2606081d00784a4a52d6fcb386e873113c792c717fedcdcdf7aef`。
- [ci-current-jobs.json](ci-current-jobs.json)：Run **39687903895**，SHA **07e61ae702f2c600a92cd94b1d4d74cf451ea47e**，`agent-contract`、`agent-build` 均 `completed / success`。旧 run 的失败与早先 queued 快照不代表该基线的结果；本报告未在线刷新 GitHub，也不把此记录扩写成后续所有 main 提交的 CI PASS。
- [final-merged-real-original.json](final-merged-real-original.json) 已落地，精确原始请求一次 trusted Send，两个模型决策、两个动作，目录复用、新 URL 一次创建及独立树读回成立。最终合并候选再次闭环的缺口已消除。
- [real-logpoint-source.json](real-logpoint-source.json) 记录实际加载的 `ui/tool-shell.js` SHA256 为 `7634e961cd8f2327c00b0cc09eeda7b083403b8f6a4c428e1cacb77f87c6ac20`，与实读生产文件及上述生产包收据对应资产 SHA 完全相同，支持运行入口与候选的绑定。文件中的断点 `locations` 只证明位置可解析，不能单独当成各 label 已执行的事件；业务效果以最终闭环的 SDK 与 Chrome 证据为准。此处也不将单个入口指纹扩写为全部运行中资产均已独立逐项核验。

## 七维独立评分

评分针对本次有限范围，属于审阅判断，不是覆盖率或成功率；源码信心与真实验收分别说明。

| 维度 | 分数 / 100 | 实际依据 | 主要扣分与边界 |
| --- | ---: | --- | --- |
| 功能正确性 | **95** | T1 原始请求创建、T2 目录复用与新 URL 创建、T3 真实两决策两动作命中已有 URL 的执行器复用并零 SDK 写入/零 Chrome 新建，均有独立读回；最终候选原始请求再次闭环；T4 歧义拒绝；本地合并回归 269/269。 | 评分限定于已实测书签闭环；独立目标识别仍有明确语言/句式范围，复杂复合目标会澄清。异常生命周期与完整 T12 尚未全验，不能由此分数推导全面发布通过。 |
| 架构简洁性 | **90** | 复用原 SDK、Host、Authority；schema 修正留在执行前，固定 observation，不建别名或第二授权层。 | prompt 示例、schema、目标识别规则分别维护；loop 时限与引用 TTL 分处常量，后续易漂移。属于维护成本，不是当前安全绕过。 |
| Agent 连续性 | **93** | T5/T6 三个真实模型 turn 串起 search NOT_FOUND → ensure/create → complete；T1、T2 各两个真实 turn；保留原目标和已核实步骤。 | 格式自动修正已有定向回归，未见真实 Provider 再次输出错误 schema 后自动修正成功的运行证据；未知/复合目标仍可能需要澄清。 |
| 异常恢复 | **94** | 特定 T8 已有真实 Chrome 写入后丢 Host 确认、实际 worker stopped→starting→running、UI UNKNOWN 停止、15 秒无重放及刷新/关闭重开后原节点不重复的证据；另有真实 Stop/书签撤权 interrupted 与 Native 撤权晚期零写入。 | nativeMessaging 撤权取消终态/真实晚到结果、书签撤权跨 document 收尾仍不完整。已覆盖这个 MV3 切口，不能扩写为完整 T10 矩阵通过。 |
| 权限与数据安全 | **94** | 原 Send 文档绑定；固定不滑动 TTL；owner/install/document/active tab 校验保留；Chrome bookmarks 撤销后数据清空、对应 Native interrupted；nativeMessaging 实际移除后 UI 拒绝继续，Send 后约 185.8 秒读回仍零写入。 | nativeMessaging 撤权尚未证明取消完成或真实迟到结果被拦；inProgress 快照不能证明进程存活。不能以 UI 文案或零写入观察推断全生命周期安全。8 分钟引用仍须保留所有现有失效检查。 |
| UX 与可访问性 | **89** | 正式安装工具独立标签页 5 宽度×明暗 10 项；实际 Chrome 200% zoom；真实 wheel 独立滚动；键盘 Tab、模拟触摸；已查看 320px 暗色截图。 | 用户明确要求的正式 T12 物理 Side Panel 完整宽度矩阵尚未完成，不能以标签页矩阵替代，也不属于已延期项；未见完整读屏播报与键盘任务闭环证据。长请求混入草稿，只能计滚动证据，不能计搜索成功。 |
| 真实测试证据 | **94** | 已读 Native 清单覆盖 15 case / 19 turn，含最终候选、T3、T8 两次决策及 Stop/书签撤权 interrupted，工件 SHA 一致；T8 有实际写入、worker 状态事件与刷新/重开独立读回；基线 CI、合并回归及双构建/verify 有日志。 | 特定 T8 缺口已关闭，但 T7、T11、完整 T12 与其余未完成项并未因此覆盖；Native 撤权终态/真实晚到结果、HTTPS Responses 等边界仍在。证据质量提升，整体未完成范围不变，保留 94。 |

## 真实证据逐项裁决

1. **T1：真实闭环成立。** [t1-real-complete.json](t1-real-complete.json) 记录精确原始中文请求的一次 trusted Send，两个模型决策、两个动作；[t1-independent-chrome-readback.json](t1-independent-chrome-readback.json) 记录实际目录 `6` 与当前页书签 `7` 的 Chrome 创建事件和树读回。Send 到完成约 125 秒，支持慢推理场景。
2. **T2：真实目录复用成立。** [t2-real-ensure-existing.json](t2-real-ensure-existing.json) 为两个模型决策、两个动作。目录 `6` 复用，新 URL `demo-form.html?bookmark-case=r211-existing` 创建书签 `20`；只有一次 SDK create 与一次 Chrome created 事件，没有新建目录事件。这是新的有效覆盖。
3. **T3：执行器的动作级 URL 幂等复用已获真实证据，旧缺口关闭。** [t3-real-after-explicit-reconnect.json](t3-real-after-explicit-reconnect.json) 的 trusted Send 为 `1792623204562`，完成 `1792623334621`，约 130.1 秒；`modelCalls=2 / actionCount=2`，UI 依次报告复用目录、目标文件夹已收藏该网址无需重复添加、最终已核实。SDK 调用只有 getTree，没有 create；独立 Chrome writes 为空，读回 `1792623334657` 的目录 `6` 保留书签 `7 / 20 / 21` 及原创建时间，没有新增或替换 ID。

   实际 Native turn `01a160ab-76e6-7343-9725-aac4dafa0949` 为 completed（`1792623212→1792623328`），公开计划为 `folder.ensure(title=测试收藏夹,parent=$currentFolder)` + `bookmark.create(title=$pageTitle,url=$currentPage,parent=$lastFolder)`；后续 `01a160ad-4435-71c2-b767-71ef9d23aed6` 为 completed（`1792623330→1792623334`），计划核验 folder.exists 与 bookmark.inFolder。直接读取公开 agentMessage 与最终 Native 清单一致。`bookmark-actions.js:295` 附近的已有 URL 分支会重新读树核实、产生 VERIFIED_REUSED observation，然后 continue，跳过 `write('createBookmark',...)`。模型计划、UI、仅 getTree 的 SDK 记录与独立树共同支持实际命中该执行器分支，**不称 SDK create 已派发后复用，也不要求发起会制造重复的 Chrome create**。

   旧 [t3-real-idempotent-actions.json](t3-real-idempotent-actions.json) 仍只是一个模型决策、零动作的完成核实；[t3-real-explicit-idempotent-action.json](t3-real-explicit-idempotent-action.json) 为撤权后真实 Send 被守卫拒绝，零模型回合、零 SDK 写入、零 Chrome 新建，属于预期授权保护，**不计作 T3 复用验收，也不计作模型直接 complete**。此次关闭缺口仅依据重连后这个不同文件及其实际 Native 计划。
4. **T5/T6：真实搜索后的连续执行成立。** [t5-t6-real-continue.json](t5-t6-real-continue.json) 与 [t5-t6-independent-readback.json](t5-t6-independent-readback.json) 支持 search NOT_FOUND 后继续 ensure/create，最终核实，而非搜索未找到就结束。三个真实 turn 的计划序列有元数据对应。
5. **T4：安全澄清成立。** [t4-real-ambiguity.json](t4-real-ambiguity.json) 的模型虽提出写计划，歧义 guard 阻断，零 SDK 写入；不计成功收藏，也不计功能失败。
6. **Native 真实性：已读清单与直接核对相互吻合。** [real-native-turns-final.json](real-native-turns-final.json) 现为 **15 case / 19 turn**，各 case 主工件 SHA 均与实读文件一致。T1=2、旧 T2/T3=1、T5/T6=3、T4=1、新 T2=2、旧零动作 T3=1、最终合并候选=2、重连后动作级 T3=2、T8=2，共 16 个 completed turn；书签撤权与新在途 Stop 各一个 interrupted；Native 权限撤销一个 inProgress 持久记录；旧 Stop/close 与撤权后拒绝的显式请求共三个 case 零关联。全部有记录的 turn 均为 `gpt-6.1-sol / openai / Codex 0.159.2`。结合 trusted Send、SDK 调用及 Chrome 事件，足以支持真实 Native 运行；不是仅凭“no mocks”声明。持久状态不是操作系统进程探测，该本地元数据也不等同 Provider 服务端审计证明。
7. **T9：真实在途 Stop 的旧缺口已消除；不同撤权与生命周期场景仍须分开。** 旧 [t9-real-stop.json](t9-real-stop.json) 没有 Native turn 关联，其局限只适用于那次旧尝试。新增 [t9-real-inflight-stop.json](t9-real-inflight-stop.json) 记录 trusted Send `1792622782784`、trusted Stop `1792622787298`、读回 `1792622799314`，Stop 后约 **12.016 秒** Chrome 零写入。直接只读查得对应 `01a160a4-ef61-7840-a54b-72146ab62525` 为 **interrupted**，`started_at=1792622784 / completed_at=1792622787 / duration_ms=2953`，支持真实 Native 请求在途期间的 Stop 中断，而非仅发送前取消。元数据终态不等同操作系统进程已被 kill。

   [t9-real-bookmarks-evidence.json](t9-real-bookmarks-evidence.json) 关联 trusted Send `1792622026298`；直接只读查得 `01a16099-6338-71f0-9409-bab1ced450f5` 为 **interrupted**，`1792622027→1792622030 / duration_ms=3262`。结合其引用的 [t9-bookmarks-document-after.json](t9-bookmarks-document-after.json) 与 [t9-bookmarks-independent-after.json](t9-bookmarks-independent-after.json)，支持 Chrome bookmarks 权限消失、数据清空、该请求对应 Native 中断和观察期零写入。工件原有 classification 中“model interrupt not independently proven”已被本次直接元数据核对补足；跨 document 驱动未完成仍是采集缺口，不能称完整 case PASS。

   [t9-real-inflight-native-revoke.json](t9-real-inflight-native-revoke.json) 记录 trusted Send `1792622835471`，观察时权限中 **nativeMessaging 不存在**，UI 显示“本轮模型权限已撤销；迟到提议已丢弃”，读回 `1792622851987` 为零写入，支持本地撤权守卫及约 12 秒观察窗口。新增 [t9-native-revoke-late-readback.json](t9-native-revoke-late-readback.json) 在 `1792623021238`，即 Send 后 **185.767 秒**，仍记录 nativeMessaging 不存在、Chrome writes 为空，扩展了零写入观察窗口。对应 `01a160a5-bec5-7412-be61-b075434e97e3` 在本次元数据查询及更新清单中为 **inProgress**，`started_at=1792622837 / completed_at=null`；这可能是断连接后未更新的持久快照，**不能据此断言进程仍存活，也不能宣称取消完成或 Native 已 kill/已中断**。同样，零写入及 UI 文案不能替代真实晚到提议已经返回并被验证丢弃的证据。

   上述三个 turn 的 metadata 均为 `gpt-6.1-sol / openai / Codex 0.159.2`；直接查询只读取 `resume-runtime.json.codexHome` 下 `thread_history_1.sqlite.thread_turns` 的状态/时间/标识和 `state_5.sqlite.threads` 的模型/Provider/CLI 版本，连接为 `mode=ro`，未读取消息内容或凭据。更新后的 `real-native-turns-final.json` 已收录这三个尝试，与直接核对一致；旧 case 的“零关联”不能继续代表新增 Stop。

   [t9-real-close.json](t9-real-close.json) 仍只支持真实文档关闭及约 12 秒零写入，未构成重新打开/worker 重启完整证明；其余未测生命周期不因本次 Stop 补证而升级。
8. **T12：安装态标签页 UX 证据成立。** [t12-installed-tab-viewport.json](t12-installed-tab-viewport.json) 的 320/360/400/440/960 明暗 10 行均通过，记录 body 宽度与视口相等、composer 底部可见；另有真实 Tab 与模拟触摸记录，非物理触屏硬件。[t12-chrome-zoom.json](t12-chrome-zoom.json) 为实际 `getZoom=2`，[t12-zoom-layout.json](t12-zoom-layout.json) 提供布局。后者 composer bottom 为 400.5、视口高 400，不据此声称像素级完全无溢出，也没有证据认定它阻断操作。[t12-real-independent-scroll.json](t12-real-independent-scroll.json) 中日志 top 65.25→0 时树保持 0，树随后到 300 时日志保持 0，支持独立滚动；请求混入先前草稿、模型澄清，不计真实 search 成功。
9. **最终合并候选：精确原始请求再次真实闭环成立。** [final-merged-real-original.json](final-merged-real-original.json) 中 request 为“把当前页面放入测试收藏夹，如果没有，就创建目录”；唯一 Send 事件 `trusted: true`，时间 `1792622569489`。完成记录 `modelCalls: 2 / actionCount: 2`，时间 `1792622695137`，历时约 **125.6 秒**。SDK 仅一次 create；Chrome 在 `1792622691318` 记录创建书签 `21`，父目录 `6`，URL 为 `http://127.0.0.1:43111/demo-form.html?bookmark-case=r211-final-merged`。独立 getTree 读回时间 `1792622695262`，原目录 `6` 的创建时间仍为 `1792620137066`，含新书签 `21`，支持目录复用、仅新 URL 一次写入及完成后读回。新 URL 属于新增书签场景，不能计为已有 URL 的动作级复用。更新 Native 清单已关联两个 completed turn：`01a160a1-bb02-7361-843d-77a8cdc7e16d`（`1792622574→1792622689`）及 `01a160a3-8531-7ff0-bdcb-a13e25276f0c`（`1792622691→1792622694`），模型计划依次为 ensure/create 与 complete；该次独立 Native 关联缺口已消除。
10. **T8：这个具体“已写入但 Host 确认丢失”的故障及其 MV3 切口通过。** [t8-real-lost-ack.json](t8-real-lost-ack.json) 中唯一 trusted Send 为 `1792623701857`（驱动 sentAt 为 `1792623701860`，不能混作两次 Send）。SDK create 一次，时间 `1792623714412`；Chrome 实际创建节点 `22`、父目录 `6`、URL `http://127.0.0.1:43111/demo-form.html?bookmark-case=r211-lost-ack`，created 事件为 `1792623714482`。断点实际命中于 `1792623714486`，结果对象包含真实节点 `22`；独立页面 getTree 在 `1792623714487` 已读到它，早于 stopWorker 请求 `1792623714488`。这支持写入完成后、Host 确认前切断的实际故障，而非纯异常模拟。

    绑定入口 `platform/context-menus.js` 的已加载 SHA `08ff9cce09b9feadb09dd6f3ceead214016747dd3918deb086cc5cccd8ae4e7f` 与实读生产资产及包收据相符。目标扩展 worker version `6` 的 CDP 事件确有 stopping（`1792623714491`）、stopped（`4492`）、starting（`4747`）、running（`4883`，同一秒前缀 `179262371`）。targetId `5E8D3243CB9D2CBAA28CA71806534163` 复用，因此只裁决实际 worker 停止/重启，**不声称 target 消失或更换身份**。

    到 `1792623729493`，即 stopWorker 返回后约 **15.002 秒**，SDK create 仍一次、Chrome created 仍一次，URL 仅节点 `22`。当前请求 UI 显示“已核实 1 步，其余未完成”“写入结果尚未得到完整确认，已停止后续操作”，本轮 `metrics=[]`；因此目录复用这一个已确认步骤没有被抹去，未知写入没有被标成成功，也未自动重放。

    [t8-real-refreshed-readback.json](t8-real-refreshed-readback.json) 记录实际刷新后的独立 Chrome 读回 `1792623833521`：URL 仍仅节点 `22`，写事件仍只有最初那一条，累计 SDK create 仍一次、无新增 Send、`metrics=[]`，当前请求仍无成功完成宣告。[t8-real-reopen-readback.json](t8-real-reopen-readback.json) 记录实际关闭文档、toolbar 重开并打开原已安装工具，`1792623894725` 时 URL 仍仅节点 `22` 且创建时间未变，打开后的写事件为空、busy=false；新页面 URL 的 hostInstanceId 为 `a8533c80-02e8-407e-a9aa-b60414372ad8`，不同于故障前 `f275012d-83b0-4daa-9bae-7334a8f6782f`。工件记录没有新 Send，不把两份工件各自的事件窗口误读成“最初从未发生写入”。

    Native 清单另关联 `01a160b2-f5ad-7421-8893-9819434e36c2`（completed，`1792623703→1792623708`）及 `01a160b3-0ab7-7fc2-8977-5569ef995571`（completed，`1792623708→1792623712`）。第一轮提出 complete，随后真实计划为 ensure/create；动作计划后未观察到模型 complete，也无运行 completed 指标。第一轮提议不是最终成功，不能以其存在抹去后续 UNKNOWN。其具体重规划原因未另行调查。

    **边界：通过的是本次真实写后丢确认→worker 停止/重启→UNKNOWN 停后续→刷新与文档重开无重放；不自动推导完整 T10、T7、T11 或完整 T12 通过。**

本次新增两件工件 SHA256：`final-merged-real-original.json` 为 `14c6c6d0a4585c4b2bf0e43c4cff33aefc93ef755456d55fce2fdbc614057fb7`；`real-logpoint-source.json` 为 `751bf0ffdc5c4df5debfcfae4574e445c17c63c072290fe09d019e58e5e508e5`。

T9 增补工件 SHA256：`t9-real-inflight-stop.json` 为 `40bde666723adece2e5e644a84a5e869432237920a7864eb51022d72e8158d61`；`t9-real-bookmarks-evidence.json` 为 `baa4535d4c56b324e261fc41240abbc9f5bd67d4c149a2cea145497649f3436f`；`t9-real-inflight-native-revoke.json` 为 `57e43c5a6b885f5d2ecb6d83fd73bb05bbe46ce85fe70d5c2392441219ef3b59`。

本次终审截面的 Native 清单 `real-native-turns-final.json` SHA256 为 `7d7b87b88536035200828f558e3102928b54a36429e42d4484b7d7ee9d22cab5`；晚期读回 `t9-native-revoke-late-readback.json` 为 `18cb5a3d592c0c3834d032546b2b445ee9812d4ddcc9582e3caee1997d079cec`；撤权拒绝的显式请求为 `6162274a3fd8bb16909650b5bbc8c61ec5a4e1430284a0cf0e6feede9ca60d95`；重连后真实 T3 `t3-real-after-explicit-reconnect.json` 为 `9cef893af3580b6f06c857fb34bbc3b9342e4ce235c18378a883b0a8e98fefaa`。若并行 owner 后续更新同名工件，应按新截面复核，不能将本次结论自动套用。

T8 三工件 SHA256：`t8-real-lost-ack.json` 为 `f9aafb5f7be5c8d4f09a1f7505fcb122e01e2b3d6dd69ee0baeb20e2492eff38`；`t8-real-refreshed-readback.json` 为 `285e870e75e6feb70cf5024ff3e05d46fe7413117ec2af6ed48c79ecbc90a3f8`；`t8-real-reopen-readback.json` 为 `4a12fae8b781ab5804b62f9cbc124cee7ac00bff0835c9e8615ef6a242d8a57e`。

## 源码与安全裁决

**执行前格式自修正无新增 blocker。** `bookmark-agent-loop.js:99` 附近只把执行前 `validateBookmarkPlan` 的 `E_CONVERSATION_SCHEMA` 转成固定 `validation / INVALID` observation；不转发无效原文，不执行有效前缀，不接受 kind/type 别名。后续仍受原授权、轮次、动作、时限与无进展守卫限制。执行阶段异常不会借此重新播放已发写入。`workflow-view.js:1635` 附近已明确 action 的 `type` 与 completion 的 `kind`，并提供 JSON 示例。

**固定 8 分钟引用 TTL 无具体安全阻断证据。** 在已审材料中未发现不可替代的公开“当前页引用必须 60 秒”合同；菜单票据的 60 秒是另一对象。`current-page-refs.js` 保留相同 owner/document 的重复 issue 不延长到期、480000ms 固定上限、异步校验后再次查过期和引用有效性、tab/document/URL/window/安装身份检查以及 invalidate/revoke/内存丢失失效。定向测试包含 120 秒、边界、重复获取不续期、异步跨界及旧身份/换文档拒绝；此次不重跑。不能在模型后重新 capture 替换 Send 绑定。

引用期限从首次 issue 起算；同一引用已存在一段时间后，新 Send 未必还有完整 8 分钟。遇到过期仍应停止、明确已完成部分并由用户重新发起，不能为了持续执行自动刷新身份或重放 UNKNOWN。此限制不否定本次固定 TTL 修复。

## 合并回归唯一失败的分类

[merged-contract.log](merged-contract.log) 的 268/269 是真实历史失败：`workflow-direct-execution.test.mjs:105` 期望 `E_AI_UNREQUESTED_ACTION`，实际在 `direct-execution.js:114` 先抛 `E_AI_MISSING_ACTION`。原请求含“点击搜索”，模型只有 fill，同时满足“未请求填写”和“缺搜索点击”；新 guard 在执行前首先拒绝后者。**这是测试输入耦合与错误码优先级冲突，所见路径未发生执行放行。**

`07e61ae70` 仅将该测试请求“点击搜索按钮”改为“点击预览按钮”，继续断言未请求填写被拒绝，生产 guard 未变。[merged-contract-final.log](merged-contract-final.log) 为 **269/269 PASS，0 skip**；最新 CI 同 SHA 两 job 成功。该项不再列为当前 blocker，也不能把旧失败日志删除或冒充当时全绿。

## 最紧急的具体剩余事项

以下主要是验收缺口，不是已经证实的产品故障；应按对应 owner 采集，不扩展为全仓扫描。

1. **正式 T12 完整宽度矩阵：** 用户明确要求的实际物理 Side Panel 宽度矩阵尚未完成，应按本轮正式验收范围补采对应宽度、明暗及适用缩放的真实侧栏记录，核对输入、焦点、可见性和独立滚动。现有已安装独立标签页十项与实际 200% zoom 保留有效，但不能替代物理侧栏全矩阵。此项为尚未完成的正式验收缺口，不写成延期或 OUT_OF_SCOPE。
2. **原生撤权终态与完整晚到结果：** 真实在途 Stop 已有 interrupted 与零写入证据，不再作为未测项。nativeMessaging 撤权已有 Send 后约 185.8 秒零写入；持久记录 inProgress 不能判断进程活性，应补采可确认的取消/断连接终态或真实晚到结果被丢弃的证据，以及后续无重放收尾，不能以 UI 文案替代。书签撤权虽已补足 Native interrupted，跨文档重新获取观察目标后的完整 case 收尾仍待补齐。
3. **保留其他验收边界：** 本次 T8 已关闭特定真实写后丢确认、worker 停止/重启、刷新与关闭重开无重放的缺口，不再以“完全没有 UNKNOWN 或 worker 重启实证”扣分。T7、T11 及完整 T12 的原未完成项保留；完整 T10 不由这一 MV3 切口自动通过。本次不扩大或新增矩阵。未测试的 HTTPS Responses 路径仍为 NOT_TESTED。
Stop/书签撤权、最终重跑、重连后 T3 及特定 T8 的 Native 清单关联已经完成；T3 执行器复用与 T8 故障后的刷新/关闭重开无重放均从对应待办移除。先前被撤权守卫拒绝的显式请求仍单独作为授权保护证据保留，不与重连后成功 case 混算。

物理 Side Panel 全宽度矩阵尚未完成，不能由本次标签页证据替代；本轮没有明确延期该正式验收要求。模拟触摸也不能扩写为物理触屏实测。此前报告将 T12 写为“按当前明确延期安排”不符合本轮范围，本次已纠正。

**最终意见：限定源码审阅信心较高；真实核心闭环、T3 执行器复用、在途 Stop/书签撤权中断，以及本次特定 T8 写后丢确认与 MV3 重启、刷新/重开无重放均获证据支持，业务基线 CI 与合并回归已通过。本次恢复 92→94，其余维持：功能 95、架构 90、连续性 93、恢复 94、安全 94、UX 89、真实证据 94。T7、T11、完整 T12 及其他明确未完成边界保留，完整 T10 未由单一切口覆盖；Native 撤权 inProgress 快照仍不证明进程存活或取消完成。功能单项达 95 不代表七维全面 95+ 或完整正式验收通过。**
