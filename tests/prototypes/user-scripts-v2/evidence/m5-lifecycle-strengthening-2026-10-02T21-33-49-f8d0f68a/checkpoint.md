# K1：现有合同下的操作生命周期修复

候选 `587a05918e2b7d19c7a513be05c2e82430d7aafc3e659ef4f98f53282361cf40`。两版本使用同一源码，按有效 round5 原 expected 针对性实跑；**原历史合同仍 BLOCK**。未采用 round6 amendment，未执行新合同最终全矩阵，未写公共 gate 或产品。

源码修改：

- `fixture/host.js`：pending 操作自身调用原生 `getScripts`，失败 latch 首个 fence；dispatch/acceptance 检查并 drain 已发探测；finally 清理。真实 permission/doc/target/host 事件、私有 ownGrant epoch、可信 host UI cancel 和 deadline 均只能使旧操作失效，renew 不清旧 fence。
- `fixture/host.html`：有限原型 grant revoke/renew 与 pending cancel 按钮，handler 要求真实 trusted UI event。
- `run-headed.mjs`：删除全部 `recheck` 调用/断言；测试只读实际观察。加入 targeted mode、真实授权/取消/文档竞争和有界 host 任务阻塞，保存原 expected FAIL、未执行项及同源码快照。`adapter.js` 未改。

| 实际 Chrome | 功能通过 | 原合同失败 | 本轮未执行 | 实际 userScripts.execute |
| --- | ---: | ---: | ---: | ---: |
| 138.0.7204.183 | 32 | 4 | 71 | 78 |
| 154.0.8037.92 | 32 | 4 | 71 | 78 |

通过范围包含两个 world 的 pending/native-completed：操作监测实际观察到 OFF 后 sticky 拒绝；真实 site revoke/restore；可信 ownGrant revoke/renew，caller authority 字段不能绕过；UI cancel/deadline；实际旧 document 失效。旧操作只结算一次，真正新操作成功，已发 raw/effect 与 accepted 分账。

失败范围：每版 4 个原合同反例。真实 2500ms host 任务阻塞期间 OFF→ON，监测未关闭，但实际未观察到 OFF；两 world、两阶段的旧结果仍接受。UI 时间落在真实阻塞区间、host/doc 相同、实际观察/raw/effect/delivery 均保存。这些是 **原合同 FAIL**，不是新限制合同 PASS。

原始证据：[138 report](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-2026-10-02T21-28-48-030Z-m5-life-138-r1-bf36fe1f/report.json)、[154 report](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-2026-10-02T21-29-56-557Z-m5-life-154-r1-4e632233/report.json)。环境、完整版本、binary hash、extensionId/profile/doc/world、UI、输入预期/actual、原生调用与 adapter 拒绝、资源清理详见各 report 和 [checkpoint JSON](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-lifecycle-strengthening-2026-10-02T21-33-49-f8d0f68a/checkpoint.json)。本目录三个 patch 记录相对原 2ed 源码的精确变化。

两版无初始化失败；pending/active operation/barrier/observation/authorization monitor/probe/deadline/rawPending 全部为 0。只关闭本次 browser/server，两个本次 fresh profile 已清理。旧 R4 68 个证据文件和 20:42 诊断 manifest 全部摘要一致；旧四 raw FAIL、required host remove FAIL、8 个反例及冻结 expected 保留。71 个未执行项未标成功。

本轮只证明原型旧结果 fence；ownGrant 不是产品接入，cancel/deadline 不证明原生页面终止或 stop SLO。剩余：正式 round6 双批准与明确 release 后，按新合同冻结两版本最终 fullmatrix，补 code/file/typed/raw/CSP 等完整回归，再交独立 F1 资格复核。原 48/183/63、603 分母和历史差异不变。
