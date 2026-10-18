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
