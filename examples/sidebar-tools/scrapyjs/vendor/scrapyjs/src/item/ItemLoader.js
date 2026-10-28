const extraction = require('./item-loader-extraction');

// 在puppeeter中，或者是cheerio中
function getCheerio() {
    try {
        return require('cheerio');
    } catch {
        throw new Error('ItemLoader requires "cheerio". Please install it with `npm install cheerio`.');
    }
}

class ItemLoader {
    /**
     * Load items based on a flexible configuration.
     * @param {Object|string} source - The source object, either Puppeteer page or HTML string (Cheerio in Node.js).
     * @param {Object} config - The configuration object for extraction.
     * @param {boolean} isDetailPage  - Flag indicating whether to extract a single object or an array.
     * @param {boolean} useHttp - Flag indicating whether to use HTTP requests for data loading.
     * @returns {Object|Array} - Extracted data object or array of data objects.
     */
    static async parse(source, config = {}, isDetailPage = false, useHttp = null) {
        if (useHttp && !(typeof source === 'string' || this.isCheerio(source))) {
            throw extraction.fault('E_ITEMLOADER_SOURCE', '', 'HTTP mode requires HTML or loaded Cheerio');
        }
        const records = await this.extractData(source, config);
        if (!records.length) return null;
        return isDetailPage && records.length === 1 ? records[0] : records;
    }

    // Explicit, constrained configuration path; legacy parse stays compatible.
    static async parseConfig(source, candidate, taskSpec, context = {}) {
        return require('../ai/ConfigExecutor').inspectPage(source, candidate, taskSpec, context);
    }

    static async parsePage(response, options) {
        return require('./parse-page')(response, options);
    }

    static ensureArray(data) {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (typeof data === 'object' && Object.keys(data).length > 0) return [data];
        return [];
    }

    /**
     * Extract data based on a single configuration.
     * @param {Object} source - The source object, either Cheerio object ($) or Puppeteer page.
     * @param {Object} config - Configuration object for a single item.
     * @param {boolean} usePuppeteer - Flag to determine if Puppeteer is being used.
     * @returns {Array} - Array of extracted data objects.
     */
    static isCheerio(source) {
        return typeof source === 'function' && typeof source.root === 'function';
    }

    static async extractData(source, config, usePuppeteer) {
        const normalized = extraction.normalizeConfig(config);
        if (typeof source === 'string') source = getCheerio().load(source, { decodeEntities: false });
        if (this.isCheerio(source)) return this.unwrap(extraction.extractRecords(normalized, source));
        // document.evaluate is the native XPath API, not a page bridge.
        const page = source && source.nodeType !== 9 && typeof source.evaluate === 'function' ? source : this.resolveChromePage(source, usePuppeteer);
        return this.unwrap(await page.evaluate(extraction.extractRecords, normalized));
    }

    static resolveChromePage(source, usePuppeteer) {
        // Preserve the missing-source and extractData(document, ..., true) bridge
        // entry points. Arbitrary explicit objects must never select global data.
        const documentSource = source && source.nodeType === 9;
        if (source != null && !(documentSource && usePuppeteer === true)) {
            throw extraction.fault('E_ITEMLOADER_SOURCE', '', 'Expected HTML, loaded Cheerio or a page with evaluate');
        }
        const page = globalThis.page____ChromePage____Object;
        if (!page || typeof page.evaluate !== 'function') {
            throw extraction.fault('E_ITEMLOADER_SOURCE', '', 'ItemLoader requires an evaluate page or ChromePage bridge');
        }
        return page;
    }

    static unwrap(result) {
        if (result.error) {
            const error = new Error(result.error.message);
            error.code = result.error.code;
            error.path = result.error.path;
            throw error;
        }
        return result.records;
    }

    static cheerioExtract($, config) {
        if (!this.isCheerio($)) throw extraction.fault('E_ITEMLOADER_SOURCE', '', 'Expected loaded Cheerio');
        return this.unwrap(extraction.extractRecords(extraction.normalizeConfig(config), $));
    }

    static extractItemData($, container, itemConfig) {
        return this.unwrap(extraction.extractRecords(extraction.normalizeConfig(itemConfig), $, container))[0];
    }

    static extractItemValue($, container, selectorAttr) {
        return this.extractItemData($, container, { value: selectorAttr }).value;
    }
}

module.exports = ItemLoader;
