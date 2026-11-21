# GrayDove 生产构建与 Chrome Web Store 发布检查清单

> 本文保留完整验收要求，但优先帮助完成 **Standard 首发审核**。勾选项必须有证据；任何 ZIP 的生成或商店 Draft 上传均不等于审核通过。

> 用于候选准备和正式提交；合规、真实 Chrome 及后台要求未满足前不能提交。勾选项必须有证据。2026-11-17 用户确认首发 Standard，Developer 内部发行；支持邮箱 `thinkido666@gmail.com`，中文文案已登记，官网/隐私政策 URL/发布者名称待定。

## 0. 首发最短链路：先生成 ZIP、再补齐审核条件

**目标：仅上传 Standard，不上传 Developer。** 请先确保工作区已经同步远端 `main`，并保存/协调其他 Agent 的未提交改动，不要为发布执行 `reset --hard` 或 `clean -fd`。

```bash
git status --short
git fetch origin main
git pull --ff-only
npm ci --ignore-scripts
npm run cws:package
shasum -a 256 artifacts/opendesk-browser-production.zip
```

`npm run cws:package` 按顺序执行 `npm run check:brand`、现有 `npm run build` 与 `npm run pack`。**打包器会对 `dist/production` 执行 `verifyPackage`；无需为只做 Standard 的本轮额外执行检查 `dist/development` 的 `npm run verify`。** 失败时停止上传，核查原日志；不得关闭包验证器或更改脚本/权限安全检查绕过失败。

**先上传 Draft（非提交审核）：** 只有构建/包检查通过，才能在 Chrome Web Store 开发者后台上传 ZIP，以利用 Google 的上传后安装预检反馈。此动作不会自动公开上架；若预检失败先修复再上传。

**点击 Submit for Review 前，必须具备的最小人工条件：**
- [ ] 已选定的正式灰鸽品牌图标（商店 128×128 PNG），不是 `icons/notification.png`；本地已保留母版、六个 PNG 与根 Manifest 图标接入；仍须核对它们与当前发行候选同源及真实视觉，不得用旧候选记录代替。
- [ ] 至少一张来自**同一发行候选、真实 Chrome 页面**的 1280×800 PNG/JPEG 截图，显示核心“脚本/任务”操作；不使用 HTML 原型图冒充截图。
- [ ] 可公开访问且与真实本地/网络数据处理相符的隐私政策 URL；后端、AI Provider、Native 和云端传输若存在，必须如实披露。没有已审计数据流时，不得填写“完全不收集数据”。
- [ ] `<all_urls>`、`debugger`、`cookies`、`proxy`、`userScripts` 等权限的必要性、数据用途、授权入口已逐项审核。无关权限可能违反单一主要用途政策，不能为了通过审核简单删除或隐藏。
- [ ] Standard ZIP 的真实 Chrome 安装、侧栏脚本试运行、已授权任务执行及结果反馈检查通过，版本与 SHA-256 对应本轮包。
- [ ] 商品正文、类别、发布者/支持联系方式、Privacy Practices、Distribution 与 Trader/Non-Trader 已在后台准确填写；发布负责人自行点击审核提交。

**单一主要用途建议填法（须与真实发行版一致）：** “通过 JavaScript 脚本和经用户授权的浏览器自动化任务，自定义网页功能并执行重复的网页操作；侧栏用于管理相关脚本、任务和结果。” 可选的 Cookie/代理/拦截等工具必须证明与该用途的关联；不能仅因放在同一个界面就视为合规。

**发布状态分离：** ZIP 生成 → 上传 Draft → 自动安装预检 → 提交审核 → 审核通过 → 正式发布；每一步单独记实际回执。2026-08 起商店新增上传 Draft 即进行的安装测试，但不代替真实 Chrome 使用验收。

