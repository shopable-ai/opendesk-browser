# Knowledge Inbox R24.6：编辑体验质量提升与独立评分

日期：2026-10-11；目标仓库：`shopable-ai/opendesk-browser`，默认 `main`。

## 本轮目标

对既有官方「知识收件箱」R24.5 的“正文优先”设计做小范围收敛，**不重建编辑器、数据模型、权限系统或 UI 设计体系**。用户要求各维度尽量达到 95 分以上，但评分不替代真实 Chromium 和用户 Mac 验收。

## 最新源码审查发现的缺口

- 阅读详情页的「结构导图」与复制、编辑、删除并列，会在窄 Side Panel 产生更多换行和正文前占用。
- v1.2.1 编辑表单仅依据 `dirty` 判断保存按钮；标题为空、正文为空或超过 150,000 字节、标签超过 12 个或单标签超过 30 字时，用户可能点了保存后才收到后台拒绝。
- 新建表单只验证标题/正文非空及字节长度，没有提前反馈标签非法的问题。已有扩展可信 Service 的数据校验是正确的安全底线，应由 UI 提前展示同一规则。
- 编辑稿接近 150,000 字节上限时未提示；超限后再次点击保存反复失败影响使用。

## R24.6 增量变化

- 继续保留第一行返回、紧凑标题、Markdown 正文优先，分类标签备注放在正文后面并默认折叠。
- 阅读模式保留复制、编辑、**可见删除**；低频「结构导图」并入已有「更多」菜单，与 Markdown 下载、工作区、来源保持同一二级操作位置。
- 增加输入即时校验：空标题、空正文、超大正文、标签数量和单标签长度；读写仍以可信 SW 校验为最终准绳。
- 两个保存按钮只在有合法输入时可用；字段变为非法时在正文下显示简短错误，`aria-invalid` 同步设置。二级 metadata 非法时边框、摘要明确提示。成功校正后即时恢复保存能力。
- 新建时必填字段错误不在初始空页面反复显示，仅在合理触及或填入内容后提示；编辑模式在输入无效时直接提示。
- 编辑稿默认不占用空间显示字节计数，仅在超过 85% 上限时显示；超限时提高强调度。
- 不增加原生浏览器 `alert/confirm`，不引入远程代码、新权限、同步服务、批量危险操作。

## 改动范围

- `examples/sidebar-tools/knowledge-inbox/src/{index.html,style.css,main.js}`
- `examples/sidebar-tools/knowledge-inbox/tool.config.json`（`1.2.2`）
- `tests/environment/knowledge-inbox-r24-ui.test.mjs`（静态合同与按钮门禁）
- `tests/framework/knowledge-inbox-native-r1.test.mjs`（通过真实输入先输 13 个标签，确认禁止保存、准确提示、改回 2 个标签后恢复）
- `docs/product/chatgpt-knowledge-inbox-r1.zh-CN.md`

## 初步逐项评分（源码审查，不是实测）

| 独立维度 | 当前暂评 | 要达到 95+ 所需证据 |
| --- | ---: | --- |
| 信息架构/正文优先 | 93 | Chrome 360/400 宽度下首屏正文可见，实际截图对比 |
| 视觉层级/审美 | 90 | 亮暗双主题、窄屏、200% 缩放；字距、对比度和无横溢 |
| 操作便捷性 | 89 | 新建/编辑/保存/取消/删除路径真实操作及点击量审计 |
| 键盘/无障碍 | 87 | 全 Tab、Enter、Escape、aria 状态、焦点返回与读屏 |
| 数据安全和保存 | 93 | 配额、冲突、撤权、反复输入、重启、备份恢复边界 |
| 响应式适配 | 90 | 360/400/600/1000 多宽度实测与系统缩放 |
| 构建/发行就绪 | 78 | 同一 SHA 完整 build、verify、CFT、用户 Mac 验收 |

各项不是等权平均或自动评分，本轮目标是把界面实用性、验证完整性显著提高，但在实际测试未完成之前**不得写为 95 分以上已验收**。

## 验收

- [ ] `npm run check`
- [ ] `node --check examples/sidebar-tools/knowledge-inbox/src/main.js`
- [ ] `node --test tests/environment/knowledge-inbox-r24-ui.test.mjs tests/environment/knowledge-inbox-r1.test.mjs tests/environment/sidebar-tools-host.test.mjs`
- [ ] `npm run build && npm run build:dev && npm run verify`
- [ ] `node --test tests/framework/knowledge-inbox-native-r1.test.mjs` 真实 CFT，保存、取消、撤权、13 标签错误、修正后恢复、结构导图二级入口
- [ ] 用户 Mac Chrome 与 200% 缩放、明暗对比度、系统剪贴板/Native 真实落盘独立验收

保留此前 R24.5 的原始失败：构建包体已生成，但当时的安全扫描器在 `libs/packages/crypto-js.js` 上拒绝动态构造函数引用。后续主干的其他任务可能已修复，必须针对本次提交确认新 CI，而不能借用更早的成功结果。

## 本轮记录

代码变更和新增测试只代表实现；待 CI 返回后在此追加对应的工作流链接、候选 SHA、测试数、FAIL、NOT_TESTED 和最终判断。
