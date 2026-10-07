# 串行交接至 01a106d2-54e6-77a3-823d-c9891df8e0e4

已核实新聊天直接人类授权（handoff-authorization.json）；安全步骤收尾，唯一写权释放。原 owner 仍为 01a1067b-a17b-7870-8ca4-92af03c934f5，接续聊天自行登记。所有子 agent 已关闭；无在途构建/测试/launcher，无本 run 浏览器/profile/server/端口，未终止他人 PID 或操作个人 Chrome。当前 Goal 未完成，产品执行停止，释放后暂停原 Goal。

旧功能变化：四服务沿用接收实现；工作台解除采集面板强制初始化、普通 JS 显式禁模板；现有 SDK 原生输入补入旧门面/真实 completion/.data/资源 bytes-SHA/截图；B05 修 CP1 精确 call、F018 新 SW 启动观察及原 deadline；原 27 控制 case 保留并接入显式 1000/10/2 campaigns。WXT 最终 checker 已适配全 src、全 scripts 与实际配置来源，保留逐文件字节/SHA/漂移拒绝。

未完成：六资源快照只完成 client、Blob registry、controller 的部分 bookkeeping，组合接线补丁因匹配失败完全未应用；RunHost/editor/工具页全局入口均未接，controller 六计数方法未加。只做两受影响文件语法收尾检查；该部分未完成整轮组件/构建或原生验。不要把部分实现算作功能完成。

组件 476/476 属于上述诊断修改前；checker 受影响 35/35 后续通过，首次 fixture 失败原文及修复后输出保存在 checker-component-raw-commands.json。正式当前候选原生闭合 0/603、19 补充项原生待验，未有本 run 功能截图，F3=false。原 B05 3PASS/7FAIL/8NOT_TESTED 历史失败永久保留，修复输入尚未原生复验。

当前实际身份（完整逐文件 rows/bytes/SHA、包树与 ZIP、所有输入改动见 handoff-candidate-identity.json）：

- src SHA：7747bfb006345e89bfecce41afa52f57c5ee24cd1884af152f85d2441f4c739e
- 产品输入 SHA：c939ace2931a1e4e66e2fd5f93b16228bb11aab489f5063f869696ae7d2c71a2
- 验证输入 SHA：b8f7d507bb80fe80380f525726a099794a602e923ecfb978fcfd10d3713b1ec3
- production 树：a24b4c7fff62a9ebbd97f5b2fe4fd20b7fafdd0cb6ab72fc9995babff346270d；ZIP：d9cf788f277517275846094f270bdcf315976a81c879b040bf074177d68c3b5a
- development 树：5ba804a788a1cb407601e6ab3ae079fa8e11d6ce19da94d52cc90f1cd46f4364；ZIP：439f549fc5b432556e6fd8913377aed257b632c97a975769c745738ed0b3e323

本 run 未发起显式 build 命令。生产包树/ZIP与接收时相同；释放复核发现 development 树有11个文件与接收时不同（ea1a5968…→5ba804a7…），ZIP仍为接收时字节，来源尚未核清，详见 handoff-package-drift-erratum.json。不得把 development 视为同一树/ZIP候选或继承旧 PASS；当前最终源码双包闭合未完成。未初始化 Git，无 commit；以下列出相对接收交接的全部产品/验证输入差异，元数据与本目录新证据另已列入身份回执：

- docs/framework/public-owner.json (changed)
- src/platform/downloads/blob-lifecycle.js (changed)
- src/platform/host/client.js (changed)
- src/run-host.js (changed)
- src/scripting/sandbox/controller.js (changed)
- src/ui/script-editor.js (changed)
- src/ui/tool-shell.js (changed)
- tests/framework/acceptance-evidence.test.mjs (changed)
- tests/framework/b05-native-observers.mjs (changed)
- tests/framework/b05-native-observers.test.mjs (changed)
- tests/framework/b05-product-acceptance-20261003.mjs (changed)
- tests/framework/k3-controller-authority.test.mjs (changed)
- tests/framework/k5-controller-native-campaigns.mjs (new)
- tests/framework/k5-controller-product-native.mjs (changed)
- tests/framework/k5-sdk-admission-abort-native-selector.mjs (changed)
- tests/framework/k5-sdk-legacy-consumers.mjs (new)
- tests/framework/k5-sdk-native.mjs (changed)
- tests/framework/verify-product-acceptance.mjs (changed)

继续依据：本目录 function-implementation.md、controller-campaign-implementation.md、原始组件日志、当前输入身份；独立目录的 final-f3-readonly-checklist-20261004.txt、final-f3-evidence-contract-20261004.json、final-f3-required-ids-20261004.json 已准备，未执行独立原生。必要合同正文已补读，但原 603 逐 case 完整语义复核和原始附件复核未完成，contract-coverage-readonly.md 未落盘，不得冒称审签。按新聊天最新人类增量重构指令实施，不恢复本聊天旧 Goal，不重做阶段0/F1方案评分。
