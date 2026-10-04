
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
        let hasPuppeteer = typeof globalThis.page____ChromePage____Object !== 'undefined';
        let usePuppeteer = hasPuppeteer;
        if (useHttp) usePuppeteer = false;

        if (!usePuppeteer && typeof source === 'string') {
            source = getCheerio().load(source, { decodeEntities: false });
        }
        console.log('parse:', { usePuppeteer , hasPuppeteer, useHttp });

        const extractedData = await this.extractData(source, config, usePuppeteer);

        if (extractedData.length === 0) {
            console.warn("ItemLoader 没有找到匹配的数据。");
            return null; // 或者返回 []，取决于您希望如何处理这种情况
        }
        // If isDetailPage is true and there's only one item, return an object instead of an array
        return isDetailPage && extractedData.length === 1 ? extractedData[0] : extractedData;
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
    static async extractData(source, config, usePuppeteer) {
        console.log("ItemLoader.extractData, usePuppeteer：", usePuppeteer);
        if (!usePuppeteer) {
            return this.cheerioExtract(source, config);
        } else  {
            const puppeteerPage = this.resolveChromePage();
            return await puppeteerPage.evaluate(function(config) {
                let getDataByConfig = function(config) {
                    const { _listContainer: listSelector, ...itemConfig } = config;
                    let listContainer;

                    if (!listSelector) {
                        // Logic for determining if it's a list or detail page
                        // For now, we'll assume it's a detail page if no list container is specified
                        return extractItemData(document, itemConfig);
                    }

                    listContainer = document.querySelector(listSelector);
                    if (!listContainer) return [];

                    let itemContainers = Array.from(listContainer.children);
                    return itemContainers.map(container => extractItemData(container, itemConfig));
                }
            
                let extractItemData = function(container, itemConfig) {
                    const itemData = {};
                    const keys = Object.keys(itemConfig);
                    for (const key of keys) {
                        const selector = itemConfig[key];
                        if (typeof selector === 'string') {
                            itemData[key] = extractItemValue(container, selector);
                        } else if (typeof selector === 'object') {
                            itemData[key] = extractItemData(container, selector);
                        }
                    }
                    return itemData;
                }
            
                let extractItemValue = function(container, selectorXPath) {
                    let [selector, explicitAttr] = String(selectorXPath).trim().split('::');
                    selector = selector.trim();
                    const isXPath = selector.startsWith('//');
                    const elements = getElements(container, selector, isXPath);
                    if (elements.length === 0) return '';  // Return empty string when no elements are found
                    let datas = elements.map(element => getElement(element, explicitAttr) || '');
                    if (datas.length === 0) return '';  // Return empty string when no data is found
                    return datas.length === 1 ? datas[0] : datas;  // Return single value or array
                }
            
                let getElements = function(context, selector, isXPath = false) {
                    if (isXPath) {
                        const xPathResult = document.evaluate(selector, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
                        const nodes = [];
                        for (let i = 0; i < xPathResult.snapshotLength; i++) {
                            nodes.push(xPathResult.snapshotItem(i));
                        }
                        return nodes;
                    } else {
                        return Array.from(context.querySelectorAll(selector));
                    }
                }
            
                let getElement = function(element, attr) {
                    if (element.nodeType === Node.ATTRIBUTE_NODE) return element.value;
                    if (!element) return '';
                    if (attr === 'innerHTML') return element.innerHTML || '';
                    if (attr === 'outerHTML') return element.outerHTML || '';
            
                    const tagName = element.tagName ? element.tagName.toLowerCase() : '';
            
                    if (!attr) {
                        if (tagName === 'a') return element.innerText.trim() || element.getAttribute('href');
                        if (['img', 'video', 'audio'].includes(tagName)) return element.getAttribute('src') || '';
                        return element.textContent ? element.textContent.trim() : '';
                    }
            
                    let result = element.getAttribute(attr);
                    if (!result && attr === 'innerText' && element.textContent) {
                        result = element.textContent.trim();
                    }
                    return result || '';
                };            
                return getDataByConfig(config);
            }, config);
        } 
    }

    
    
    static resolveChromePage() {
        const page = typeof globalThis !== 'undefined'
            ? globalThis.page____ChromePage____Object
            : undefined;

        if (!page) {
            throw new Error('ItemLoader requires a ChromePage bridge in browser mode. Pass useHttp=true with HTML or provide globalThis.page____ChromePage____Object.');
        }

        return page;
    }

    static cheerioExtract($, config) {
        console.log('cheerioExtract in');
        const { _listContainer: listSelector, ...itemConfig } = config;

        let results = [];

        if (listSelector) {
            const listContainer = $(listSelector);
            if (listContainer.length === 0) {
                console.warn("List container not found");
                return [];
            }
            results = listContainer.children().map((_, item) => this.extractItemData($, $(item), itemConfig)).get();
        } else {
            // If no list container is specified, treat the entire document as a single item
            results = [this.extractItemData($, $.root(), itemConfig)];
        }
    
        // FIXME: Cheerio browser compatibility
        // 以下代码是为了修复 Cheerio 在浏览器环境中的不一致行为
        // 如果 Cheerio 的行为在未来版本中得到修复，可以移除这部分代码
        if (results.length === 1 && this.isAllArrayValues(results[0])) {
            console.log('Applying Cheerio browser compatibility fix');
            return this.transposeResults(results[0]);
        }
    
        return results;
    }
    
    // FIXME: Cheerio browser compatibility
    // 以下方法是 Cheerio 浏览器兼容性修复的一部分
    static isAllArrayValues(obj) {
        return Object.values(obj).every(val => Array.isArray(val) && val.length > 0);
    }
    
    // FIXME: Cheerio browser compatibility
    // 以下方法用于转置结果，修复 Cheerio 在浏览器中的数据结构问题
    static transposeResults(obj) {
        const keys = Object.keys(obj);
        const maxLength = Math.max(...Object.values(obj).map(arr => arr.length));
        
        return Array.from({ length: maxLength }, (_, i) => {
            return keys.reduce((acc, key) => {
                acc[key] = obj[key][i];
                return acc;
            }, {});
        });
    }

    static extractItemData($, container, itemConfig) {
        const itemData = {};
        for (const [key, selector] of Object.entries(itemConfig)) {
            if (typeof selector === 'string') {
                itemData[key] = this.extractItemValue($, container, selector);
            } else if (typeof selector === 'object') {
                itemData[key] = this.extractItemData($, container, selector);
            }
        }
        return itemData;
    }

    static extractItemValue($, container, selectorAttr) {
        const [selector, explicitAttr] = selectorAttr.split('::').map(s => s.trim());
        
        if (selector.startsWith('//')) {
            console.warn('XPath is not supported in Cheerio mode:', selector);
            return '';
        }

        const elements = container.find(selector);
        if (elements.length === 0) return '';

        const getValue = (el) => {
            const $el = $(el);
            if (explicitAttr === 'outerHTML') return $.html($el) || '';
            if (explicitAttr === 'innerHTML') return $el.html() || '';
            if (explicitAttr) return $el.attr(explicitAttr) || '';

            const tagName = $el.prop('tagName') ? $el.prop('tagName').toLowerCase() : '';
            if (tagName === 'a') return $el.text().trim() || $el.attr('href') || '';
            if (['img', 'video', 'audio'].includes(tagName)) return $el.attr('src') || '';

            return $el.text().trim() || '';
        };

        const values = elements.map((_, el) => getValue(el)).get();
        return values.length === 1 ? values[0] : values;  // Return single value if only one, otherwise return array
    }
}

module.exports = ItemLoader;