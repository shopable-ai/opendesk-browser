# 本地开发 CLI：诊断、更新与回退

`opendesk browser dev .` 的主路径是 **Go Native Host + 已登记 npm 开发 CLI + 已配对扩展**。Node ≥22.12 用于本地 Resolver/构建，Chrome 启动的 Native Host 是 Go。旧 Node Host/MCP 是兼容路径，不能提供 Go 目录直连，Node 安装命令不能覆盖 Go owner。

## 只读定位故障

```sh
opendesk-dev --version
opendesk-dev --version --json
opendesk-dev --doctor --json
opendesk browser doctor
# 与选定候选比对：目录是完整打包目录或 tarball 解压目录。
opendesk-dev --doctor --expect-package /absolute/candidate/cli --json
```

若全局旧 CLI 还不支持这些参数，在仓库根用 `node packages/opendesk-dev/bin/opendesk-dev.mjs --doctor --json` 检查登记与 Native；源码入口会如实标为 `source-unpacked`，不能当作已安装候选。

版本输出实际 package 版本、安装路径、入口、实算 `contentFingerprint`、记录指纹和 metadata SHA。构建时的 Git/dirty/lock 来源保存在 `build-info.json`；安装后无法独立验证这些 provenance 值，诊断不直接回显其中的任意字段。清单复用 SHA-256 与按路径排序的 `{path,bytes,sha256}`，覆盖完整 `bin`、`runtime`、`package.json`、随包 `npm-shrinkwrap.json` 和 CLI 的 bundled `node_modules`；未提交源码也计入内容。Git HEAD 仅用于追溯，源码入口显示 `source-unpacked`，不能冒充全局安装。

`verified` 表示安装内容与包内记录一致，**不表示最新**。两份 R17.1 包即使入口相同，runtime 仍可能不同；要判断是否为选定候选，必须明确 `--expect-package`。打包从现有根 lock 投影 CLI 所需依赖的 `npm-shrinkwrap.json`，并随包携带已有锁定运行依赖。此次真实 npm 全局安装曾忽略单独的 shrinkwrap，故使用 bundled dependencies 固定实际文件（[npm 的包依赖说明](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bundledependencies)）。打包先核对锁定版本，再按 npm 实际打包清单生成指纹；诊断同时核对包字节与依赖版本。npm 自动生成的 `.bin`、`.package-lock.json` 不计入指纹，已运行进程中的旧模块也不在磁盘检查范围内。产物包含当前平台的可选二进制，生成的 package `os`/`cpu` 限定本机平台与架构；换平台须在目标机按相同源码/lock 重打包。构建通过、安装一致、业务运行、正式验收是不同结论。

`opendesk-dev --doctor` 只读取文件和发送一次认证握手，随后关闭自己的 Socket；不附加目录、授权、迁移、打开浏览器、注册 Provider 或运行项目，不输出 credential/config 原文。它检查依赖的默认 node/import 入口文件与随包锁版本，不加载模块，不能替代完整 Resolver 冒烟。独立 Go `opendesk browser doctor` 还会调用既有只读 `bridge.status`。退出码 0 表示此次可见检查通过，1 表示待修复；warning 不单独导致失败。

报告显示当前 Node `execPath`、PATH Node/CLI、Go 登记入口与包身份、Go 预计 Node、Native 类型/manifest/launcher 目标、真实配对 extensionId、认证连接和三个协商能力。Go 当前优先 `/opt/homebrew/bin`、`/usr/local/bin`、`/usr/bin`，再检查 PATH，并忽略项目/node_modules；`nvm use` 不一定改变 Go 使用的 Node。

**上游接口限制**：Go 的 `opendesk browser --version` 仍是协议标签，当前 Go 不转发 `dev --doctor`/`--version --json`。用报告中的明确 Node 和已登记入口进行同路径诊断，例如：

```sh
/opt/homebrew/bin/node /absolute/npm-prefix/lib/node_modules/@shopable/opendesk-dev/bin/opendesk-dev.mjs --doctor --json
```

