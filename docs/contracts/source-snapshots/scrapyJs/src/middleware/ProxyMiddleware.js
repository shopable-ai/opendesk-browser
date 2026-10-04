const axios = require('axios');
const DownloaderMiddleware = require('./DownloaderMiddleware');

// ProxyProviderConfig.js
class ProxyProviderConfig {
    constructor(config = {}) {
        // Basic settings
        this.mode = config.mode || 'static';
        this.proxyList = config.proxyList || [];
        this.proxyApiUrl = config.proxyApiUrl;
        
        // Timing settings
        this.proxyCooldown = config.proxyCooldown || 10000;
        this.refreshInterval = config.refreshInterval || 10000;
        this.retryInterval = config.retryInterval || 3000;
        this.maxRetries = config.maxRetries || 3;
        this.timeout = config.timeout || 5000;

        // Response parsing settings
        this.responseType = config.responseType || 'auto';  // 'auto', 'text', 'json'
        this.responseParser = config.responseParser || this.defaultResponseParser.bind(this);
        this.responsePath = config.responsePath || '';  // JSON path like 'data.proxy.ip'
        this.responseFormat = config.responseFormat || '${ip}:${port}';
    }

    defaultResponseParser(response) {
        let result = response.data;

        // Handle response type
        if (this.responseType === 'text') {
            return typeof result === 'string' ? result.trim() : String(result).trim();
        }

        // Parse JSON if needed
        if (this.responseType === 'json' || (this.responseType === 'auto' && typeof result === 'string')) {
            try {
                result = typeof result === 'string' ? JSON.parse(result) : result;
            } catch (e) {
                if (this.responseType === 'json') {
                    console.error('Failed to parse JSON response:', e);
                    return null;
                }
                return result.trim();
            }
        }

        // Process object response
        if (typeof result === 'object' && result !== null) {
            if (this.responsePath) {
                try {
                    const paths = this.responsePath.split('.');
                    for (const path of paths) {
                        result = result[path];
                    }
                } catch (e) {
                    console.error('Failed to get value from response path:', e);
                    return null;
                }
            }

            if (this.responseFormat && typeof result === 'object') {
                try {
                    return this.formatProxy(result);
                } catch (e) {
                    console.error('Failed to format proxy response:', e);
                    return null;
                }
            }
        }

        return typeof result === 'string' ? result.trim() : String(result).trim();
    }

    formatProxy(data) {
        let result = this.responseFormat;
        for (const [key, value] of Object.entries(data)) {
            result = result.replace(`\${${key}}`, value);
        }
        return result;
    }
}

// ProxyProvider.js
class IProxyProvider {
    async getProxy() {
        throw new Error("getProxy() must be implemented in the subclass");
    }

    markProxyAsFailed(proxy) {
        throw new Error("markProxyAsFailed() must be implemented in the subclass");
    }
}

class StaticProxyProvider extends IProxyProvider {
    constructor(config) {
        super();
        this.config = new ProxyProviderConfig(config);
        this.currentIndex = 0;
        this.failedProxies = new Set();
        this.failedProxyUntil = new Map();
    }

    isProxyCoolingDown(proxy) {
        const expiresAt = this.failedProxyUntil.get(proxy);
        if (!expiresAt) {
            return false;
        }
        if (expiresAt <= Date.now()) {
            this.failedProxyUntil.delete(proxy);
            this.failedProxies.delete(proxy);
            return false;
        }
        return true;
    }

    async getProxy() {
        const availableProxies = this.config.proxyList.filter(
            proxy => !this.isProxyCoolingDown(proxy)
        );

        if (availableProxies.length === 0) {
            if (this.config.proxyList.length === 0) {
                throw new Error('No proxies available');
            }
            this.failedProxies.clear();
            return this.config.proxyList[0];
        }

        const proxy = availableProxies[this.currentIndex % availableProxies.length];
        this.currentIndex++;
        return proxy;
    }

    markProxyAsFailed(proxy) {
        if (proxy) {
            console.log(`Marking static proxy as failed: ${proxy}`);
            this.failedProxies.add(proxy);
            this.failedProxyUntil.set(proxy, Date.now() + this.config.proxyCooldown);
        }
    }
}

class DynamicProxyProvider extends IProxyProvider {
    constructor(config) {
        super();
        this.config = new ProxyProviderConfig(config);
        this.currentProxy = null;
        this.lastFetchTime = 0;
        this.retryCount = 0;
    }

    async getProxy() {
        const now = Date.now();
        if (!this.currentProxy || (now - this.lastFetchTime) > this.config.refreshInterval) {
            await this.fetchNewProxy();
        }
        return this.currentProxy;
    }

