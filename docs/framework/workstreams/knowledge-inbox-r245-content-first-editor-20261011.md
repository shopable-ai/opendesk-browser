# Knowledge Inbox R24.5 — 正文优先编辑器（2026-10-11）

## 需求与实际问题

用户反馈详情页编辑区域上方被非正文信息占据大量空间，造成侧栏内书写不便。核查 v1.2.0 原 HTML 后确认：

- 阅读标题、阅读标签、日期和整排工具栏在编辑态保留可见；
- 编辑区又依次展示说明、标题、分类/标签、备注，最后才放 Markdown 正文；
- 新建知识也有头部说明和分类/标签/备注提前展示，导致主要创作区下移；
- 取消编辑后隐藏表单不复原字段，再次点击编辑可能重新看到刚被放弃的文本（状态污染）。

## 本轮解决方案

功能全部复用现有 **官方 `knowledge-inbox` 沙箱工具**、可信知识服务、存储键、能力白名单和包资源生成器，不开发新编辑器/数据库/RPC。

1. **编辑态收敛主界面**：单行「返回 / 编辑知识」，紧凑标题输入紧邻 Markdown 正文；重复标题、日期、分类展示、复制/导出/删除工具栏和原始问答折叠栏只在阅读态可见。
2. **低频信息后置折叠**：分类、标签、备注放到正文后 `details`，默认关闭，摘要显示当前分类、已填标签数和备注；展开为真实原生控件，关闭不清除输入。
3. **保存/取消**：保留 dirty/busy 状态、Cmd/Ctrl+S、原始 Markdown 不变、乐观版本冲突保护。底部提供明确的取消与保存。返回或退出时仍校验未保存修改；确定放弃后，重新进入编辑时从当前 `selected` 记录重新填充所有字段。
4. **新建采用同一信息顺序**：顶部不重复陈列说明，标题/正文先行，次要信息可选折叠，原字节计数、容量限制和写入确认逻辑不变。
5. **阅读态仅紧凑化**：略缩小标题、标签与工具栏间距，保留原操作入口与焦点语义；不移动删除权限边界，也不添加编辑快照存储。
6. **设计系统与浏览器行为**：全部 CSS 限定 `.ki`，沿用明暗主题令牌、`:focus-visible`、键盘 `details/summary`；单列窄屏不横溢。正文 textarea 在默认窗口自适应为约 54vh，兼顾高频书写与原生可调整高度。

## 文件变更

- `examples/sidebar-tools/knowledge-inbox/src/index.html`：重排阅读/编辑/新建层级。
- `examples/sidebar-tools/knowledge-inbox/src/style.css`：紧凑头部、较大 textarea、可折叠次级信息、响应式动作栏。
- `examples/sidebar-tools/knowledge-inbox/src/main.js`：切换编辑态时隐藏阅读视图冗余结构、重置持久化字段、更新元信息摘要与取消逻辑。
- `examples/sidebar-tools/knowledge-inbox/tool.config.json`：版本更新为 1.2.1；官方发布包仍由既有脚本生成。
- `tests/environment/knowledge-inbox-r24-ui.test.mjs`：信息排序、折叠默认态、逃逸保护及单列规则。
- `tests/framework/knowledge-inbox-native-r1.test.mjs`：真实扩展 UI 验证首屏正文、折叠标签编辑、取消重进、读态恢复以及截图。
- `docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md`：用户使用说明。

## 验收条件与证据级别

- [ ] `npm run check`
- [ ] `node --check examples/sidebar-tools/knowledge-inbox/src/main.js`
- [ ] `node --test tests/environment/knowledge-inbox-r24-ui.test.mjs tests/environment/knowledge-inbox-r1.test.mjs tests/environment/sidebar-tools-host.test.mjs`
- [ ] `npm run build && npm run build:dev && npm run verify`
- [ ] `tests/framework/knowledge-inbox-native-r1.test.mjs` 对最终包实测：进入编辑后正文顶端早于 230px、默认折叠元数据、草稿保存、取消不覆盖旧修订号、新建、删除和撤权。
- [ ] 360/400/600/1000 宽度、浅色/深色截屏、焦点及无横溢量化证据，严格绑定候选 SHA。
- [ ] 用户 Mac 原生 Chrome、200% 缩放、真实线上 ChatGPT、Native 文件保存依然需要独立验证。

### 既有构建预算阻塞

在前序 R24.4 的确切代码候选，CI 已报告 `sw.js 330248 > 327680` 字节，且其父提交也有同数值超限。该共享框架预算与本次布局修改无关，但如果仍存在，将阻断新包原生验收。**不为 UI 改动放宽预算、不伪造 Chromium PASS**。实际运行后的结果和失败项要补在本文件，静态断言通过不等于 95+ 的真实视觉/可用性实测。
