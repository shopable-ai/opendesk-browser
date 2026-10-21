# R1.11 Mac 验收记录（2026-10-21）

结论：**必要修复已完成，真实扩展开发环境核心流程 PASS；production 正式验收尚未通过。** 不能将下面的开发环境证据提升为 production PASS 或全面 95+。

## 候选与环境

- Tool ID：`web-markdown-clipper`，正式包版本 `1.2.3`，69,841 bytes。
- 最终正式 JSON SHA-256：`074d4a7da4fc521d88807309bb28e4884a0b511c38d4706f5b6706aaadf85504`。
- 旧版 `1.2.2` 从提交 `88fca8e367dac1d5858e568963479f9119aa3956` 取出，SHA-256 `0d0ff548a6e892d8ca177030388a51d48861f3f233f56177f0ac14fee315b9ab`。
- 本地 `main` 基线 `5eff84c98d4628a7996b3cc3b3cf5e664e5f4e58` 包含用户指定的 `40f565c67b2f97199c2c39f9ad1183eb77262fe2`。验收期间 fetch 得到 `origin/main=c92fc837b`；提交修复前本地/远端分别有 2/6 个独有提交，远端新增未涉及本工具。没有创建分支、worktree、PR，没有合并、推送或覆盖并行改动。
- 同源码预览：Playwright Chromium `149.0.7827.55`，真实浏览器缩放补测使用 Mac Chrome for Testing `156.0.8078.4`。
- 真实扩展：独立 CFT Profile `artifacts/web-markdown-clipper-r111-mac-20261021/cft-profile`，只读加载现有持续开发宿主 `dist/development`，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。既有 `npm run dev` watcher 和输出目录没有被停止或覆盖。正式 JSON 经原安装器审阅、同 ID 更新后运行。
- 用户日常 Chrome `155.0.8059.85` 仍保留原 `1.2.2`。已导出其原有 1 条摘录；该 Profile 的升级没有完成，不以独立测试 Profile 代替这一事实。

## 已复现并修复

1. 500px 低高度、200% 模拟缩放时，8 个阅读场景和 4 个编辑场景的底部按钮溢出。将标题、来源、正文放入同一滚动区，操作区留在外部；允许编辑区收缩，并在窄容器压缩既有操作布局。
2. 从最近摘录新建或编辑后，保存成功仍持有写入锁，返回主页被自身拦截。仅允许这次已确认保存的内部导航绕过该 busy 检查，普通导航保护保持有效。
3. 长文滚动到底后打开另一条记录，会沿用上一条的滚动位置。新读取成功后复位内容滚动区。
4. Host 请求预算测试的 VM fixture 缺少现有 Prompt 常量，导致初始 41/42 PASS；补齐真实常量绑定，没有修改 Host 预算或权限逻辑。

没有重做 UI、变更 Tool ID、存储键、存储结构或创建第二套状态。最近摘录、图标、完整列表、历史数据及原编辑流程继续复用。

## 命令与自动验证

```bash
node --test examples/sidebar-tools/web-markdown-clipper/tests/*.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project
APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan
```

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 指定工具测试 | PASS，43/43 | `final-tool-tests.log` |
| 正式包同源码核对 | PASS，`PROJECT_PACKAGE_MATCH`，最终 SHA 如上 | 原打包器 `--check-project` |
| APP CI plan | PASS，selected/native 均为本工具 | `ci-plan.log`；plan 不代表 native CI 已运行 |
| 包来源/安全定向测试 | PASS，6/6 | `package-security-tests.log` |
| JS 语法、diff 空白检查 | PASS | `node --check .../src/notes.js`、`git diff --check` |
| 候选晋升 | PASS | 原打包器 `--out` → 定向测试 → `--promote-from` → `--check-project` |

晋升只更新目录中唯一的 `web-markdown-clipper.opendesk-tool.json`；临时候选和浏览器证据留在忽略的 `artifacts/`。

## 浏览器交互与尺寸

