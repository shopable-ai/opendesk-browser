# R9.1：Background 框架第三方库恢复与真实消费者迁移方案

> 状态：**架构修正与实施验收合同；不是已完成代码或 95 分验收结果**。2026-10-09，针对 R9 曾将 Page USER_SCRIPT 的 lodash-es 示例当作 Background 依赖完成证据的错误进行纠正。以主分支实际源码为准。

## 一、结论优先

**旧 Background 的框架依赖迁移没有完成。** 旧版 background-sw.js 使用 importScripts 顺序加载 17 项脚本（其中 6 项独立第三方库）；旧版已经构建好的 background.js 还内嵌 npm lodash 4.17.21、Moment、Axios 和 query-string，并非单纯 CDN 或网页脚本依赖。新版扩展根 package.json 没有 lodash-es/lodash、moment、axios、query-string 等生产运行依赖。现有 examples/programs/page-npm-lodash 是 Page USER_SCRIPT 示例，不能证明 Background 获得 Lodash，也不能证明旧功能已迁移。

**目标**：让新版受信任的 Background 框架源码通过静态 ESM/npm import 使用真正需要的第三方库，并保留适当的旧功能语义；其他执行世界独立处理，不增加任意动态特权脚本加载器。

## 二、源文件在哪里、实际需要什么

| 旧证据/源码 | 旧版真实用途 | 目前新版状态 | 修复责任 |
| --- | --- | --- | --- |
| assets/js/libs/lodash.min.js；background.js 内嵌 node_modules/lodash/lodash.js | Background 加载；src-bex/TimeReview.ts 调用 throttle、isEmpty、sortBy、values | 根 package.json 未安装；Page lodash-es 示例**不属于** Background | 有保留消费者时，根依赖+Background import+等价测试；新代码优先细粒度 lodash-es，需 CJS 兼容时单独评估 lodash，避免双份打包 |
| assets/js/libs/moment.min.js；background.js 内嵌 moment | TimeReview 时间格式、endOf、duration；旧 background.ts 日志及日期 | Date/Intl 仅部分覆盖，不是 Moment API 替换 | 按仍保留的调用逐项迁移；行为有差异时使用固定版本兼容模块 |
| assets/js/libs/axios.min.js；background.js 内嵌 axios | TimeReview 及旧 background 桥 HTTP；历史请求可含认证/headers | src/framework/sdk/http.js 是**网页 SDK 门面**，src/platform/chrome/network.js 是**受授权的受限 fetch 服务**，不是完整 Axios | 逐消费者决定：受信核心直连也需策略与审计；需要 Axios 完整语义时以根依赖引入，并避免突破 Broker 权限 |
| assets/js/libs/query-string.min.js；background.js 内嵌 query-string | URL 参数工具，旧包有源码但待确认保留消费者 | URLSearchParams 不等价于 query-string 的所有选项与数组格式 | 针对调用定义回归向量，再决定 npm 包或原生实现 |
| assets/js/libs/fingerprintjs@3.js；assets/js/core/utils.js | 旧 getFingerprint 直接 FingerprintJS.load() | src/framework/sdk/utils.js 当前明确抛出 E_RESOURCE_UNAVAILABLE；未完成迁移 | 如果产品确实需要，单独用户授权和合适 DOM 环境执行；SW 无 DOM，不得假装 SW 可直接执行浏览器指纹采集 |
| assets/js/libs/cheerio.1.0.0.min.js | 旧后台采集/HTML 处理，具体可保留消费者待核实 | 没有 Cheerio 兼容层；Page DOM/Locator 不是 Cheerio | 只有确认仍属产品需求后迁移；Node 依赖不能不验证就运行在 SW |
| 其余 core/bridge、common、webRequestBg、serverUtils、ChromePage、TraceTimeUtil、scrapyJs 与站点任务 | 混合框架核心、通信和历史站点业务 | 新 Broker / Controller / SDK 部分承接；并未逐导出/行为一对一证明 | 建立 API/消费者级清单，区分保留、替换、延期、正式删除，不可仅凭相似名称判完成 |

上述依据来自 docs/contracts/source-snapshots/scrapyJsChrome/background-sw.js、background.js（内含 src-bex/TimeReview.ts 及 background.ts 源模块注释）、assets/js/core/utils.js、新版根 package.json、src/framework/sdk/utils.js、src/platform/chrome/network.js 和 src/framework/sdk/http.js。注意：历史加载列表不保证旧库在 MV3 Worker 实际能够正常运行；必须有真实调用及 Chrome 回执。

## 三、推荐实现：唯一 Background 构建链

```text
根 package.json + package-lock.json（扩展自身的、精确锁定的生产 dependencies）
  -> src/entrypoints/background.js
  -> src/sw.js
  -> src/platform/host/* / src/platform/chrome/* / 其他确有需要的受信模块
     -> import { throttle, isEmpty, sortBy, values } from 'lodash-es'
     -> 按确认的消费者 import 其他 npm 包或自有薄适配器
  -> 现有 WXT/Vite/Rollup，单一受信 Background 产物
  -> dist/production/sw.js（保留现有 build receipt 的 bundleModules 溯源）

另一路：用户项目 package.json -> Webpack -> program.js -> USER_SCRIPT 或受控 Controller。
两路锁文件、消费者、运行世界、权限全部隔离，互不充当验收证据。
```

