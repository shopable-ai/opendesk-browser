# OpenDesk Prompt Shortcuts R2.11 · 广告实验室真实交付与验收边界

> 2026-10-19。**仅修改 preview/**。这份报告区分：GitHub 源码核查、独立会话演示浏览器实测、正式 GitHub HTML 的 Node/Chromium 实测。绝不将三者混用。

## 一、已完成的代码修复（真实 main 提交）

- `brand-ad-lab-r28.js`：删除与 `closedRail` 重复的 `closeRail` 布尔状态；B03/B04/B05 才出现赞助按钮；仅 S 类所选侧边栏位置展示广告库存，选择 B/N/C 不再附带 S02 广告；S01/S02/S08 独立库存，每张卡拥有关闭入口，移除一个按钮批量关闭三卡的歧义操作。
- `brand-ad-lab-r28.js`：实际广告保留完整 `data-layout` ID，不再把 hero/affiliate/self/recruit 等视觉形式隐式转换为 landscape；B02/B04 位置选择会尝试展示相应悬浮介绍；IME 合成期间遇到场景切换，不立即移动输入框，组合结束后才应用场景。
- `brand-ad-lab-r28.css`：针对 hero、vertical、recruit、self、event、directory、affiliate、brand-attribution、brand-logo 等形式补齐正式模拟区域样式；迷你与主次大卡在窄屏收为单列。
- `brand-ad-lab-r29.test.mjs`：纠正旧 `closeRail` 与旧 `state.formMode='edit'` 的过期断言，不跳过真实性检查。
- `brand-ad-lab.html`：原型可见副标题更新为 R2.11；保留 R2.10 版本继承信息。
- `brand-ad-lab-r211.test.mjs`：新增与旧三套测试并行的可执行 Node 和真实 Playwright/Chromium 回归断言。设置 `BRAND_AD_LAB_REQUIRE_BROWSER=1` 时浏览器不可用会失败而非以 SKIP 计入通过。

## 二、测试实际证据（不混淆）

| 验收 | 当前判定 | 事实 |
| --- | --- | --- |
| 直接读取 GitHub 最新 main 源码 | PASS | 17 个 `formats`、35 个 `positions`，无 `closeRail` 冗余；所有修改位于 preview/ |
| V8 解析正式 R2.7 / R2.8 / R2.9 三段 JS | PASS | 3/3 语法校验 |
| `node --test` 仓库版 R2.8/R2.9/R2.10/R2.11 | NOT_TESTED | 当前执行容器未挂载仓库，无法通过 GitHub 文件连接直接调用 Node |
| 原始 `brand-ad-lab.html` 真实 Chromium | NOT_TESTED | 与上述相同；无正式预览启动与真实截图 |
| 独立的**会话 HTML 演示** Playwright Chromium | PASS（仅演示） | 实测 55 个断言 55 PASS / 0 FAIL；6 张演示截图；与 GitHub 原始 HTML 不同 |
| GitHub Actions Run 39162680082 | FAIL（历史） | 正式 Trusted provenance SHA 断言与现存 `trusted/page.js` Blob 不一致，预览范围以外 |
| 新提交触发后的当前 CI | NOT_TESTED | 未获得已完成且可核查的最新 CI Run 证据 |

**历史 CI 精确故障：** `tests/environment/prompt-shortcuts-r14.test.mjs:129` 期望 `9da4a08e66ecb0bb147b4f75ecbfa400a7300df6`，实际 `ad5e3bb10a0af62629db5bd0da474b71f1ae4ed4`。`model.js` 与 `policy.js` 的固定 Blob 校验正常。属于 **OUT_OF_SCOPE_BLOCKER**；正式可信模块若确实已重新审核，须另开**范围合法**的安全审计变更，不能仅改期望 SHA、删掉测试或在本轮越界修改。

## 三、17 种与 35 位置当前覆盖状态

- 17 种：`brand-logo` / `brand-hover` / `brand-attribution`；`icon` / `text` / `icon-text` / `hover-card` / `expand-card`；`landscape` / `vertical` / `mini` / `hero`；`recruit` / `self` / `event` / `directory` / `affiliate`。均有源码注册。浏览器视觉区分逐项 **NOT_TESTED（正式 HTML）**。
- 位置 B01–B08（8）、S01–S08（8）、N01–N12（12）、C01–C07（7）：35 个唯一编号及源码定位规则 **PASS（静态）**；每个位置的 DOM 实际可见性、键盘、关闭恢复、窄屏避让 **NOT_TESTED（正式 HTML）**。
- 重点：`N03`/`N04` 模拟输入区，`N05`/`N08` 窄屏侧区，`C06` 消息间是高/极高 UX 风险。N/C 全部仅存在于虚构网页原型，不发布注入功能；`C06` **极高风险、不建议上线**。
- 旧 R2.7 A1–A10 入口保留，完整浏览器兼容流程 **NOT_TESTED**。
- 六种截图 **正式 HTML = 0 张 PASS**；新增自动截图代码将在 Chromium 实际通过后产生 `preview/artifacts/r211-[1-6]-[preset].png`。已产生的六张是另一个会话 HTML 演示，不可称作正式交付证据。

## 四、Chrome Web Store/产品边界

A. 自有侧边栏广告（S）：只可继续隐私、用户体验、审核评审；本原型不代表可直接发布。
B. 固定品牌标识/官方推广（B）：可专项评审，必须与外部网站身份区别。
C. 扩展层覆盖第三方网页（N/C 中可能形成的覆盖效果）：如未来考虑实现，必须独立进行政策、安全及用户干扰专项审核。本轮**不实现**。
D. 第三方网页广告内容注入/替换：本轮**禁止实现**；所有 N/C 只能虚构模拟。
没有联盟跳转、用户追踪、广告服务器、Cookie 或真实用户数据。

评审以官方 Chrome Web Store Developer Program Policies、Quality Guidelines、Affiliate Ads 指南为准；代码通过测试不代表政策获批。

## 五、12 维独立判定

| 维度 | 当前结果 | 能否实测评分 ≥95 |
| --- | --- | --- |
| 1. 17 形式 | 源码数量 PASS；正式交互 NOT_TESTED | 否 |
| 2. 35 位置 | 唯一性 PASS；逐点 DOM NOT_TESTED | 否 |
| 3. 品牌 / 提示词 UX | 已修复部分关闭隔离；真机未测 | 否 |
| 4. 库存 | 已隔离显示与关闭；正式浏览器未测 | 否 |
| 5. 虚构网页交互 | 独立演示通过；正式未测 | 否 |
| 6. 提示词保护 | 新增 IME 保护；正式输入实测未进行 | 否 |
| 7. 响应式 | CSS 更新；正式 320px/200% 未测 | 否 |
| 8. 键盘 / 触屏 / 无障碍 | 原生元素在代码中；实机未测 | 否 |
| 9. 三语 / 主题 | 保留三语元数据；正式浏览器未测 | 否 |
| 10. 关闭 / 状态一致性 | 单一 `closedRail` 修复；正式浏览器未测 | 否 |
| 11. 架构隔离 / 政策 | preview 范围与离线条件源码检查 PASS；政策需人工审核 | 否 |
| 12. 真实测试 / 证据 | 会话 demo Chromium PASS，GitHub 原始 HTML NOT_TESTED | 否 |

**不给无证据的 95+ 数字。** P0 Chromium 关闭、IME、表单、草稿和滚动验收完成前，不得宣布正式 R2.11 PASS。

## 六、Mac 最终验收 / CI 真实运行指令

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git switch main && git pull --ff-only
node --test \
  examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r28.test.mjs \
  examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r29.test.mjs \
  examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r210.test.mjs \
  examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r211.test.mjs
# 必须在真实 Playwright Chromium 已安装环境再跑；不可把 SKIP 记为 PASS：
BRAND_AD_LAB_REQUIRE_BROWSER=1 node --test \
  examples/sidebar-tools/prompt-shortcuts/preview/brand-ad-lab-r211.test.mjs
```

正式 HTML 每个位置要完成唯一高亮、广告独立关闭/恢复、0–3 库存、语言主题持久、输入及滚动保护、C06 仅风险模拟；截图六种预设与全部关闭状态都需实际保存、审阅。Mac 原生 IME、触屏和 200% 缩放还需要额外人工/真实自动化覆盖。**当前回归文件与静态通过不能替代上述真实运行。**
