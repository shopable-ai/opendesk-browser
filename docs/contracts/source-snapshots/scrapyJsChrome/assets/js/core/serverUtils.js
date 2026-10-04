
// const apis = [
//     'http://example.com',
//     'http://another-example.com',
// ];

// // 获取最快的服务器
// var fastestServer = await serverUtils.getFastestServer(apis);
// console.log('Fastest server:', fastestServ14:29er);

// // 检查所有服务器并收集结果
// const { results, fastestResult } = await serverUtils.checkServers(apis)
// console.log('All results:', results);
// console.log('Server with lowest latency:', fastestResult);


const serverUtils = {
    // 检查单个服务器的延迟
    async checkServer(server, timeout = 5000) {
        const start = Date.now();
        try {
            const response = await fetch(server, { method: 'GET', mode: 'no-cors' });
            const latency = Date.now() - start;
            return { server, latency, available: response.ok };
        } catch (error) {
            return { server, latency: Infinity, available: false, error: error.message };
        }
    },
 
    // 获取最快响应的服务器
    async getFastestServer(servers, timeout = 5000) {
        servers = servers.map(server => server.startsWith('http') ? server : `http://${server}`);        
        const promises = servers.map(server => this.checkServer(server, timeout));
        let fastestResult = null;

        for (const promise of promises) {
            try {
                const result = await Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))]);
                if (result.available) {
                    fastestResult = result;
                    break;
                }
            } catch (error) {
                // 处理异常或超时
            }
        }

        return fastestResult;
    },

    // 检查所有服务器并收集结果
    async checkServers(servers, timeout = 5000) {
        servers = servers.map(server => server.startsWith('http') ? server : `http://${server}`);        
        const results = [];
        const promises = servers.map(server => this.checkServer(server, timeout));

        for (const promise of promises) {
            try {
                const result = await promise;
                results.push(result);
            } catch (error) {
                results.push({ server: promise.server, latency: Infinity, available: false, error: error.message });
            }
        }

        // 找到延迟最低的服务器
        const fastestResult = results.reduce((prev, curr) => (curr.available && curr.latency < prev.latency ? curr : prev), { latency: Infinity });

        return {
            results,
            fastestResult
        };
    }
};

// 导出 serverUtils 对象
if ( globalThis.window ) window.serverUtils = serverUtils;


