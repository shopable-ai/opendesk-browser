# R24.5 · 浏览器 JSX/SFC 编译器分版与安装边界

日期：2026-10-12。工作分支：`feature/r245-optional-browser-compiler`。**这是用户对只用 `main` 规则的一次明确、仅限本工作流的例外授权**；验证完成前不合并主分支，不发布正式版或 Release。

## 一、产品选择：优先保留 Node 本地编译，不让普通用户背负编译器包体

原始 React JSX / Vue SFC 在 Chrome Page USER_SCRIPT 中仍需要转换为可执行 JS。现有 `@shopable/opendesk-dev`（Node CLI + Go Native 连接）已经能在本地自动准备 JSX / SFC：`opendesk browser dev .` → 连接已授权目录 → 保存源码自动准备 → 用户主动 Run。**不新增第二套 Node 转换器，不要求每次手工 Vite/npm build。**

普通用户只需 JS / React Direct / Vue Direct，以及预编译安装的组件工具。浏览器 Side Panel 内直接编辑原始 JSX / Vue SFC（无 Native 编译）是专业能力，因此改为两种产物，而不是让用户每次在同一超大包里切换开关：

| 能力 | Standard 普通版（默认） | Developer 开发版（独立包） |
| --- | --- | --- |
| 普通 JavaScript 草稿、现有工具、Controller、Page | 保留 | 保留 |
| React Direct / Vue Direct 与固定 React/Vue Runtime | 保留 | 保留 |
| Node 本地 `opendesk browser dev .` → JSX/SFC 自动准备 | 保留（需已配对的 Go/Node） | 保留（需已配对的 Go/Node） |
| 在 Side Panel 直接编辑 React JSX / Vue SFC | 不展示、不调用不存在的编译器 | 支持，固定本地 Worker 按需编译 |
| 浏览器内 Babel / Vue SFC 编译器资源 | **不进入安装包** | 仅在 Developer 安装包 |
| 独立身份、源哈希、正式用户授权 | 按 Standard 包和真实 Extension ID | 必须采用独立 Developer Extension ID 和授权 |

## 二、实际成本和机制

当前固定浏览器编译文件合计精确 **4,249,817 B**（约 4.05 MiB）：
- Babel 7.29.9：3,141,115 B。
- Vue SFC 编译器：1,071,582 B。
- 受管 UI helper / Worker / linker / Vue adapter：17,898 + 2,223 + 13,685 + 3,314 B。
- 另有 Babel MIT 许可证；普通版本同时省去该资源。
- React Runtime 193,163 B、Vue Runtime 118,131 B **继续留在两版中**，因为 Direct 程序仍需要它们。

以上是未压缩资源字节，不等于实际 ZIP 大小节省或 JS 堆内存节省；以 `tests/framework/browser-edition-package-r245.mjs` 产出的两个 packageHash、总字节和真实 ZIP 为准，不以估算替代完整构建。

Node `webpack`、`esbuild`、`@vue/compiler-sfc` 是本地工具依赖，不应复制到 Chrome 正式包。Developer 的 Babel / Vue 浏览器编译资源只在需要时由内部 Worker 读取，不加载到常驻 Service Worker，也不通过 CDN 下载、`eval` 或 `new Function` 执行用户业务。最终 Page 程序仍由原 User Scripts API 执行。

## 三、构建与分发：一个仓库，两个可独立复核的制品

仓库根目录在已锁定 Node 依赖存在的维护者环境中：

```sh
npm ci --ignore-scripts --no-audit --no-fund

# 普通正式版：默认不包含任何浏览器 JSX/SFC 编译器资源
npm run build
node scripts/verify-package.mjs dist/production production
npm run pack
# dist/production
# artifacts/opendesk-browser-production.zip

# 开发者扩展版：保留原有可信 Worker 和浏览器编译功能
npm run build:developer
npm run verify:developer
npm run pack:developer
# dist/production-developer
# artifacts/opendesk-browser-production-developer.zip
```

两份不同路径不共享同一个已冻结的构建包身份，构建锁依然保护 `.wxt/public` 和持久输出；任何并行 Agent 必须避免并发覆盖共享生成目录。二者验证 `framework/browser-edition.json` 的精确字节，普通版 **禁止** 出现任何 `PAGE_BROWSER_PRIVATE_FILES` 资源及 Babel 许可证；Developer 必须原样提供全部固定资源及其 SHA 和许可。CI 比较独立打包结果，不允许只藏住 UI 却仍然携带大文件。

**分发不是自动上架：** 当前只生产供内部验收的不同目录与 ZIP。Developer 最终如需供用户独立下载和长期使用，应采用独立 Chrome Web Store 扩展记录/签名密钥（或单独的开发者侧载指导），不能擅自复用 Standard 正式扩展 ID/密钥、混用同步存储、已安装任务、Go 配对或覆盖正式版 ZIP。单独扩展 ID 需要独立 Native 配对与网站权限；不隐式迁移用户数据。

