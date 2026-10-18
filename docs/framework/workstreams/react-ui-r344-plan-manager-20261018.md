# OpenDesk Browser React UI R34.4 — 计划详情与任务管理实证收敛

日期：2026-10-18。负责人：本次 R34.4 对话。工作分支：`main`，初始远端 HEAD `1c32dd4f903fed63598af22db6a408a7194a01f5`。状态：`ACTIVE`（任务管理新增原生测试尚待最终 CI 结果）；本机验收仍为 `LOCAL_MAC_NOT_TESTED`。

## 用户目标与工作范围

让现有正式 React Side Panel 的计划详情、规则编辑、删除、运行历史及任务管理成为完整可操作的真实业务链。底层 Chrome Alarm、Task Registry、Host RPC、Developer 导入及 React Root 均复用原实现，不增第二套执行器或业务 UI。

本次只写入：
- `tests/framework/scheduled-tasks-r1-native-mac.test.mjs`（三次最小原生用户流程修复/扩展）；
- 本工作记录。

公共 API、权限、持久化 schema、React 正式 JSX、HTML、CSS 和打包器未改动。现有 `docs/framework/workstreams/react-ui-r343-installable-scheduler-20261018.md` 和历史证据保持原样。无本机共享 Git 索引、Chrome profile 或构建输出资源占用；通过 GitHub main 文件 Blob SHA 比对写入，保护并行提交，不创建新分支、Worktree 或 PR。

## 实际提交与根因

1. [`bf373d63a36a65d4000ae61041f82ba9a00453db`](https://github.com/shopable-ai/opendesk-browser/commit/bf373d63a36a65d4000ae61041f82ba9a00453db)：R3 macOS 真机流程仍寻找已移除的 `#schedule-timezone-edit/search/done`；正式界面已使用 `#schedule-timezone` 原生 IANA 下拉框。测试改为真实 Chrome/AppKit 下拉选择并断言实际值，不恢复旧按钮。R3 [39131831026](https://github.com/shopable-ai/opendesk-browser/actions/runs/39131831026) 确认每日和每周修改保存成功，但随后暴露第二个测试可见性故障。
2. [`88f66d0e1446f9e1290c4225d884037947c82c78`](https://github.com/shopable-ai/opendesk-browser/commit/88f66d0e1446f9e1290c4225d884037947c82c78)：原生点击测试在保存后、卡片再次可见前调用 CDP 布局接口，出现 `Node does not have a layout object`。仅在鼠标手势之前等待实际按钮可见，并用当前 React 的 `data-schedule-action="edit"` 定位；无 DOM 写值、合成点击或重复未知操作。
3. [`87da1007700bddc917bac00043da9b75bbb83b80`](https://github.com/shopable-ai/opendesk-browser/commit/87da1007700bddc917bac00043da9b75bbb83b80)：在现有 R3 真实 Chrome 产品流程末尾补充任务管理搜索、已启用/停用筛选、固定源码真实复制到 Developer、返回计划列表及身份/计划不变断言。其 [R3 流程 39132972937](https://github.com/shopable-ai/opendesk-browser/actions/runs/39132972937) 提交时尚未得到结果，不能把新增部分报作通过。

**没有发现需要更改的调度引擎或 React 产品实现缺陷；前两项是原生测试与已交付界面不同步和点击前可见性时序。**

## 当前真实验收证据

- [R3 macOS 39132327223](https://github.com/shopable-ai/opendesk-browser/actions/runs/39132327223)：`SUCCESS`，Node UI 定向回归 51/51，原生 Chrome 4/4；已安装真实 Side Panel 中完成 Alarm → Controller → Run/Result → release，真实修改每日/每周/间隔计划、跨时区、JSON 校验与草稿恢复、历史技术详情、删除确认、20 计划隔离/列表位置与焦点恢复。原生扩展 ID `pnhiokdnhhpbidgojhbjknpldipijdfa` 属 CI 临时安装，不等于用户 Mac。
- CI 同一正式 WXT production build 和 verify-package：`PASS`，`packageHash=e979b167157180871635baeb6eee2a98604e5f049f97edc844ea77a72922a450`，104 项资源；该 hash 只标识对应 CI 构建候选。
- [R1 macOS 39131830981](https://github.com/shopable-ai/opendesk-browser/actions/runs/39131830981)、[R1 Linux 39131831037](https://github.com/shopable-ai/opendesk-browser/actions/runs/39131831037)、[R2 固定 Task 身份 39131831106](https://github.com/shopable-ai/opendesk-browser/actions/runs/39131831106)、[R2 Chrome 整体重启 39131831049](https://github.com/shopable-ai/opendesk-browser/actions/runs/39131831049)、[R2 网站撤权恢复 39131830991](https://github.com/shopable-ai/opendesk-browser/actions/runs/39131830991)：均 `SUCCESS`；这些实际原生证据可以复用，不因测试扩展重新开发 Scheduler。
- `src/ui/scheduled-task-workbench.js` 的 `commitScheduledMutation()` / `describeScheduleMutationFailure()` 对明确提交、随后读取失败及 `E_EFFECT_UNKNOWN` 的保护由 R34.3 和本轮 51 项 Node 业务回归共同支持。结果未知不自动重放副作用操作。

## 尚未宣称通过的范围

1. 新增的“任务管理搜索/筛选/复制到 Developer/返回”连续原生用例：上述 39132972937 完成后逐项更新真实状态；R2 的启停/卸载 PASS 不代替复制操作。
2. `prototypes/sidebar/react-preview/index.html` 是通过 `scripts/preview/build-sidebar-six-react-preview.mjs` 从正式 DOM/React/CSS 生成的忽略文件，不在 main 源码树中。本轮未持有原始 HTML 字节，故 `HTML_SHA256=NOT_VERIFIED`；旧 CI 来源输入 hash 不能冒充 HTML 输出 SHA256。官方预览 CI [39126984802](https://github.com/shopable-ai/opendesk-browser/actions/runs/39126984802) 仅为 `SOURCE_BOUND_PREVIEW`，不是 Host RPC 验收。本次起点至三个改动均未修改其业务输入。
3. 无法访问用户的 `/Users/shopme/Documents/workspace/opendesk-browser`、日常 `npm run dev` watcher、Mac Chrome 安装/升级 profile：`LOCAL_MAC_NOT_TESTED`。本轮未在用户本机运行 `npm run check`、`npm run build:dev`、`npm run verify`，不能凭 CI 子范围代替。
4. 无完整本机验收、输出 HTML 哈希及新增经理操作验收之前，整体“95+ 最终产品交付”不得宣称 PASS；逐维评分只以实际可追溯证据为基础。

## 最小后续交接

先读取新增 R3 CI 实际日志和本记录，若失败仅修复当前真实阻塞并重跑受影响部分；若通过，结束本轮源码修复。Mac Codex 只在已有 `main` 工作目录且不抢占其他 Agent 构建/Profile 的前提下运行正式安装测试、核对 Extension ID/Run-Result/关闭重开、生成同源 HTML 并记录真实 `shasum -a 256 prototypes/sidebar/react-preview/index.html` 输出。不得用旧 HTML、模拟 Host、旧 CI 或 ZIP 替代真实运行证据。

## 资源与并行状态

GitHub `main` 仅做最小原子文件更新；不拥有长期锁、后台 watcher、Chrome profile、共享 dist 或 Native 配对。当前无需要转交的本地写入资源。工作流 CI 运行独占各自 GitHub runner 与临时 profile，其完成状态以实际 Actions 作业为准。