Go 预计 Node 是当前上游策略推断，不是运行中进程的遥测。Go 当前强制校验登记入口 SHA/权限及读写能力；新增完整包指纹由 npm CLI 诊断核对，尚未由 Go 强制验证 runtime 全包。认证响应没有扩展加载路径或 packageHash，需独立核对。

| 故障层 / 错误 | 原因和修复 |
| --- | --- |
| Node：E_NODE_VERSION / E_GO_NODE_VERSION | 当前或 Go 优先 Node 不满足 22.12/不可识别；更新报告中的实际 Node，用绝对 Node/入口诊断 |
| W_NODE_PATH_DIFFERENT | nvm CLI 与 Go Homebrew 优先路径不同；分别核对，保持两者受支持 |
| CLI：E_DEV_BUILD_UNRECORDED | 旧包没有完整构建记录，或正在用源码入口；生成并安装当前 tarball |
| CLI：E_DEV_PACKAGE_CHANGED | 内容与 build-info 不一致；重新打包安装，不只重写 metadata |
| CLI：E_DEV_RUNTIME_DEPENDENCY / E_DEV_DEPENDENCY_LOCK | 依赖缺失或版本偏离锁；从同一 tarball 在选定 prefix 完整 npm 安装，不只复制文件或自动新增依赖 |
| CLI：E_DEV_SAME_VERSION_CONTENT | 版本相同但内容不等于明确候选；备份、安装候选、重新登记 |
| 登记：E_DEV_COMPONENT_MISSING / CHANGED | 登记缺失/非法或入口 SHA 改变；核对私有归属后用正确包绝对入口 `--register-go` |
| E_DEV_REGISTRATION_LEGACY / CONTENT_CHANGED | 旧登记只有入口 SHA，或入口未变但 runtime 改变；先核验完整包，再登记 |
| E_DEV_ENTRY_DIFFERENT / W_PATH_CLI_DIFFERENT | nvm、Homebrew、另一个 prefix 有不同全局包；选定实际 prefix，避免注册 PATH 上另一份包 |
| Native：E_MIGRATION_REQUIRED | 当前是 Node owner；按下文备份、旧 owner cleanup、Go setup，诊断不会迁移 |
| E_NATIVE_MANIFEST / E_NATIVE_WRAPPER | Profile、扩展 ID、launcher/二进制不一致；核对精确目标，用对应 owner setup/update |
| 连接：E_NATIVE_NOT_READY | Socket 不可认证，能力未知；检查正确 Profile 的 Native 启用及 Host 启动错误 |
| E_EXTENSION_DISCONNECTED | Socket 已认证，扩展未就绪；核对扩展启用、Native 权限、本机连接按钮 |
| 能力：E_NATIVE_UPDATE_REQUIRED | 已连接，但 multi/files/access 能力不是 v1；更新对应 Go/扩展并重连，不能降级 |
| E_INSTALL_PERMISSIONS / INVALID | 私有归属/权限或字段错误；核对私有备份，不放宽权限绕过 |

## 可复现本地更新

先按[测试复用入口](testing-guide.md)核查资源；健康安装无需反复迁移。结束自己所属的目录 CLI/待收尾运行，未知副作用先只读查询，再停用对应 Profile 的 Native 连接。不要结束他人进程或占用共享 dist、CFT、数据库。

从报告填入现有真实路径，命令在 Browser 仓库根执行。来源 Go 工程只读。备份可能含 credential，使用私有目录，不提交、上传、打印内容。首次安装原本没有旧文件时，记录缺项并省略相应备份，不假称可回退。

