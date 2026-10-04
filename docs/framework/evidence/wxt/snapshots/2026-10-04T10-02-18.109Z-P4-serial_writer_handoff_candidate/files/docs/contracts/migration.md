# 旧 scraperConfig 迁移验收输入（阶段 01）

状态：`planned`；`productResult: not-run`。本文及 `contracts/fixtures/migration/` 是方案与完整验收预期，不是生产转换器。静态 fixture 校验成功只证明文件内部一致，不代表迁移、Chrome、保存、分页、事务或下载验收 passed。所有源码快照只读，本文不修改其他作者的契约文件。

## 来源与三类向量

以 `docs/contracts/source-snapshots/scrapyJsChrome/www/popup_crawl.js` 为旧配置证据：181–184 为内存下一页默认值；865–940 生成字段配置及 `::href`；981–1007 的 `item[key] || ''` 会吞 `0/false/null`；1237–1360 的起始 URL、下一页与分页设置来自 UI/内存而不是持久配置，其中生成代码的 pipeline 过滤没有 title 的记录；1489、1703、1895–1900 保存/载入 `scraperConfig`。旧对象复杂值分支会在超过 100 字时截断；新 raw/typed/导出预期均保留完整 150 中文字。

相关字段证据为 `scrapyJs/src/item/ItemLoader.js:55–137,204–247` 及 Chrome bundle 内对应实现：`_listContainer` 用作容器并遍历子节点，CSS/XPath 与属性后缀混用、缺失返回空串、anchor 的默认读值有 href 回退；这些行为不能被猜成已保存的 row/read/type 契约。`listSelectorCore.js` 的 nextButtonSelector 也属于实例内存；`selectorUtils.js`、`tableDataExtractor.js` 与 `ai/selector-contract.js` 提供 selector/属性映射证据，不作为新 TemplateRevision schema。架构依据是用户指定的 `product-extension-architecture-v3.md`，重点为模板与预览合同及 M03/M04/M08。manifest 固定本次读取文件的 SHA-256。

入口为 `contracts/fixtures/migration/manifest.json`。三个主向量均自包含完整 DOM 字符串、上下文、原始字节的 Base64/字节数/hash、解析后的旧配置及全部预期。

| 向量 | 输入与完整预期 |
| --- | --- |
| `single-page/vector.json` | 显式补全 URL、origin、容器/row、字段定义、空列表策略、分页 none 与列序，并提供明确的预览确认事实；输出完整不可变 revision 1、raw/typed、preview/run、精确 JSON/CSV。原始配置为 CRLF JSON；DOM 无 title 标签、title 属性或 title 字段，有可见 next link 但明确 none，不能擅自翻页。 |
| `pagination-information-lost/vector.json` | 旧配置仍可解析，但分页 selector 丢失，URL、row 含义、列序、字段定义、空列表策略及预览未确认；页面 URL/base、可见 next link 只是环境事实。输出完整 nullable draft、候选字段映射与有序 errors，不能保存、运行、导出。 |
| `illegal-config-backup/vector.json` | `javascript:example()` 与嵌套 `{code: ...}` 配置；完整上下文和 DOM 不使非法字段合法。输出安全的空字段 draft、逐项 errors 与字节相同备份，不能执行字符串、清库或覆盖旧配置。 |

主向量 ID 继承架构中的三类样例，补齐其原来缺失的具体输入及精确输出。合成 fixture 的“确认”只属于测试上下文，不能声称真实用户已确认或产品已经运行。

## TemplateRevision 完整形状

单页严格采用 `formatVersion: "1.0.0"`、`templateId`、`revision: 1`、`parentRevision: null`、`selectorDialect: "css"`；requiredCapabilities 顺序为 `dom.top.v1`, `read.text.v1`, `read.attribute.v1`, `transform.safe.v1`, `pagination.none.v1`。其余顶层字段为 `allowedOrigin,startUrl,list,fields,pagination,columns,limits,detail,contentHash`，不附加状态、compiler、label 或 fixture 元数据。

