# AI VIP Share R5.6 · PREVIEW-FIRST UI 实施记录

日期：2026-10-15。GitHub `main`。本轮用户先要求通过扩展目录下的 HTML 预览确认 UI 与交互，**不等同于 R5.5 Managed Proxy 原生网络闭环**。

## 文件范围和并行保护

- 已提交主预览：`examples/sidebar-tools/ai-vip-share/preview/index.html`，首个提交 `518f551a323b1240c01c336ca26023fe250cd645`。
- 本轮新增：`examples/sidebar-tools/ai-vip-share/preview/test-ui.mjs`、`examples/sidebar-tools/ai-vip-share/preview/README.zh-CN.md`、本记录。
- 历史 `preview/ai-vip-share-r4-preview.html` 和 `preview/test-r41.mjs` **原位保留**；不接触正式 `src/`、SDK Registry/Schema/Facade/Driver/Trusted Host、工具安装包或 `dist/development`。
- 无本地 Mac 项目访问；没有占用 7897/7898、Chrome Profile、dev watcher 或共享编译输出。提交仅针对各个本轮新增文件；不会覆盖其他 Agent 的文件。

## 产品规范

R4.2 会员优先、兑换激活不预设时长、外部 HTTPS 商品目录、AI 网站访问唯一直接启停按钮、STOP 独立于会员与 Provider、单个工具不得影响其他代理。新增时间/额度/功能权益、预检→本人确认/取消、兑换记录、回执未知恢复的 UI 状态。实验台控件位于模拟 Sidebar 界面之外。

原正式 UI 仍存在排序和启停多个按钮与预览差异：该问题留给后续产品源码迁移，并必须继续保留真实 Provider 失败关闭及公共 SDK 所有权。预览不得伪造商业授权、Chrome 控制权、7897 HTTP CONNECT 或代理网络成功。

## 证据层级

- `PREVIEW_SOURCE_READY`：已写入独立 HTML，静态语法/固定模型/关键视觉结构在提交前用 V8 快检。
- `NODE_TEST_NOT_RUN_LOCALLY`：已提供测试源文件，但当前环境没有本地仓库。需在 Mac 项目中运行 `node --test .../preview/test-r41.mjs .../preview/test-ui.mjs`。
- `SDK_NATIVE_NOT_TESTED`、`PROVIDER_BLOCKED`、`LOCAL_7897_7898_NOT_TESTED`：均不得标为 PASS。
- 下一步：实际打开预览审定 UI → 按对照增量迁入正式 `src/` → 修复 Proxy SDK/真实浏览器生命周期 → 正式包验证和原生 Chrome 验收。

本轮新增文件提交后释放写入范围。不占用或改写公共 SDK Owner 的文件。
