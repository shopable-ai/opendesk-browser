# R15.8 FileSaver 真实 npm 固定资源增量

日期：2026-10-11。本增量继续复用 src/libs 现有 Catalog、ABI、WXT entry、资源 SHA 清单与 USER_SCRIPT 显式选择；不新增 vendor 注册表或 Chrome 权限。

引入 file-saver@2.0.5（MIT，真实 npm tarball integrity），把 node_modules/file-saver/LICENSE.md 复制到原资源清单。

声明 // @opendesk-lib file-saver 后，Page USER_SCRIPT 提供 FileSaver.saveAs(blob, filename, options)。仅接受 Blob/File，拒绝 URL、目录分隔符及大于64MiB的 Blob。调用后不能宣称实际落盘；原生 Chrome 可能要求用户手势或交互确认。

附带 Node 组件测试、production/development 实际打包文件 SHA 测试、原生 CFT 临时包固定 entry。当前生产 SW 构建仍受其他并行任务及硬预算阻断，因此没有同候选 Chrome 下载回执，状态 NATIVE_UNVERIFIED。保持 327680 B 硬限制，不扩大权限。

尚未完成 Axios、query-string、store、Cheerio、FingerprintJS、Socket.IO、Tailwind。
