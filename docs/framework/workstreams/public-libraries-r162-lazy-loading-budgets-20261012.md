# R16.2 公共库体积/按需加载架构纠偏与物理验收

日期：2026-10-12。范围：`shopable-ai/opendesk-browser` 的公共库体积、WXT 固定资源与真正运行时按需加载；本记录不可冒充新的发行验收。

## 用户需求与正确边界

用户授权按实测需要调整过小的单项体积预算，同时指出“很多第三方库是动态引入，不应全量构建到后台”。区分：

- **构建并随 ZIP 发布**：每个已审核库对应独立固定文件，含许可证和 SHA，浏览器运行时不 npm install / fetch CDN / 动态编译脚本；离线预装不是全部启动加载。
- **后台启动**：SW 与明确 boot sidecars；不能因为 `src/libs` 新增库就把它 import 到 SW。
- **默认执行库**：当 Controller/Page 运行时才获取每个世界实际默认库；不在扩展启动时加载全部库。
- **显式按需库**：用户代码仅一项 `// @opendesk-lib <id>`，通过受控宿主从本扩展资源 URL 拉取固定已签名/哈希验证的 JS，送到 Page USER_SCRIPT；React/ReactDOM 共一项固定文件，Vue 独立。没有声明不应取该包；库文件进入发行 ZIP 不等于激活/联网/页面 MAIN 暴露。
- **Tailwind**：静态 CSS 而非 SW 的 JS 运行时。仍属后续公共 UI 工作。

## 实施改动

1. 在 `scripts/audit-fixed-entries.mjs` 复用 Catalog 与既有 React/Vue 合同，导出 `runtimeResourcePlan`：实际背景启动列表、Page/Controller 默认列表、按需包物理字节及每个单选场景。增加对应 `page-with-<id>` loadingGroups；场景相互重叠，不能求和当 RAM/启动体积。只接受现有 `verifyPackage` 校验后的物理文件/回执。
2. 在 `scripts/bundle-provenance.mjs` 增加 prebuilt React/Vue 与 SW 内 npm React/Vue 模块的误打包拒绝；保持原有每包 npm ownership 检查，不扩大权限、不放宽 CSP 或动态执行。
3. 增加 Node 测试：默认 Page/Controller 只 fetch manifest 与五项默认代码；Cheerio 只在显式选择后才额外获取一个 manifest 与一个选中包；覆盖所有 Catalog 中的可选 npm 库不进入 SW，React/Vue 不重复进 WXT；核对各动态库字节与场景组。
4. 更新 `src/libs/README.md` 及公共合同中过时的 327680 B 文案，准确指向当前唯一 `BUILD_POLICY`。
5. 对 React/Vue 的 raw framework 资源按真实 Page Loader 的 `PAGE_FRAMEWORK_RESOURCE_LIMIT=256 KiB` 计量和拒绝超限，不能只按普通 raw JS 512 KiB 展示；按需资产报告同时给出 `runtimeBudgetBytes` 和 `runtimeRemainingBytes`。

## 本轮不提高容量的证据

已有成功同候选预算 CI：

- https://github.com/shopable-ai/opendesk-browser/actions/runs/38152074537
- 该候选：生产 SW 325780 B / 1 MiB；Cheerio 121600 B、CryptoJS 66438 B、Axios 51677 B / 各 512 KiB；所有库按独立固定入口构建，现有限额未阻断。
- 当前生产 SW 1 MiB 硬限、512 KiB 复核线；其他固定 JS 512 KiB 硬限、320 KiB 复核线；开发 SW 1.5 MiB。此为**项目工程限额**不是 Chrome 平台强制限额；旧 327680 B 不再是当前唯一合法策略。
- 可选库在 ZIP 中存在但默认不加载；本任务没有实证需要把每个按需 JS 上限提高到 1 MiB，也不能假称每个库都只有零内存成本。后续单库超过 80% 复核线再做模块体积归因，达硬限才针对该库与全部读取/manifest/打包验证做受控专项升级。

## 证据门槛

`npm run build:size`、`npm run check`、`npm test`、`npm run build`、`npm run build:dev`、`npm run verify`、`npm run libs:doctor -- --strict`、`npm run pack`；至少复核受影响的 `tests/environment/fixed-entries-audit.test.mjs`、`tests/environment/bundle-provenance.test.mjs`、`tests/environment/builtin-libraries.test.mjs`。同 SHA GitHub CI 可证明环境组件与构建，不能代替未执行的 Mac Chrome/最终 ZIP 安装验收。未取得新候选原生证据时状态 `NATIVE_UNVERIFIED`。

当前剩余总体公共库目标包括 FingerprintJS、Socket.IO、Tailwind、完整 Controller Axios Broker/取消和各执行世界能力缺口，不通过体积分析冒充交付。

## 实际 CI 回执（候选 c8b85ed）

所有下面的状态都明确绑定功能候选 `c8b85ed98f82c2257f79741588795f489986a348`，不与其他 Agent 后续修改混作同一候选。**这是专项验收，不是整个公共库矩阵的最终发布验收。**

- PASS：扩展包体积与库边界，https://github.com/shopable-ai/opendesk-browser/actions/runs/38154852735 。含实际 production/development WXT、物理清单、独立资源容量、React/Vue 256 KiB runtime loader 容量与可选项分组。
- PASS：Page userScripts 依赖与安装包，https://github.com/shopable-ai/opendesk-browser/actions/runs/38154852706 。
- PASS：R16.1 Page 内置库真实 Chrome 试验，https://github.com/shopable-ai/opendesk-browser/actions/runs/38154852720 。不以 Node VM 代替浏览器，也不扩张到未测库/环境。
- FAIL：R15 公共库总体资格 CI，https://github.com/shopable-ai/opendesk-browser/actions/runs/38154852832 。共有 1323 项通过、2 项失败、7 项跳过。该 CI 里的 libs-doctor、包构建与验证阶段已通过；两项失败分别是 `tests/environment/local-dev-managed-ui.test.mjs` 的管理 UI 预览状态以及 `tests/environment/native-tool-navigation-driver.test.mjs` 的工具导航旧 DOM 断言，属于并行其他任务，不能隐藏或冒充 PASS。
- 尚无通过回执：Fixed entry optimization equivalence run https://github.com/shopable-ai/opendesk-browser/actions/runs/38154852718 在最后核对时仍待处理，不列入通过项。

候选 c8b85ed 生产物理记录：目录文件未压缩总量 2,236,313 字节、其中 Service Worker 文件 325,780 字节；按需 Page 选择 Axios 场景 93,510 字节、Cheerio 163,433 字节、React 234,996 字节、Vue 159,964 字节；默认 Page 资源 41,833 字节。所有加载分组互有重叠，不得合计冒充内存或安装 ZIP 压缩大小。React 固定资源 193,163 B，在真实 262,144 B 加载器限内；Vue 为 118,131 B。所有数值来自上述同候选体积/边界 CI 真实 WXT 物理报告，而非估算。

结论：本专项目标（区分分发与启动、验证声明后单库加载、补实测报告/错误入 SW 守卫、修正原始资源体积门槛）已有源码及专项 CI PASS；整个 R15 和其余尚缺公共库仍未完全验收，不能把此记录当成全部完成或最终 F3/ZIP 安装完成。
