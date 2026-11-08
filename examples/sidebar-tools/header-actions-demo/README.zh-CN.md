# 可选页头插槽示例

专门演示框架右上角 `headerActions`，不修改 AI Proxy、ScrapyJS 等产品。示例为普通 HTML/JS Sidebar Tool，运行在原 opaque-origin iframe；能力列表为空，不使用网络、网页、存储、AI 或 Native API。实际接入代码只有 `src/main.js`，其余宿主页头仍由框架提供。

## 直接查看

仓库依赖已就绪时，在仓库根运行：

```sh
node examples/sidebar-tools/header-actions-demo/preview/serve.mjs
```

打开终端打印的本机 URL。服务只监听 `127.0.0.1`，端口自动分配；Ctrl+C 结束。不需要重建 Browser、安装示例或改变现有 watcher。修改源码后重启该演示服务即可。

这个入口复用当前源码的真实 ToolHost、React 菜单、Host 校验及 sandbox Bridge；安装记录由内存适配器提供，全部真实浏览器服务关闭。它是 **SOURCE_FIXTURE_ONLY**，不证明已安装 Browser 的版本或真实安装通过。`preview/` 不进入工具配置的执行文件。

## 怎样判断正常

| 操作 | 应看到的结果 |
| --- | --- |
| 打开示例 | 首页有「本次实例」；宿主右上角出现 More，计数为 0 |
| More → 打开资料库 | 页面变为资料库，「收到右上角动作」加 1，回传记录含 `library`；实例标识不变 |
| 宿主左侧返回 | 回到首页，「收到宿主返回」加 1，实例标识及前次计数保留 |
| 首页取消「使用右上角插槽」 | 新 More 消失，工具继续可用；点击「打开资料库（内容入口）」仍可进入并返回 |

勾选开关或页面上显示「已提交」只证明示例提交了快照。**实际 More 出现、真实点击有回传、正确页面返回、实例不变**，才构成这条核心链的可见结果。只有内容按钮可用而没有 Header 回传时，不应宣称插槽运行通过。

在旧 Bridge、增强关闭或快照拒绝时，示例提交原导航 base，保留内容入口；原导航也不可用时显示自己的返回。不需要让任何业务扩展接入才能使用本示例。

2026-11-08 已用 ego 执行上述核心链及关闭插槽后的内容入口往返：Header 回传 1 次、宿主返回 2 次，实例标识保持一致。结果仅限这个源码演示；没有执行缩放、布局矩阵或安装验收。

## 放进实际 Browser

这是独立源码示例，当前未交付正式可导入 JSON，也没有自动安装、晋升、Catalog 或 Browser 改动。若要检查已安装 Browser，使用原打包/审阅安装流程，再执行上面同一条操作链。普通只读预览可能不提供宿主页头控制，不能把“只读预览没有 More”当成安装态缺陷，也不要为演示放宽其权限。

接口、动作限制和生命周期只以[唯一导航合同](../../../docs/architecture/sidebar-tool-navigation-contract-r1.zh-CN.md#r14--可选-header-动作完整快照)及[公开 API](../../../docs/api/sidebar-tools.zh-CN.md#r14-headeractions-可选接入示例)为准。
