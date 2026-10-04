function ensureExecuteScriptPolyfill() {
    if (typeof chrome === 'undefined') {
        return;
    }
    if (!chrome.scripting || !chrome.tabs) {
        return;
    }
    if (typeof chrome.tabs.executeScript === 'function') {
        return;
    }
    chrome.tabs.executeScript = function legacyExecuteScript(tabIdOrDetails, detailsOrCallback, callback) {
        let targetTabId = null;
        let details = null;
        let cb = callback;
        if (typeof tabIdOrDetails === "number") {
            targetTabId = tabIdOrDetails;
            details = detailsOrCallback || {};
        } else {
            details = tabIdOrDetails || {};
            cb = typeof detailsOrCallback === "function" ? detailsOrCallback : undefined;
        }
        const runInjection = (tabId) => {
            if (typeof tabId !== "number") {
                console.error("legacy executeScript polyfill: missing tabId");
                if (cb) {
                    cb([]);
                }
                return;
            }
            const target = { tabId };
            if (details?.allFrames) {
                target.allFrames = true;
            }
            if (typeof details?.frameId === "number") {
                target.frameIds = [details.frameId];
            }
            const injection = {
                target
            };
            if (details?.world) {
                injection.world = details.world;
            }
            if (details?.code) {
                injection.func = function executeDynamicCode(code) {
                    return eval(code);
                };
                injection.args = [details.code];
            } else if (details?.file) {
                injection.files = [details.file];
            } else if (Array.isArray(details?.files)) {
                injection.files = details.files;
            } else {
                console.error("legacy executeScript polyfill: missing code or file");
                if (cb) {
                    cb([]);
                }
                return;
            }
            if (details?.runAt === "document_start") {
                injection.injectImmediately = true;
            }
            chrome.scripting.executeScript(injection, (results) => {
                if (cb) {
                    const legacyResults = Array.isArray(results) ? results.map((item) => item?.result) : [];
                    cb(legacyResults);
                }
            });
        };
        if (typeof targetTabId === "number") {
            runInjection(targetTabId);
        } else {
            chrome.tabs.query({ active: true }, (tabs) => {
                const tab = tabs?.find((t) => !t.url?.startsWith?.("chrome-extension://"));
                runInjection(tab ? tab.id : undefined);
            });
        }
    };
}

ensureExecuteScriptPolyfill();

function createRequestId(prefix = "popup") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildRequestMeta(source, requestId) {
    return {
        protocolVersion: "1.0",
        requestId,
        source,
        timestamp: Date.now()
    };
}

function createProtocolError(message, errorCode, requestId) {
    const err = new Error(message || "Unknown runtime error");
    if (errorCode) {
        err.errorCode = errorCode;
    }
    if (requestId) {
        err.requestId = requestId;
    }
    return err;
}

function sendRuntimeMessageWithProtocol(message, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000;
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (cb, value) => {
            if (done) {
                return;
            }
            done = true;
            if (timer) {
                clearTimeout(timer);
            }
            cb(value);
        };

        const timer = timeoutMs > 0 ? setTimeout(() => {
            finish(
                reject,
                createProtocolError(
                    `Wait timed out after ${timeoutMs}ms; backend may still be running.`,
                    "E_TIMEOUT",
                    message?.requestId
                )
            );
        }, timeoutMs) : null;

        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    finish(
                        reject,
                        createProtocolError(
                            chrome.runtime.lastError.message,
                            "E_RUNTIME_LAST_ERROR",
                            message?.requestId
                        )
                    );
                    return;
                }
                if (!response) {
                    finish(
                        reject,
                        createProtocolError(
                            "No response from background",
                            "E_NO_RESPONSE",
                            message?.requestId
                        )
                    );
                    return;
                }
                if (response?.requestId && message?.requestId && response.requestId !== message.requestId) {
                    finish(
                        reject,
                        createProtocolError(
                            `RequestId mismatch: expected ${message.requestId}, received ${response.requestId}`,
                            "E_REQUEST_ID_MISMATCH",
                            message?.requestId
                        )
                    );
                    return;
                }
                finish(resolve, response);
            });
        } catch (error) {
            finish(reject, error);
        }
    });
}

