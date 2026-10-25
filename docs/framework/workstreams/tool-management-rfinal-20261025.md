# 统一工具管理 UI R-FINAL：修复与本地验证记录

日期：2026-10-25。阶段：持续开发；限定范围修复已验证，完整真实验收未完成，不能宣称达到 95。

## 继承与本轮差异

- 起始本地与远端 main：`b322a02bc007f992fec6915bb92d140b07fa9b97`，包含用户指定的 `5fab2f84767bc80b563c9e14fb43e0122e433465`；未重复 cherry-pick 或重新实施基线。
- 本轮第一批修复已由并行 Git 同步工作提交为 `453fcf1e5c444dd3725ddb2c894f4a3a7cfc4925`，合并提交 `c3455adb84bb5fed2c61ee84ddbc56b7f2c5bdd5` 保留了同期 main 工作。
- 后续核查时 main 已同步至 `52d44595cfa9d4becf8196cb72c83ec55784701d`。本报告与剩余焦点、预览及测试修复一起提交；最终 SHA 以交付消息和 Git 历史为准。
- 全程使用 main；未创建分支、worktree 或 PR，未覆盖并行 Agent 的源码、浏览器 Profile 或 watcher。

## 已修复的用户问题

1. **Cookie 未授权时直接进入齿轮设置缺少范围说明。** 首次主入口和齿轮入口现在都展示实际网站范围、声明的 Cookie 操作能力、全站/单站区别；普通工具需要 Cookie 值时，保留单独敏感值授权提示。部分授权不再折叠为正常紧凑状态，已授权日常状态保持紧凑。
2. **列表启停入口的未知结果未进入统一隔离流程。** catch 移到共享 toggle 内；设置 Switch 与列表操作共用读取中保护、写后读回、失败隔离及重读恢复。未知写入不重放，旧 iframe 退役；保留可恢复草稿提示。
3. **停用 Cookie 后错误显示未授权。** 只在授权展示核验中允许识别停用工具保留的授权；实际执行核验默认仍要求启用，包哈希、官方来源、安装 epoch 等校验未放宽，停用时授权控件保持禁用。
4. **无业务设置时空分组仍占空间。** React shortcuts 包装层按真实子入口显示，普通工具和 Cookie 不再留下空“扩展设置”分组；已有业务入口继续保留。
5. **启停完成后键盘焦点丢失。** 原生 Cookie 操作确认 busy 阶段禁用控件会丢焦点。现在通过现有 React effect 通道，成功回 Switch，未知结果回“重新读取”；读回成功/失败分别恢复对应控件。列表触发不会抢占设置焦点。
6. **预览与正式设置的显示不一致。** 既有预览补全 Cookie 说明，并隐藏空提示字段；更新原来的同源 HTML，没有创建新预览或 Host。

## 文件归属

| 文件 | 本轮作用 |
|---|---|
| `src/ui/sidebar-tools.js` | Cookie 披露、授权展示、共享启停隔离与焦点恢复 |
| `src/ui/react/tabs/tool-host.tsx` | 隐藏空业务设置分组 |
| `src/ui/react/preview/clipper-preview.js` | 对齐披露与空提示显示 |
| `prototypes/sidebar/react-preview/index.html` | 既有同源产物更新，包含同期 main 预览输入 |
| `tests/environment/sidebar-tools-host.test.mjs` | 启停并发/未知结果/读回及 Cookie 授权行为回归；更新过时授权夹具 |
| `tests/environment/tool-host-management-groups.test.mjs` | 用真实 React 输出及生产 CSS 检查空分组与原有业务入口 |
| `tests/environment/sidebar-tools-focus-react.test.mjs` | 真实 React 焦点、失败重读、dirty 返回；修正过时列表入口和 CSS 打包夹具 |
| `tests/environment/cookie-editor-r524-grant.test.mjs` | 精确约束展示例外与执行默认门禁 |
| `tests/environment/adblock-navigation-r15.test.mjs` | 去掉与导航无关的固定旧版本号断言，保留导航/草稿保护断言 |

## 定向验证

这些检查分别由启停与 Cookie 行为变更、空分组变更、原生焦点缺陷和实际预览差异触发；未执行全量产品构建、全量历史测试或 production 验收。

