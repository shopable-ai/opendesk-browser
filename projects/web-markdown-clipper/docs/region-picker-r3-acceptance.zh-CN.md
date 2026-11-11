# 网页剪藏 R3 · 区域点选剩余修复与发布/Chrome 最终验收（未完成）

- 任务 ID：`OD-WEB-MARKDOWN-CLIPPER-REGION-PICK-R3-CLOSURE`
- 继承：`OD-WEB-MARKDOWN-CLIPPER-REGION-PICK-R2`
- 唯一开发分支：`main`
- 记录日期：2026-11-12
- **验收结论：PARTIAL；SOURCE_FIX_COMMITTED / APP_CI_REGISTERED / LOCAL_NODE_NOT_TESTED / RELEASE_NOT_PROMOTED / CHROME_NOT_TESTED。**
- 本文为 R3 增量审计；R2 原始证据仍见 `region-picker-r2-acceptance.zh-CN.md`。严禁把 GitHub 提交、V8 模拟、预览或 CI queued 误记为本地或真实 Chrome PASS。

## 一、原始产品目标（不得漂移）

ChatGPT、Claude、Gemini 等网页的单条长回答可能跨几十屏。用户在「网页剪藏 → 区域 → 点选网页区域」中直接点击所需回答 DOM 容器，立即把当前已加载内容转换成 Markdown 并回填原侧栏，无需拖拽选区或二次点击转换。沿用复制、下载 `.md` 和「我的摘录」保存/重开读回。原文章、选区、引用、链接模式，工具 ID、站点授权、存储命名空间及同 ID 升级完全保留。不保证跨源 iframe 或虚拟化未加载 DOM 的内容。

R2 基线 GitHub SHA `f85e9d17a5789771e637465fcc2f70c72ef85fe8`；R3 开始时 GitHub `main` 与该 SHA **完全相同（0 新增提交）**，故没有重复开发 R2。

## 二、本轮实际修复及来源证据

1. `eb3eefc3f1b7584b68b9675b5da60976f5a649be` — 修复 `trusted/region-picker.js` 中 `regionCandidates()` 的未声明 `previous=length`：源码是 ES Module 严格模式，候选命中时赋值未声明变量将抛 `ReferenceError`。差量只删除无用途赋值，保留 `result.push(node)`。既有 `tests/region-picker.test.mjs` 的“候选包含单条 article”即覆盖该路径，但**尚未在 Node 实际复跑**。
2. `f469c1f832c959faba4f6791a8509918aafc542c` — 将 `projects/web-markdown-clipper/tests/region-picker.test.mjs` 纳入 `projects/web-markdown-clipper/app.ci.json` 的正式 Node 测试列表，避免只运行旧 `ui.test.mjs` 而遗漏新功能。
3. 审计 `tool.config.json`：工具 ID 仍为 `web-markdown-clipper`，版本仍为 **1.2.10**；尚无本轮候选包、SHA256、晋升回执或 Chrome 读回证据。**禁止宣布 R3 已发布。**

### 可用性与限制的真实回执

- GitHub 连接器：可读取 `main`、R2 文档、代码、CI 配置并实际提交上述两项修复。
- 本机 CodexPro 工作区：连接器返回 `UNAVAILABLE / Connection failed`，无法取得工作区状态或执行 Node。
- OpenDesk Desktop Mac96：返回 `429 / UNAVAILABLE`，无法访问真实 Chrome 与本机发布目录。
- 隔离容器：有 Node v22.16.0，但无本仓库文件且不能解析 `github.com`，无法在该容器对完整仓库执行 Node/构建；不能假装为用户本机。
- GitHub Actions：针对当前代码的 App CI、Markdown tools、Preview 等作业在核查时均为 `queued`，不是 PASS；后续必须按 **最终 HEAD** 再查询。
- 因无完整仓库/浏览器，本次不执行真实测试、打包或本机安装；下表退出码统一为 `N/A`，不是 0。

## 三、R3 测试与验收账本

| 任务 | 命令或场景 | 状态 | 实测退出码/证据 |
| --- | --- | --- | --- |
| T01 GitHub main/R2 差异 | compare R2 SHA → main | PASS（开始时 identical） | GitHub 比较结果 |
| T02 区域测试 | `node --test projects/web-markdown-clipper/tests/*.test.mjs` | BLOCKED / NOT_TESTED | N/A |
| T02 Host 相关 | `node --test tests/environment/markdown-tools-r22.test.mjs tests/environment/sidebar-tools-host.test.mjs` | BLOCKED / NOT_TESTED | N/A |
| T02 工程构建 | `npm run build` | BLOCKED / NOT_TESTED | N/A |
| T02 App CI | `APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan`，随后 inspect/build/node/browser/native 按实际能力 | QUEUED / NOT_TESTED | 无完成回执 |
| T03 React 同源预览 | `node scripts/preview/build-sidebar-six-react-preview.mjs` 与真实 Chromium 点击矩阵 | BLOCKED / NOT_TESTED | N/A，尚无截图 |
| T04 Host/Content | 授权/撤权、导航、取消、层级、跨 Provider、iframe、虚拟化、150KB、流式快照 | BLOCKED / NOT_TESTED | 无 Host/DOM 回执 |
| T05 候选、晋升 | 源测试→新版本→候选→校验→`--promote-from`→`--check-project` | BLOCKED / NOT_TESTED | 仍 1.2.10，无 R3 包 SHA256 |
| T06 真实 Chrome | 安装同 ID 更新→单条回答→Markdown→复制/下载/保存→关闭重开读回→旧摘录保留 | BLOCKED / NOT_TESTED | 无 Chrome 证据 |