// Utility function to adjust textarea height
function adjustTextareaHeight(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

// Default next page selector
var nextPageSelector = "";
var listSelector = "";
let config = {};
// Store the original raw data globally for reprocessing
let originalRawData = [];
let rawDataSource = { kind: 'records', itemConfig: {} };
let profileLabelChange = null;
  

// Utility functions for file handling and clipboard
function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function copyToClipboard(text) {
    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = text;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    document.execCommand('copy');
    document.body.removeChild(tempTextArea);
    // alert('Data copied to clipboard!');
}

// TableDataHandler class for managing table data
class TableDataHandler {
    static customHeaders = new Map();
    static itemConfig = null;
    static currentData = null;
    static dataTable = null;
    static headerRow = null;

    static currentLanguage = 'zh'; // Default language: Chinese
    
    // Multi-language field mappings
    static languageMappings = {
        'zh': { // Chinese
            'title': '标题',
            'name': '名称',
            'description': '描述',
            'desc': '描述',
            'price': '价格',
            'url': '链接地址',
            'headImg': '头像',
            'link': '链接',
            'image': '图片',
            'img': '图片',
            'author': '作者',
            'date': '日期',
            'time': '时间',
            'datetime': '日期时间',
            'category': '分类',
            'tags': '标签',
            'rating': '评分',
            'reviews': '评论数',
            'review': '评论',
            'address': '地址',
            'location': '位置',
            'phone': '电话',
            'tel': '电话号码',
            'email': '电子邮箱',
            'website': '网站',
            'content': '内容',
            'summary': '摘要',
            'details': '详情',
            'info': '信息',
            'product': '产品',
            'quantity': '数量',
            'stock': '库存',
            'availability': '可用性',
            'brand': '品牌',
            'manufacturer': '制造商',
            'comment': '评论',
            'comments': '评论',
            'id': '编号',
            'sku': '商品编码',
            'source': '来源',
            'price_original': '原价',
            'price_current': '现价',
            'discount': '折扣',
            'status': '状态',
            'type': '类型',
            'size': '尺寸',
            'color': '颜色',
            'weight': '重量',
            'dimensions': '尺寸规格',
            'specification': '规格',
            'features': '特点',
            'keywords': '关键词',
            'views': '浏览量',
            'likes': '点赞数',
            'shares': '分享数',
            'downloads': '下载数',
            'published': '发布时间',
            'updated': '更新时间',
            'created': '创建时间',
            'expires': '过期时间',
            'seller': '卖家',
            'store': '店铺',
            'shipping': '运费',
            'delivery': '配送',
            'payment': '支付',
            'coupon': '优惠券',
            'promotion': '促销',
            'warranty': '保修',
            'condition': '商品状态',
            'model': '型号',
            'version': '版本',
            'year': '年份',
            'duration': '时长',
            'frequency': '频率',
            'level': '等级',
            'priority': '优先级',
            'score': '得分',
            'count': '数量'
        },
        'en': { // English (for future use)
            'title': 'Title',
            'name': 'Name',
            'description': 'Description',
            'desc': 'Description',
            'price': 'Price',
            'url': 'URL',
            'link': 'Link',
            'image': 'Image',
            'img': 'Image',
            'author': 'Author',
            'date': 'Date',
            'time': 'Time',
            'datetime': 'Date & Time',
            'category': 'Category',
            'tags': 'Tags',
            'rating': 'Rating',
            'reviews': 'Reviews',
            'review': 'Review',
            'address': 'Address',
            'location': 'Location',
            'phone': 'Phone',
            'tel': 'Telephone',
            'email': 'Email',
            'website': 'Website',
            'content': 'Content',
            'summary': 'Summary',
            'details': 'Details',
            'info': 'Information',
            'product': 'Product',
            'quantity': 'Quantity',
            'stock': 'Stock',
            'availability': 'Availability',
            'brand': 'Brand',
            'manufacturer': 'Manufacturer',
            'comment': 'Comment',
            'comments': 'Comments',
            'id': 'ID',
            'sku': 'SKU',
            'source': 'Source',
            'price_original': 'Original Price',
            'price_current': 'Current Price',
            'discount': 'Discount',
            'status': 'Status',
            'type': 'Type',
            'size': 'Size',
            'color': 'Color',
            'weight': 'Weight',
            'dimensions': 'Dimensions',
            'specification': 'Specification',
            'features': 'Features',
            'keywords': 'Keywords',
            'views': 'Views',
            'likes': 'Likes',
            'shares': 'Shares',
            'downloads': 'Downloads',
            'published': 'Published Date',
            'updated': 'Updated Date',
            'created': 'Created Date',
            'expires': 'Expiration Date',
            'seller': 'Seller',
            'store': 'Store',
            'shipping': 'Shipping',
            'delivery': 'Delivery',
            'payment': 'Payment',
            'coupon': 'Coupon',
            'promotion': 'Promotion',
            'warranty': 'Warranty',
            'condition': 'Condition',
            'model': 'Model',
            'version': 'Version',
            'year': 'Year',
            'duration': 'Duration',
            'frequency': 'Frequency',
            'level': 'Level',
            'priority': 'Priority',
            'score': 'Score',
            'count': 'Count',
            'countInfo': 'Count Info',
            'count1': 'Count 1',
            'count2': 'Count 2',
            'count3': 'Count 3'
        }
    };

    static initialize() {
        this.dataTable = document.querySelector('.data-table tbody');
        this.headerRow = document.querySelector('.data-table thead tr');
        
        if (!this.dataTable || !this.headerRow) {
            console.error('Table elements not found in the DOM');
            return false;
        }
        
        return true;
    }

    // Set language for display
    static setLanguage(languageCode) {
        if (this.languageMappings[languageCode]) {
            this.currentLanguage = languageCode;
            // If there's active data, refresh headers with new language
            if (this.currentData && this.currentData.length > 0) {
                this.updateTableHeaders(this.currentData);
            }
            // If there's a config, refresh header inputs
            if (this.itemConfig) {
                this.updateHeaderInputs(this.itemConfig);
            }
        } else {
            console.error(`Language ${languageCode} not supported`);
        }
    }

    // Get table headers
    static getTableHeaders(itemConfig) {
        return Object.keys(itemConfig || {}).filter(key => !key.startsWith('_'));
    }

    // Format table data with proper handling for missing values
    static formatTableData(rawData) {
        if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
            return [];
        }
        
        // Get all possible fields across all items to handle varying fields
        const allFields = new Set();
        rawData.forEach(item => {
            Object.keys(item).forEach(key => {
                if (!key.startsWith('_')) {
                    allFields.add(key);
                }
            });
        });
        
        const fields = Array.from(allFields);
        
        return rawData.map(item => {
            const formattedItem = {};
            fields.forEach(field => {
                // Handle undefined, null, or empty values consistently
                formattedItem[field] = item[field] !== undefined ? item[field] : '';
            });
            return formattedItem;
        });
    }

    // Update table headers
    static updateTableHeaders(data) {
        if (!data) return;
        
        this.headerRow.innerHTML = '';
        const fields = Object.keys(data[0] || {});
        
        fields.forEach(field => {
            const th = document.createElement('th');
            th.textContent = this.getCustomHeader(field);
            this.headerRow.appendChild(th);
        });
    }

    // Update table data
    static updateTableData(formattedData) {
        this.dataTable.innerHTML = '';
        
        if (!formattedData || formattedData.length === 0) {
            const tr = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 5; // Span all columns
            td.textContent = '暂无数据';
            td.style.textAlign = 'center';
            tr.appendChild(td);
            this.dataTable.appendChild(tr);
            return;
        }
        
        formattedData.forEach(row => {
            const tr = document.createElement('tr');
            Object.values(row).forEach(value => {
                const td = document.createElement('td');
                const display = CrawlProfileCore.renderValue(value);
                td.textContent = display.text;
                td.title = display.title;
                tr.appendChild(td);
            });
            this.dataTable.appendChild(tr);
        });
    }
    
    // Add this method to TableDataHandler class or modify the existing one
    static updateTableDataWithOrder(formattedData, configOrder) {
        this.dataTable.innerHTML = '';
        
        if (!formattedData || formattedData.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5; // Span all columns
        td.textContent = '暂无数据';
        td.style.textAlign = 'center';
        tr.appendChild(td);
        this.dataTable.appendChild(tr);
        return;
        }
        
        // Get ordered keys from config, filtering out system keys
        const orderedKeys = configOrder ? 
        Object.keys(configOrder).filter(key => !key.startsWith('_')) : 
        Object.keys(formattedData[0]);
        
        formattedData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Add cells in the order defined by the config
        orderedKeys.forEach(key => {
            const td = document.createElement('td');
            const display = CrawlProfileCore.renderValue(row[key]);
            td.textContent = display.text;
            td.title = display.title;
            tr.appendChild(td);
        });
        
        this.dataTable.appendChild(tr);
        });
    }
    
    // Also update the headers in the same order
    static updateTableHeadersWithOrder(data, configOrder) {
        if (!data) return;
        
        this.headerRow.innerHTML = '';
        
        // Get ordered keys from config, filtering out system keys
        const orderedKeys = configOrder ? 
        Object.keys(configOrder).filter(key => !key.startsWith('_')) : 
        Object.keys(data[0] || {});
        
        orderedKeys.forEach(field => {
        const th = document.createElement('th');
        th.textContent = this.getCustomHeader(field);
        this.headerRow.appendChild(th);
        });
    }
    
    // Update the setTableData method to use the ordered versions
    static setTableData(rawData, configOrder = null) {
        try {
        if (!this.initialize()) return null;
        
        const formattedData = this.formatTableData(rawData);
        console.log('Formatted data:', formattedData);
        
        if (configOrder) {
            this.updateTableHeadersWithOrder(formattedData, configOrder);
            this.updateTableDataWithOrder(formattedData, configOrder);
        } else {
            this.updateTableHeaders(formattedData);
            this.updateTableData(formattedData);
        }
        
        this.currentData = formattedData; // Store current data
        return formattedData;
        } catch (error) {
        console.error('Error setting table data:', error);
        throw error;
        }
    }
    

    // Get current formatted data
    static getFormattedData() {
        return this.currentData || [];
    }

    // Update the updateHeaderInputs method to use translated headers
    static updateHeaderInputs(config) {
        const container = document.getElementById('headerSettingsContainer');
        if (!container || !config) return;

        container.innerHTML = '';
        this.itemConfig = config; // Store current config

        Object.entries(config).forEach(([field, selector]) => {
            if (field.startsWith('_')) return;

            const headerRow = document.createElement('div');
            headerRow.className = 'header-row';

            const label = document.createElement('label');
            // Use getCustomHeader for label to show the translated/localized version
            label.textContent = field; // this.getCustomHeader(field);
            
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'header-input';
            input.dataset.field = field;
            // Use user custom header if exists, otherwise use localized header
            input.value = this.getStoredCustomHeader(field) || this.getCustomHeader(field);
            // Show original field name as placeholder
            input.placeholder = field;

            headerRow.appendChild(label);
            headerRow.appendChild(input);
            container.appendChild(headerRow);

            input.addEventListener('input', () => {
                if (profileLabelChange) {
                    profileLabelChange(field, input.value);
                    return;
                }
                this.setCustomHeader(field, input.value);
                this.saveCustomHeaders();
                
                // Update table headers if table exists
                if (this.headerRow) {
                    const headers = Array.from(this.headerRow.children);
                    const index = Object.keys(config)
                        .filter(key => !key.startsWith('_'))
                        .indexOf(field);
                        
                    if (index >= 0 && headers[index]) {
                        headers[index].textContent = input.value || this.getCustomHeader(field);
                    }
                }
            });
        });
    }

    // Set custom header
    static setCustomHeader(field, customHeader) {
        if (customHeader && customHeader.trim()) {
            this.customHeaders.set(field, customHeader.trim());
        } else {
            this.customHeaders.delete(field);
        }
    }

    // Get stored custom header (user-defined only)
    static getStoredCustomHeader(field) {
        return this.customHeaders.get(field) || '';
    }

    // Modified getCustomHeader function with improved field matching
    static getCustomHeader(field) {
        // First check for user-defined custom header
        if (this.customHeaders.has(field)) {
            return this.customHeaders.get(field);
        }
        
        // For selector values (values that start with '.'), strip the leading dot
        const normalizedField = field.startsWith('.') ? field.substring(1) : field;
        
        // Then check for localized header in current language
        const fieldLower = normalizedField.toLowerCase();
        const languageMap = this.languageMappings[this.currentLanguage];
        
        if (languageMap && languageMap[fieldLower]) {
            return languageMap[fieldLower];
        }
        
        // Additional check for common field names without special characters
        // This helps with fields that may have selectors attached
        const simplifiedField = fieldLower.replace(/[^a-z0-9]/g, '');
        for (const [key, value] of Object.entries(languageMap || {})) {
            if (simplifiedField === key.replace(/[^a-z0-9]/g, '')) {
                return value;
            }
        }
        
        // Format camelCase or snake_case fields (with Chinese formatting)
        if (normalizedField.includes('_') || (normalizedField.match(/[a-z][A-Z]/) !== null)) {
            if (this.currentLanguage === 'zh') {
                // For Chinese, just remove underscores and convert to simple text
                return normalizedField
                    .replace(/_/g, '')
                    .replace(/([A-Z])/g, '$1')
                    .toLowerCase();
            } else {
                // For other languages, use title case formatting
                return normalizedField
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase())
                    .trim();
            }
        }
        
        // Default to the original field name
        return field;
    }

    
    // Save custom headers
    static saveCustomHeaders() {
        const headers = Object.fromEntries(this.customHeaders);
        chrome.storage.local.set({ customHeaders: headers });
    }

    // Load custom headers
    static loadCustomHeaders(config) {
        chrome.storage.local.get(['customHeaders', 'language'], result => {
            // Load custom headers
            if (result.customHeaders) {
                this.customHeaders = new Map(Object.entries(result.customHeaders));
            }
            
            // Load language preference
            if (result.language && this.languageMappings[result.language]) {
                this.currentLanguage = result.language;
            }
            
            // Update UI
            this.updateHeaderInputs(config);
        });
    }

    // Save language preference
    static saveLanguagePreference() {
        chrome.storage.local.set({ language: this.currentLanguage });
    }
    
    // Convert data to CSV format with proper escaping
    static toCSV(formattedData) {
        if (!formattedData || formattedData.length === 0) return '';
        
        const fields = Object.keys(formattedData[0]);
        const headers = fields.map(field => this.getCustomHeader(field));
        
        // Helper function to escape CSV values
        const escapeCSV = (value) => {
            if (value === null || value === undefined) return '';
            const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
            // If contains comma, quotes or newline, wrap in quotes and escape quotes
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };
        
        const csvRows = [
            headers.map(escapeCSV).join(','),
            ...formattedData.map(row => 
                fields.map(field => escapeCSV(row[field])).join(',')
            )
        ];
        
        return csvRows.join('\n');
    }

    // Convert data to formatted JSON
    static toJSON(formattedData) {
        return JSON.stringify(formattedData, null, 2);
    }
}

function unwrapRuntimeResponse(payload) {
    if (!payload) {
        return { success: false, error: "Empty response payload", errorCode: "E_EMPTY_RESPONSE" };
    }
    if (payload.type === "testMonkeyFramework") {
        return payload.success
            ? { success: true, value: payload.data, requestId: payload.requestId, errorCode: payload.errorCode ?? null }
            : {
                success: false,
                error: payload.error || "Script execution failed",
                requestId: payload.requestId,
                errorCode: payload.errorCode ?? "E_SCRIPT_EXEC_FAIL"
            };
    }
    if (payload.success && payload.data?.type === "testMonkeyFramework") {
        const inner = payload.data;
        return inner.success
            ? {
                success: true,
                value: inner.data,
                requestId: payload.requestId ?? inner.requestId,
                errorCode: inner.errorCode ?? payload.errorCode ?? null
            }
            : {
                success: false,
                error: inner.error || "Script execution failed",
                requestId: payload.requestId ?? inner.requestId,
                errorCode: inner.errorCode ?? payload.errorCode ?? "E_SCRIPT_EXEC_FAIL"
            };
    }
    if (payload.success === false) {
        return {
            success: false,
            error: payload.error || payload.message || "Script execution failed",
            requestId: payload.requestId,
            errorCode: payload.errorCode ?? "E_HANDLER_EXEC_FAIL",
            stage: payload.stage,
            runResult: payload.runResult,
            stats: payload.stats
        };
    }

    const hasEnvelope =
        Object.prototype.hasOwnProperty.call(payload, "success") ||
        Object.prototype.hasOwnProperty.call(payload, "data") ||
        Object.prototype.hasOwnProperty.call(payload, "result");
    if (hasEnvelope) {
        return {
            success: true,
            value: payload.data ?? payload.result,
            requestId: payload.requestId,
            errorCode: payload.errorCode ?? null
        };
    }

    return { success: true, value: payload, requestId: payload.requestId, errorCode: payload.errorCode ?? null };
}

const SCRAPYJS_POPUP_RUN_STORAGE_KEY = "scrapyjsPopupRun";
let selectedPageIdentity = null;
let activePopupRun = null;

function isExtensionUrl(url) {
    return typeof url === "string" && url.startsWith("chrome-extension://");
}

function isInjectablePageUrl(url) {
    return typeof url === "string"
        && /^https?:\/\//i.test(url)
        && !isExtensionUrl(url);
}

function clonePlain(value) {
    return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function tabToPageIdentity(tab) {
    if (!tab || typeof tab.id !== "number" || !isInjectablePageUrl(tab.url)) {
        return null;
    }
    return {
        tabId: tab.id,
        url: tab.url,
        title: tab.title || "",
        windowId: tab.windowId
    };
}

function getPopupQueryTabId() {
    try {
        const params = new URLSearchParams(globalThis.location?.search || "");
        const raw = params.get("tabId");
        if (raw == null || raw === "") {
            return null;
        }
        const tabId = Number(raw);
        return Number.isInteger(tabId) && tabId >= 0 ? tabId : null;
    } catch (error) {
        console.warn("Unable to parse popup tabId parameter:", error);
        return null;
    }
}

function getTabById(tabId) {
    return new Promise((resolve, reject) => {
        if (!chrome?.tabs?.get || !Number.isInteger(tabId)) {
            resolve(null);
            return;
        }
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve(tab || null);
        });
    });
}

function queryActiveTabInWindow(windowId) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, windowId }, function(tabs) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve((tabs || [])[0] || null);
        });
    });
}

async function getCurrentPageIdentity() {
    const queryTabId = getPopupQueryTabId();
    if (Number.isInteger(queryTabId)) {
        return tabToPageIdentity(await getTabById(queryTabId));
    }

    if (chrome?.windows?.getLastFocused) {
        const focusedWindow = await new Promise((resolve, reject) => {
            chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (windowInfo) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }
                resolve(windowInfo || null);
            });
        });
        if (typeof focusedWindow?.id === "number") {
            return tabToPageIdentity(await queryActiveTabInWindow(focusedWindow.id));
        }
    }

    return new Promise((resolve, reject) => {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }
            resolve(tabToPageIdentity((tabs || [])[0]));
        });
    });
}