    async fetchNewProxy() {
        try {
            console.log('Fetching new proxy from:', this.config.proxyApiUrl);
            const response = await axios.get(this.config.proxyApiUrl, {
                timeout: this.config.timeout
            });

            const parsedProxy = this.config.responseParser(response);
            if (parsedProxy) {
                this.currentProxy = parsedProxy;
                this.lastFetchTime = Date.now();
                this.retryCount = 0;
                console.log('Successfully fetched new proxy:', parsedProxy);
            } else {
                throw new Error('Failed to parse proxy from response');
            }
        } catch (error) {
            console.error('Error fetching proxy:', error);
            this.retryCount++;

            if (this.retryCount >= this.config.maxRetries) {
                throw error;
            }

            await new Promise(resolve => setTimeout(resolve, this.config.retryInterval));
            return this.fetchNewProxy();
        }
    }

    markProxyAsFailed(proxy) {
        console.log('Marking dynamic proxy as failed');
        this.currentProxy = null;
    }
}

// ProxyManager.js
// ProxyManager.js
/**
 * 完整的代理管理器实现
 */
class ProxyManager {
    constructor(config = {}) {
        this.config = {
            mode: config.mode || 'static',  // 'static' 或 'dynamic'
            proxyList: config.proxyList || [], // 静态代理列表
            proxyApiUrl: config.proxyApiUrl,   // 动态代理 API
            proxyForwardingUrl: config.proxyForwardingUrl || 'http://localhost:3000',
            proxyCooldown: config.proxyCooldown || 10000,
            refreshInterval: config.refreshInterval || 10000,
            timeout: config.timeout || 5000,
            retryTimes: config.retryTimes || 3,
            retryInterval: config.retryInterval || 3000,
            maxRetries: config.maxRetries || 3,
            ...config
        };
        
        this.currentProxy = null;
        this.lastFetchTime = 0;
        this.currentProxyIndex = 0;
        this.failedProxies = new Set();
        this.failedProxyUntil = new Map();
        this.environment = this.detectEnvironment();
        this.forwardingServiceAvailable = false;
        this.retryCount = 0;
        
        // 如果是静态模式，初始化当前代理
        if (this.config.mode === 'static' && this.config.proxyList.length > 0) {
            this.currentProxy = this.config.proxyList[0];
            console.log('Initialized with static proxy:', this.currentProxy);
        }
        
        // 检查转发服务可用性
        this.checkForwardingService();
        setInterval(() => this.checkForwardingService(), 600000);
    }

    /**
     * 检测运行环境
     */
    detectEnvironment() {
        if (typeof chrome !== 'undefined' && chrome.proxy) {
            return 'chrome-extension';
        }
        if (typeof window !== 'undefined') {
            return 'browser';
        }
        return 'nodejs';
    }

    /**
     * 检查代理转发服务是否可用
     */
    async checkForwardingService() {
        try {
            const response = await fetch(`${this.config.proxyForwardingUrl}/health`);
            this.forwardingServiceAvailable = response.ok;
            console.log('Proxy forwarding service status:', 
                this.forwardingServiceAvailable ? 'available' : 'unavailable');
        } catch (error) {
            this.forwardingServiceAvailable = false;
            console.warn('Proxy forwarding service is not available:', error.message);
        }
    }

    isProxyCoolingDown(proxy) {
        const expiresAt = this.failedProxyUntil.get(proxy);
        if (!expiresAt) {
            return false;
        }
        if (expiresAt <= Date.now()) {
            this.failedProxyUntil.delete(proxy);
            this.failedProxies.delete(proxy);
            return false;
        }
        return true;
    }

    /**
     * 发送请求的主方法
     */
    async request(config) {
        // 重试机制
        for (let i = 0; i < this.config.retryTimes; i++) {
            try {
                // 根据环境选择请求方式
                if (this.environment === 'chrome-extension' && this.forwardingServiceAvailable) {
                    return await this.forwardingRequest(config);
                } else if (this.environment === 'chrome-extension') {
                    return await this.chromeRequest(config);
                } else {
                    return await this.nodeRequest(config);
                }
            } catch (error) {
                console.error(`Request attempt ${i + 1} failed:`, error.message);
                if (i === this.config.retryTimes - 1) {
                    throw error;
                }
                await this.sleep(this.config.retryInterval);
            }
        }
    }