list 固定全字段 `containerSelector,rowSelector,emptyMarkerSelector,allowEmpty`；字段固定全字段 `id,label,selector,read,attribute,type,required,transforms`；pagination 仅 `{mode:"none"}`；limits 全字段为 `maxPages:50,maxRecords:10000,maxDurationMs:600000,maxStoredBytes:20971520`；detail 必须 null。字段 type 仅 string/number/boolean。text 分支显式 `attribute:null`，attribute 分支必须非空属性名。transforms 是有序白名单字符串数组，本组只使用 `trim`、`resolve-url`。

`template-revision.schema.json` 是本组单页阶段 01 预期 schema，所有对象层级 `additionalProperties:false`，且所有字段 required；不是其他作者维护的公共 schema。结构校验之外仍须核 CSS 编译、唯一字段 ID、列序恰好覆盖 fieldIds、origin 与 startUrl 匹配、能力集合、预算及 hash。draft 是单独的补全载体，其 nullable 项及候选 `pagination.nextSelector` 不属于可执行 TemplateRevision；draft 不计算 contentHash，不得把它写入模板仓库。未确认的 `draft.fields` 与 `partialMapping.fields` 只是待确认候选，旧 selector 映射不能证明其 label/type/required/transforms；不是用户确认事实。

错误数组顺序也是预期：缺失 URL → row 含义 → 空列表策略 → 分页 mode → 丢失 next → 列序 → 字段定义 → preview。非法配置先逐字段拒绝；备份在解析/转换前完成。遗漏 URL、next 或 row 必须显式补全，不能用当前页面 URL、DOM、旧默认 `button.btn-next` 或把分页降为 none 猜补。单页没有隐含下一页要求，是因为上下文已经明确确认 none。

## raw、规范类型及转换

容器限定 `.rows`，row selector 相对于容器为 `:scope > .row`，字段 selector 相对于各 row。text 读取完整 `textContent`；attribute 读取原始 `getAttribute`，不使用浏览器已解析 href 属性或 anchor 文本回退。每字段最多一个匹配；无节点或属性用 null，存在但无文本的节点用空串。可选 null 穿过 transforms/type 后仍为 null；必填判断是节点/属性缺失，不以 truthiness 判断，也不把合法空 string 判缺失。number/boolean 的空串会报严格类型错误。多匹配或必填缺失应拒绝整页 seal；不允许静默取首个、丢坏行或导出带错误的页。

`::href` 仅迁移为 `.name`、`read:"attribute"`、`attribute:"href"`，不留在 CSS selector 中。未显式确认的读值/type/transforms 不靠标签或字段名猜。trim 使用 ECMAScript String.trim 语义，只去首尾空白；原值不改写。resolve-url 在 trim 之后、string 类型检查之前，以文档 `documentBaseURI` 为基址，使用 WHATWG URL 序列化；原三类主向量的 `context.documentBaseUrl` 承载相同的 DOM baseURI 事实，新增向量显式命名 `documentBaseURI`，两者都不是 documentUrl 的别名。DOM `<base>` 与 documentUrl 故意不同；中文 query 百分号编码有精确预期。

根据主代理本轮 xhigh 复查对齐决定，**数据字段**的 resolve-url 允许跨 origin HTTP(S)，但解析后 username/password 必须均为空。可选 null 仍 null；trim 后空串拒绝 `E_RECORD_URL_EMPTY`，非法 URL 拒绝 `E_RECORD_URL_INVALID`，非 HTTP(S) 拒绝 `E_RECORD_URL_SCHEME`，包含用户名或密码拒绝 `E_RECORD_URL_CREDENTIALS`。不把空串解析成起始地址。字段 URL 只作为记录值保存，不授权任何导航、请求或翻页；**执行 target / pagination target** 仍必须严格匹配 allowedOrigin 并拒绝 credentials，跨 origin 报 `E_TARGET_ORIGIN`，credentials 报 `E_TARGET_URL_CREDENTIALS`。19 个 `strict-url/vectors.json` 向量提供完整 DOM/baseURI/context/field、raw/typed、精确错误及零网络动作预期；覆盖跨 origin https/http/协议相对链接、Unicode trim、四种 credentials、空串/纯空白、非法 host、javascript/ftp、可选缺失，以及 execution/pagination 的同 origin 与拒绝边界。

