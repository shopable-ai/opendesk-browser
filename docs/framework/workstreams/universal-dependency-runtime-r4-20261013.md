# Universal Dependency Runtime R4 — Controller 单文件 ESM 工作流

日期：2026-10-13。范围：OpenDesk Browser `main` 上的 Developer Edition 浏览器端 Controller 小型 ESM；不替代原 Page/Native/RunHost。

## 用户目标和版本边界

用户可以在 Developer 的「开发」中直接编写 `import` + `export default async function main()`，无需安装 npm 到扩展源码。固定包内专用 Worker 只解析/编译源码数据；完整审核、原始 SHA 缓存、来源许可和固定锁继续由既有 `page-component-dependencies` / `dependency-manager` 拥有；已编译的经典 JS 进入原 Controller RunHost→Authority→opaque Worker。Standard 不包含 Babel/Controller 浏览器编译器，必须用已有本地项目构建。原经典单文件 `async function main()` 不变。

## 真正修改的调用链

- `src/ui/script-editor.js`：对单文件导入源码进入独立检查/准备、Run 与 Save；Stop/源码变化取消迟到结果；加载已保存版本后恢复作者源码。
- `src/ui/page-component-remote.js`：复用现有「检查依赖→确认获取/复用→审核固定」UI，Controller 身份包含 `programId`，缓存命中不等价于运行授权。
- `src/scripting/user-scripts/page-component-dependencies.js`：复用统一 IndexedDB `frameworkKV` 原始 SHA 资产、命名空间、权限和下载。Controller manifest 纳入 `world=CONTROLLER`、脚本 ID 和原源码哈希；新增仅从经核验的已批准 lock 索引来源 URL 的缓存复用。相同 URL 多 SHA、损坏的 source index/cache 必须阻断而不默默联网。
- `src/ui/page-component-preparer.js` 和固定编译 Worker：新增 `controller` 源码数据编译目标，保持 React/Vue 原分支。
- `src/libs/page-frameworks/controller-esm-linker-r4.mjs`：静态 HTTPS/显式裸包映射、小型依赖图、实际导出校验、Babel CommonJS 变换、自包含 Controller JS；不执行原始第三方代码。
- `src/ui/controller-esm-source.js`：保存自包含经典执行代码和可验证的作者源码（原 Controller Revision/存储和结果合同不变）。
- `src/libs/page-frameworks/contract.js` / `scripts/verify-package.mjs`：新固定资源独立 SHA 和字节校验，仅 Developer 包携带。

## 最小可复现用户源码

```js
// @opendesk-import d3-array https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js
import max from 'd3-array';

export default async function main() {
  return { url: await page.url(), maximum: max([2,9,4]) };
}
```

此例的 HTTPS 内容已在此前 Page 原生历史里有固定 SHA 证据，但**本轮 Controller 真正 Chrome 下载/审核/Run 仍必须以新候选回执验证**。包名映射不是权限，也不自动下载。原 npm `papaparse` 常以 CJS/UMD 发布，必须先验证固定转换后 ESM 的实际导出，不接受把其原始 UMD 当 ESM。

## 限制

- Developer 浏览器内静态 ESM：最多 32 模块、单模块 128 KiB、总模块源码 256 KiB；链接结果 48 KB；保存版本的编译字节+作者快照 52 KB。大型图继续由本地受信多文件构建器完成。
- 裸包名需显式 `// @opendesk-import package https://public-host/package@x.y.z/file.mjs` 的精确版本映射；无映射报具体错误，不选择 `latest`。
- 没有自动支持 CommonJS/Node 内置模块/WASM/CSS import/动态 import/任意相对多文件工程。
- 现有依赖库资产共享不可理解为全局执行授权，删除/GC 继续遵守原引用和历史记录，禁止因删除一个脚本损坏其他 Program Revision。
- Chrome Web Store 远程代码政策及最终生产发布应另行合规审查，不能仅凭运行于隔离 Worker 推断合规。

## 验证等级（随候选更新，绝不跨级）

- `LOCAL_SMOKE_PASS`（容器，2026-10-13）：Acorn/TypeScript 替身解析和转换两个模拟 CSV ESM 模块，真实执行函数返回 `count=2,total=21`；自包含 JS 2,336 字节，SHA `a2acbc7e653fb68c6b6b065cc3334f93bc53bbcf489feab58d12302264048dbb`。**不是正式固定 Babel PASS，不是真实 Papa Parse。**
- `SOURCE_METADATA_PASS`（容器，2026-10-13）：保存作者源码、执行字节、再读取和哈希篡改阻断；使用替身 protocol digest，非完整仓库链路。
- `NODE_UNIT_PENDING`：仓库固定 Babel 7.29.9、依赖经理跨程序缓存、真实 Script Editor 定向测试，以 GitHub CI 日志为准。
- `CHROME_NOT_TESTED`：真实 Side Panel 第一次审核、依赖下载、独立固定/Run、持久 Result、Stop、重启/离线与第二程序缓存。
- `MAC_NATIVE_NOT_TESTED`：用户 `/Users/shopme/Documents/workspace/opendesk-browser` 在当前容器不可访问。
- `STANDARD_DEVELOPER_BUILD_PENDING`：必须以确切 HEAD 的生产包和 Developer 包 SHA 完成验证。
- `F3_ZIP_NOT_TESTED`：不能从组件 PASS 升级。

## 后续验收优先级

1. 固定 Babel真实 unit/构建失败先修复；不要更改测试以绕过错误。
2. Developer Chrome 真正审阅新的 ESM URL 与返回结果；单文件 import 保存后重新打开，断网重跑。
3. 第二个独立 script ID 复用 SHA 原始资产但生成新的独立审批锁；源代码变更、锁损坏、Stop 取消校验。
4. 证据引用与候选 source SHA、extension packageHash、runId/resultId、预装 SDK ABI 严格一致。
5. Page 普通单文件与独立工具及定时任务接入仍是下一阶段 P2/P3，不宣称全部支持。
