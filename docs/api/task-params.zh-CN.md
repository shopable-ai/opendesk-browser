# OpenDesk Task 参数契约（R10.3）

状态：**设计规范候选；正式 v2 运行、安装、调度和 Chrome 验收尚未实施。** 基准 `e2e2a82e50d978b9a181b1fa22465c4030d38ef7`。本页是 Controller Task 参数设计的开发者规范，不适用于 Page USER_SCRIPT 自定义网页表单、Sidebar Tool 或权限声明。不得将 R9 离线演示视为正式能力。作者当前发布必须使用下述 legacy 子集；v2 示例不得直接安装。

## 0. 开发者速查：最小脚本与文本参数声明

**推荐作者入口：一个脚本源码文件同时保存参数定义和业务代码，每个控件一行文本。** 不要求开发者或 AI 再编辑 JSON 参数文件。参考 [Cool Admin Midway Entity 与快速 CRUD](https://node.cool-admin.com/src/guide/quick.html)、[EPS](https://node.cool-admin.com/src/guide/core/eps.html)、[Stylus UserCSS @var](https://github.com/openstyles/stylus/wiki/Writing-UserCSS) 和 [Fiji Script Parameters](https://imagej.net/scripting/parameters)。后两者已证明从脚本或样式头部声明生成输入 UI 的模式；本格式为 OpenDesk 自己的有限语法，不冒充这些项目的标准。

```javascript
// ==OpenDeskParams==
// @version 1
// @param text keyword "关键词" required minLength=1
// @param number limit "数量" default=20 min=1 max=100
// ==/OpenDeskParams==

async function main() {
    const { keyword, limit } = params;

    return { keyword, limit };
}
```

[最小双参数脚本文件](../../task-packs/examples/task-params-minimal.example.js) 是日常作者和 AI 的首选参考：同一个 JS 文件同时包含参数声明与业务代码；只返回 keyword、limit，无网页、网络或其他业务副作用。[完整 14 参数脚本文件](../../task-packs/examples/task-params-header.example.js) 仅为完整控件覆盖的唯一 fixture 作者源，对应派生 JSON 和 R9 离线预览，不是业务任务。两个示例用途不同，均不可直接视为正式安装包。预览中的 `many-params-preview`（批量整理网页）只是模拟数据，不创建 web-organizer 业务项目、Task ID、发行包或默认安装项。真实独立业务脚本只归 `task-packs/<task-family>/` 或既有已核实 owner。现有 [编译器](../../scripts/compile-task-param-items.mjs) 新增 parseTaskParamsHeader(source) 与 compileTaskSourceParams(source)，前者返回 R10.1 中间结构，后者复用 compileParamItems 生成 R10 v2 标准契约。R10.1 JSON 降为派生中间数据，不再推荐手工维护。**这是参考静态解析器与转换器，尚未接入正式构建、开发、安装、运行或 Chrome；当前宿主仍只接受 legacy v1。** 不可直接把示例作为固定任务包安装。

### 一行声明语法

`// @param 控件类型 参数名 "显示名称" [required] [属性=值 ...]`

- 必须在入口脚本首个实际 JS token 之前的行注释中放置 `// ==OpenDeskParams==`，紧接第一条指令 `// @version 1`，最后 `// ==/OpenDeskParams==`；允许 UTF-8 BOM、ECMAScript 行结束符、空行、版权注释及独立的合法依赖声明。块注释内的伪标记不参与解析；实际代码前的重复或残缺标记拒绝。正文中的同名注释或字符串不参与解析。无头部返回 null（未声明，不能自动视为零参数）；显式空头部才表示零字段。识别到头部但错误时拒绝，不回退旧格式。
- 每行一个 @param，控件名与参数名为 ASCII 标识，label 双引号；后续属性之间用空格分隔，属性名与等号之间不得插空格。required 为唯一裸布尔标志，省略为 false；其他属性为 key=value；值使用 JSON 标量/数组字面量（双引号字符串、数字、true/false、数组），支持标准转义；不允许 null、对象、函数、表达式、JSX/HTML、任意正则或组件代码。
- options 仅用标量数组或 [真实值,"显示名"] 元组数组，例如 options=["a","b"] 或 options=[["markdown","Markdown"],["json","JSON"]]；标量显示 String(value)，元组显式 label。选择类 valueType 缺省 string，可显式 integer/number/boolean，不能自动把数值或布尔转字符串。
- 与原 R10.1 控件规则一致：数值控件默认 integer，小数写 valueType="number"；min/max/step 唯一映射到 minimum/maximum/multipleOf；unit 仅显示。checkbox/switch 可缺失 default，不能等同 false；required 是存在性，非空文本还需 minLength:1。固定值使用 const；默认值缺失/false/0/""/[] 分别保留。
- 文本扫描只接受白名单属性，重复字段/属性、错误引号、数组深度超过两层、数组超过 32 项、非法标识、未知头部版本、超过 16 参数、参数头部超过 65536 UTF-8 bytes 均拒绝；正式入口还需原 UTF-8 source/request budget。参考解析与 R10.1 转换仅检查形状与投影；完整日期、精度、范围、默认值、控件兼容及权限由下文唯一 v2 语义准入处理。

| 控件 | 一行属性示例（接在显示名称后） | 实际数据 |
| --- | --- | --- |
| text | required minLength=1 maxLength=120 | string |
| textarea | default="" maxLength=500 | string |
| number | min=1 max=100 default=20 | integer（小数显式 valueType） |
| slider | min=0 max=100 step=5 default=80 unit="%" | integer / number |
| checkbox | default=true | boolean |
| switch | default=false | boolean |
| select | options=[["json","JSON"],["csv","CSV"]] default="json" | scalar enum |
| radio | options=[["current","当前页"],["all","全部页"]] default="current" | scalar enum |
| multi-checkbox | options=["article","link"] default=["article"] | array |
| date | default="2026-11-25" | YYYY-MM-DD |
| time | default="09:30" | HH:mm |
| url | placeholder="https://example.com" | HTTP(S) URL string |

### 一份源、一个运行契约

编写：脚本头部（推荐）或高级/既有项目的直接 Schema（兼容），不得同时手写两套。构建：静态抽取入口源码头部 → paramItems 内部中间结构 → paramsSchemaVersion:2 / paramsSchema / paramsUi.version:1；发布仅保留生成的标准 Manifest 及既有业务源码、身份和哈希。已有生成产物与源文件均存在时必须核对确定性编译结果，不能任选一份或用旧结果覆盖。正式 ESM/TS 构建须先抽取入口源文件头部再经过可能移除注释的构建阶段，绑定已授权源/构建产物；沿原 manifestHash/sourceHash 和安装审阅保证一致性，不能重写已发行包。用户运行时只使用可信冻结 Manifest 与实际 params，无需再扫描或执行第三方 JS 生成 UI。权限、站点访问、资源选择、Stop 和未知结果不由参数头部改变。

### 编译、压缩、安装及运行的封版门禁（R10.3）

**作者源和发布产物是两个阶段，不是两套手工配置。** 独立脚本归 [task-packs/](../../task-packs/README.md)，示例仍归 task-packs/examples。Controller 现有 ABI 是零参数 `main()`，运行器在受控 AsyncBody 中提供词法 params；不得将 `main(params)` 或 `main({keyword})` 当新标准。多文件 ESM 保留已有兼容包装器，不改 Worker ABI。见 [Controller 文档](controller.zh-CN.md)。

真实源码审计（`122c7167b5b2eaef183fb674b7d773d8d27ccce5`）：`src/scripting/sandbox/worker-runtime.js` 调用 await main()；`scripts/build-program-project.mjs` 生产构建启用 Webpack/Terser，extractComments:false，不保证保留参数注释，且当前 Manifest 仍仅从 project.paramsSchema 取参数；`src/platform/tasks/contract.js` 尚拒绝 v2 参数字段。R10.2 参考解析器在 scripts/compile-task-param-items.mjs，尚未进入上述正式链路。以下是 R11 的实施门禁，不是已实现功能。

| 阶段 | 必须满足 |
| --- | --- |
| 源码冻结 | 从原授权入口/版本读取同一字节快照，抽取头部与编译共享该输入；多文件 ESM/TS 在 Webpack 前抽取真实入口，不在 bundle 或依赖中猜声明；保存或修改源文件不自动运行 |
| 静态提取 | 复用/抽取原 dependency-metadata.js 的前导 trivia 扫描能力，允许合法版权注释、@require、@opendesk-lib 与参数头部共存；不把参数声明赋予权限或扩大 Page/Controller 世界；不读取正文、字符串、模板字面量或块注释内伪头部 |
| 歧义与版本 | R11 静态提取增量已补齐前导注释共存、前导重复头部检测、残缺标记、未知版本和 UTF-8 64KiB 头部预算；正式构建尚须调用此解析器；任何已识别但错误的声明拒绝，缺失头部不等于显式零参数 |
| 单一来源 | 头部、旧项目 paramsSchema/paramsUi 不允许同时作为手工来源；已有自动生成产物必须与冻结源码确定性展开一致，冲突拒绝；legacy 无头部沿原合同；v2 新包字段受原 Manifest 版本准入 |
| 编译 | 在任何 Terser/注释删除之前完成抽取、唯一语义校验；之后可删除所有注释及换行。以现有构建前后输入校验和冻结机制拒绝并行修改；缺少声明产物不能偷偷回退旧数据 |
| 冻结包 | 保留原 opendesk.task-package.v1 容器及 Task Manifest 身份、权限和不可变版本；sourceHash 绑定最终 sourceUtf8；manifestHash 绑定完整 canonical Manifest（含 sourceHash、v2 参数定义）；哈希只证明完整性，不是作者签名或权限授权 |
| 安装/运行 | 已验证的 Manifest 是发布时参数真相；安装后无需解析原源码或联网，所有窗口/计划/AI 从同一安装身份读取定义，Authority 再校验并使用规范化 params；版本更新、撤权、UNKNOWN 不改变既有保护 |
| 生命周期 | 普通任务独立发布/安装不要求重新构建 Browser；v2 首次平台上线需框架支持。内置精确资源 pin 与外部安装沿原不同信任链，不按目录名/ID 自动信任 |

反方测试为 R11 必需：同一原始入口的 development/production 构建参数定义语义等价，生产删除全部注释、JS 压缩为一行后仍可导入并渲染、真实执行；只改参数头部（即使最终代码相同）manifestHash 必变化；只改业务代码 sourceHash 与 manifestHash 必变化；参数头部与合法依赖声明共存；重复/残缺/伪造头部、源快照漂移、旧产物、未知版本、哈希篡改拒绝；无头部的 legacy 老包仍可安装、运行、恢复；刷新浏览器后已安装 v2 使用冻结定义；Run/Stop/计划/AI/工作流同一权威校验。检查实际 Webpack/Terser、正式安装及 Chrome 真实 runId/resultId，不能只用字符串删除模拟冒充生产通过。本文档更新不改变运行器、安装器或旧发行包。

### R11 静态提取阶段进展（非正式运行验收）

已将参数解析的前导注释扫描抽取为 `src/scripting/source-trivia.js`，供参考解析器和原依赖元数据解析器共享。保持既有声明语法及编译投影，支持合法前导版权注释、独立依赖声明和 UTF-8 64 KiB 参数头部限制，拒绝代码前的重复、残缺标记。新增 `tests/environment/task-param-header-r11.test.mjs`；隔离 Node 22 环境针对经 Git blob SHA 核验的解析器及两份示例执行 6 项测试，均通过。该结果不等于全仓测试、依赖元数据完整回归、生产压缩、正式安装或 Chrome 运行已通过。原 v2 正式准入、构建、UI 和 Authority 接入仍待实施。教学与测试复用 [task-packs/examples/](../../task-packs/examples/README.md) 的两份 JS；R11 目录迁移将两份 JS 及两份派生 JSON 保持原字节移动至此，更新文档、Skill、测试与预览引用。旧 Lab 不搬迁，不创建虚构业务或默认安装项。

### todo-user 兼容与未来统一

只读核验 `shopable-ai/todo-user@4edb7d0b59f008684c43f6c6213cf46d8d6e548b` 的 `src/modules/operate/views/script.vue`、`src/modules/operate/utils/UtilScrpt.ts`、`src/modules/operate/service/script.api.ts`。旧系统分别保存 content、params、init；params 示例为 { content:true, title:false }，true 表示必填、false 表示可选；doRunByDeviceId 通过 JSON.parse 判定是否需要输入窗口，再将输入赋回 row.params；formatJSON 使用 eval。旧语义没有声明控件和真实类型，不能把 true/false 当成布尔运行值，也不能擅自推断所有类型为 string。后续先核查服务端及真实调用数据，再设计 legacy adapter；应区分脚本定义（源码头部或生成的 schema）与每次运行 params，逐任务迁移。删除 eval 应在 todo-user 自己的兼容任务中进行；本轮不修改 todo-user，也不共用 OpenDesk 浏览器权限、运行身份或宿主。

维护：只修改 task-packs/examples/task-params-header.example.js 的文本声明，重新生成 task-packs/examples/task-param-items.example.json 及 task-packs/examples/task-params-v2.example.json，并同步现有离线 HTML 与文档派生片段。新增测试与既有测试分别核对源→IR→标准契约、标准契约→HTML/MD。定向 Node：`node --test tests/environment/task-param-items.test.mjs tests/environment/task-params-contract-r10.test.mjs`。正式 R11 应接入原构建、TaskWorkbench 和统一 v2 语义验证，不新增第二套安装器或渲染器。

### R11.2 正式运行前置修复：规范化参数不得丢弃

基于 `0623837ca4189b122916c9f0a39acc66f0013baa`，已核查已安装 Task 的 Authority 原先校验 params 后仍将原 paramsWire 持久化，本地项目运行原先校验后仍将原 params 传给 RunHost。本增量使已安装任务使用同一事务中校验返回的 normalizedParams 生成耐久 Worker 输入，并使本地项目使用校验返回值；原请求摘要、准备/委托/计划比对、安装身份与权限检查保持不变。本地项目仍为原 draft 路径，不因此取得已安装任务的权威参数定义。增加原 Authority 和 Local UI 组件回归断言；完整仓库依赖环境及真实 Chrome 未验证，v2 Manifest 尚未开放。

百度稳定 1.1.6、Google 稳定 1.0.7、Google interaction 1.0.0 的活动源码仍无 @param，三者 legacy 参数均为 query（必填、1–120）、limit（固定 3、默认 3、required）和 showExecutionTab（默认 true、可选）。新版本应保持这些业务语义，以 const=3 表达固定值，保留原参数名和零参数 main()，不把 Top3 改为可变数量或删除业务非空白检查。先完成通用 v2 准入与正式构建，再由活动作者源码生成新版本候选；冻结旧发行包及 pin 不重写，interaction 不晋升为默认任务。

## 1. 三层契约、版本和唯一来源

| 字段 | 职责 |
| --- | --- |
| paramsSchemaVersion | 参数语义版本；缺省为 legacy 1，扩展契约显式为 2（正式准入尚需迁移） |
| paramsSchema | 唯一数据真相：类型、title、description、required、default、enum、const、业务约束 |
| paramsUi | 可选纯展示配置：version: 1、order、fields；不能更改业务约束或授权 |
| params | 纯 JSON 运行参数，不夹带 schema、UI 状态、回执 |

选用 JSON Schema Draft 2020-12 的**明确子集**作为语法基础，而非完整实现。参考 [标准](https://json-schema.org/draft/2020-12) 与 [JSON Forms UI Schema](https://jsonforms.io/docs/uischema/)。OpenDesk 特有行为：补入缺失字段的 default；对已支持的 format 做强制语义断言；限制字段、类型、格式与关键字。禁止远程 schema、$ref、$dynamicRef、组合条件、任意 JS/HTML/组件名、动态表达式、网络解析。通用 Schema 验证器可能不填 default、不检查 format 或不拒绝未知关键字，不能替代 OpenDesk 语义准入。组件数组方案耦合 UI，纯 Schema 自动推断不能表达 textarea、slider、radio、switch 和单位，因此选择分层方案。

[机器元 Schema](../../schemas/opendesk-task-params.v2.schema.json) 验证**声明形状**：结构、字段白名单、类型和大小；不能证明 default 合法、跨字段引用一致或 widget 兼容。语义以下文为准，下一轮在既有 checkParamsSchema / validateTaskParams 中实现，不在各 UI 再造验证器。 [脚本头部文本示例](../../task-packs/examples/task-params-header.example.js) 是演示作者源；[paramItems 中间 JSON](../../task-packs/examples/task-param-items.example.json) 与 [完整多参数 JSON](../../task-packs/examples/task-params-v2.example.json) 是其确定性编译产物，离线 HTML 的内嵌镜像由定向测试比对，不运行时联网。只修改作者源，重新编译并同步内嵌对象及文档派生片段，再运行一致性测试；不得改动列表或已定窗口布局。

## 2. 当前正式 v1（legacy）与最小可用配置

`src/platform/tasks/contract.js` 的 `checkParamsSchema` 接收根 type/properties/required/additionalProperties，字段 type/title 必填；允许 description/default/enum/minLength/maxLength/minimum/maximum。根 closed object，required 显式数组；最多 16 字段，名字 ASCII 字母开头、最多 40 字符；enum 最多 32；string 未指定 maxLength 时限 1024（JS UTF-16 code units），显式长度限 4096；整数为安全整数，number 有限；title 60、description 240 字符且无边缘空白、非空。验证使用自身属性、默认值校验、枚举唯一与类型检查。当前可用参数片段（不是完整安装包），**不加 paramsSchemaVersion 和 paramsUi**：

```json
{
  "paramsSchema": {
    "type": "object",
    "properties": {
      "query": {"type":"string","title":"搜索关键词","minLength":1,"maxLength":120},
      "limit": {"type":"integer","title":"数量","minimum":1,"maximum":20,"default":3}
    },
    "required": ["query"],
    "additionalProperties": false
  }
}
```

输入 {"query":"浏览器"} 规范化为 {"query":"浏览器","limit":3}。Controller 使用零参数 async function main() 中的词法 params.query，不是 window.params 或 main 形参。当前 validateTaskManifest 拒绝新版本字段和 paramsUi。旧项目、旧脚本和计划保持历史语义，无需重新安装。百度 1.1.6 实际发行仅 query/limit/showExecutionTab，limit enum [3] default 3，showExecutionTab default true；文件名 v1 不等于实际版本。

## 3. v2 P0 数据语义（待正式迁移）

- 根：type object、properties、required、additionalProperties false 四项必需。不含 $schema（作者工具可使用外部元 Schema），拒绝未知根/字段关键字。16 字段；ASCII 字母开头、后续字母数字下划线，1–40 字符，禁止 constructor、prototype、__proto__。required 不重复且必须属于 properties。标题/描述保持 v1 长度和边缘空白规则（UTF-16）。参数 string 的 minLength/maxLength 按 Unicode code point 计数，缺省 maxLength 1024、minLength 0，显式最大 4096；长度上下界有效且有序，未指定 maxLength 时 minLength 不得超过 1024。v1 保持原计数行为。
- scalar：string / integer / number / boolean；严格类型，拒绝字符串数字、null、NaN、Infinity、undefined（非 JSON）、非安全整数的 integer。enum 同类型、1–32 项唯一，逐项满足非 enum 约束；const 同类型且满足其余约束。default 存在时必须合法，允许 false、0、""、[]；default 不等于 required。无合法候选的冲突声明拒绝。
- 数值：minimum/maximum 闭区间；multipleOf 为唯一业务步长（正有限数）。integer 值为安全整数。number 使用 JSON 解析后的有限 IEEE-754 数值及其最短十进制表示；multipleOf 将十进制（含指数）转共同尺度整数，精确整除，不用浮点容差或 UI 四舍五入。金额推荐整数最小单位。slider 需 minimum < maximum、default；number 型必须 multipleOf，integer 型未声明 multipleOf 时步长 1，声明时须为正整数；上下界和默认值均在 0 基准网格上，避免 HTML range 按 minimum 步进产生偏差。精确输入和滑块同值同规则，不重复声明 step。
- array：P0 仅 `items:{type,enum}` 单层同类型枚举数组，uniqueItems:true 必需；minItems/maxItems 为 0–32、上限默认 32；实际可选数还受枚举长度限制。重复、非法项拒绝，不排序或静默去重。required 只要求存在，非空用 minItems:1。数组 default 深复制，禁止共享引用。通用数组、对象、nullable 延后。
- format：仅 string 的 date 和 uri（OpenDesk uri 限 HTTP(S) 绝对 URL、有合法 host、无用户名密码、无空白；不联网或授予访问权）；date 为真实公历 YYYY-MM-DD，0001–9999；time 为固定 pattern `^(?:[01][0-9]|2[0-3]):[0-5][0-9]$`，HH:mm，不含时区、秒或调度含义。P0 pattern 只允许此时刻表达式与 `^https?://`（后者必须伴随 format:uri）；禁止任意正则以避免 ReDoS。time 不可叠加 date/uri。R9 预览允许任意 pattern 且 required/minLength>0 时额外 trim，迁移时须收敛，不以预览为权威校验器。

## 4. UI 配置和控件矩阵

paramsUi 可省略。version 仅 1；order 若存在必须为全部字段的完整排列，不重复、不遗漏、无未知项；缺省按字段名 ASCII 字典序（避免 canonical hash 忽略对象键顺序而产生不同 UI）。fields 以参数名为键，禁止未知项；字段仅 widget、placeholder（160 字符）、unit（16 字符，纯文本）、optionLabels（与 enum 或 items.enum 等长的索引映射，单项 1–80 字符）。禁止另设 label/default/required/min/max/step/options 或业务逻辑；title/description 从 schema 取。unit 仅 number/slider 展示，不缩放。所有展示值安全文本渲染。未知版本/控件/不兼容映射拒绝，不静默忽略。

| P0 widget | 数据及自动推断 / 指定 | 示例默认 / 实际 JSON | 校验失败及业务场景 |
| --- | --- | --- | --- |
| text | string 无 enum/format/pattern 默认；可设 placeholder | keyword: "浏览器" | 长度错误保留文本；关键词 |
| textarea | 普通 string 显式指定 | notes: "" | 同 text，保留换行；备注 |
| number | integer/number 默认 | limit: 20，timeout: 10 | 类型、范围、步长错误拒绝；数量/秒数 |
| slider | 数值，显式 widget，边界、步长、default | quality: 80，unit "%" | 网格/范围错误拒绝；匹配阈值 |
| checkbox | boolean 无 enum 默认 | includeLinks: true，externalOnly: false | 非布尔拒绝；附链接 |
| switch | boolean 无 enum 显式指定 | deduplicate: true | 同 checkbox；去重 |
| select | scalar enum 默认，可设 optionLabels | format: "markdown" | 保存真实枚举值而非标签；输出类型 |
| radio | scalar enum 显式指定 | scope: "current" | 同 select；互斥范围 |
| multi-checkbox | 枚举数组默认或显式 | contentTypes: ["article","link"] | 非枚举/重复/数量错误；采集类型 |
| date | string format:date 默认 | since 无默认，可传 "2026-11-25" | 真实日历日期；更新日期 |
| time | string 固定时刻 pattern 默认或显式 | afterTime 无默认，可传 "09:30" | HH:mm；钟表时刻 |
| url | string format:uri 默认或显式 | startUrl 无默认，可传 "https://example.com/" | HTTP(S) 校验，不替代授权；起始网址 |

各控件完整 JSON 定义见 [14 字段示例](../../task-packs/examples/task-params-v2.example.json)，覆盖全部 12 个控件，不是安装包。枚举通过 index 或无碰撞 typed token 映射，不能用 String(value) 当选择身份。未设置的可选 checkbox/switch/multi-checkbox 必须有未设置状态，不等于 false/[]；required 无 default 必须用户明确选择，不自动选第一项。const 或单项 enum 推导固定值：已提供/有 default 时展示为固定只读；缺失时不凭空填入，必填无 default 仍需确认该值。任意只读/隐藏配置不属于 P0，隐藏不是安全措施。

### 12 类控件的 JSON 示例

以下每行是可独立阅读的字段配置 JSON 片段：key 对应 paramsSchema.properties 的字段名，rule 对应其值，ui 对应 paramsUi.fields[key]（空对象代表可省略），widget 是此例最终控件名称而不是额外 Manifest 字段。此段由权威示例推导，定向测试检查逐字一致，不单独维护业务约束。

<!-- task-params-control-examples:start -->
```jsonl
{"widget":"text","key":"keyword","rule":{"type":"string","title":"关键词","minLength":1,"maxLength":120,"default":"浏览器","description":"填写要匹配的文本。"},"ui":{"placeholder":"输入关键词"}}
{"widget":"textarea","key":"notes","rule":{"type":"string","title":"补充说明","maxLength":500,"default":""},"ui":{"widget":"textarea","placeholder":"输入补充要求"}}
{"widget":"number","key":"limit","rule":{"type":"integer","title":"最多条数","minimum":1,"maximum":100,"default":20},"ui":{}}
{"widget":"slider","key":"quality","rule":{"type":"integer","title":"匹配阈值","minimum":0,"maximum":100,"multipleOf":5,"default":80,"description":"阈值越高，匹配要求越严格。"},"ui":{"widget":"slider","unit":"%"}}
{"widget":"checkbox","key":"includeLinks","rule":{"type":"boolean","title":"附上原文链接","default":true},"ui":{}}
{"widget":"switch","key":"deduplicate","rule":{"type":"boolean","title":"自动去重","default":true},"ui":{"widget":"switch"}}
{"widget":"select","key":"format","rule":{"type":"string","title":"输出格式","enum":["markdown","json","csv"],"default":"markdown"},"ui":{"optionLabels":["Markdown","JSON","CSV"]}}
{"widget":"radio","key":"scope","rule":{"type":"string","title":"采集范围","enum":["current","all"],"default":"current"},"ui":{"widget":"radio","optionLabels":["当前页","全部页"]}}
{"widget":"multi-checkbox","key":"contentTypes","rule":{"type":"array","title":"内容类型","items":{"type":"string","enum":["article","link","image"]},"uniqueItems":true,"default":["article","link"]},"ui":{"widget":"multi-checkbox","optionLabels":["正文","链接","图片"]}}
{"widget":"date","key":"since","rule":{"type":"string","title":"更新日期","format":"date","description":"可选，仅整理该日期及之后的内容。"},"ui":{}}
{"widget":"time","key":"afterTime","rule":{"type":"string","title":"起始时刻","pattern":"^(?:[01][0-9]|2[0-3]):[0-5][0-9]$","description":"可选，本地钟表时间，不包含时区或定时调度语义。"},"ui":{"widget":"time"}}
{"widget":"url","key":"startUrl","rule":{"type":"string","title":"起始网址","format":"uri","pattern":"^https?://","description":"可选，仅在本脚本需要时使用；不赋予网站访问权限。"},"ui":{"widget":"url","placeholder":"https://example.com"}}
```
<!-- task-params-control-examples:end -->

### 优先级

P0：上表 12 控件与固定值展示。P1：多选下拉（复用枚举数组）、标签（受限 string 数组）、日期时间（含明确时区）、数值区间/双端滑块、日期区间、颜色（明确验证语义）。P2：动态列表、对象/键值对、nullable、条件显示/required、跨字段约束、复杂 schema 组合。条件隐藏未来必须明确保留/删除规则及执行校验，不因 display:none 自动删除；P0 折叠不改变值。文件、媒体、密码、token、凭据是独立资源授权能力，不纳入普通 JSON 参数；沿现有 media.read、资源与凭据权限契约独立安全审查。禁止将敏感数据放入 schema/default、UI、普通 params、计划、AI 上下文、日志、历史、错误、回执与持久化；密码掩码不能解决泄露。未来引用需授权的不透明资源 ID、身份绑定与撤权。

## 5. 初始化、编辑、校验和执行

1. 按版本编译声明，先形状后语义；检查默认值/枚举/const。未知版本或未启用 v2 时拒绝，不能回退 legacy 解释。
2. 仅复制 own default；required 缺失保持未填。false、0、""、[] 保留；null 在 P0 不允许；缺失和空值不同。required 是存在性，空字符串由 minLength 决定，不自行 trim。可选无默认保持缺失，必须区分“清空为字符串空值”和“移除字段”。删除有 default 字段后再次规范化恢复 default；reset 恢复声明。
3. 表单与 JSON 是同一草稿两种视图，保留 presence、原始无效 JSON 和字段错误，不覆盖最后合法值、不允许 Run。切换失败留在原模式；未完成数字输入不得序列化为 null；多行、数组无损。JSON 解析拒绝重复键（包括转义后同名键），不静默 last-wins。错误定位字段路径，折叠错误可展开聚焦；折叠/重开不丢值。无效 JSON 不可用旧合法值偷跑。
4. copy 缺失 default 后严格校验全对象，无强转、未知字段过滤、单位换算或截断。失败使用既有 E_SCHEMA（声明）/ E_PARAMS（参数），提供安全字段路径和原因，不回显敏感值。沿现有包/请求尺寸预算，v2 输入不得超过 65536 UTF-8 bytes；若 Authority 更严则从严。限制声明、草稿、解析深度及请求大小。
5. 权威执行准入必须再校验并使用**校验返回的规范化值**，禁止只 validate 后传原 params。计划保存和执行前校验，按原安装身份、版本、manifestHash、sourceHash、权限重查；版本变化不得静默套用旧参数，未知执行不得重放。冻结同一版本和参数快照；Worker 从可信准入读取，不从 UI 或 AI 文本取值。保留原 Run/Stop、权限、未知结果保护和回执。

### 完整示例实际运行 JSON

按声明 default 初始化（startUrl/since/afterTime 未设置故省略）：

```json
{
  "keyword": "浏览器",
  "limit": 20,
  "quality": 80,
  "format": "markdown",
  "includeLinks": true,
  "externalOnly": false,
  "deduplicate": true,
  "scope": "current",
  "contentTypes": [
    "article",
    "link"
  ],
  "timeout": 10,
  "notes": ""
}
```

quality:80 表示 80，不是 0.8 或 "80%"；format 保存 "markdown" 而不是标签；externalOnly:false 和 notes:"" 保留。填入 since/afterTime 后只增加相应字段。

## 6. 安装、版本和安全

旧 Task opendesk.task.v1 / package.v1 沿用双 hash、安装身份、来源审核与运行库检查。新 v2 字段须 manifest validator 显式接受；完整 canonical manifest hash 覆盖 paramsSchemaVersion/paramsSchema/paramsUi，源码 hash 独立。新配置须新任务版本、重新打包与原安装审阅，不给旧发行包注入配置或篡改 hash；完整性不等于信任。旧宿主拒绝未知字段并提示版本不支持；旧安装无需重装、不得静默修改旧校验、默认、授权行为。保存计划和 AI 候选绑定原版本，迁移须审阅及重新校验，不自动执行。Page USER_SCRIPT 不因此获得 Controller params 词法变量或权限。

## 7. 基准源码与迁移顺序

| Owner / 实际入口 | 基准事实和下一轮工作 |
| --- | --- |
| src/platform/tasks/contract.js: checkParamsSchema, validateTaskParams, validateTaskManifest, verifyTaskPackage, createTaskPackage | 四种 scalar、严格 Manifest、双 hash；扩展版本分派与统一编译 |
| src/platform/tasks/app-controller-contract.js / schemas/opendesk-program-project.v1.schema.json | 已有 Controller 和项目 paramsSchema；核验 build-program-project 与 local source 版本字段传递 |
| src/platform/tasks/service.js / builtin-releases.js | 现有候选、安装身份、固定发行双 hash；不改旧发行包 |
| src/ui/task-workbench.js: renderForm / paramsFromForm / taskParamsModeChange | 草稿、表单/JSON 与校验；required enum 自动首项、可选空字符串省略、String 枚举映射、换行阻止表单切换待修 |
| src/ui/react/tabs/task-run-sheet.tsx / my-sections.tsx: MyTaskParams | 基础控件；limit/标题/showExecutionTab 特判改通用 field model；目标执行语义由原 Authority 负责 |
| src/ui/local-project-run.js / controller-draft-run.js | JSON 编辑；local-project-run validate 后仍传原 params，核对权威准入默认值、无声明草稿兼容 |
| src/platform/tasks/schedule-contract.js / schedule-service.js / src/ui/scheduled-task-workbench.js / react/tabs/my-page.tsx | 原计划 JSON、身份、调度契约；共享校验和可选表单，不改调度语义 |
| src/ui/workflow/installed-task-reuse.js / src/ui/my-task-agent.js | 部分结构化调用已校验；逐入口检查调用值与身份，AI 无需 paramsUi |
| src/run-host.js | paramsWire:encodeValue(params) 与耐久准入；核验 Authority 使用校验返回值，不增加新 Host |
| prototypes/sidebar/my/index.html | R9 14 字段、12 控件、compileTask / validateParams；已知差异：任意 regex、float 步长容差、固定值自动补入、空字符串删除、无默认 toggle 拒绝；后续与规范收敛，不重做 UI |

迁移顺序：① 契约/legacy 回归及 v2 负向测试；② package/local project/Authority 哈希和参数快照；③ 原 React root 与 TaskWorkbench 共享 field model；④ 开发、计划、工作流、AI、网页任务准入逐项接入，禁止按网站名称特判；⑤ 定向 Node、构建及真实 Chrome 验收。R10 不修改正式运行组件、发行包或权限系统。

## 8. 作者与 AI 常见错误

先确认真实宿主支持的版本与运行世界，当前正式仅支持 legacy。v2 候选不能宣传已上线；不生成独立表单、任意渲染代码、未知关键字、重复 min/max/default/required、把百分号或标签当实际值、猜测必填项、用 "false" 替代 false、用 undefined/null 伪装缺失、把敏感值放普通参数。AI 只生成已声明参数，缺项提示用户；从可信安装任务取 schema/identity，不信网页自报 schema/title/UI；参数不构成执行授权。沿用原确认、权限与幂等边界。

最小定向测试：`node --test tests/environment/task-params-contract-r10.test.mjs`，覆盖 fixture 与离线镜像一致、旧正式包及校验兼容、R9 样例边界。机器元 Schema 可由 Draft 2020-12 标准验证器离线验证；语义、跨入口与真实 Chrome 测试需迁移后验收。本规范测试不是正式 v2 测试。
