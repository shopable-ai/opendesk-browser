
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


class CrawlerConfig {
  constructor(options = {}) {
    this.pageDelay = options.pageDelay ?? 1000; // Default delay between pages
    this.maxRetries = options.maxRetries ?? 3; // Maximum retry attempts
    this.captchaTimeout = options.captchaTimeout ?? 300000; // 5 minutes timeout for manual captcha
  }
}
async function detectCaptcha(page) {
    const captchaSelectors = [
      // Taobao specific captcha frame
      '.J_MIDDLEWARE_FRAME_WIDGET',
      'iframe[src*="h5api.m.taobao.com"]',
      // Text-based detection
      'text/Sorry, we have detected unusual traffic from your',
      'text/Please wait a moment and refresh again',
      // Common slider captcha class names
      '.nc_iconfont',
      '.nc_wrapper',
      '#nc_1_wrapper',
      '.slider-verify'
    ];
  
    for (const selector of captchaSelectors) {
      try {
        if (selector.startsWith('text/')) {
          const textContent = await page.evaluate(() => document.body.textContent);
          if (textContent.includes(selector.replace('text/', ''))) {
            return true;
          }
        } else {
          const element = await page.$(selector);
          if (element) {
            return true;
          }
        }
      } catch (error) {
        console.warn(`Error checking captcha selector ${selector}:`, error);
      }
    }
    return false;
  }

async function handleCaptcha(page, config) {
  console.log('Captcha detected! Waiting for manual intervention...');
  
  const startTime = Date.now();
  
  while (Date.now() - startTime < config.captchaTimeout) {
    // Check if captcha is still present
    const hasCaptcha = await detectCaptcha(page);
    if (!hasCaptcha) {
      console.log('Captcha solved! Continuing...');
      return true;
    }
    
    // Wait before next check
    await page.waitForTimeout(2000);
  }
  
  throw new Error('Captcha timeout exceeded');
}

async function crawlTaobaoItems(urls, config = new CrawlerConfig()) {
  const results = [];
  
  for (const url of urls) {
    let retryCount = 0;
    let success = false;
    
    while (!success && retryCount < config.maxRetries) {
      try {
        // Navigate to page
        await page.goto(url, {
          waitUntil: 'networkidle0',
          timeout: 30000
        });
        
        // Check for captcha
        if (await detectCaptcha(page)) {
          await handleCaptcha(page, config);
        }
        
        // Check if page exists
        const pageContent = await page.content();
        if (pageContent.includes('很抱歉，您查看的页面找不到了')) {
          console.warn(`Page not found: ${url}`);
          results.push({
            sourceUrl: url,
            status: 'Page not found'
          });
          break;
        }
        
        // Wait for content to load
        await page.waitForSelector('h1', { timeout: 10000 });
        
        // Parse data
        const listItems = await ItemLoader.parse(pageContent, taobaoItemConfig);
        
        // Process data
        const processedItem = processItemData(listItems);
        processedItem.sourceUrl = url;
        
        results.push(processedItem);
        
        // Add configurable delay
        if (config.pageDelay > 0) {
          await page.waitForTimeout(config.pageDelay + Math.random() * 1000);
        }
        
        success = true;
        
      } catch (error) {
        retryCount++;
        console.error(`Error crawling ${url} (attempt ${retryCount}/${config.maxRetries}):`, error);
        
        if (retryCount >= config.maxRetries) {
          results.push({
            sourceUrl: url,
            error: error.message,
            attempts: retryCount
          });
        } else {
          // Wait before retry
          await page.waitForTimeout(2000 * retryCount);
        }
      }
    }
  }
  
  return results;
}


// Usage example:
const crawlerConfig = new CrawlerConfig({
  pageDelay: 5000, // 2 seconds delay between pages
  maxRetries: 5,   // Maximum 5 retry attempts
  captchaTimeout: 600000 // 10 minutes captcha timeout
});

// We have detected unusual traffic from your network, please try again later.
//  

await crawlTaobaoItems(urls);