async function getSelectedPageIdentity({ refresh = false } = {}) {
    if (!refresh && selectedPageIdentity?.tabId && selectedPageIdentity?.url) {
        return selectedPageIdentity;
    }
    selectedPageIdentity = await getCurrentPageIdentity();
    return selectedPageIdentity;
}

function mergeTabBinding(detail, identity) {
    if (!identity || typeof identity.tabId !== "number") {
        return detail;
    }
    return {
        ...detail,
        tabId: detail.tabId ?? identity.tabId,
        pageIdentity: detail.pageIdentity ?? {
            tabId: identity.tabId,
            url: identity.url,
            title: identity.title,
            windowId: identity.windowId
        }
    };
}

function getRunResultCounts(runResult, stats) {
    const counts = runResult?.counts || {};
    return {
        pages: firstNumber(runResult?.pageCount, stats?.pageCount),
        rows: firstNumber(runResult?.itemCount, stats?.itemCount, counts.accepted, counts.committed)
    };
}

function firstNumber(...values) {
    return values.find((value) => typeof value === "number" && Number.isFinite(value));
}

function normalizeScrapyRunPayload(payload) {
    if (Array.isArray(payload)) {
        return {
            data: payload,
            stats: null,
            runResult: null,
            status: "completed",
            delivery: null,
            error: null
        };
    }
    const value = payload && typeof payload === "object" ? payload : {};
    const runResult = value.runResult || null;
    const stats = value.stats || runResult || null;
    const data = Array.isArray(value.data) ? value.data : (Array.isArray(value.result) ? value.result : payload);
    const status = runResult?.status
        || value.status
        || value.state
        || (value.active === true ? "running" : null)
        || (value.active === false ? "idle" : null)
        || (Array.isArray(data) ? "completed" : "completed");
    return {
        data,
        stats,
        runResult,
        status,
        delivery: runResult?.delivery || value.delivery || null,
        error: runResult?.error || value.error || null
    };
}

function getDeliveryAckText(delivery) {
    if (!delivery) {
        return "";
    }
    if (delivery.ackLevel) {
        return `；交付确认: ${delivery.ackLevel}`;
    }
    if (delivery.deliveryUnknown) {
        return "；交付状态未知";
    }
    return "";
}

function mapRunStatusToUi(status) {
    switch (status) {
        case "completed":
            return "success";
        case "partial":
            return "partial";
        case "stopped":
            return "stopped";
        case "failed":
            return "failed";
        case "paused":
            return "paused";
        case "stopping":
            return "stopping";
        default:
            return status || "success";
    }
}

function hasRunStatusInfo(payload) {
    return !!(
        Object.prototype.hasOwnProperty.call(payload || {}, "active") ||
        payload?.runResult?.status ||
        payload?.status ||
        payload?.state ||
        payload?.stats?.status ||
        payload?.runResult?.runId ||
        payload?.runId
    );
}

function attachRunErrorDetails(error, details = {}) {
    if (!error || typeof error !== "object") {
        return error;
    }
    for (const key of ["stage", "runResult", "stats"]) {
        if (details[key] !== undefined) {
            error[key] = details[key];
        }
    }
    return error;
}

async function persistPopupRunState(state) {
    activePopupRun = state ? clonePlain(state) : null;
    if (!chrome?.storage?.local) {
        return;
    }
    await new Promise((resolve) => {
        if (activePopupRun) {
            chrome.storage.local.set({ [SCRAPYJS_POPUP_RUN_STORAGE_KEY]: activePopupRun }, resolve);
        } else {
            chrome.storage.local.remove(SCRAPYJS_POPUP_RUN_STORAGE_KEY, resolve);
        }
    });
}

async function loadPopupRunState() {
    if (!chrome?.storage?.local) {
        return null;
    }
    const result = await new Promise((resolve) => {
        chrome.storage.local.get([SCRAPYJS_POPUP_RUN_STORAGE_KEY], resolve);
    });
    activePopupRun = result?.[SCRAPYJS_POPUP_RUN_STORAGE_KEY] || null;
    return activePopupRun;
}

async function sendScrapyLifecycleRequest(action, runState = activePopupRun, options = {}) {
    const type = `SCRAPYJS_${action}`;
    const requestId = createRequestId(`popup_${action.toLowerCase()}`);
    const identity = runState?.pageIdentity || selectedPageIdentity || await getSelectedPageIdentity();
    const detail = mergeTabBinding(
        {
            runId: options.runId ?? runState?.runId,
            ownerRequestId: runState?.requestId
        },
        identity
    );
    const response = await sendRuntimeMessageWithProtocol(
        {
            type,
            requestId,
            meta: buildRequestMeta("popup", requestId),
            detail
        },
        { timeoutMs: options.timeoutMs ?? 10000 }
    );
    const unwrapped = unwrapRuntimeResponse(response);
    if (!unwrapped.success) {
        const err = createProtocolError(unwrapped.error || `${type} failed`, unwrapped.errorCode, unwrapped.requestId || requestId);
        throw attachRunErrorDetails(err, unwrapped);
    }
    return unwrapped.value ?? { ack: true, type, requestId };
}

async function queryScrapyStatus(runState = activePopupRun, options = {}) {
    try {
        return await sendScrapyLifecycleRequest("STATUS", runState, options);
    } catch (error) {
        if (error?.errorCode === "E_TIMEOUT") {
            throw error;
        }
        if (error?.errorCode === "E_STALE_RUN_ID" && options.allowRunIdFallback !== false) {
            try {
                return await sendScrapyLifecycleRequest("STATUS", { ...runState, runId: null }, { ...options, runId: null, allowRunIdFallback: false });
            } catch (fallbackError) {
                if (fallbackError?.errorCode === "E_TIMEOUT") {
                    throw fallbackError;
                }
                console.warn("[ScrapyJsRun] status fallback unavailable:", fallbackError);
                return null;
            }
        }
        console.warn("[ScrapyJsRun] status reconciliation unavailable:", error);
        return null;
    }
}

async function refreshActivePopupRun(options = {}) {
    if (!activePopupRun || !["running", "paused", "stopping"].includes(activePopupRun.status)) {
        return activePopupRun;
    }
    const status = await queryScrapyStatus(activePopupRun, { timeoutMs: options.timeoutMs ?? 8000 });
    if (!status || !hasRunStatusInfo(status)) {
        return activePopupRun;
    }
    const normalized = normalizeScrapyRunPayload(status);
    const nextState = {
        ...activePopupRun,
        runId: normalized.runResult?.runId || status.runId || activePopupRun.runId,
        status: normalized.status,
        stats: normalized.stats,
        runResult: normalized.runResult || status.runResult || activePopupRun.runResult
    };
    await persistPopupRunState(nextState);
    return activePopupRun;
}

async function assertNoActivePopupRunForPageAction(requestId) {
    const state = await refreshActivePopupRun({ timeoutMs: 8000 });
    if (state && ["running", "paused", "stopping"].includes(state.status)) {
        const err = createProtocolError("ScrapyJS run is active; page actions are paused until the run finishes or is stopped.", "E_RUN_ACTIVE", requestId);
        err.runId = state.runId;
        err.runResult = state.runResult;
        err.stats = state.stats;
        throw err;
    }
}

// Execute script in the page via background service worker to avoid CSP issues
async function executeInPage(command) {
    const requestId = createRequestId("popup_exec");
    const rawDetail = typeof command === "string" || command instanceof String
        ? { script: String(command) }
        : (command && typeof command === "object"
            ? command
            : { script: String(command) });
    const detail = { ...rawDetail };
    if (Object.prototype.hasOwnProperty.call(detail, "args") && !Array.isArray(detail.args)) {
        detail.args = detail.args == null ? [] : [detail.args];
    }
    const identity = await getSelectedPageIdentity();
    await assertNoActivePopupRunForPageAction(requestId);
    const boundDetail = mergeTabBinding(detail, identity);

    const response = await sendRuntimeMessageWithProtocol(
        {
            type: "CHROME_PAGE_EXECUTE",
            requestId,
            meta: buildRequestMeta("popup", requestId),
            detail: boundDetail
        },
        { timeoutMs: 30000 }
    );

    const { success, value, error, errorCode, requestId: responseRequestId } = unwrapRuntimeResponse(response);
    if (!success) {
        throw createProtocolError(error || "Unknown error executing script", errorCode, responseRequestId || requestId);
    }
    return value;
}

const executeSelectorAction = (action, args = []) =>
    executeInPage({ selectorAction: action, args: Array.isArray(args) ? args : (args == null ? [] : [args]) });

const executePageAction = (action, args = []) =>
    executeInPage({ pageAction: action, args: Array.isArray(args) ? args : (args == null ? [] : [args]) });

async function runScrapyTaskInBackground(spiderConfig, options = {}) {
    const requestId = createRequestId("popup_scrapy");
    const identity = options.pageIdentity || await getSelectedPageIdentity({ refresh: true });
    if (!Number.isInteger(identity?.tabId)) {
        throw createProtocolError("Unable to resolve a valid numeric tabId for the current page", "E_TAB_REQUIRED", requestId);
    }
    const runState = {
        requestId,
        runId: options.runId || requestId,
        pageIdentity: identity,
        status: "running",
        startedAt: Date.now()
    };
    await persistPopupRunState(runState);
    const response = await sendRuntimeMessageWithProtocol(
        {
            type: "SCRAPYJS_RUN",
            requestId,
            meta: buildRequestMeta("popup", requestId),
            detail: mergeTabBinding({
                runId: runState.runId,
                spiderConfig,
                scrapySettings: options.scrapySettings,
                pipelines: options.pipelines
            }, identity)
        },
        { timeoutMs: 120000 }
    );

    const { success, value, error, errorCode, requestId: responseRequestId, stage, runResult, stats } = unwrapRuntimeResponse(response);
    if (!success) {
        // An explicit terminal reply must release the local profile lock. Sender
        // timeouts/transport loss reject earlier and keep the reconciliation state.
        if (!["E_RUN_BUSY", "E_TASK_ALREADY_RUNNING", "E_RUN_ACTIVE"].includes(errorCode)) {
            await persistPopupRunState({
                ...runState, status: runResult?.status || stats?.status || "failed",
                runResult, stats, finishedAt: Date.now()
            });
        }
        throw attachRunErrorDetails(
            createProtocolError(error || "爬虫执行失败", errorCode, responseRequestId || requestId),
            { stage, runResult, stats }
        );
    }
    const normalized = normalizeScrapyRunPayload(value);
    await persistPopupRunState({
        ...runState,
        runId: normalized.runResult?.runId || runState.runId,
        status: normalized.status,
        stats: normalized.stats,
        runResult: normalized.runResult,
        finishedAt: normalized.runResult?.finishTime || Date.now()
    });
    return value;
}


