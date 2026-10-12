# Browser SDK R8 · 开源复用决策（2026-10-13）

| 候选 | 许可证/版本 | 结论 | 当前实际复用/限制 |
| --- | --- | --- | --- |
| Chromium Extension API Schema | BSD-3-Clause，源码固定 `b5485910372708cd11d9a814a3e382fe8da57df3` | DIRECT_REUSE | 8 组官方 JSON 原文、Git blob hash 校验；发现层，不进入扩展包；IDL/全量未完成 |
| Chrome Native `chrome.*` | Chrome 浏览器原生 API，最低 138 | EXISTING_OPENDESK | 保留 Chrome 原生执行和现有 Driver；官方 API 不等于全部批准操作 |
| GoogleChrome/chrome-types | Apache-2.0；版本尚未锁定 | REFERENCE_ONLY | 上游提供官方生成类型基础设施；JS 工程暂不直接依赖，先核对 WXT 类型冲突后再锁定 |
| WXT | 原仓固定 0.21.4 | EXISTING_OPENDESK | 保留现有构建和 MV3 打包入口，无迁移 |
| webext-core messaging/storage/scheduler | 各包许可证及具体版本待审 | REFERENCE_ONLY | 当前已经有 Host/Broker/Storage/Scheduler，暂不安装第二套体系 |
| webext-core match-patterns | 版本及许可证待审 | REFERENCE_ONLY | 可以借鉴纯规则，但不替代精确 Origin/用户工具授权 |
| webext-core fake-browser | 版本及许可证待审 | REFERENCE_ONLY | 仅可评估组件测试，不替代真实 Chrome |

本轮新增 npm 包：0；运行时增加 Chrome API 权限：0；由官方 JSON Schema 复用避免手写接口发现（仅限当前 8 组）。无原生、商业分发或打包体积验收证据时不得填 95+ 分。后续每次采用依赖前填入准确 release、license、bundle 增量、兼容测试和修改文件。
