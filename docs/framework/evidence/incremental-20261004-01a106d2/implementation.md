# 增量实施边界

唯一写入者：01a106d2-54e6-77a3-823d-c9891df8e0e4。前任明确 released，交接与收到的未提交差异已保留。旧 development 树与 ZIP 不一致，双包均不能代表本轮源码。

| 顺序 / 用户问题 | 涉及模块及职责变化 | 保留行为 / 不扩张范围 | 回归与可观察完成条件 | 回退边界 |
|---|---|---|---|---|
| T2 同名键覆盖、clear 跨区 | repository 分区；SDK 边缘保持旧返回，内部 typed outcome | AppStorage String/缺失 null；Chrome local typed/缺失 undefined；AppLocal session 生命周期明确保留差异 | 同名双写、独立 clear、撤权和重复请求；历史 user 行不猜归属 | 只回退本轮 diff；不清理历史行 |
| T3 断线与收尾丢失 | HostClient 同身份重绑；RunHost 物理停止与持久结算分开；启动逐宿主核对；Blob revoke 与确认分开 | 不重跑脚本、不重发未知效果；原生查询失败保留 unknown | 断 Port、丢 finish 响应、后台不可达、本地停止、资源收尾证据 | 不删除持久事实；保留稳定请求 ID |
| T4 Worker 缺少网络/存储 | Worker 薄门面经 context/broker 共用适配器 | ChromePage 基础功能不改；run 授权与 SDK document grant 分开；无 Chrome 权限、无 SW eval | 正向网络/存储、权限前后核验、unknown 不重发 | 门面接线可独立回退 |
| T5 重开后状态与导出 | 工作台读取持久投影；本地状态不宣布后台完成 | 保留普通脚本、不可变版本、typed-json 和禁采集工作能力 | 重开结果、下载提交/complete/实际文件 hash 分别验证 | 不自动重建未知 attempt |
| T6 当前候选证明 | 定向回归→全检查→双包→冻结→受控原生→独立复核 | 原 603+19、适用 1000/10/2 不删不放宽 | 同源码/验证输入/包树/ZIP；失败和未测如实登记 | 原候选证据永久保留 |

## 合同冻结与未关闭范围

| 功能 | 本轮起点判定 | 依据 / 边界 |
|---|---|---|
| 四服务 log/getTime/bexUrl/requestResource | 已实现；部分差异 | log 仅元数据；固定资源校验；旧任意远程资源与失败 resolve 合同未等价 |
| 普通 ChromePage 操作 | 复用，待当前候选验收 | 小改底层接线，不重造浏览器 API |
| AppStorage / Chrome local | 已确认共享 user 键空间缺陷 | 新区域分离；历史归属未知且覆盖不可逆 |
| AppLocal | 生命周期差异 | 当前 storage.session，旧后台 globalThis |
| axiosx | 待实现约定子集 | get/post/put/delete；完整后台 Axios 未证明 |
| Worker 存储 | 新增能力 | 不称为旧 Worker 功能恢复 |
| $ / $$ DOM 克隆 | 未解决 | snapshot/$eval/句柄不等价 |
| MAIN 同步无限循环 | 未解决 | Worker 停止不是 MAIN 停止，不关闭借用页无法保证 |
| executeScript / executeInBg / 远程资源执行 | 未解决 | 不恢复 SW eval，不把拒绝计成功 |
| recorder / console / remote tasks | 独立业务，尚无迁移证明 | 旧 UtilRecorder、TaskConsole、SCRIPT_RUN 消费者仍需合同范围判定 |
| CSDN / focus | 独立业务，尚无迁移证明 | 专用登录/跨域服务、页面路由和黑名单消费者；不自动搬整个旧应用 |
| 历史用户脚本 | 未知 | 未取得正文，不能声称全部兼容 |

原 603 个用例、19 补充项和 B05 历史失败保留。组件拒绝用例只证明边界，不替代正向原生入口。