| 用户操作/场景 | 结果 | 证据 |
| --- | --- | --- |
| 320/360/400/440px × 浅/深色 × 760/500px 高度 × 100/200% CSS 模拟缩放 | PASS，32 组，阅读和编辑按钮均在 iframe 视口内，正文可滚动 | `preview-matrix-final.log` |
| 真正 Chrome 浏览器 200% 缩放，四宽度 × 两主题、500px 高度 | PASS，8 组；`tabs.getZoom=2`，DPR=4，未开启预览 CSS 缩放 | `preview-real-browser-200.json`、`preview-real-browser-200.png` |
| 最近总数与最近 4 条、卡片编辑、全文读回与到底、返回图标 | PASS | `preview-interactions-final.log` |
| 搜索、全部/网页/便签筛选、加载更多 | PASS；过滤 1/4/2 条；加载 50→61 条后隐藏更多按钮 | 同上 |
| 卡片删除取消和确认、未保存继续/放弃 | PASS；取消保留 61 条，确认后 60 条 | 同上 |
| 最窄低高度、200% 下实际点击底部编辑、未保存提示和删除取消 | PASS；提示/确认框在视口内，取消不删记录；下一条从顶部打开 | `preview-worst-final.log`、`preview-worst-final.png` |
| 实际安装界面长文到底、底部操作可见 | PASS；360×718 视口，footer bottom=666.95，正文高543、scrollHeight3147；原生页面样式逐字等于正式包 CSS | `native-footer-check.json`、`native-long-reader.png` |

修复前截图 `preview-fail-320-light-true-2.png` 等保留；修复后截图为 `preview-iteration2-320-light-true-2.png` 等。几何检查同时要求正文有可用高度且确实可滚动，不以隐藏控件的零尺寸判定 PASS。

## Mac 真实安装、存储与恢复

以下 PASS 均发生在上述独立 **持续开发宿主** 的真实 SIDE_PANEL/Sandbox/Host 和 Chrome 本地存储中，正式工具包没有使用预览 mock Host。

| 用户操作 | 结果 | 证据 |
| --- | --- | --- |
| 安装 1.2.2，经界面保存原有 28 节便签 | PASS | `native-legacy-before.json`、`native-122-saved.png` |
| 同 ID 更新 1.2.2→1.2.3，全程不卸载 | PASS；安装审阅明确显示当前/候选 SHA，无新增能力；原记录 ID、正文及时间等字段逐字保留 | `native-update-review.png`、`native-driver.log`、`native-report.json` |
| 标准测试页提取→保存→主页最近列表 | PASS；真实页面为 `http://127.0.0.1:43111/demo-form.html`，最近总数1→2 | `native-123-real-saved.png` |
| 完整正文读回、编辑 | PASS；新摘录编辑后的正文2621字符/4431 UTF-8字节逐字核对；旧便签2224 UTF-8字节 | `native-saved-article.md`、`native-cft-backup.json` |
| 导出备份 | PASS；真实 Save As 点击保存，Chrome downloads 回执 complete，JSON 两条记录及编辑正文一致 | `native-cft-save-dialog.txt`、`native-cft-backup.json` |
| 完全关闭测试浏览器→同 Profile 重开 | PASS；两条完整记录逐字一致 | `native-resume2.log`、`native-after-full-restart.png` |
| 搜索→删除确认→只删本次网页摘录 | PASS；确认前仍两条，确认后仅原有便签且字段完全一致 | `native-report.json` |
| 预览 Host 写入失败后的界面恢复 | PASS；提示失败，记录总数6→6 | `preview-write-failure.log`、`preview-write-failure.png` |
| 预览 Host 已落盘但回执丢失 | PASS；显示结果未知、阻止重放，真实 demo store 总数始终7；显式重新核对及重开恢复为7 | `preview-unknown-final.log` |
| 正式 Chrome Host 的物理写入失败/回执丢失恢复 | NOT_TESTED；上述故障为预览注入，Node 另有存储与丢回执测试，不能代替真实 Chrome Host 故障证据 | 不宣称 native 故障注入 PASS |
| 日常 Chrome 原 Profile 1.2.2→1.2.3 | NOT_TESTED；AX/鼠标/键盘自动化未调起文件选择器，未证明产品文件选择器故障 | `native-import*.png` / 导入诊断日志 |

