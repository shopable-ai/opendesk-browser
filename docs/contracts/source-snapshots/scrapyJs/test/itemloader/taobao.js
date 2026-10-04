const taobaoItemConfig = {
    // 基础信息
    basic: {
      title: '//h1/text()',
      currentPrice: '//div[contains(@class,"highlightPrice--ojI4oith")]//span[@class="text--lKftOoXS"]/text()',
      originalPrice: '//div[contains(@class,"subPrice--pLrEOYyH")]//span[@class="text--lKftOoXS"][last()]/text()',
      sales: '//div[@class="salesDesc--CrjzaRmt"]/text()'
    },
    
    // 店铺信息
    shop: {
      name: '//span[@class="shopName--mTDZGIPO"]/text()',
      rating: '//span[@class="starNum--biKYeNQA"]/text()',
      labels: '//div[@class="StoreLabelList--GgAO4R2E"]//div[@class="storeLabelItem--JLRNwFlb"]/text()'
    },
    
    // SKU信息 - 标准XPath提取
    skus: {
      items: '//div[contains(@class, "skuItem")]',
      values: '//div[contains(@class, "skuItem")]//span[contains(@class, "valueItemText")]/text()',
      selectedValues: '//div[contains(@class, "skuItem")]//div[contains(@class, "isSelected")]//span[contains(@class, "valueItemText")]/text()'
    },
    
    // 产品特定信息
    productDetails: {
      gameVersions: '//div[contains(text(), "游戏版本")]/following-sibling::div//span/text()',
      languages: '//div[contains(text(), "语种分类")]/following-sibling::div//span/text()'
    },
    
    // 优惠信息
    promotions: {
      coupons: '//div[@class="couponText--dhGyCUIp"]/text()'
    },
    
    // 物流信息
    delivery: {
      from: '//div[@class="delivery-from-addr--umLXvSjc"]/text()',
      to: '//span[@class="mui-addr-tri-1--FlPxZCKu"]/text()',
      shippingInfo: '//div[@class="delivery-info--hYp1vYnV"]//span[@class="f-els-1"]/text()'
    }
  };
  
  function processItemData(rawData) {
    const processedData = { ...rawData };
    
    if (rawData.skus) {
      // 处理SKU值
      const values = rawData.skus.values || [];
      const selectedValues = rawData.skus.selectedValues || [];
      
      // 分类游戏版本和语言
      const gameVersions = values.filter(v => v.includes('包')) || [];
      const languages = values.filter(v => v.includes('中文')) || [];
      
      processedData.skus = {
        labels: [],
        values: values,
        selectedValues: selectedValues,
        processedSkus: [
          {
            label: '游戏版本',
            values: gameVersions,
            selectedValue: selectedValues.find(v => v.includes('包'))
          },
          {
            label: '语种',
            values: languages,
            selectedValue: selectedValues.find(v => v.includes('中文'))
          }
        ]
      };
    }
    
    return processedData;
  }
  
  // 使用示例
  var htmlString = await page.content(); 
  var listItems = await ItemLoader.parse(htmlString, taobaoItemConfig);
  var processedItems = processItemData(listItems);
  console.log('processedItems:', processedItems);