# R6.2 Agent 到可复用 Task：当前候选与续接

本轮没有完成正式验收。可信原生 UI 工具报告 Mac 已锁定；重新读取状态也在 30 秒后超时。Task 导入、现代搜索执行、显式安装、独立运行和整浏览器重启均未完成，不得提升为 PASS。

工作区：`/Users/shopme/.codex/worktrees/r62-final-20261009-01a11ca3/opendesk-browser`。
分支：`agent/r62-final-20261009-01a11ca3`。
继承证据提交：`dd63f339a8fd4b07729cf8764b961de4150eb29c`。
当前产品输入提交：`40d3bf5f93cfa0bf587ec6080a03de3302b27e6f`，其构建对应 main `5769730beb9fddc6fc788a2702409ec06076feac`。随后通过 `07db43ec619860674d0fcccfce94bef48e1a05e8` 合入 main `bd7c8d1b41197673ad0d5ab0abe53231393a368d`；148 个绑定产品输入文件 hash 全部未变，因此复用构建和组件证据，见 `metadata-main-reuse.json`。
Native bridge PR #11 已确认 merged/closed，不再沿用其旧 Draft/冲突状态。

```text
Agent 到可复用 Task
  候选与驱动：已实施；源码/构建和定向组件证据通过
    真实 CLI 请求与持久结果：驱动已实施；仍缺真实现代搜索与 ACK/journal
    单次搜索计数：驱动已修复本页中文计数解析；7 项驱动回归通过
    当前 Worker 观察：已修复挂起后 CDP target 变化；只有组件验证，待真实重试
  标准 demo：本工作区页面字节校验通过；自身服务已释放
  Native/Sidebar：较早包的连接诊断通过；最终包未做真实运行
  Task 验证与显式安装：组件已有；真实 Candidate/Verified/Available/My Tasks 未测试
  独立运行与重启：真实执行和同 profile 完整重启未测试
  异常生命周期：旧诊断保留原等级；当前候选真实验证未关闭
  原正式合同、独立最终 F3、同 dist ZIP：全部仍待正式验收
```

生产 packageHash：`75dd897fee5a906dbe5de00b30c98d8c5b3d0ea8a5a7cca756e17660d478e73f`。
开发 packageHash：`e61be2a4604d567e754258f3224058bb84e554a115116d786c0e565076c383f7`。
生产 SW 324976 bytes，限制 327680。最新 main 上的 check、生产/开发构建及 verify 均通过。
受影响组件 76 项、实际 Sidebar 工具组件 4 项通过；最终驱动 7 项通过，其中 5 项与前述 76 项重叠。旧 242 项证据和本轮较早的 84 项保持各自输入身份，不当作当前完整覆盖。

原任务仍为 `sample.modern-search@1.0.0`，源码 SHA256 `1618934805a4104191be8e2005a608d0537a51ca65c1e291c8a8fb042ed34b2d`，manifestHash `5bce863a91c5abd26513dc19a50c55eeb068eb030c7e0aa5a664b9f8e902984a`。不要替换成 `agent-modern-search`。
当前 demo SHA256 为 `815af5458d617b4688a504cfc265f81427ccfd847a718210c4cc9eeeeb510383`；它来自最新集成产品，不能与旧候选的 `261465...` 混用。

## 资源与失败保留

43111 的原 R7 PID64009 已有退出记录；之后 PID78850 也在本轮取得端口前实际消失，但未找到其单独 owner 释放 receipt。取得端口前没有监听进程，自己的标准 Python 服务 PID89894 成功独占 bind；实际 cwd、服务字节和退出记录均保存在本轮证据中。没有停止、替换或向 R7 发送消息。自己的 HTTP 服务已经释放，续接时重新核对当前占用。

自己的 CFT PID73343、launcher PID73342 已退出，临时 profile 已删除；cleanup PASS 只证明清理，不能冒充用户退出或整浏览器重启。Native socket 已消失。原私有安装已按备份逐字节恢复；原 CFT host manifest 按原安装合同重建，原 manifest 的精确字节未在本轮开始时归档，必须保留这个限制。凭证和私有备份不进入 Git。

保留首次 launcher 所有权观察失败及其 cleanup FAIL、第二次 Worker 观察失败、其他工作流页面 hash 不一致、host 未发现和过时 Worker target 的失败日志。成功的 Native 连接仅属于较早生产包 `3972c99cbd4367a6e5b1bdb653741c892612408da8bde7aac72d75a25130f3de`，不是最终包。连接观察时 `hostRegistrations` 为空，之后虽真实打开 Sidebar，仍缺完整注册/执行原始链路证据。