// Manual selection is the only path which derives selectors from selector-keyed data.
function processDataAndConfig(data, existingSelector = '') {
    const configObj = CrawlProfileCore.inferSelectionConfig(data || [], existingSelector);
    return {
        configObj,
        simplifiedData: CrawlProfileCore.projectRows(data, configObj, { kind: 'selection', itemConfig: configObj })
    };
}

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
    let isLocating = false;
    let startTime = null;
    let workingTimer = null;
    let lastElapsed = 0;
    let crawlStatus = 'idle';
    let pagesScraped = 0;
    let rowsCollected = 0;
    const STATUS_TEXT = {
        idle: '就绪',
        running: '爬取中',
        success: '爬取完成',
        completed: '爬取完成',
        partial: '部分完成',
        stopped: '已停止',
        stopping: '停止中',
        paused: '已暂停',
        failed: '爬取失败',
        error: '爬取失败'
    };

    // Get all DOM elements
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    const tryAnotherTableBtn = document.getElementById('tryAnotherTable');
    const locateNextButton = document.getElementById('locateNextButton');
    const locateTableButton = document.getElementById('locateTableButton');
    const cloneExtractorButton = document.getElementById('cloneExtractorButton');
    const startButton = document.getElementById('startButton');
    const configArea = document.getElementById('configArea');
    const codeArea = document.getElementById('codeArea');
    const infiniteScrollCheckbox = document.getElementById('infiniteScroll');
    const paginationModeInput = document.getElementById('paginationMode');
    const paginationLimitInput = document.getElementById('paginationLimit');
    let pagination = { mode: 'none', pageLimit: 1, nextPageSelector: '' };
    let profileTarget;
    let revision = 0;
    let undoSnapshot = null;
    let running = false;
    let pendingListRevision = null;
    let pendingNextRevision = null;
    let codeUpdateId = 0;
    const minDelayInput = document.getElementById('minDelay');
    const maxDelayInput = document.getElementById('maxDelay');
    const exportCsvBtn = document.getElementById('exportCsv');
    const exportJsonBtn = document.getElementById('exportJson');
    const copyAllBtn = document.getElementById('copyAll');

    // Initialize tab switching
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove all active states
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Set current tab as active
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab') + 'Tab';
            document.getElementById(tabId).classList.add('active');
        });
    });

    function updateStatusDisplay() {
        const statusInfo = document.querySelector('.status-info');
        if (!statusInfo) {
            return;
        }
        const elapsed = startTime ? Math.floor((Date.now() - startTime) / 1000) : lastElapsed;
        statusInfo.innerHTML = `
            <span>Status: ${STATUS_TEXT[crawlStatus] || crawlStatus}</span>
            <span>Pages scraped: ${pagesScraped}</span>
            <span>Rows collected: ${rowsCollected}</span>
            <span>Working time: ${elapsed}s</span>
        `;
    }

    function updateWorkingTime() {
        if (startTime) {
            lastElapsed = Math.floor((Date.now() - startTime) / 1000);
        }
        rowsCollected = document.querySelectorAll('.data-table tbody tr').length;
        updateStatusDisplay();
    }

    function beginCrawlTracking(initialPages = 0) {
        crawlStatus = 'running';
        pagesScraped = initialPages;
        startTime = Date.now();
        lastElapsed = 0;
        rowsCollected = document.querySelectorAll('.data-table tbody tr').length;
        updateStatusDisplay();
        if (!workingTimer) {
            workingTimer = setInterval(updateWorkingTime, 1000);
        }
    }

    function finalizeCrawlStatus(status, meta = {}) {
        if (startTime) {
            lastElapsed = Math.floor((Date.now() - startTime) / 1000);
        }
        startTime = null;
        if (typeof meta.pages === 'number') {
            pagesScraped = meta.pages;
        }
        if (typeof meta.rows === 'number') {
            rowsCollected = meta.rows;
        } else {
            rowsCollected = document.querySelectorAll('.data-table tbody tr').length;
        }
        crawlStatus = status;
        if (workingTimer) {
            clearInterval(workingTimer);
            workingTimer = null;
        }
        updateStatusDisplay();
    }

    function refreshStatusCounts({ pages, rows } = {}) {
        if (typeof pages === 'number') {
            pagesScraped = pages;
        }
        if (typeof rows === 'number') {
            rowsCollected = rows;
        } else {
            rowsCollected = document.querySelectorAll('.data-table tbody tr').length;
        }
        updateStatusDisplay();
    }

    function isActiveRunStatus(status) {
        return ["running", "paused", "stopping"].includes(status);
    }

    function applyRunSnapshotToStatus(snapshot, fallbackState = activePopupRun) {
        const payload = snapshot?.runResult || snapshot;
        const stats = snapshot?.stats || fallbackState?.stats || payload;
        const runResult = payload?.runResult || payload;
        const status = runResult?.status || snapshot?.status || fallbackState?.status;
        const counts = getRunResultCounts(runResult, stats);
        if (status) {
            const uiStatus = mapRunStatusToUi(status);
            if (isActiveRunStatus(uiStatus)) {
                crawlStatus = uiStatus;
                refreshStatusCounts({ pages: counts.pages, rows: counts.rows });
            } else {
                finalizeCrawlStatus(uiStatus, { pages: counts.pages, rows: counts.rows });
            }
        }
        return status || null;
    }

    async function reconcileStoredRunState() {
        const stored = await loadPopupRunState();
        if (!stored) {
            return null;
        }
        if (!isActiveRunStatus(stored.status)) {
            applyRunSnapshotToStatus(stored, stored);
            return stored;
        }
        const status = await queryScrapyStatus(stored, { timeoutMs: 8000 });
        if (status && hasRunStatusInfo(status)) {
            const normalized = normalizeScrapyRunPayload(status);
            const nextState = {
                ...stored,
                status: normalized.status,
                stats: normalized.stats,
                runResult: normalized.runResult || status.runResult || stored.runResult
            };
            await persistPopupRunState(nextState);
            applyRunSnapshotToStatus(nextState, nextState);
            return nextState;
        }
        crawlStatus = stored.status || "running";
        refreshStatusCounts({
            pages: stored.stats?.pageCount || stored.runResult?.pageCount,
            rows: stored.stats?.itemCount || stored.runResult?.itemCount
        });
        return stored;
    }

    updateStatusDisplay();
    reconcileStoredRunState().catch((error) => {
        console.warn("[ScrapyJsRun] unable to reconcile stored run state:", error);
    });


    if (cloneExtractorButton) {
        cloneExtractorButton.addEventListener('click', () => {
            const originalText = cloneExtractorButton.textContent;

            const resetButtonState = () => {
                cloneExtractorButton.textContent = originalText;
                cloneExtractorButton.disabled = false;
                cloneExtractorButton.style.opacity = '1';
                cloneExtractorButton.style.cursor = 'pointer';
            };

            cloneExtractorButton.textContent = '加载中...';
            cloneExtractorButton.disabled = true;
            cloneExtractorButton.style.opacity = '0.6';
            cloneExtractorButton.style.cursor = 'not-allowed';

            executePageAction('cloneExtractorStart')
                .then(() => {
                    showTemporaryMessage('克隆提取器已启动，请在页面中点击目标区域', 'success');
                    setTimeout(resetButtonState, 1500);
                })
                .catch((error) => {
                    console.error('[cloneExtractorButton] 启动失败:', error);
                    showTemporaryMessage('启动克隆工具失败: ' + (error?.message || error), 'error');
                    resetButtonState();
                });
        });
    }
    async function getProfilePageIdentity() {
        if (!profileTarget) return getSelectedPageIdentity({ refresh: true });
        const target = { ...profileTarget };
        return new Promise((resolve, reject) => {
            chrome.tabs.get(target.tabId, tab => {
                if (chrome.runtime.lastError || !tab?.url || isExtensionUrl(tab.url)) {
                    reject(createProtocolError('绑定目标页已关闭或不可访问，请重新分析', 'E_CRAWL_TARGET'));
                    return;
                }
                resolve({ tabId: target.tabId, frameId: target.frameId, url: tab.url, title: tab.title || '', windowId: tab.windowId });
            });
        });
    }

    async function getCurrentPageUrl() {
        const identity = await getProfilePageIdentity();
        return identity?.url || 'error_getting_url';
    }

    // Execute next selector
    async function executeNextSelector() {
        try {
            console.log('[executeNextSelector] Executing selector.next()...');
            const result = await executeSelectorAction('next');
            console.log('[executeNextSelector] Result:', result);
            
            if (!result) {
                console.warn('[executeNextSelector] Result is null or undefined');
                return { 
                    success: false, 
                    message: 'selector.next() returned null. Please make sure you have detected a table first.' 
                };
            }
            
            let { selector, data, itemCount } = result;
            
            if (!selector) {
                console.warn('[executeNextSelector] No selector found in result');
                return { 
                    success: false, 
                    message: 'No selector found in result' 
                };
            }
            
            return { success: true, data: result };
        } catch (error) {
            console.error('[executeNextSelector] Error:', error);
            return { 
                success: false, 
                message: error.message || 'Unknown error executing selector.next()' 
            };
        }
    }

    function getProfile() {
        return CrawlProfileCore.clone({
            itemConfig: config,
            labels: Object.fromEntries(CrawlProfileCore.fields(config).map(key => [key, TableDataHandler.getCustomHeader(key)])),
            pagination,
            revision,
            ...(profileTarget ? { target: profileTarget } : {})
        });
    }

    function snapshotProfile() {
        return {
            profile: getProfile(),
            customHeaders: Object.fromEntries(TableDataHandler.customHeaders),
            legacyInfiniteScroll: !!infiniteScrollCheckbox?.checked,
            paginationMode: paginationModeInput?.value,
            paginationLimit: paginationLimitInput?.value,
            rawData: CrawlProfileCore.clone(originalRawData),
            rawSource: CrawlProfileCore.clone(rawDataSource)
        };
    }

    function refreshPreview() {
        const rows = CrawlProfileCore.projectRows(originalRawData, config, rawDataSource);
        TableDataHandler.setTableData(rows, config);
        refreshStatusCounts({ rows: rows.length });
        return rows;
    }

    function clearCurrentRunData() {
        originalRawData = [];
        rawDataSource = { kind: 'records', itemConfig: CrawlProfileCore.clone(config || {}) };
        TableDataHandler.currentData = [];
        TableDataHandler.setTableData([], config);
        refreshStatusCounts({ rows: 0 });
    }

    function dispatchProfileChanged() {
        window.dispatchEvent(new CustomEvent('crawl-profile-changed', { detail: getProfile() }));
    }

    // All selectors, labels, pagination, persistence and compatibility state commit here.
    // DOM validation belongs to the AI controller before calling this entry point.
    function isProfileLocked() {
        return running || !!(activePopupRun && isActiveRunStatus(activePopupRun.status));
    }

    function applyValidatedConfig(profile, options = {}) {
        if (isProfileLocked()) throw createProtocolError('采集运行期间不能修改配置', 'E_CRAWL_RUNNING');
        const labels = Object.fromEntries(CrawlProfileCore.fields(profile?.itemConfig).map(key => [
            key, Object.prototype.hasOwnProperty.call(profile.labels || {}, key)
                ? profile.labels[key] : TableDataHandler.getCustomHeader(key)
        ]));
        const next = CrawlProfileCore.normalizeProfile({ ...profile, labels }, {
            allowEmpty: !!options.restore && Object.keys(profile.itemConfig).length === 0
        });
        const previous = snapshotProfile();
        if (options.rememberUndo !== false) undoSnapshot = previous;
        config = next.itemConfig;
        pagination = next.pagination;
        profileTarget = next.target;
        listSelector = config._listContainer || '';
        nextPageSelector = pagination.nextPageSelector;
        TableDataHandler.customHeaders = new Map(Object.entries(next.labels));
        revision = Math.max(revision + 1, Number.isSafeInteger(options.savedRevision) ? options.savedRevision + 1 : 0);
        if (infiniteScrollCheckbox) infiniteScrollCheckbox.checked = false;
        if (paginationModeInput) paginationModeInput.value = pagination.mode;
        if (paginationLimitInput) {
            paginationLimitInput.value = String(pagination.pageLimit);
            paginationLimitInput.disabled = pagination.mode === 'none';
        }
        if (options.restore) {
            const restored = options.restore;
            TableDataHandler.customHeaders = new Map(Object.entries(restored.customHeaders));
            if (infiniteScrollCheckbox) infiniteScrollCheckbox.checked = restored.legacyInfiniteScroll;
            if (paginationModeInput && restored.paginationMode !== undefined) paginationModeInput.value = restored.paginationMode;
            if (paginationLimitInput && restored.paginationLimit !== undefined) paginationLimitInput.value = restored.paginationLimit;
            originalRawData = restored.rawData;
            rawDataSource = restored.rawSource;
        }
        if (options.updateEditor !== false) updateCodeConfig();
        if (options.updateHeaders !== false) TableDataHandler.updateHeaderInputs(config);
        refreshPreview();
        updateCodeArea();
        if (options.persist !== false) {
            chrome.storage.local.set({
                scraperConfig: config,
                scraperProfile: getProfile(),
                customHeaders: Object.fromEntries(TableDataHandler.customHeaders)
            });
        }
        if (options.emit !== false) dispatchProfileChanged();
        return getProfile();
    }

    window.CrawlProfileUI = {
        get: getProfile,
        apply(profile, { rememberUndo = true } = {}) {
            return applyValidatedConfig(profile, { rememberUndo });
        },
        undo() {
            if (!undoSnapshot) return false;
            const restored = undoSnapshot;
            const result = applyValidatedConfig(restored.profile, { rememberUndo: false, restore: restored });
            undoSnapshot = null;
            return result;
        },
        isRunning: isProfileLocked
    };

    profileLabelChange = (field, label) => {
        try {
            const current = getProfile();
            current.labels[field] = label.trim() || field;
            applyValidatedConfig(current, { rememberUndo: false, updateHeaders: false });
        } catch (error) {
            showTemporaryMessage(error.message, 'error');
        }
    };

    function acceptManualSelection(data, selector) {
        const { configObj } = processDataAndConfig(data, selector);
        const current = getProfile();
        applyValidatedConfig({ ...current, itemConfig: configObj, target: undefined }, { rememberUndo: true });
        originalRawData = CrawlProfileCore.clone(data);
        rawDataSource = { kind: 'selection', itemConfig: CrawlProfileCore.clone(configObj) };
        return refreshPreview();
    }

    // Execution and code preview use exactly the same serialized spider config.
    function generatePureCrawlerCode(_config, url) {
        const spiderConfig = buildSpiderConfig(url);
        return `const spiderConfig = ${JSON.stringify(spiderConfig, null, 4)};
const scrapy = new Scrapy();
scrapy.spider = new ChromeSpider(spiderConfig);
const items = await scrapy.start();
return items;`;
    }

    // Generate crawler code with async IIFE wrapper
    function generateCrawlerCode(config, url) {
        const pureCode = generatePureCrawlerCode(config, url);
        return `(async () => {
    try {
        ${pureCode.split('\n').join('\n        ')}
    } catch (error) {
        console.error('❌ [Crawler] Error:', error.message);
        console.error('❌ [Crawler] Stack:', error.stack);
        throw error;
    }
})()`;
    }

    // Generate crawler script with page.eval() wrapper for execution
