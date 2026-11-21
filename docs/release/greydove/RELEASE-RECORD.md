# GrayDove 发布记录与证据账本

> 每次提交 Chrome Web Store 或正式发布一个版本，新增一条记录。不得覆盖历史记录，不得用旧 ZIP、旧测试或其他 commit 的证据填充新版本。

## 1. 当前状态

- 首次 Chrome Web Store 提交：尚未记录
- 首次审核通过：尚未记录
- 首次正式发布：尚未记录
- 当前已发布版本：未知/尚未核实
- 当前商店商品 ID：未知/尚未核实

以上不是对账号或商店状态的断言；需要由发布负责人在 Developer Dashboard 核对。

## 2. 发布记录模板

复制以下区块，为每次发布新增一个版本记录：

```markdown
## Release <版本号> — <日期>

### 商品身份
- 商品名称：
- Chrome Web Store 商品 ID：
- 商店 URL：
- 发布类型：Standard / Developer
- 发布范围：公开 / 不公开列出 / 其他：

### 源码与构建身份
- 远端分支：
- Git commit SHA：
- 工作区状态：
- Manifest version：
- package-lock 身份：
- Node 版本：
- 构建时间：
- 构建回执：
- packageHash：
- ZIP 路径：
- ZIP SHA-256：

### 验证证据
- 源码检查：
- 定向测试：
- 完整测试：
- 包验证：
- 真实 Chrome 版本：
- 干净 Profile 安装：
- 核心功能验收：
- 权限/撤权验收：
- 未测试项目：

### 商店审核
- 提交时间：
- 审核状态：
- 审核反馈：
- 修复 commit：
- 再提交时间：
- 审核通过时间：
- 正式发布时间：

### 发布后
- 用户可见版本：
- 主要反馈：
- 已知问题：
- 回滚/修复计划：
- 负责人：
```

## 3. 证据规则

- 每条记录绑定一个明确的 commit 和生产 ZIP。
- ZIP SHA-256 必须对实际上传文件计算。
- packageHash 必须来自该候选包的实际验证回执。
- 测试结果必须注明实际运行的命令、环境和候选身份。
- 真实 Chrome 验收不能由 Node 测试替代。
- 商店审核通过不能由上传成功替代。
- 审核通过但尚未正式发布，不能标记为 PUBLISHED。
- 旧记录只追加更正说明，不覆盖原始事实。

## 4. 隐私与安全

不要在此记录中放入 Google 登录凭证、开发者账号密码、银行卡信息、支付服务商密钥、个人身份证件、家庭地址、私人电话号码或用户数据。只保存非敏感状态、版本和证据引用。


## 5. 候选 0.1.0 — 2026-11-17（仅供验收，未提交商店）

- 显示名：**GreyDove（灰鸽）**；简称 GreyDove。首发 Standard，Developer 仅内部。
- 支持邮箱：`thinkido666@gmail.com`；中文短描述和完整介绍来自用户，见 STORE-LISTING.md。发布者显示名称、官网、隐私政策 URL、地区与账号资格仍待确认。
- 状态：**SOURCE / COMPONENT / BUILD / PACKAGE PASS；CHROME NOT_TESTED；STORE NOT_SUBMITTED。** 未提交 Git、未推送、未访问商店后台。商店现有商品/版本状态仍未知。

### 冻结身份与范围

- 分支基线：本地 main `0faddb6bb7293705bc6b4c257d8cea4936aab619`。
- 不是干净 commit 的发行：基线加 40 个明确发布 overlay 路径（含文档、品牌源文件、构建/校验、测试和标题），保留实际文件哈希；没有创建 Git 分支或 worktree。
- 33 个未完成的并行工作区路径未纳入候选，尤其开发界面新菜单、控制器及 watcher 相关改动。它们在主工作区原样保留。**本次 PASS 不表示整个 dirty 工作区可以生产打包。**
- Standard 冻结目录：`work/greydove-release-prep-20261117-r5/`；Developer 使用其独立 APFS 副本 `work/greydove-release-prep-20261117-r5-developer/`，不共享可写 node_modules、public 或输出。
- 逐文件身份、overlay 和排除路径：[snapshot.json](../../../work/greydove-release-prep-20261117-r5/evidence/snapshot.json)。两版 823 项 build sourceInputs 完全相同，构建中来源漂移为空。
- Node `v26.3.1`；锁文件 SHA-256 `aec02708c6fb888b365e8fbd37fb7e16e2e320e48c693ac07d924842488f4d20`。
- 构建完成：2026-11-17 19:15:23 +08:00；版本 `0.1.0`。若后台已有商品，上传前核对其版本和商品 ID，不能假定是新商品。

