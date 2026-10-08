# OpenDesk Browser R5.1 — 现代 Page API 实施记录

记录日期：2026-10-08。唯一正式仓库：`shopable-ai/opendesk-browser`；既有目标分支：`main`。本轮使用连接的 GitHub 写入，不声称访问了 Mac 本地工作区，不创建 worktree/开发分支、不清理旧分支。

## 实际实施范围

| 层 | 文件 | 本轮改变 |
| --- | --- | --- |
| API 契约 | `src/framework/control/locator-contract.js` | 版本、Descriptor 校验、CSS/角色/文本/TestId/观察参数与有限能力声明 |
| Worker 侧 API | `src/framework/locator.js`、`src/framework/ChromePage.js` | 不可变、同步构造、捕获精确文档的 Locator；observe；已有 `page/params/main()` 入口不变 |
| ISOLATED DOM | `src/scripting/packaged/locator-dom.js`、`registry.js`、`page-session.js` | 同一组角色/可访问名称/文本规则供定位和观察共用；read/prepare/commit；不会通过 MAIN 执行特权代码 |
| Controller Driver | `src/framework/control/native-driver.js` | 原运行 deadline 内重复只读 prepare，Authority/Target 再校验，单次 commit；阶段回执记录 `locator.commitIntent/locator.commitNoEffect` |
| Existing Authority | `src/platform/host/controller-methods.js` | 仅短提交窗口加并发写门；已提交但无明确无副作用回执按原 `effect_unknown` 模型保留 |
| 开发者体验 | `types/opendesk-page.d.ts`、`docs/framework/modern-page-api.zh-CN.md` | 开发者类型、默认写法、AI 使用边界、旧 API 语义差异 |
| 演示任务 | `examples/tasks/demo-form.html`、`modern-search-draft.js`、`README.zh-CN.md` | 使用角色/标签而非 TestId 的预填值覆盖→按钮重绘/延迟→一次提交→结果获取；保留旧签名任务 |
| 测试 | `tests/framework/r5-modern-page-api.test.mjs`、`.github/workflows/sidebar-r1-p0.yml` | 真正生产模块的 Node DOM/Chrome callback 模拟，测试零 RPC、角色/名称、观察匹配、重绘、fill、click 次数、严格匹配、撤权、文档变更、回执丢失 |

## 明确保证和保留

- 旧 `page.type` 追加输入、旧 `page.click`、`snapshot/snapshots`、`$/$eval`、`evaluate`、`goto/reload`、screenshot/cookies/upload 未删除、未偷偷改名或变更语义。旧 `form-fill.v1.opendesk-task.json` 的 manifest/sourceHash 未改变。
- 不再建立第二个任务执行器、权限数据库、Durable Result 数据库、Native Host 或 Agent Runtime。任务仍通过 Sidebar 草稿 RunHost → Worker → Controller/Authority → ISOLATED 页面执行器返回既有结果持久链。
- 同文档重绘每次重查 DOM；跨文档旧 Locator 失效。只读 prepare 不会 focus/scroll/dispatch 页面事件；短 commit 前后通过既有目标与权威检验。不宣称权限和浏览器效果为原子事务。
- 不支持 `press`、可信输入、XPath、Playwright 特殊选择器、Shadow 穿透、自动滚动、完整 AX Tree。DOM 元素 `.click()` 和 input.value/input/change 事件均非可信输入；不能当作 CDP 键鼠替代。
- 语义算法为明确范围的 DOM 推导近似，不构成完整的 WAI-ARIA/Playwright 可访问名称计算规范实现；复杂 ARIA 组件可能有差异。读取方法瞬时返回（waitFor 除外）。观察输出受 root/maxDepth/maxNodes/maxChars 限制，truncated=true 提示不完整。

## 定向验证与证据级别

