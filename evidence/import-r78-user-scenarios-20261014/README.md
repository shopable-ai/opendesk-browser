# Import R7.8：四种用途的实际结果

| 用户用途 | 当前结果 | 同一候选的原始证据 |
|---|---|---|
| 自动操作网页 | ChromePage Locator 搜索，提交计数恰好 +1，同一 Controller 的真实 D3 max=5；保存、固定版本重跑、Stop、整 Chrome 重启离线运行通过 | [组合验收](chrome-main-permission-18/acceptance.json)、[重启](chrome-main-permission-18/r78-restart-cycle.json) |
| 给网页增加功能 | 普通 Page ESM D3 在 USER_SCRIPT 中创建可见 DOM，真实回执、Candidate 保存、恢复与安装执行通过；复用既有 React/D3/ECharts | [组合验收](chrome-main-permission-18/acceptance.json)、[Candidate 原始身份](page-candidate-delivery-identity.json) |
| 自定义插件页面 | 已提交的本地 D3 工具示例经原打包器安装，打开/重开均显示 5，卸载清除 iframe；v2 多 Classic 资产顺序也通过 | [工具验收目录](chrome-main-permission-tools/) |
| 定时自动运行 | 同一已保存 Controller 经真实任务审阅、验证、安装与一次性计划触发，网页计数 +1、D3=5、Worker released | [组合验收](chrome-main-permission-18/acceptance.json) 中 R78-D3-SCHEDULED-ONCE |

源码入口：[Controller 示例](../../examples/programs/single-file/controller-d3-chromepage-esm.js)、[用途说明](../../examples/programs/single-file/README-import-r78.zh-CN.md)、[本地 D3 工具](../../examples/sidebar-tools/import-max-probe/README.zh-CN.md)。

本轮修复三个实际缺口：保存后执行字节与固定 Revision 身份不一致；重开后加载 ESM 未刷新来源许可准备；撤权恢复后 ESM consent 未重新只读预热。生产改动仅在 `script-editor.js` 与 `page-component-remote.js`，复用现有编译器、ChromePage、Worker、Authority、RunHost 和 Tool 沙箱。

## 候选与运行身份

- 归档 base HEAD：`b2c0e1fa885328f986c3738f3ed4a3a8e1421d27`，叠加本任务源码；[逐文件输入](main-permission-final-inputs.json)。后续无关 main 提交不是此包的同包证据。
- Developer packageHash：`fb3bcd30992521907feda475ea8bf37a71d27a2e9ee555904dea93724e8fce9b`。
- Standard packageHash：`041a5ec679936208ceecbe982cd749ffd1310146b27a910b0267b0e89e42de48`。
- Controller 作者 sourceHash：`1188c60211f3d483231ccf0ee1fbbaf63f721bce94af19e2b8f3192f9de406d2`。
- 保存 Revision / 固定运行 / 定时 sourceHash：`832cb46181999811140d6ac949862b8536bc238bc9611561d3d363e3d740b48c`。
- 固定 Run：`09afdca7-b45a-438e-85ab-ec5a484881f3`；Result：`37f037f3-9a34-481d-8fbf-098a2ab3d82d`。
- 定时 fireId：`sched:937b78b9-45df-4d68-9bc2-7de431882214:1:1791926520000`；Run：`712e7c05-df9e-4801-a401-75af37c10b42`；Result：`e6572195-2f4a-4ac2-a5ac-d4ed1dbed4f1`。
- 离线 Run：`76641970-02ed-4557-be11-32d956cadce1`；Result：`7835d99b-4b8a-4167-849f-f634f501bb1f`。
- Page sourceHash：`9f5357b3eee7997f9be04b48f67d2bc9bf4e373b81ac14aaa2c4f6059d29a4ca`；普通 USER_SCRIPT 使用原始 receiptNonce/documentId，没有另造 Preview ID。

完整映射、Page receiptNonce/Document、工具安装字节、权限与清理状态见 [delivery-index.json](delivery-index.json)。

## 分级验证及剩余缺口

| 等级 | 结果及范围 |
|---|---|
| SOURCE | 664 个源码/测试/构建文件检查通过；未增加第二运行器或依赖 |
| NODE | 新 Controller/编辑器/依赖/Locator 175 通过；未改实现的任务/工具/静态 Background 安全 158 通过；调度安全定向 26 通过。数量存在覆盖交集，不合算产品完成率 |
| BUILD | 两版 Build/Verify 通过，sourceDrift 为空；Developer tool-shell 495305 / 524288 字节，未提高预算 |
| CHROME_CFT | 同一 Developer 包四种用途正向通过；CFT Profile/PID 原 launcher 清理完成，日常 Chrome 与 dist/development 未替换 |
| SECURITY | 原生撤权、历史结果禁止交付、恢复后的预热、坏 SHA 在执行前拒绝、源码更改后的 Stop、网页全局无 max/page 泄漏通过；[原始安全回执](chrome-main-permission-18/r78-d3-security-cycle.json) |
| MAC_NATIVE | 本机 Mac CFT 原生鼠标/键盘与 Chrome 权限菜单操作已验证；Native Messaging / 独立最终 F3 / ZIP / CWS 正式验收 NOT_TESTED |

**95+ 评分保持 NOT_SCORED，正式产品验收未关闭。** 当前无同包原生证据的定时 Stop/撤权/缺失 Host、卸载后旧 Tool 实例主动 Bridge 调用，以及 Cloud Control 保持 NOT_TESTED；组件安全测试与 iframe 清理不能替代这些原生负向记录。完全关闭 Chrome 时不承诺网页定时继续运行。

先前失败、准备错误和旧候选记录全部保留。`security-17` 的权限恢复失败是本轮新修复的产品缺陷；`security-15/16` 是验证器对现有保守错误码/撤权标记的误判；09 的 Stop 释放观察超时保留，不改写为 PASS。最新 18 包的 Stop、权限恢复和坏 SHA 已重新通过。

提交前 CI 原始快照见 [ci-current-main-before-r78.json](ci-current-main-before-r78.json)。[既存 Page 依赖 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38468851133) 失败，Job API 没有步骤日志；Mac 定时工作流仍排队。后续本任务提交 CI 与远端身份另存交付记录，不把失败、排队或旧包提升为 PASS。