```sh
umask 077
TASK_UPDATE_DIR="$(mktemp -d "$HOME/.opendesk-browser-update.XXXXXX")"
TASK_NPM_PREFIX="/absolute/selected/npm-prefix"
TASK_NODE="/absolute/selected/node"
TASK_OLD_CLI="$TASK_NPM_PREFIX/lib/node_modules/@shopable/opendesk-dev"
TASK_NATIVE_ROOT="/absolute/native/root/from/doctor"
TASK_NATIVE_MANIFEST="/absolute/profile/NativeMessagingHosts/com.shopable.opendesk_browser.agent.json"

# 精确备份旧 CLI（含已安装依赖和 bin link）、登记、Native/manifest；不保存活 Socket。
tar -czf "$TASK_UPDATE_DIR/cli-before.tgz" -C "$TASK_NPM_PREFIX" lib/node_modules/@shopable/opendesk-dev bin/opendesk-dev
cp -p "$HOME/.opendesk-browser/dev-tool-r17/entry.json" "$TASK_UPDATE_DIR/entry-before.json"
tar --exclude agent.sock -czf "$TASK_UPDATE_DIR/native-before.tgz" -C "$(dirname "$TASK_NATIVE_ROOT")" "$(basename "$TASK_NATIVE_ROOT")"
cp -p "$TASK_NATIVE_MANIFEST" "$TASK_UPDATE_DIR/native-manifest-before.json"
"$TASK_NODE" "$TASK_OLD_CLI/bin/opendesk-dev.mjs" --version > "$TASK_UPDATE_DIR/version-before.txt"
shasum -a 256 "$TASK_UPDATE_DIR/cli-before.tgz" "$TASK_UPDATE_DIR/native-before.tgz" "$TASK_UPDATE_DIR/entry-before.json" "$TASK_UPDATE_DIR/native-manifest-before.json" > "$TASK_UPDATE_DIR/backup-sha256.txt"

# 已有正确锁/工具就直接使用；确实缺工具时才 npm ci --ignore-scripts --no-audit --no-fund。
"$TASK_NODE" scripts/pack-opendesk-dev.mjs --out "$TASK_UPDATE_DIR/cli" > "$TASK_UPDATE_DIR/pack.json"
"$TASK_NODE" "$TASK_UPDATE_DIR/cli/bin/opendesk-dev.mjs" --version --json
```

若同时更换 Go 二进制或扩展，另保留原二进制、完整扩展目录、真实 ID/Profile/加载路径及 SHA 清单。打包输出实际版本、内容/Git/dirty/lock 身份、archive SHA-256 和 npm integrity；审阅输出与 build-info 后，将其实际 archive 填入 `TASK_TARBALL`，不要凭 R17.1 猜文件名。构建器拒绝覆盖已存在的目录（包括默认 `.runtime/r17-dev-package`），用新的 `--out`。

```sh
TASK_TARBALL="/absolute/archive/from/pack.json.tgz"
# 明确 Node 所属 npm/prefix，不使用 sudo，不覆盖另一份安装。
PATH="$(dirname "$TASK_NODE"):$PATH" npm install -g --prefix "$TASK_NPM_PREFIX" --ignore-scripts --no-audit --no-fund "$TASK_TARBALL"
TASK_CLI="$TASK_NPM_PREFIX/lib/node_modules/@shopable/opendesk-dev/bin/opendesk-dev.mjs"
"$TASK_NODE" "$TASK_CLI" --version --json
"$TASK_NODE" "$TASK_CLI" --register-go
"$TASK_NODE" "$TASK_CLI" --doctor --expect-package "$TASK_UPDATE_DIR/cli" --json > "$TASK_UPDATE_DIR/doctor-after.json"
```

旧已运行 CLI 可能仍持有旧模块；退出所属 CLI 后重新启动。npm install 是本机更新，不是 npm publish；重新登记须使用目标安装的绝对入口。记录 tarball/contentFingerprint、实际 prefix/Node、登记和检查结果。

Native 健康时保留安装。已有 Go owner、相同 Profile/ID，确需更新才执行 `opendesk browser update --extension-id "真实ID"`，随后 `opendesk browser doctor`。非默认 Profile 沿用 `--browser chrome|cft --user-data-dir /absolute/profile`，隔离实例沿用 `OPENDESK_NATIVE_INSTANCE`；不跨实例恢复配置。npm CLI 登记仍是用户级共用入口。

