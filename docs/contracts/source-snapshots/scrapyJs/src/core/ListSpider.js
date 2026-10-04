function getCheerio() {
    try {
        return require('cheerio');
    } catch {
        throw new Error('ListSpider requires "cheerio". Please install it with `npm install cheerio`.');
    }
}

const {BaseSpider, ISpider} = require('./BaseSpider');
const Spider = require('./Spider');
const Item = require('../item/Item');
const ItemLoader = require('../item/ItemLoader');
const Request = require('../http/Request');

class ListSpider extends Spider {
    constructor(config) {
        super(config);
        this.pageNum = 1; // Start from page 1 instead of 0
        this.nextPageSelector = config.nextPageSelector;
        this.nextPageText = config.nextPageText;
    }

    async *parse(response) {
        try {
            console.log(`Processing page ${this.pageNum}, URL: ${response.url}`);
            
            let extractedData = await ItemLoader.parse(
                response.text,
                this.config.itemConfig,
                false,
                true
            );
            extractedData = ItemLoader.ensureArray(extractedData);

            console.log(`Extracted ${extractedData.length} items from page ${this.pageNum}`);

            // Yield current page items
            for (const data of extractedData) {
                yield new Item(data);
            }

            // Handle pagination
            if (this.nextPageSelector) {
                const $ = getCheerio().load(response.text);
                const nextPageUrl = this.getNextPageUrl($, response.url);
                
                if (nextPageUrl) {
                    console.log(`Found next page URL (page ${this.pageNum + 1}): ${nextPageUrl}`);
                    this.pageNum++;
                    
                    // Add a small delay before fetching next page (configurable)
                    const delay = this.config.delay ?? 2000;
                    const overrides = {
                        url: nextPageUrl, callback: this.parse.bind(this),
                        dont_filter: false, _retryCount: 0, _retryRequest: false,
                        _availableAt: Date.now() + Math.max(0, Number(delay) || 0),
                    };
                    yield response.request instanceof Request
                        ? response.request.clone(overrides)
                        : new Request(nextPageUrl, this.parse.bind(this), overrides);
                } else {
                    console.log('No more pages found to scrape');
                }
            }
        } catch (error) {
            throw error;
        }
    }

    getNextPageUrl($, currentUrl) {
        if (!this.nextPageSelector) return null;
        
        let nextPageLink;
        console.log(`Searching for next page link on page ${this.pageNum}`);
        
        const allLinks = $(this.nextPageSelector);
        console.log(`Found ${allLinks.length} potential navigation links`);

        // For debugging, log all found links
        allLinks.each((i, el) => {
            console.log(`Link ${i + 1}:`, {
                text: $(el).text().trim(),
                href: $(el).attr('href')
            });
        });

        if (this.nextPageText) {
            // Find link with specific text
            nextPageLink = allLinks.filter((_, element) => {
                const text = $(element).text().trim();
                return text.includes(this.nextPageText);
            });
            console.log(`Found ${nextPageLink.length} links matching text "${this.nextPageText}"`);
        } else {
            // If no specific text is required, use first matching link
            nextPageLink = allLinks.first();
        }

        if (nextPageLink.length > 0) {
            const relativeUrl = nextPageLink.attr('href');
            if (!relativeUrl) {
                console.log('Found link element but no href attribute');
                return null;
            }

            try {
                return new URL(relativeUrl, currentUrl).toString();
            } catch (error) {
                console.error('Error processing next page URL:', error);
                return null;
            }
        }

        console.log('No valid next page link found');
        return null;
    }

    isValidNextPageUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
}

// Fix prototype chain
Object.setPrototypeOf(ListSpider.prototype, Spider.prototype);
ListSpider.prototype.constructor = ListSpider;

module.exports = ListSpider;