function generateCrawlerScript(config, url) {
        const code = generateCrawlerCode(config, url);
        // 使用 page.eval() 格式，但代码部分用单引号包装
        return `page.eval('${code.replace(/'/g, "\\'")}')`;
    }

    function buildSpiderConfig(url) {
        return CrawlProfileCore.buildSpiderConfig(getProfile(), url, {
            minDelay: minDelayInput?.value || 500,
            maxDelay: maxDelayInput?.value || 1000,
            legacyInfiniteScroll: !!infiniteScrollCheckbox?.checked
        });
    }

    function initializeConfig(options = {}) {
        try {
            applyValidatedConfig({ ...getProfile(), itemConfig: JSON.parse(configArea.value) }, { rememberUndo: false, ...options });
            return true;
        } catch (error) {
            console.error('Invalid JSON configuration:', error);
            return false;
        }
    }

    function updateCodeConfig() {
        configArea.value = JSON.stringify(config, null, 2);
        configArea.setCustomValidity?.('');
        adjustTextareaHeight(configArea);
    }

    async function updateCodeArea() {
        const updateId = ++codeUpdateId;
        const requestedRevision = revision;
        try {
            const url = await getCurrentPageUrl();
            if (updateId !== codeUpdateId || requestedRevision !== revision) return;
            codeArea.value = generatePureCrawlerCode(config, url);
            adjustTextareaHeight(codeArea);
        } catch (error) {
            if (updateId === codeUpdateId) codeArea.value = '// ' + error.message;
            console.error('Error updating code area:', error);
        }
    }

    // Get URL from page
    async function getUrl() {
        return getCurrentPageUrl();
    }

    // Extract domain from URL
    async function extractDomain() {
        try {
            const url = await getUrl();
            const domain = new URL(url).hostname;
            return domain;
        } catch (error) {
            console.error('Error extracting domain:', error);
            return 'unknown_domain';
        }
    }
    
    // 辅助函数：显示临时消息提示
    function showTemporaryMessage(message, type = 'info') {
        // 创建消息元素
        const msgElement = document.createElement('div');
        msgElement.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'error' ? '#f44336' : type === 'success' ? '#4CAF50' : '#2196F3'};
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 10000;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            max-width: 400px;
            text-align: center;
        `;
        msgElement.textContent = message;
        document.body.appendChild(msgElement);
        
        // 3秒后移除
        setTimeout(() => {
            if (msgElement.parentNode) {
                msgElement.parentNode.removeChild(msgElement);
            }
        }, 3000);
    }

    // Initialize bridge for component communication
    async function initBridge() {
        // Handle next page button selection
        if (typeof TB !== 'undefined' && TB.bridge) {
            TB.bridge.on('ScrapyJs.selected_nextPageBtn', async (res) => {
                try {
                    if (pendingNextRevision !== null && pendingNextRevision !== revision) return { stale: true };
                    const current = getProfile();
                    const limit = Number(paginationLimitInput?.value || 2);
                    applyValidatedConfig({ ...current, pagination: { mode: 'next', pageLimit: Math.max(2, limit), nextPageSelector: res?.data } });
                    showTemporaryMessage('下一页按钮已选中: ' + nextPageSelector, 'success');
                    return { time: Date.now() };
                } catch (error) {
                    showTemporaryMessage('下一页配置未应用: ' + error.message, 'error');
                    return { error: error.message };
                } finally {
                    pendingNextRevision = null;
                    if (locateNextButton) {
                        locateNextButton.textContent = '定位 下一页';
                        locateNextButton.disabled = false;
                        locateNextButton.style.opacity = '1';
                        locateNextButton.style.cursor = 'pointer';
                    }
                }
            });

            TB.bridge.on('ScrapyJs.selected_tableData', async (res) => {
                console.log('ScrapyJs.update table:', res);
                
                try {
                    refreshStatusCounts();

                    // Extract data from the response
                    const { selector, data, itemCount } = res?.data || {};
                    
                    if (pendingListRevision !== null && pendingListRevision !== revision) {
                        pendingListRevision = null;
                        return { stale: true };
                    }
                    pendingListRevision = null;
                    if (data && data.length > 0) {
                        const simplifiedData = acceptManualSelection(data, selector);

                        // Update status bar with new data snapshot
                        refreshStatusCounts({ pages: 1, rows: simplifiedData.length });
                        
                        // 恢复"定位 表格"按钮状态
                        if (locateTableButton) {
                            locateTableButton.textContent = '定位 表格';
                            locateTableButton.disabled = false;
                            locateTableButton.style.opacity = '1';
                            locateTableButton.style.cursor = 'pointer';
                        }
                        
                        // Show success message
                        showTemporaryMessage(`表格数据提取成功！共 ${data.length} 行`, 'success');
                        
                    } else {
                        console.error('No data received from table selection');
                        
                        // 恢复"定位 表格"按钮状态
                        if (locateTableButton) {
                            locateTableButton.textContent = '定位 表格';
                            locateTableButton.disabled = false;
                            locateTableButton.style.opacity = '1';
                            locateTableButton.style.cursor = 'pointer';
                        }
                        
                    showTemporaryMessage('未在选中的表格中找到数据', 'error');
                }
            } catch (error) {
                    console.error('Error processing table data:', error);
                    
                    // 恢复"定位 表格"按钮状态
                    if (locateTableButton) {
                        locateTableButton.textContent = '定位 表格';
                        locateTableButton.disabled = false;
                        locateTableButton.style.opacity = '1';
                        locateTableButton.style.cursor = 'pointer';
                    }
                    
                    showTemporaryMessage('处理表格数据时出错: ' + error.message, 'error');
                }
                
                return { time: Date.now() };
            });
        } else {
            console.warn('TB bridge not available');
        }
    }


    // Event Listeners
    // Locate Next button - 改进版本
    if (locateNextButton) {
        locateNextButton.addEventListener('click', async () => {
            pendingNextRevision = revision;
            // 保存原始文本
            const originalText = locateNextButton.textContent;
            
            try {
                // 更新按钮状态
                locateNextButton.textContent = '请在页面上选择...';
                locateNextButton.disabled = true;
                locateNextButton.style.opacity = '0.6';
                locateNextButton.style.cursor = 'not-allowed';
                
                // 通过结构化 selectorAction 触发页面中的选择流程
                selectedPageIdentity = await getProfilePageIdentity();
                const result = await executeSelectorAction('startNextButtonSelection');
                
                console.log('[locateNextButton] Selection started:', result);
                
                // 等待一段时间让用户看到提示
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 提示用户操作
                showTemporaryMessage('请在页面上点击"下一页"按钮');
                
                // 在这里我们不能直接等待选择完成
                // 因为选择是通过页面交互完成的
                // 选择完成后会通过 bridge 发送消息回来
                
            } catch (error) {
                console.error('[locateNextButton] Error:', error);
                showTemporaryMessage('启动选择失败: ' + error.message, 'error');
            } finally {
                // 一段时间后恢复按钮（让用户有足够时间选择）
                setTimeout(() => {
                    locateNextButton.textContent = originalText;
                    locateNextButton.disabled = false;
                    locateNextButton.style.opacity = '1';
                    locateNextButton.style.cursor = 'pointer';
                }, 5000); // 5秒后自动恢复
            }
        });
    }

    // locateTableButton 监听 定位表格逻辑 - 改进版本
    if (locateTableButton) {
        locateTableButton.addEventListener('click', async () => {
            pendingListRevision = revision;
            // 保存原始文本
            const originalText = locateTableButton.textContent;
            
            try {
                // 更新按钮状态
                locateTableButton.textContent = '请在页面上选择...';
                locateTableButton.disabled = true;
                locateTableButton.style.opacity = '0.6';
                locateTableButton.style.cursor = 'not-allowed';
                
                // 通过结构化 selectorAction 触发页面中的选择流程
                await getSelectedPageIdentity({ refresh: true });
                const result = await executeSelectorAction('startTableSelection');
                
                console.log('[locateTableButton] Selection started:', result);
                
                // 等待一段时间让用户看到提示
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 提示用户操作
                showTemporaryMessage('请在页面上点击表格区域进行选择');
                
                // 选择完成后会通过 bridge 发送消息回来
                // 我们需要监听这个消息并更新数据
                
            } catch (error) {
                console.error('[locateTableButton] Error:', error);
                showTemporaryMessage('启动选择失败: ' + error.message, 'error');
            } finally {
                // 一段时间后恢复按钮（让用户有足够时间选择）
                setTimeout(() => {
                    locateTableButton.textContent = originalText;
                    locateTableButton.disabled = false;
                    locateTableButton.style.opacity = '1';
                    locateTableButton.style.cursor = 'pointer';
                }, 5000); // 5秒后自动恢复
            }
        });
    }
    
    // Modified tryAnotherTable function
    async function tryAnotherTable() {
        try {
            if (!initializeConfig()) return;
            const requestedRevision = revision;
            const result = await executeNextSelector();
            if (requestedRevision !== revision || isProfileLocked()) return;
            console.log('Selector.next() result:', result);
            
            if (result && !result.success) {
                console.error('Error executing selector.next():', result.message);
                return;
            }                
            
            const { selector, data } = result.data;
            if (data && data.length > 0) {
                const rows = acceptManualSelection(data, selector);
                refreshStatusCounts({ pages: 1, rows: rows.length });
            }
        } catch (error) {
            console.error('Error during scraping:', error);
        }
    }
        

    // Then in your event listener section, update it to:
    if (tryAnotherTableBtn) {
        tryAnotherTableBtn.addEventListener('click', tryAnotherTable);
    }

    configArea.addEventListener('input', () => {
        adjustTextareaHeight(configArea);
        try {
            applyValidatedConfig({ ...getProfile(), itemConfig: JSON.parse(configArea.value) }, {
                rememberUndo: false, updateEditor: false
            });
            configArea.setCustomValidity?.('');
        } catch (error) {
            configArea.setCustomValidity?.(error.message);
            console.error('Invalid configuration:', error);
        }
    });

    // Start button - 改进版本
    if (startButton) {
        startButton.addEventListener('click', async () => {
            if (running) return;
            running = true;
            // 保存原始文本
            const originalText = startButton.textContent;
            
            try {
                // 更新按钮状态为加载中
                startButton.textContent = '爬取中...';
                startButton.disabled = true;
                startButton.style.opacity = '0.6';
                startButton.style.cursor = 'not-allowed';
                
                // 显示开始提示
                showTemporaryMessage('开始爬取数据...', 'info');
                
                if (configArea.validationMessage) throw new Error(configArea.validationMessage);
                // 获取当前 URL 并构建后台爬虫配置
                const pageIdentity = await getProfilePageIdentity();
                if (!pageIdentity?.url || typeof pageIdentity.tabId !== "number") {
                    throw new Error('无法获取当前页面身份，请切换到普通网页后重试');
                }
                if (activePopupRun && isActiveRunStatus(activePopupRun.status)) {
                    const statusSnapshot = await queryScrapyStatus(activePopupRun, { timeoutMs: 8000 });
                    if (statusSnapshot && hasRunStatusInfo(statusSnapshot)) {
                        const normalizedStatus = normalizeScrapyRunPayload(statusSnapshot);
                        const nextState = {
                            ...activePopupRun,
                            status: normalizedStatus.status,
                            stats: normalizedStatus.stats,
                            runResult: normalizedStatus.runResult || statusSnapshot.runResult || activePopupRun.runResult
                        };
                        await persistPopupRunState(nextState);
                        applyRunSnapshotToStatus(nextState, nextState);
                        if (isActiveRunStatus(nextState.status)) {
                            showTemporaryMessage('后台爬虫仍在运行，已恢复当前运行状态。', 'info');
                            return;
                        }
                    } else {
                        showTemporaryMessage('后台爬虫状态未知，未启动重复任务。请稍后查看状态。', 'info');
                        return;
                    }
                }
                const spiderConfig = buildSpiderConfig(pageIdentity.url);

                if (!spiderConfig?.itemConfig) {
                    throw new Error('爬虫配置缺失，请先配置并检测表格');
                }

                console.log('Submitting crawler task to background...', { spiderConfig, pageIdentity });
                clearCurrentRunData();
                beginCrawlTracking();

                // 在后台执行爬虫任务
                const result = await runScrapyTaskInBackground(spiderConfig, {
                    pipelines: [], // 默认 pipeline 在后台已内置，保留扩展点
                    pageIdentity
                });
                
                console.log('Crawler execution result:', result);
                
                // 检查结果
                if (!result) {
                    throw new Error('爬虫执行没有返回数据');
                }
                
                const normalizedRun = normalizeScrapyRunPayload(result);
                let crawledData = normalizedRun.data;
                
                // 如果返回的是包装对象
                if (result.success === false) {
                    throw new Error(result.error || result.message || '爬虫执行失败');
                }
                
                // 验证爬取到的数据
                const runCounts = getRunResultCounts(normalizedRun.runResult, normalizedRun.stats);
                const pagesFromStats = runCounts.pages ?? spiderConfig?.start_urls?.length ?? 1;
                const rowsFromStats = typeof runCounts.rows === 'number' ? runCounts.rows : null;
                const uiStatus = mapRunStatusToUi(normalizedRun.status);
                const ackText = getDeliveryAckText(normalizedRun.delivery);

                if (!crawledData || (Array.isArray(crawledData) && crawledData.length === 0)) {
                    clearCurrentRunData();
                    finalizeCrawlStatus(uiStatus === 'success' ? 'partial' : uiStatus, { pages: pagesFromStats, rows: rowsFromStats ?? 0 });
                    showTemporaryMessage(`爬取结束但未获取到数据，状态: ${STATUS_TEXT[uiStatus] || uiStatus}${ackText}`, uiStatus === 'failed' ? 'error' : 'info');
                    console.warn('No data crawled');
                    return;
                }
                
                console.log('Processing crawled data:', crawledData);
                
                // 如果数据是数组，处理并更新显示
                if (Array.isArray(crawledData)) {
                    originalRawData = CrawlProfileCore.clone(crawledData);
                    rawDataSource = { kind: 'records', itemConfig: CrawlProfileCore.clone(spiderConfig.itemConfig) };
                    const simplifiedData = refreshPreview();

                    // 更新状态栏
                    finalizeCrawlStatus(uiStatus, {
                        pages: pagesFromStats,
                        rows: rowsFromStats ?? (Array.isArray(simplifiedData) ? simplifiedData.length : crawledData.length)
                    });
                    
                    // 显示成功消息
                    const messageType = uiStatus === 'failed' ? 'error' : (uiStatus === 'success' ? 'success' : 'info');
                    showTemporaryMessage(`爬取状态: ${STATUS_TEXT[uiStatus] || uiStatus}，共获取 ${crawledData.length} 条数据${ackText}`, messageType);
                    
                } else {
                    // 如果不是数组，直接显示
                    originalRawData = CrawlProfileCore.clone([crawledData]);
                    rawDataSource = { kind: 'records', itemConfig: CrawlProfileCore.clone(spiderConfig.itemConfig) };
                    refreshPreview();
                    finalizeCrawlStatus(uiStatus, { pages: pagesFromStats, rows: rowsFromStats ?? 1 });
                    showTemporaryMessage(`爬取状态: ${STATUS_TEXT[uiStatus] || uiStatus}${ackText}`, uiStatus === 'failed' ? 'error' : 'success');
                }
                
            } catch (error) {
                console.error('Error during crawling:', error);
                if (error?.errorCode === "E_TIMEOUT") {
                    const statusSnapshot = await queryScrapyStatus(activePopupRun, { timeoutMs: 8000 }).catch(() => null);
                    if (statusSnapshot && hasRunStatusInfo(statusSnapshot)) {
                        const normalizedStatus = normalizeScrapyRunPayload(statusSnapshot);
                        await persistPopupRunState({
                            ...activePopupRun,
                            status: normalizedStatus.status,
                            stats: normalizedStatus.stats,
                            runResult: normalizedStatus.runResult || statusSnapshot.runResult || activePopupRun?.runResult
                        });
                        applyRunSnapshotToStatus(activePopupRun, activePopupRun);
                    } else if (activePopupRun) {
                        crawlStatus = activePopupRun.status || "running";
                        refreshStatusCounts({
                            pages: activePopupRun.stats?.pageCount || activePopupRun.runResult?.pageCount,
                            rows: activePopupRun.stats?.itemCount || activePopupRun.runResult?.itemCount
                        });
                    }
                } else {
                    const failedRunResult = error?.runResult || error?.stats;
                    clearCurrentRunData();
                    finalizeCrawlStatus(mapRunStatusToUi(failedRunResult?.status || 'failed'), getRunResultCounts(failedRunResult, error?.stats));
                }
                
                // 显示错误消息
                const errorMsg = error.message || '爬取过程中发生错误';
                showTemporaryMessage((error?.errorCode === "E_TIMEOUT" ? '' : '爬取失败: ') + errorMsg, 'error');
                
                // 如果是特定错误，提供更多帮助信息
                if (errorMsg.includes('Scrapy') || errorMsg.includes('ChromeSpider')) {
                    console.error('提示: 请确保页面已加载必要的爬虫脚本（Scrapy.js, ChromeSpider.js 等）');
                } else if (errorMsg.includes('undefined') || errorMsg.includes('not a function')) {
                    console.error('提示: 可能是爬虫配置有误，请检查配置是否正确');
                }
                
            } finally {
                running = false;
                // 恢复按钮状态
                startButton.textContent = originalText;
                startButton.disabled = false;
                startButton.style.opacity = '1';
                startButton.style.cursor = 'pointer';
            }
        });
    }

    // Export CSV button
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', async () => {
            const formattedData = TableDataHandler.getFormattedData();
            console.log('export formatted data:', formattedData);
            const csv = TableDataHandler.toCSV(formattedData);
            const filename = await extractDomain() + '.csv';
            downloadFile(csv, filename, 'text/csv;charset=utf-8;');
        });
    }

    // Export JSON button
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', async () => {
            const formattedData = TableDataHandler.getFormattedData();
            const json = TableDataHandler.toJSON(formattedData);
            const filename = await extractDomain() + '.json';
            downloadFile(json, filename, 'application/json');
        });
    }

    // Copy All button
    if (copyAllBtn) {
        copyAllBtn.addEventListener('click', () => {
            const formattedData = TableDataHandler.getFormattedData();
            const csv = TableDataHandler.toCSV(formattedData);
            copyToClipboard(csv);
        });
    }

    // Legacy unlimited scrolling is unsupported; never compile a zero page limit.
    if (infiniteScrollCheckbox) {
        infiniteScrollCheckbox.addEventListener('change', () => {
            if (infiniteScrollCheckbox.checked) showTemporaryMessage('尚未支持无限滚动，请设置有限下一页模式', 'error');
            infiniteScrollCheckbox.checked = false;
            if (!isProfileLocked()) applyValidatedConfig(getProfile(), { rememberUndo: false });
        });
    }

    function paginationChanged() {
        try {
            applyValidatedConfig({ ...getProfile(), pagination: {
                mode: paginationModeInput?.value || 'none',
                pageLimit: Number(paginationLimitInput?.value || 1),
                nextPageSelector
            } }, { rememberUndo: false });
        } catch (error) {
            if (paginationModeInput) paginationModeInput.value = pagination.mode;
            if (paginationLimitInput) paginationLimitInput.value = String(pagination.pageLimit);
            showTemporaryMessage(error.message, 'error');
        }
    }
    paginationModeInput?.addEventListener('change', paginationChanged);
    paginationLimitInput?.addEventListener('change', paginationChanged);

    if (minDelayInput) {
        minDelayInput.addEventListener('change', () => {
            updateCodeArea();
        });
    }

    if (maxDelayInput) {
        maxDelayInput.addEventListener('change', () => {
            updateCodeArea();
        });
    }

    // Initialize everything
    adjustTextareaHeight(configArea);
    adjustTextareaHeight(codeArea);
    initBridge();
    initializeConfig({ persist: false, emit: false });
    const loadedRevision = revision;
    chrome.storage.local.get(['scraperConfig', 'scraperProfile', 'customHeaders', 'language'], function(result) {
        // A delayed storage callback cannot overwrite a user edit or AI application.
        if (revision !== loadedRevision || isProfileLocked()) return;
        if (result.language && TableDataHandler.languageMappings[result.language]) TableDataHandler.currentLanguage = result.language;
        const saved = result.scraperProfile || {
            itemConfig: result.scraperConfig || config,
            labels: result.customHeaders || {},
            pagination: { mode: 'none', pageLimit: 1, nextPageSelector: '' }
        };
        try {
            applyValidatedConfig(saved, { rememberUndo: false, persist: false, savedRevision: saved.revision });
        } catch (error) {
            showTemporaryMessage('已保存配置不可用: ' + error.message, 'error');
        }
    });

    window.scrapyJsPopupControls = {
        status: async (runId) => {
            const response = await sendScrapyLifecycleRequest("STATUS", activePopupRun, { runId });
            if (response && hasRunStatusInfo(response)) {
                const normalized = normalizeScrapyRunPayload(response);
                await persistPopupRunState({
                    ...activePopupRun,
                    runId: normalized.runResult?.runId || response.runId || runId || activePopupRun?.runId,
                    status: normalized.status,
                    stats: normalized.stats,
                    runResult: normalized.runResult || response.runResult || activePopupRun?.runResult
                });
                applyRunSnapshotToStatus(activePopupRun, activePopupRun);
            }
            return { ack: true, action: "STATUS", runId: response?.runId || runId || activePopupRun?.runId };
        },
        pause: async (runId) => {
            const response = await sendScrapyLifecycleRequest("PAUSE", activePopupRun, { runId });
            const ack = response?.ack || response || {};
            const statusSnapshot = response?.status;
            const normalized = statusSnapshot ? normalizeScrapyRunPayload(statusSnapshot) : null;
            await persistPopupRunState({
                ...activePopupRun,
                runId: normalized?.runResult?.runId || statusSnapshot?.runId || ack.runId || runId || activePopupRun?.runId,
                status: normalized?.status || ack.state || "paused",
                stats: normalized?.stats || activePopupRun?.stats,
                runResult: normalized?.runResult || activePopupRun?.runResult
            });
            applyRunSnapshotToStatus(activePopupRun, activePopupRun);
            return { ack: true, action: "PAUSE", runId: ack?.runId || runId || activePopupRun?.runId, state: ack?.state || "paused" };
        },
        resume: async (runId) => {
            const response = await sendScrapyLifecycleRequest("RESUME", activePopupRun, { runId });
            const ack = response?.ack || response || {};
            const statusSnapshot = response?.status;
            const normalized = statusSnapshot ? normalizeScrapyRunPayload(statusSnapshot) : null;
            await persistPopupRunState({
                ...activePopupRun,
                runId: normalized?.runResult?.runId || statusSnapshot?.runId || ack.runId || runId || activePopupRun?.runId,
                status: normalized?.status || ack.state || "running",
                stats: normalized?.stats || activePopupRun?.stats,
                runResult: normalized?.runResult || activePopupRun?.runResult
            });
            applyRunSnapshotToStatus(activePopupRun, activePopupRun);
            return { ack: true, action: "RESUME", runId: ack?.runId || runId || activePopupRun?.runId, state: ack?.state || "running" };
        },
        stop: async (runId) => {
            const response = await sendScrapyLifecycleRequest("STOP", activePopupRun, { runId });
            const ack = response?.ack || response || {};
            const statusSnapshot = response?.status;
            const normalized = statusSnapshot ? normalizeScrapyRunPayload(statusSnapshot) : null;
            await persistPopupRunState({
                ...activePopupRun,
                runId: normalized?.runResult?.runId || statusSnapshot?.runId || ack.runId || runId || activePopupRun?.runId,
                status: normalized?.status || ack.state || "stopping",
                stats: normalized?.stats || activePopupRun?.stats,
                runResult: normalized?.runResult || activePopupRun?.runResult
            });
            applyRunSnapshotToStatus(activePopupRun, activePopupRun);
            return { ack: true, action: "STOP", runId: ack?.runId || runId || activePopupRun?.runId, state: ack?.state || "stopping" };
        }
    };
    
    // ============================================================
    // 导出测试工具函数到全局，方便在 DevTools 中使用
    // ============================================================
    
    /**
     * 测试 selector.next() 调用
     * 用法: 在 popup_crawl.html 的 DevTools 控制台中运行:
     *   await testSelectorNext()
     */
    window.testSelectorNext = async function() {
        console.log('='.repeat(60));
        console.log('🧪 Testing selector.next() from popup');
        console.log('='.repeat(60));
        
        try {
            // 先检查环境
            console.log('\n[Pre-check] Verifying environment...');
            
            // 测试1: 通过 page.eval 调用 selector.next()
            console.log('\n[Test 1] Call via selector action: next');
            const result1 = await executeSelectorAction('next').catch(err => {
                console.error('[Test 1] Failed:', err.message);
                if (err.message.includes('当前环境不支持')) {
                    console.log('\n💡 提示：');
                    console.log('   这个错误通常是因为目标页面的上下文未正确初始化。');
                    console.log('   请按以下步骤操作：');
                    console.log('   1. 确保你在一个普通网页上（不是 chrome:// 开头的页面）');
                    console.log('   2. 点击 popup 中的 "定位 表格" 按钮');
                    console.log('   3. 等待表格检测完成');
                    console.log('   4. 然后再运行此测试');
                }
                return null;
            });
            console.log('✅ Result:', result1);
            
            if (result1) {
                console.log('   - selector:', result1.selector);
                console.log('   - tableId:', result1.tableId);
                console.log('   - itemCount:', result1.itemCount);
                console.log('   - data length:', result1.data?.length);
            } else {
                console.warn('⚠️  Result is null - make sure you have detected a table first');
            }
            
            // 测试2: 通过 executeNextSelector 函数
            console.log('\n[Test 2] Using executeNextSelector()');
            const result2 = await executeNextSelector();
            console.log('✅ Result:', result2);
            
            if (result2.success) {
                console.log('   ✅ Success!');
                console.log('   - selector:', result2.data?.selector);
                console.log('   - itemCount:', result2.data?.itemCount);
            } else {
                console.log('   ❌ Failed:', result2.message);
            }
            
            console.log('\n' + '='.repeat(60));
            return result1;
            
        } catch (error) {
            console.error('❌ Test failed:', error);
            console.log('\n' + '='.repeat(60));
            throw error;
        }
    };

    /**
     * 测试页面是否有 selector 对象
     * 用法: await testSelectorExists()
     */
    window.testSelectorExists = async function() {
        console.log('🔍 Checking if selector exists on page...');
        
        try {
            const state = await executeSelectorAction('state').catch(err => {
                console.error('❌ Error:', err.message);
                if (err.message.includes('当前环境不支持')) {
                    console.log('\n💡 解决方法：');
                    console.log('   1. 确保你在一个普通网页上（不是扩展页面或 chrome:// 页面）');
                    console.log('   2. 刷新目标网页');
                    console.log('   3. 重新打开 popup');
                    console.log('   4. 点击 "定位 表格" 按钮初始化');
                    console.log('\n   或者，你可以直接点击 popup 中的 "下一个表格" 按钮来测试功能');
                }
                return null;
            });
            
            const exists = !!state?.hasSelector;
            
            if (exists) {
                console.log('✅ selector object exists on page');
                console.log('   Selector info:', state);
            } else {
                console.warn('⚠️  selector object not found on page');
                console.log('   💡 Tip: Click "定位 表格" button first to initialize selector');
            }
            
            return exists;
        } catch (error) {
            console.error('❌ Error checking selector:', error);
            return false;
        }
    };

    /**
     * 完整测试流程
     * 用法: await runFullTest()
     */
    window.runFullTest = async function() {
        console.log('\n' + '='.repeat(80));
        console.log('🚀 Running Full Test Suite');
        console.log('='.repeat(80));
        
        // Step 1: Check if selector exists
        console.log('\n📋 Step 1: Check selector existence');
        const exists = await testSelectorExists();
        
        if (!exists) {
            console.log('\n❌ Test stopped: selector not found');
            console.log('💡 Please:');
            console.log('   1. Navigate to a page with list content');
            console.log('   2. Click "定位 表格" button');
            console.log('   3. Run this test again');
            return;
        }
        
        // Step 2: Test selector.next()
        console.log('\n📋 Step 2: Test selector.next()');
        await testSelectorNext();
        
        console.log('\n' + '='.repeat(80));
        console.log('✅ Full test completed!');
        console.log('='.repeat(80));
    };

    /**
     * 快速测试 - 直接调用并显示结果
     * 用法: await quickTest()
     */
    window.quickTest = async function() {
        console.log('⚡ Quick Test: selector.next()');
        try {
            const result = await executeSelectorAction('next');
            console.table(result ? {
                selector: result.selector,
                tableId: result.tableId,
                itemCount: result.itemCount,
                dataLength: result.data?.length
            } : { error: 'Result is null' });
            return result;
        } catch (error) {
            console.error('❌ Error:', error.message);
            
            if (error.message.includes('当前环境不支持')) {
                console.log('\n%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #ff6b6b; font-weight: bold');
                console.log('%c⚠️  环境错误：无法在当前上下文中执行', 'color: #ff6b6b; font-weight: bold; font-size: 14px');
                console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #ff6b6b; font-weight: bold');
                console.log('\n%c💡 推荐的测试方法：', 'color: #4ecdc4; font-weight: bold; font-size: 13px');
                console.log('\n%c方法 1: 使用 UI 按钮测试（最简单）', 'color: #95e1d3; font-weight: bold');
                console.log('   1️⃣ 确保在普通网页上（如搜索结果页）');
                console.log('   2️⃣ 点击 popup 中的 "定位 表格" 按钮');
                console.log('   3️⃣ 点击 "下一个表格" 按钮');
                console.log('   4️⃣ 查看表格数据是否更新\n');
                
                console.log('%c方法 2: 在目标页面的控制台测试', 'color: #95e1d3; font-weight: bold');
                console.log('   1️⃣ 在目标网页上按 F12 打开 DevTools');
                console.log('   2️⃣ 在网页的控制台（不是 popup 的）中运行：');
                console.log('      %cselector.next()%c', 'background: #2d2d2d; color: #4ecdc4; padding: 2px 6px; border-radius: 3px; font-family: monospace', '');
                console.log('   3️⃣ 查看返回结果\n');
                
                console.log('%c为什么会这样？', 'color: #ffd93d; font-weight: bold');
                console.log('   • popup DevTools 运行在 popup 的上下文中');
                console.log('   • selector.next() 需要在目标网页的上下文中运行');
                console.log('   • 这两个是不同的执行环境');
                console.log('\n%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #ff6b6b; font-weight: bold');
            }
            
            throw error;
        }
    };
    
    /**
     * 诊断 page 对象状态（在 background 中）
     * 用法: await diagnosePageObject()
     */
    window.diagnosePageObject = async function() {
        console.log('\n' + '='.repeat(80));
        console.log('🔍 Diagnosing Page Object in Background');
        console.log('='.repeat(80));
        
        try {
            // 发送诊断请求到 background
            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                    {
                        type: 'DIAGNOSE_PAGE_OBJECT'
                    },
                    resolve
                );
            });
            
            console.log('Diagnostic result:', response);
            
            // 解包响应数据
            const data = response.data || response;
            
            if (data.error) {
                console.error('❌ Error:', data.error);
            } else {
                console.log('✅ Page object info:');
                console.log('   - Exists:', data.exists);
                console.log('   - Type:', data.type);
                console.log('   - Has eval:', data.hasEval);
                console.log('   - Environment:', data.environment);
                console.log('   - Has chrome.scripting:', data.hasScripting);
                console.log('   - chrome.scripting available:', data.chromeScriptingAvailable);
                console.log('   - executeScript available:', data.executeScriptAvailable);
                
                if (!data.hasScripting) {
                    console.warn('⚠️  chrome.scripting.executeScript not available!');
                    console.log('   This explains the CSP error - using old V2 method');
                } else {
                    console.log('   ✅ chrome.scripting.executeScript IS available!');
                    console.log('   ✅ ChromePage should use V3 method');
                    console.log('\n   🤔 But you still got CSP error? Let me check ChromePage.eval()...');
                }
            }
            
            return response;
            
        } catch (error) {
            console.error('❌ Diagnostic failed:', error);
            return { error: error.message };
        }
    };

    /**
     * 测试 ChromePage.eval 的执行路径
     * 用法: await testChromePageEvalPath()
     */
    window.testChromePageEvalPath = async function() {
        console.log('\n' + '='.repeat(80));
        console.log('🔍 Testing ChromePage.eval() Execution Path');
        console.log('='.repeat(80));
        
        try {
            // 测试简单的表达式
            console.log('\n[Test 1] Simple expression: 1+1');
            const test1 = await executePageAction('sampleMath');
            console.log('✅ Result:', test1);
            
            // 测试 document.title
            console.log('\n[Test 2] Document title');
            const test2 = await executePageAction('getTitle');
            console.log('✅ Result:', test2);
            
            // 测试 selector.next() - 这个会触发 CSP 错误
            console.log('\n[Test 3] selector.next() - 可能触发 CSP 错误');
            console.log('💡 Watch the browser console for CSP errors...');
            
            try {
                const test3 = await executeSelectorAction('next');
                console.log('✅ Result:', test3);
                console.log('   ✅ No CSP error! selector.next() works!');
            } catch (error) {
                console.error('❌ Error:', error.message);
                console.log('\n🔍 If you see CSP error in target page console:');
                console.log('   - ChromePage.eval() is using addScriptTag (V2 method)');
                console.log('   - Even though chrome.scripting.executeScript is available');
                console.log('   - This might be a bug in ChromePage or wrong instance');
            }
            
            return { success: true };
            
        } catch (error) {
            console.error('❌ Test failed:', error);
            return { error: error.message };
        }
    };

    /**
     * 诊断 selector 状态
     * 用法: await diagnoseSelectorState()
     */
    window.diagnoseSelectorState = async function() {
        console.log('\n' + '='.repeat(80));
        console.log('🔍 Diagnosing Selector State');
        console.log('='.repeat(80));
        
        try {
            // 检查 selector 是否存在
            console.log('\n[Step 1] Checking if selector exists...');
            const state = await executeSelectorAction('state');

            if (!state || !state.hasSelector) {
                console.error('❌ selector object does not exist!');
                console.log('\n💡 Solution:');
                console.log('   1. Make sure you are on a normal webpage (not chrome:// or extension pages)');
                console.log('   2. Click "定位 表格" button in the popup');
                console.log('   3. Wait for the table detection to complete');
                return { error: 'selector not found' };
            }

            console.log('✅ selector exists');
            console.log('Selector state:', state);
            
            // 分析状态
            console.log('\n[Step 3] Analyzing state...');
            
            if (!state.hasLists) {
                console.error('❌ selector.lists is not an array!');
                return { error: 'invalid selector structure', state };
            }
            
            if (state.listsLength === 0) {
                console.warn('⚠️  selector.lists is empty (no tables detected)');
                console.log('\n💡 Solution:');
                console.log('   Option 1: Click "定位 表格" button in popup');
                console.log('   Option 2: Run in target page console:');
                console.log('      selector.startTableSelection()');
                return { error: 'no tables detected', state };
            }
            
            console.log(`✅ Found ${state.listsLength} table(s)`);
            console.log(`✅ Current index: ${state.currentIndex}`);
            
            // 测试 selector.next()
            console.log('\n[Step 4] Testing selector.next()...');
            const nextResult = await executeSelectorAction('next');
            
            if (nextResult) {
                console.log('✅ selector.next() works!');
                console.log('   Result:', {
                    selector: nextResult.selector,
                    tableId: nextResult.tableId,
                    itemCount: nextResult.itemCount,
                    dataLength: nextResult.data?.length
                });
                return { success: true, state, nextResult };
            } else {
                console.warn('⚠️  selector.next() returned null');
                console.log('   This might mean:');
                console.log('   - Already at the last table');
                console.log('   - Current index:', state.currentIndex);
                console.log('   - Total tables:', state.listsLength);
                return { warning: 'selector.next() returned null', state };
            }
            
        } catch (error) {
            console.error('❌ Diagnostic failed:', error);
            return { error: error.message };
        }
    };

    /**
     * 测试 background 通信和数据返回
     * 用法: await testBackgroundCommunication()
     */
    window.testBackgroundCommunication = async function() {
        console.log('\n' + '='.repeat(80));
        console.log('🧪 Testing Background Communication');
        console.log('='.repeat(80));
        
        try {
            // 测试 1: 简单的字符串返回
            console.log('\n[Test 1] Testing simple string return...');
            const test1 = await executePageAction('sampleString');
            console.log('✅ Test 1 Result:', test1);
            console.assert(test1 === "Hello from target page!", '❌ String test failed');
            
            // 测试 2: 数字返回
            console.log('\n[Test 2] Testing number return...');
            const test2 = await executePageAction('sampleNumber');
            console.log('✅ Test 2 Result:', test2);
            console.assert(test2 === 42, '❌ Number test failed');
            
            // 测试 3: 数组返回
            console.log('\n[Test 3] Testing array return...');
            const test3 = await executePageAction('sampleArray');
            console.log('✅ Test 3 Result:', test3);
            console.assert(Array.isArray(test3) && test3.length === 3, '❌ Array test failed');
            
            // 测试 4: 页面 URL
            console.log('\n[Test 4] Testing page.url()...');
            const test4 = await executePageAction('getUrl');
            console.log('✅ Test 4 Result:', test4);
            console.assert(typeof test4 === 'string' && test4.startsWith('http'), '❌ URL test failed');
            
            // 测试 5: selector 对象存在性
            console.log('\n[Test 5] Testing selector existence...');
            const test5 = await executeSelectorAction('exists');
            console.log('✅ Test 5 Result:', test5);
            
            if (test5) {
                console.log('   ✅ selector object exists on page');
                
                // 测试 5.1: 检查 selector 的状态
                console.log('\n[Test 5.1] Checking selector state...');
                const state = await executeSelectorAction('state');
                console.log('   Selector state:', state);
                
                if (!state.hasLists || state.listsLength === 0) {
                    console.warn('   ⚠️  selector.lists is empty - need to initialize first!');
                    console.log('   💡 Please click "定位 表格" button in popup to initialize selector');
                    console.log('   💡 Or run in target page console: selector.startTableSelection()');
                } else {
                    console.log('   ✅ selector has', state.listsLength, 'tables detected');
                    console.log('   ✅ current index:', state.currentIndex);
                }
                
                // 测试 6: selector.next() 调用
                console.log('\n[Test 6] Testing selector.next()...');
                const test6 = await executeSelectorAction('next');
                console.log('✅ Test 6 Result:', test6);
                
                if (test6) {
                    console.log('   ✅ selector.next() returned data');
                    console.log('   - selector:', test6.selector);
                    console.log('   - tableId:', test6.tableId);
                    console.log('   - itemCount:', test6.itemCount);
                    console.log('   - data length:', test6.data?.length);
                } else {
                    console.warn('   ⚠️  selector.next() returned null/undefined');
                    console.log('   💡 This usually means:');
                    console.log('      1. No tables detected yet - click "定位 表格" first');
                    console.log('      2. Already at the last table - no more tables available');
                    console.log('      3. Page structure doesn\'t have detectable lists/tables');
                }
            } else {
                console.warn('   ⚠️  selector object not found - please click "定位 表格" first');
            }
            
            console.log('\n' + '='.repeat(80));
            console.log('✅ All background communication tests passed!');
            console.log('='.repeat(80));
            
            return {
                success: true,
                tests: {
                    string: test1,
                    number: test2,
                    array: test3,
                    url: test4,
                    selectorExists: test5,
                    selectorNext: test5 ? test6 : 'skipped'
                }
            };
            
        } catch (error) {
            console.error('\n❌ Background communication test failed:', error);
            console.log('='.repeat(80));
            throw error;
        }
    };

    /**
     * 直接测试执行 selector.next() 并更新表格数据
     * 用法: await testAndUpdateTable()
     */
    window.testAndUpdateTable = async function() {
        console.log('🔄 Testing selector.next() and updating table...');
        try {
            const result = await executeNextSelector();
            
            if (!result.success) {
                console.error('❌ Failed:', result.message);
                return result;
            }
            
            console.log('✅ Success! Result:', result.data);
            
            // 更新表格数据
            if (result.data && result.data.data) {
                const simplifiedData = acceptManualSelection(result.data.data, result.data.selector);
                refreshStatusCounts({ pages: 1, rows: simplifiedData.length });

                console.log('✅ Table updated successfully!');
                console.log('   Items:', simplifiedData.length);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Error:', error);
            throw error;
        }
    };

    // 显示帮助信息
    console.log(`
