# 旧功能迁移：当前实现与待验边界

当前唯一 writer：`01a1067b-a17b-7870-8ca4-92af03c934f5`。交接已释放前任写权，无在途构建、测试、浏览器或服务器；依据为前任 `old-features-20261004-01a10654/handoff-to-01a1067b.md` 和独立窗口释放回执。本记录不继承其他候选的原生 PASS。

| 旧调用与来源 | 当前实现、加载入口和实际消费者 | 本轮变化 | 结果、证据与缺口 |
| --- | --- | --- | --- |
| `service.bridge.send('log'/'getTime'/'bexUrl'/'requestResource', args)`；旧 `src-bex/background.ts`、`my-content-script.ts` | 固定 MAIN `entry.js` 暴露 `service.bridge` 与直接 Promise 方法；ISOLATED relay → 现有唯一 broker → `background-services.js`；`resources.js` 保留 `.data` 消费 | 接收前任已实现四服务及真实资源清单；不重复施工 | 已实现、待本候选原生验。必须核对 own undefined、有限时间、真实 runtime 根、success/data、非法字段和路径、真实资源 bytes/SHA 及去重；前任组件及包证据只属于其候选 |
| `ChromePage` 控制、普通 JS 保存与执行；旧 `class/ChromePage` 及公共脚本接口 | `script-editor.js` 保存/选择 revision → `createRunHost` → sandbox Worker → 已有 48 成员 controller/native driver，绑定具体 tab/frame/document；持久结果和下载仍走公共底座 | 编辑器显式 `templateModuleFactory:null`；RunHost 保留默认模板兼容分支，并对禁用/未注册模块返回 `E_MODULE_NOT_INSTALLED` | 三产品文件语法诊断通过；功能已实现、待验。历史 48/48、pin、停止、下载证据不自动绑定本候选。`new ChromePage` 需要受信运行上下文；网页 `executeScript/executeInBg` 按能力合同拒绝 |
| `AppStorage`、`AppLocal`、`axiosx`、`ChromeBridgeOperationCompleted`、bridge；旧独立网页类库 | 页面无 controller → 工作台精确文档授权 → 固定 relay/MAIN 注入 → Hello → Chrome sender → 同一 broker/IDB → 原 Promise | 保留既有真实门面；扩充现有原生验收输入以实际调用旧门面及四服务 | 已实现、待本候选验。持久/会话寿命、HTTP 参数/错误、撤权、导航、重注入、重启恢复均需真实证据；安装截图不能关闭功能项 |
| 采集禁用仍使用通用工作台 | `tool-shell.js` 不再启动 environment host 或强制调用 `module.mountToolPanel`；静态采集状态显示未注册；普通 JS 和网页 SDK 使用原公共 client | 移除工作台启动时的强制模块初始化；页面关闭仍 dispose 原 client 和编辑器 | 已实现、待验。新增现有 controller 组件用例覆盖禁用模板后普通 JS 的真实 Worker 终止/结果/释放；尚未执行该用例 |
| 原 B05 并发与恢复 | 现有 `b05-product-acceptance-20261003.mjs`、原生结构选择器与只读观察器 | CP1 精确 callee.property call 点；F018 在 stop 前布置新 SW 启动观察，核对新 context、源码 SHA、精确位置后恢复；旧请求保留原 deadline，错过窗口明确未测 | 观察器必要语法/纯选择器诊断已通过；原生未复验。原始失败保留在旧 evidence 目录；不得替代 sender、receipt 或放宽未知副作用规则 |

最短使用路径：打开实际工具页，选择具体网页与文档并授权，保存普通 JS revision，选择版本后运行/停止，读取持久结果并下载；独立网页在授权安装后直接调用 `service.bridge.send(...)`、`AppStorage`、`AppLocal` 或 `axiosx`。普通 JS 示例 `return 7` 的预期持久值为 number `7`，本候选实际值与截图将在集中原生验收后补入，当前不记 PASS。

功能齐备后才集中组件检查、串行双包构建/严格校验、冻结源码与验证输入/实际包/ZIP SHA，然后执行原合同原生验收与顺序独立 F3。603 必选、19 补充及适用 1000 轮、10 重连、2 禁插件不删减。当前尚无最终候选，也未完成 Goal。
