# 官方阅读目录 R4.1（悬浮交互 R4.2 / 智能概览 R4.3）

「阅读目录」是 OpenDesk Browser 内**可安装的 Side Panel 工具**，不是第二个 Chrome 扩展。UI 包继续使用 `opendesk.sidebar-tool.v1`；导入的经典 JS 只在 opaque sandbox 中运行，网页内容索引/滚动/浮动 TOC 则由扩展内置可信 Content Script 执行。

## 最快使用

1. 安装/加载 OpenDesk Browser 正式构建，打开一篇普通 HTTP(S) 文章。
2. 打开 Chrome Side Panel →「工具」→ 官方推荐「阅读目录」→「安装」。
3. 查看名称、版本、`page.toc` 能力和来源，再明确「确认安装」。**安装本身不会读取任何网站标题**。
4. 在已安装工具行点击圆形网站开关（◎），审阅当前网站精确 Origin 的 Chrome 确认提示并允许。
5. 网页右侧显示紧凑 `CONTENTS`。三个图标分别为**智能概览 / 当前章节 / 完整目录**；切换视图不滚正文，点击章节才跳转。
   - 智能概览：仅有 1–4 个顶层标题时，逐层补充子标题，争取展示至少 5 条；最多自动深入至第 4 个逻辑层级。5 个及以上顶层标题则保持顶层概览。
   - 补充产生的大纲太长时，自动保持约 12 条，并在各个顶层章节间分配子章节；点击「还有 N 个章节 · 查看完整目录」直接切换第三种视图。
   - 滚动高亮指向当前可见章节；当目标被概览折叠时，指向最近的可见父级，而非永远高亮唯一 H1。文章、无 H1 的 H2 文档和每个 AI 回答都按独立标题树处理。
   - 按住标题栏的六点手柄拖动目录，支持鼠标、触摸和笔；拖动目录项不会移动卡片。
   - 放到距左右边缘约 32 CSS px 以内，会吸附到距边缘 8 CSS px 的安全位置；放到中间则自由停留，不强制磁吸。
   - 拖动完成后会**自动按网站 Origin 记忆位置**。同一网站刷新、换文章或重启 Chrome 后恢复；不同网站独立，位置随视口大小自动调整以防离屏。
   - 标题栏圆形箭头为**归位**：恢复当前屏幕宽度对应的默认位置，同时清除此网站的位置记忆。
   - 键盘聚焦拖动手柄后，方向键移动 12 CSS px，Shift + 方向键移动 32 CSS px，Home 归位。
6. 从 Side Panel 工具列表「打开」还可以查看同一网页目录；关闭 Side Panel 不停止已启用的网页卡片。
7. 再次点击网站开关可停用当前网站。工具行「⋯」可以查看和**撤销此前批准的其他网站**，无需再次访问旧站点；卸载官方工具同时尝试清理网站授权、工具私有数据与 TOC 位置记忆。暂时停用网站不清除偏好；用户可随时「归位」单独清除当前站点的位置。

受控目录快照与点击定位接口为 `toc.snapshot` / `toc.navigate`；工具包不获取任意网页 DOM、`chrome.tabs`、远程代码注入或额外 Task 运行权限。

