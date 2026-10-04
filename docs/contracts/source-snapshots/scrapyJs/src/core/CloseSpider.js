
// CloseSpider.js

class CloseSpider {
    constructor(scrapy) {
        this.scrapy = scrapy;
        this.reasons = new Map();
        this.closingReason = null;
    }

    addReason(reason, value) {
        if (value == null || value === false) {
            return;
        }
        this.reasons.set(reason, Number.isFinite(Number(value)) ? Number(value) : value);
    }

    clearReasons() {
        this.reasons.clear();
    }

    check(spider) {
        for (const [reason, value] of this.reasons) {
            switch (reason) {
                case 'page_count': {
                    const limit = Number(value);
                    const currentPageCount = this.scrapy.stats.get('pageCount');
                    console.log(`Checking page count: ${currentPageCount}/${limit}`);
                    if (limit > 0 && currentPageCount >= limit) {
                        this.closingReason = `closespider_pagecount`;
                        return true;
                    }
                    break;
                }
                case 'item_count':
                    if (this.scrapy.stats.itemCount >= value) {
                        this.closingReason = `closespider_itemcount`;
                        return true;
                    }
                    break;
                case 'timeout':
                    const elapsedTime = Date.now() - this.scrapy.stats.startTime;
                    if (elapsedTime >= value * 1000) { // 将秒转换为毫秒
                        this.closingReason = `closespider_timeout`;
                        return true;
                    }
                    break;
// 可以在这里添加其他关闭条件
            }
        }
        return false;
    }

    getClosingReason() {
        return this.closingReason;
    }

    reset() {
        this.closingReason = null;
    }
}

module.exports = CloseSpider;