### 最终 Standard ZIP

- [opendesk-browser-production.zip](../../../work/greydove-release-prep-20261117-r5/artifacts/opendesk-browser-production.zip)
- 大小：**3,544,782 B**；143 个文件。
- ZIP SHA-256：`a970ee5b0cd348ff89255f7b629585b83d582c48392bee5c1aa59e678a986c79`
- packageHash：`7662b40ca7a56565a2c2204400d42241fa47e3f8a577da6ec47f5c3a43a6e5e3`
- [原 pack 回执](../../../work/greydove-release-prep-20261117-r5/evidence/packages/pack-production.json)、[ZIP 逐文件核验](../../../work/greydove-release-prep-20261117-r5/evidence/standard-zip-verification.json)。ZIP 每个文件大小/哈希与原 build 报告一致；不是仅检查目录名。
- 六个 PNG 均被 icons / action.default_icon 引用，通知图标保持原大小/哈希；无 WebP 母版、source map、额外 CSS 或 Standard 浏览器编译器资源。

### 验证证据

- 34/34 定向测试：[targeted-tests.log](../../../work/greydove-release-prep-20261117-r5/evidence/targeted-tests.log)。覆盖品牌来源/PNG/Manifest 拒绝场景、发行差异、React 单一 CSS 归属、文档导航、默认离线 React 与显式 pinned 网络导入。
- 源码检查：r3 `check-source` 检查 1406 文件通过；后续仅修改默认 React 示例、对应测试及商品显示名，相关源码由上述最终测试编译/渲染，最终 Manifest 由原严格验证器校验。没有把旧检查冒称为 r5 全量 CI。
- [Standard production 原构建回执](../../../work/greydove-release-prep-20261117-r5/evidence/builds/build-production.json)：PASS，原 build → verify → pack，无预算/CSP/权限放宽。
- [Developer production 原构建回执](../../../work/greydove-release-prep-20261117-r5-developer/evidence/builds/build-production-developer.json)：PASS，153 文件、九个正式编译器资源，packageHash `3141b64d28d68fb0e06cbfa7a03e0f4bafbf3a1d587caae3e84a8cf8d682fc55`。未制作 Developer 商店 ZIP。
- [两版资源实测](../../../work/greydove-release-prep-20261117-r5/evidence/brand-edition-verification.json)：各 11 个固定资源大小/哈希通过；六个 PNG 与唯一源目录逐字节相同，七个品牌源文件（含母版）全部纳入构建输入追踪。
- Standard tool-shell 3,081,121 B，原 3 MiB 上限 3,145,728 B，余量 64,607 B；原 soft review 提示仍保留，不声称体积已有充裕余量。
- 根完整 npm test / 全量 CI、Chrome 安装/运行/权限撤销、真实截图、最低 Chrome 138/当前稳定版、Native 配对、升级路径与商店审核均 **NOT_TESTED / NOT_SUBMITTED**。

### 已处理与未关闭事项

- 工作流 CSS 改由现有 React 样式 owner 内嵌，消除未引用 CSS 产物；没有移动原业务样式或创建第二套加载器。
- 示例浏览入口指向同目录说明页；默认 React 示例使用 Math.max，保留显式网络 Import 的同源/锁定测试和原功能。没有给安全 scanner 添加 URL 或构造器白名单。
- r1/r2 全工作区快照的体积及构造器失败与 r3 默认示例字符串失败保留在对应 evidence；r4 通过但显示名不完整，已由本 r5 双语名称候选取代，不上传旧 ZIP。
- 日常运行证据：开始时观察到 dev watcher PID94541；收尾时未检测到 dev/wxt 或 43119/43120 监听，本轮未执行停启，退出原因未知。源码和冻结 ZIP 不表示当前浏览器已应用更新。
- 下一步依次完成：同包真实 Chrome 核心操作/权限验收和截图；其余可见品牌复核；敏感权限/数据流、Native/AI 条件及可公开访问隐私政策；发布者/账号/地区核对；安全保存最终源码后，再批准商店上传和提交。

## 6. 候选 0.1.0 — 2026-11-18（GrayDove Standard，未提交商店）