日常原数据真实备份：`native-daily-before-upgrade-backup.json`，1条，SHA-256 `cabd10feddece05ce582de03eb7b3d728d2bf5d0dc889b465c6881050f147b7c`。早先误选的 `native-before-upgrade-backup.json` 是历史下载、共2条，**排除，不作为本次备份或数据保留证据**。

驱动有两处已分类并修正：最初还断言旧的“安装后额外网站授权数组”，实际产品已安装即用；备份驱动最初等待下载时，真实 Save As 尚未点击保存。原始超时保留，最终续跑完整通过；不把这些驱动问题算成产品故障。

## 正式 production 阻塞

独立普通源码快照（不是 Git worktree）经原 `node scripts/build.mjs production` 构建，在 `preparePublic` 阶段失败：

```text
prompt-shortcuts/src/style.css:172
.ps-image-size-button
E_PREVIEW_DESIGN: custom button appearance is forbidden
scripts/preview/shared-tool-design.mjs:34
```

这是另一个工具违反现有共享样式门禁的实际构建阻塞。未修改该工具，未放宽门禁，未覆盖共享 `dist/development`/`dist/production`。失败发生在 WXT 输出之前，**没有产出本轮 production 扩展**。两次快照构建分别绑定此前中间候选 `e8b227…` / `81f50c…`；最终 `074d4a…` 仅改变本工具内容滚动复位，未改变门禁失败依据，因此没有重复整包构建。

production 同候选升级、保存与恢复全部 **NOT_TESTED**。仓库现有 `dist/production` 的剪藏包仍为旧 `1.1.1`，没有冒用为本轮候选。下一步是该构建阻塞由其 owner 修复后，冻结最终候选并在独立 production CFT Profile 重跑安装和存储链；日常 Profile 的文件选择器自动化也需先恢复可操作入口。

## 独立评分与证据位置

由未参与实现的独立子代理核对源码 diff、最终包 SHA、预览原始日志、原生升级/备份/重启记录和构建失败来源，未额外执行测试或操作浏览器。评分评价当前证据支持程度，不是缺陷概率；没有授予 production 发布放行。

| 维度 | 独立评分 | 具体限制/扣分原因 |
| --- | ---: | --- |
| 功能 UI 一致性 | 96/100 | 源码/包/实际安装 CSS 一致，核心交互通过；本轮没有系统剪贴板、单篇 .md 下载及所有剪藏模式的原生逐项证据 |
| 响应式长文 | **94/100** | 200% 补测主要证明预览 iframe 几何；尚未闭合原生 Side Panel 同条件下全部滚动、按钮命中及键盘操作。长错误/确认并存、接近150KB正文的原生可用性仍缺证 |
| 持久化升级 | 96/100 | 真实同 ID 升级、备份、完全重启和删除保留旧记录通过；旧版基线仅1条便签，没有多条混合类型、近库限额的原生升级样本 |
| 失败安全 | **93/100** | 底层写入失败、配额和丢回执仍是 Node/预览注入证据；真实 Host、编辑/删除未知结果、低高度长错误恢复的动态证据不足 |
| 证据完整性 | **90/100** | 无成功的最终 production 宿主；构建失败绑定中间候选，部分原始驱动日志残留 production 文案。环境已在最终报告明确更正，原始日志不改写 |

独立评审未确认本轮修改新增 P0/P1 产品缺陷。2维达到95、3维未达到；验证缺口不冒称已复现产品故障，也不以开发宿主核心 PASS 替代正式 production 验收。

原始日志、驱动、JSON 和截图均在仓库忽略目录 `artifacts/web-markdown-clipper-r111-mac-20261021/`；本记录与源码、定向测试和唯一正式工具包一起提交到本地 `main`。最终提交 SHA 见本轮交付消息及该目录的 `delivery.json`。