%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 ScrapyJS Popup - 调试工具已加载
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 
    'color: #00ff00; font-weight: bold; font-size: 12px');
    
    console.log(`
%c⚠️  重要提示：`, 'color: #ff6b6b; font-weight: bold; font-size: 13px');
    console.log('%c在 popup DevTools 中运行测试函数可能会失败（环境上下文不同）', 'color: #ffd93d');
    
    console.log(`\n%c✅ 推荐的测试方法：`, 'color: #4ecdc4; font-weight: bold; font-size: 13px');
    
    console.log(`
%c方法 1: 使用 UI 按钮（最简单）%c
   1. 点击 "定位 表格" 按钮
   2. 点击 "下一个表格" 按钮
   3. 查看表格数据更新

%c方法 2: 在目标网页测试%c
   1. 在目标网页按 F12 打开 DevTools
   2. 点击 popup 中的 "定位 表格" 按钮
   3. 在网页控制台运行：%cselector.next()%c
`,
    'color: #95e1d3; font-weight: bold', '',
    'color: #95e1d3; font-weight: bold', '',
    'background: #2d2d2d; color: #4ecdc4; padding: 2px 6px; border-radius: 3px; font-family: monospace', ''
    );
    
    console.log(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'color: #00ff00; font-weight: bold');
    
    console.log(`\n%c📋 测试函数列表：`, 'color: #4ecdc4; font-weight: bold');
    console.log(`%c  await diagnosePageObject()          - 🔧 诊断 page 对象状态`, 'color: #ff6b6b; font-weight: bold');
    console.log(`%c  await testChromePageEvalPath()      - 🔍 测试 ChromePage.eval() 路径（CSP）`, 'color: #ff6b6b; font-weight: bold');
    console.log(`%c  await diagnoseSelectorState()       - 🔍 诊断 selector 状态`, 'color: #ffd93d; font-weight: bold');
    console.log(`%c  await testBackgroundCommunication() - 🔥 测试 background 通信（推荐）`, 'color: #00ff00; font-weight: bold');
    console.log(`%c  await quickTest()                   - 快速测试 selector.next()`, 'color: #666');
    console.log(`%c  await testSelectorNext()            - 详细测试 selector.next()`, 'color: #666');
    console.log(`%c  await testSelectorExists()          - 检查 selector 对象`, 'color: #666');
    console.log(`%c  await testAndUpdateTable()          - 测试并更新表格`, 'color: #666');
    console.log(`%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`, 'color: #00ff00; font-weight: bold');
});
