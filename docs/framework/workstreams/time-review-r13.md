# Time Review R1.3 · Canvas V3 单行时间线

日期：2026-10-12。目标仓库：shopable-ai/opendesk-browser，正式主分支 main。

## 仓库和执行环境

本轮最初通过 GitHub 连接核查远端 main=61715bd8fc6cf56542af90fc2a135d69ac2c7bcf，初始实现经 Draft PR #70 已合入 main。无法访问用户 Mac 工作目录的 staged/unstaged 差异；后续测试/文档差异用独立 PR 保护并行源码，不能据此宣称个人本地完成。

## 已编写的改造

    工具 UI：Canvas V3 紧凑卡片、单行时间带、分类编辑、所选日期和七天排行
    视觉：保持 V3 分类颜色与卡片结构，避免沙箱 CSS 污染其他工具
    数据模型：兼容旧 v1 日汇总，新增域名六分类、未来分钟采集同意、按日分钟桶
    安全：仍复用固定 time.review 服务的包身份、安装代际和 documentId 验证
    隐私：默认无分钟明细；只记录域名、日期、分钟、毫秒；关闭会清除分钟数据
    测试：新增 R1.3 Node 单元测试；已有 R1.2 用例保留

## 已获得且绑定候选的验证证据

- **PR #70 已合并 main**（候选 `07b2fab0c650a7111b64f4e91916bbce97a63c84`）。Time Review 专项 [Actions 38158863298](https://github.com/shopable-ai/opendesk-browser/actions/runs/38158863298) 通过：R1.2/R1.3/R5.1 Node **51/51**；`npm run check`；工具包构建与 SHA/能力验证；WXT Production/Development 构建、`npm run verify`。生成 Time Review v1.3.0 工具包为 **35,131 B**，SHA-256 `355449b333c84f7cca2cee823754d25686c9cd1783af2dc4b1c6a5e0cb7e1f88`。
- 相同候选的生产 MV3 包 packageHash：`234747d2075085f75feef6680ca963dddac22c25156b54e8b585f8f32275a482`（74 assets），开发包 packageHash：`716b5e2b044971dd0c6956909ad240ff63911376ee51779fbff6e5deab2cb04b`（105 assets）。共享 `ui/tool-shell.js` 404,529 B 超过 327,680 B 软件提醒线，但低于既有 524,288 B 硬限；预算未放宽。
- [同候选 Chromium 真实源码渲染](https://github.com/shopable-ai/opendesk-browser/actions/runs/38158863298)（测试数据夹具，并非真实已安装 Side Panel）：320/360/400/600px 没有水平溢出，Canvas 键盘/鼠标/触摸选择了真实坐标 1/540/600；DPR=2 背板符合 Canvas CSS 像素。原始 Artifact `time-review-r13-chromium-fixture-NOT_NATIVE` ID `11708703700`。**旧截图由于 CI 缺中文字体出现方框，不能宣称已验证视觉可读性，新增 Noto CJK 后须重测。DPR2 也不是 Chrome 浏览器真正 200% 缩放。**
- 同候选官方 Side Panel 回归与构建预算工作流 PASS；独立 `Local directory MCP real Chrome` 的 Sidebar Controller `runId` 超时为 **FAIL**，且不能被 Time Review 的通过项抵消。
- Time Review R1.3 **真实 Mac Chrome 已安装/权限/下载/整浏览器重启/卸载：NOT_TESTED**（当前旧候选），不能把 Chromium 夹具当作原生验收。新增 Mac 专项 `time-review-r13-native.yml` 在独立 macOS-15 CFT、独立 profile 下测试实装、SIDE_PANEL、受信任分钟采集选择及撤回、Chrome 实际 JSON 下载；新候选该项须以匹配 SHA 和 Artifact 验收，CI 未完成前仍为 NOT_TESTED。开始/暂停/实际追踪、浏览器重启和卸载未被新最小原生测试宣称覆盖。
- 用户本机 `/Users/shopme/Documents/workspace/opendesk-browser` 工作区的 `git status --short --branch`、实际安装的个人 Chrome Profile：NOT_TESTED。此处不能访问用户 Mac；只写入受保护的远端隔离候选与 PR，需独立本地核验工作区后集成。

## 证据复用与风险

旧 R1.2 工作流 docs/framework/workstreams/time-review-r12-01a12b0d.md 的组件和 candidate2 原生结果都是历史候选证据。R1.3 修改了服务与 UI 输入，旧 PASS 不自动等于新候选 PASS。PR #68 已合并到 main。R1.3 随后按受信任详情按钮模式增量修改 host-controls.js 和 src/ui/sidebar-tools.js：沙箱请求 time.start/time.clear/time.minuteConsent 只打开详情并被拒绝直接执行，只有受信任主界面真实 click 可向可信后台转发；分钟明细关闭和全部清空采用宿主页面内确认，无 JavaScript 弹窗。合入时仍须检查共享文件最新差异归属。

## 最短补验流程

    1. 在 Mac 工作区检查 git status --short --branch 和所有并行修改；审阅候选差异
    2. node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-host-controls-r51.test.mjs tests/environment/time-review-r13*.test.mjs
    3. npm run build:sidebar-tool -- examples/sidebar-tools/time-review，核对真实包尺寸、SHA、capabilities
    4. npm run check，npm run build，npm run build:dev，npm run verify
    5. 隔离 Chrome Profile 完成授权、开始/暂停/恢复、分钟/分类持久化、切换日期、撤权和下载落盘
    6. Chromium/Playwright 对 320/360/400/600px + 200% 缩放测试并截图，保存绑定 packageHash 的原始证据
    7. 核对已合并 PR #68 及本轮新增分钟受信任同意，不得恢复 JS confirm 或绕过用户手势
    8. 只有以上证据齐全后，才能给各项质量真实评分并决定是否达到 95+。

受限 V8 的 9 项模型断言属于早期临时烟雾测试；现在以带 SHA 的真实 Node 51/51 与包构建证据为准。旧 R1.2 结果不提升为 R1.3 原生结果。

## Mac CI 首次故障与修复（2026-10-12）

- GitHub Actions 运行 [38203749966](https://github.com/shopable-ai/opendesk-browser/actions/runs/38203749966) 的 macOS-15 CFT 155 安装、Node 回归和 Production 构建/verify 已通过，但原生测试在准备阶段 **FAIL**：工作流 YAML 中 `CHROME_BIN` 多了一个字面值反斜杠，路径变成 `\\/Users/runner/...`，未启动 Chrome；此日志不是应用功能失败或 Mac Chrome PASS。
- 后续候选删除了 YAML 误加的反斜杠，仍保留先前失败历史。只有下一个同候选 Actions 的原生实装、授权和下载回执成功，才提升对应子项为 PASS。
