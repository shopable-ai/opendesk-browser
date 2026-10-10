# WebCodex 文件请求闭环 / R17.1 交付证据

Browser 源码 `c41102d7e2dd13510f718f69061f8194251eb767`，Go 源码 `34649d24ee821298f586abba257e9e41b89a4cec`，均已在各自主分支远端交付并取回核对。完整机器索引见 [delivery.json](delivery.json)，本次 [源码输入](source-inputs.json) 和 [生产构建](build-production.json) 保存文件 SHA 与实际产物，不把 HEAD 当安装身份。

## 本轮完成的验证

- [Browser 六文件 84/84](components-final.tap)；[能力协商 5 项](access-capability.tap)；[最终 R17.1 CLI 12 项](cli-r17-1-delivery.tap)。这些是实际代码和受控 Native/DOM fixture，不是真实 ChatGPT。
- [Source check](check-source-delivery.log)：310 输入；[真实 npm tarball 安装](npm-package-final.log)：`@shopable/opendesk-dev@0.1.0-r17.1` 在源码树外临时全局 prefix 安装并验证，结束后移除；未 npm publish、未更新用户机器。
- [生产构建](production-integrated-recovered.log)、[严格包/ZIP](pack-production.json)：packageHash `9dc5bfec69e41408f984e02a1eb180c7b5c252e6deebb4f909935732967f02dc`，ZIP SHA-256 `dd137b6d14997063960a8c0094a743ce742d6f3c635eb230066c5c403d298e07`。222 个实际构建输入在构建中无变化，交付时逐个哈希再核对。
- [本提交 Browser CI](browser-ci.json)：8 个 push workflows 均 success；R17 Ubuntu/macOS 均完成定向测试、真实 tarball 安装及生产构建。Native 工作流另有 macOS Intel/arm64 Chrome Options/握手诊断，不是 WebCodex 或用户 Profile。
- [Go 独立证据](https://github.com/shopable-ai/opendesk/blob/f87d240f7efd2a3cedb9eaf0f8f7cc44660ab14c/docs/integrations/browser/evidence/webcodex-request-loop-20261010/verification.json)：29 个顶层 race case、真实临时文件两轮、独立磁盘 SHA、跨 CLI 进程权限往返、vet/组件编译。本 Linux 本地真实 Socket 测试因 EPERM 失败；本次 Go 源码对应的 [Native CI](https://github.com/shopable-ai/opendesk/actions/runs/38060523393) 已在 Ubuntu/macOS 通过原真实 Socket 包测试及模拟 Chrome executable 测试，未改变本地失败记录，也不等于用户 Mac。其他两个 Go workflow 失败单独记录，不概括成 Go CI 全绿。

## 源码提交后的最终 main 集成

另一个任务的 `871c2e4bb6b3a7e237201372e7c2e803a707f642` 已安全快进集成。它修改 SW 容量和构建审计，本轮 18 个源码/测试/CLI 文件的 hash 逐个未变。已按新构建合同重新执行 [production](integrated-main/build-production.json)、[strict package/ZIP](integrated-main/pack-production.json) 与 [313 输入 source check](integrated-main/check-source.log)。当前集成包 hash：`7f0350d38eb9d2e7519dae2c5ec151d844b4f999425b28c2aafdee66ef4c27ed`；ZIP SHA-256：`9fa0314b12368983d97dd044511af9edc5f9d38d5baa4e32d41c0f32ce975073`；SW 319248 bytes，原 327680 bytes 上限不变。此项减重归原任务，不归本轮文件闭环实现。

[集成候选 CI](integrated-main-ci.json) 的 Native Agent、包预算及相关组件工作流通过，另外四个 R16.1/真实 Chrome permission/Controller/TOC 工作流失败单独记录。下面保留源码提交 `c41102d7…` 的包 `9dc5bfec…` 和原 CI，不把旧包身份替换成新包。所有包均未加载到用户 Mac。

### 集成候选的四项失败

| 工作流 | 实际结果及已核对的范围 |
| --- | --- |
| [R16.1 #38060817854](https://github.com/shopable-ai/opendesk-browser/actions/runs/38060817854) | FAIL；已打印 SDK HTTP/HTTPS 的 PASS，随后退出钩子删除专用 Chrome Profile 时 `ENOTEMPTY`。功能标记不改写 workflow 的失败状态。 |
| [Controller HTML / R13 #38060817906](https://github.com/shopable-ai/opendesk-browser/actions/runs/38060817906) | FAIL；12 个功能 case 均成功、网络测试打印 PASS，随后删除专用 Profile 时 `ENOTEMPTY`。 |
| [R3.1 #38060817845](https://github.com/shopable-ai/opendesk-browser/actions/runs/38060817845) | FAIL；`USER_SCRIPT` preview 返回 `E_EFFECT_UNKNOWN`，尚未开始 Install/20 次运行。在任务前 `e6807e9…` 的 [#38060448271](https://github.com/shopable-ai/opendesk-browser/actions/runs/38060448271) 已出现同一失败、断言和零验收进度；测试及 workflow 未变。 |
| [Reading TOC #38060817829](https://github.com/shopable-ai/opendesk-browser/actions/runs/38060817829) | FAIL；所选 extension ID 的 `ui/tool.html` 打开为 `ERR_FILE_NOT_FOUND`，TOC 安装前 tool shell 未挂载。测试从第一个任意扩展 service worker 取 ID，没有核验属于本包，这是具体检查缺口及合理疑因；日志不足以证明根因。打包记录包含该文件，不能据此声称本包漏文件。 |

前两项的测试与 workflow 在 `e6807e9…` 到 `871c2e4…` 之间未变；日志与 Chrome 退出、目录清理时序问题相符，但没有证明仍在写目录的具体进程，也没有可用前次同 workflow 运行对照。后两项分别保留“已确认早于本轮”和“根因未确认”的区别。它们没有进入本轮 Native Workspace/ChatGPT 文件闭环，仍不能当作真实 Mac 验收或全部 CI 成功。精简分类与关键原始日志见 [Profile 清理分类](ci-integrated-review/protocol-ci-summary.json) 和 [R3.1 / TOC 分类](ci-integrated-review/sidebar-integrated-review.json)。未重跑或修改这些其他任务的测试以改变结论。

## 保留的失败与恢复

[最初组件失败](initial-components.tap) 含两个旧预期/异步断言；[并行集成时的 83/84](components-integrated.tap) 因 fixture 等待轮数过短，改成有超时的状态观察后 84/84，应用语义和断言未放宽。`check-source-final.log` 是误用不存在的 npm 脚本的命令错误，正确命令结果另存。Go 修复前权限 ABA 的四项真实失败在 Go 仓库证据保留。

旧生产成功包 `bcf2183a…` 仅对应 [远端样式整合前输入](before-remote-style-integration/build-production.json)。整合别人的 Sidebar 样式后已重新构建并校验当前包。一次 [build lock 拒绝](production-integrated-final.log) 是本任务已结束构建的 PID 被执行器 `sync_share` 复用；[恢复记录](own-build-lock-recovery.json) 证明核对已结束的 owner、取得原独占 guard，仅归档本 checkout 的旧锁，没有杀进程或删除别人的产物。

## 尚未完成的真实 Mac 项

本轮根执行环境是 Linux，未访问用户 Mac 的安装、Chrome Profile 或指定 ChatGPT tab。**P0、自动回答识别/自动回填在真实 ChatGPT 的兼容性、用户网页发送、模型使用未知随机标记、同一对话两轮修改、实际 Native 拒绝和独立真机磁盘证明全部 NOT_TESTED。** 不用 Go temp 文件、内存 Demo、CI 或复制上下文代替。

执行 [固定源码 Mac 验收提示词](../../../prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)，健康安装先复用；先 P0，再两轮及 A/B、只读、冲突、重放、权限失效、导航/已有草稿/迟到结果。标准流程由用户检查后使用网页发送；实现未自动点击 Send。
