# R15.4 独立 JS 库与双世界原生验收（2026-10-10）

状态：IMPLEMENTATION_IN_PROGRESS；仅直接集成 main；历史 R15 native 证据不自动继承。

本轮范围：R15.4 新 catalog、独立 npm 编译入口、手工 vendor 固定文件、构建/校验、Controller / USER_SCRIPT 单单元顺序及 demo。

唯一产品设计文档：[独立库 R15.4](../../architecture/browser-framework/independent-libraries-r154.zh-CN.md)。

## 证据状态（在新主分支 SHA 产生后核对）

- 源码目录与更改：已准备 GitHub 提交；最终 SHA 以实际主分支为准。
- npm ci、libs:check、npm test、npm run check、生产/开发 WXT 构建、verify、ZIP：**NOT_TESTED，等待同一候选 CI 回执**；不得假报通过。
- 手动 vendor JS 与 npm 的独立字节/资源：**NOT_TESTED**，必须核对真实 dist/ZIP 的 manifest 与哈希。
- Chrome Sidebar Controller / Page 用户代码、停用、权限撤销、重复运行、重启、导航、MAIN 隔离、初次/重复加载耗时：**NOT_TESTED**，本次环境不具备用户 Mac Chrome profile，不伪造原生数据。
- Service Worker 真实增减字节：**NOT_MEASURED**，维持 327680 字节硬上限，需从本轮构建报告记录。
- 专家 95+：**NOT_SCORED**，依据可采纳证据与全部硬阻断项后评定。

## 对原有证据的影响

修改了构建入口、Page CORE、Worker 组装、库 ABI 和资源清单，所以不能把 R15 的旧包 Chrome/CPU/资源结果提升为新包通过。其它没有变更的 Native Agent、axiosx 和 Authority 可按 testing-guide 逐项复用相关旧证据，但新的加载顺序与版本兼容必须重测。

## 需要由 Mac Codex 绑定的最后验收

在实际 main 完整 checkout 执行所有脚本，使用独立 profile 以本轮 dist 安装受控 Chrome，记录实际扩展 ID、SHA、包哈希、世界/文档身份、runId、结果与资源释放。不要与其他对话共享 CFT profile、端口或 dist 构建；不得修改历史 F3 receipt。发布前需明确验证已保存 Task/Candidate 的 v1→v2 不兼容拒绝，未绑定库版本的旧任务不得视为自动升级成功。
