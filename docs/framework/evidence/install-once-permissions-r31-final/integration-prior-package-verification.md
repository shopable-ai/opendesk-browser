# R16 编译产物独立字节核验

结论：**构建绑定 PASS；不能替代本提交失败的原生运行验收。**

- 源码 `bd76b2d19a9fa72fa6fa793202813f83d70793f7`，原始 GitHub package run `38043201706` 为 main 上 success，artifact `11666339301` 的 digest 与下载字节一致：`96dab1eeeef5d62c22232f4667222d6d1d3e5ced6e927baa2e101d2d9bdc5e10`。
- 外层 6 个成员、两个内层 ZIP 的 CRC、ZIP 大小与 SHA-256 均与原始 receipts 一致。
- Development **45 个实际编译文件**逐一重算大小与 SHA-256，packageHash：`dfba0b065b6d825d75a5270e2d3b1a0a9372c355983c681396712724a6a251e4`。
- Production **30 个实际编译文件**逐一重算大小与 SHA-256，packageHash：`c11a26da9ce32717a6f9d69a106d7914d4fb6a213f64d025789d596c523c0333`；production `sw.js` **326336 bytes**。
- 两种构建的 184 项源输入相同，逐字节匹配 Git 提交。Mac 原生 job 的完整 development 包指纹与 Linux package job 的真实编译字节完全对应。
- 本提交原生 job 在 B 停用时序检查处失败，业务文档数为 0。后续 driver/helper 测试修复的新原生 PASS 若保留同一源输入及包指纹，可复用此真实编译字节证据；目前没有将构建 PASS 写成原生运行 PASS。

[原始 package CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38043201706) · [原始 artifact](https://github.com/shopable-ai/opendesk-browser/actions/runs/38043201706/artifacts/11666339301)
