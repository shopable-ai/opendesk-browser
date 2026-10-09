# R9 模块加载、第三方依赖与真实验收记录

本轮基线 main：`7e80fa8f702e10e1bcda432b7b6aec4c02f12c68`；工作分支 `agent/r9-dependency-closure-20261009`，PR #38。代码已实际写入 GitHub，不是补丁下载交付。合并与分支清理以 PR 最新状态为准；有阻塞检查时不强推或绕过。

## 已完成的代码与文档

- Program 直接 npm import 增加精确版本、锁文件 v2/v3、版本/HTTPS/SHA-512 字段核验；真实 npm 下载完整性仍由 npm ci 处理，不自建包管理器。
- 既有 Webpack 增加嵌套模块记录、npmDependencies / npmBundledModules；新增真实 lodash-es 多文件示例和执行测试。
- 既有 WXT 通过 build-only bundle-provenance 记录 14 个固定产物的源码/npm 模块并绑定最终 bytes/SHA；拒绝快照、用户项目或独立 vendor 混入特权固定入口。未增加运行时文件、依赖或字节预算。
- 可选 Native Transport 失败现在有诊断，仍是唯一固定 importScripts 特例，未创建第二个 Broker/Controller。
- jQuery 兼容示例 `examples/tasks/jquery-page-draft.js`；当前编辑器仍不提供新 @require 表单或批准入口。
- 重新同步依赖迁移清单、Program 文档、日常操作和 Skill；当前真实按钮为“网页 JavaScript 试运行 / 在当前网页试运行 / 新建”，不是旧版选择器。

## 已观察的证据

完整不可变摘要：[r9-dependency-closure-20261009-evidence.json](r9-dependency-closure-20261009-evidence.json)。其中候选为 fc5feba4，CI 实际合并预览为 8d8bc1ee；新提交不能冒用旧候选身份，复用时必须逐项对照相关输入和产物 SHA。

| 层级 | 结果 | 证据 |
|---|---|---|
| 干净 npm 安装、Program 来源校验和真实 lodash-es 构建/VM 执行 | PASS，非浏览器回执 | Actions 37927911078 |
| WXT 生产/开发、固定资源、CSP、SDK、vendor 与 ZIP exact dist | PASS | Actions 37927910899，artifact 11615501067；归档已独立逐文件核对 |
| Native/Sidebar 组件、完整 environment Node 回归、新增模块记录测试 | PASS；不等于 foundation/framework 全部合同 | Actions 37927910892 的 bridge-components |
| 真实 jQuery DOM 组件 | PASS：3.7.1、标题、DOM 标记、MAIN 哨兵不变 | 正常沙箱、非 root 的 Chromium 144；现有 Page 编译器和固定 vendor，CDP 隔离世界 |
| Mac arm64/x64 Host IPC | PASS | 同 run 的两个 macOS job |
| Mac CFT 155 空白页、扩展加载、Options 真实 sender、可信启用点击 | PASS 的子步骤 | 修复 setup-chrome 丢失 .app 路径后取得 |
| Mac 完整 Native 握手测试 | 未通过；权限批准超时 | 历史 job 113811212155 / 113811212539；UI 驱动未找到匹配弹窗。后续诊断只按新 run 判断 |
| 完整 USER_SCRIPT/Sidebar 运行、断网/导航/撤权/SW 重启与最终安装 | NOT_TESTED/未正式关闭 | 不能从上述组件或加载成功推导 |

生产 sw.js 327661 bytes，上限327680，仅余19 bytes。R9 构建记录没有改变已验证 packageHash：production `84f3ae6c33a4313de16b7762a883f9c45b67596a97ebe0c37f355f3083dc6487`，development `e6ccd86df5dd92b01f6dbc1883c2d6ec28385488af84f852a39f3da225af87f8`。sw.js 的47个记录包含43个项目源码、2个npm helper及2个虚拟入口；不是47个运行时独立文件。

## 环境阻塞与限制

用户 Mac 路径未挂载到本会话，不能说已修改用户本地目录。已实际使用 GitHub 的 macOS runner 检查 CFT；不是完全未尝试浏览器。容器 Chromium 可在正常沙箱非 root 启动，但 chrome://extensions 被管理策略阻断，未修改策略；容器 jQuery 测试因此仅计 DOM 组件，不计扩展授权链。

初次 R9 的长诊断消息曾让 SW 超限327759>327680，原失败 run37926046793保留；随后缩短诊断并在不提高预算的前提下构建通过。原 CFT stable 安装路径缺 .app，固定到同一155.0.8059.39具体版本后空白渲染器恢复；不能将这项修复当 Native 握手完成。

## 当前必要的后续验收

在本地受控、非个人 Chrome profile 上，核对最新 PR/main 候选身份，再执行现有构建/校验。真实 Native 测试需要在60秒内批准其拥有的 CFT 窗口中的 Native Messaging 对话框；保持 `chrome.permissions.request` 真实调用，不改 Preferences/扩展存储、不禁用沙箱、不伪造 ack。CI 的辅助驱动只允许本测试进程后代、精确 CFT 可执行文件和隔离 profile，匹配明确权限文本及唯一 Allow 后才点击；不能确认时失败。

Page 使用现有标准页面 `http://127.0.0.1:43111/demo-form.html`；有合法旧锁时验证 jQuery 例子，新的 npm 项目走现有构建/草稿导入。逐项验证 USER_SCRIPT 与 MAIN 隔离、Controller/Background 权限边界、离线复用、刷新/导航、撤权和 SW 重启。只有对应回执齐全后才关闭 P1。

P2 是紧张的 SW 预算、未逐消费者确认的旧库等价性，以及第三方许可证分发范围；不恢复采集业务或大型依赖 UI。603+19/B05/F3/最终 ZIP 安装分母和历史失败不改写；本轮不宣称所有维度达到95或发布完成。
