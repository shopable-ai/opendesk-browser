# OpenDesk Task 参数契约（R10）

状态：**设计规范候选；正式 v2 运行、安装、调度和 Chrome 验收尚未实施。** 基准 `e2e2a82e50d978b9a181b1fa22465c4030d38ef7`。本页是 Controller Task 参数设计的开发者规范，不适用于 Page USER_SCRIPT 自定义网页表单、Sidebar Tool 或权限声明。不得将 R9 离线演示视为正式能力。作者当前发布必须使用下述 legacy 子集；v2 示例不得直接安装。

## 0. 开发者速查：一行一个参数（R10.1 精简编写格式）

**核心方案：`paramItems` 是作者/AI 首选源码格式；构建自动展开为 `paramsSchema + paramsUi`；执行只消费纯 JSON `params`。** 参考 [Cool Admin cl-form](https://vue.cool-admin.com/src/guide/crud/form.html) / [cl-upsert](https://vue.cool-admin.com/src/guide/crud/upsert.html) 的 items 声明思想，但不绑定 Vue/Element Plus 的组件名、实例、事件、插槽或函数。

```json
{
  "paramItemsVersion": 1,
  "paramItems": [
    {"key":"query","label":"关键词","type":"text","required":true,"minLength":1,"maxLength":120},
    {"key":"limit","label":"数量","type":"number","min":1,"max":20,"default":3},
    {"key":"showExecutionTab","label":"显示执行标签页","type":"switch","default":true}
  ]
}
```

开发者不再手写 properties/required/order/fields，也不再重复维护 options/enum/optionLabels。阅读 [完整一行一项的 14 参数示例](../../examples/tasks/task-param-items.example.json)，调用 [纯数据转换器 compileParamItems](../../scripts/compile-task-param-items.mjs) 即可取得与 R10 相同的扩展契约。**本轮已新增参考转换器和一致性测试；尚未接入正式开发、打包、安装和运行流程。** 当前宿主只能使用 legacy v1；不要直接把 paramItems 或编译后的 v2 片段添加到旧包。正式迁移后才是“填配置即可运行”的体验。

| type（控件类型） | valueType 缺省 | 关键附加配置 |
| --- | --- | --- |
| text | string | minLength / maxLength / placeholder |
| textarea | string | minLength / maxLength / placeholder |
| number | integer | min / max / step / unit；小数显式 valueType:"number" |
| slider | integer | min / max / default 必需，number 时 step 必需；unit |
| checkbox | boolean | default:true/false（可不设，未设置不等于 false） |
| switch | boolean | default:true/false（可不设） |
| select | string | options:[{value,label}]；数字/布尔显式 valueType |
| radio | string | 同 select |
| multi-checkbox | array of string | options:[{value,label}], default:[], minItems/maxItems；valueType 指元素类型 |
| date | string | 自动 format:date；YYYY-MM-DD |
| time | string | 自动 HH:mm 固定 pattern |
| url | string | 自动 uri + HTTP(S) 固定 pattern；不授权 |

通用字段仅 key、label、type 为必需；required 缺省 false，default 可省略，description 为帮助说明；scalar 可声明 const。控件属性使用上表白名单；placeholder 限 text/textarea/number/select/url，unit 限 number/slider；单选数值/字符串可使用对应边界，任意 regex、任意组件、JS、HTML、函数、未知字段拒绝。数组顺序直接生成 paramsUi.order；key 生成 properties 的键；label 生成 title；min/max/step 分别生成 minimum/maximum/multipleOf；options 一次声明自动拆分为 enum（多选为 items.enum）和 optionLabels，数组位置保持一致。valueType 仅数值或选择类可显式覆盖：数值只 integer/number，选择类允许 string/integer/number/boolean，严格同类型，不以默认值猜类型、不把 0/false 转成字符串。

**唯一来源及阶段：** 编写阶段二选一：精简 paramItems（推荐）或直接扩展 paramsSchema/paramsUi（高级使用）；禁止同一脚本同时提供两套手工定义。paramItemsVersion:1 是编写格式版本，编译产生 paramsSchemaVersion:2 与 paramsUi.version:1，并从安装 Manifest 移除编写格式，不引入新的运行协议。发布阶段仅 canonical manifest 中的 paramsSchema/paramsUi 及其版本参与既有 hash 与安装；用户实际执行仅 params。编译器只对已解析 JSON 做编写形状检查和确定性投影，不是完整 v2 语义验证器，不执行任何脚本。正式编译/安装必须再调用唯一 v2 语义校验器，按下文检查日期、精度、范围、默认值等完整语义；原始 JSON 重复成员检测、输入尺寸预算仍由可信输入解析层负责，不得用 JSON.parse 的 last-wins 行为作为正式准入。

示例维护：只编辑 examples/tasks/task-param-items.example.json，用转换器更新 examples/tasks/task-params-v2.example.json，再同步离线 HTML 和 Markdown 派生片段。现有测试确保精简输入展开后与旧 R10 定义语义等价，保留 R9 布局和预览数据，禁止第二份手工约束。定向测试：`node --test tests/environment/task-param-items.test.mjs`。正式 R11 优先接入源格式编译，再使用原 TaskWorkbench/校验器；不新建第二套渲染器或安装器。

## 1. 三层契约、版本和唯一来源

| 字段 | 职责 |
| --- | --- |
| paramsSchemaVersion | 参数语义版本；缺省为 legacy 1，扩展契约显式为 2（正式准入尚需迁移） |
| paramsSchema | 唯一数据真相：类型、title、description、required、default、enum、const、业务约束 |
| paramsUi | 可选纯展示配置：version: 1、order、fields；不能更改业务约束或授权 |
| params | 纯 JSON 运行参数，不夹带 schema、UI 状态、回执 |

选用 JSON Schema Draft 2020-12 的**明确子集**作为语法基础，而非完整实现。参考 [标准](https://json-schema.org/draft/2020-12) 与 [JSON Forms UI Schema](https://jsonforms.io/docs/uischema/)。OpenDesk 特有行为：补入缺失字段的 default；对已支持的 format 做强制语义断言；限制字段、类型、格式与关键字。禁止远程 schema、$ref、$dynamicRef、组合条件、任意 JS/HTML/组件名、动态表达式、网络解析。通用 Schema 验证器可能不填 default、不检查 format 或不拒绝未知关键字，不能替代 OpenDesk 语义准入。组件数组方案耦合 UI，纯 Schema 自动推断不能表达 textarea、slider、radio、switch 和单位，因此选择分层方案。

[机器元 Schema](../../schemas/opendesk-task-params.v2.schema.json) 验证**声明形状**：结构、字段白名单、类型和大小；不能证明 default 合法、跨字段引用一致或 widget 兼容。语义以下文为准，下一轮在既有 checkParamsSchema / validateTaskParams 中实现，不在各 UI 再造验证器。 [精简编写示例](../../examples/tasks/task-param-items.example.json) 是演示作者源；[完整多参数 JSON](../../examples/tasks/task-params-v2.example.json) 是其确定性编译产物，离线 HTML 的内嵌镜像由定向测试比对，不运行时联网。只修改作者源，重新编译并同步内嵌对象及文档派生片段，再运行一致性测试；不得改动列表或已定窗口布局。

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

各控件完整 JSON 定义见 [14 字段示例](../../examples/tasks/task-params-v2.example.json)，覆盖全部 12 个控件，不是安装包。枚举通过 index 或无碰撞 typed token 映射，不能用 String(value) 当选择身份。未设置的可选 checkbox/switch/multi-checkbox 必须有未设置状态，不等于 false/[]；required 无 default 必须用户明确选择，不自动选第一项。const 或单项 enum 推导固定值：已提供/有 default 时展示为固定只读；缺失时不凭空填入，必填无 default 仍需确认该值。任意只读/隐藏配置不属于 P0，隐藏不是安全措施。

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
