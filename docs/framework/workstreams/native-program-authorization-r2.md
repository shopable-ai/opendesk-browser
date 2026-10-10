# 原生程序授权 R2 工作流

日期：2026-10-10。操作仅 main，未创建新分支或 worktree，未强推。状态：COMPONENTS_AND_DEVELOPMENT_BUILD_PASSED；完整原生权限模型尚未关闭验收。资源：released（未占用用户 Mac、Chrome profile 或端口）。

## 结论与交付身份

原生 JavaScript 保存时不再生成旧 UserScript 元数据头；原始源码和独立 pageRules 进入现有 Candidate、固定版本和安装检查链。普通 JS 无需 @grant none，运行范围也不能夹带或替代能力授权。

- 功能提交 main：`42d0ffcb1d613d151a10f9080676715e482d14b1`。
- 回归断言修正及专项 CI 触发范围补齐：`b34c865e48c305c2290d1881efdabeaa8616850f`。
- 下列通过证据绑定第二个完整候选 SHA，不代表任意后续 main 或未提交修改也已验收。
- 总体设计：[原生程序与能力授权 R2](../../architecture/browser-framework/native-program-authorization-r2.zh-CN.md)。

已实施：page-program-rules、原生 Candidate 输入、请求异步期间的不可变快照、原生规则编译合同、Sidebar 保存说明、原生及兼容回归。

未实施：Page 私有特权 SDK、统一能力确认界面、完整 GM API。未做：真实 Chrome 安装/授权/跨程序隔离验收、整体独立 95+ 评分。不能把这些目标当成已经可用的接口或已获批准的能力。

## 测试历史：保留失败，不覆盖

### 首轮：117 通过、1 失败

候选：`42d0ffcb1d613d151a10f9080676715e482d14b1`。

[原始工作流](https://github.com/shopable-ai/opendesk-browser/actions/runs/38035994860)，job `114166410599`。2026-10-10 07:54 UTC 日志：118 tests，117 pass，1 fail，0 skipped。

唯一失败：`tests/environment/script-editor.test.mjs` 中旧用例仍断言保存后源码必须以 `==UserScript==`、`@match` 开头。实际返回是原始普通 JavaScript，符合本轮新合同。首轮源码检查和开发构建因前置失败被跳过，不能记作通过。

修正：不删除或跳过该用例，改为断言源码逐字不变、pageRules 独立存在、没有夹带 capabilities，并保留真实点击、试运行先决条件、固定版本和不自动安装检查。未修改产品权限检查来迁就测试。修正提交同时补齐专项工作流的受影响测试路径过滤。

### 最终：118/118 通过，源码检查及开发构建通过

候选：`b34c865e48c305c2290d1881efdabeaa8616850f`。

[原始工作流](https://github.com/shopable-ai/opendesk-browser/actions/runs/38036518865)，job `114167962716`；已实际读取完整 job 日志和步骤回执。环境：Ubuntu 24.04.5、Node v22.23.3、npm 10.9.9。工作流仅 contents:read，无发布或自动代码写入。

| 验证 | 结果 | 原始日志依据 |
| --- | --- | --- |
| 原生/兼容/依赖/安装/Sidebar 10 个文件的定向组件测试 | PASS，118 tests / 118 pass / 0 fail / 0 skipped / 0 cancelled | 2026-10-10 08:02:59 UTC |
| `npm run check` | PASS | 08:03:04 UTC，240 个源码/测试/构建文件及固定入口、CSP、MIT 检查 |
| `npm run build:dev` | PASS | 08:03:17 UTC，WXT development package status:passed，40 assets |
| 真实 Chrome | NOT_TESTED | 本工作流不启动浏览器 |
| 私有 Page 能力桥与完整权限确认 UI | NOT_IMPLEMENTED | 不借本次组件证据提升状态 |
| 独立整体 95+ / F3 / ZIP 安装验收 | NOT_TESTED | 不从测试数量计算产品完成率或专家评分 |

开发包 packageHash：`dcc41f65e9cf487922401d20b1856fdfd995be644c2d88dad4acf6db06c05dce`。

执行命令：

```sh
node --test --test-reporter=spec \
  tests/environment/native-page-program.test.mjs \
  tests/environment/page-candidate-source.test.mjs \
  tests/environment/page-candidate-service.test.mjs \
  tests/environment/page-program-package.test.mjs \
  tests/environment/page-installed-programs.test.mjs \
  tests/environment/dependency-manager.test.mjs \
  tests/environment/dependency-metadata.test.mjs \
  tests/environment/user-script-dependency-flow.test.mjs \
  tests/environment/page-script-preview.test.mjs \
  tests/environment/script-editor.test.mjs
npm run check
npm run build:dev
```

可从上述 run 的 job 日志核对完整原始输出；本 Markdown 是索引与观察记录，不冒充浏览器业务执行回执。此前本地独立规则校验 3 项通过仅为纯函数证据，不额外叠加到上述 118 项中。未单独执行全仓库 npm test、生产构建或 ZIP 验收。

## 基线、并行保护与复用

读取基线 `1c9e33e7474db9297d49eec24579aa863a074d55`；初次集成前核对 main `8c43a2ecb5f63cbc36707de545e03a75dd7432a5`。目标旧 blob：dependency-manager `f46fbef611e66342243fb8dcb56b7ec7dda63e7f`；page-program-contract `4aa7b8feca36a15cb1ca1db63923154e9d26a1f4`；page-candidate-source `7710d5efa296cb2f9f50a3d6fb1ae5f8cb7063c4`；script-editor `7f448520b2c20fbd8e46ac5fb201505cb5134bd9`；原 source 测试 `763881e5d988838738b603bf253d50c96128143c`。

多次 main 并行推进均重新读取、比较目标文件并基于最新树构造快进提交；失败候选未通过新分支强行合入。保留其他任务的 Native Agent、HTTP Lab、Workflow Sidebar 及其文档改动。回归修正前还核对原测试 blob `d2a3b3b78fa6b7e18997bba7a091d0d6b90ad571`，未覆盖他人的本地项目状态提示测试。

已读 testing-guide.md。本轮保存/编译输入变化属于 AFFECTED_INPUTS，旧 Page/Sidebar 原生包结果不能自动提升为新包 PASS。原 SDK 查询/撤销的 83 项历史结果不拿来证明原生程序授权整体完成。此处证据记录更新不改变被验收代码；后来若目标代码、传递依赖或运行环境改变，再只补受影响验证。

当前容器无法克隆仓库，完整组件及构建使用真实 GitHub Actions checkout；未声称访问用户 Mac 路径。所有本轮工作流已完成，本记录不代表后台持续监控。