number 只接受整个字符串匹配 `-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?`，并转为有限 ECMAScript Number；exponent 语法保留。对转换后的 Number，任何整数结果必须满足 `Number.isSafeInteger`，即绝对值不超过 9007199254740991；有限非整数结果允许，不另加统一 abs 范围限制。这是数值结果规则，不能仅看 token 是否含小数点：`9007199254740992.0` 及 binary64 舍入后的 `9007199254740991.5` 都是不安全整数，必须拒绝。拒绝空串、尾缀、十六进制、NaN、Infinity、前导零、前导加号、非有限溢出与不安全整数。boolean 只接受 `true` / `false` 小写完整 token，拒绝 0/1、yes、大写与前缀字符串；不使用 Boolean(value)。type conversion 在有序 transforms 之后进行。记录可含有限小数（12.5、-12.5、1e-3）；模板不含小数。本组只核这些列出的代表值、exponent 与整数边界，不声称已测试全部小数表示、舍入或规范化规则。

单页 3 条记录覆盖 typed `0`、`false`、`""`、`null`、12.5、负数、150 中文字、逗号/引号/换行和公式字符串。raw 的 DOM text/attribute 都是字符串或 null，typed 才产生 number/boolean；两个集合分别完整保存，不用 `value || ''` 合并。字段数组与 columns 顺序故意不同：columns 固定 `count,enabled,name,name-url,empty,missing,note`，preview/run/导出按 columns，不能从 Object.keys(firstRecord) 猜。

本次拟定的单页字段决策可逐项人工审查；下面的 type/transforms 都来自该向量显式上下文，不是从旧字段名称推断。

| ID / label | selector / read / attribute | type / required | transforms |
| --- | --- | --- | --- |
| name / 名称 | `.name` / text / null | string / true | trim |
| name-url / 链接 | `.name` / attribute / href | string / false | trim → resolve-url |
| count / 数量 | `.count` / text / null | number / true | trim |
| enabled / 启用 | `.enabled` / text / null | boolean / true | trim |
| empty / 空串 | `.empty` / text / null | string / false | 无 |
| missing / 缺失 | `.missing` / text / null | string / false | 无 |
| note / 备注 | `.note` / text / null | string / false | 无 |

人工检查的关键结果为：第一行 count 是 number 0、enabled 是 boolean false，name 为 150 个汉字；第二行 name/empty 为空串、name-url/missing 为 null、count 为 number 12.5；第三行 count 为 number -2，JSON 中 name 保持 `=1+1`，安全 CSV 中变为 `'=1+1`。DOM 上存在 next link 不改变单页 none。另两类的结论是“保留备份并补全/修正”，不是把可见页面或旧 UI 默认值写成可执行模板。

`strict-conversion/vectors.json` 为 29 个补充 planned 向量，每个含独立完整 DOM、上下文、field、raw/typed/error 与 pageSealable；新增 8 个锁定负安全整数边界、不安全负整数、整数形式小数、负 exponent、有限正/负小数、整数 exponent 与舍入后的不安全整数。`template-rejection-vectors.json` 仍为原 9 个向量，覆盖顶层/list/field/pagination/limits 的未知键、非整数/不安全整数、非 ASCII 键与危险键；它们用显式 JSON Pointer mutation 引用完整单页输入，结构/domain 拒绝前不更新 hash。危险键与受限 JSON domain 先拒绝，再形状/语义校验，再 hash。预期错误码是领域方案，不声称生产已有同名实现。

## 字节、hash 与导出精确规则

legacy-config.json 是原始备份文件，包含所有原空白和 CRLF，backup SHA-256 直接针对这些字节；解析再 stringify 的结果不能替代备份。每个 blob 同时给 `path,encoding,byteLength,sha256,bytesBase64,text`，验证时这些表示必须相同。保存/迁移失败不能修改原始备份。

模板 canonicalization 为受限 JSON：对象键只能 ASCII，按 ASCII code point 升序；数组保持原顺序；字符串保留 Unicode、不做 NFC、不转义非 ASCII 或 `/`，双引号/反斜线及控制字符用 JSON 必需转义；UTF-8，无 BOM、空格、缩进或末尾换行。数值仅有限安全整数 `[-9007199254740991,9007199254740991]`，布尔/null 单独处理，整数零输出 `0`；拒绝小数、不安全整数、重复键、孤立 surrogate、非有限值和危险键 `__proto__/constructor/prototype`。先完成验证，删掉仅顶层 contentHash，再 SHA-256，输出小写 64 位 hex，无 `sha256:` 前缀。嵌套 contentHash 不在豁免范围。`single-page/template.canonical.json` 是精确 hash 输入；contentHash 算数组原序，columns/transform 顺序变化需要重新计算。

