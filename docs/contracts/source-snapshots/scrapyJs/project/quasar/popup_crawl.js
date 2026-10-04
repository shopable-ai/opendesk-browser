// bridge.js - 前端桥接文件
const bridge = {
  send(eventName, data) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ eventName, data }, resolve);
    });
  }
};

const { createApp, ref } = Vue;

        // 示例：获取时间
        const getTime = async () => {
            const time = await bridge.send('CHROME_ENTENSION_TEST');
            console.log('Current time:', time);
        };

const app = createApp({
    setup() {
        const activeTab = ref('data');
        const loading = ref(false);
        const locating = ref(false);
        const crawling = ref(false);
        const settings = ref({
            infiniteScroll: false,
            minDelay: 1,
            maxDelay: 3
        });
        const stats = ref({
            pagesScrapped: 0,
            rowsCollected: 0,
            workingTime: 0
        });
        const tableData = ref([]);
        const tableColumns = ref([]);
        const configText = ref('');
        const generatedCode = ref('');

        return {
            activeTab,
            loading,
            locating,
            crawling,
            settings,
            stats,
            tableData,
            tableColumns,
            configText,
            generatedCode,
            
            // Methods
            tryAnotherTable() {
                loading.value = true;
                // Implementation here
                setTimeout(() => loading.value = false, 1000);
            },
            
            locateNextButton() {
                locating.value = true;
                // Implementation here
                setTimeout(() => locating.value = false, 1000);
            },
            
            startCrawl() {
                crawling.value = true;
                // Implementation here
                setTimeout(() => crawling.value = false, 1000);
            },
            
            exportCsv() {
                getTime();
                // Implementation here
                console.log('Exporting CSV...');
            },
            
            exportJson() {
                // Implementation here
                console.log('Exporting JSON...');
            },
            
            copyAll() {
                // Implementation here
                console.log('Copying all data...');
            },
            
            updateConfig(value) {
                // Implementation here
                console.log('Updating config:', value);
            }
        };
    }
});

// Use Quasar
app.use(Quasar);

// Mount the app
app.mount('#q-app');