```sh
node --check src/ui/sidebar-tools.js
node --check src/ui/react/preview/clipper-preview.js
node --check tests/environment/sidebar-tools-focus-react.test.mjs
git diff --check

node --test --test-reporter=spec --test-name-pattern='R-FINAL T2|R56 dirty tool enable|R1\.6 generic tool settings|R5\.37|R5\.25|R5\.26|trusted React Host has exactly one first-use|explicit complete consent|R5\.38 Cookie Editor keeps|preserved Cookie grants follow installation lifecycle while disabled|ToolHost hides an empty product group' tests/environment/sidebar-tools-host.test.mjs tests/environment/cookie-editor-r524-grant.test.mjs tests/environment/browser-sdk-r106-cookie-contract-gaps.test.mjs tests/environment/tool-host-management-groups.test.mjs

OPENDESK_PLAYWRIGHT_MODULE=/Users/shopme/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs OPENDESK_CHROMIUM_EXECUTABLE='/Users/shopme/Documents/workspace/opendesk-browser/tests/.cache/m5-browsers/154.0.8037.92/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' node --test tests/environment/sidebar-tools-focus-react.test.mjs

node scripts/preview/build-sidebar-six-react-preview.mjs
node scripts/preview/build-sidebar-six-react-preview.mjs --check
```

- 定向生命周期/Cookie/分组：**30/30 PASS**，日志 `artifacts/tool-management-rfinal/final-targeted-tests.log`。
- 隔离 Chromium 中真实 React 焦点与返回：**6/6 PASS**，日志 `focus-tests.log`。包含 Space 停用/恢复、busy 禁用、未知结果聚焦重读、重读失败/成功、不重放写入、dirty 取消/继续和返回列表焦点。
- AdBlock 导航断言 PASS，保存在 `business-focus-tests.log`。该早期组合命令同时暴露焦点夹具构建失败；修复后的独立焦点命令已通过，不把早期整条命令记为 PASS。
- 早期 Cookie 旧夹具的六项超时已修正：能力、敏感值同意、partition 及撤权销毁预期与现行合同一致；未放宽产品权限来适配断言。
- 语法、diff 及最终预览同源检查 PASS。完整 lint/typecheck/build 与全量测试：**NOT_TESTED**。

## 实际 Chrome 操作

环境为持续开发，实际加载 `dist/development`，复用已有 `npm run dev`，没有第二个 watcher。日常 Chrome 155.0.8059.85 的扩展详情确认路径与 ID；独立 CFT 154.0.8037.92 使用本轮临时 Profile，加载同一目录。扩展 ID 均为 `ccfcjegpkdlgbclopjmadlcjedelidmf`。

最终只读开发诊断显示：开发服务已连接，构建 revision `2ff2d6112141e69cd6b31b0b9c420318d0673e130a14a20438e607fc552f7cec`。这些是跨 watcher 安全刷新采集的开发证据，不是同一冻结 production 候选的正式验收。

| 用户操作 | 实际结果与边界 |
|---|---|
| Cookie 首次主入口 → 未授权齿轮 | 两处均显示全站范围、完整声明能力、全站/单站区别；无空业务分组 |
| Cookie 授权 → 紧凑设置 | 隔离 Profile 中回到已授权状态，localhost 空 Cookie 工作区可打开；未新建/修改/删除任何 Cookie |
| Cookie 停用 → 恢复 → 重开 | 停用保留授权、授权按钮禁用、iframe 退役；恢复不自动运行旧 iframe；重开仍为启用。最终鼠标停用和 Space 恢复均聚焦 Switch |
| Cookie 撤销测试授权 | 真实回到未授权，并重新展示完整授权说明。原生 Chrome optional 权限缺失/拒绝、第三方单站与部分授权矩阵未执行 |
| Bookmark Manager | 日常已授权设置紧凑；“查看权限范围”说明全部书签的读/编辑/移动/删除；新建书签/文件夹入口保留。未修改真实书签；首次 Chrome 权限授予、撤权、真实未保存编辑取消：NOT_TESTED |
| Prompt Shortcuts | 日常设置中整体启停、网页按钮、右键快速添加分别保留；localhost 的右键项正确提示需支持站点；业务新建/更多入口保留。支持站点上独立切换与实际注入：NOT_TESTED |
| AdBlock | 日常主界面与统一齿轮 → 广告拦截设置 → 原产品设置可往返；全局/网站过滤、手工屏蔽、例外及刷新入口存在。未改变真实过滤规则 |
| Reading TOC 隔离 Profile | 主界面读取14个章节；网站停用移除网页目录、恢复重现；English 切换并恢复默认；仅本页隐藏及恢复显示成功。既有页面排除记录的完整矩阵未执行 |
| Reading TOC 日常 Profile | **FAIL**：主界面提示官方安装身份或访问范围未通过校验。gear 与网页目录可见不能证明主界面读取成功；未放宽校验或重装日常扩展 |
| 普通 Sidebar Tool（网页笔记） | 独立业务界面、紧凑设置、共享设置/卸载图标均可用；卸载确认默认焦点在取消，取消后工具与数据保留。未执行最终不可逆卸载 |

