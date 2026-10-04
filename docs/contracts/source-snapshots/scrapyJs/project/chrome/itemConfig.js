function generateItemConfig(listItem) {
    if (!listItem) {
      console.log('未提供列表项');
      return null;
    }
  
    // 记录选择器配置
    const config = {
      _listContainer: listItem.selector
    };
  
    // 从示例数据中分析结构
    const { sample } = listItem;
    
    // 处理 links 数据
    if (sample.links && sample.links.length > 0) {
      const linkData = sample.links[0];
      if (linkData.text) {
        config.title = config._listContainer + ' a';  // 默认将第一个链接作为标题
        config.url = config._listContainer + ' a::href';
      }
    }
  
    // 处理 images 数据
    if (sample.images && sample.images.length > 0) {
      config.images = config._listContainer + ' img';
    }
  
    // 从 extractCode 中分析选择器
    const extractCode = listItem.extractCode;
    if (extractCode) {
      // 提取查询选择器
      const selectorMatch = extractCode.match(/querySelectorAll\('([^']+)'\)/);
      if (selectorMatch) {
        config.itemSelector = selectorMatch[1];
      }
    }
  
    // 输出配置和验证信息
    console.log('生成的配置：', config);
    console.log('基于的数据：', sample);
    console.log('提取代码：', listItem.extractCode);
  
    return {
      config,
      sample,
      extractCode: listItem.extractCode
    };
  }
  
  // 使用示例
  const lists = detectContentLists();
  const firstItem = Array.from(lists.values())[0];
  const itemConfig = generateItemConfig(firstItem);