## 解锁后按顺序续接

1. 核对最新 main、候选产品输入、PR 和资源记录；没有相关变化就复用这里的组件/构建证据。43111 空闲并获得独占资源后，只启动标准服务：

   ```sh
   python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
   node tests/framework/r62-native-acceptance.mjs preflight --evidence=<新的独立证据目录>
   ```

2. 启动独立受控 CFT。现存只读 CFT binary 为 `/private/tmp/opendesk-r62-cft-b27a/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`；先核对它仍存在且没有被占用。每条命令使用新的证据目录，禁止覆盖已有原始文件：

   ```sh
   node tests/framework/r62-native-acceptance.mjs session --binary='<受控 CFT binary>' --evidence=<新的 session 目录>
   ```

   驱动输出本次真实 extensionId、PID、endpoint、profile。它复用 `k5-sdk-native-launcher.mjs` 和 `k5-sdk-native-restart.py`。保持该进程 stdin；只有实际安装并做完独立运行后，才输入 `restart`，保存原进程退出及同 profile generation2 的真实证据。`stop` 只用于最终释放，不是重启验收。

3. 仅在原 Native 资源已释放、私有备份妥善保存后，为**本次发现的实际 ID**配置 CFT host，然后绑定自己的隔离 profile：

   ```sh
   node native-agent/cli.mjs setup --extension-id <本次实际ID> --browser cft
   node tests/framework/r62-native-acceptance.mjs bind-native-host --session=<session.json> --evidence=<新的绑定目录>
   ```

   `--user-data-dir` 的 NativeMessagingHosts 需要位于自己的 profile。绑定驱动只允许准确的自身 PID/父 PID、临时 profile、原 host path 和唯一 extension origin；不覆盖不同 manifest。通过真实 CUA 开启 Native、接受明确要求的授权、导航至标准页面、打开 Sidebar，并重新观察 registration/host/document 身份。不要启动个人 Chrome 或沿用旧身份。

4. 真实 origin 授权和注册完成后执行：

   ```sh
   node tests/framework/r62-native-acceptance.mjs modern --evidence=<新的运行目录>
   node tests/framework/r62-native-acceptance.mjs inspect --session=<session.json> --evidence=<新的观察目录>
   ```

   modern 驱动先只读取得计数，再运行原草稿、保存源码 revision1、执行保存 revision，并校验两次各加 1、run/result 自身 revision/sourceHash、精确目标和 released。它只查询已确认 runId，失败/未知副作用不重放。inspect 只读现有 IDB；其当前 Worker 修复仍需要第一次真实验证。**这些命令不会自动构成 Task PASS**：必须从真实 commandJournal 收集并关联唯一 native ACK、operation/request/run/result/document/owner 身份。不能填造缺失回执。

5. 在真实 Task UI 导入 `examples/tasks/modern-search.v1.opendesk-task.json`。以同源码、同 origin 的真实成功运行校验 `verifyTaskCandidate`，再 `makeTaskAvailable`。真实点击“安装确定版本”，确认 My Tasks 显示该安装版本。关闭 Native 接入，从 My Tasks 独立执行至少两次，随后用当前 session 的真实 `restart` 完整重启，验证版本、授权、参数、结果和历史持久化。

6. 收敛验证驱动后在同一最终候选上集中执行异常生命周期与原合同：原603+19、独立B05、1000 mixed、10 reconnect、两轮禁插件、六项资源baseline、独立最终F3、与已验收dist一致的ZIP安装。不改分母，不用静态 review 或组件 PASS 代替正式等级。正式账本当前保持 OPEN。

## 七项状态与证据入口

`SOURCE_CONFIRMED=YES`；`COMPONENT_TESTED=PASS_CURRENT_TARGETED_COMPONENT_ONLY`；`BUILD_VERIFIED=PASS`；`NATIVE_CHROME_VERIFIED=INCOMPLETE`；`AI_AGENT_E2E_VERIFIED=PARTIAL_DIAGNOSTIC_ONLY`；`REUSABLE_TASK_VERIFIED=NOT_TESTED`；`FINAL_FRAMEWORK_ACCEPTED=NO`。

本轮专属 JSON 为 `r62-final-20261009-01a11ca3.json`。原始证据与 `acceptance-progress.json`、`resources-released.json`、`source-binding.json`、`integrity.json` 位于 `docs/framework/evidence/r62-final-20261009-01a11ca3/`。历史 receipt、旧候选证据和 `public-owner.json` 保持原身份。PR 必须保持 Draft；本分支没有 main 合入或 release/publish 授权。