**发布顺序不可倒置**：测试修复通过以后才提高 `tool.config.json` 版本号，构建版本化候选并核验；只有候选通过以后才晋升到 `projects/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json`。不能靠覆盖同版本旧包绕过校验；不能先卸载造成数据损失。正式生成器源码确认存在 `--out`、`--promote-from`、`--check-project` 和必须较旧已发行包严格更高的版本门禁。

## 四、下一执行者的最小有效动作

在真实 Mac 完整仓库工作区，首先执行 `git switch main`、`git pull --ff-only`、`git status --short`、`git rev-parse HEAD`，记录本地未提交改动并按当前 `main` 复核差异；不要覆盖并行执行者内容。按顺序：

```bash
node --test projects/web-markdown-clipper/tests/*.test.mjs
node --test tests/environment/markdown-tools-r22.test.mjs tests/environment/sidebar-tools-host.test.mjs
APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan
node scripts/app-ci.mjs inspect web-markdown-clipper
node scripts/preview/build-sidebar-six-react-preview.mjs
npm run build
```

全部修复并实际 PASS 后，可按仓库既有流程及当前 app-ci 配置执行 build/node/browser/native。若使用真实 `CHROME_BIN`，仍要明确区分 headless 浏览器自动化与真实用户 Chrome **同 ID 安装/升级/读回**。相关脚本：`scripts/tests/clipper-react-preview-interaction.mjs` 支持 `--core-navigation`；正式候选构建器为 `scripts/build-sidebar-tool.mjs`。不能将旧 `1.2.10` 的 `--check-project` 预期差异当作“新包测试通过”。

浏览器手动/自动验收矩阵：ChatGPT/Claude/Gemini 单条与多轮不混入、鼠标与键盘层级（↑/↓、Enter、Esc）、点击链接不跳转、取消后 overlay/listener 清理、页面切换/旧回执、撤权立即停止、流式当前快照、代码/表格/公式/链接/长文本、超限明确拒绝、320/360/400/440px 和浅/深色、复制/下载逐字节一致、保存→关闭重开校验正文哈希、原地升级保留旧摘录。虚拟化和 iframe 必须明确写能力边界，不能虚报完整读取。

如所有节点有证据 PASS：提高版本号，构建候选，测试，同 ID 晋升，`--check-project`，记录包 SHA256、源码 SHA、Node/CI 退出码、Chrome 截图/Host 回执与保存读回哈希，然后才改本文为正式验收。

## 五、五角色独立阶段评估（非外部专家证明）

以下为**R3 当前发布准备度**的角色化静态评估，100 分制，每项分别打分，不等于已经实际测试；不能因为评分目标 `≥95` 而补造测试结果。

| 角色 | 当前分数 | 主要扣分 |
| --- | ---: | --- |
| UX | 68 | 320px、深浅色、实际点击/键盘与长文无浏览器证据 |
| 浏览器架构 | 75 | Host、Content、导航/撤权和真实安装升级未集成验证 |
| Markdown 保真 | 63 | 复杂公式、表格、代码、虚拟化与大小限制未做实测 |
| 安全 | 72 | 基于源码有身份与站点授权边界，但缺撤权竞态/旧回执实测 |
| QA | 28 | Node/CI 仍排队或受阻，预览和 Chrome 未验收 |

**算术平均分：`(68+75+63+72+28)/5 = 61.2 / 100`；未达到 95，禁止宣称通过。**

反方攻击：
1. 源码中的严格模式未声明变量让第一条候选就崩溃：**已修源码，尚待 Node 和浏览器回归**。
2. Provider 结构变化让普通父容器包含两轮回复：**尚待三 Provider 真站测试、必要时可维护适配器**；不得向 Browser Framework 写死 ChatGPT CSS。
3. 用户取消/跳转/撤权后旧回执回填，或点击链接误导航：**尚待真实 Host/Chrome 验证**。
4. 150000B DOM 转换上限与 160000B 存储正文限制差异、未知数学节点/虚拟化：**尚待格式和边界测试，不能截断后假装成功**。

盲区审计：远端 GitHub 提交成功不能说明本机工作区干净；CI queued 不能说明通过；React 舞台重生成不能说明 Browser Host；Headless Chromium 不等于用户正式安装升级；当前源码与旧正式包不一致，不可报告“已发行”。下一轮必须提供实证并重新独立评分。

## 六、结论及关闭条件

- **已完成**：R2/main 基线核查、未声明变量的最小源码修复、区域测试登记到正式 App CI。
- **尚未完成**：完整 Node/Host/App CI/预览/Chrome 测试、必要二次修复、版本晋升、官方包 SHA、用户数据原位升级与真实读回、五角色证据性 `≥95`。
- **当前状态：PARTIAL**。只有收齐上述全部验证回执且旧数据保留被证实，才能写 `YES / R3 CLOSED`。
