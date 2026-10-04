# Figma MCP 配置指南

## ✅ 配置状态

**API Key 已验证成功！**

- **用户**: 时间清单x (thinkido666@gmail.com)
- **用户 ID**: 1226921665191995576
- **验证时间**: 2025-10-27

---

## 📋 配置步骤

### 1. Cursor/Codex MCP 配置

将以下配置添加到 Cursor 的 MCP 配置文件中：

**配置文件位置**:
- macOS: `~/.cursor/mcp.json`
- Windows: `%APPDATA%\Cursor\User\mcp.json`
- 或项目目录: `.cursor/mcp.json`

**配置内容**:
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

### 2. 验证配置

运行测试脚本验证配置：

```bash
# 验证 API Key
node demo/test-figma-api-key.js

# 测试完整功能
node demo/test-figma-mcp.js
```

### 3. 在 Cursor 中使用

重启 Cursor 后，你可以：

1. **访问 Figma 设计文件**
   ```
   @figma 获取文件信息
   ```

2. **从设计生成代码**
   ```
   @figma 将这个设计转换为 React 组件
   ```

3. **获取设计规范**
   ```
   @figma 获取颜色和样式定义
   ```

---

## 🧪 测试文件

### 1. Node.js 测试脚本

- **`test-figma-api-key.js`** - API Key 验证脚本
  ```bash
  node demo/test-figma-api-key.js
  ```

- **`test-figma-mcp.js`** - 完整功能测试脚本
  ```bash
  node demo/test-figma-mcp.js
  ```

### 2. HTML 测试页面

打开浏览器测试页面：
```bash
open demo/test-figma-html.html
```

或在浏览器中访问：
```
file:///Users/a0000/Documents/workspace/scrapyJsChrome/demo/test-figma-html.html
```

---

## 🔑 API Key 信息

```
API Key: figd_ff51KewtRt3g_jz0KZYaQUFjBEcg9f91j1oB2ugY
状态: ✅ 有效
权限: File content, Dev resources
```

⚠️ **安全提示**: 
- 不要将 API Key 提交到公开仓库
- 可以使用环境变量存储
- 定期轮换 API Key

---

## 📚 Figma API 端点

### 基本端点

| 端点 | 功能 | 方法 |
|------|------|------|
| `/v1/me` | 获取用户信息 | GET |
| `/v1/files/{key}` | 获取文件详情 | GET |
| `/v1/files/{key}/nodes` | 获取特定节点 | GET |
| `/v1/files/{key}/images` | 获取图片 | GET |
| `/v1/files/{key}/comments` | 获取评论 | GET |

### 测试成功的端点

✅ `/v1/me` - 用户信息获取成功

```json
{
  "id": "1226921665191995576",
  "email": "thinkido666@gmail.com",
  "handle": "时间清单x",
  "img_url": "https://www.gravatar.com/avatar/..."
}
```

---

## 💡 使用示例

### 在 Cursor 中使用 MCP

1. **查询设计文件**
   ```
   请帮我查看 Figma 文件中的组件列表
   ```

2. **生成代码**
   ```
   根据这个 Figma 设计生成 Vue 组件代码
   ```

3. **获取样式**
   ```
   提取 Figma 文件中的颜色定义为 CSS 变量
   ```

### 使用 Node.js 直接访问

```javascript
const https = require('https');

const options = {
  hostname: 'api.figma.com',
  path: '/v1/files/YOUR_FILE_KEY',
  method: 'GET',
  headers: {
    'X-Figma-Token': 'figd_ff51KewtRt3g_jz0KZYaQUFjBEcg9f91j1oB2ugY'
  }
};

https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(JSON.parse(data)));
}).end();
```

---

## 🐛 故障排除

### 问题 1: API Key 无效

**错误**: `403 Forbidden`

**解决方案**:
1. 检查 API Key 是否正确
2. 确认 API Key 权限设置
3. 验证 API Key 未过期

### 问题 2: 文件未找到

**错误**: `404 Not Found`

**解决方案**:
1. 确认文件 Key 正确
2. 检查文件访问权限
3. 使用 `/v1/me/files` 获取可访问的文件列表

### 问题 3: CORS 限制

**错误**: CORS policy blocked

**解决方案**:
1. 使用 Node.js 后端调用
2. 使用浏览器扩展
3. 使用 MCP 服务器（推荐）

---

## 📦 相关文件

- `figma-mcp-config.json` - MCP 配置文件
- `test-figma-api-key.js` - API Key 验证脚本
- `test-figma-mcp.js` - 功能测试脚本
- `test-figma-html.html` - 浏览器测试页面
- `mcp-config.json` - 原始配置文件

---

## 🎯 下一步

1. ✅ API Key 已验证
2. ✅ MCP 配置已创建
3. ⏳ 将配置添加到 Cursor
4. ⏳ 在 Cursor 中测试 MCP 功能
5. ⏳ 创建实际的 Figma 文件进行测试

---

## 🔗 参考链接

- [Figma API 文档](https://www.figma.com/developers/api)
- [MCP 协议文档](https://modelcontextprotocol.org/)
- [Cursor MCP 配置](https://docs.cursor.com/mcp)

---

**创建时间**: 2025-10-27  
**最后更新**: 2025-10-27  
**状态**: ✅ 配置完成并验证成功

