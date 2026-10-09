# OpenDesk 本机通信接管：设计工作流

2026-10-09（Asia/Shanghai）。本轮按用户的基线门槛，只读产品与原始证据；文档保存在独立worktree/分支 `agent/opendesk-native-design-01a1200a`，没有修改两个共享产品目录、main、默认入口、安装注册或浏览器测试资源。

[兼容设计、通信图与安装回退方案](../../architecture/browser-framework/opendesk-native-takeover-r1.zh-CN.md)；[状态记录](opendesk-native-takeover-01a1200a.json)；[只读输入hash和原始证据索引](evidence/opendesk-native-takeover-01a1200a/read-only-inputs.json)。这些文档与索引不是新的native验收receipt或冻结候选。

推荐同一个OpenDesk可执行程序的拟议 `browser native-host` 与 `browser` CLI，共用通信客户端；Chrome拥有Host生命周期，Browser继续拥有网站授权、目标绑定、运行和持久结果。当前未实施，所有新命令均不可执行。

Node基线核对结果：R6.5旧包有六接口局部native成功。最终包早期doctor未连接；后续ready诊断已连接；更晚的draft持久结果已completed/released。保留新增局部成功，仍缺最终saved/Stop、revision pin、document/撤权、丢ACK、断线/重启和标准页面/Task身份差异闭合，不能提升为接管基线。原框架F3/ZIP等合同也没有关闭。负责人、两包身份、原始证据hash见索引，不覆盖旧结果。

```text
本机通信接管
  基线与负责人：已核对；最终相关基线未关闭
  职责与统一入口：已设计；init/原生stdout风险待实测
  外部兼容矩阵：已设计；无跨实现PASS
  精确备份/切换/回退：已设计；无维护接口/锁现有能力的虚假假设
  源码/构建/真实CFT/迁移：本轮未实施或运行
  默认入口：Node保持；没有release/publish
```

本轮只读设计审阅通过，10项文档/JSON结构、引用、文件hash、独立分支和写入范围校验通过；见[校验与审阅记录](evidence/opendesk-native-takeover-01a1200a/review-and-static-check.json)。没有运行产品测试或构建；复用原证据等级，等待Node负责人关闭相关基线后再实施第3节最小切片。后续实际兼容和迁移通过后，由获授权集成者串行切换默认实现。

当前交付状态：`SOURCE_IMPLEMENTED=NO`，`CONTRACT_COMPATIBLE=NOT_VERIFIED`，`NATIVE_CHROME_VERIFIED=NOT_TESTED`，`MIGRATION_VERIFIED=NOT_TESTED`，`DEFAULT_PROVIDER=NODE_UNCHANGED`。

本轮历史设计核对当时未commit/push。现按用户推进意图准备文档提交与PR：设计分支已快进同步远端main，仅新增本工作流文件；共享main的未提交修改保持现场。精确程序/输入绑定为历史观察快照，不拿HEAD代替完整产品输入。

本次合入只交付设计，不切换provider。小型核对快照位于可追踪的 `workstreams/evidence/`，原本机记录保留在忽略目录；其中绝对路径仅用于原始本机证据定位。后续集成者通过PR串行合入，避免在有其他未提交修改的共享main工作目录执行merge/stash/reset。合入后先核对最新Node原始验收与RunHost变更，再按既有设计推进OpenDesk实现。
