/**
 * 布局克隆测试工具
 * 在浏览器 DevTools 控制台中运行此脚本
 * 克隆页面布局结构，移除文本，用虚线和背景色显示布局
 * 
 * 使用方法：
 * 1. 初次运行自动启动，点击元素克隆后自动停止
 * 2. 再次克隆调用：cloneLayout.start()
 * 3. 下载HTML：cloneLayout.download()
 */

(function(global) {
    'use strict';
    
    const API_NAMESPACE = 'cloneLayout';
    const IGNORE_CLASS = 'clone-layout-ignore';
    
    function printBanner() {
        console.clear();
        console.log('%c🎯 布局克隆测试工具已启动 v2.0', 'font-size: 16px; color: #27ae60; font-weight: bold;');
        console.log('%c点击页面上的任意元素来克隆其布局结构', 'font-size: 12px; color: #3498db;');
        console.log('%c克隆后会自动停止，再次使用请调用：cloneLayout.start()', 'font-size: 12px; color: #e67e22;');
        console.log('%c下载完整HTML文件：cloneLayout.download()', 'font-size: 12px; color: #9b59b6;');
        console.log('%c按 ESC 键随时退出', 'font-size: 12px; color: #e74c3c;');
        console.log('─'.repeat(80));
    }
    
    // 高亮样式
    const highlightStyle = {
        outline: '3px solid #3498db',
        outlineOffset: '2px',
        cursor: 'crosshair',
        transition: 'all 0.2s ease'
    };
    
    let currentHighlighted = null;
    let isActive = false;
    let overlayContainer = null;
    let lastClonedElement = null;
    let lastClonedHTML = null;
    let targetPageUrl = window.location.href;
    
    // 生成随机的柔和背景色
    function getRandomPastelColor() {
        const hue = Math.floor(Math.random() * 360);
        const saturation = 30 + Math.floor(Math.random() * 20); // 30-50%
        const lightness = 85 + Math.floor(Math.random() * 10);  // 85-95%
        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    
    // 获取元素的计算样式
    function getLayoutStyles(element) {
        const computed = window.getComputedStyle(element);
        const styles = {};
        
        // 关键布局属性
        const layoutProps = [
            'display', 'position', 'top', 'right', 'bottom', 'left',
            'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'box-sizing', 'overflow', 'overflow-x', 'overflow-y',
            // Flexbox
            'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
            'justify-content', 'align-items', 'align-self', 'align-content', 'gap',
            'row-gap', 'column-gap', 'order',
            // Grid
            'grid', 'grid-template', 'grid-template-columns', 'grid-template-rows',
            'grid-template-areas', 'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
            'grid-column', 'grid-column-start', 'grid-column-end',
            'grid-row', 'grid-row-start', 'grid-row-end',
            'grid-area', 'grid-gap', 'column-gap', 'row-gap',
            // 其他
            'float', 'clear', 'z-index', 'transform', 'transform-origin'
        ];
        
        layoutProps.forEach(prop => {
            const value = computed.getPropertyValue(prop);
            if (value && value !== 'none' && value !== 'auto' && value !== 'normal') {
                styles[prop] = value;
            }
        });
        
        return styles;
    }
    
    // 克隆元素布局（递归）
    function cloneElementLayout(element, depth = 0, maxDepth = 10) {
        if (depth > maxDepth) return null;
        
        const tagName = element.tagName.toLowerCase();
        
        // 忽略某些标签和我们自己的预览窗口
        if (['script', 'style', 'noscript', 'meta', 'link', 'title'].includes(tagName)) {
            return null;
        }
        
        // 忽略预览窗口及其子元素
        if (element.classList.contains(IGNORE_CLASS) || element.closest('.' + IGNORE_CLASS)) {
            return null;
        }
        
        // 创建新元素
        const clone = document.createElement(tagName);
        
        // 获取布局样式
        const layoutStyles = getLayoutStyles(element);
        const computed = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        
        // 应用布局样式
        Object.entries(layoutStyles).forEach(([prop, value]) => {
            clone.style[prop] = value;
        });
        
        // 保存实际尺寸（重要：保留原始宽高）
        if (rect.width > 0) {
            // 如果没有明确设置width，保存计算后的宽度
            if (!clone.style.width || clone.style.width === 'auto') {
                clone.style.width = Math.round(rect.width) + 'px';
            }
        }
        if (rect.height > 0) {
            // 如果没有明确设置height，保存计算后的高度
            if (!clone.style.height || clone.style.height === 'auto') {
                clone.style.height = Math.round(rect.height) + 'px';
            }
        }
        
        // 添加可视化样式
        const bgColor = getRandomPastelColor();
        clone.style.backgroundColor = bgColor;
        clone.style.border = '2px dashed #888';
        clone.style.boxSizing = 'border-box';
        
        // 确保最小尺寸可见
        if (rect.width > 0 && rect.width < 20) {
            clone.style.minWidth = '20px';
        }
        if (rect.height > 0 && rect.height < 20) {
            clone.style.minHeight = '20px';
        }
        
        // 添加类名（用于调试）
        if (element.className && typeof element.className === 'string') {
            clone.className = element.className;
        }
        
        // 添加ID（用于调试）
        if (element.id) {
            clone.id = 'cloned-' + element.id;
        }
        
        // 特殊处理：图片显示占位符
        if (tagName === 'img') {
            clone.alt = '🖼️';
            clone.style.display = 'flex';
            clone.style.alignItems = 'center';
            clone.style.justifyContent = 'center';
            clone.style.fontSize = '24px';
            // 不设置 src，显示破碎图片效果
        }
        
        // 递归克隆子元素
        Array.from(element.children).forEach(child => {
            const childClone = cloneElementLayout(child, depth + 1, maxDepth);
            if (childClone) {
                clone.appendChild(childClone);
            }
        });
        
        // 如果没有子元素，添加一个小的占位内容
        if (clone.children.length === 0 && tagName !== 'img' && tagName !== 'input' && tagName !== 'textarea') {
            const placeholder = document.createElement('div');
            placeholder.style.cssText = `
                font-size: 10px;
                color: #999;
                padding: 2px;
                text-align: center;
                user-select: none;
            `;
            placeholder.textContent = tagName;
            clone.appendChild(placeholder);
        }
        
        return clone;
    }
    
    // 创建克隆预览
    function createClonePreview(element) {
        // 移除旧的预览
        if (overlayContainer) {
            overlayContainer.remove();
        }
        
        // 保存目标元素信息
        lastClonedElement = element;
        targetPageUrl = window.location.href;
        
        // 创建容器（添加忽略类）
        overlayContainer = document.createElement('div');
        overlayContainer.id = 'clone-layout-preview';
        overlayContainer.className = IGNORE_CLASS;
        overlayContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 80%;
            max-width: 1200px;
            height: 80%;
            background: white;
            border: 3px solid #3498db;
            border-radius: 8px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 999999;
            overflow: auto;
            padding: 20px;
        `;
        
        // 添加标题栏
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
            position: sticky;
            top: 0;
            background: #3498db;
            color: white;
            padding: 10px 15px;
            margin: -20px -20px 20px -20px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 14px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 1;
        `;
        
        const title = document.createElement('span');
        title.textContent = `📐 布局克隆预览 - ${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className && typeof element.className === 'string' ? '.' + element.className.split(' ').filter(c => c && c !== IGNORE_CLASS)[0] : ''}`;
        
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 10px;';
        
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = '⬇️ 下载HTML';
        downloadBtn.style.cssText = `
            background: #27ae60;
            color: white;
            border: none;
            padding: 5px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
        `;
        downloadBtn.onmouseover = () => downloadBtn.style.background = '#229954';
        downloadBtn.onmouseout = () => downloadBtn.style.background = '#27ae60';
        downloadBtn.onclick = () => downloadHTML();
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕ 关闭';
        closeBtn.style.cssText = `
            background: white;
            color: #3498db;
            border: none;
            padding: 5px 15px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 14px;
        `;
        closeBtn.onmouseover = () => closeBtn.style.background = '#ecf0f1';
        closeBtn.onmouseout = () => closeBtn.style.background = 'white';
        closeBtn.onclick = () => overlayContainer.remove();
        
        btnContainer.appendChild(downloadBtn);
        btnContainer.appendChild(closeBtn);
        titleBar.appendChild(title);
        titleBar.appendChild(btnContainer);
        overlayContainer.appendChild(titleBar);
        
        // 添加说明
        const info = document.createElement('div');
        info.style.cssText = `
            background: #fff3cd;
            border: 1px solid #ffc107;
            padding: 10px;
            margin-bottom: 15px;
            border-radius: 4px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 12px;
            color: #856404;
        `;
        info.innerHTML = `
            <strong>💡 说明：</strong>
            每个区块用虚线边框和随机背景色显示，文本内容已移除，
            布局属性（flex、grid、position等）和实际尺寸已保留。
            <br><strong>🎯 目标页面：</strong><a href="${targetPageUrl}" target="_blank" style="color: #3498db;">${targetPageUrl}</a>
        `;
        overlayContainer.appendChild(info);
        
        // 克隆元素
        console.time('克隆布局');
        const clonedElement = cloneElementLayout(element);
        console.timeEnd('克隆布局');
        
        if (clonedElement) {
            // 创建包装器
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                background: #f8f9fa;
                padding: 20px;
                border-radius: 4px;
                overflow: auto;
            `;
            wrapper.appendChild(clonedElement);
            overlayContainer.appendChild(wrapper);
            
            // 保存HTML
            lastClonedHTML = clonedElement.outerHTML;
            
            // 添加统计信息
            const stats = document.createElement('div');
            stats.style.cssText = `
                position: sticky;
                bottom: 0;
                background: #f8f9fa;
                border-top: 2px solid #dee2e6;
                padding: 10px 15px;
                margin: 20px -20px -20px -20px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                color: #6c757d;
            `;
            const elemCount = wrapper.querySelectorAll('*').length;
            stats.textContent = `📊 统计：共克隆 ${elemCount} 个元素`;
            overlayContainer.appendChild(stats);
            
            document.body.appendChild(overlayContainer);
            
            console.log('%c✅ 布局克隆完成！', 'color: #27ae60; font-weight: bold;');
            console.log(`共克隆 ${elemCount} 个元素`);
            console.log('%c💾 调用 cloneLayout.download() 可下载完整HTML文件', 'color: #9b59b6; font-weight: bold;');
        } else {
            console.error('克隆失败');
        }
    }
    
    // 鼠标移动事件
    function handleMouseMove(e) {
        if (!isActive) return;
        
        const element = e.target;
        
        // 忽略预览窗口
        if (element.classList.contains(IGNORE_CLASS) || element.closest('.' + IGNORE_CLASS)) {
            return;
        }
        
        // 移除之前的高亮
        if (currentHighlighted && currentHighlighted !== element) {
            Object.keys(highlightStyle).forEach(prop => {
                currentHighlighted.style[prop] = '';
            });
        }
        
        // 添加新的高亮
        if (element && element !== overlayContainer && !overlayContainer?.contains(element)) {
            Object.entries(highlightStyle).forEach(([prop, value]) => {
                element.style[prop] = value;
            });
            currentHighlighted = element;
        }
    }
    
    // 点击事件
    function handleClick(e) {
        if (!isActive) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const element = e.target;
        
        // 忽略预览窗口
        if (element.classList.contains(IGNORE_CLASS) || element.closest('.' + IGNORE_CLASS)) {
            return;
        }
        
        console.log('%c📐 克隆元素:', 'color: #3498db; font-weight: bold;', element);
        createClonePreview(element);
        
        // 点击后自动停止监听（单次模式）
        stop();
        console.log('%c⏸️  已自动停止监听，再次使用请调用：cloneLayout.start()', 'color: #e67e22; font-weight: bold;');
    }
    
    // ESC 键退出
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            stop();
        }
    }
    
    // 下载完整HTML文件
    function downloadHTML() {
        if (!lastClonedHTML) {
            console.error('没有可下载的内容，请先克隆一个元素');
            return;
        }
        
        const elementInfo = lastClonedElement ? 
            `${lastClonedElement.tagName.toLowerCase()}${lastClonedElement.id ? '#' + lastClonedElement.id : ''}` : 
            'element';
        
        const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>布局克隆结果 - ${elementInfo}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f8f9fa;
            padding: 20px;
        }
        
        .header {
            background: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .header h1 {
            color: #2c3e50;
            font-size: 24px;
            margin-bottom: 10px;
        }
        
        .header .info {
            color: #7f8c8d;
            font-size: 14px;
            line-height: 1.6;
        }
        
        .header .url {
            color: #3498db;
            text-decoration: none;
            word-break: break-all;
        }
        
        .header .url:hover {
            text-decoration: underline;
        }
        
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow: auto;
        }
        
        .footer {
            background: white;
            padding: 15px 20px;
            margin-top: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
            color: #7f8c8d;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📐 布局克隆结果</h1>
        <div class="info">
            <p><strong>克隆元素：</strong>${elementInfo}</p>
            <p><strong>目标页面：</strong><a href="${targetPageUrl}" target="_blank" class="url">${targetPageUrl}</a></p>
            <p><strong>生成时间：</strong>${new Date().toLocaleString('zh-CN')}</p>
            <p><strong>说明：</strong>每个区块用虚线边框和随机背景色显示，文本内容已移除，布局属性（flex、grid、position等）和实际尺寸已保留。</p>
        </div>
    </div>
    
    <div class="container">
        ${lastClonedHTML}
    </div>
    
    <div class="footer">
        <p>由 clone-layout.js 工具生成 | ${new Date().toLocaleDateString('zh-CN')}</p>
    </div>
</body>
</html>`;
        
        // 创建 Blob 并下载
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `layout-clone-${elementInfo}-${Date.now()}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('%c✅ HTML文件已下载', 'color: #27ae60; font-weight: bold;');
        console.log(`文件名: ${a.download}`);
    }
    
    // 启动
    function start() {
        if (isActive) {
            console.warn('⚠️  布局克隆工具已在运行中');
            return;
        }
        
        isActive = true;
        printBanner();
        
        document.addEventListener('mousemove', handleMouseMove, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKeyDown, true);
        
        console.log('%c✅ 已启动，移动鼠标并点击元素来克隆布局（点击后自动停止）', 'color: #27ae60; font-weight: bold;');
    }
    
    // 停止
    function stop(options = {}) {
        if (!isActive) {
            if (!options.silent) {
                console.warn('⚠️  布局克隆工具未在运行');
            }
            return;
        }
        
        isActive = false;
        
        // 移除高亮
        if (currentHighlighted) {
            Object.keys(highlightStyle).forEach(prop => {
                currentHighlighted.style[prop] = '';
            });
            currentHighlighted = null;
        }
        
        // 不自动移除预览窗口，让用户可以查看结果
        // if (overlayContainer) {
        //     overlayContainer.remove();
        //     overlayContainer = null;
        // }
        
        // 移除事件监听
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeyDown, true);
        
        if (!options.silent) {
            console.log('%c⏹️  布局克隆工具已停止（预览窗口保留）', 'color: #e74c3c;');
        }
    }
    
    // 清理所有内容
    function cleanup() {
        stop({ silent: true });
        
        // 移除预览窗口
        if (overlayContainer) {
            overlayContainer.remove();
            overlayContainer = null;
        }
        
        lastClonedElement = null;
        lastClonedHTML = null;
        
        console.log('%c🧹 已清理所有内容', 'color: #95a5a6;');
    }
    
    // 导出 API
    const api = {
        start,
        stop,
        download: downloadHTML,
        cleanup,
        version: '2.0.0',
        // 方便调试
        getLastCloned: () => lastClonedElement,
        getLastHTML: () => lastClonedHTML
    };
    
    global[API_NAMESPACE] = api;
    
    // 自动启动
    start();
    
    // 返回 API
    return api;
    
})(window);

