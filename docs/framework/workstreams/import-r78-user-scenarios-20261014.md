# Import R7.8：四种用户用途

状态：四种用途已取得同包正向证据；正式 95+ 评分为 NOT_SCORED。负责人 Codex chat 01a1364c-33dd-73f1-960d-e8b9fcc496ff，2026-10-14。交付提交与推送结果记录在本任务 evidence/delivery-git.json。

    自动操作网页
      实施：标准零参数 ChromePage + D3；固定 Revision 完整执行字节关联、Load 后来源准备与权限恢复预热修复
      NODE：本轮 Controller / 编辑器 / 依赖 / Locator 175 通过
      CHROME_CFT：同一程序 Locator 搜索与 D3=5、保存重跑、Stop、整 Chrome 重启离线复用、撤权与坏 SHA 拒绝通过
    给网页增加功能
      实施：复用普通 Page D3 和既有 React / D3 / ECharts，不扩展已有网页 UI
      CHROME_CFT：同包普通 Page Import、DOM、真实 USER_SCRIPT 回执、Candidate 保存与安装执行通过
    自定义插件页面
      实施：复用已提交 import-max-probe 固定本地 D3 / ISC 来源与原打包器；保留 v2 多 Classic
      CHROME_CFT：同包导入、审阅、安装、打开、重复打开、卸载、执行世界与版本字节通过
      剩余：无 Bridge 能力示例未主动尝试卸载后的旧实例 Bridge 调用，原生 NOT_TESTED
    定时自动运行
      实施：同一固定 Controller 制作安装任务，复用现有一次性计划、可见 RunHost 与 Durable Result
      CHROME_CFT：真实一次性触发、网页计数 +1、D3=5、同一保存 sourceHash、released / workerRetired 通过
      剩余：此 D3 程序的定时 Stop / 撤权 / 缺失 Host 原生负向 NOT_TESTED；未改调度实现的 Node 安全定向 26 通过
      Cloud Control：NOT_TESTED，无本轮回执，未重构云控

## 写入责任与共享资源

本任务仅 main 编辑、提交、推送，未创建分支 / worktree / PR。下列文件由 leader 独占落盘；写入前检查当前内容和 diff，保留其他会话所有改动与暂存。

- src/ui/script-editor.js、src/ui/page-component-remote.js：三个真实 UI / 固定身份缺口。
- tests/environment/script-editor.test.mjs、tests/environment/page-component-remote.test.mjs：行为及不可信 author metadata 防护、来源权限撤回/恢复回归。
- examples/programs/single-file/controller-d3-chromepage-esm.js、README-import-r78.zh-CN.md。
- tests/framework/controller-d3-chromepage-r78-cft-cycle.mjs、controller-d3-scheduled-r78-cft-cycle.mjs、controller-d3-restart-r78-cft-cycle.mjs、controller-d3-security-r78-cft-cycle.mjs。
- tests/framework/controller-pinned-npm-r74-cft-cycle.mjs、page-dependency-r72-cft-cycle.mjs、page-browser-worker-r243-cft.mjs：只接入场景与修复真实观察竞态。
- 本工作流和 evidence/import-r78-user-scenarios-20261014/；executor Epicurus 已交回安全驱动，最终 Anscombe 只读核验，均不操作共享 Git。

43111 复用既有服务器且页面字节核对；日常 dist/development watcher 未操作。本任务 Git archive + APFS 文件克隆是独立输入快照，不是 Git worktree；既有 node_modules 克隆，不新增依赖。独立 CFT Profile / 产物目录及原 launcher，same-profile restart 仍用原 adapter。新构建输出 guard 43121 独占；43120 的他人 PID25173 不操作。真实 Chrome 站点菜单通过本任务 CFT 程序路径绑定，未操作其他 Static Import / Cloud CFT。

## 修复与原始失败

1. 保存的 Controller ESM / Classic 含 author metadata。恢复作者源码后，Run 与任务制作曾使用编译尾部 / 作者字节，偏离已保存 contentHash。仅在当前程序 ID、revision、作者字节、当前编译或 SHA 验证结果与记录完全吻合时复用完整固定 executable。metadata 自报 SHA 不能证明关联；伪造尾部、改源码、换 ID/revision 不复用旧源码。
2. 整 Chrome 重开后，Load 恢复 ESM 未刷新依赖来源准备，使 Run 永久 disabled。两个实际 Load 路径均刷新现有 componentRemote；回归先 FAIL 后 PASS。
3. security-17 原生权限恢复后，Chrome onAdded / onRemoved 清空现有 consent observation，但 ESM UI 未重新只读预热，Run 持续 E_PERMISSION_CHECK_REQUIRED。接入既有 onChange 回调，两个 Controller / React 回归先 FAIL 后 PASS；新包真实恢复后 Run 进入 SHA 校验并正确拒绝坏字节。

ChromePage、Worker 词法 page、Authority、调度与 Tool Bridge 实现未改。原生组合测试发现内置阅读目录遮挡搜索按钮，使用既有关闭 Shadow DOM 手柄原生拖动，鼠标滚轮在网页中心；不修改 DOM、不放宽 Locator 命中检查。

旧构建准备失败（遗漏既有构建资源 / 外链 node_modules 来源边界 / 他人 guard 占用）、旧原生观察失败全部保留。security-15/16 的 E_PERMISSION_CHECK_REQUIRED 与历史结果 resultDeliveryRevoked=true 原属既有 fail-closed 合同，验证器现只允许明确该标记变化，其余历史与固定字节必须精确不变。09 Stop release 观察超时没有充分根因证据，保留失败；新包 18 Stop 原回执通过，不把延长观察窗口写成生产修复。

## 候选、证据与剩余验收

最终验收快照 .runtime/tests/import-r78/main-permission-final：base b2c0e1fa885328f986c3738f3ed4a3a8e1421d27 加本任务输入。并行 main 后续 SDK / 文档 / 测试提交不替换此同包身份。早期 059facba 误引用已在 artifact-provenance-final.json 纠正为 01a79da5；旧 7fac / 5ccdcc / 984810 证据仅作历史，不冒充新包。

- Developer packageHash fb3bcd30992521907feda475ea8bf37a71d27a2e9ee555904dea93724e8fce9b。
- Standard packageHash 041a5ec679936208ceecbe982cd749ffd1310146b27a910b0267b0e89e42de48。
- 两版 Build / Verify PASS，sourceDrift 为空；tool-shell 495305 / 524288 字节，不扩大预算。
- 作者 sourceHash 1188c60211f3d483231ccf0ee1fbbaf63f721bce94af19e2b8f3192f9de406d2；固定保存 / 定时 sourceHash 832cb46181999811140d6ac949862b8536bc238bc9611561d3d363e3d740b48c。
- D3 原 max.js 502 字节 SHA-256 691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d。
- source-check 664 PASS；未改的 Task / Tool / Background 安全 158 通过。不同测试分母有交集，不推算产品完成百分比。
- chrome-main-permission-18 全组合 PASS；chrome-main-permission-tools 同包两探针 PASS，原 launcher 的 Chrome PID / Profile 清理完成。

完整 Run / Result / fireId、Page Candidate / receiptNonce / documentId、SHA、构建与清理映射见 [证据索引](../../../evidence/import-r78-user-scenarios-20261014/README.md) 和 delivery-index.json。Mac CFT 真实原生输入已验证；Native Messaging、独立最终 F3、ZIP、CWS 正式验收为 NOT_TESTED。95+ 不自评，正式总验收不关闭。现有 CI 的失败与排队保持原始状态，未新增重复工作流。
