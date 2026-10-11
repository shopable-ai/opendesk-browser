# 阅读目录默认当前章节

日期：2026-10-11（Asia/Shanghai）。状态：本地实施、组件与生产构建验证完成；资源 released。

用户要求网页阅读目录默认选择“当前章节”，兼顾普通网站和 ChatGPT 内容。
基线 HEAD：`c83c065dd9bc3b1f8fe4e9c9687e2d6243ce7818`；单 writer 在 main 本地修改。

范围：`src/reading-toc/view.js` 与官方工具 `src/main.js` 默认 `focus`，HTML 初始选中状态同步；工具更新为 1.0.3，继续只有 `page.toc`。保留概览/完整目录切换、来源自动跟随/手动固定和授权规则。

证据复用：读取测试指南及 R4.4/R4.6 工作流。原 CI 结果保留为原候选证据；本轮默认模式和工具包输入变化属于 AFFECTED_INPUTS，只验证对应目录、打包及宿主边界，不重跑框架完整合同。

通过条件：网页与侧栏初始选中当前章节；普通文章显示所属章节及当前高亮；AI 回答继续自动跟随及手动固定；显式概览/完整目录切换仍可用；源码检查和隔离生产构建校验通过。

资源：定向 Node 检查/测试，独立证据目录 `evidence/reading-toc-default-focus-20261011/`；不占用浏览器或端口。共享 dist/.wxt 由其他验收工作流维护，本轮生产构建使用独立临时源码快照，不覆盖共享产物或 receipt。

验证结果：

- `node --test tests/environment/reading-toc-r41.test.mjs tests/environment/reading-toc-overview-r43.test.mjs tests/environment/reading-toc-placement-r42.test.mjs tests/environment/reading-toc-visibility-r46.test.mjs tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tools-host.test.mjs`：78/78 PASS，0 FAIL，0 SKIP。增加现有用例的默认模式与当前高亮检查；概览测试显式切换到概览后继续验证原合同。已有来源自动跟随/手动固定用例通过。
- `npm run check`：390 个源码/测试/构建文件检查通过；`git diff --check` 通过。
- `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/reading-toc`：1.0.3 包验证通过，9376 bytes，仅 `page.toc`；installed=false。
- 独立临时快照内 `npm run build` 与 `node scripts/verify-package.mjs dist/production`：PASS。产物已复制到 `artifacts/reading-toc-default-focus-20261011/production/`，未改共享 dist/.wxt。可导入工具包与构建内置工具包逐字节一致。

生产 packageHash：`dd0951b889db267bc2aa699c003b288dcaccfd3ec5689163106158f0ed642d33`。
工具 SHA-256：`c68b42809e67fe2cbd7957d76cc59ccc3caee8a63e6d6a8aa7b2eda3534a6179`。
全部修改的产品/测试文件与隔离快照逐字节一致；输入 SHA、原始日志摘要、完整构建回执见 [source-binding.json](evidence/reading-toc-default-focus-20261011/source-binding.json)、[result.json](evidence/reading-toc-default-focus-20261011/result.json) 与 [build-receipt.json](evidence/reading-toc-default-focus-20261011/build-receipt.json)。

保留首次失败：测试替身原先 `querySelectorAll` 一律返回空数组，新增高亮断言观察不到按钮；修正替身后重跑通过。隔离快照首次采用 node_modules 符号链接，被构建来源校验拒绝；改为复制现有依赖后构建及校验通过，没有安装新依赖或放宽来源校验。首轮构建失败后的包校验缺 manifest，亦保留原日志。

限制：本轮未占用 CFT/普通 Chrome、未安装或重载用户浏览器；真实 ChatGPT/知乎、Native/F3/ZIP 均 NOT_TESTED，组件与构建 PASS 不提升为这些等级。源码与 review 产物已就绪，浏览器需实际加载此扩展候选并确认更新侧栏工具后取得新默认行为；保留其他工作流现场与历史 receipt。
