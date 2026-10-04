# 暂停 checkpoint

用户明确暂停 Goal，2026-10-02 停止此 lane。未恢复 Goal，未进入 F2，未改产品或 gates，未写 user-control-v2 或旧 ex08 证据。已有全部四次运行均完成 browserContext.close 与 loopback server.close；暂停后未新启浏览器或测例。

## 已经实际验证

唯一功能轮使用 headed Chrome for Testing **149.0.7827.55** 与独立新 profile，扩展 ID `ndjfjgagpdcenfgedcjomjcobgfppjnl`。三个其他轮仅观察 Chrome UI，并非功能通过证据。

|用户要求|实际操作|实际结果|证据|是否通过|
|---|---|---|---|---|
|授权开/关|扩展详情 UI 切 Allow User Scripts，重新加载扩展 host|关时 API 不可用且无 mutation，开后执行成功|功能轮 report/截图/console|该轮通过|
|精确 document 与 code/file|两 world 注入真实同源/跨源 iframe document，校验 ID 与负对照；真实 packaged file|只改变所选 document；非法 code+file、空源、func/args、doc+frame、缺文件拒绝|raw-injections.json 与 report|该轮通过|
|Promise/error/undefined|分别执行原生和 typed wrapper|wrapper await、throw、rejection、undefined、闭包 ReferenceError 取得证据；原生诊断有下列失败|report 与 console|wrapper 通过；原生失败分列|
|撤权|实际 fetch hold barrier 后关闭 UI 开关|新执行拒绝；已发执行仍产生页面效果并返回原生成功，adapter 实际授权检查拒收结果|report 两 world SWITCH-REVOKE-INFLIGHT|fence 通过；不承诺撤销执行|
|旧 document 竞争|pending 时实际导航，取得新 documentId|旧执行/固定 MAIN callback 拒绝，新 target 可执行；旧结果被拒收|report 两 world OLD-DOCUMENT-RACE|该轮通过|
|固定 MAIN 回程|包内 scripting.executeScript func/args 独立 API|同 document callback 一次返回|PACKAGED-MAIN-CALLBACK|该轮通过|

功能轮路径：`tests/prototypes/user-scripts-v2/evidence/2026-10-02T15-18-06-447Z-installed-cft-149-90b95412/`。记录 46 actual / 5 failed，**该计数不代替能力证明，userScriptsRequiredCasesPassed 仍为 false**。actual 中七项是 pre-dispatch adapter 校验，不属于真实浏览器 backend 执行证明；HOST-PERMISSION-RESTORE 的前置撤权失败，其成功请求不能证明真实恢复。

## 真实失败与限制

- 两 world 原生同步 throw 与 rejected Promise 均返回 `result:null`、没有 error 字段，四个失败期望原样保留；typed wrapper 的错误出口独立实测成功。暂停期间未调整必选/可选分类。
- 对 manifest 必需 host_permissions 使用官方 permissions.remove 抛出 `You cannot remove required permissions.`，第五个失败保留。准备改用 Chrome 站点授权 UI 的方案尚未实施或验证。
- 原生 undefined 实际返回 null；typed codec 单独保留 undefined。
- trace 的 dispatchCount 是共享 trace 差量，并发观测可能增加计数，不能据此证明单操作 Chrome dispatch 次数。这里没有 F2 原子准入或产品 journal。

## 未测

138 全矩阵、普通 Chrome154 实际安装/加载/矩阵、host 权限实际 UI 撤销/恢复与 pending 竞争、world/page CSP 变体、最终独立复核、完整 F1 判决。F2/F3 与 Worker/CSP/RPC/终止不属于本 lane。未测是暂停后的待办，不解释为缺少必需前提。

普通 Chrome 只读 plist：`/Users/shopme/Applications/Google Chrome.app` 为154.0.8037.97（KSChannelID universal），foundation 下普通版为154.0.8037.93；未在这两个实际浏览器运行，不据此宣布稳定版支持。并行取得官方 CfT feed 指向 Stable154.0.8037.92 与 milestone138.0.7204.183；下载只有部分文件，没有可执行测试证据。

## 文件与 hash

新增源码仅 `tests/prototypes/user-scripts-v2/run-headed.mjs` 和 `fixture/{manifest.json,sw.js,host.html,host.js,adapter.js,file-source.js}`；各轮保存 candidate manifest、raw results（功能轮）、report、console、HTTP 日志、PNG 截图及 evidence manifest。另有隔离 profiles、浏览器获取 provenance/partial archives。文档仅此目录 plan/checkpoint。

功能轮 candidate SHA256：`6ec4f7d8f83b1bc9dd1b17fde991fe015e387ebb3cc7841a8416f789f216c25a`。

当前 runner SHA256：`12212055d7b7cd348755d76066c82e6db640cb84ccdf665300b9331c3181284b`。功能轮后仅改 UI-probe DOM 遍历以保留 light/shadow children；当前源码未做功能复测，不继承旧 candidate 的通过结果。

[checkpoint.json](./checkpoint.json) 保存每轮报告 hash、当前每个源码 hash、清理与未测列表；[checkpoint.sha256](./checkpoint.sha256) 保存 checkpoint hash。四个 evidence manifest 均逐文件读取核 hash 一致。请求模型 `gpt-6.1-sol/xhigh`，server resolved runtime `unknown`。

恢复必须来自用户明确授权及 Goal resume；此 checkpoint 不开放产品或 F1 gates。
