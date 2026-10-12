# 本机 Cheerio 开发依赖恢复

日期：2026-10-12（Asia/Shanghai）。会话：`01a12bcc-301a-7ca0-80fd-48c847d012b7`。状态：**VERIFIED / STOPPED / released**。

用户运行 `npm run dev` 在复制 `node_modules/cheerio/LICENSE` 时遇到 ENOENT。当前 `npm ls --depth=0` 确认只有 `cheerio@1.2.0` 是缺失的顶层依赖；整个 `node_modules/cheerio` 不存在。`package.json` 和 `package-lock.json` 已声明该依赖，安装目录尚未同步。

范围：恢复已声明、已锁定的本机依赖，验证许可证、开发服务启动及开发包校验。预期不修改产品源码、依赖清单和锁文件；保留 main 的现有未提交工作，不提交或推送。

已读 `testing-guide.md`、`parallel-development.md`、`public-libraries-r161-cheerio-20261011.md`、`wxt-dev-r131-01a121ab.md` 和 `dev-dependencies-20261010-01a12540.md`。历史开发服务与业务 PASS 保留原身份；本机安装状态已变化，本轮只补安装和启动验证，不重复 Chrome 原生、F3 或 ZIP 验收。

资源：当前工作区 `node_modules`；启动验证时由 development-lock 独占 `.wxt/public`、`dist/development`、43119/43120。执行前未发现本仓库活动 dev/build 进程或 `.wxt/development.lock`。不使用 Chrome/profile，不写 production dist 或 ZIP。测试结束停止本轮服务并记录 released。

通过条件：`npm ci --ignore-scripts --no-audit --no-fund` 成功；`npm ls --depth=0` 无缺失；Cheerio 许可证存在且与开发包复制件一致；`npm run dev` 实际达到 RUNNING；开发包通过现有严格校验；停止后输出锁和开发 marker 已清理。相关输入哈希及新原始日志保存在 `docs/framework/workstreams/evidence/dev-cheerio-dependencies-20261012/`，不覆盖旧 receipt。

## 结果

- 本机 HEAD：`f70ccb918e7e9046de7befa73a69f361e4d88b2f`；Node v24.16.0 / npm 11.13.0。`npm ci --ignore-scripts --no-audit --no-fund` 返回 0，2 秒安装 308 包；顶层与完整依赖树均无 missing/invalid。
- `cheerio@1.2.0` 的 LICENSE 为 1081 字节，SHA-256 `61c1e21d3a8ff20f9b69abe15104a75584688080febc22f60a4cbf3854becf4e`；开发包 `licenses/cheerio-MIT.txt` 逐字节一致。原 ENOENT 已消除。
- `npm run dev` 完成实际开发构建并达到 RUNNING。验证后 Ctrl+C 正常退出，返回 0，输出锁和 live marker 均已移除；本轮 PID 32934 已停止，43119/43120 最终可绑定。停止后短暂观察到另一 PID 33343 持有 guard，随后已退出；未干预该进程。
- 保留一次活动服务期间的严格静态包校验失败：`verify-development.log` 为 `Unexpected packaged asset`，原因是活动目录含 `development-update.json`。正常停止自动移除 marker 后，使用同一 verifier 的 `verify-development-stopped.log` 返回 0；未修改或放宽合同。
- 停止后的开发包校验 PASS：103 个资产，packageHash `962849b70f173573c9f67a92a2fc5e2d679e0cf20ccd8a490dce6843acd9be2b`。此为本机开发构建/静态包证据，不提升为 Chrome、F3 或 ZIP 安装 PASS。
- 安装前后相关产品/构建输入 SHA-256 全部一致，包括 package.json、package-lock.json；本轮只恢复被忽略的安装与开发产物，并新增本工作流和原始证据。不修改既有产品/测试文件、不提交推送。

机器记录与原始日志哈希见 [validation.json](evidence/dev-cheerio-dependencies-20261012/validation.json)。再次更新依赖清单/锁文件后需要同步本机安装；相关源码/构建输入发生变化则按影响范围验证，不因新聊天重复原生业务测试。
