# ✅ Codex MCP - Figma 配置完成

> **配置时间**: 2025-10-27  
> **状态**: ✅ 配置成功并启用

---

## 🎉 配置成功！

### ✅ 配置位置

```
~/.codex/config.toml
```

### ✅ 配置内容

```toml
# Enable experimental RMCP client for OAuth and better STDIO support
experimental_use_rmcp_client = true

# Figma MCP Server Configuration
[mcp_servers.figma]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-figma", "--figma-api-key=figd_ff51KewtRt3g_jz0KZYaQUFjBEcg9f91j1oB2ugY"]
```

### ✅ 验证结果

```bash
$ codex mcp list

Name   Command  Args                                                     Status   
figma  npx      -y @modelcontextprotocol/server-figma --figma-api-key=... enabled  
```

**状态**: ✅ **enabled** (已启用)

---

## 🚀 使用方法

### 1. 在 Codex CLI 中使用

启动 Codex TUI：

```bash
codex
```

在 TUI 中查看 MCP 服务器：

```
/mcp
```

### 2. 与 Figma 交互

在 Codex 对话中，你可以：

```
请帮我从 Figma 文件中获取设计信息

根据 Figma 设计生成 React 组件

提取 Figma 文件中的颜色样式
```

### 3. MCP 命令行工具

```bash
# 列出所有 MCP 服务器
codex mcp list

# 添加新的 MCP 服务器
codex mcp add <server-name> -- <command>

# 删除 MCP 服务器
codex mcp remove <server-name>

# 查看帮助
codex mcp --help
```

---

## 📊 配置详情

### Figma MCP 服务器

| 属性 | 值 |
|------|-----|
| **名称** | figma |
| **类型** | STDIO Server |
| **命令** | npx |
| **包** | @modelcontextprotocol/server-figma |
| **API Key** | figd_ff51...j1oB2ugY |
| **状态** | ✅ enabled |

### 用户信息

| 属性 | 值 |
|------|-----|
| **用户名** | 时间清单x |
| **邮箱** | thinkido666@gmail.com |
| **用户 ID** | 1226921665191995576 |

---

## 🧪 测试工具

虽然 Codex MCP 已配置，但我们创建的测试工具仍然可用：

```bash
cd /Users/a0000/Documents/workspace/scrapyJsChrome/demo

# API Key 验证
node test-figma-api-key.js

# CLI 工具
node figma-cli-tool.js me
node figma-cli-tool.js interactive

# 浏览器测试
open test-figma-html.html

# 查看状态
./show-figma-status.sh
```

---

## 📋 MCP 配置选项说明

### experimental_use_rmcp_client

```toml
experimental_use_rmcp_client = true
```

启用实验性 RMCP 客户端，提供：
- ✅ 更好的 STDIO 服务器支持
- ✅ OAuth 认证支持
- ✅ 改进的连接稳定性

### STDIO 服务器配置

```toml
[mcp_servers.figma]
command = "npx"                                    # 启动命令
args = ["-y", "@modelcontextprotocol/server-figma", "--figma-api-key=..."]  # 参数数组
```

### 可选配置

```toml
[mcp_servers.figma]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-figma", "--figma-api-key=..."]
startup_timeout_sec = 30          # 启动超时（秒）
tool_timeout_sec = 60             # 工具执行超时（秒）

[mcp_servers.figma.env]           # 环境变量
FIGMA_API_KEY = "your_api_key"
```

---

## 🔧 其他有用的 MCP 服务器

根据 Codex 文档，以下是一些常用的 MCP 服务器：

### 1. Context7 - 开发文档

```bash
codex mcp add context7 -- npx -y @upstash/context7-mcp
```

```toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
```

### 2. GitHub

```bash
codex mcp add github -- npx -y @modelcontextprotocol/server-github
```

### 3. Playwright

```bash
codex mcp add playwright -- npx -y @playwright/mcp-server
```

### 4. Chrome DevTools

```bash
codex mcp add chrome -- npx -y chrome-mcp-server
```

---

## 📖 Codex MCP 使用示例

### 示例 1: 启动 Codex TUI

```bash
$ codex

# 在 TUI 中输入：
/mcp

# 输出：
Connected MCP servers:
  - figma (enabled)
```

