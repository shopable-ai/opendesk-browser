# 基础能力测试与新对话接续入口

当前阶段0/F1已通过；F2产品迁移与接线未完成，F3未验收。可以运行现有基础模块测试，当前主包尚不能证明完整控制脚本与独立页面SDK可用。

## 最新实际检查

证据：`evidence/basic-capability-readiness-20261002/verification.json`。检查期间产品/构建输入无漂移。

|检查|当前结果|证明范围|
|---|---|---|
|`npm run check`|通过，65个source/test/build文件|语法检查|
|foundation + K2/K3/K4基础测试|208/210通过，2失败|serial/callback/上下文/页面求值/codec/真实Node loopback HTTP等模块边界|
|两项失败单独重跑|1通过，1失败|页面短ACK单独通过；SDK grant/storage接口差异持续失败|
|`npm test`|16/20通过，4失败|旧dist最低Chrome120与当前verify要求138不符；4项变异测试未触达目标断言|
|现有主`dist/production`|旧环境阶段包|不含固定SDK入口、控制sandbox、通知icon、MIT；不是当前F2产品包|

旧foundation122/122与K2/K4 75/75是先前源码检查，不能替代当前发生变化后的结果。已有Chrome138/154控制组件、页面执行组件与HTTP-origin IDB证据仍按各报告的源码hash和边界使用，不扩写为主包原生SDK/SW验收。

## 现在可执行的基础检查

工作目录固定为 `/Users/shopme/Documents/workspace/opendesk-browser`。

```sh
npm run check
node --test tests/foundation/*.test.mjs tests/framework/k2-*.test.mjs tests/framework/k3-*.test.mjs tests/framework/k4-*.test.mjs
```

仅重现当前两项问题：

```sh
node --test --test-name-pattern='packaged DOM agent returns short ACK|shared authority-issued SDK context' tests/foundation/page-port-service.test.mjs tests/foundation/storage.test.mjs
```

现有真实Chrome组件入口：

```sh
node tests/framework/k3-native-registry.mjs
node tests/framework/k3-control-native.mjs
```

它们使用已缓存的Chrome138/154与自己的临时profile/组件产物，只证明报告声明的组件能力，不是最终主扩展包。源码变化后核对其source manifest再决定重跑；不要操作用户现有Chrome profile。

## 新对话优先顺序

1. 修复SDK grant/storage测试接线：`tests/foundation/storage.test.mjs:284`向`grantSdk`传了`allowedOrigins`，当前`src/platform/host/sdk-methods.js:49`只接受tabId/frameId/documentId/capabilities，拒绝E_SCHEMA。按冻结合同决定接口/fixture对齐，不能为了过测试扩大网页授予权限的能力。
2. 修复页面短ACK回归的并发稳定性：`tests/foundation/page-port-service.test.mjs:127`在两个固定turn后假定PAGE_DATA已到，整组运行frame缺失，单独运行通过。确认生产短ACK→显式frame ACK→PAGE_END顺序，按真实事件等待取证；保留原断言，不skip、不改成功条件。
3. 验证已存在的`src/platform/storage/session.js`、broker注入与SW导航/权限/关页失效事件；这些已写入源码，不再当成缺文件，不重新造第二adapter。主SDK authority/broker尚需准入/去重/撤权/15s/未知效果及真实sender/原生session的针对性证明。
4. 完成主构建：固定MAIN/ISOLATED SDK入口、批准的sandbox/Worker、通知icon与MIT；保持特权CSP和资源scanner要求。重建当前候选再跑environment/package变异测试，不修改断言绕过旧dist。
5. 解除`src/run-host.js`对`createScrapingModule`/template/compileTemplate的通用运行依赖，接当前ChromePage/context/control到同一authority/target/PagePort；通过真实入口运行普通JS并验证停止、结果、持久版本和目标绑定。
6. 独立页面SDK原生Hello→调用→原Promise验证，不启动controller；再进入固定同一最终包的原603及全部F3必选验收。

完整续接要求：`prompts/continue-product-migration-20261002.txt`，仍须完整读取v5及历史附件。当前可测不表示已完成或全部基础测试通过，不关闭任何原始603项、不标F3通过。
