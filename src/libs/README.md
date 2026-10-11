# OpenDesk 公共预装类库

2026-10-11 R1.1。先读 [公共预装能力合同](../../docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md)；它是当前范围、目标 API、运行世界和验收的唯一说明。用户程序是公共库消费者，不能用框架内部相似服务冒充已实现。

## 本次确定的结论

**公共日期库只用 Day.js，不预装 Moment，不新增 packages/moment.js，不用 moment=dayjs 假兼容。** 按用户最新决定，以 Day.js 的官方 duration/utc/timezone/customParseFormat 插件满足当前日期需求；旧 Moment 脚本须显式迁移测试。这个日期特例不删除其他公共库需求。

packages 是上游库入口，adapters 是确有需要的环境转换，vendor 是必须原字节发布的独立资源。不是三套依赖管理器。

## 当前源码已有，完整目标仍未完成

核查基线：`53b09e45036c39a3dda8f638a992677cddae0135`。

| 当前库 | 源码位置 | 当前 API/边界 |
| --- | --- | --- |
| Lodash | packages/lodash.js；node_modules/lodash-es/ | get/has/words/trim/uniq/chunk/escape/truncate 八方法 |
| Day.js | packages/dayjs.js；node_modules/dayjs/ | 核心日期 + isDayjs；上述四插件尚未接入 |
| jQuery | vendor/jquery/3.7.1/jquery.min.js + LICENSE.txt | USER_SCRIPT 明确选择；原字节资源 |
| my-utils | vendor/my-utils/1.0.0/index.js + LICENSE.txt | upper 演示及已有 ABI 兼容；不是第三方库 |

runtime-contract/catalog 是唯一登记，loader/bootstrap/core/identity 负责现有固定资源加载与 API/版本检查。它们仍需扩展通用可选库和新接口身份；不能只创建包装文件就宣布用户能运行。

## 确定的目标目录

下列“新增”是待实施位置，README 更新不创建这些运行文件。

```text
src/libs/
  README.md / AGENTS.md
  runtime-contract.js / catalog.js
  core.js / loader.js / identity.js
  runtime/bootstrap.js
  packages/
    lodash.js                已有
    dayjs.js                 已有，待扩展固定官方插件
    axios.js                 新增：真实 Axios
    crypto-js.js             新增
    js-cookie.js             新增
    query-string.js          新增
    store.js                 新增
    file-saver.js            新增
    cheerio.js               新增
    fingerprintjs.js         新增，明确选择/隐私/许可门槛
    socket-io.js             新增，客户端及真实连接清理
    react.js                 新增
    react-dom.js             新增，与 react 同一物理构建组
    vue.js                   新增
  adapters/
    axios-transport.js       计划新增，仅受权请求协议转换
  styles/
    tailwind.input.css       新增
    tailwind-classes.json    新增
  vendor/
    jquery/3.7.1/            已有 JS + LICENSE.txt
    my-utils/1.0.0/          已有自有示例 + LICENSE.txt，暂保兼容
```

adapters 不预建 store-backend/file-save/socket-lifecycle；优先复用现有后端和生命周期，实证需要后才拆分。Axios 转换器接收现有客户端的窄接口，不能直接导入受信 network.js/Broker/chrome.*，不能在自己目录管理权限或创建第二 HTTP 客户端。授权仍由现有 Broker 验证；用户不用写 adapter。

内部 axiosx/fetch/WebCrypto/Storage 不能替代未发布的 axios/CryptoJS/store 公开 API。store、FileSaver 及网络在不支持的世界必须明确失败，不假造持久化/下载/跨站能力。Cheerio、FingerprintJS、Socket.IO、React/Vue/Tailwind 均仍在本次公共目标中，不因缺内部消费者被剔除。TimeReview/旧远控业务及 Monaco/ECharts/Docsify 不在本轮迁移范围。

## 源码、构建和运行去向

```text
根 package.json + package-lock.json
  -> node_modules（真实 npm 构建输入）
  -> packages/<id>.js（公共入口/实例注册）
  -> 现有 WXT 固定入口 -> dist/<mode>/libs/packages/<id>.js
  -> manifest / 版本 / SHA / 世界校验
  -> 获准的 Controller、USER_SCRIPT 或隔离工具程序
```

React 与 ReactDOM 的两个源码入口在一个构建图中共享上游 React，合成一个 `libs/packages/react-ui.js` 物理资源；逻辑库组只登记在现有 catalog。Tailwind 是本地构建的 `libs/styles/tailwind.css`，不是注入 SW 的 tailwind.js。

vendor 仅按原字节复制；代码及 LICENSE 的来源/版本/字节数/SHA 登记在现有 catalog/runtime-contract。不能同时复制 npm 与 vendor 两套正式库，不另造 vendor manifest，不修改旧文件后仍称原样。不在网站 MAIN 自动注册库或全局注入样式。

## 查库与验收

```sh
npm run libs:list
npm run libs:check
npm run libs:doctor -- --strict
```

这些命令仍只诊断正式登记能力；计划中的库不会因写入 README 而出现在 libs:list。doctor 包检查需相应构建，不能替代 Chrome。

运行代码修改后，按 testing-guide 核对复用证据，再执行 check、build、build:dev、verify、test、build:size、pack、pack:dev 及同候选原生验证。重点包含 Day.js 用户可见插件、Axios 状态码/错误/取消/序列化与权限、vendor 原字节和许可证、真实工具 UI 生命周期。

**本次仅更新设计文档。新运行库、日期插件与 adapter NOT_IMPLEMENTED；工程测试 NOT_TESTED；Chrome NATIVE_UNVERIFIED。**
