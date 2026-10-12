# Extension Factory R2 — Page QA Inspector 历史技术记录（DEPRECATED / SOURCE_REMOVED_FROM_MAIN）

> **2026-10-12 最新源码清理：`DEPRECATED / NO_RELEASE / SOURCE_REMOVED_FROM_MAIN`。** 已从当前 `main` 源码树移除 Page QA 产品、其专属功能模块、绑定 QA 的实验 Factory、仅供 QA 的 build/pack/verify、测试与 CI，并移除根 `package.json` 中的 `build:product`、`pack:product` 命令。下方的路径/Node/WXT/ZIP/Chrome 门槛、历史 `NOT_TESTED` 状态均为当时的历史记录，**不再是当前可执行命令、文件存在证明或待继续验收任务**。历史 Git 提交和已有原始证据不重写、不删除；旧代码可从 `665a5b93a98a8e3d5e60570af9839aa62c0c4125`、`48d5ce6d32c40efb5c23b24139cb89e13eb16393` 等历史提交检索。
>
> **为什么连实验 Factory 一起移除：** 这套 CLI、Resolver 和 Feature Catalog 实际只支持硬编码 Page QA，当前没有独立于 Page QA 的用户入口。留下会形成死代码和不可运行的构建命令。仅保留设计和历史 commit，未来先验证[电商等实际需求](../../product/browser-extension-ecosystem/commercial-decision-ecommerce-20261012.zh-CN.md)，再设计真正通用的产品注册、最小权限和按需构建。正常 OpenDesk 的 `npm run build` / `npm run pack` 未改；没有在本轮补做 Mac Chrome 或 CWS 验收。


> 2026-10-12。工作范围仅 `main`；不创建分支、worktree、PR；不强推。远端 GitHub Connector 直接写入，**没有**用户 Mac 工作目录、CFT Profile 的读取权限。本工作流只记录自己的源码和证据，严禁移动其他任务的候选或重写全局 owner。

## 首要目标和边界

用户点击独立 Page QA Inspector 工具栏图标后，检查当前获得临时 `activeTab` 授权的 HTTP(S) 标签页，得到 DOM 定位例子及有限基础无障碍启发式检查；可主动定位、只读导出报告。OpenDesk 默认 `npm run build`/Manifest/运行时完全保留。

- 产品身份：`page-qa-inspector@0.1.0`（与 Chrome Web Store ID 不同）。
- 配置：`products/page-qa-inspector/product.config.mjs`。
- 代码：`packages/extension-factory/{feature-catalog,resolve-product}.mjs`、`packages/features/page-qa/*`、`products/page-qa-inspector/{entrypoints,ui}/*`。
- 构建：`scripts/product-build.mjs` + 独立 `products/page-qa-inspector/wxt.config.mjs`；原 `wxt.config.mjs`、`scripts/build.mjs`、`manifest.json` 不修改。
- 构建成果：`dist/products/page-qa-inspector/production`；ZIP：`artifacts/products/page-qa-inspector/page-qa-inspector-0.1.0-production.zip`。
- 验证：`tests/environment/extension-factory-r2.test.mjs`、`.github/workflows/extension-factory-r2.yml` 和产品 Manifest/JS/ZIP 严格校验。

## 产品功能与安全规则

- `dom-inspector`：只在真实用户点击后调用本地打包 `chrome.scripting.executeScript({func})`；限单一当前 tab，最多 1500 个目标节点；只发出标签/定位表达式/布尔标记，不发送输入值、DOM HTML 或 URL 的 query/fragment。
- `a11y-check`：本地分析图片 alt、按钮/链接名、表单标签、标题、语言与 headings；仅供人工检查，不冒充 WCAG 正式审计。
- `local-settings`：`chrome.storage.local` 只记录 `onlyWarnings` 过滤偏好；报告保存在弹窗当前会话内存。
- Manifest：`activeTab`、`scripting`、`storage` 三项；禁止 host 常驻授权、Cookie、nativeMessaging、Side Panel、background、自动 content script、跨扩展信任与远程 JS。
- 闭合 Feature Resolver 拒绝未知 feature、重复 productId、缺依赖、循环、权限膨胀和未知配置字段。Vite 的输出模块审计仅允许审查过的 page-qa 功能源码和共享设计变量。

## 验证级别与发布门

| 项目 | 状态 | 证据与边界 |
| --- | --- | --- |
| 独立产品真实源码 | SOURCE_IMPLEMENTED（待同 SHA 再核对） | 新增源码与 Node 合同测试，不等于浏览器验收 |
| 定向 Node 测试 | NOT_TESTED | `node --test tests/environment/extension-factory-r2.test.mjs`，等待真实 CI 输出 |
| 产品 WXT 构建 | NOT_TESTED | `npm run build:product -- --product page-qa-inspector`，不能宣称已有安装包 |
| 产品 ZIP 字节一致 | NOT_TESTED | `npm run pack:product -- --product page-qa-inspector`，必须核对同包 hash |
| 默认 OpenDesk 无回归 | NEEDS_REVIEW | 默认源文件未改，仍需相关构建输入差异核对/CI |
| Mac Chrome 双产品并装/20 次点击 | NOT_TESTED | 无用户本机 Chrome/CFT 资源；必须独立真实验收 |
| 页面导航/撤权/禁用页/重启/升级 | NOT_TESTED | 按真实运行记录，不以 mock 代替 |
| CWS 单一目的/隐私/发布批准 | NOT_TESTED | 人工审核，不可宣称已上架 |

所有产品包、压缩归档、测试证据与下一轮构建结果必须有明确 `sourceCommit`、`packageHash`、版本和文件清单。同一候选通过 CI 后才能更新以上状态；Mac 原生另有 `docs/framework/prompts/goal-extension-factory-r2-mac-chrome-acceptance.zh-CN.md`。

## 并行冲突与操作限制

远端主分支在本轮审计期间多次前进（云控、浏览器 SDK 等无关提交）。提交前只读检查新 HEAD、待写路径、package 脚本和对应已有源码；仅在不覆盖其他 Agent 内容且可 fast-forward 的情况下写入。未获 Mac 工作目录访问，不推断本机未提交改动或自动抢占 Chrome Profile。没有真实包和证据不得提升 BUILD_VERIFIED 或 CHROME_NATIVE_VERIFIED。
