# 构建体积与资源边界 R3（2026-10-10）

状态：LOCAL_PACKAGE_VERIFIED / CI_PENDING。在独立 checkout 的 `main` 上实施；仅父 Agent 写入，两个子 Agent 只读复审。未创建分支或 worktree，未改写其他会话工作区或历史公共登记。

## 候选与范围

最终本地对比父提交：`300dc240f6d11f6930658ce3156b1f66ecc51a29`。已合入同期 R15.4、Task ABI 修复、TOC、侧栏样式和模板项目变更；文档冲突保留双方有效内容。原始输入记录在本目录 `evidence/bundle-capacity-r3/{before,after}/build-*.json`，实际文件清单与 SHA、Rollup 模块图、构建前后输入一致性均绑定这些回执。

用户报告 `sw.js=328942 B`，相对 `327680 B` 超出 `1262 B`；没有该失败候选的 SHA，单独作为问题输入保留，不能当作本轮同源基线。初次同步的 `3d05324b` 曾构建 `323646 B`，后来又合入其他提交；这也不是最终父提交。本轮对最终未修改父提交重新构建，实测 `324348 B`，修改后 `319248 B`，**减少 5100 B，余量由 3332 B 增至 8432 B**。

沿用 `BUILD_POLICY` 原值：生产每个生成入口 320 KiB；开发仅 SW 512 KiB，其他生成入口仍 320 KiB。独立 raw vendor 128 KiB、manifest/license 8 KiB 均沿用现有合同；未设置猜测的 HTML/CSS 硬上限。容量告警仍按既有 80%/90% 分级，20% 设计余量未达成，不宣称已根治所有增长压力。

## 实现

1. **真实裁剪 SW**：`prepareAttempts` 的旧 Template 导出创建链与 `admitIdentity` 只向已停用 Template 消费者开放。继续使用既有 `INCLUDE_DORMANT_TEMPLATE_RUNTIME` 构建门控，源码 API 保留。生产明确拒绝旧 Identity；现代 Controller/SDK/Task/Page 授权及持久下载恢复未删除。
2. **同步注册下载事件**：SW 初始同步求值时注册 `downloads.onCreated/onChanged`，暂存原事件，等待同一个 broker 完成初始化后交给原 reconciliation；broker 不重复注册。初始化失败被记录，不重放下载副作用。
3. **加固现有 R15.4 独立库**：Lodash/Day.js 只能进入各自 `libs/packages/*.js`，不能重新混入 SW、Worker runtime、Page core 或侧栏。bootstrap/vendor 按原字节复制并核对 hash、字节及许可；npm 源码仍独立构建。没有新增第二套库目录、Worker、运行时分块或 CDN 加载。
4. **全资源容量报告**：新增 `npm run build:size`，双模式均核对每个实体文件的字节、SHA、成功回执和模块图，统计 17 个固定入口、raw JS、HTML/CSS、许可、manifest、maps 及已知加载组合。生产 38 个资源，开发 55 个；maps 独立统计。
5. **失败仍保留原因**：WXT 在超限判断前记录真实 chunk；失败报告有界读取 WXT/Rollup cause 链，保存超限入口与字节、原输入、部分模块图。损坏的部分 JSON 记录为诊断错误。构建开始设置 `in_progress`；成功/失败 marker 绑定同一 attempt。两种测量入口拒绝失败、中断或错配的最新 marker，兼容没有新字段的历史物理回执。
6. **包校验防止额度旁路**：build、pack、容量审计显式传递 mode；生产不能带开发 maps 获得 512 KiB 额度，所有 JS 原始物理大小在打包前再检查。扩展预算 CI 执行双构建及真实包变异测试并在失败时上传诊断。

## 实测资源

| 资源 | 生产字节 | 单文件预算 | 剩余字节 |
|---|---:|---:|---:|
| `sw.js` | 319248 | 327680 | 8432 |
| `ui/tool-shell.js` | 298028 | 327680 | 29652 |
| Controller Worker runtime | 36780 | 327680 | 290900 |
| `libs/packages/lodash.js` | 12818 | 327680 | 314862 |
| `libs/packages/dayjs.js` | 7532 | 327680 | 320148 |
| jQuery raw JS | 87533 | 131072 | 43539 |
| `ui/tool-shell.css` | 49558 | 未设硬上限 | — |
| `ui/tool.html` | 45254 | 未设硬上限 | — |

SW 与侧栏主 JS 仍为 critical，容量报告会明确显示，不用成功构建掩盖余量债务。Worker 的旧 `57315 B` 来自用户及历史候选；本轮父包和修改后的 runtime 都是 `36780 B`，不能将既有 R2/R15 减重归功于本轮。

已知加载组合：后台 `sw.js + native-agent/transport.js = 355294 B`；Controller 默认核心加库 `58297 B`，包含实际拼接分隔符后 `58309 B`；Page 默认核心加库 `26356 B`（含分隔符），显式启用 jQuery 的资源合计 `113877 B`。这些组合可能重叠，不能相加；它们不是 CPU、内存或启动时延测量，也未包含用户源码与执行包装。拆文件不会自动减少这些总量。

## 验证与证据等级

- 最终父包 production、修改后 production/development、双模式 `verify`、全包体积/哈希/模块归属检查：PASS。源码检查 309 个文件：PASS。
- 构建守卫与 SW 体积检查：20/20 PASS。下载、broker、现代 authority、协议等受影响组件：155/155 PASS。双模式真实包、越界、mode/pack 拒绝、实体模块图检查：9/9 PASS。组件输入未受后续纯样式/独立工具脚本提交影响，保留绑定结果。
- 全量本地 Node 尝试：803 项，786 PASS、10 FAIL、7 SKIP。原日志完整保留。10 项中 2 项是测试命令未设置专属 evidence 目录，读取了默认历史回执；带本次目录定向复核为 2/2 PASS，且最终 9/9 包回归再次覆盖。其余 8 项因本环境 Unix socket `listen EPERM` 阻断；没有跳过或修改测试来伪装全量 PASS。标准 CI 的当前 SHA 全量结果待补。
- 两个独立只读复审均未发现剩余阻断。它们不等于独立原生验收。
- ZIP 物理闭包检查与 CI/后台原生冒烟结果在 `evidence/bundle-capacity-r3/acceptance.json` 续记；用户 Mac、完整 F3、安装后的综合交互及冷/热性能尚未本轮验证。

生产包 hash：`257369504dbe948ef0c1af3de735934661243994d14ee0bde926bade09a7ec76`。开发包 hash：`c48e7368b2b3020193ce723467908f1021ad8bfe4b130e9f41fe68835fbada84`。完整资源表见 `evidence/bundle-capacity-r3/capacity-{production,development}.json`；同源差异见 `comparison.json`。

## 复核入口

```bash
export OPENDESK_BUILD_EVIDENCE_DIR=artifacts/build-receipts
npm ci --ignore-scripts --no-audit --no-fund
npm run libs:check
npm run check
npm run build
npm run build:dev
npm run verify
npm run build:size
npm run build:size -- --development
npm test
```

资源仅本 checkout 的 `.wxt`、`dist`、`artifacts` 与 `.runtime/bundle-capacity-r3/`。原样本、失败日志、临时父提交 archive、独立 ZIP 输出均在专属目录；没有占用其他会话 Chrome/profile/数据库。构建子进程已退出；本地未启动 Chrome。