**旧 Node 转 Go**：私有备份并停用所属连接，用与旧安装匹配的 `node native-agent/cli.mjs cleanup` 卸载 Node 自有安装，再 `opendesk browser setup --extension-id "真实ID"`（保留原 Profile 参数），最后在扩展真实启用 Native。Go setup/update 拒绝旧 Node；Node setup/update/cleanup 拒绝 Go owner，不删目录绕过。旧 Node/MCP 可继续原兼容路径及 `node native-agent/cli.mjs doctor`，无需为了 MCP 强制迁移。

启用正确 Profile 的本机连接后再跑两个 doctor。完整链路需认证且 `browserReady:true`、`localDevMultiVersion/localFilesVersion/localDevAccessVersion` 都为 1、CLI/登记/明确候选身份一致；只有 installed/socketExists 不代表已连接。

## 扩展内容独立核验

CLI 指纹不能证明 Chrome 加载了相同扩展。保留隔离构建回执/packageHash，在 `chrome://extensions` 记录真实 ID、Profile、已加载 unpacked 目录。复用现有完整包哈希/文件清单比较实际目录：

```sh
node scripts/verify-package.mjs /absolute/accepted/extension
node scripts/verify-package.mjs /absolute/actually-loaded/unpacked-directory
node --input-type=module - /absolute/accepted/extension /absolute/actually-loaded/unpacked-directory <<'JS'
import {packageFingerprint} from './scripts/verify-package.mjs';
const [candidate,installed]=await Promise.all(process.argv.slice(2).map(packageFingerprint));
const same=candidate.packageHash===installed.packageHash;
console.log(JSON.stringify({same,candidate,installed},null,2));
process.exitCode=same?0:1;
JS
```

比较全部新增/缺失/改变的文件并拒绝 symlink；磁盘一致仍不能证明旧 Worker 已重载。收尾原运行后真实 Reload/重连，记录 ID/路径/packageHash/连接结果。移动 unpacked 目录可能改变 ID，重新核对配对，保留旧扩展数据。按相关输入安排业务验证，不把组件/连接 PASS 提升为原生/F3/ZIP。

最后在项目目录 `opendesk browser dev .`。保存仅准备，明确 Run 才执行新 sourceHash；替换/Stop 保留精确目标、权限、清理 nonce 与真实受管回执合同。

## 回退到精确旧安装

结束自己所属的新 CLI/运行，停用所属 Profile 连接；未知副作用先只读查询。保留失败候选，不删除旧证据。从同一 prefix 的备份恢复：

```sh
mv "$TASK_NPM_PREFIX/lib/node_modules/@shopable/opendesk-dev" "$TASK_UPDATE_DIR/cli-replaced"
mv "$TASK_NPM_PREFIX/bin/opendesk-dev" "$TASK_UPDATE_DIR/bin-replaced"
tar -xzf "$TASK_UPDATE_DIR/cli-before.tgz" -C "$TASK_NPM_PREFIX"
cp -p "$TASK_UPDATE_DIR/entry-before.json" "$HOME/.opendesk-browser/dev-tool-r17/entry.json"
"$TASK_NODE" "$TASK_OLD_CLI/bin/opendesk-dev.mjs" --version
```

恢复前可用 `shasum -a 256 -c "$TASK_UPDATE_DIR/backup-sha256.txt"` 核对备份。恢复旧登记后只读比对入口 SHA。旧包可能仍是 `legacy-unrecorded`，按原备份解释，不能伪造新 build-info。单独回退 CLI 不触碰健康 Native/扩展。

若修改过 Native：停用连接，由新 owner 的 Go/Node cleanup 清理其自有安装；确认根已释放，从 `native-before.tgz` 恢复到原父目录，恢复 manifest 原路径、原 Go 二进制绝对目标及权限，**不恢复 Socket**。cleanup 因未决运行/所有权拒绝时先解决原因，不覆盖活安装。若改过扩展，重新加载原目录、核对原 ID/Profile；未删除的旧扩展直接恢复启用，保留其数据。

恢复原 owner 连接，运行其 doctor；核对 CLI/登记/扩展备份 SHA 与必要局部运行。只有原路径、内容、权限、配对和连接复核后才记录回退成功。保留两次诊断与备份。本地更新/回退不执行 Git reset、推送、npm publish 或正式发布。
