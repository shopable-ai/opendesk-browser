# F1 userScripts v2 补测边界

2026-10-02。仅写 `tests/prototypes/user-scripts-v2/**` 与本目录。冻结只读审计 outputs/design.md SHA256 `e2d9a346fd82238a208c3e2a5acb5b334b12443bd42a8f6a63a4a19ac41f57e7`、test-spec.md SHA256 `707d421df497f30e16edf47dbf7fe7f7f5daa77b91fa4fdcfdaf998f388056a4`；设计审批 manifest 为 `acca60edf9031aafb4ecb740f5f0f33777a3694d23499f28ce37af63b38f592f`。

1. 新建 native MV3 最小 fixture。只在 Chrome userScripts.execute 解析用户源码；固定包内 scripting callback 单独使用 func/args。不实现 authority/broker/持久存储/F2。
2. 包装 code 与 typed JSON 参数/结果，验证 undefined/有限数/native/bound/闭包错误；精确核对返回 documentId/frameId，并在实际授权与 document 变化后拒绝旧结果。这个 fixture fence 只证明 F1 适配可能性，不能代替 F2 原子准入。
3. 已安装 Playwright + headed Chrome + 每次新 profile，通过 Chrome 扩展详情 UI 开关。先关/开，后异步撤权、旧文档导航竞争，再复开。两个 world 都测原始 Promise/error/undefined 与包装结果，单独记录两类事实。
4. 同 tab 顶层/同源与跨源 iframe、另一 tab 负对照，code/file 和非法 ScriptSource/target 真调用，固定 MAIN callback 真调用。真实失败与未测分别记录；可选分支失败不扩大必需合同。
5. 已有 149、可取得 138 与官方 feed Stable 顺序运行；channel 来源与实际版本分开，无法独立证实的当前 stable 不猜测。保存原始结果、控制台、截图、HTTP 日志、源码与候选 hash。失败运行保留，新修订用新运行目录。
6. 新候选独立只读复核与 hash 完整性检查。无需更改全局配置、产品 gates 或旧证据。

请求模型：leader `gpt-6.1-sol/xhigh`；原生子代理 `agent_type=default` + 完整已安装角色提示 + 同模型请求。server resolved runtime 无独立证据，记 `unknown`。
