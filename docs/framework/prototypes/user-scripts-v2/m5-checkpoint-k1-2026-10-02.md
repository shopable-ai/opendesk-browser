# K1 / F1 M5 新 checkpoint

阶段0已由主 writer 放行；批准 round4 manifest：`dd50a5098d247f594ab2234b9946c0004ce427ea8d6cb1abd130931c3bcecda1`。

最终原型候选：`2edcc1b0ca37f22a21105255cf90a02f1fa1b4a6e72081fa23d816708ee3a036`。只用 R4 当前源码证据；不累加历轮计数。状态为证据就绪、独立资格判决 pending，未写公共 gates 或产品 src。

|实际版本|case pass/fail|userScripts.execute 实际调用|API 不可用、未进入 execute|adapter 预校验 case|固定 MAIN scripting 调用|
|---|---|---|---|---|---|
|138.0.7204.183|80/5|99|1|7|3|
|154.0.8037.92|80/5|99|1|7|3|

上述计数不是后端成功数。每版按每例保留的输入分账：raw包装入口尝试100次，其中1次API未开放；实际execute 99次（90 resolved、9 rejected），resolved 包含原生错误的 null 和撤权队列在旧 doc 消失后的 null，不等于功能通过。最终host trace只有99条，因SWITCH-ON显式reload清除了此前未进入API的一条；每例快照保留100条总尝试。另有固定 MAIN scripting.executeScript 3次（1成功、2旧 doc拒绝）。7项 codec/source/target预校验无 execute 调用。

真实 UI 撤销/恢复、开关 pending/原生完成后竞争、code/file 精确 top/同源/跨源 doc、双 world typed 值/错误、CSP 网络正负对照、旧 doc与固定 callback竞争均有实际证据。每版22次 UI改变的实际 host document/timeOrigin未变；不能声称已测自然宿主重建，更不能把 fixture fence 称为产品 broker fence。

保留5个 required失败：USER_SCRIPT/MAIN原生throw/rejection四项仍 result:null、无error；manifest required host remove仍报错。typed wrapper成功单列。旧 removal 后的request成功明确 restorationProven=false，真实恢复只由新 UI case证明。撤权直调native在1秒观测期限仍 pending，旧doc离开后 resolved null；不能称为native拒绝。

r1 的context closed来自本lane为结束卡住工具而终止自己创建的两个Chrome进程（54154/54155）；不是页面函数机制不可行。154的aria-pressed单属性与异步等待误判均已修复并重跑。r1及全部旧失败原样保留。

源码仅改 runner、fixture/adapter.js、fixture/host.js：真实权限检查/事件fence，有界原生观察，实际host身份，版本UI读取与严格调用分账。fixture没有重写，manifest/依赖/共享浏览器目录未改。

两版均无 initializationFailure、其他必需case失败；pending/barrier/观察timer/raw pending回0，context/server关闭、hold为0。最终每版34个evidence文件逐一核hash、源码与冻结输入hash一致；旧checkpoint和4个旧report hash一致；无本lane浏览器残留。三处源码语法检查通过。完整证据、环境/二进制hash、case输入/预期/actual、effect/delivery/cleanup与hash见相邻JSON。

待独立F1复核判定原生shape及撤权pending对承诺合同的影响，并由主writer合并control lane；本lane未批准backend/F2，原型不计产品迁移。