    /**
     * 通过转发服务发送请求
     */
    async forwardingRequest(config) {
        const proxy = await this.getNextProxy();
        if (!proxy) {
            throw new Error('No proxy available');
        }

        try {
            console.log('Sending request through forwarding service with proxy:', proxy);
            const response = await fetch(`${this.config.proxyForwardingUrl}/proxy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: config.url,
                    method: config.method || 'GET',
                    headers: {
                        ...config.headers,
                        'User-Agent': config.headers?.['User-Agent'] || 
                            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    data: config.data,
                    proxy: proxy
                })
            });

            if (!response.ok) {
                throw new Error(`Forwarding service error: ${response.status}`);
            }

            const data = await response.json();
            return {
                status: data.status,
                headers: data.headers,
                data: data.data
            };
        } catch (error) {
            console.error('Forwarding request failed:', error.message);
            this.markProxyAsFailed(proxy);
            throw error;
        }
    }

    /**
     * Node环境下的请求方法
     */
    async nodeRequest(config) {
        const proxy = await this.getNextProxy();
        if (!proxy) {
            throw new Error('No proxy available');
        }

        const [host, port] = proxy.split(':');
        const axiosConfig = {
            ...config,
            proxy: {
                host,
                port: parseInt(port),
                protocol: 'http'
            },
            timeout: this.config.timeout,
            maxRedirects: 5,
            validateStatus: function (status) {
                return status >= 200 && status < 600;
            }
        };

        try {
            console.log('Sending node request with proxy:', proxy);
            const response = await axios(axiosConfig);
            return response;
        } catch (error) {
            console.error('Node request failed:', error.message);
            this.markProxyAsFailed(proxy);
            throw error;
        }
    }

    /**
     * Chrome扩展环境下的请求方法
     */
    async chromeRequest(config) {
        let proxyEnabled = false;
        try {
            const proxy = await this.getNextProxy();
            if (!proxy) {
                throw new Error('No proxy available');
            }

            await this.setChromeProxy(proxy);
            proxyEnabled = true;

            console.log('Sending chrome request with proxy:', proxy);
            const response = await fetch(config.url, {
                method: config.method || 'GET',
                headers: {
                    ...config.headers,
                    'User-Agent': config.headers?.['User-Agent'] || 
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                body: config.data ? JSON.stringify(config.data) : undefined,
                signal: AbortSignal.timeout(this.config.timeout)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.text();
            return { data };
        } catch (error) {
            console.error('Chrome request failed:', error.message);
            const currentProxy = await this.getNextProxy();
            this.markProxyAsFailed(currentProxy);
            throw error;
        } finally {
            if (proxyEnabled) {
                await this.clearChromeProxy().catch(console.error);
            }
        }
    }

    /**
     * 获取下一个可用代理
     */
    async getNextProxy() {
        // 静态模式
        if (this.config.mode === 'static') {
            // 过滤掉失败的代理
            const availableProxies = this.config.proxyList.filter(
                proxy => !this.isProxyCoolingDown(proxy)
            );

            if (availableProxies.length === 0) {
                if (this.failedProxies.size > 0) {
                    console.log('All proxies are cooling down, reusing the earliest configured proxy');
                    return this.config.proxyList[0];
                }
                throw new Error('No proxies available');
            }

            const proxy = availableProxies[this.currentProxyIndex % availableProxies.length];
            this.currentProxyIndex = (this.currentProxyIndex + 1) % availableProxies.length;
            return proxy;
        }

        // 动态模式
        const now = Date.now();
        if (!this.currentProxy || (now - this.lastFetchTime) > this.config.refreshInterval) {
            try {
                const response = this.environment === 'chrome-extension' 
                    ? await fetch(this.config.proxyApiUrl)
                    : await axios.get(this.config.proxyApiUrl);
                
                const data = this.environment === 'chrome-extension' 
                    ? await response.text()
                    : response.data;

                this.currentProxy = typeof data === 'string' ? data.trim() : String(data).trim();
                this.lastFetchTime = now;
                this.retryCount = 0;
                console.log('New proxy obtained:', this.currentProxy);
            } catch (error) {
                console.error('Error fetching dynamic proxy:', error.message);
                this.retryCount++;
                
                if (this.retryCount >= this.config.maxRetries) {
                    throw new Error('Max retry attempts reached for proxy fetching');
                }
                
                await this.sleep(this.config.retryInterval);
                return this.getNextProxy();
            }
        }
        return this.currentProxy;
    }

    /**
     * 设置Chrome代理
     */
    async setChromeProxy(proxy) {
        if (this.environment !== 'chrome-extension') return;
        console.log('Setting Chrome proxy:', proxy);

        const [host, port] = proxy.split(':');
        const config = {
            mode: "fixed_servers",
            rules: {
                singleProxy: {
                    scheme: "http",
                    host: host,
                    port: parseInt(port)
                },
                bypassList: ["localhost"]
            }
        };

        return new Promise((resolve, reject) => {
            chrome.proxy.settings.set(
                { value: config, scope: 'regular' },
                () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        console.log('Chrome proxy set successfully');
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * 清除Chrome代理设置
     */
    async clearChromeProxy() {
        if (this.environment !== 'chrome-extension') return;

        return new Promise((resolve, reject) => {
            chrome.proxy.settings.clear(
                { scope: 'regular' },
                () => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        console.log('Chrome proxy cleared successfully');
                        resolve();
                    }
                }
            );
        });
    }

    /**
     * 标记代理失败
     */
    markProxyAsFailed(proxy) {
        if (!proxy) return;

        console.log('Marking proxy as failed:', proxy);
        this.failedProxies.add(proxy);
        this.failedProxyUntil.set(proxy, Date.now() + this.config.proxyCooldown);

        if (proxy === this.currentProxy) {
            this.currentProxy = null;
        }
    }

    /**
     * 延迟函数
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = {
    ProxyProviderConfig,
    IProxyProvider,
    StaticProxyProvider,
    DynamicProxyProvider,
    ProxyManager
};