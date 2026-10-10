# eeb3af02 实际双包字节独立核验补充

结论：**PASS：开发 / 生产真实编译 ZIP、构建收据、固定 Git 输入与同源原生 Chrome 开发包全部一致。** 本补充保留先前原生核验报告原样，仅完成当时尚未取得的实际编译文件字节绑定；不修改仓库、原始 artifact、旧结果或评分。

- 固定源码：`eeb3af02ca79eb63d6251195f326f977a7ab5b1d`。
- [原始双包 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996052) / [job 114195531942](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996052/job/114195531942) / [artifact 11667618947](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996052/artifacts/11667618947)。独立读取 GitHub 确认 main、同一 SHA、attempt 1、run/job success。
- 外层原件 **1,958,481 B**；SHA-256 **`f0239666ff7fa3dc6848ab2cd3072dc512183d6efd4751fa313d11f6f3624f2a`**，与 GitHub artifact digest 相同。6 个原始成员路径、CRC 和已有解压字节全部一致。

| 核验项 | Development | Production |
| --- | --- | --- |
| 实际编译文件数 | 47 | 32 |
| 安装 ZIP 字节数 | 1,417,462 | 497,753 |
| `sw.js` 字节数 | 327,690 | 327,524 |
| 安装 ZIP SHA-256 | `3a6662a964e24adfbe9ca37fdc652a04a35c4e9b53e42dae1ff191056a22642a` | `b5ee82c107a760d7f9dabd952aa432580a70a2d3c9e1a9e87d2aaaaaccb2e8de` |
| packageHash | `0054113f15c3015829fa31ccdecd1ee01b50d6f1766b5a91e96d2a9d2e8ae5c1` | `a5b44721edd8d842627d029b2dfa72c1630b264bc216a26bf4219c8e2fea4159` |

直接读取内层 ZIP 的 **47 + 32 个实际文件**，逐项重算长度与 SHA-256；全部与各自 build report 的完整文件列表一致。按照报告稳定顺序重算 packageHash，与 build report 和 pack receipt 一致；两个 ZIP 的实际长度与整体 SHA 均与 pack receipt 一致。完整实际文件收据保存在同名 JSON 的 `compiledFileReceipts` 中，没有仅依赖报告声明的文件哈希。

开发、生产及 Mac 原生构建的 **193 个 sourceInputs 完全相同**，并且全部长度 / SHA 匹配不可变 Git `eeb3af02` 对象。各构建无 sourceDriftDuringBuild。Mac 原生证据中的完整开发包 report 与这里实际重算的开发包 report 完全一致，绑定原生 [run 38045996123](https://github.com/shopable-ai/opendesk-browser/actions/runs/38045996123)，其 runtime acceptance 为 PASS。

因此，先前原生报告关于“native ZIP 不含编译本体”的原始描述仍成立；本次独立下载的双包原件已补上同版本实际编译字节证明。没有将旧 6d1ab8f / bd76b2d 包指纹用于当前版本。原生撤销 / 恢复等未测项、并行 Controller HTML / R13 的原始 FAIL 和总体评分均未变化。
