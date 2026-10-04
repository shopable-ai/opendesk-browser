/**
 * Figma MCP 测试脚本
 * 用于测试 Figma API 连接和数据获取
 */

const https = require('https');

const FIGMA_API_KEY = 'figd_ff51KewtRt3g_jz0KZYaQUFjBEcg9f91j1oB2ugY';

// 测试用的公开 Figma 文件
// 这是 Figma 官方的示例文件
const TEST_FILE_KEY = 'c0FbKTs4ZOMVSZBNE09pxw'; // Figma Community 示例文件

/**
 * 测试 Figma API 连接
 */
function testFigmaAPI() {
  console.log('🚀 开始测试 Figma MCP 配置...\n');
  console.log('API Key:', FIGMA_API_KEY.substring(0, 20) + '...');
  console.log('Test File Key:', TEST_FILE_KEY);
  console.log('-'.repeat(60));

  const options = {
    hostname: 'api.figma.com',
    path: `/v1/files/${TEST_FILE_KEY}`,
    method: 'GET',
    headers: {
      'X-Figma-Token': FIGMA_API_KEY
    }
  };

  const req = https.request(options, (res) => {
    let data = '';

    console.log(`\n📡 HTTP 状态码: ${res.statusCode}`);
    console.log(`📋 响应头:`, JSON.stringify(res.headers, null, 2));
    console.log('-'.repeat(60));

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        
        if (res.statusCode === 200) {
          console.log('\n✅ Figma API 连接成功!\n');
          console.log('📄 文件信息:');
          console.log(`  名称: ${json.name}`);
          console.log(`  最后修改: ${json.lastModified}`);
          console.log(`  版本: ${json.version}`);
          console.log(`  缩略图: ${json.thumbnailUrl || '无'}`);
          
          if (json.document && json.document.children) {
            console.log(`\n📑 页面数量: ${json.document.children.length}`);
            json.document.children.slice(0, 3).forEach((page, idx) => {
              console.log(`  ${idx + 1}. ${page.name} (类型: ${page.type})`);
            });
          }

          // 显示组件信息
          if (json.components) {
            const componentCount = Object.keys(json.components).length;
            console.log(`\n🧩 组件数量: ${componentCount}`);
          }

          // 显示样式信息
          if (json.styles) {
            const styleCount = Object.keys(json.styles).length;
            console.log(`🎨 样式数量: ${styleCount}`);
          }

          console.log('\n' + '='.repeat(60));
          console.log('✨ MCP 配置测试成功！可以正常使用 Figma API');
          console.log('='.repeat(60));
          
        } else {
          console.error('\n❌ API 请求失败:');
          console.error('状态码:', res.statusCode);
          console.error('错误信息:', json.err || json.message || data);
        }
      } catch (e) {
        console.error('\n❌ 解析响应失败:');
        console.error('错误:', e.message);
        console.error('原始响应:', data.substring(0, 500));
      }
    });
  });

  req.on('error', (e) => {
    console.error('\n❌ 请求失败:');
    console.error('错误:', e.message);
  });

  req.end();
}

/**
 * 测试获取文件节点
 */
function testGetNodes(fileKey, nodeId) {
  console.log(`\n\n🔍 测试获取特定节点...\n`);
  
  const options = {
    hostname: 'api.figma.com',
    path: `/v1/files/${fileKey}/nodes?ids=${nodeId}`,
    method: 'GET',
    headers: {
      'X-Figma-Token': FIGMA_API_KEY
    }
  };

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        
        if (res.statusCode === 200) {
          console.log('✅ 节点获取成功!');
          console.log(JSON.stringify(json, null, 2).substring(0, 500) + '...');
        } else {
          console.log('节点获取响应:', json);
        }
      } catch (e) {
        console.log('响应:', data.substring(0, 300));
      }
    });
  });

  req.on('error', (e) => {
    console.error('节点请求失败:', e.message);
  });

  req.end();
}

// 主测试函数
function main() {
  console.clear();
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(15) + 'Figma MCP 配置测试' + ' '.repeat(15) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  
  // 先测试基本 API 连接
  testFigmaAPI();
  
  // 可以添加更多测试
  // setTimeout(() => {
  //   testGetNodes(TEST_FILE_KEY, '0:1');
  // }, 2000);
}

// 运行测试
main();

