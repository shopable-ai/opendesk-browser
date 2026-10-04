#!/usr/bin/env node

/**
 * Figma CLI 工具
 * 命令行工具用于访问 Figma API
 */

const https = require('https');
const readline = require('readline');

const FIGMA_API_KEY = 'figd_ff51KewtRt3g_jz0KZYaQUFjBEcg9f91j1oB2ugY';

// 命令行参数
const args = process.argv.slice(2);
const command = args[0];

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function header(title) {
  console.log('\n' + colors.bright + colors.cyan + '═'.repeat(60) + colors.reset);
  console.log(colors.bright + colors.cyan + title.padStart(30 + title.length / 2).padEnd(60) + colors.reset);
  console.log(colors.bright + colors.cyan + '═'.repeat(60) + colors.reset + '\n');
}

/**
 * Figma API 请求
 */
function figmaRequest(path, callback) {
  const options = {
    hostname: 'api.figma.com',
    path: path,
    method: 'GET',
    headers: {
      'X-Figma-Token': FIGMA_API_KEY
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      try {
        callback(null, res.statusCode, JSON.parse(data));
      } catch (e) {
        callback(e, res.statusCode, data);
      }
    });
  });

  req.on('error', (e) => callback(e, null, null));
  req.end();
}

/**
 * 命令: me - 获取当前用户信息
 */
function cmdMe() {
  header('👤 Figma 用户信息');
  
  figmaRequest('/v1/me', (err, status, data) => {
    if (err) {
      log('❌ 请求失败: ' + err.message, 'red');
      return;
    }

    if (status === 200) {
      log('✅ 用户信息获取成功\n', 'green');
      log(`用户 ID:   ${data.id}`, 'cyan');
      log(`邮箱:      ${data.email}`, 'cyan');
      log(`用户名:    ${data.handle}`, 'cyan');
      log(`头像:      ${data.img_url || '无'}`, 'cyan');
    } else {
      log('❌ 请求失败 (状态码: ' + status + ')', 'red');
      log('错误: ' + (data.message || data.err || JSON.stringify(data)), 'red');
    }
  });
}

/**
 * 命令: file - 获取文件信息
 */
function cmdFile(fileKey) {
  if (!fileKey) {
    log('❌ 请提供文件 Key', 'red');
    log('用法: node figma-cli-tool.js file <FILE_KEY>', 'yellow');
    return;
  }

  header(`📄 Figma 文件信息 (${fileKey})`);
  
  figmaRequest(`/v1/files/${fileKey}`, (err, status, data) => {
    if (err) {
      log('❌ 请求失败: ' + err.message, 'red');
      return;
    }

    if (status === 200) {
      log('✅ 文件信息获取成功\n', 'green');
      log(`文件名:    ${data.name}`, 'cyan');
      log(`版本:      ${data.version}`, 'cyan');
      log(`最后修改:  ${data.lastModified}`, 'cyan');
      log(`缩略图:    ${data.thumbnailUrl || '无'}`, 'cyan');
      
      if (data.document && data.document.children) {
        log(`\n📑 页面列表 (${data.document.children.length} 页):`, 'blue');
        data.document.children.forEach((page, idx) => {
          log(`  ${idx + 1}. ${page.name} (ID: ${page.id})`, 'dim');
        });
      }

      if (data.components) {
        const count = Object.keys(data.components).length;
        log(`\n🧩 组件数量: ${count}`, 'magenta');
      }

      if (data.styles) {
        const count = Object.keys(data.styles).length;
        log(`🎨 样式数量: ${count}`, 'magenta');
      }
    } else if (status === 404) {
      log('❌ 文件未找到 (404)', 'red');
      log('请检查文件 Key 是否正确', 'yellow');
    } else {
      log('❌ 请求失败 (状态码: ' + status + ')', 'red');
      log('错误: ' + (data.message || data.err || JSON.stringify(data)), 'red');
    }
  });
}

/**
 * 命令: search - 搜索公开文件
 */
function cmdSearch(query) {
  if (!query) {
    log('❌ 请提供搜索关键词', 'red');
    log('用法: node figma-cli-tool.js search <QUERY>', 'yellow');
    return;
  }

  header(`🔍 搜索: ${query}`);
  log('⚠️  注意: Figma API 不直接支持搜索功能', 'yellow');
  log('建议访问 Figma Community 查找公开文件', 'yellow');
}

