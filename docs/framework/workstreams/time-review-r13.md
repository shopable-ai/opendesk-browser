# Time Review R1.3 · Canvas V3 单行时间线

日期：2026-10-12。目标仓库：shopable-ai/opendesk-browser，正式主分支 main。

## 仓库和执行环境

本轮通过已连接 GitHub 读取远端 main，最初核查 HEAD = 61715bd8fc6cf56542af90fc2a135d69ac2c7bcf。由于无法访问用户 Mac 的 /Users/shopme/Documents/workspace/opendesk-browser，不能获得其 git status/index/其他 Agent 的本地修改。为避免对远端 main 直接写入，候选代码在独立远端分支 agent/time-review-r13-canvas-v3-20261012；未直接覆盖主分支，后续由实际仓库集成者核对后合入。

## 已编写的改造

    工具 UI：Canvas V3 紧凑卡片、单行时间带、分类编辑、所选日期和七天排行
    视觉：保持 V3 分类颜色与卡片结构，避免沙箱 CSS 污染其他工具
    数据模型：兼容旧 v1 日汇总，新增域名六分类、未来分钟采集同意、按日分钟桶
    安全：仍复用固定 time.review 服务的包身份、安装代际和 documentId 验证
    隐私：默认无分钟明细；只记录域名、日期、分钟、毫秒；关闭会清除分钟数据
    测试：新增 R1.3 Node 单元测试；已有 R1.2 用例保留

## 验证状态（不夸大）

    代码源文件已编写：是（具体候选 SHA 由 GitHub 提交给出）
    组件独立烟雾检查：仅受限 JS 语法与模型样例，不等同完整 Node 测试
    node --test 时间审计：NOT_TESTED（当前无仓库运行环境）
    npm run build:sidebar-tool -- examples/sidebar-tools/time-review：NOT_TESTED
    npm run check / build / build:dev / verify：NOT_TESTED
    Chromium 320/360/400/600px 与 200%：NOT_TESTED
    实际 Side Panel 安装、更新、分类、权限、下载落盘与重启：NOT_TESTED
    真实 Mac Chrome 原生录制、截图和卸载：NOT_TESTED

## 证据复用与风险

旧 R1.2 工作流 docs/framework/workstreams/time-review-r12-01a12b0d.md 的组件和 candidate2 原生结果都是历史候选证据。R1.3 修改了服务与 UI 输入，旧 PASS 不自动等于新候选 PASS。已有 PR #68 修改 src/ui/sidebar-tools.js 的 Time Review 开始/清空 JavaScript confirm，需由集成者按最终 main 核对，无权抢写其共享宿主文件。

## 最短补验流程

    1. 在 Mac 工作区检查 git status --short --branch 和所有并行修改；审阅候选差异
    2. node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-r13.test.mjs
    3. npm run build:sidebar-tool -- examples/sidebar-tools/time-review，核对真实包尺寸、SHA、capabilities
    4. npm run check，npm run build，npm run build:dev，npm run verify
    5. 隔离 Chrome Profile 完成授权、开始/暂停/恢复、分钟/分类持久化、切换日期、撤权和下载落盘
    6. Chromium/Playwright 对 320/360/400/600px + 200% 缩放测试并截图，保存绑定 packageHash 的原始证据
    7. 合并/更新 PR #68 的受信任宿主内联确认，实现无多余 JavaScript 弹窗且维持可信用户手势
    8. 只有以上证据齐全后，才能给各项质量真实评分并决定是否达到 95+。