JSON artifact 是 typed records 数组，键按 columns，Unicode 原样，compact JSON，UTF-8 无 BOM、无末尾换行。JSON 字节规则独立于模板 canonicalization，不排序记录键，允许有限小数，保留 0/false/空串/null 的类型。

CSV artifact 使用 label 表头和 columns 列序，UTF-8 无 BOM，每行 CRLF，包含最终 CRLF；值含逗号、双引号、CR 或 LF 时双引号包围，内部双引号加倍。单列空值行使用 `""`，其 cell 值仍为空。null 与空串都输出空 cell，因此 CSV 不能无损恢复 JSON 类型；number 为十进制，boolean 为小写 true/false。按**字段 type** 对 string 数据和 string 表头应用公式保护：忽略前导 ECMAScript WhiteSpace/LineTerminator（等同 `trimStart()` 的字符集合）后以 `=,+,-,@` 开头，或**原字符串第一个字符**就是 TAB/CR，即在整个原 string 前加单引号。仅检测时忽略空白，输出不删除它们；字段 type number 不改，包括 -2。null 不改，空 string 仍为空。raw/typed 与 JSON 都不做公式改写；本组仅定义默认安全 CSV，不隐含授权原样模式。

45 个 `csv-formula-safety/vectors.json` 向量保存 raw/typed 原值与 JSON/CSV 精确字节预期。全部 25 个 ECMAScript trim 字符逐个测试前导 `=1+1`：U+0009/U+000B/U+000C/U+0020/U+00A0/U+1680/U+2000–U+200A/U+202F/U+205F/U+3000/U+FEFF，以及 LF/CR/U+2028/U+2029；另测 Unicode 前导的 +、-、@，混合空白，TAB/CR 开头普通文本及单字符，LF/Unicode 空白前导普通文本不改，U+200B/U+180E/U+0085 不属于该 trim 集合。还有 number/boolean/null/空串与 Unicode 公式表头。表头单测即使对应字段为 number，表头仍是 string，保护表头而不改负 number。三类原主向量、完整模板、schema 和 canonical hash 输入字节均保持不变，contentHash 仍为 `3475cba7ddc43506711b82a1865ae0228c056f074b45b364706322c057d681fa`。

不完整/非法向量的完整精确导出预期是：操作拒绝 `E_MIGRATION_NOT_EXECUTABLE`、artifact 为 null、零字节、Base64 空串。`expected-*-emitted.bin` 是“没有发出字节”的验收观察文件，不是成功的空 JSON/CSV；不能产生 `[]`、CSV 表头或下载事务。其 raw/typed/columns 空数组表示尚未执行，绝不表示成功采集到空列表。

## 本阶段验证与后续门禁

在项目根运行 `python3 contracts/fixtures/migration/verify.py`。Python 部分仅使用标准库，核原始字节/Base64/hash、DOM 与手写 raw 预期一致、完整模板形状/canonical hash、列序、JSON/CSV、blocked 导出、严格类型预期及来源 hash；它还调用仅使用 Node 内置库的 `reference-check.cjs`，用真正的 WHATWG URL、String.trim/trimStart、Number.isInteger/isSafeInteger 和 JSON.stringify 独立核对应预期。环境需有 `python3` 和 `node`，无需安装包；可单独运行 `node contracts/fixtures/migration/reference-check.cjs`。两者都是 fixture 内部校验工具，不是生产迁移器或 CSS 引擎，不向页面注入、不持久化模板、不启动任务或下载。

后续生产作者必须用真实迁移器与统一 TemplateCompiler 跑这些输入，比对完整对象、records 和 artifact 字节，并用 Chrome 核 CSS、URL/baseURI、无 title 保留、关窗重开、备份事务与运行/导出拒绝。只有取得对应产品证据，才能另写实际执行报告；本组 manifest/vector 的 planned 状态不可因静态检查成功改成产品 passed。
