# Stay Focus R4.3 · 网页版实际开发与验证记录（2026-10-19）

## 结论

**开发未完成，不能移交“本地仅验收”**。本轮有实际产品增量，但不宣称完成 R4.3 的公共后台 SDK、全部独立升级能力、正式包晋升和真实 Mac Chrome 验收。

## 真实源码增量

主提交：`89a9e90ca4723d0782b370c562cbd0307d3597b6`，定向测试修复：`0a3851912b3beb254e25bcef445edbfa9c767c88`（均直接写入 main、无分支、非强推）。

- `tool.config.json` 升级 `1.0.3`，`site-budget.v2` 从工具安装包携带首次启用的推荐站点、默认集合、日额度和默认时段。旧 v1/v1.0.2 包继续兼容。
- 仅首次 `focus.enable`、且本地持久政策记录**不存在**时消费包默认值；存量额度、时段、白名单、暂停状态与使用记录不自动重写。包 Hash 变化清退旧启用授权，重新批准后仍保持用户设置。
- 可信授权控制显示应用包声明的初始限制站点与额度。修改已暂停网站不再暗中恢复；拒绝把网站域名重命名误当普通编辑。
- 包 Schema 严格检查合法网站、站点建议、白名单式初始集合、上下限及跨日时间段。不将任意后台 JS 打进动态工具包；可信业务源的四个 Git blob 审计 pin 随本次修改精确更新。

## 可复核测试、包、阻塞

- 首次 CI：<https://github.com/shopable-ai/opendesk-browser/actions/runs/39146465022>，105 项测试 104 PASS/1 FAIL；旧 UI handler VM 测试桩缺少新编辑状态，已经修正。
- 修正后 CI：<https://github.com/shopable-ai/opendesk-browser/actions/runs/39146659609>，`Strict policy, time, DNR and component assertions`：**105 PASS / 0 FAIL**；`Build independent user-installable Stay Focus release`：**PASS**；`npm run check` 阶段成功进入后续构建。
- 来自上述确切 CI 的 `artifacts/sidebar-tools/stay-focus/1.0.3/stay-focus.opendesk-tool.json`：**候选包**，37,477 字节，SHA-256 `32dfecc5ede603eaaab3a718c80bd61c0101d37699203ee8eb3ffdae5c024742`。它在 CI artifact 中，不等于应用根目录已经正式晋升。
- `npm run build`：**FAIL**。失败点为 `examples/sidebar-tools/prompt-shortcuts/trusted/page.js` 当前 Git blob `ad5e3bb10a0af62629db5bd0da474b71f1ae4ed4` 与 `scripts/bundle-provenance.mjs` 既有 pin `9da4a08e66ecb0bb147b4f75ecbfa400a7300df6` 不一致。这个差异在 R4.3 起点 `67e26e2...` 已存在；不能未经审查就替其他扩展复签高权限源码。
- 因全宿主构建失败，`npm run build:dev`、`npm run verify`、工具包正式 `--promote-from` / `--check-project` 及最新候选原生 Mac Chrome job **未执行/未通过晋升条件**。未生成应用根目录正式 `stay-focus.opendesk-tool.json`。

## 核心缺口（仍应在网页阶段实施）

1. 仍没有通过 Browser SDK Registry → Schema → Host/Authority → Chrome Driver 接入**可跨应用复用的受管前台观察、持久预算和应用所有权 DNR**。Stay Focus 的 `trusted/service.js` 仍是随宿主静态编译的受信任产品实现；现有旧功能保留，不等于已彻底独立运行时迁移。
2. `site-budget.v2` 只能升级合同已支持的**数据/首次设置**；固定宿主不允许动态替换新的应用后台 JS 算法：`APP_CODE_UPGRADE_UNSUPPORTED`。不能用数据升级冒充算法升级。
3. 需协调 Prompt Shortcuts 源码所有者审查固定可信 pin，恢复全宿主正式构建，然后重新跑 source/build/verify，并按唯一 packer 正式晋升。
4. 固定同一宿主构建，通过安装器真实更新应用包、复用旧用户数据、新规则确认→正常前台浏览至额度耗尽→Chrome DNR 原始回读及真实导航、侧栏关闭/重启/停用/撤权/卸载的原生驱动尚未全部完成。**CHROME_NOT_TESTED / NATIVE_NOT_TESTED**，不是 Node PASS。
5. 正式 UI 窄屏/键盘、操作失败/未知结果的完整用户旅程尚缺与最新候选绑定的验收记录；不应独立给出 95+ 评分。

## 工作界限

不得修改或重新签认 Prompt Shortcuts 的可信源码以掩盖跨项目阻塞；不得删除 Stay Focus 旧固定功能当作迁移完成；不得将上述缺口仅交给本地 Codex。在网页阶段先继续完成真正通用 SDK 与正式交付门槛，然后本地仅做真实 Mac Chrome 测试、缺陷修复和验收。