### 示例 2: 与 Figma 交互

```bash
$ codex

> 请从我的 Figma 文件中获取最新的设计规范

> 根据 Figma 中的按钮组件生成 React 代码

> 分析 Figma 文件的组件结构
```

### 示例 3: 运行 Codex 作为 MCP 服务器

```bash
# 启动 Codex MCP 服务器
codex mcp-server

# 使用 MCP Inspector 测试
npx @modelcontextprotocol/inspector codex mcp-server
```

---

## 🔗 配置文件位置

### 主配置文件

```
~/.codex/config.toml
```

### 查看配置

```bash
cat ~/.codex/config.toml
```

### 编辑配置

```bash
# 使用默认编辑器
$EDITOR ~/.codex/config.toml

# 或使用 vim
vim ~/.codex/config.toml

# 或使用 nano
nano ~/.codex/config.toml
```

---

## 🛠️ 故障排除

### 问题 1: MCP 服务器未显示

**检查**:
```bash
codex mcp list
```

**解决方案**:
1. 确认 config.toml 格式正确
2. 重启 Codex
3. 检查网络连接

### 问题 2: Figma API Key 无效

**验证 API Key**:
```bash
cd /Users/a0000/Documents/workspace/scrapyJsChrome/demo
node test-figma-api-key.js
```

**解决方案**:
1. 检查 API Key 是否正确
2. 确认权限设置
3. 检查是否过期

### 问题 3: npx 命令失败

**检查 Node.js**:
```bash
node --version
npm --version
npx --version
```

**解决方案**:
1. 确保 Node.js >= 18
2. 更新 npm: `npm install -g npm@latest`
3. 清除 npx 缓存: `npx clear-npx-cache`

---

## 📚 相关文档

### 官方文档

- [Codex MCP 文档](https://docs.codex.ai/mcp)
- [Model Context Protocol](https://modelcontextprotocol.org/)
- [Figma API](https://www.figma.com/developers/api)
- [Figma MCP Server](https://www.npmjs.com/package/@modelcontextprotocol/server-figma)

### 本地文档

- `README_FIGMA_MCP.md` - 快速指南
- `FIGMA_MCP_GUIDE.md` - 详细使用指南
- `FIGMA_MCP_SUMMARY.md` - 配置总结
- `CODEX_MCP_CONFIG.md` - 本文档

---

## ✅ 配置检查清单

- [x] 创建 ~/.codex 目录
- [x] 编辑 config.toml 文件
- [x] 添加 experimental_use_rmcp_client = true
- [x] 配置 [mcp_servers.figma] 节
- [x] 验证配置: `codex mcp list`
- [x] 确认状态为 "enabled"
- [x] API Key 已验证有效
- [x] 测试工具已创建
- [x] 文档已完成

---

## 🎯 下一步

### 1. 启动 Codex TUI 测试

```bash
codex
```

在 TUI 中输入 `/mcp` 查看连接的服务器。

### 2. 尝试与 Figma 交互

在 Codex 对话中尝试 Figma 相关命令。

### 3. 添加更多 MCP 服务器

```bash
# 添加 Context7 (开发文档)
codex mcp add context7 -- npx -y @upstash/context7-mcp

# 添加 GitHub
codex mcp add github -- npx -y @modelcontextprotocol/server-github
```

### 4. 探索 MCP 功能

- 与 Figma 设计交互
- 自动生成代码
- 提取设计系统
- 同步设计变更

---

## 🎉 总结

✨ **Codex MCP - Figma 配置已完成！**

**配置位置**: `~/.codex/config.toml`

**验证命令**: 
```bash
codex mcp list
```

**状态**: ✅ **enabled** 

你现在可以：
1. ✅ 在 Codex CLI 中使用 Figma MCP
2. ✅ 通过 TUI 查看 MCP 状态 (`/mcp`)
3. ✅ 与 Figma 设计文件交互
4. ✅ 自动从设计生成代码
5. ✅ 添加更多 MCP 服务器

---

**配置完成时间**: 2025-10-27  
**配置者**: AI Assistant  
**验证状态**: ✅ 已验证  
**文档版本**: 1.0.0

