# 当前旧功能迁移（唯一writer已交接）

01a1067b-a17b-7870-8ca4-92af03c934f5 已按新聊天中的直接人类授权安全收尾，串行释放写权给 01a106d2-54e6-77a3-823d-c9891df8e0e4，由接续聊天登记自身。无在途构建、测试、浏览器或服务器。当前 Goal 未完成，不恢复旧 Goal 产品执行。

四公共服务沿用交接实现，普通 JS 工作台已解除采集面板强制初始化；旧 SDK 与 B05 原生输入和原合同 campaign 已接入、未运行。此前集中组件 476/476 与源码检查通过，随后 WXT 最终 checker 适配的受影响组件 35/35 通过；六资源只读快照仅部分落盘（client/Blob/controller），未接通工作台总入口，当前源码未完成新的整轮检查与双包构建。正式账本 0/603 原生闭合，19 补充项原生待验，F3 未通过。

本轮逐功能实现、入口、消费者与待验边界见 [当前旧功能记录](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/old-features-20261004-01a1067b/function-implementation.md)。本轮源码已改变，以下包和原生结果均为历史候选证据，不自动继承。

逐功能原调用、旧→新源码、操作步骤、预期/实际、证据与缺口见 [旧功能验收清单](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/old-features-20261004-01a10654/acceptance-by-old-feature.md)。生产候选 a24b4c7f…，MAIN/relay实际bytes/SHA见 [候选身份](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/old-features-20261004-01a10654/four-service-candidate.json)。此前P1–P3通过保留；下述历史原生结果仅归属于各自旧包，不自动迁移为当前包PASS。

# WXT 实施方案与交付记录

实施顺序：先完成产品实现和可运行流程，最后做必要验收。

解决方案：WXT负责MV3构建；业务模块保留，使用11个薄入口显式初始化，保持固定文件路径、classic IIFE、API合同、权限和CSP边界。

1. P1：保全源码、验证输入和旧双包实际字节，提供可恢复基线。已完成。
2. P2：接入WXT，交付production/development实际包；加载SW、工作台、MAIN/ISOLATED脚本与sandbox/classic Worker。已完成。
3. P3：通过真实工作台保存return 7、运行、持久保存、关闭并重开工具页按同runId读取7。两种包均已完成。

生产runId：`be771330-a1b2-44ff-ab0c-a04fbf780266`。开发runId：`6176f71c-3e25-43ed-acdf-480ae331a26c`。两者completed、retirement released，真实Worker创建/销毁，重开读取7。双包和源码无运行漂移；临时浏览器与profile已清理。

交付：[生产包](evidence/wxt/accepted-p1-p3/opendesk-browser-production.zip)、[开发包](evidence/wxt/accepted-p1-p3/opendesk-browser-development.zip)、[实际证据](evidence/wxt/p1-p3-completion.json)、[恢复入口](wxt-progress.json)。

P4—P5 尚未完成；本聊天已停止写入并串行释放唯一产品写权给接续聊天。P1—P3 历史 accepted 双包保留，P6/P7 未执行。

最新运行结果：控制 API 48/48、双宿主竞争及无限 Worker stop/deadline/host-close 在定向原生轮通过；最终完整27项未复验。独立SDK整轮17/17通过，18方法实际调用、真实sender/grant和同profile整浏览器重开通过。原生IDB升级/abort/blocked/重开组件检查通过。共享组件413/413通过，构建与双包校验通过。

B05诊断轮3 PASS、7 FAIL、8 NOT_TESTED，原始失败保留。当前测试观察器修复尚未原生复验；四崩溃点、旧四公共服务、完整旧接口兼容及最终同包F3仍待接续完成。不得用较早验证输入PASS覆盖当前未复验测试修改。

唯一恢复入口：[详细交接](evidence/wxt/p4-p5/handoff-20261004-to-old-features.md)、[当前实际身份](evidence/wxt/p4-p5/handoff-candidate-identity.json)、[SDK/IDB里程碑](evidence/wxt/p4-p5/sdk-idb-component-milestone.json)、[B05原生失败](evidence/wxt/p4-p5/b05-native-diagnostic-20261004-0935/report.json)。
