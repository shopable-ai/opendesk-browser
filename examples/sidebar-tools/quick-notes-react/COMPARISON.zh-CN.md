# Quick Notes A/B：原生 JavaScript 和 React Shared UI

## 双版本基线与不可越过的边界

| | 原生 HTML/JS | React 19 + Shared UI |
| --- | --- | --- |
| 工程目录 | `examples/sidebar-tools/quick-notes/` | `examples/sidebar-tools/quick-notes-react/` |
| 工具 ID | `quick-notes` | `quick-notes-react` |
| 初始配置版本 | `1.1.9` | `1.0.0` |
| 授权能力 | `storage.local`、`currentPage.read`、`tasks.open` | 完全相同 |
| 存储命名空间 | 宿主按 ID 隔离 | 宿主按 ID 隔离 |
| 用户数据 | 不读取、不迁移 | 使用独立的新命名空间 |

首轮读取 Git main 基准：`78aa43fa3e00b227bc84487bfcf45f80f76a9ccd`；原版 `tool.config.json` 的 Git Blob SHA-1 为 `8021a892a51d96cf002d60e7211fd0a861fa8d0b`。两者不是 SHA256；最终验收须对原版 `src/main.js`、`src/index.html`、`src/style.css`、`tool.config.json`、`assets/mark.png` 分别执行 `git hash-object` 与 `shasum -a 256`，核对 Git diff 为 0。记录本次提交 SHA、Chrome 版本、源码及完整安装包 SHA256。

## 必须 A/B 测试的用户功能

| 操作和失败模式 | 原生已有规则 | React 验收要求 | 当前真实 Chrome |
| --- | --- | --- | --- |
| 空库新建、编辑、保存、删除、多条选择 | 16 条、8 KiB、文本限长 8192 | 不缩水 | `NOT_TESTED` |
| 工具关闭、重开和浏览器完整重启 | 持久存储 | 各自持久 | `NOT_TESTED` |
| 有效 HTTP(S) 网站关联与网页切换后刷新 | 人工关联、保存前核对 URL | 不使用陈旧 URL | `NOT_TESTED` |
| 当前网页受限或读失败 | 离线功能继续使用 | 离线可用 | `NOT_TESTED` |
| Cmd+S / Tab / Escape / 取消放弃修改 | 显式确认和草稿保护 | 语义同等 | `NOT_TESTED` |
| 空笔记/满限额/读取失败/畸形旧数据 | 防写入或提示 | 不能悄悄覆盖 | `NOT_TESTED` |
| 两窗口并发冲突 / 结果未知 | ifMatch ETag、草稿保留 | 相同调用合同 | `NOT_TESTED` |
| 旧版单条 `note` 恢复和清理失败 | 清理失败可继续重试 | 仅本工具数据 | `NOT_TESTED` |
| 打开任务、停用、升级、卸载 | Host 管理合同 | 独立版本正确 | `NOT_TESTED` |
| 双安装 / 删除一方不影响另一方 | 按工具 ID 隔离 | 真实安装及卸载检验 | `NOT_TESTED` |

测试用两个**独立 Profile**，各自事先准备相同的样例数据（0、8、16 条）和相同权限。不能从真实原版迁移、复制或读取私人笔记。所有失败案例在原版和 React 使用同等错误注入和按键序列。

## 资源、开发成本与公平性

`npm run compare --prefix examples/sidebar-tools/quick-notes-react` 在构建完成后输出机器可读 JSON，包括原生/React 编译后 JS、CSS、完整 UTF-8 工具包字节；区分原生 HTML 和混合业务 DOM JS、React 的 Model/JSX/Bootstrap/CSS 手写行数。**不能把原生混写的 main.js 当成全是纯业务行。**

Shared UI 的浏览器固定 React 和 CSS/组件资源并不免费：报告需单列其实际字节，解释「仅单工具成本」与「多个已安装工具可复用的公共成本」。若测 React 自打包基线，只更换相同 JSX 的依赖打包策略，不长期维护第三个 Quick Notes。

性能：同一 Mac Chrome 版本、同配置临时 Profile、同等环境条件。预热后每一操作至少 5 次，报告原始样本和中位数（启动至可编辑、保存到反馈、交互到稳定、初始内存和关闭后内存）；记录 Chrome/扩展 build SHA、数据量、采样协议和异常值，不以单次速度做结论。无可靠 GC 内存采样时，内存结论保持 `NOT_TESTED`。

## 独立评分和推荐方案门槛

| 独立维度 | 目标 | 此轮证据分 |
| --- | --- | --- |
| 原版代码及用户数据保留 | ≥95 | `NOT_SCORED` |
| React 全功能等价 | ≥95 | `NOT_SCORED` |
| React Shared UI 的真实复用 | ≥95 | `NOT_SCORED` |
| 安装、数据与更新隔离 | ≥95 | `NOT_SCORED` |
| UI 一致、键盘、320–440px/200% 缩放 | ≥95 | `NOT_SCORED` |
| 比较方法的公平性 | ≥95 | `NOT_SCORED` |
| 资源和性能证据 | ≥95 | `NOT_SCORED` |
| 测试复现与长期维护 | ≥95 | `NOT_SCORED` |

分项都要独立达标，不能拿平均分补短板。任何实际未执行的测试，报告里用 `NOT_TESTED`；未验证的维度绝不硬打 95。

### 推荐方向

以真实业务安全性、组件重用、独立升级和公平测量为依据，再决定哪一种是普通开发者的默认模板。**源码短不等于产品更好，包小不等于总运行成本更低。**在两版功能和 Mac Chrome E2E 尚未验证前，不发布技术优劣结论。

## R2.2 已核验的 CI 数据快照（不可冒充正式发布）

