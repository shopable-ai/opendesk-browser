function detectContentLists() {
    const body = document.body;
    const lists = new Map();
    
    // 获取元素的可视区域信息
    function getVisibleArea(el) {
        const rect = el.getBoundingClientRect();
        return {
            area: rect.width * rect.height,
            width: rect.width,
            height: rect.height,
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            visible: rect.width > 0 && rect.height > 0
        };
    }
    
    // 检查元素可见性
    function isVisible(el) {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0';
    }
    
    function hasContent(el) {
        const text = el.textContent.trim();
        return text.length > 0 && 
               !el.matches('script, style, meta, link, noscript') &&
               isVisible(el);
    }
    
    function getSignature(el) {
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).sort().join('.');
        const childrenCount = Array.from(el.children).filter(hasContent).length;
        return `${tag}-${classes}-${childrenCount}`;
    }
    
    function getSelector(el) {
        const classes = Array.from(el.classList);
        return classes.length > 0 ? 
               `${el.tagName.toLowerCase()}.${classes.join('.')}` : 
               el.tagName.toLowerCase();
    }
    
    // 查找列表并计算区域
    function findLists(root) {
        const elements = root.getElementsByTagName('*');
        const patterns = new Map();
        
        Array.from(elements).forEach(el => {
            if (hasContent(el)) {
                const signature = getSignature(el);
                if (!patterns.has(signature)) {
                    patterns.set(signature, []);
                }
                patterns.get(signature).push(el);
            }
        });
        
        // 分析重复模式并计算区域
        patterns.forEach((elements, signature) => {
            if (elements.length >= 2) {
                const firstEl = elements[0];
                const parent = firstEl.parentElement;
                
                if (!parent) return;
                
                // 检查相邻性和可见性
                const areSiblings = elements.every((el, i) => {
                    if (i === 0) return true;
                    return el.parentElement === parent && isVisible(el);
                });
                
                if (areSiblings) {
                    // 计算整体区域
                    const containerArea = getVisibleArea(parent);
                    const itemAreas = elements.map(el => getVisibleArea(el));
                    const avgItemArea = itemAreas.reduce((sum, area) => sum + area.area, 0) / elements.length;
                    
                    // 提取数据结构
                    const data = elements.map((el, index) => ({
                        text: el.textContent.trim(),
                        links: Array.from(el.getElementsByTagName('a')).map(a => ({
                            text: a.textContent.trim(),
                            href: a.href
                        })),
                        images: Array.from(el.getElementsByTagName('img')).map(img => ({
                            src: img.src,
                            alt: img.alt
                        })),
                        area: itemAreas[index]
                    }));
                    
                    lists.set(signature, {
                        selector: getSelector(parent),
                        itemSelector: getSelector(firstEl),
                        itemCount: elements.length,
                        containerArea,
                        avgItemArea,
                        sample: data[0],
                        data: data,
                        extractCode: `
// 提取此列表的代码
const items = document.querySelectorAll('${getSelector(firstEl)}');
const data = Array.from(items).map(item => ({
    text: item.textContent.trim(),
    links: Array.from(item.getElementsByTagName('a')).map(a => ({
        text: a.textContent.trim(),
        href: a.href
    })),
    images: Array.from(item.getElementsByTagName('img')).map(img => ({
        src: img.src,
        alt: img.alt
    }))
}));`
                    });
                }
            }
        });
    }
    
    // 执行检测
    findLists(body);
    
    // 转换为数组并排序
    const sortedLists = Array.from(lists.entries())
        .sort((a, b) => {
            // 首先按容器区域排序
            const areaCompare = b[1].containerArea.area - a[1].containerArea.area;
            if (areaCompare !== 0) return areaCompare;
            
            // 如果区域相同，按项目数量排序
            return b[1].itemCount - a[1].itemCount;
        });
    
    // 输出结果
    console.log(`发现 ${sortedLists.length} 个内容列表 (按区域大小排序):`);
    sortedLists.forEach(([signature, info], index) => {
        console.group(`#${index + 1} 列表 [${signature}] (${info.itemCount} 项)`);
        console.log('容器区域:', 
            `${Math.round(info.containerArea.width)}x${Math.round(info.containerArea.height)}px`,
            `(${Math.round(info.containerArea.area)}px²)`);
        console.log('平均项目大小:', 
            `(${Math.round(info.avgItemArea)}px²)`);
        console.log('选择器:', info.selector);
        console.log('位置:', 
            `top: ${Math.round(info.containerArea.top)}px, `,
            `left: ${Math.round(info.containerArea.left)}px`);
        console.log('示例数据:', info.sample);
        console.log('提取代码:', info.extractCode);
        console.groupEnd();
    });
    
    // 返回排序后的Map
    return new Map(sortedLists);
}

// 快速提取函数现在使用索引而不是签名
function extractData(index) {
    const lists = detectContentLists();
    const sortedLists = Array.from(lists.entries());
    return index < sortedLists.length ? sortedLists[index][1].data : null;
}

// 运行检测
console.clear();
console.log('开始检测页面内容列表...');
const lists = detectContentLists();
console.log('\n使用 extractData(列表索引) 来提取特定列表的数据',lists);