/**
 * 命令: components - 获取文件组件
 */
function cmdComponents(fileKey) {
  if (!fileKey) {
    log('❌ 请提供文件 Key', 'red');
    log('用法: node figma-cli-tool.js components <FILE_KEY>', 'yellow');
    return;
  }

  header(`🧩 文件组件 (${fileKey})`);
  
  figmaRequest(`/v1/files/${fileKey}`, (err, status, data) => {
    if (err) {
      log('❌ 请求失败: ' + err.message, 'red');
      return;
    }

    if (status === 200) {
      if (data.components && Object.keys(data.components).length > 0) {
        log(`✅ 找到 ${Object.keys(data.components).length} 个组件\n`, 'green');
        
        Object.entries(data.components).forEach(([key, component], idx) => {
          log(`${idx + 1}. ${component.name}`, 'cyan');
          log(`   Key: ${component.key}`, 'dim');
          log(`   描述: ${component.description || '无'}`, 'dim');
          log('');
        });
      } else {
        log('📦 该文件没有组件', 'yellow');
      }
    } else {
      log('❌ 请求失败 (状态码: ' + status + ')', 'red');
    }
  });
}

/**
 * 命令: interactive - 交互式模式
 */
function cmdInteractive() {
  header('🎮 交互式模式');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: colors.cyan + 'figma> ' + colors.reset
  });

  log('输入命令 (help 查看帮助, exit 退出)\n', 'yellow');
  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim().split(' ');
    const cmd = input[0];
    const arg = input[1];

    switch(cmd) {
      case 'me':
        cmdMe();
        break;
      case 'file':
        if (arg) cmdFile(arg);
        else log('用法: file <FILE_KEY>', 'yellow');
        break;
      case 'components':
        if (arg) cmdComponents(arg);
        else log('用法: components <FILE_KEY>', 'yellow');
        break;
      case 'help':
        showHelp();
        break;
      case 'exit':
      case 'quit':
        log('👋 再见！', 'green');
        process.exit(0);
        break;
      case '':
        break;
      default:
        log('未知命令: ' + cmd, 'red');
        log('输入 help 查看帮助', 'yellow');
    }

    setTimeout(() => rl.prompt(), 100);
  });

  rl.on('close', () => {
    log('\n👋 再见！', 'green');
    process.exit(0);
  });
}

/**
 * 显示帮助信息
 */
function showHelp() {
  header('📖 Figma CLI 工具帮助');
  
  log('用法: node figma-cli-tool.js <command> [options]\n', 'yellow');
  
  log('命令列表:', 'bright');
  log('  me                    获取当前用户信息', 'cyan');
  log('  file <KEY>            获取文件详细信息', 'cyan');
  log('  components <KEY>      获取文件组件列表', 'cyan');
  log('  search <QUERY>        搜索文件（说明）', 'cyan');
  log('  interactive           进入交互式模式', 'cyan');
  log('  help                  显示此帮助信息', 'cyan');
  
  log('\n示例:', 'bright');
  log('  node figma-cli-tool.js me', 'dim');
  log('  node figma-cli-tool.js file YOUR_FILE_KEY', 'dim');
  log('  node figma-cli-tool.js interactive', 'dim');
  
  log('\n提示:', 'bright');
  log('  • 文件 Key 可以从 Figma URL 中获取', 'yellow');
  log('  • URL 格式: https://www.figma.com/file/FILE_KEY/...', 'yellow');
  log('  • API Key 已配置在脚本中', 'yellow');
}

/**
 * 主函数
 */
function main() {
  if (!command) {
    showHelp();
    return;
  }

  switch(command) {
    case 'me':
      cmdMe();
      break;
    case 'file':
      cmdFile(args[1]);
      break;
    case 'components':
      cmdComponents(args[1]);
      break;
    case 'search':
      cmdSearch(args[1]);
      break;
    case 'interactive':
    case 'i':
      cmdInteractive();
      break;
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      log('❌ 未知命令: ' + command, 'red');
      log('使用 "help" 查看可用命令\n', 'yellow');
      showHelp();
  }
}

// 运行主函数
main();

