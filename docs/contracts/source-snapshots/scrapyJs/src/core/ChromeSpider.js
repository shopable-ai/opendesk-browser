const CrawlSpider = require('./CrawlSpider');
const Item = require('../item/Item');
const ItemLoader = require('../item/ItemLoader');

class ChromeSpider extends CrawlSpider {
  constructor(config) {
    super(config);
    this.page = null;
    this.puppeteerConfig = config.puppeteerConfig || {};
    this.lastPageSignature = '';
    this.consecutiveDuplicates = 0;
    this.maxConsecutiveDuplicates = 3;
  }

  buildPageSignature(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '';
    }

    return JSON.stringify(items.slice(0, 5));
  }


  async *parse(response) {
    if (!this.page) {
      this.page = globalThis.page____ChromePage____Object;
    }
    let page = this.page;

    // Get initial page count from stats

    let hasNextPage = true;
    let isInitialPage = true;
    while (hasNextPage) {
      // Get current URL for logging
      const currentUrl = await page.url();
      console.log(`Parsing page: ${currentUrl}`);

      if (this.puppeteerConfig.waitForSelector) {
        await this.waitForSelector(page, this.puppeteerConfig.waitForSelector);
      }

      let itemConfig = this.config.itemConfig;
      let extractedData = await ItemLoader.parse(
        page,
        itemConfig,
        false
      );
      extractedData = ItemLoader.ensureArray(extractedData);

      const currentPageSignature = this.buildPageSignature(extractedData);

      if (currentPageSignature && currentPageSignature === this.lastPageSignature) {
        this.consecutiveDuplicates++;
        console.log(`Warning: Duplicate content detected. Consecutive duplicates: ${this.consecutiveDuplicates}`);
        if (this.consecutiveDuplicates >= this.maxConsecutiveDuplicates) {
          console.log('Max consecutive duplicates reached. Stopping crawl.');
          return;
        }
      } else {
        this.consecutiveDuplicates = 0;
      }
      this.lastPageSignature = currentPageSignature;

      console.log(`Extracted ${extractedData?.length} items from page`);

      for (const data of extractedData) {
        yield new Item(data);
      }

      if (!isInitialPage && this.scrapy) {
        this.scrapy.stats.inc('pageCount');
        const currentPageCount = this.scrapy.stats.get('pageCount');
        console.log(`Current page count: ${currentPageCount}`);
      }

      // Check if we should stop after processing current page
      if (this.scrapy?.shouldClose()) {
        console.log('Closing spider due to CLOSESPIDER_PAGECOUNT');
        return;
      }

      // Try to navigate to next page
      hasNextPage = await this.goToNextPage(page);
      if (hasNextPage) {
        isInitialPage = false;
      }
      console.log('Has next page:', hasNextPage);
      if (hasNextPage) {
        // await page.waitForTimeout(this.config.delay || 2000);
      }
    }
  }

  async goToNextPage(page) {
    const { nextPageSelector } = this.puppeteerConfig || {};
    if (!nextPageSelector) return false;
    try {
      const nextPageButton = await this.findElement(page, nextPageSelector);
      console.log('Next Page Button:', nextPageButton);
      if (nextPageButton) {
        const isDisabled = await page.evaluate((selector) => {
          const button = document.querySelector(selector);
          if (!button) return true;
          return button.disabled ||
            button.classList.contains('disabled') ||
            button.getAttribute('aria-disabled') === 'true' ||
            button.style.display === 'none' ||
            button.style.visibility === 'hidden';
        }, nextPageSelector);

        if (isDisabled) {
          console.log('Next page button is disabled. Reached the last page.');
          return false;
        }

        await nextPageButton.click();
        if (this.config.delay) await page.waitForTimeout(this.config.delay || 2000);
        return true;
      }
    } catch (error) {
      throw error;
    }
    return false;
  }

  // Utility function to detect if the selector is an XPath
  isXPath(selector) {
    return selector.startsWith('//') ||
      selector.startsWith('.//') ||
      selector.startsWith('(//') ||
      selector.startsWith('(.//') ||
      selector.startsWith('descendant::') ||
      selector.startsWith('./');
  }

  // Function to find elements using either CSS or XPath
  async findElement(page, selector) {
    if (this.isXPath(selector)) {
      // XPath selector
      const elements = await page.$x(selector);
      return elements.length > 0 ? elements[0] : null;
    } else {
      // CSS selector
      return await page.$(selector);
    }
  }

  // Function to wait for selector using either CSS or XPath
  async waitForSelector(page, selector, options = {}) {
    if (this.isXPath(selector)) {
      // Wait for XPath selector
      await page.waitForXPath(selector, options);
    } else {
      // Wait for CSS selector
      await page.waitForSelector(selector, options);
    }
  }
}

module.exports = ChromeSpider;