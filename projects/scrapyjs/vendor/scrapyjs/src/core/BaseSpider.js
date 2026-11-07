const Request = require('../http/Request');
const Pipeline = require('./Pipeline');

/**
 * Interface for Spider (保持与 Scrapy 中 Spider 类相似)
 */
class ISpider {
    constructor(config = {}) {
        if (new.target === ISpider) {
            throw new TypeError("Cannot construct ISpider instances directly");
        }
        this.name = config.name || 'default_spider';
        this.isSpider = true;
        this._scrapy = null;
    }

    set scrapy(scrapyInstance) {
        this._scrapy = scrapyInstance;
    }

    get scrapy() {
        return this._scrapy;
    }

    start_requests() {
        throw new Error("start_requests() must be implemented in the subclass");
    }

    async *parse(response) {
        throw new Error("parse() must be implemented in the subclass");
    }
}


/**
 * Default implementation of Spider (类似 Scrapy 中 Spider 的默认实现)
 */
class BaseSpider extends ISpider {
    constructor(config = {}) {
        super(config);
        this.start_urls = config.start_urls || [];
        this.allowed_domains = config.allowed_domains || [];
        this.config = config;
        this.pipeline = config.pipeline || new Pipeline(this);
    }

    start_requests() {
        return this.start_urls.map(url => new Request(url, this._parse_response.bind(this)));
    }

    async *_parse_response(response) {
        // This method serves as a middleware between the request and parse
        yield* this.parse(response);
    }

    async *parse(response) {
        // This method should be implemented by subclasses
        console.warn('This method should be overridden by subclasses');
        yield null;
    }
}

module.exports = {
    BaseSpider,
    ISpider
};