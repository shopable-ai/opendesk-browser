# GOAL：OpenDesk Browser Import Runtime R7.9.4 — Mac Codex REAL ACCEPTANCE

## 两个已入库的五机制混合 Import 示例：先真实运行，再修失败，最后验收

日期：2026-10-14。默认中文。
仓库：https://github.com/shopable-ai/opendesk-browser
Mac 工作区：`/Users/shopme/Documents/workspace/opendesk-browser`
**唯一允许写入、提交及推送分支：`main`。**

**执行顺序：VERIFY REAL SOURCE → INSTALL EXACT DEPENDENCIES → RUN CORE NODE/WEBPACK → FIX REAL FAILURES → REAL CHROME PAGE & CONTROLLER → SECURITY/RESTART → PACKAGING → SAFE MAIN COMMIT。**

本轮的网页源码阶段已经直接提交，不要再输出第二份综合 Demo 或制作新 UI。必须首先读取最新 `main`（早期提交 `701344988b247831e6337a309a08ecc7c89a5631` 只是历史定位）与 `git status`，保留其他负责人所有未提交代码、真实证据和 Profile，不 reset/stash/force push，不新建分支或重复 Runtime。

## 一、最高 P0：让两个已存在的项目实际运行

核心文件：
- `examples/programs/mixed-import-page/src/main.js`、`package.json`、`package-lock.json`、`opendesk.remote-lock.json`、`.opendesk/remote-cache/*`。
- `examples/programs/mixed-import-controller/` 下完全相同结构。
- `tests/environment/mixed-import-projects.test.mjs`。
- 两项目 `README.zh-CN.md` 和 `docs/framework/workstreams/import-runtime-r794-20261014.md`。

两份 `main.js` 各恰好有三条真实静态 Import：D3 HTTPS `max.js`、`lodash-es/escape.js`、`./lib/scores.js`；另外 Page 使用 `opendesk.libraries ["query-string"]`、Controller 使用 `["axios"]`；双方默认 `_` 和 `dayjs` 不 import。不能拆成不同 main 拼输出，不能改为 Fake D3/假 npm/假 Axios/自造库别名。不引入任何 UI、新 Loader/Resolver、网站 MAIN eval、第二套 RunHost 或权限。

打开本地原本存在的 43111 Demo 网页，用 Chrome 实际完成如下返回（`pageTitle` 以实际网页为准）：
- Page 同一 `main()`：`imports.https=5`，`imports.npm="A &amp; B"`，`imports.relative=[2,5,3]`，`packaged="demo"`，`defaults.words=2`，`defaults.date="2026-10-14"`，`pageTitle=document.title`。
- Controller 同一 `main()`：同样的三条 imports/defaults，`packaged="http://127.0.0.1:43111/demo-form.html?mode=demo"`，`pageTitle=await page.title()`；此处 `page` 是原受控 Worker 词法代理。Axios `getUri()` 不产生 HTTP 请求，网络流量为零。

## 二、立即执行的定向测试（先于全量项目回归）

~~~sh
cd /Users/shopme/Documents/workspace/opendesk-browser
git status --short
git branch --show-current
git fetch origin main
git log -1 --format='%H %s' origin/main
# 保留并行编辑内容；只在确认可安全 fast-forward 时更新 main。

npm ci --ignore-scripts
(cd examples/programs/mixed-import-page && npm ci --ignore-scripts)
(cd examples/programs/mixed-import-controller && npm ci --ignore-scripts)

node scripts/validate-program-project.mjs examples/programs/mixed-import-page
node scripts/validate-program-project.mjs examples/programs/mixed-import-controller
OPENDESK_MIXED_IMPORT_BUILD=1 node --test tests/environment/mixed-import-projects.test.mjs
npm run build:program -- examples/programs/mixed-import-page
npm run build:program -- examples/programs/mixed-import-controller
~~~

- 不能把环境变量未开启的 `SKIP` 当 PASS；先完成双方安装后必须运行真实 Webpack/Node 返回值测试，若失败先修复真实文件并反复验收。
- npm tarball 必须为各项目自己的 `lodash-es@4.17.21` 与锁定 `sha512`；不能从根项目 `4.18.1` 偷借；D3 本地缓存源码 502 字节、SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`，必须真实复核，不联网自动修复锁。
- 新增负向覆盖缺 npm lock、错 lock 版本和实际安装版本、缺或篡改 HTTPS 缓存、缺相对模块或错 export、跨世界按需库、未声明按需库、拒绝权限、准备期间变更源码。用临时 fixture，不污染原实例和他人状态。源码更改后要真实触发新的有意 Run 与新 sourceHash。
- 可以在现有 `tests/environment` 文件改掉实际失败的断言或夹具问题，但不能删安全断言，不能写 Fake PASS；每项保留实际 stdout/stderr/退出码。

## 三、真实 Chrome 是不可跳过的最终门槛

使用仓库已经存在的 Chrome for Testing 启动器、Native Host/MCP/本地项目连接、Side Panel 开发入口、RunHost、Page USER_SCRIPT 和 Controller Worker。要在现有框架驱动中接入两个**确切新项目**，不能仅重放 R7.7/R7.8 的单独 D3 回执或由 CDP/Node 代执行用户脚本。协调其他任务的 Profile、端口和 Native 配对，不污染日常 `dist/development`。

1. 同一受控 Chrome 候选的 Page：当前站点与 USER_SCRIPT 真实运行 `main()`、实际返回 JSON、`receiptNonce/documentId/sourceHash`、世界和来源身份、安装/预览界限、网络记录。
2. 同一候选的 Controller：真正的 Worker/ChromePage 路径、持久 Result、`runId/resultId/sourceHash`、站点及`page.automation` 授权、Worker 退休；不因示例自身含 `axios.getUri` 伪报外网流量。
3. 移除/拒绝站点或脚本权限、损坏资源/锁、停止及再次授权、重复 Run、源码修改及旧 Revision 隔离、重启断网零远程 JavaScript 下载，全部给真实回执。
4. 查询当前受影响标准/Developer WXT 包，运行真实 `npm run check`、`npm run build`、`npm run build:dev`、`npm run build:developer`、`npm run verify`、`npm run verify:developer`、Package/ZIP SHA 与 `packageHash`，优先沿用已有产物，避免重复构建无关部分。记录 `sourceDriftDuringBuild`，并按团队已有 source/CI 证据协调。

不得为了让测试通过放宽 CWS/MV3、来源、CSP、远程网络或脚本权限，也不能将 Controller 的 npm import 交给 Page 假执行。对运行世界尚未通过的其他场景标 `NOT_TESTED`，Tool/Background/Host 使用既有测试证据，不强行改变生产构建图。

## 四、交付与停止条件

用原始 Node/Build/Chrome/Native 回执创建本次任务专属可复核证据，更新 `docs/framework/workstreams/import-runtime-r794-20261014.md` 的真实状态，不覆盖历史证据。输出修改文件、修复的根因、三个真实 import 的函数输出、按需和默认库的真实结果、精确锁/缓存 SHA、`main` 最新 SHA、当前 packageHash、结果关联 ID、清洁或不清洁工作区状态及唯一剩余动作。遵守他人工作区与并行所有权，只有检查无冲突并且定向回归通过时才安全提交推送 `main`。

**只有两个项目各在同一次真实 Chrome 运行中证明五机制返回全部正确、负向和安装包身份足够后，才能评分产品 95+；否则如实说明尚未达到。**

禁止把本任务降级成“下轮再加 npm import”或“只跑两个来源”的阶段性方案。