1. **先真实消费者、后依赖安装**：提取旧打包背景源码的调用链；每一项写出旧 API、是否当前产品功能、现有新消费者、行为向量和决定。纯业务遥测、特定站点抓取、旧远程命令通道不能因为曾加载而自动重启。
2. **让框架直接 import**：确认要保留的能力在扩展根 npm 安装固定版本及锁文件；受信 Background 代码静态 import。不要求在用户 Page/Controller Program 里安装一遍，不自动提供全局 _ 或 moment。确需短期 globals 的迁移脚本只在明确定义的私有兼容模块内适配，附弃用期限与测试。
3. **安全与语义优先**：时间/查询库按真实测试向量选择；Axios 不能绕开现有 Host Authority 的来源、目标、权限及请求范围；指纹识别/DOM 库不能硬塞进无 DOM 的 Service Worker。不得恢复未审核的站点采集、遥测或远程指令执行。
4. **守住真实工程约束**：当前生产 sw.js 327661 字节，原预算 327680 字节，只余 19 字节。先去重与瘦身、必要时评审预算及构建形态；不把增加限额伪装成性能修复，不通过 importScripts 全量加载旧 vendor 去绕开 bundle/modules 审查。不新增第二个 Broker/构建器。
5. **多文件源码不等于多份运行时文件**：源码可拆成任意多个 ESM 模块，WXT 汇总到当前单产物；绝非要求退回一个巨大手写 js。生产库来源可在根 node_modules，最终入 sw.js；是否真的入包以 Rollup bundleModules 与运行结果为准。

## 四、验收门槛（未完成前不宣称 95+）

- P0 一份版本化的旧 Background API/消费者矩阵：每行路径、原调用、保留与否、新文件、npm 名称/版本、目标产物、权限、语义测试、证据与负责人，未经证明不得标 DONE。
- P0 至少一个**保留的真实 Background 消费者**在新版 src/platform/* 或框架固定服务中静态 import Lodash，执行 throttle/isEmpty/sortBy/values 必要用例；证明用户 Page 示例不是替代品。无产品消费者时应明确说明并给出单独的开发者能力策略，而不是伪造调用。
- P0 干净 npm ci、npm 锁文件检查、许可证/供应链检查，生产+开发 WXT 构建、package/ZIP 校验，bundleModules 中可定位新依赖和真实 Background sw.js 的 SHA/bytes。
- P0 Chrome MV3 真实启动、授权操作、Service Worker 睡眠/重启后再次调用；网络有权限及拒绝路径；无跨世界全局污染、无运行时远程脚本；保留对 Native、SDK、Controller、Page 的回归。
- P1 Moment 日期边界/时区、query-string 数组/编码、Axios 旧参数/响应/异常等针对实际保留消费者的对比用例；不保留的旧行为给出明确移除理由，不能打勾表示兼容。
- P1 生成清晰的迁移表与运行指南，文档里显示缺口及验收等级，最终在 main 对照 GitHub CI 和真实 Chrome 记录，不以设计评分冒充验收结果。

## 五、分阶段推进与评分规则

| 阶段 | 内容 | 退出条件 |
| --- | --- | --- |
| R9.1-A | 旧 bundle 内 npm 包和实际消费者扫描、库分类、背景缺口冻结 | 所有仍承诺的 API 有明确去向；识别出旧 bundle 与 importScripts 的重复依赖 |
| R9.1-B | 保留的纯工具/时间/URL 库根依赖和 Background 真实消费者迁移；控制 SW 体积 | 独立可重复 npm ci + WXT 构建 + 真实调用测试，非 Page 专用示例 |
| R9.1-C | 网络、指纹、HTML/采集等跨环境需求逐一迁移或明确退役 | Broker 授权、不越权、不假兼容，必要的 Chrome E2E |
| R9.1-D | Mac Chrome 真实重启/恢复、回归、main 集成 | 验收证据完整、失败透明、远端仅保留 main（不删除未合改动） |

专家目标 95/100 只是**未来验收标准**，不是当前实现分数。采用：需求/职责准确性 20、旧消费者与功能闭环 25、Background 可用性及构建溯源 20、MV3 安全/生命周期 20、真实验收及文档 15。任一 P0 失败，最高记 89 分；只有 95+ 且所有 P0 真实通过才可标为正式完成。禁止用 Page USER_SCRIPT 的 npm 测试填充 Background 项目得分。

## 六、执行纪律

默认直接在 main 开发，但先 fetch 最新 HEAD 和目标文件 SHA，保护协作者修改；不创建平行构建工具或 UI；涉及依赖锁必须用真正 npm ci 复验，不手写伪造锁。没有 Mac 本地环境时，真实 Chrome 阶段明确标 BLOCKED 并提供精准 Codex 本地复验入口。本文件是修正规范，不是完成声明。
