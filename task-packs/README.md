# 独立 Controller Task 脚本库（Independent Task Packs）

**这是 OpenDesk 独立 Controller Task 的统一脚本资产目录：作者示例、真实业务源码、发行包及专属测试集中管理，不是浏览器框架源码目录。** 通用能力由原 Controller SDK 提供；「我的」是统一任务管理入口。WebFlow、Subagent、计划、AI 是消费者，不拥有这些共享脚本的第二份实现。

- [开发示例（最小双参数与完整 12 类控件）](examples/README.md)
- [脚本参数编写规范（文本头部、12 类控件、校验与编译）](../docs/api/task-params.zh-CN.md)
- [Controller 公共 SDK](../docs/api/controller.zh-CN.md) · [本地项目配置](../docs/api/local-projects.zh-CN.md)
- [独立 Task 资产及安装/授权合同](../docs/architecture/installed-controller-tasks-and-workflow-consumers.zh-CN.md)
- [脚本编写 Skill](../.agents/skills/opendesk-script-authoring/SKILL.md) · [正式发布 Skill](../.agents/skills/opendesk-program-publish/SKILL.md)

## 1. 新增脚本放在哪里？

```text
task-packs/
  README.md
  examples/                       # 作者参考及派生数据，非正式发行 family
    README.md
    task-params-minimal.example.js
    task-params-header.example.js
    task-param-items.example.json
    task-params-v2.example.json
  <task-family>/
    README.md                     # 使用、参数/结果、开发与发行入口
    src/
      main.js                     # 推荐的单脚本入口；已有文件名保持
    releases/
      <task-id>.<version>.opendesk-task.json
    tests/                        # 需要业务回归时增加
    contracts/                    # 需要独立结果数据合同且已审核时增加
    package.json                  # 仅真实多文件/ESM 构建需要
    package-lock.json             # 仅真实依赖需要，锁定
```

对新建的、具有独立安装身份并可被多个产品消费的 Controller Task，默认归 `task-packs/<task-family>/`；family 是源码组织边界，可含多个独立 taskId（例如 google.search 中的 stable/interaction），不等于运行身份。每个 taskId 有唯一活动源码入口；历史版本在 Git 与不可变 releases 中保留。现有目录和历史文件不因命名美观或本规范自动迁移/重写。已有产品专用且不独立发行的附属脚本继续归原产品；不能把所有网页代码一律搬到 task-packs。

| 类型 | 所有权 |
| --- | --- |
| 独立 Controller Task | task-packs/<task-family>/；用户也可在已授权的外部本地项目目录开发 |
| Controller 参数作者示例、派生数据 | task-packs/examples/；唯一作者入口，不是 Task family 或正式包 |
| 既有浏览器测试 Lab、历史任务夹具、HTTP 服务 | 保留 examples/tasks/；Page/Controller 多文件项目示例保持 examples/programs/ |
| Sidebar Tool / WebFlow / Subagent | projects/<id>/ 或既有唯一产品 owner |
| Page USER_SCRIPT | 原 Page Program 目录及独立 Page 安装合同 |
| 公共参数、包校验、安装、运行、权限、计划、UI | 原框架模块 src/；不含网站业务特判 |
| 通用编译、验证、维护工具 | scripts/；不存放用户可安装业务脚本 |

`examples/` 是保留分类名，不得作为业务 family、Task ID、releases 目录、默认安装项、市场发行项或固定预置资源。现有发行入口只读取经审核的精确资源清单；不得为方便发现而自动递归安装该目录。旧测试 Lab 的 43111 服务根和历史夹具位置保持不变。

仅创建当前需要的文件和目录；最小独立单文件 Task 不要求 npm、React、Vue、自定义 HTML 或空 tests/contracts。真实运行入口、权限、版本等安装配置沿用已有 Task Manifest/本地项目格式，不能只凭头部注释决定权限。

## 2. 当前已存在的业务脚本

以下核对基线为 `122c7167b5b2eaef183fb674b7d773d8d27ccce5`，发行版本和默认/可选策略以实际 `src/platform/tasks/builtin-releases.js` 和各冻结包 Manifest 为准，不根据文件名中的 v1 猜版本；这不是当前用户 Profile 已安装状态。

| family | 任务及当前发行 |
| --- | --- |
| [baidu.search](baidu.search/README.md) | baidu.search.top3@1.1.6 默认预置资源；1.1.5 历史 |
| [google.search](google.search/README.md) | google.search.top3@1.0.7 默认预置资源；google.search.interaction.top3@1.0.0 独立冻结候选，不是稳定版升级 |
| [chatgpt.conversation.create](chatgpt.conversation.create/README.md) | 0.2.2 可选目录版本；保留 0.1.0、0.2.0、0.2.1、0.3.0 精确字节，0.3.0 不自动升级/执行 |

