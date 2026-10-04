K1 round6 作者最终交接（2026-10-02T22:05:29.154911+00:00）

状态：双版实测及源码冻结，待独立合并 F1 功能资格；作者不批准门禁。
有效方案 SHA256：`da4432720e75bbda7112f93d90829f1bfefd8790a1d7cecec09473bd1c6bc7d1`。
页面源码候选 SHA256：`f29dc4afa233a67457585e6a35cf327252760ead96d9edce6c16975f9a502c0a`。
主执行 union candidate SHA256：`a9ce67f85964f2512212430d56b488b5b0e2c11f6afdff2ea562428c3e77da66`。
[union candidate](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/reviews/m5-f1/final-candidate-v1/candidate-manifest.json)。

源码改动仅为 host.js 的操作原生监测和 sticky lifecycle fence、host.html 的可信自有授权 UI、runner 去除 recheck 并按实际调用分账；adapter 未改。当前源与双版冻结快照 hash 一致，node --check 通过。

| 版本 | 记录 PASS / FAIL | 实际 userScripts.execute | required 子情景 | 当前失败 / 缺漏 | 最终资源 |
| --- | --- | --- | --- | --- | --- |
| 138.0.7204.183 | 102 / 9 | 147 | 4 + 4 + 4 + 12 = 24，均满足实际断言 | 0 / 0 | 全 0 |
| 154.0.8037.92 | 102 / 9 | 147 | 4 + 4 + 4 + 12 = 24，均满足实际断言 | 0 / 0 | 全 0 |

102 PASS 中含 4 条 limit assessment；每版有 107 条执行 case 记录、3 次固定 packaged scripting 调用、7 条 adapter prevalidation 和 1 次 API 不可用的调用前诊断。case 数不是原生后端成功数；四项 required 合同共享场景，不叠加为更多 Chrome 调用。

每版 9 FAIL 原样保留：4 条 raw throw/rejection、1 条 required host remove、4 条原历史 OFF-ON 期望。`userScriptsRequiredCasesPassed=false` 和 fullF1GateDecision 原始字段不改。旧 2ed、8 条 history counterexample、RAW5FAIL 及旧 checkpoint 已按 hash 核验且不覆盖。

两 world × pending/native-completed：OFF 新调用被原生拒绝；实际监测观察到 OFF 后旧 entry 跨 ON 保持失效。UNOBSERVED cycle 真实发生于 host 任务阻塞间隙，监测未关闭；旧结果接受、已发 effect 可能完成。四条 limit assessment 仅确认获批边界，原 FAIL 不变。真实 origin/可信 ownGrant/doc 撤销及取消、期限不弱化。

站点撤权的直接 native 诊断曾 pending，每版 6 条随旧文档销毁返回 null；逐案 rawPending 如实保留，不能称作原生拒绝或自动取消。最终 monitor/probe/timer、pending、barrier、rawPending 全 0。两个自建 browser context/server 已关闭，仅两个本次 fresh profile 已移除。

[完整 JSON 交接](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-final-handoff-round6-2026-10-02T22-05-29-5f0100b9/final-handoff.json)；[必需合同映射](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-final-handoff-round6-2026-10-02T22-05-29-5f0100b9/required-contract-mapping.json)；[源清单](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-final-handoff-round6-2026-10-02T22-05-29-5f0100b9/final-source-manifest.json)；[清理及 pending 分账](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-final-handoff-round6-2026-10-02T22-05-29-5f0100b9/cleanup-receipt.json)；[历史保留核验](/Users/shopme/Documents/workspace/opendesk-browser/tests/prototypes/user-scripts-v2/evidence/m5-final-handoff-round6-2026-10-02T22-05-29-5f0100b9/history-preservation.json)。

K1 必需页情景缺漏为空。产品、公共门禁和共享浏览器目录均未写入。control/page union 功能资格、F2 以及 K2 产品写入等待主执行顺序独立复核。当前源码保持不变。
