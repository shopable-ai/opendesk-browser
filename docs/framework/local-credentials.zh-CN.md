# 本机凭证目录

共享开发凭证放仓库根目录 `.local/credentials/`。`projects/` 保存扩展产品的可维护源码、测试与发布输入；本机凭证由可信本机启动器使用，不属于扩展包或本地项目授权范围。

按实际服务、账号和资源逐层创建目录，不预建空的服务树：

```text
.local/credentials/
  <service>/
    <account-or-organization-id>/
      <resource-id>/
        runtime.key
        metadata.json
```

同一资源确需不同用途的凭证时，用明确用途命名，例如 `runtime.key`、`read-only.key`；不要用覆盖 `runtime.key` 的方式切换无关账号或资源。轮换同一用途时先更新消费者并验证，再移除旧凭证。不要保存账号密码或复制整个浏览器登录态。

`.gitignore` 中的 `/.local/credentials/` 忽略整个目录，覆盖 `.key`、JSON、无后缀 token、元数据和备份；保留既有 `*.key` 作为补充。已跟踪文件不受忽略规则保护，新增凭证后用 `git check-ignore -v <路径>` 与 `git ls-files -- <目录>` 检查。文档、模板和目录约定放在本文件，真实凭证不进入 Git、扩展包、快照或上传资产。

凭证目录逐层使用0700，文件0600，由当前用户所有，禁止符号链接或多硬链接。配置只保存绝对文件路径；支持官方 `file:` 引用的启动器让客户端读取该文件，不把正文写入命令参数、环境变量、日志、截图或聊天。不要把 `.local/credentials/` 或整个仓库根目录授予网页/扩展文件服务。

## 当前 OpenAI Secure MCP Tunnel

当前账号凭证位置：

```text
/Users/shopme/Documents/workspace/opendesk-browser/.local/credentials/openai/org-4g93BMwcYJToeMT7Aj72tNOY/tunnel_6af2133ba8c08191a1b3306aaf1030fc/runtime.key
```

同目录 `metadata.json` 仅记录用途、组织/Tunnel、tracking ID、权限、到期日及轮换入口，不保存秘密正文或其摘要。当前 key 名为 `OpenDesk Desktop Mac96 Runtime`，仅 Tunnels Read / Use，2026-12-10 到期。

消费者是独立 OpenDesk 仓库中的 `.runtime/mcp/desktop-tunnel-image/desktop.yaml` 与 `desktop.json`，使用前台官方客户端和stdio MCP；更换路径时同步修改文件引用及 profile provenance hash，再运行既有 `desktop-tunnel.py doctor`。运行日志和临时授权仍属于各任务的 `.runtime/`，不放进本持久目录。已撤销的文件 Bridge capability 不能作为可复用 runtime key。

本轮历史运行证据见 `/Users/shopme/Documents/workspace/opendesk/docs/quality/mcp/2026-11-10-current-account-tunnel.md`。迁移后旧的 `~/.opendesk/tunnels/.../desktop/private/runtime.key` 路径不再使用；历史日志和已消费的测试 profile 保留原样，不把它们当作当前启动入口。
