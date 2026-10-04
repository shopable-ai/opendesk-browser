// popup.js
document.addEventListener('DOMContentLoaded', function() {
    let config = {};
    let scraper = null;
    let isLocating = false;
    let startTime = null;
    let workingTimer = null;

    // 初始化标签页切换
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    // 获取所有需要的DOM元素
    const tryAnotherTableBtn = document.getElementById('tryAnotherTable');
    const locateNextButton = document.getElementById('locateNextButton');
    const startButton = document.getElementById('startButton');
    const configArea = document.getElementById('configArea');
    const codeArea = document.getElementById('codeArea');
    const infiniteScrollCheckbox = document.getElementById('infiniteScroll');
    const minDelayInput = document.getElementById('minDelay');
    const maxDelayInput = document.getElementById('maxDelay');
    const exportCsvBtn = document.getElementById('exportCsv');
    const exportJsonBtn = document.getElementById('exportJson');
    const copyAllBtn = document.getElementById('copyAll');

    // 标签页切换功能
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // 移除所有活动状态
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // 设置当前标签页为活动状态
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab') + 'Tab';
            document.getElementById(tabId).classList.add('active');
        });
    });

    // 文本区域自动调整高度
    function adjustTextareaHeight(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }

    // 更新工作时间显示
    function updateWorkingTime() {
        if (startTime) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            document.querySelector('.status-bar').innerHTML = `
                <span>Pages scraped: 1</span>
                <span>Rows collected: ${document.querySelectorAll('.data-table tbody tr').length}</span>
                <span>Working time: ${elapsed}s</span>
            `;
        }
    }

    // 初始化配置
    function initializeConfig() {
        try {
            config = JSON.parse(configArea.value);
            updateGeneratedCode(config);
        } catch (error) {
            console.error('Invalid JSON configuration:', error);
        }
    }

    // 更新生成的代码
    function updateGeneratedCode(config) {
        const codeTemplate = `
const spider = new ListSpider({
    name: 'data_spider',
    start_urls: ['${window.location.href || 'current_page_url'}'],
    itemConfig: ${JSON.stringify(config, null, 2)},
    custom_settings: {
        CLOSESPIDER_PAGECOUNT: ${infiniteScrollCheckbox.checked ? 'null' : '1'},
        MIN_DELAY: ${minDelayInput.value},
        MAX_DELAY: ${maxDelayInput.value}
    },
    output: 'scraped_data.json'
});

scrapy.spider = spider;
scrapy.addPipeline(function (item) {
    if (!item.title) return null;
    return item;
});

scrapy.start()
    .then((items) => {
        console.log('Scraping completed:', items);
    })
    .catch(console.error);`;

        codeArea.value = codeTemplate.trim();
        adjustTextareaHeight(codeArea);
    }
    startButton.addEventListener('click', async () => {
        alert('开始')
    });

    // "Locate Next" button functionality
    locateNextButton.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!isLocating) {
            // 开始定位模式
            isLocating = true;
            locateNextButton.classList.add('active');
            locateNextButton.textContent = 'Cancel Selection';

            await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                css: `
                    .scraper-highlight {
                        outline: 2px solid #f00 !important;
                        background-color: rgba(255, 0, 0, 0.1) !important;
                    }
                    .scraper-hover {
                        outline: 2px solid #00f !important;
                        background-color: rgba(0, 0, 255, 0.1) !important;
                    }
                `
            });

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: initializeSelector
            });
        } else {
            // 取消定位模式
            isLocating = false;
            locateNextButton.classList.remove('active');
            locateNextButton.textContent = 'Locate "Next" button';

            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                function: cleanupSelector
            });
        }
    });

    // "Try another table" button functionality
    tryAnotherTableBtn.addEventListener('click', async () => {
        startTime = Date.now();
        if (!workingTimer) {
            workingTimer = setInterval(updateWorkingTime, 1000);
        }

        try {
            initializeConfig();
            // 这里添加实际的抓取逻辑
            // 暂时使用模拟数据
            setTimeout(() => {
                updateWorkingTime();
            }, 1000);
        } catch (error) {
            console.error('Error during scraping:', error);
        }
    });

    // 配置更改事件处理
    configArea.addEventListener('input', () => {
        adjustTextareaHeight(configArea);
        try {
            const newConfig = JSON.parse(configArea.value);
            updateGeneratedCode(newConfig);
            chrome.storage.local.set({ scraperConfig: newConfig });
        } catch (error) {
            console.error('Invalid JSON:', error);
        }
    });

    // 加载保存的配置
    chrome.storage.local.get(['scraperConfig'], function(result) {
        if (result.scraperConfig) {
            configArea.value = JSON.stringify(result.scraperConfig, null, 2);
            config = result.scraperConfig;
            updateGeneratedCode(config);
        }
    });

    // 导出按钮事件处理
    exportCsvBtn.addEventListener('click', () => {
        // TODO: 实现CSV导出功能
        console.log('Export to CSV');
    });

    exportJsonBtn.addEventListener('click', () => {
        // TODO: 实现XLSX导出功能
        console.log('Export to XLSX');
    });

    copyAllBtn.addEventListener('click', () => {
        // TODO: 实现复制所有数据功能
        console.log('Copy all data');
    });

    // 设置更改事件处理
    infiniteScrollCheckbox.addEventListener('change', () => {
        updateGeneratedCode(config);
    });

    minDelayInput.addEventListener('change', () => {
        updateGeneratedCode(config);
    });

    maxDelayInput.addEventListener('change', () => {
        updateGeneratedCode(config);
    });

    // 初始化时调整编辑器高度
    adjustTextareaHeight(configArea);
    adjustTextareaHeight(codeArea);
});

// 选择器相关函数
function initializeSelector() {
    let hoveredElement = null;
    
    function getSelector(element) {
        if (!element) return '';
        
        const selectors = [];
        while (element && element.tagName) {
            let selector = element.tagName.toLowerCase();
            
            if (element.id) {
                selector += '#' + element.id;
                selectors.unshift(selector);
                break;
            }
            
            if (element.className) {
                const classes = element.className.split(' ')
                    .filter(c => c.trim().length > 0)
                    .join('.');
                if (classes.length > 0) {
                    selector += '.' + classes;
                }
            }
            
            const siblings = element.parentElement ? 
                Array.from(element.parentElement.children)
                    .filter(e => e.tagName === element.tagName) : [];
                    
            if (siblings.length > 1) {
                const index = siblings.indexOf(element) + 1;
                selector += `:nth-of-type(${index})`;
            }
            
            selectors.unshift(selector);
            element = element.parentElement;
        }
        
        return selectors.join(' > ');
    }

    function handleMouseOver(event) {
        if (hoveredElement) {
            hoveredElement.classList.remove('scraper-hover');
        }
        
        hoveredElement = event.target;
        hoveredElement.classList.add('scraper-hover');
        event.stopPropagation();
    }

    function handleMouseOut(event) {
        if (hoveredElement) {
            hoveredElement.classList.remove('scraper-hover');
            hoveredElement = null;
        }
    }

    function handleClick(event) {
        event.preventDefault();
        event.stopPropagation();
        
        if (hoveredElement) {
            const selector = getSelector(hoveredElement);
            chrome.runtime.sendMessage({ 
                type: 'SELECTOR_UPDATED', 
                selector: selector 
            });
            
            cleanup();
        }
    }

    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);
    document.addEventListener('click', handleClick, true);
}

function cleanupSelector() {
    const highlighted = document.querySelectorAll('.scraper-highlight, .scraper-hover');
    highlighted.forEach(el => {
        el.classList.remove('scraper-highlight', 'scraper-hover');
    });
}