## 四、完成条件与回滚界线

- Standard：构建/校验/真实包文件均 PASS，编译器二进制不存在；React Direct、Vue Direct、Controller、Page、JSON 固定草稿、原 SDK 与本地开发通道不受影响。
- Developer：保留 React JSX + Vue SFC 浏览器内源码编辑 → 固定 Worker 编译 → 网页 USER_SCRIPT → 状态点击 → 精确 Stop；错误恢复、来源哈希、CSP 与文档生命周期不能降级。
- 两版均需本分支同一候选的 Node 单元、真实构建与 Chrome 冒烟；关键差异测试应新增纯证据文件。不能把旧 R24.3 完整版 Chrome PASS 自动当成新的分版候选 PASS。
- 正式双版本发布必须在 Mac Chrome 上分别完成身份、权限、安装/更新、误装和清理验收；Release/Store 上架和 `main` 合入另按授权执行。
- 若双版本在安全、构建可维护性或测试成本方面产生重大问题，优先保留 Standard + Node CLI；Developer 方案可独立撤回，不改变用户脚本/Native 格式。

## 五、操作与决策摘要

**建议：**普通安装包不包含浏览器 JSX/SFC 编译器；开发者先使用现有 `opendesk browser dev .` 的 Node 编译；确实需要“无需 Native、Side Panel 中直接输入 JSX/SFC”的少数开发者，才下载独立 Developer Edition。**不要永久维护两套独立源码仓库**，也不要采用 CDN 脚本注入代替缺失编译器。

证据与当前局限：[本工作流记录](../../framework/workstreams/browser-compiler-editions-r245-20261012.md)，[历史 Mac Chrome JSX/SFC 编辑 Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847)（历史包，非本分支），[本地 Node CLI 四目录真实安装](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128)。

## 六、实测体积与发布取舍（2026-10-12）

实际 [双版本 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38240441632) 已经同时构建、校验并制作两个 ZIP，Standard 下载包 **923,772 B**（解压 **2,705,843 B**），Developer 下载包 **1,881,170 B**（解压 **6,956,776 B**），压缩包差 **957,398 B / 约 50.9%**。资源物理清单确认普通包不含 Babel、Vue SFC compiler、Page 编译 Worker 与链接器，保留 React/Vue 的固定 Runtime 供 Direct 工具使用。该结果是本轮分支固定构建的真实数值，不承诺未来扩展版本固定大小。

[macOS Chrome 双版本回归](https://github.com/shopable-ai/opendesk-browser/actions/runs/38241423476) 同一源码身份通过：Standard 不展示不可用 JSX/SFC 编译入口；Developer 无 Native JSX/SFC Run、真实状态交互、Stop、Vue 出错后修复以及受管 Teleport 清理。

**是否值得分版：**4.25 MB 未压缩资源约对应 0.96 MB ZIP 额外负担，它们本就按需读取，因此一般用户启动时间、RAM 的直接改善不能凭 ZIP 节省推断。分版的主要产品价值是**默认发行物的能力边界清晰、减少多数用户无用的开发环境资源和审计负担**。推荐继续保持一个公开正式渠道，Developer 包按需供高级开发者下载使用；如果 Developer 需求不大，可不做第二个商店商品。正式渠道在本分支验收闭环且获用户授权合入之前仍保持当前 main，不在文档中假报 Standard 已经正式发布。

## 七、R24.5 专项 Mac Chrome 验收状态

双版本同源码候选 `176bb1916006ad98bb3d1b10c1b2f2d93a06d122` 的 [CI 38247467657](https://github.com/shopable-ai/opendesk-browser/actions/runs/38247467657) 完整 **PASS**：Standard 真实侧栏只呈现普通 JavaScript 源码编辑（不会显示无用的 JSX/SFC 模式选项），用户输入并主动点击 Run 后获准网页 DOM 真实更新；Developer 仍能无 Native 编译 React JSX/Vue SFC、交互、Stop、语法错误恢复和受管 Teleport 清理。最新 ZIP 分别 **923,809 B / 1,881,207 B**，前者不含任何浏览器 JSX/SFC 编译器资源。完整哈希、截图、sourceHash 和未测边界见 [工作记录](../../framework/workstreams/browser-compiler-editions-r245-20261012.md)。

**后续发行仍 BLOCKED**：Standard 的 React Direct / Vue Direct、Controller、本地 JSX/SFC Native 交接、正式已安装工具更新及稳定扩展 ID 尚未在两个分版下完成全矩阵验收。不要把成功的局部 Chrome Run/Stop 当成可直接替换已上架扩展的发布许可。