日常 Profile 后续出现其他会话操作，本轮停止干预该共享环境；其余原生验证使用本轮隔离 Profile。用户真实书签、Cookie 和现有服务均未用于破坏性测试。

## 尺寸、主题、无障碍与证据

- 真实 Chrome 中的既有同源 HTTP 预览完成 **320/360/400/440/520 CSS px × light/dark** 十组合，Cookie 未授权设置没有横向溢出；空业务组计算样式为 `display:none`，管理区只有一个。
- Switch 的 `role="switch"`、`aria-checked` 和可访问名称已检查；原生 AX 及 Space 操作、自动化真实 React 返回焦点已有证据。
- 最终预览又复核 320px 深色关键页，输入 hash 为 `126692b77d901efe1c205550be846fc1eacd8e3e92268bfada6a6d3e71f98567`。同源更新仅证明源码/预览一致，不证明真实权限。
- CFT 网站缩放125%后恢复100%；截图显示网站缩放，Side Panel 几何保持不变。因此 **Side Panel zoom 仍为 NOT_TESTED**。
- 原生 Side Panel 精确宽度、完整原生深浅主题矩阵、屏幕阅读器遍历、新标签页实际打开均为 **NOT_TESTED**。浏览器控制策略拒绝直接访问 `chrome-extension://`；没有改用 CDP 或其他路径绕过。预览宽度不冒充原生精确宽度证据。
- 本机原始证据在 `artifacts/tool-management-rfinal/`（忽略目录，不作为正式发行包提交）：`native-ui.json` 33条记录、`preview-matrix.json`、`preview-final-smoke.json`、日志与截图；`evidence-inputs.json` 记录源码和证据 SHA256。
- 已保存原生 `cookie-final-ungranted.png`、`cookie-restored-settings.png`、`native-generic-settings.png`，以及预览 `preview-final-320-dark.png`。

## 独立审查评分

只读审查者核对本轮 delta、日志、截图及33条原生归档。以下分数针对**已覆盖范围**的质量判断；每维都有对应证据，但未覆盖部分仍保持 NOT_TESTED，不代表完整产品验收分。

| 维度 | /100 | 主要边界 |
|---|---:|---|
| 交互 | 88 | 新标签页和 Prompt 支持站点操作未测，日常 TOC 失败 |
| 视觉 | 85 | 有预览矩阵和原生截图，缺原生精确尺寸/主题矩阵 |
| 文案 | 78 | 首次权限披露明确；共享中文硬编码及非 TOC 本地化缺口仍在 |
| 架构 | 90 | 沿用现有 Host、Authority、React 和 effect 通道 |
| 安全 | 89 | 真实撤权与拒绝、模拟未知结果覆盖；缺原生权限拒绝/故障矩阵 |
| 无障碍 | 86 | Switch 语义与焦点已测，缺完整辅助技术遍历 |
| 验证证据 | 83 | 有行为测试和原生记录；跨开发刷新，非冻结正式候选 |

算术平均：`(88 + 85 + 78 + 90 + 89 + 86 + 83) / 7 = 85.6`。**完整最终验收：NOT_TESTED；未达到可宣称95的证据条件。**

## 第一项剩余阻断及最小下一步

**日常 Reading TOC 主界面读取被身份/访问校验拒绝。** 隔离默认安装可用，本轮未改 TOC 身份 pin、来源或运行策略，不能把原因写成已证实的旧版本。

错误位于可信宿主发送网页消息之前。下一步在日常 Profile owner 可用时，只读对比安装版本/规范化包哈希、provenance 的 marketId/version/sha256、持久启停值及实际运行模块指纹；先确认是否为历史安装或开发模块漂移。只有证实记录不一致，才经现有官方更新/审阅链修复，禁止绕过签名或新增安装器。保留现有安装数据，不以重装整个日常扩展作为默认修复。
