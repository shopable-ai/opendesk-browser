// 直接复制到chrome extension 背景页中执行。

const taobaoItemConfig = {
    // 基础信息
    basic: {
      title: '//h1/text()',
      currentPrice: '//div[contains(@class,"highlightPrice")]//span[contains(@class,"text")]/text()',
      originalPrice: '//div[contains(@class,"subPrice")]//span[contains(@class,"text")][last()]/text()',
      sales: '//div[contains(@class,"salesDesc")]/text()'
    },
    
    // 店铺信息
    shop: {
      name: '//span[contains(@class,"shopName")]/text()',
      rating: '//span[contains(@class,"starNum")]/text()',
      labels: '//div[contains(@class,"StoreLabelList")]//div[contains(@class,"storeLabelItem")]/text()'
    },
    
    // SKU信息
    skus: {
      colors: '//div[contains(@class,"skuItem")][1]//span[contains(@class,"valueItemText")]/text()',
      sizes: '//div[contains(@class,"skuItem")][2]//span[contains(@class,"valueItemText")]/text()',
      selected: [
        '//div[contains(@class,"skuItem")][1]//div[contains(@class,"isSelected")]//span[contains(@class,"valueItemText")]/text()',
        '//div[contains(@class,"skuItem")][2]//div[contains(@class,"isSelected")]//span[contains(@class,"valueItemText")]/text()'
      ]
    },
    
    // 优惠信息
    promotions: {
      coupons: '//div[contains(@class,"couponText")]/text()'
    },
    
    // 物流信息
    delivery: {
      from: '//div[contains(@class,"delivery-from-addr")]/text()',
      to: '//span[contains(@class,"mui-addr-tri-1")]/text()',
      shippingInfo: '//div[contains(@class,"delivery-info")]//span[contains(@class,"f-els-1")]/text()'
    }
  };
var htmlString = await page.content();
var listItems = await ItemLoader.parse(htmlString, taobaoItemConfig);
console.log('listItems:' , listItems );