来源：[Chrome 双版本同源预览及候选包 CI #39140091346](https://github.com/shopable-ai/opendesk-browser/actions/runs/39140091346)，Commit `a8754484173d143c4bfbf74ddf17786719f214b2`；提取自对应 Actions Artifact 的 JSON 和源码构建。此快照**早于后续 R2.2 React 代码/测试变更**，不能据此声称最新源码安装包 SHA256 一致；最新包须以最终通过的 CI 重新生成并复核。

| 实测项目 | 原生 `quick-notes` | React `quick-notes-react` |
| --- | ---: | ---: |
| 包内 JS，UTF-8 字节 | 12,238 | 12,871 |
| 包内 CSS（包含正式共享设计），UTF-8 字节 | 14,515 | 14,365 |
| 候选 JSON 包，UTF-8 字节 | 32,152 | 29,208 |
| 工具自有 JS/JSX 及 Model 手写行 | `src/main.js` 237 行，业务/DOM 混写 | `model.js` 54、`App.jsx` 326、`main.jsx` 19 行 |
| 自有 HTML / CSS 行 | 52 / 44 | 1 / 45 |
| Vite 工具配置行 | 不适用 | 61（额外构建成本） |
| React 核心依赖是否在单包重复打包 | 无 | 否，外部固定 Runtime |
| 同源 Chrome 预览新建、保存、切换、删除 | `PREVIEW_PASS` | `PREVIEW_PASS` |
| 320/360/400/440px 无页面横向溢出 | `PREVIEW_PASS` | `PREVIEW_PASS` |
| 真正安装后 Host SDK/重启/卸载数据隔离 | `NOT_TESTED` | `NOT_TESTED` |
| 交互时间 P50、启动时间 P50、内存 | `NOT_TESTED` | `NOT_TESTED` |

这份快照的 React 候选包比原生候选包少 2,944 字节（约 9.16%），**但不能据此声称 React 更省资源**。宿主共享资源在同一 CI 的实际构建中分别为：固定 React 19 Runtime **193,163 B**、Shared UI **61,650 B**、design tokens CSS **2,590 B**、第三方 Notices **12,986 B**，合计 **270,389 B**，另有 React License 文件 1,088 B。它们是由浏览器公共构建持有、可被多个工具摊销的真实资源，不是 React 工具的零成本附件。

基线文件比对：在 GitHub `main` 将原版 `src/main.js`、`src/index.html`、`src/style.css`、`tool.config.json`、`assets/mark.png` 与 R2.1 基线 `b29d1f162de7257a72f3240aaf9ed1d156d2e200` 分别比较 Git Blob SHA，**5/5 相同**；本比较不读取原版任何私人笔记。

### R2.2 验收与反方审计结论

- **已证明**：两个独立工具 ID、三项相同权限声明；真实 Vite JSX 编译和包编码；固定 React Runtime、正式 CSS 来源校验；CI Chrome 两版预览交互和四档无溢出；原版五个文件未改。
- **新增测试（必须另看最新 CI）**：正式 React 组件经仅预览可控 SDK 适配器验证保存期间继续输入、ifMatch 请求、删除失败、ETag 冲突、结果未知草稿保留；该测试不得计作真实 Host PASS。
- **公开阻塞**：R2.2 CI #39140091346 的真实扩展 Host 安装测试在加载主侧边栏时遇到 `E_REACT_LIST_OWNERSHIP`，发生于工具安装前。既不能把安装隔离评为 PASS，也不能凭这个初始化异常判定笔记业务失败；需要先修复或等效验证正式 React App Shell 宿主启动，再重新跑整条 CI。
- **包发布规则**：只有全部源码、候选、真正 Host 安装和相关测试通过之后，才能将 React 候选晋升到 `quick-notes-react.opendesk-tool.json` 并校验本次源码字节一致。单纯 Actions Artifact、内存 SDK 或失败 CI 都不构成正式发布。
- **公平性**：原生工具的 `main.js` 混合业务和 DOM，不能用 237 行代表纯领域逻辑；React 的 App、Model、Runtime 引用、构建文件也必须一同统计。开发投入目前没有独立记录工时，保持 `NOT_TESTED`；不预设任何一种技术必然适合普通开发者。

### 独立质量门槛的目前证据

| 维度 | 当前可审计结果 | 依据 |
| --- | --- | --- |
| 原版源码保护 | **98 / 100（仅源码保护）** | 原版五个 Blob 与 R2.1 相同；原版私人数据未访问 |
| React 功能等价 | `NOT_SCORED` | 预览 PASS，但正式 Host 及失败路径仍需完整验证 |
| React 19 / Shared UI 真实复用 | **95 / 100（仅构建集成）** | 真实构建、固定 Runtime、JS/CSS、打包器均检查通过 |
| 安装、数据与升级隔离 | `NOT_SCORED` | 真正安装 Host CI 尚失败；不可用源码静态身份代替 |
| 320–440px、200% 缩放及可访问性 | `NOT_SCORED` | 四档宽度无溢出；200% 和完整键盘/屏读尚未验收 |
| 技术比较方法公平性 | **96 / 100（方法及静态口径）** | 同源候选及公共资源单列；保留未测结果 |
| 资源及性能实证 | `NOT_SCORED` | 包体字节已实测，性能 P50/内存/五次采样未实测 |
| 测试复现与长期维护 | `NOT_SCORED` | CI 正在修复；仍需全绿和可重复运行记录 |

分数只覆盖括号标明的部分，不等同于对应完整产品维度的 95 分；任何未完成的完整维度必须保留 `NOT_SCORED`。正式 Mac Chrome 可安装、独立升级、卸载隔离、双窗口 ETag、200% 和资源中位数均保留 `NOT_TESTED`。