## 从本地工具包安装

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
```

可导入文件：`artifacts/sidebar-tools/reading-toc/1.0.2/reading-toc.opendesk-tool.json`。在「工具」→「＋ 导入」选择文件，审阅后确认安装。官方快捷安装和本地文件导入复用同一工具包校验、权限复核和持久安装记录。扩展内置资源 `src/sidebar-tools/reading-toc.opendesk-tool.json` 必须与打包器产物一致。

## 当前证据与边界

- 受控 Chrome for Testing 155 正式包、原生 Side Panel、官方快捷安装和本地 JSON 导入、精确 Origin 确认、H1–H6 多标题索引、关闭 Side Panel 后网页目录留存、站点撤销，均有自动化原生证据。
- 真实已登录 ChatGPT、真实知乎、多回答版本切换及用户 Mac 生产 Profile 尚未通过本轮原生验收；模拟 ChatGPT DOM 页面不等于真实站点通过。
- 具体候选 SHA、GitHub Actions、截图和 Mac 验收步骤见 `docs/framework/workstreams/reading-toc-r41-real-chrome-20261010.md`。不可无证据宣称 95/100 独立评分。

## R4.2 悬浮位置验收

自动回归：
```sh
node --test tests/environment/reading-toc-placement-r42.test.mjs tests/environment/reading-toc-r41.test.mjs tests/environment/reading-toc-lifecycle-r41.test.mjs
npm run check
npm run build
npm run verify
# 在隔离的 Chrome for Testing 中（不得使用日常 Profile）
xvfb-run -a node --test tests/framework/reading-toc-native-r41.test.mjs
```

手动检查：在已授权文章拖到左侧、拖到页面中间、刷新和重启浏览器验证记忆；同 Origin 不同文章保持位置，不同 Origin 不串位置；窄屏和浏览器缩放后目录仍可见；尝试手柄以外拖动应只执行正常章节交互；方向键移动并按 Home 归位；归位后刷新恢复默认。然后关闭 Side Panel、撤销网站权限、卸载工具，确认不留下页内 DOM 或可操作监听，其他工具不受影响。

R4.2 改动在可信 Content Script 的悬浮视图与位置存储；R4.3 将官方阅读目录工具包从 1.0.0 升级到 1.0.1；R4.4 因 Side Panel 自动来源跟随改动继续升级到 1.0.2，包格式与权限仍为 v1。已安装 1.0.0 的用户可以在 Side Panel 看到「更新」入口，审阅后确认升级，不会自动运行或扩权。新的位置存储键只包含 HTTP(S) Origin（不存完整 URL、标题或网页正文）。真实线上 ChatGPT／知乎、用户 Mac Chrome 以及极端缩放仍须按照证据等级单独验收；组件测试通过不等于真实网站通过。

## R4.3 智能概览专项测试

```sh
node --test tests/environment/reading-toc-overview-r43.test.mjs tests/environment/reading-toc-placement-r42.test.mjs tests/environment/reading-toc-r41.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
npm run check
npm run build && npm run verify
```

最重要的手工场景：单 H1 + 20 H2 的文章应出现多条导航与「查看完整目录」；5 个 H1 的页面应只显示 H1；只有 H2/H3 的文档仍应有实用的顶层/子层列表；有 2 个 H1 且有多个 H2 的 AI 回答应显示两种层级。多回答网页切换来源不串章节；三种视图保持正常点击定位和滚动高亮。具体候选证据见 `docs/framework/workstreams/reading-toc-r43-20261011.md`。

## R4.4：长文章当前位置与多回答自动跟随

- 在智能概览被限制为最多 12 条时，自动保留**当前阅读章节与附近章节**，同时保留各顶层章节、尽可能兼顾其他章节；不再始终高亮第一个 H1。深层正文则显示最近的可见父章节。
- ChatGPT / 知乎等多回答页面如果含多个来源，默认目录来源选择为「自动跟随 · 回答 N」，正文导航切到其他回答时，网页悬浮卡片和 Side Panel 目录一起切换。
- 如需查看此前回答，可从来源列表手动选择。手动选择后保持固定，不随正文变化自动跳转；重新选择「自动跟随」恢复跟随。
- 官方工具 v1.0.2 仍仅声明 `page.toc` 能力，不新增权限，升级须经现有 Side Panel 显式确认。此前安装 1.0.0 / 1.0.1 的用户可以使用「官方阅读目录 → 更新」。

受影响测试：
```sh
node --test tests/environment/reading-toc-overview-r43.test.mjs tests/environment/reading-toc-placement-r42.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/reading-toc
npm run build && npm run verify
```

受控 Chrome 测试新增了“单 H1 + 20 H2 阅读末尾仍在概览显示当前 H2”，以及从 AI 回答 1 导航到回答 2 后 Sidebar 默认自动跟随的断言。用户 Mac 与真实登录站点仍需独立检查。