参数教学优先参考 [task-params-minimal.example.js](examples/task-params-minimal.example.js)（两个参数与零参数 main()）；需要控件全覆盖时再读 [task-params-header.example.js](examples/task-params-header.example.js)（14 参数、12 类控件）。两者均是无副作用参考 Controller 源码，归 task-packs/examples/，不是正式发行、默认预置或已安装任务。`many-params-preview` 只是原型的离线模拟数据，不为其创建 web-organizer 业务脚本或发行包。参考静态解析器已存在，但 v2 正式准入与生产构建仍待实现。

## 3. 普通作者的开发到安装流程

1. 在唯一业务 owner 写源码和最小 README；使用公开 Controller SDK，经典单文件推荐 `async function main()`，ESM 推荐 `export default async function main()`，从受控词法 `params` 获取值；不修改 main 运行 ABI。
2. 参数声明优先同一脚本文件顶部的 @param 文本头部（v2 设计目标）；现阶段正式安装仍用 legacy paramsSchema。运行时不手工维护第二份参数约束。按 [参数规范](../docs/api/task-params.zh-CN.md) 的实际支持边界开发；不能把参考头部当作已经支持的安装格式。
3. 用「开发」直接编辑或授权本地项目试运行，核对原 runId/resultId、源码身份、真实结果和释放状态；单文件不强制构建。多文件项目需要固定发布产物时使用原构建（仓库根执行）：
   ```sh
   node scripts/validate-program-project.mjs <project-directory>
   npm run build:program -- <project-directory>
   ```
   构建产物是候选，不自动安装。参数 v2 迁移前，上述命令不能承诺自动提取 @param。
4. 复用现有 Candidate → Verification → Available → Installed 链；在「我的 → 添加任务」导入/发现 `.opendesk-task.json`，核对同版本的真实验证记录并审阅安装身份、权限和站点范围。安装后从「我的」运行/管理；不要求每次运行重审已有效授权，仍保留每次必要的动作授权、撤权、Stop 和 UNKNOWN 防重放。参考 [发布 Skill](../.agents/skills/opendesk-program-publish/SKILL.md)。
5. 正式发行包保存在本 family 的 releases/。升级创建新的明确 Task 版本并重新验证，旧包不可改写；保留历史源码、包字节、manifestHash/sourceHash、安装身份和用户停用/卸载决定。实际运行参数、账号、凭据、个人数据、日志不提交源码库。

外部作者和后续脚本市场使用相同的现有 Task 包及安装审阅，不以是否进入当前 monorepo 或官方目录作为运行已有合法安装的门槛。普通用户安装不要求修改框架代码、不要求重新构建 Browser。将任务作为 Browser 随包预置/可选资源是独立的第一方发行决策，需按现有精确 pin 机制审阅；不能递归扫描 releases 并自动信任或默认安装所有脚本。在线市场、分发信任和商店合规另行验收，本规范不宣称已经上线。

## 4. 框架解耦与压缩边界

通用 `src/platform/tasks/{builtin-releases,service,contract}.js`、Authority、Controller、RunHost、Durable Run/Result 仍是唯一实现。源码业务只依赖公开 SDK；框架不静态 import 动态 Task 业务源码，不直接执行任意安装包于可信 Host。现有 task-packs 下经精确审核、固定编译的结果数据 validators 是有限例外，不可作为动态业务执行入口。

R11 接入参数元数据时，先从同一冻结的原始入口源码提取并校验 @param，再编译/压缩 JS，将生成的 paramsSchema/paramsUi 及版本写入原 Manifest，绑定最终 sourceUtf8 和原双 hash；安装与运行窗口只读取已验证的 Manifest，不重新扫描压缩 JS。不能依赖保留注释或换行。具体编译顺序、冲突拒绝及测试只在 [参数规范](../docs/api/task-params.zh-CN.md) 维护。

源码路径不是 installed Task ID 或资源 URL。现有内置发行按 `scripts/packaged-task-resources.mjs` 与精确发行索引验证后复制原包至 `tasks/builtin/<taskId>/<version>.json`；这些是受审数据资产，不是静态可信可执行模块。普通新业务脚本无需加入此索引。

## 5. 每个 family 的 README 最小内容

说明任务用途/业务边界、真实 taskId 与版本、活动源码与冻结包、参数和返回示例、站点/权限、开发/验证命令、安装/升级方式和真实验收状态。全局参数语法、公共 SDK、安装器规则只引用权威文档，不在每个脚本复制一整套规范。业务测试归该 family；公共包校验/运行权限/跨入口测试归框架。不得把源码存在、构建成功或提交 Git 当作 Chrome 安装与运行通过。
