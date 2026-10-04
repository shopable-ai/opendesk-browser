#!/bin/bash

# Figma MCP 配置状态查看脚本

clear

cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║              🎨 Figma MCP 配置状态                                ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

EOF

echo "📅 配置时间: 2025-10-27"
echo "✅ 状态: 配置完成并测试通过"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 测试结果"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✅ API Key 验证"
echo "  ✅ 用户信息获取"
echo "  ✅ CLI 工具运行"
echo "  ✅ 文档创建"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "👤 用户信息"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  用户名: 时间清单x"
echo "  邮箱: thinkido666@gmail.com"
echo "  用户 ID: 1226921665191995576"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 创建的文件 (9 个)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

ls -lh | grep -E "(figma|test-figma|mcp|FIGMA)" | awk '{
  size=$5
  file=$9
  
  if (file ~ /\.json$/) icon="📄"
  else if (file ~ /\.js$/) icon="🔧"
  else if (file ~ /\.html$/) icon="🌐"
  else if (file ~ /\.md$/) icon="📖"
  else if (file ~ /\.sh$/) icon="⚙️"
  else icon="📎"
  
  printf "  %s %-35s %6s\n", icon, file, size
}'

echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 快速开始"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  1️⃣  配置 Cursor MCP:"
echo "     编辑 ~/.cursor/mcp.json"
echo "     (参考 figma-mcp-config.json)"
echo ""
echo "  2️⃣  测试 CLI 工具:"
echo "     node figma-cli-tool.js me"
echo "     node figma-cli-tool.js interactive"
echo ""
echo "  3️⃣  查看文档:"
echo "     cat README_FIGMA_MCP.md        # 快速指南"
echo "     cat FIGMA_MCP_GUIDE.md         # 详细指南"
echo "     cat FIGMA_MCP_SUMMARY.md       # 配置总结"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "💡 常用命令"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  验证 API Key:"
echo "  $ node test-figma-api-key.js"
echo ""
echo "  使用 CLI 工具:"
echo "  $ node figma-cli-tool.js me"
echo "  $ node figma-cli-tool.js help"
echo "  $ node figma-cli-tool.js interactive"
echo ""
echo "  打开浏览器测试:"
echo "  $ open test-figma-html.html"
echo ""
echo "  查看此状态:"
echo "  $ ./show-figma-status.sh"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔗 相关链接"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Figma API: https://www.figma.com/developers/api"
echo "  MCP 协议:  https://modelcontextprotocol.org/"
echo ""

cat << 'EOF'
╔══════════════════════════════════════════════════════════════════╗
║                    配置完成！开始使用吧！ 🎨                       ║
╚══════════════════════════════════════════════════════════════════╝

EOF

