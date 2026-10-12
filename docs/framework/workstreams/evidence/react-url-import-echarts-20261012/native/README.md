# 最终合并输入的 Resolver 与运行资源测量

测量时间：2026-10-12T11:43:26.653Z。main 基线：259c6d56a52b64f0d01fbe03acc06d49a5beaef9。该 SHA 是测量时的仓库 HEAD；本任务生产改动仍在工作区，实际输入见 repository-inputs.json 与 resolved.full.json。

## 实际输入身份

- sourceHash：8d3eedccdf62d90ddafcad3752e184ccd975479b51f649cb0b12595028ab2146
- sourceBytes：482082
- inputHash / sourceRevision：5cd5fe05bf3f8092c3e064a74be3ced3934045f084fbc5b01feb8f464a8cc8f3
- artifactId：a15ab86d2113aabaa2630b941bb735b9dfc8d1f248b54d096837f9e93cdd19da
- buildIdentity：e3cf68e80d8afc0e31d1753197fbac4f3767cf75d32ca3369d24d94f132aa8a2
- bindingId：local-2aac94926b8071ed6afb
- 实际构建 1 次，cacheHit=false；241 个源输入记录；sourceMap 2,650,400 B，不参与运行资源加载。

## 完整报文

report.json 给出全部帧大小和 SHA；frames.full.json 保留 inline 假设响应及 project.resolve、20 个 project.source.read、最终 project.source.validate 的完整请求与响应。native-requests.bin / native-responses.bin 保留同一序列实际序列化后的 Native 长度头和消息正文。正向 MCP 超限请求完整保存在 forward-page-preview.full.json。

- 原 inline resolve 响应 JSON：491,042 B；descriptor 响应：1,479 B。
- chunk 请求最大：545 B；chunk 响应最大：33,331 B，含 Native 4 字节头为 33,335 B。
- 最终校验请求 / 响应：533 / 516 B。
- MAX_BYTES 保持 61,440；每块最多 24,576 B 原文 / 32,768 B base64。
- 所有分块帧经原 encode/frame 校验。全量重组等于实际 sourceUtf8，最终校验复用原 frozen Resolver 缓存与输入守卫。

## 固定运行资源复用

runtime-reuse-report.json 比较当前 dist/production 的 7 个真实文件（manifest + 6 个运行资源）与先前快照，全部字节和 SHA 一致。当前真实 loadBuiltinPageSource、loadPackagedPageFramework('react')、compileLockedPageSource 重新组装结果也与旧报告全部一致。

- 固定内置运行 JS 合并：42,247 B；React 19.2.0：193,163 B。
- 必需运行资源原文件合计：235,398 B；加 manifest 本地读取总计 239,951 B。
- 单个 USER_SCRIPT 执行 JS：718,450 B，SHA 811d5c3f49af36164b956d040a8897942c71c20b209c912ef92a021708c6d824。
- 完整 JS 数组 JSON：732,096 B；execute 请求 JSON：732,232 B。
- 独立 managed lifecycle bootstrap：3,695 B；对应 execute 请求：3,895 B。
- runtime-*.js / runtime-*.json 保留本次完整重组字节。既有 ../measure-runtime/ 报告可复用，全部旧证据均保留。

## 实际边界

本次执行了实际离线 Resolver 构建、真实缓存分块读与最终输入校验，并测量运行请求组装；没有触发扩展 npm build/dev，没有改仓库，没有进行 Native socket、用户 Mac 或 Chrome 运行。providerEpoch、transferId、requestId、target/documentId、receiptNonce 均为明确标注的测量参数，不能当作实际浏览器回执。

正式外部 Go Host 仍需独立实现并协商 localDevSourceVersion=1；浏览器仓库内的新 Node Host 代码不等于用户已安装的 Go Host 升级成功。能力不足时大源码路径明确 E_NATIVE_UPDATE_REQUIRED。实验 Node Host 不具备正式 CLI R17 的完整 localDevMultiVersion / localFilesVersion / localDevAccessVersion 能力，不应当作 CLI 替代。

正向 MCP run 仍走 inline page.preview：本次实际 LocalDevSession.run 得到 E_LIMIT / NOT_DISPATCHED，jsonBytes=490610，limitBytes=61440；只调用 target.current，未派发 page.preview，admissionRecords=0。反向 UI 的 frozen source 读取支持分块，不能据此宣称正向 MCP 大包也完成。
