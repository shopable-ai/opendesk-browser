# GreyDove 品牌落地与商店资料

- Owner: 本轮品牌整合（root）；UI 文案由 brand_ui，README/商店资料由 domain_options；store_rules 只读审查。
- 状态: IN_PROGRESS。
- 初始源码基线: 2026-11-17 远端 main `ec8766088b4f290386cf05d5848b56f767ce6d06`。
- 执行中远端新增 8 份发布文档，已快进整合 `5926662a802ea76babadf6b8d6837c872eb21448`（17:04:38 +08:00）；新增提交没有源码变动，原工作区修改均保留。
- 用户本轮明确优先独立分支，使用 `feat/greydove-brand`，不直接修改远端 main。
- 新克隆开始时工作区干净；旧工作区只读核查且无未提交修改，不覆盖它。

## 写入范围与复用

- root: `manifest.json`、`package.json` 描述、Chrome `_locales` 元数据、`scripts/browser-editions-r245.mjs`/`prepare-public.mjs`/`verify-package.mjs`/`check-source.mjs`/`wxt.config.mjs` 中必要品牌接线、现有品牌/发行/包测试、本工作记录。
- UI owner: `src/ui/`、`src/native-agent/`、`src/marketplace/`、`src/market-site/`、`src/platform/chrome/` 的正式用户可见品牌字符串及受影响的既有测试。保留 Native OpenDesk 产品名称、API、协议、ID、数据键和工程路径。
- 文档 owner: `README.md`、`docs/release/greydove/STORE-LISTING.md` 和 3 份当前用户/维护者指南；当前竞品事实以原研究、兼容矩阵和实际源码交叉核实。执行中将本轮未跟踪的商品文案副本合入远端新建的唯一正式发布文件，未保留第二套资料。
- 品牌名称唯一配置沿用根 Manifest，Developer 名称沿用现有派生逻辑；不创建第二套品牌配置或安装/运行机制。
- 历史技术文档、来源快照、已发布工具包及其哈希不批量改写。当前独立工具确有用户可见旧品牌时，按原候选/验证/更高 PATCH/显式晋升流程处理，不以同版本替换旧字节，不修改真实用户安装数据。

## 验证与资源

- 资源: 本克隆独立的 `node_modules`、`.wxt`、`dist`、`artifacts/greydove-brand`；不使用旧工作区 dist、Chrome profile 或端口。
- 品牌/Manifest/包输入改变，因此执行本轮受影响的源码、双模式 Standard 构建、Developer 构建、环境测试、严格包/ZIP 验证。用户明确要求的 `npm test` 是环境测试，不称全量产品验收。
- 旧原生回执仅说明原候选；本轮真实 Chrome 验收初始状态 `NOT_TESTED`。
- 不移除、跳过或放宽权限/CSP/固定资源哈希/文件集合校验。
- 已确认没有可用的正式 GreyDove 图标；生产通知 PNG 595 字节、SHA-256 `efb5caddc95697204e98f9e7319119095ea195fa02448904bc985e90e96d4de6`，不是鸽子品牌图。最新品牌文档记录了已选设计方向但未提供源图，本轮也未检索到可确认的既选素材；不使用通知图标或新占位图替代。
- 不采购域名、不写未拥有官网地址、不上传商店、不发布、不合并 main。

## 稳定元数据与旧回执

- `OpenDesk Workflow` 是既有同 ID/同版本 Task Manifest 的稳定作者字段，继续保留，避免改变 `manifestHash` 而触发不可变版本冲突。
- WebFlow 0.2.x 结果头继续保持旧字节，已有冻结 `contentSha256` 的 UNKNOWN 只读恢复不受新品牌文案影响。
- Marketplace 的发布者展示属于表示层，未写回原不可变工具/Task Manifest；新品牌不会替换旧发行署名或旧数据。
