# OpenDesk Browser React UI R34.5 — 任务管理草稿保护与构建门禁续接

日期：2026-10-18。工作分支：仅 `main`。阶段：`SOURCE_FIX_SUBMITTED / CI_PENDING`，用户本地 `LOCAL_MAC_NOT_TESTED`。

## 业务结果与继承证据

- 不重写 React Root、Scheduler、Host、Registry；保留 R34.4 已通过的真实 macOS Chrome R3 [39132327223](https://github.com/shopable-ai/opendesk-browser/actions/runs/39132327223)（计划 CRUD、时区、历史、删除、20 计划）与 R1/R2 成功证据，严格绑定原 SHA。
- R34.4 任务管理搜索/筛选/复制已在 [39132972937](https://github.com/shopable-ai/opendesk-browser/actions/runs/39132972937) 真实 Chrome 执行，最后 CDP DOM 序列化故障修复 `97854bf5` 仍需复验。
- R3 [39133752231](https://github.com/shopable-ai/opendesk-browser/actions/runs/39133752231) 因 AdBlock fixed-source pin 旧值在构建阶段失败。并行 AdBlock 所有者在 [09bfb3345bba](https://github.com/shopable-ai/opendesk-browser/commit/09bfb3345bbaa0c09ef10dc9987784e738653080) 审查并同步精确 `host-controls.js` Blob `79dbe97eaf1eb61315e634384d922079f2d4b136`；**非本工作流修改/放宽可信来源**。构建在最新候选的结论必须由新 CI 验证。
- 新发现源代码级缺陷：`src/ui/scheduled-task-workbench.js` 的直接 `receiveDraft` 经 `src/ui/task-workbench.js` 进入 `src/ui/script-editor.js`，后者的 `applyImported()` 直接 `replaceSource()`，此前没有保护 Developer 未保存编辑。
- 最小修复：在原任务管理视图由现有可信 JS 动态挂载确认卡，提示会替换当前 Developer 草稿并允许取消/ESC；用户真实确认后才进入既有 `getTaskCandidate → receiveDraft`。取消前后草稿、任务身份与计划不变；复制前再次校验 Task 安装版本、Installation ID 与 Generation。旧 React 卡片及原生回退使用同一回调，不修改 React、HTML 或 Scheduler 业务。
- 定向测试：`tests/environment/scheduled-task-ui-r1.test.mjs` 增加授权顺序的源约束；`tests/framework/scheduled-tasks-r1-native-mac.test.mjs` 用真实输入先创建未保存 Developer 草稿，再验证取消保留、确认后精确源码进入编辑器和计划/安装记录一致性。
- 仅有静态源码提交**不等于产品已修复验收通过**：R3 macOS CI、正式构建、同源预览 `--check`、正式包 SHA、用户 Mac 都应在执行后独立记录 PASS 或 FAIL；当前 `NOT_TESTED`，不可将历史成果冒充新候选通过。
- 此次没有修改预览生成器的 `inputs` 所列文件；`src/ui/scheduled-task-workbench.js` 作为业务控制器不在六 Tab 离线 HTML 的输入清单。仍必须实测官方生成器与 `--check`。
- 用户本地路径 `/Users/shopme/Documents/workspace/opendesk-browser` 当前 GitHub 连接无法读取。不得声称运行了本机 `npm run build`、真实用户 profile 或本机 Chrome。

## 下一阶段最小执行

1. 读取本提交自动触发的 `Scheduled Tasks R3 genuine plan detail and form navigation` 工作流原始 job。若失败，先区分来源校验、测试假失败或真正产品故障，再最小修复。
2. 按原脚本跑 `node --test tests/environment/scheduled-task-ui-r1.test.mjs tests/environment/scheduled-task-manager-draft-r12.test.mjs`，以及实际 `npm run build` / `verify` 和 Mac 真 Chrome。
3. 验证搜索、筛选、复制取消、确认替换、返回计划、任务启停、卸载确认和历史留存。先复用无输入变化的 R1/R2 成功证据，变化范围需有新验收。
4. 执行 `node scripts/preview/build-sidebar-six-react-preview.mjs` 与 `--check`，记录生成 HTML 完整字节 SHA256；本地安装实测必须独立完成。

本文件保留失败与阻塞状态以供审计；未取得原始结果的六维目标逐项 `NOT_SCORED`。
