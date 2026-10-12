# React URL import / ECharts 原始证据

对应 [工作记录](../../react-url-import-echarts-20261012.md)。本目录保存源码、离线构建、模型、完整运行/Native 序列化测量和被环境阻断的 Chrome 探针。实际 Chrome CI 回执另行追加，不能从本目录已有模型日志推定。

- `input-identity.json`：本轮修改的实际输入、五个 HTTPS 根、原始锁 SHA、canonical 锁 SHA、完整执行源和 JSON 身份。
- `validation.json`：每组验证范围、历史失败、局部 PASS、包身份和未测试边界。测试有交集，不相加形成产品分母。
- `tests/`：原始 TAP、source check 和固定 linker 的生成结果。`echarts-json-regression.tap` 中五项真实 builder 通过，四项 capsule fixture 当时失败；修复 fixture 的独立日志和最终 116 项日志均保留。
- `dependencies/`：实际 npm tarball SHA-512 校验记录、原始 HTTPS/包图、许可证来源和实测选型。实际 235 个固定原始模块和许可证在原示例目录，未复制第二套缓存。
- `builds/`：原始 production/development 构建输入清单、包报告、verify，以及最初浏览器探针对应的 baseline。包身份按各自输入保存；之后无关 main 更新不改写旧报告。
- `attempts/`：首次 chunk 失败、后续固定构建、自己已结束的输出锁及安全清理记录。没有删除失败历史。
- `runtime/`：固定运行资源及完整 USER_SCRIPT 请求。测量 nonce/documentId 不是真实浏览器身份。
- `native/`：实际离线 Resolver 报告、完整输入哈希对象、完整 resolved 对象、所有请求/响应及二进制长度帧、主动 MCP 超限的原请求。只做固定源读取和序列化，不宣称 live socket/Go/Mac PASS。
- `browser-probe/`：原 CI 复用核查、Linux AF_UNIX/Chrome 阻断、真实 baseline 包身份和驱动静态审阅；没有将此探针转换为验收成功。

`.gz` 文件是原文件的无损 gzip。可在独立目录解压恢复原报告所引用的原名；`manifest.json` 同时记录归档及解压后原字节的 SHA-256/大小。Native `report.json` 中引用的 `source.js` 与示例 JSON 的 `sourceUtf8` 完全相同，runtime 完整执行字节可从保存的请求 `js` 字段恢复。无需运行用户代码即可复核尺寸与哈希。

仓库范围外的旧测量路径只表示来源，使用本目录的同名或 `.gz` 档案复核。测试/测量脚本、字节身份、真实 Chrome 回执是不同证据等级。完整发布/F3/ZIP 不在这些局部记录中自动关闭。