| 验证事项 | 命令/入口 | 结果 | 证据 |
| --- | --- | --- | --- |
| R5.1 组件例测 | `node --test tests/framework/r5-modern-page-api.test.mjs` | PASS（含失联 commit 回调单次副作用测试） | [Actions Sidebar R1 P0](https://github.com/shopable-ai/opendesk-browser/actions/runs/37785150092) |
| 既有草稿/持久回归 | `node --test tests/environment/sidebar-draft-runhost.test.mjs tests/environment/controller-main-entry.test.mjs tests/environment/task-package-flow.test.mjs tests/environment/task-workbench.test.mjs tests/environment/script-editor.test.mjs tests/framework/draft-native-envelope.test.mjs tests/framework/k3-controller-authority.test.mjs tests/framework/run-host-recovery.test.mjs` | PASS | [Actions Sidebar R1 P0](https://github.com/shopable-ai/opendesk-browser/actions/runs/37785150092) |
| D1/原有环境测试 | `node --test tests/environment/{dependency-metadata,dependency-manager,user-script-dependency-flow,page-dependencies-ui,page-program-package,page-script-preview,script-editor,task-workbench,sidebar-product-contract,boundaries}.test.mjs` | PASS | [Actions R3 package](https://github.com/shopable-ai/opendesk-browser/actions/runs/37785150341) |
| 源码检查 | `npm run check` | PASS | [Actions R3 package](https://github.com/shopable-ai/opendesk-browser/actions/runs/37785150341) |
| 生产/开发构建和包校验 | `npm run build` / `npm run build:dev` / `npm run verify` | PASS | [Actions R3 package](https://github.com/shopable-ai/opendesk-browser/actions/runs/37785150341) |
| 真实 Chrome：Sidebar → Runtime → Native Page Session → Durable Result | 必须本地原生 Chrome/真实扩展 | **NOT_TESTED** | 此执行环境无可复用的真实 Chrome 控制会话 |
| 真正 AI Agent 观察→编写→执行→再次运行 | 需有连接的 Agent 工具、真实扩展目标 | **NOT_TESTED** | 仅已具备制作条件和普通 JS 示例，不声明 Agent 端到端成功 |

注意：曾在 [CI 37784946447](https://github.com/shopable-ai/opendesk-browser/actions/runs/37784946447) 发现新增回执造成固定 SW 字节预算超限（327851 > 327680），**保留原预算**并精简 Controller/Driver 源码，[CI 37785150341](https://github.com/shopable-ai/opendesk-browser/actions/runs/37785150341) 已通过双构建。后续源码提交需以其自身最新 CI 判定，不自动沿用旧提交 PASS。

## 本地 Chrome 接续验收（未执行；独立于本轮组件通过）

1. 在本地最新 main 做 `npm ci --ignore-scripts`、`npm run build:dev`；使用用户现有 Chrome/扩展环境，加载 `dist/development`，不要打断他人配置。
2. `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，打开 `http://127.0.0.1:43111/demo-form.html`。
3. Sidebar「开发」打开 `modern-search-draft.js`，设置 `{"keyword":"OpenDesk"}`，直接运行 **草稿**，不必先保存/安装/发布。确认预填「旧的预填内容」被替换，延迟按钮在同文档重绘后被单击，「搜索完成」出现，结果为「结果：OpenDesk」，提交次数本轮增加一次。
4. 记录真实 `runId`、原生执行阶段回执、`resultId` 和持久最终值，重跑同一代码并验证每轮仅有一次提交；不得以外部 Playwright 模拟点击/填写代替 OpenDesk 动作。
5. 单独测试实际 stop/permission revoke/navigation 前后是否出现多余提交、未知结果是否被安全保持，标注输入为 ISOLATED synthetic DOM 而非 trusted。可选后续 AI 使用 observe 生成脚本时，须保留真实 Agent 调用证据才可标记 AI E2E PASS。

## 当前判定

```text
REPOSITORY_CHANGES_APPLIED=YES
MODERN_PAGE_API_CORE=PARTIAL (源码第一阶段实现并通过组件测试；真实 Chrome 尚未通过)
SEMANTIC_LOCATORS=COMPLETE_WITH_DOCUMENTED_SCOPE (有限原生/ARIA 子集；非完整 Playwright)
AI_OBSERVATION_AND_API_GUIDE=COMPLETE (有限语义 DOM 摘要及指南)
COMPONENT_VERIFICATION=PASS (见指定 CI；后续提交单独核对)
REAL_CHROME_VERIFICATION=NOT_TESTED
AI_END_TO_END_VERIFICATION=NOT_TESTED
INPUT_PROFILE=ISOLATED_DOM_SYNTHETIC_UNTRUSTED
FULL_PLAYWRIGHT_COMPATIBILITY=NOT_CLAIMED
FINAL_FRAMEWORK_ACCEPTED=NO
```

最小缺口是：真实 Chrome/扩展草稿端到端验证与授权/停止边界观测，而不是重新开发 Locator/Authority/Runtime/Sidebar。保留既有 F3/603+19 正式验收口径，不将本轮定向测试等同全框架接受。
