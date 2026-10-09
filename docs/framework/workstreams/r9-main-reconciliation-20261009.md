# R9 与并行 main 更新的合并审计

R9 原分支头：0d1156147c2c5a867ccb3a9328f5471766b191b8。核对的 main：cdb669948b5b29b0b085059780a74567cc691d91，较原基线7e80fa8多5提交、9文件。

八个非冲突文件原样采用 main 的 blob：Browser Test Lab 文档、testing-guide、Page UI JSON/MD 工作记录、examples/tasks README/demo-form/http-axiosx-page-draft，以及 basic-browser-page.test.mjs。不改写其他 Agent 的历史原生证据。

唯一双方修改路径是 .github/workflows/native-agent-r1.yml：保留 main 的完整 .app ditto 恢复、Info.plist/可执行文件 cmp 与 SHA 记录；同时保留 R9 固定到已观察的 CFT155.0.8059.39，以及仅针对本测试拥有进程的 Native 权限 UI 驱动。CI 所有原测试和退出码均保留，不添加 continue-on-error/跳过/权限预授权。

716f288d 的原生 run37928619613 仍失败：arm64 job113813535958只能读到 about:blank/Translate this page?/Native Agent 窗口标题，按钮列表为空，Native Messaging 批准超时。不能据此认定扩展依赖缺失或权限已经批准。本次只增加受控 Chrome 的 AXEnhancedUserInterface 可访问性启用并显式解引用 AX 子节点，以便真实按钮可见；不改变网页权限、浏览器安全策略或扩展数据。其效果必须由本次新 CI 结果确认，旧失败不覆盖。

上述为 main 合入 R9 分支的双亲提交，不代表 R9 已进入 main。PR #38 仍需检查全部结果；原生失败或合并冲突未关闭时不得强推 main 或宣称最终验收。