官方参考：[商店材料](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) · [单一用途](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq) · [隐私与权限](https://developer.chrome.com/docs/webstore/program-policies/policies) · [2026 上传预检](https://developer.chrome.com/blog/cws-review-updates-2026)。

## 1. 发布候选身份

每次发布先记录：

- 发布版本：
- 发布类型：Standard / Developer
- 目标商店商品 ID（如已有）：
- 远端分支：
- Git commit SHA：
- 工作区是否干净：
- Manifest version：
- package-lock.json 身份：
- 构建时间：
- Node 版本：
- Chrome 版本：
- 构建回执路径：
- ZIP 文件路径：
- ZIP SHA-256：
- packageHash：
- 发布负责人：

不要把不同 commit、不同 ZIP 或不同 Chrome 安装的证据混合为一个通过结论。

## 2. 发布前冻结

- [ ] 从最新远端 `main` 开始，核对本地工作区和并行改动。
- [ ] 确认本次只包含 GrayDove 发布范围内的变更。
- [ ] 确认品牌规范和商店文案已批准。
- [ ] 确认图标源文件和导出文件已固定。
- [ ] 确认 Manifest version 已按 Chrome 版本格式更新。
- [ ] 确认依赖锁文件和第三方许可证。
- [ ] 确认没有测试密钥、调试凭证、开发专用域名或本地路径泄漏。
- [ ] 确认没有把 Developer 构建误当 Standard 发布包。

## 3. 当前仓库构建入口

以当前仓库脚本为准，执行前重新核对 README 和 package.json。

### Standard 发行

在冻结的独立源码副本中使用原流水线；它不是 Git worktree。默认以已提交 main 加明确登记的本轮发布改动生成副本，未完成的并行工作保留在原工作区，不自动纳入发行；记录所含/排除路径及真实文件哈希。依赖使用锁定版本，副本不得共享可写 node_modules。主仓库已有 dev writer 时，不在主仓库重装依赖或覆盖 `.wxt/public` / `dist/development`。守卫端口需核实空闲：

```bash
npm run check
npm run check:brand
node --test tests/environment/branding-assets.test.mjs tests/environment/browser-editions-r245.test.mjs tests/environment/react-sidebar-style-bundle-r23.test.mjs
OPENDESK_BROWSER_EDITION=standard OPENDESK_OUTPUT_GUARD_PORT=43130 OPENDESK_BUILD_EVIDENCE_DIR=evidence/builds node scripts/build.mjs production
node scripts/verify-package.mjs dist/production production
OPENDESK_BROWSER_EDITION=standard OPENDESK_PACKAGE_OUTPUT_DIR=artifacts OPENDESK_PACKAGE_EVIDENCE_DIR=evidence/packages node scripts/pack.mjs production
# 上述命令保留冻结候选的独立守卫与证据目录；普通入口仍可用 npm run cws:package。
# 按改动执行相关定向测试；全量 npm test 的既有失败单独记录和评估。
```

其他受影响回归按最终改动选择并记录。根 `npm test` 有跨工具 pretest，不作为重复打包的默认前置；正式发布若要求完整 CI，应在冻结候选单独执行并保留结果。

已知脚本行为：
- `npm run build`：生产 Standard 构建，默认输出 `dist/production`。
- `npm run pack`：验证并打包 Standard 生产目录；`npm run cws:package` 已按顺序复用原构建与打包器。
- `npm run verify`：当前脚本验证 `dist/production` 和 `dist/development`，仅在两种输出都实际存在且需要验证时使用；**只构建 Standard 不直接运行它**。
- `npm test`：包含 pretest 构建步骤，需留意实际测试范围和运行环境要求。

Standard ZIP 的当前命名规则来自 `scripts/pack.mjs`：`artifacts/opendesk-browser-production.zip`。实际文件名必须以本轮运行输出为准。

### Developer 发行（默认不作为首发商店包）

```bash
npm run build:developer
npm run verify:developer
npm run pack:developer
```

Developer 构建由现有脚本设置 Developer edition；它不是 Standard 包的同义词。除非发布计划另有批准，不要上传 Developer ZIP 作为首发商品。

## 4. 包内容检查

以下已勾选项仅绑定 RELEASE-RECORD.md §5 的 r5 冻结 Standard ZIP；不适用于整个并行工作区，也不证明合并后的 GrayDove 元数据已通过验证。

- [x] Manifest V3 正确。
- [x] name、short_name、description 与品牌规范一致。
- [x] icons 字段和实际图标资源齐全。
- [x] 16/20/24/32/48/128 六个品牌 PNG 存在，大小/哈希与统一登记一致；1024 WebP 母版不在 ZIP。
- [x] 通知图标和品牌图标用途分离。
- [x] Side Panel、Service Worker、Options 页面路径正确。
- [x] CSP 和资源闭包验证通过。
- [ ] 不存在未批准的远程可执行代码或动态加载。
- [x] 所有必需资源都在 ZIP 中。
- [ ] ZIP 不包含 source map、开发调试文件、密钥或临时文件。
- [x] 固定资源哈希和 packageHash 与本次候选一致。

## 5. 自动化与真实 Chrome 验收

### 自动化验证

以下已勾选记录同样仅适用于上述历史 r5 候选，不是本次同步后重新执行的结果。

- [ ] `npm run check` 通过。
- [x] 相关定向测试通过。
- [ ] 所选回归/CI 范围、未执行项及失败分类已记录，不隐藏失败。
- [x] 当前 Standard production 目录通过原严格 `verify-package`。
- [x] `npm run pack` 成功。
- [x] 产物 SHA-256 已记录。

### 真实 Chrome

使用验收专属浏览器/Profile 加载从最终 ZIP 解压的原字节 production 包（Chrome 普通 UI 不直接加载 ZIP）。记录实际浏览器版本、路径、扩展 ID 和 Native 配对；普通 ego 网页测试不能替代扩展专项能力证据：

- [ ] 安装成功。
- [ ] Chrome 扩展管理页显示 GrayDove。
- [ ] 工具栏图标清晰。
- [ ] Side Panel 和设置页面正常。
- [ ] 最低声明 Chrome 版本 138 已验证，或明确记录无法验证。
- [ ] 当前稳定版 Chrome 已验证。
- [ ] 首次权限提示与商店披露一致。
- [ ] 权限拒绝、撤销和恢复路径正确。
- [ ] 核心脚本和自动化任务可运行。
- [ ] 运行结果、错误提示和停止流程正确。
- [ ] 卸载/重新安装及已有用户升级路径已评估。
- [ ] 浏览器控制台无未解释的严重错误。

Node 测试、构建成功或 ZIP 校验通过，都不能替代真实 Chrome 安装验收。

## 6. Chrome Web Store 后台

- [ ] 上传正确的 Standard ZIP。
- [ ] 商品名称和描述准确。
- [ ] 128×128 正式图标、至少一张 1280×800 真实核心流程截图（最多五张）；宣传图/视频为可选。
- [ ] 支持邮箱 `thinkido666@gmail.com` 已核对可收信；网站如填写须可用。
- [ ] 隐私政策 URL 可公开访问。
- [ ] Privacy 字段与真实数据流一致。
- [ ] 单一主要用途明确；按真实执行路径填写 Remote Code，准确披露 Native/AI 的安装、账号、联网与第三方费用条件。
- [ ] 开发者注册、发布资格和两步验证已核实。
- [ ] 每项敏感权限都有合理说明。
- [ ] Trader / Non-Trader 和地区要求已确认。
- [ ] Distribution 国家/地区和可见范围正确。
- [ ] 付费、广告或联盟计划如不存在，不做不实声明；如存在，完成相应披露。
- [ ] 发布负责人确认后才点击 Submit for Review。

## 7. 审核和正式发布

- [ ] 保存提交时间和后台状态。
- [ ] 开启重要审核通知。
- [ ] 保存 Google 审核意见和通知。
- [ ] 若被拒绝，记录具体政策条款、修复 commit 和新 ZIP。
- [ ] 审核通过后决定立即发布或延迟发布。
- [ ] 正式发布后从公开商店页面安装验证。
- [ ] 记录商品 URL、商品 ID、版本和发布时间。
- [ ] 记录首发用户反馈与重大问题。

## 8. 回滚与事故响应

- 保留上一已发布版本的源 commit、ZIP 和 SHA-256。
- 保留审核往来和发布记录。
- 发现严重问题时先评估暂停发布、提交修复版本或联系 Google 支持。
- 不覆盖历史发布记录。
- 不把旧 ZIP 重新标记成新版本。
- 不通过修改扩展 ID、删除用户数据或强制重置来掩盖升级问题。

## 9. 账号与密钥安全

本仓库只记录非敏感发布状态。Google 登录凭证、商店密钥、支付服务商密钥、个人身份资料和用户数据必须保存在受控密码管理器或密钥系统，不得提交到 Git。
