/**
 * Figma API Key 验证脚本
 * 测试 API key 的有效性
 */

const https = require('https');

const FIGMA_API_KEY = 'figd_ff51KewtRt3g_jz0KZYaQUFjBEcg9f91j1oB2ugY';

console.log('╔' + '═'.repeat(58) + '╗');
console.log('║' + ' '.repeat(12) + 'Figma API Key 验证测试' + ' '.repeat(12) + '║');
console.log('╚' + '═'.repeat(58) + '╝\n');

/**
 * 测试 1: 验证 API key 基本有效性
 */
function testAPIKeyValidity() {
  console.log('🔑 测试 1: 验证 API Key 基本有效性\n');
  console.log('API Key:', FIGMA_API_KEY.substring(0, 20) + '...');
  console.log('-'.repeat(60));

  const options = {
    hostname: 'api.figma.com',
    path: '/v1/me',  // 获取当前用户信息
    method: 'GET',
    headers: {
      'X-Figma-Token': FIGMA_API_KEY
    }
  };

  const req = https.request(options, (res) => {
    let data = '';

    console.log(`\n📡 HTTP 状态码: ${res.statusCode}`);

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        
        if (res.statusCode === 200) {
          console.log('\n✅ API Key 验证成功！\n');
          console.log('👤 用户信息:');
          console.log(`  ID: ${json.id}`);
          console.log(`  邮箱: ${json.email}`);
          console.log(`  用户名: ${json.handle}`);
          console.log(`  头像: ${json.img_url || '无'}`);
          
          console.log('\n' + '='.repeat(60));
          console.log('✨ MCP 配置完成！API Key 有效！');
          console.log('='.repeat(60));
          
          // 继续测试用户的文件
          setTimeout(() => {
            testUserFiles();
          }, 1000);
          
        } else if (res.statusCode === 403) {
          console.error('\n❌ API Key 无效或已过期');
          console.error('错误信息:', json.message || json.err);
          console.log('\n💡 请检查：');
          console.log('  1. API Key 是否正确');
          console.log('  2. API Key 是否有 "File content" 权限');
          console.log('  3. API Key 是否已过期');
        } else {
          console.error('\n❌ API 请求失败:');
          console.error('状态码:', res.statusCode);
          console.error('响应:', JSON.stringify(json, null, 2));
        }
      } catch (e) {
        console.error('\n❌ 解析响应失败:');
        console.error('错误:', e.message);
        console.error('原始响应:', data);
      }
    });
  });

  req.on('error', (e) => {
    console.error('\n❌ 网络请求失败:');
    console.error('错误:', e.message);
  });

  req.end();
}

/**
 * 测试 2: 获取用户最近的文件
 */
function testUserFiles() {
  console.log('\n\n📂 测试 2: 获取用户最近的文件\n');
  console.log('-'.repeat(60));

  const options = {
    hostname: 'api.figma.com',
    path: '/v1/me/files',  // 获取用户文件列表
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
          console.log('\n✅ 文件列表获取成功！\n');
          
          if (json.files && json.files.length > 0) {
            console.log(`📁 最近访问的文件 (共 ${json.files.length} 个):\n`);
            
            json.files.slice(0, 5).forEach((file, idx) => {
              console.log(`  ${idx + 1}. ${file.name}`);
              console.log(`     Key: ${file.key}`);
              console.log(`     最后修改: ${file.last_modified}`);
              console.log('');
            });

            if (json.files.length > 0) {
              const firstFile = json.files[0];
              console.log('\n💡 你可以使用以下文件 Key 进行测试:');
              console.log(`   ${firstFile.key}`);
              
              // 测试获取第一个文件的详细信息
              setTimeout(() => {
                testFileDetails(firstFile.key);
              }, 1000);
            }
          } else {
            console.log('📁 没有找到任何文件');
            console.log('\n💡 提示:');
            console.log('  1. 确保你的 Figma 账户中有文件');
            console.log('  2. 或者使用公开的 Figma Community 文件进行测试');
          }
          
        } else {
          console.error('❌ 文件列表获取失败:', json.message || json.err);
        }
      } catch (e) {
        console.error('❌ 解析失败:', e.message);
        console.log('响应:', data.substring(0, 500));
      }
    });
  });

  req.on('error', (e) => {
    console.error('❌ 请求失败:', e.message);
  });

  req.end();
}

/**
 * 测试 3: 获取文件详细信息
 */
function testFileDetails(fileKey) {
  console.log('\n\n📄 测试 3: 获取文件详细信息\n');
  console.log('文件 Key:', fileKey);
  console.log('-'.repeat(60));

  const options = {
    hostname: 'api.figma.com',
    path: `/v1/files/${fileKey}`,
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
          console.log('\n✅ 文件详情获取成功！\n');
          console.log('📊 文件信息:');
          console.log(`  名称: ${json.name}`);
          console.log(`  版本: ${json.version}`);
          console.log(`  最后修改: ${json.lastModified}`);
          console.log(`  缩略图: ${json.thumbnailUrl || '无'}`);
          
          if (json.document && json.document.children) {
            console.log(`\n📑 页面列表 (共 ${json.document.children.length} 页):`);
            json.document.children.forEach((page, idx) => {
              console.log(`  ${idx + 1}. ${page.name} (ID: ${page.id})`);
            });
          }

          if (json.components) {
            const componentCount = Object.keys(json.components).length;
            console.log(`\n🧩 组件数量: ${componentCount}`);
          }

          if (json.styles) {
            const styleCount = Object.keys(json.styles).length;
            console.log(`🎨 样式数量: ${styleCount}`);
          }

          console.log('\n' + '='.repeat(60));
          console.log('🎉 所有测试完成！Figma MCP 配置成功！');
          console.log('='.repeat(60));
          
        } else {
          console.error('❌ 文件详情获取失败');
          console.error('状态码:', res.statusCode);
          console.error('错误:', json.message || json.err);
        }
      } catch (e) {
        console.error('❌ 解析失败:', e.message);
      }
    });
  });

  req.on('error', (e) => {
    console.error('❌ 请求失败:', e.message);
  });

  req.end();
}

// 运行测试
testAPIKeyValidity();

