# 🎨 Figma MCP 配置快速指南

> **状态**: ✅ 配置完成并测试通过  
> **配置时间**: 2025-10-27

---

## 🚀 快速开始（3 步完成）

### 步骤 1: 配置 Cursor MCP

编辑或创建 `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-figma",
        "--figma-api-key=figd_ff51KewtRt3g_jz0KZYaQUFjBEcg9f91j1oB2ugY"
      ]
    }
  }
}
```

### 步骤 2: 重启 Cursor

保存配置后，完全重启 Cursor。

### 步骤 3: 开始使用

在 Cursor 中输入：

```
@figma 你好
```

如果看到响应，说明配置成功！🎉

---

## 🧪 测试工具

### 命令行工具（推荐）

```bash
# 进入测试目录
cd /Users/a0000/Documents/workspace/scrapyJsChrome/demo

# 查看用户信息
node figma-cli-tool.js me

# 交互式模式
node figma-cli-tool.js interactive

# 查看帮助
node figma-cli-tool.js help
```

### 验证脚本

```bash
# API Key 验证
node test-figma-api-key.js

# 完整测试
node test-figma-mcp.js
```

### 浏览器测试

```bash
open test-figma-html.html
```

---

## 📋 命令示例

### 在 Cursor 中使用 Figma MCP

```
# 分析设计文件
@figma 分析这个设计文件的结构

# 生成组件
@figma 根据这个按钮设计生成 React 组件代码

# 提取样式
@figma 提取文件中的颜色定义为 CSS 变量

# 获取组件列表
@figma 列出这个文件中的所有组件
```

### 使用 CLI 工具

```bash
# 获取用户信息
node figma-cli-tool.js me

# 获取文件信息
node figma-cli-tool.js file YOUR_FILE_KEY

# 获取组件
node figma-cli-tool.js components YOUR_FILE_KEY

# 交互模式
node figma-cli-tool.js interactive
```

---

## 📁 文件说明

| 文件 | 说明 |
|------|------|
| `figma-mcp-config.json` | 完整 MCP 配置（含用户信息） |
| `mcp-config.json` | 基础 MCP 配置 |
| `figma-cli-tool.js` | ⭐ 命令行交互工具 |
| `test-figma-api-key.js` | API Key 验证脚本 |
| `test-figma-mcp.js` | 功能测试脚本 |
| `test-figma-html.html` | 浏览器测试页面 |
| `FIGMA_MCP_GUIDE.md` | 📖 详细使用指南 |
| `FIGMA_MCP_SUMMARY.md` | 📊 配置总结 |

---

## ✅ 测试结果

### API 验证成功

```
✅ API Key 验证成功！

👤 用户信息:
  用户名: 时间清单x
  邮箱: thinkido666@gmail.com
  用户 ID: 1226921665191995576
```

### CLI 工具运行正常

```bash
$ node figma-cli-tool.js me

════════════════════════════════════════════════════════════
                       👤 Figma 用户信息                        
════════════════════════════════════════════════════════════

✅ 用户信息获取成功

用户 ID:   1226921665191995576
邮箱:      thinkido666@gmail.com
用户名:    时间清单x
```

---

## 🔗 相关链接

- **详细指南**: `FIGMA_MCP_GUIDE.md`
- **配置总结**: `FIGMA_MCP_SUMMARY.md`
- **Figma API**: https://www.figma.com/developers/api
- **MCP 协议**: https://modelcontextprotocol.org/

---

## 💡 提示

1. **获取文件 Key**: 从 Figma URL 中提取
   ```
   https://www.figma.com/file/YOUR_FILE_KEY/...
                              ^^^^^^^^^^^^^^
   ```

2. **测试连接**: 使用 `node figma-cli-tool.js me`

3. **查看帮助**: 运行 `node figma-cli-tool.js help`

4. **安全提示**: 不要将 API Key 提交到公开仓库

---

## 📞 需要帮助？

1. 查看 `FIGMA_MCP_GUIDE.md` 获取详细说明
2. 运行 `node figma-cli-tool.js help` 查看命令帮助
3. 访问 [Figma API 文档](https://www.figma.com/developers/api)

---

**祝开发愉快！** 🚀

