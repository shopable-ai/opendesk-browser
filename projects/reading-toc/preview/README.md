# Reading TOC · 唯一交互预览

当前唯一 HTML 入口为 [index.html](index.html)。它由原 [预览生成器](../../../scripts/preview/build-preview.mjs) 生成，使用 `projects/reading-toc/src/` 的工具 UI 和 `projects/reading-toc/trusted/` 的真实浮层源码，SDK、网页文章及权限数据为离线模拟。

## 使用与更新

打开 `index.html` 后，在外部预览控制区切换：

- Side Panel / 网页悬浮目录。
- 简体中文 / English / 日本語。
- 普通文章 / ChatGPT 多回答，以及空目录、加载、读取错误、无权限等状态。

同一入口即可查看两种展示面和四种真实目录模式，无需另存侧栏、多回答或带版本号的 HTML。

源码变化后，在仓库根使用已有依赖重新生成：

```sh
node scripts/preview/build-preview.mjs --tool reading-toc --surface page-overlay --scenario success --theme light --width 360 --height 760 --out projects/reading-toc/preview/index.html
```

不要手改生成后的 HTML。输出内嵌 manifest 的 UI、可信浮层源码及共享外壳摘要用于核对来源；同时生成的 `index.context.json` 是本机审阅辅助文件，不是第二个页面入口。定向来源、语言消息、隔离和多回答回归：

```sh
node --test tests/environment/reading-toc-localization-preview-r12.test.mjs tests/environment/reading-toc-multi-answer-r183.test.mjs
```

[原 Chromium 驱动](../../../tests/framework/reading-toc-preview-r14-native.test.mjs) 也只打开同一 `index.html`，通过控制区切换展示面。离线来源/交互检查和真实 Chrome 安装、网站索引、导航、权限验收分别记录；没有同候选原生证据时不声明 `NATIVE_PASS`。

## 已清理的旧页面（2026-10-31）

| 旧页面 | 清理原因 |
| --- | --- |
| `reading-toc-r12-overlay-preview.html` | 与旧主入口字节相同，属于重复副本。 |
| `reading-toc-r12-interactive-preview.html` | 侧栏可在唯一入口切换，旧快照的浮层摘要已经过期。 |
| `reading-toc-r17-ai-desktop-preview.html` | 已迁入正式实现的历史手写设计稿，不再保留为当前可打开页面。 |
| `reading-toc-r183-chatgpt-multi-preview.html` | 独立手写交互模拟；多回答回归改用真实源码生成的场景。 |
| `reading-toc-r183-source-panel-preview.html`、`reading-toc-r183-source-overlay-preview.html` | 仍绑定 1.0.8 的旧快照；两种展示面和多回答均由唯一入口覆盖。 |

R23 设计 HTML 在清理开始前已不存在；其孤立 manifest 和专用旧生成器也已移除。测试和 CI 不再生成、提交或读取上述旧页面。历史设计、原批准身份与旧成绩保留在 Git 和原始证据中，不以新增 archive 副本延续多个入口。

需要追溯时，清理前提交为 `d2f89afe4d74143ef6e16fe1124d19dec75bbcb0`；旧文件位于该提交的 `projects/reading-toc/preview/`。R23 的实际语言修复及原生证据见 [历史记录](../../../docs/framework/workstreams/locale-ux-r23.md)，不因页面清理改写历史验证结果。
