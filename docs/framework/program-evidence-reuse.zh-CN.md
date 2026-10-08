# Program 组件证据的跨聊天复用入口

更新：2026-10-09。先核验既有证据，再决定需要验证的变化。这里复用的是原身份的组件结果；不会把历史 PASS 改成新候选、安装、最终 F3 或 ZIP PASS。

## 从既有档案续接

1. 只读核对相关聊天、PR、最新 main 和资源占用。保留原工作流、候选 SHA、证据等级及 `NOT_TESTED`。
2. 使用工作流提交中记录的索引 SHA-256，运行下面的离线校验器。`--archive-root` 是保留原始文件的工作区，不是新 worktree；没有档案就报告缺档，不重造回执。
3. 读取 `archive.issues`、`changedInputs` 和每项 `decision`。工具只读文件和 Git，不启动测试、构建、浏览器、端口或数据库，不写原始证据。
4. 成功且输入未变的用例复用。关联代码、依赖、fixture、权限或生命周期改变时，记录受影响功能、失效原因和负责人，做必要定向验证。文档、另开聊天、纯观察输出格式变化不触发产品重测。

现有 R3.1 档案：[原验收说明](workstreams/program-native-acceptance-r1.md)、[不可改写的历史索引](workstreams/program-r31-01a11c05-evidence.json)。原始档案保留在 `/Users/shopme/Documents/workspace/opendesk-browser-program-r3`，只读。该 profile 已退出并删除，不能重开。

从仓库根目录执行：

```bash
node scripts/check-program-evidence.mjs \
  --index docs/framework/workstreams/program-r31-01a11c05-evidence.json \
  --index-sha256 d7de1b99c00bb0321417c8eaac20e9a6b2eb6a743fc00308f6036f2ccfde9099 \
  --archive-root /Users/shopme/Documents/workspace/opendesk-browser-program-r3 \
  --candidate 30754f86938608163b0e2e6508d3f619dffbe517 \
  --package-sha256 7f83330d5e45375ba9659de02ec35f9c14f283c8788c0f5cbf8b37fe3fe04118
```

这条命令验证旧档案是否仍完整，并保留其组件 PASS。比对新提交时把 `--candidate` 改为该完整 SHA；比对本地未提交变化用 `working-tree`（默认值）。`--package-sha256` 必须填写实际冻结包指纹；未知时省略，不能填写旧指纹冒充新包。该参数是外部已核验的身份输入，工具不会根据它替用户验收磁盘 dist。

| decision | 含义及下一步 |
| --- | --- |
| `REUSE_RECORDED_COMPONENT_PASS` | 档案及引用身份核验通过，指定产品/fixture 输入和提供的包身份一致；保留原环境、原级别的结果 |
| `AFFECTED_INPUTS` | 列出了变化的文件及前后 SHA；保留历史 PASS，为当前候选安排受影响验证 |
| `PACKAGE_IDENTITY_UNCONFIRMED` | 包指纹未提供或与档案不同；保留历史结果，不能据此对当前包声明 PASS |
| `ARCHIVE_INVALID` | 原始文件、索引、精确结果或回执不完整/不一致；恢复真实档案后再核对，不伪造结果 |

索引哈希错误、Git 候选无法解析或档案无效时 CLI 返回非零。输入漂移返回完整报告且不自动重测；它是复用建议，不是 CI 通过或验收授权。

## 核验边界

校验器验证索引 SHA、所有原始文件的长度/SHA、引用路径及重复身份。Controller 必须匹配 `controller-result`、runId/resultId、结果自身 revision/sourceHash、成功标志/预期错误、精确目标和 `released`。Page 核对真实回执的 document/frame 及成功格式；Save 核对已存 revision 与完整编译字节。每项还核对原始观察里的扩展包指纹，并输出当时的权限及用户脚本开关。产品文件比较包含 Git mode；符号链接等缺少目标闭包的文件保守报告受影响。

工具保持历史 `NOT_TESTED`、失败准备记录和组件等级。它不重新证明可信 Save 输入、完整 HTTP/effect 断言、Page 编译 SHA 或权限/owner epoch；这些仍由原始证据和原验收合同支撑。当前浏览器、权限、文档、环境或生命周期与记录不同时，不能把输出用于当前环境 PASS。Page 预览不等于持久 Task，保存字节不等于加载版本或安装。

旧索引尚无逐用例的完整依赖图。当前使用保守的产品/构建输入闭包（`src/`、schema、项目示例、测试 fixture、manifest、依赖锁、WXT 和构建/项目校验脚本）及索引 fixture 哈希；发生变化会列出影响项，**不会自动触发整套验收**。负责人可以依据实际消费者缩小定向验证范围，须另存理由，不能修改旧索引或偷偷降低合同。

工具和回归测试：[校验器](../../scripts/check-program-evidence.mjs)、[拒绝误复用的测试](../../tests/environment/program-evidence.test.mjs)。当前续接记录：[Program R3.1 本轮收敛](workstreams/program-r31-continue-01a11c55.md)。旧 jQuery 版本/插件兼容继续留在[低优先级待办](backlog/legacy-jquery-compatibility.md)。
