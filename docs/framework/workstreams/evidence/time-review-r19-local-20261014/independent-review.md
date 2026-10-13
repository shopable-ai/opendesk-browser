**最终限定静态审核通过；完整原生验收仍未闭合。真实阻塞是另一 CFT 抢占前台，安全拒绝生效。**

- [native42 原始报告](/Users/shopme/Documents/workspace/opendesk-browser/artifacts/time-review-r19-local-01a1364f/native-run-42/native-report.json)：34/35 PASS，`officialUpgrade=NOT_TESTED`，`acceptance=PARTIAL`。退出0不代表完整验收 PASS。
- [native46 失败日志](/Users/shopme/Documents/workspace/opendesk-browser/artifacts/time-review-r19-local-01a1364f/native-run-46.tap:37)：所属重启 PID3907，实际前台 PID3948；chooser activate 被拒绝。报告保持 FAIL，升级未执行到、未登记 PASS。停止盲重试合理。
- [driver 门槛](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/time-review-r13-native.test.mjs:234)：默认 full；全部35项 PASS 且流程完成才报告 PASS。缺项为 NOT_TESTED，未完成为 FAIL，完成但缺项为 PARTIAL。
- 新升级尾段明确区分**本地1.5.0夹具→实际官方1.6.0**；PASS 位于精确包/provenance、真实非零历史、持久数据比较、退休状态及 UI 检查之后。没有冒充历史官方旧版迁移证据。
- [helper](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/time-review-native-input.swift:14) 校验具体 PID，键盘事件逐次检查前台；click-at 另查自有窗口及点位 owner。PID3948不会因同为 CFT 而获准输入。

保留限制：foreground 检查与系统投递并非原子操作；点位 owner 检查仅覆盖普通 layer0 窗口，`activity` 不具备同等遮挡检查。因此不宣称绝对无输入竞争，但本次冲突确实被保守拒绝。

**评分建议：八维数值继续 NOT_SCORED，不给95。** 已有同候选分项证据保留；功能完整性、权限身份、生命周期的完整门槛仍缺实际官方升级执行证据。性能预算仅静态通过，不能提升为运行时性能评分；证据可信性方面，PARTIAL/FAIL/NOT_TESTED 标注正确。

未写文件、启动 Chrome 或执行 Git 修改。
