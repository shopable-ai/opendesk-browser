# Prompt Shortcuts R2.10 · 真实交付与证据边界

## 目标与作用域
- 仅变更 `examples/sidebar-tools/prompt-shortcuts/preview/` 中的离线 HTML/CSS/JS/测试及预览入口。
- 继承 R2.9 的 17 个形式、B01–B08/S01–S08/N01–N12/C01–C07 的 35 个位置和 R2.7 A1–A10 兼容界面。
- 本轮所有素材为虚构品牌；没有真实广告服务器、远程请求、跟踪、Cookie、SDK/Host 权限、真实网页注入。
- `main` 有其他 Agent 并行提交。每次写入均基于目标文件当时的 Git blob SHA，不覆盖其他文件。

## P0 已修改的实际源码
- `brand-ad-lab-r28.js`：逐位置 rail / panel / web / tip 关闭与恢复；S04–S07 单独关闭；关掉广告不影响 OD Logo；没有售出广告时普通用户不展示招商占位；新建/编辑模式独立，保存和取消复用 R2.7 模拟流程。
- 虚构聊天场景 DOM 在同一 scene 下复用，不因广告重绘拆除 textarea 或滚动容器；热点更新前移除旧关闭按钮，避免叠加和重复状态。
- 浮层不再每次重绘后强制重新打开；Escape 关闭和详情对话框焦点返回有所修复。N05/N07/N08/N11/N12/C01/C02/C06 等高风险窄屏位置抑制广告正文，保留可选标记。
- `brand-ad-lab-r29.js/.css`：图鉴差异化 CSS 与标记，Hover/Focus 弹出示意、点击详情和 Touch 点击替代；选择位置后定位模拟 DOM 锚点。元数据依旧独立于渲染。
- `brand-ad-lab-r28.css`：独立关闭按钮、表单卡片、窄屏抑制、Hover/展开/目录等样式。
- `brand-ad-lab.html` / `index.html`：R2.10 标题和入口。

## 实际进行的检查
- 通过 GitHub 文件读取连接，执行 V8 JavaScript 语法与源代码不变量检查 **8/8 PASS**：旧脚本语法、17/35 注册唯一性、禁止的网络与 SDK 调用、关闭状态、DOM 复用、测试和版本链接。
- **未执行** `node --test ...r28.test.mjs ...r29.test.mjs ...r210.test.mjs`：当前代码读取在 GitHub 连接中完成，执行容器没有仓库挂载；不能冒充 Node PASS。
- **未执行** Playwright/Chromium：可执行环境没有仓库文件和 Playwright/浏览器安装，本轮新增的 browser tests 均属于待验收测试代码，不是验收结果。
- 已创建 `brand-ad-lab-r210.test.mjs`：真实 Chromium 可用时核查 35 锚点/关闭恢复、17 形式与对话框、S04/S05 保存、焦点/IME/滚动、六布局截图、库存、语言主题与窄屏。
- 六张截图仅在 Chromium 测试实际执行成功时产生于 `preview/artifacts/r210-*.png`，目前**无截图 PASS 证据**。
- GitHub Actions Prompt Shortcuts R1.5 workflow 是现有正式包/早期预览构建工作流，**不等于** R2.10 的 35/17 专项浏览器验收。

## 本地 Mac 验收命令
```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git switch main && git pull --ff-only
node --test examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r28.test.mjs examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r29.test.mjs examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r210.test.mjs
```
如 Playwright/Chromium 缺失，浏览器子测试会 **SKIP = NOT_TESTED**；须在本地有真实运行环境后才能复验，不可将 SKIP 计作 PASS。

## 三种可进一步商业评审的自有 UI 组合
1. B01/B02 品牌来源 + S01 单卡；目的明确，提示词列表仍优先。
2. B01 常驻 + B03 独立关闭的极简赞助；须验证快捷按钮误触与广告标识。
3. B01 品牌 + S02 已售 0–3 张侧栏卡片；普通用户不出现未售占位，招商模式可展示空位。

## 不能宣称正式安全上线
- A：自有侧栏广告可开展独立的质量、披露、移除体验评审，并非自动获批。
- B：自有品牌/官方自推不计第三方赞助库存；仍不得欺骗用户。
- C：第三方网页旁的扩展覆盖层需要专项评估来源标识、不遮挡网站功能、不可模仿原生广告及内容。
- D：第三方网页内容插入广告本轮禁止。N/C 全部仅本地虚构网页实验，其中 C06 是 **critical**，N03/N04/N05/N08 亦属较高风险，不建议正式实施。
- 官方政策：Ads https://developer.chrome.com/docs/webstore/program-policies/ads ; Quality Guidelines https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines ; Affiliate Ads https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads 。联盟示意不产生链接、Cookie、重定向或归因。

## 当前质量状态
- **无资格宣布任一维度已经“实测 95+”**；代码差异化与静态语法检查不足以独立验证真实 UX、键盘、触屏、200% 缩放、跨场景遮挡。
- 待验收 P0：真实 Chromium 全部关闭路径、S04/S05 表单保存/取消、IME 组合输入、原始 R2.7 A1–A10、语言主题切换后的焦点。
- 待验收 P1/P2：17 形态每一项互动与 35 位置逐点 screenshot/DOM/actionability 证据，尤其 N03/N04/N05/N08/C06。
- 待验收 P3：320/360/400/440px、200% 缩放、六布局图及六张截图、普通/招商库存、真实页面 JavaScript 错误。
- 待验收 P4：CI 本轮提交结果和 macOS Chrome 上的实际表现；若失败先修复，不得伪报 PASS。
