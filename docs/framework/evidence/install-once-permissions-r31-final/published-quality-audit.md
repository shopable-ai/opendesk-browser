# R3.1 固定 eeb3af02：最终独立安全与质量审计

**结论：支持范围内 PASS，质量评分 95/100；未发现尚未关闭的具体 P1/P2。** 唯一被评估版本为 `eeb3af02ca79eb63d6251195f326f977a7ab5b1d`。评分重新核对该版本的源码、实际原生证据和双包字节绑定，不沿用旧 6d 分数，不评价之后包含新 jQuery 改动的 main 或新包；它也不是全部权限能力的完成百分比或完整 F3 认证。

审核者：`authorization_audit`。只读仓库与证据，无新全量测试、原生浏览器运行或仓库修改。完整 193 个源码输入、4 个 driver 输入及 47 + 32 个编译文件逐字节核验由 `verification_review` 完成；本审核读取其原始收据，并独立复核 Git 绑定、两个原件 ZIP 摘要、22 份文档快照、权限检查点、历史回执及 CI 原始汇总。范围及哈希详见 `r31-eeb3af02-final-audit-readback.json`。

## 支持范围与阻断关闭

本结论覆盖 Installed Page 的 `page.dom`、Installed Task 的 `page.automation`，普通 Controller／本地项目／Page Preview 的静默运行检查，以及显式配置的普通 Controller axiosx Origin 范围。安装身份、授权代次、当前程序范围和状态继续由既有存储与 Authority 管理；内部运行身份的创建不要求用户再次授权。已安装 Task 不能继承普通 Controller、独立网页 SDK 或其他程序的跨站、Cookie、宿主存储或 Native 能力。

此前真实复现的跨程序／旧代次复活、停用及晚到结果、未知效果重放等阻断已关闭；相关 Page／Task 授权核心文件与此前审计版本保持相同。最后发现的 Controller 附加 Origin 撤销遗漏也已关闭：完整运行范围参与静默检查和持久撤销，`contains=false` 无事件窗口会持久拒绝，附加 Origin 撤销会停止活跃 run、阻止保存响应重放及迟到结果交付；恢复 Chrome 权限不复活旧 run。原结果、回执和未知效果保护保留，正常导航及 Worker epoch 重建不误杀有效历史结果。

该 Controller 主实现 SHA-256 为 `5c3d7fdf93036aa488f2e514d53c64505147863962f588d8a2f5400a90006a8b`，与本人最后动态复测的字节完全一致。网络范围辅助模块之后仅缩短两条错误说明，条件和错误码完全相同。动态复测原件为 `r31-controller-network-merged-audit.output.json`；没有把组件测试改写成原生撤销 PASS。

## 本版证据与重新评分

| 维度 | 得分 | 本版依据 |
| --- | ---: | --- |
| 功能与恢复体验 | 25/25 | 普通运行静默检查；已有 Chrome／程序授权复用；缺权独立恢复、不自动续跑；同范围升级和扩权差异、持久授权的实现与组件回归成立。 |
| 安全与组件边界 | 35/35 | 程序身份／代次／目标绑定、撤销及结果检查、跨程序能力拒绝、固定源码与依赖、停止和未知效果保护；附加 Origin 的最后实际 P2 已有独立动态关闭证据。此项为源码和组件边界评价。 |
| 回归与交付 | 19/20 | 本版授权定向 248/248、check、双构建、实际双包与原生包绑定通过；完整 environment 为 728 总项、721 PASS、0 FAIL、0 cancelled、7 skip。保留 1 分：固定提交的 Controller HTML 原始 lane 仍为 FAIL，后续 fixture PASS 不回写原结果。 |
| 真实 Chrome | 16/20 | 本版 20 个独立安装后自动执行文档零 request：7 分；A/B 独立安装及 B 停用：3 分；真实 Worker 重启：3 分；同 profile 整浏览器重启：3 分。四类未测原生边界各保留 1 分。 |
| **合计** | **95/100** | 按固定权重重新赋分；不按测试数量、CI 数量或 cleanup 数量计算。 |

[本版 R3.1 原生 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996123) 的四个真实场景全部 PASS：22 个唯一 documentId 和 22 个唯一 receiptId，51 个检查点累计 `permissions.request=0`。A 的安装授权、固定源码和代次保持不变；B 持续 disabled，真实注册不存在，执行回执为 0。Worker 具有 stopped／absent／新执行上下文链；浏览器 PID `24881 → 25197`，profile 身份保持不变，session 更新，旧 21 条回执逐字段不变。cleanup 两进程 exit 0、profile 删除成功，无残留。原件 ZIP SHA-256：`e9e58d59c7dc173f72f0a8b353a0d389a561395b36f4a19e6a6bf814aee5b5d8`。

[本版实际双包 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996052) 的 development 47 文件、production 32 文件均由独立审核直接读取编译 ZIP 字节核对，193 个源码输入与固定 Git 相符。开发包 packageHash 为 `0054113f15c3015829fa31ccdecd1ee01b50d6f1766b5a91e96d2a9d2e8ae5c1`，与实际原生运行包完全一致；生产包为 `a5b44721edd8d842627d029b2dfa72c1630b264bc216a26bf4219c8e2fea4159`。生产 SW 为 327524 B，低于既有 327680 B 预算。双包外层原件 SHA-256：`f0239666ff7fa3dc6848ab2cd3072dc512183d6efd4751fa313d11f6f3624f2a`。

固定 eeb 的 9 条 workflow 是 **7 条产品成功、1 条产品失败、1 条 cleanup 成功**，不能写成全部产品 CI 绿。[原始 Controller HTML 失败](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996104) 为专用 Webpack fixture 缺少内置资源清单，严格加载器返回 `E_BUILTIN_RESOURCE`。`4d2fb2a4` 仅修改 fixture／工作流，补真实编译资源和清单，未放松加载器；保存的后续 Chrome 原始报告七场景均 PASS。这关闭了该 fixture 缺口，但不把后来运行的提交或包当作固定 eeb 的重新验收，也不因此增加原生授权分。

## 保留的真实边界

原生仍未证明四类情况：实际撤销／拒绝／主动恢复（含 Controller 跨站撤销）；同范围升级及扩权确认；Controller／本地项目 20 次原生循环；恶意跨程序调用、旧回执和故意注入竞态的完整对抗性排列。相应组件证明保留，不能提升为原生 PASS。观察器附加前启动窗口仍为 NOT_OBSERVED，22 个文档来自一个合成 loopback 来源。

Installed Page／Task 的程序私有特权 HTTP、浏览器 Cookie、宿主存储和 Native Messaging 桥未作为本轮能力交付；独立网页 SDK 不替代程序授权。停用和撤销不回滚已发生的网页或网络效果。已知 Native 直接启动已安装 Task 的安装快照兼容缺口继续安全拒绝，不据此签署 Native Task E2E。上述未支持能力、完整 F3、其他来源／所有浏览器版本及后续 main 新包均不在 95 分的适用范围内。
