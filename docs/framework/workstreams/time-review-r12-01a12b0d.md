# Time Review R1.2 · 01a12b0d

2026-10-11（Asia/Shanghai）。仅本地 main；单写入者，无分支/worktree/ZIP/push。

初始 HEAD 20d009ed9b554f95991992c5a50d10c2fcb157bd；origin/main 本地引用 331a765e28f5fb61e97e4ebf2e7d35fd2f330e8b。初始其他对话 dirty/index 完整保留，快照见 evidence/time-review-r12-01a12b0d/initial-git.json。共享文件改动前备份用于差异归属，不重写他人证据。

## 实施与验证范围

    时间追踪后台：已实施；31项组件回归通过，原生证据待收集
    官方可安装工具：已实施；复用 catalog、打包器与现有详情操作区，独立工具包已生成
    真实 Mac Chrome：NOT_TESTED；新独占 profile 与随机 CDP 端口，前台原生资源仍须实时核查
    本地集成提交：待验证；不得夹带初始他人已暂存差异

旧来源只读；当前未找到 src/time-review 或工具目录，不迁入旧登录/遥测。测试指南跨对话入口已核查，无可复用 Time Review 功能验收。后台新增 fixed classic bundle，保持 SW 320 KiB 门槛。工具 UI 由独立包更新，不建立第二安装器。

拟修改：src/time-review/*、examples/sidebar-tools/time-review/*、后台加载/固定构建合同、现有工具 capability/路由/卸载清理、官方目录与详情操作区、定向测试及文档。通过条件：准确区间汇总与保守恢复、不可伪造宿主/包/文档身份、启停/撤权/卸载不恢复旧授权，实际包与真实浏览器证据绑定。

资源：不操作 R16 CDP43129、Knowledge R24 CDP54047 或个人 Chrome；根 .wxt/development.lock 初查不存在。已有 43111 demo 服务不替换。定向 Node 与包构建不提升为 Chrome PASS；旧原生包证据只作方法参考。

## 组件验证与真实资源协调

`targeted-final.tap`：149/149 PASS（Time Review、工具安装/宿主/启停、官方目录/市场、权限镜像）；`review-fixes.tap`：31/31 Time Review。`check-final.log`：418文件源码/构建合同/CSP检查通过。它们是组件证据，不能提升为原生PASS。

保留首次组件失败、市场计数失败、权限镜像失败和两次构建失败日志。`authority-regression.tap` 的缺失 manifest 是测试与WXT清理dist并发造成的运行器调度错误；改为构建完成后串行运行的 `authority-regression-2.tap` 108/108通过。首次构建因其他任务新增固定入口但扫描器未同步而失败，已修复严格字面值白名单。最新 `build-production-final.log` 因并行云控直接import使SW337115超过327680而失败，已请真实负责人拆分，不放宽预算、不覆盖其代码。

用户明确授权直接协调前台资源。真实拥有Knowledge PID91115的对话01a12ade-23d1-72c2-b81a-8a8afe853c0e确认释放前台、关闭自己的隔离窗口且不计划再次使用。先前匹配到01a12ade-00a1的记录不代表PID91115身份，已纠正。Time Review将使用自己的fresh profile与随机端口，禁止操作其他profile。

独立工具产物：artifacts/sidebar-tools/time-review/1.2.0/time-review.opendesk-tool.json，SHA-256 43bba7615555ccbdc260a58b88c29d88ca0c51b9a68bdd0779fe8f996af1c6fe。生成包不是安装成功证据。

## 暂停检查点（2026-10-11，Asia/Shanghai）

用户中断后原生 goal 当前状态为 paused。Time Review 自有 CFT PID51718 已通过本轮运行器正常关闭并回收自有临时profile；Cloud前台临时交接仍有效，未操作其他浏览器。原始 native/candidate2 记录完整保留。

Side Panel真实sender可缺documentId：旧候选拒绝真实宿主，已修复为唯一原生context并在请求全程固定其documentId，新增两个回归；Time Review33/33通过。integrated-native2.tap：156/156通过；其后新增bridge start/clear确认120秒与host119秒过期保护，尚未复验。当前源码检查与构建不能提升到这两项末次改动。

候选2 production packageHash=e1b858a387586efec72ecc3b06029c0680209c3029779040a77497fbf8f94f2a，67 assets；不可变副本artifacts/time-review-r12/candidate2-extension，SW324074字节，仍小于原327680。development packageHash=f6548b32011d20c46aeeca2e622de8ac3f40ad9e282fa3f65d973ae2a9534248，94 assets；verify-native2.log双包通过。两者均早于末次确认超时修复。并行Cloud获其用户授权将共享SW硬预算改为384KiB，320KiB保留提醒线；不是TimeReview为达成验收放宽预算。Cloud后来误在root启动生产构建并中止，root dist/production需由本轮恢复构建；独立候选2不受其写入影响，不能把root当前目录视为已验证候选。

真实Chrome已观察：原生扩展菜单打开SIDE_PANEL；官方候选审阅与安装；未授权不计时；原生授权idle；开始、两个域名统计、暂停、设置idle15/retention30/排除域名、空闲停止与OS活动恢复。NativeAX及CGEvent/ChromeInput原始操作保留。原生观察确认stopAllWorkers调用未使SW target变更，因此独立SW重启尚未PASS；不得用组件重启结果代替。浏览器重启、导出实际文件、撤权、清空和卸载尚未完成。下载记录仍空，没有导出PASS。驱动的隐藏控件、失焦保护、确认框、超时与Page.enable失败均保留。

恢复前需修正驱动：缓存并在停SW前detach实际worker sessions；frame输入使用宿主根viewport坐标和原生滚动；等待按钮真正可操作后输入；原生确认用AX真实唯一按钮，禁止DOM赋值或synthetic事件。新确认超时需组件回归，最终双构建/verify与新的独立原生候选需同身份完成。磁盘Data当前接近满载，存储/下载失败不能虚报成功。

本轮未创建本地提交、ZIP或远端推送。暂停时main HEAD b30b2192640fd7a77ece31bb0a9d5610fb45487e为其他任务提交，不作本轮交付SHA。剩余：确认超时与驱动修复验证、最新源码构建、完整原生验收、清点共享差异归属、安全独立本地Lore提交。