- 状态：**SOURCE / COMPONENT / BUILD / PACKAGE PASS；CHROME NOT_TESTED；STORE NOT_SUBMITTED。** 本轮完成编译和上架材料整理，未提交 Git、推送、访问商店后台或上传。
- ZIP 内名称及简称均为 **GrayDove**，版本 `0.1.0`，Standard / production。Developer 未制作商店包；没有改变扩展协议、权限、CSP 或体积预算。
- 支持邮箱沿用已确认的 `thinkido666@gmail.com`；发布者显示名称、公开隐私政策 URL、目标地区及账号资格仍未知。

### 冻结身份与构建

- 已重新抓取 origin/main；本地 main `cdff7e777d45c7b3d0867042f0483a2c72c0b629`，origin/main `3a9677ab4`（完整 SHA 见快照），本地领先 3、落后 0。
- 独立源码副本：[work/graydove-cws-20261118/](../../../work/graydove-cws-20261118/)。基线加 37 个明确发布覆盖路径，32 个未完成并行路径未纳入；完整路径、28,052 个冻结文件身份和依赖记录见 [snapshot.json](../../../work/graydove-cws-20261118/evidence/snapshot.json)。未创建 Git 分支或 worktree，未覆盖日常 `dist/development`、主仓库依赖或开发输出。
- 使用原 `scripts/build.mjs production` → `verify-package.mjs` → `pack.mjs production`，独立守卫端口 43130、独立输出和证据目录。锁定依赖由候选内 `npm ci --ignore-scripts --no-audit --no-fund` 安装；离线缓存不足后正常下载成功，局域网代理探测失败，未改代理配置。
- Node `v26.3.1`；package-lock SHA-256 `aec02708c6fb888b365e8fbd37fb7e16e2e320e48c693ac07d924842488f4d20`。实际构建输入 824 项，构建中来源漂移为空。
- 材料准备完成：2026-11-18 01:45:38 +08:00。

### 本轮交付

- [GrayDove-0.1.0-chrome-web-store.zip](../../../artifacts/graydove/0.1.0-20261118/GrayDove-0.1.0-chrome-web-store.zip)：**3,544,670 B，143 文件**。
- ZIP SHA-256：`30f316f6022432e6d15731de6002ea4efa9e612a0c977f6e813bcea7a70fb906`。
- packageHash：`8a4740c69d3a6a52fc68298907332abf2b22bf1153a00519b3d92ded4bd6fbf2`。
- 同目录包含同源 128×128 商店图标、中英文复制文案、已知/待补字段、SHA256SUMS、[上架准备说明](../../../artifacts/graydove/0.1.0-20261118/README.zh-CN.md) 和 [release.json](../../../artifacts/graydove/0.1.0-20261118/release.json)。只上传 ZIP，其余是独立商店材料；中文文案不代表已完成 Chrome i18n 或商店本地化。
- 最终交付 ZIP 与原打包器输出逐字节一致；ZIP 每个文件大小/SHA-256、路径、CRC、精确资源集合及六个同源品牌 PNG 均通过，无 source map 或品牌母版。

### 本轮验证与限制

- [源码检查](../../../work/graydove-cws-20261118/evidence/source-check.log)：1407 文件及原合同检查通过；[品牌拼写](../../../work/graydove-cws-20261118/evidence/brand-check.log)通过。
- [16 项定向检查](../../../work/graydove-cws-20261118/evidence/targeted-tests.log)：16 通过、0 失败，覆盖图标来源/Manifest 拒绝场景、发行资源差异、React 样式打包、离线默认示例及显式锁定网络导入。
- [构建回执](../../../work/graydove-cws-20261118/evidence/builds/build-production.json)、[严格包验证](../../../work/graydove-cws-20261118/evidence/verify-production.log)、[原打包回执](../../../work/graydove-cws-20261118/evidence/packages/pack-production.json)、[ZIP 核验](../../../work/graydove-cws-20261118/evidence/zip-verification.json)均通过。
- 原体积 soft review 提示保留；tool-shell 3,081,121 B / 3,145,728 B，上限余量 64,607 B，没有放宽预算来完成构建。
- 完整 CI、同候选真实 Chrome 安装/核心操作/权限撤销、真实商店截图、最低 Chrome 138/当前稳定版、Native 配对和升级路径均 **NOT_RUN / NOT_TESTED**；没有商店上传、审核或公开发布回执。
- 提交前仍需：同包 Chrome 验收和至少一张 1280×800 真实截图；公开隐私政策及准确数据、权限、远程代码/Native/AI 披露；发布者、账号资格、两步验证、Trader 和地区核对。后台商品 ID 和已有版本未核实，不能假定 `0.1.0` 可以升级现有商品。
