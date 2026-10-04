// Configuration constants
const CONFIG = {
    SELECTORS: {
        LIST: {
            container: '.content--CUnfXXxv .contentInner--xICYBlag',
            title: '.title--F6pvp_RZ',
            priceInt: '.priceInt--j47mhkXk',
            priceFloat: '.priceFloat--zPTqSZZJ',
            sales: '.realSales--nOat6VGM',
            location: '.procity--QyzqB59i',
            shopName: '.shopName--bg5aFTrf .shopNameText--APRH8pWb',
            url: 'a.doubleCardWrapper--BpyYIb1O::href',
            mainPic: 'img.mainPic--CuSfUC4j::src',
            delivery: '.subIconWrapper--KnkgUW0R',
            abstract: '.abstractWrapper--whLX5va5 .text--eAiSCa_r'
        },
        DETAIL: {
            title: '.tb-main-title',
            price: '.tm-price',
            shop: {
                name: '.shop-name-link',
                rating: '.shop-rate-score'
            },
            attributes: '.attributes-list li',
            description: '#description .content'
        },
        PAGINATION: '.next-pagination-item.next-next'
    },
    WAIT_FOR: '.content--CUnfXXxv'
};

// Spider configuration
const spiderConfig = {
    name: 'taobao_spider',
    start_urls: ['https://s.taobao.com/search?q=vip会员'],
    delay: 2000,
    itemConfig: {
        _listContainer: CONFIG.SELECTORS.LIST.container,
        ...CONFIG.SELECTORS.LIST
    },
    puppeteerConfig: {
        nextPageSelector: CONFIG.SELECTORS.PAGINATION,
        waitForSelector: CONFIG.WAIT_FOR,
        // Add additional Puppeteer configurations
        navigationTimeout: 30000,
        waitUntil: 'networkidle0'
    },
    custom_settings: {
        // CLOSESPIDER_PAGECOUNT: 2
    },
    output: 'taobao_vip会员.json'
};

// Item processing pipeline
class TaobaoItemPipeline {
    async process(item) {
        if (!this.validateItem(item)) {
            console.warn('Invalid item detected:', item);
            return null;
        }

        return {
            ...item,
            price: this.processPrice(item),
            sales: this.processSales(item),
            tags: this.processTags(item),
            timestamp: new Date().toISOString()
        };
    }

    validateItem(item) {
        return item && item.title && (item.priceInt || item.priceFloat);
    }

    processPrice(item) {
        try {
            const intPart = (item.priceInt || '').trim();
            const floatPart = (item.priceFloat || '').replace(/[^0-9]/g, '') || '00';
            const price = parseFloat(`${intPart}.${floatPart}`);
            return isNaN(price) ? 0 : price;
        } catch (error) {
            console.error('Error processing price:', error);
            return 0;
        }
    }

    processSales(item) {
        try {
            if (!item.sales) return 0;
            const salesNumber = parseInt(item.sales.replace(/[^0-9]/g, ''));
            return isNaN(salesNumber) ? 0 : salesNumber;
        } catch (error) {
            console.error('Error processing sales:', error);
            return 0;
        }
    }

    processTags(item) {
        try {
            if (!Array.isArray(item.tags)) return [];
            return item.tags
                .map(tag => tag.trim())
                .filter(tag => tag && tag.length > 0);
        } catch (error) {
            console.error('Error processing tags:', error);
            return [];
        }
    }
}

// Initialize scraper
async function initializeScraper() {
    const pipeline = new TaobaoItemPipeline();
    
    const scrapy = new Scrapy({
        middlewares: [new ChromeDownloaderMiddleware()]
    });
    
    const spider = new ChromeSpider(spiderConfig);
    scrapy.spider = spider;

    // Add pipeline
    scrapy.addPipeline(async (item) => await pipeline.process(item));

    // Add error handling pipeline
    scrapy.addPipeline(async (item) => {
        if (!item) return null;
        console.log('Processing item:', {
            title: item.title,
            price: item.price,
            sales: item.sales
        });
        return item;
    });

    return scrapy;
}

// Main execution
(async () => {
    try {
        const scrapy = await initializeScraper();
        console.log('Starting Taobao scraper...');
        
        const items = await scrapy.start();
        console.log(`Scraping completed. Collected ${items.length} items.`);
        
        // Analyze results
        const totalSales = items.reduce((sum, item) => sum + (item.sales || 0), 0);
        const avgPrice = items.reduce((sum, item) => sum + (item.price || 0), 0) / items.length;
        
        console.log('Scraping Statistics:', {
            totalItems: items.length,
            totalSales,
            items,
            averagePrice: avgPrice.toFixed(2)
        });
        
    } catch (error) {
        console.error('Scraping failed:', error);
        process.exit(1);
    }
})();