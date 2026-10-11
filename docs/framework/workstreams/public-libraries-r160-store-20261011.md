# R16.0 真实 store.js（Page 同步持久适配）

日期：2026-10-11。沿现有唯一 catalog、ABI、WXT 固定打包、manifest SHA 与普通 Page USER_SCRIPT 按需加载接入 `store@2.0.12`（MIT）。根 npm package-lock 使用第三方原始已发布 yarn lock 的真实 SRI，npm ci 必须实际核验。

支持 `// @opendesk-lib store`，用户无需自行安装 npm。运行 `store.get/set/remove/each/clearAll` 通过真实 store.js createStore() 引擎，定制同步存储适配器的前缀仅属于当前工具身份。Page 正式安装使用 extension namespace + programId 的稳定 SHA；临时预览使用 sourceHash。clearAll 和 each 只操作当前身份前缀，不能清理整个网站或其他 OpenDesk 工具的键。不可用时抛 E_STORAGE_UNAVAILABLE，禁止静默退化到内存。

**隐私和权限边界**：此存储位于目标网站 origin 的 `localStorage`，网站代码可能读到这些键值，绝不是扩展私有/加密储存，用户不得存放凭据或敏感数据。若需扩展私有持久数据，继续使用既有 AppStorage/SDK，不用 store.js 假冒。USER_SCRIPT 无法阻止用户源码直接操作网站 localStorage；包装器的作用是让 store API 不误删除无关数据，而不是安全隔离网站脚本。

不自动注入网站 MAIN、不添加权限/新 Broker、不复用 Moment、不复制 vendor。此提交含源码、Node 和正式产物测试；同候选生产/dev 构建、完整 CI、用户原生 Chrome 持久测试及 ZIP 均必须回读后再定等级。Controller 的同步持久 store.js 仍未实现，不能称双环境合同完成。
