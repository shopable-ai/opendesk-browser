# OpenDesk 公共预装类库

先读 [公共预装类库能力合同](../../docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md)。它固定用户已明确的范围、目标路径、API、运行世界和未完成项；目录文件数量不是完成度。

## 当前已经存在

`runtime-contract.js` / `catalog.js` 是唯一运行合同和作者元数据；`loader.js` 校验本地扩展资源，`runtime/bootstrap.js` 注册，`core.js` 安装公开对象，`identity.js` 约束版本身份。

| 当前库 | 源码位置 | 已有 API/边界 |
| --- | --- | --- |
| Lodash | `packages/lodash.js`；构建源码 `node_modules/lodash-es/` | get/has/words/trim/uniq/chunk/escape/truncate 八方法 |
| Day.js | `packages/dayjs.js`；构建源码 `node_modules/dayjs/` | 核心日期函数、isDayjs；不是 Moment 全量兼容 |
| jQuery | `vendor/jquery/3.7.1/jquery.min.js` + LICENSE.txt | USER_SCRIPT 明确选择 |
| my-utils | `vendor/my-utils/1.0.0/index.js` + LICENSE.txt | upper 演示及已有 ABI 兼容 |

核查基线：72bcc0451294c1f709eaf667626e10d45a8eb50e。上表不是本次 Chrome 验收声明。

## 不能丢失的新增目标

Axios、Moment、CryptoJS、js-cookie、query-string、store.js、FileSaver、Cheerio、FingerprintJS、Socket.IO Client、React、ReactDOM、Vue 应提供真实公共预装实现；目标入口为 `packages/<id>.js`，详见合同逐库表。Tailwind 通过 `styles/` 预编译 CSS 供给用户 UI。**新增文件尚未实现，不能因为 README 列出名称就认为可以调用。**

内部 axiosx/fetch/WebCrypto/存储服务不是对应上游库的替代交付。预装可选也不是要求普通用户自己 npm 安装。业务排除不等于通用库排除；本轮不迁移 TimeReview/旧远控业务或 Monaco/ECharts/Docsify。

## 源码到运行时

```text
根 package.json + package-lock.json
  -> node_modules（npm 构建输入，不复制全部源码进 src/libs）
  -> packages/<id>.js（真实上游库适配器）
  -> 现有 WXT 固定入口 / dist/<mode>/libs/packages/<id>.js
  -> libs/manifest.json + SHA/版本/世界检查
  -> Controller / USER_SCRIPT / 工具 sandbox 中获准的用户程序
```

必须保留原字节的经典 JS 才放 `vendor/<id>/<version>/`，附许可证和哈希。不要新建第二注册表、随意复制旧 min.js 或将所有库打进 SW。

## 当前可用命令

```sh
npm run libs:list
npm run libs:check
npm run libs:doctor -- --strict
```

`libs:list` 只显示正式登记库，不显示尚未接入目标。doctor 的包检查需要相应构建，也不是 Chrome 回执。公共库变更须执行现有 check/build/build:dev/verify/test/build:size/pack/pack:dev 和对应世界真实测试；先按仓库测试复用/资源占用规则核对范围。

本次只固化需求和目录，不修改运行时代码、npm 锁或构建产物。
