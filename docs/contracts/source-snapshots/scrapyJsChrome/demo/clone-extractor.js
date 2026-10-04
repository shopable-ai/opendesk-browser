/**
 * DOM 克隆提取器
 * 在浏览器 DevTools 控制台中运行此脚本
 * 点击页面元素即可提取完整的 HTML 和 CSS
 */

(function(global) {
    'use strict';
    
    const API_NAMESPACE = 'cloneExtractor';
    const previousInstance = global[API_NAMESPACE];
    const shouldAutoStart = global.__CLONE_EXTRACTOR_AUTO_START__ === true;
    
    if (previousInstance && typeof previousInstance.stop === 'function') {
        try {
            previousInstance.stop({ silent: true });
        } catch (error) {
            console.warn('[clone-extractor] Failed to stop previous instance:', error);
        }
    }
    
    function printBanner() {
        console.clear();
        console.log('%c🎨 DOM 克隆提取器已启动（v2.7 完美版）', 'font-size: 16px; color: #27ae60; font-weight: bold;');
        console.log('%c点击页面上的任意元素来提取其 HTML 和 CSS', 'font-size: 12px; color: #3498db;');
        console.log('%c生成完整的 HTML 文件，可直接在浏览器中打开！', 'font-size: 12px; color: #e67e22; font-weight: bold;');
        console.log('%c按 ESC 键退出提取模式', 'font-size: 12px; color: #e74c3c;');
        console.log('');
        console.log('%c✨ 核心功能:', 'font-size: 12px; color: #9b59b6; font-weight: bold;');
        console.log('%c  📄 生成完整的 HTML 文件结构（DOCTYPE + head + body）', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  📏 智能保留图片和 SVG 尺寸（不覆盖布局约束）', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🎯 完美支持 Grid + Absolute 定位布局', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🎪 保留父容器 position 属性（absolute 定位参考）', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🔒 保留 object-fit 和 object-position（防止图片变形拉伸）', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🖼️  自动转换图片相对路径为绝对路径', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🎨 支持 SVG 元素和图标（保留 viewBox）', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🔤 自动提取 @font-face 字体定义', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🌄 处理 CSS 背景图片 URL', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  ✂️  智能差异比较，减少冗余样式', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🔗 保持父子嵌套关系（使用 > 选择器）', 'font-size: 11px; color: #8e44ad;');
        console.log('%c  🎭 支持 Vue Scoped CSS（data-v-* 属性选择器）', 'font-size: 11px; color: #8e44ad;');
        console.log('');
        console.log('%c🆕 v2.7 更新:', 'font-size: 11px; color: #e67e22; font-weight: bold;');
        console.log('%c  ✅ 修复 Vue Scoped CSS 属性选择器提取问题', 'font-size: 10px; color: #d35400;');
        console.log('%c  ✅ 从样式表中提取匹配的 CSS 规则（包括 [data-v-*]）', 'font-size: 10px; color: #d35400;');
        console.log('%c  ✅ 保留原始 CSS 选择器和自定义属性（--*）', 'font-size: 10px; color: #d35400;');
        console.log('%c  ✅ 完美支持 Vue/React 等框架的 Scoped 样式', 'font-size: 10px; color: #d35400;');
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
    let eventsBound = false;
    let styleElement = null;
    
    // 要忽略的 CSS 属性（默认值或不需要的）
    const ignoredProperties = new Set([
        'border-block-end-color',
        'border-block-end-style',
        'border-block-end-width',
        'border-block-start-color',
        'border-block-start-style',
        'border-block-start-width',
        'border-inline-end-color',
        'border-inline-end-style',
        'border-inline-end-width',
        'border-inline-start-color',
        'border-inline-start-style',
        'border-inline-start-width',
        'animation-composition',
        'animation-timeline',
        'mask-border-mode',
        'mask-border-outset',
        'mask-border-repeat',
        'mask-border-slice',
        'mask-border-source',
        'mask-border-width'
    ]);
    
    // 可继承的 CSS 属性列表
    const inheritableProperties = new Set([
        'color', 'font', 'font-family', 'font-size', 'font-style', 'font-variant', 'font-weight',
        'line-height', 'letter-spacing', 'text-align', 'text-indent', 'text-transform',
        'white-space', 'word-spacing', 'direction', 'cursor', 'visibility',
        'list-style', 'list-style-image', 'list-style-position', 'list-style-type',
        'quotes', 'orphans', 'widows'
    ]);
    
    // 获取元素的所有计算样式
    function getComputedStyles(element) {
        const computed = window.getComputedStyle(element);
        const styles = {};
        
        // 遍历所有样式属性
        for (let i = 0; i < computed.length; i++) {
            const prop = computed[i];
            
            // 跳过忽略的属性
            if (ignoredProperties.has(prop)) continue;
            
            const value = computed.getPropertyValue(prop);
            
            // 跳过空值和初始值
            if (!value || value === 'none' || value === 'auto' || value === 'normal') continue;
            
            // 跳过默认的字体和颜色（可能来自继承）
            if (prop === 'color' && value === 'rgb(0, 0, 0)') continue;
            
            styles[prop] = value;
        }
        
        return styles;
    }
    
    // 🆕 获取元素相对于父元素的差异样式（减少冗余）
    function getStyleDifferences(element, parentElement) {
        const elementStyles = window.getComputedStyle(element);
        const parentStyles = parentElement ? window.getComputedStyle(parentElement) : null;
        const differences = {};
        
        // 遍历元素的样式
        for (let i = 0; i < elementStyles.length; i++) {
            const prop = elementStyles[i];
            
            // 跳过忽略的属性
            if (ignoredProperties.has(prop)) continue;
            
            const value = elementStyles.getPropertyValue(prop);
            
            // 跳过空值和初始值
            if (!value || value === 'none' || value === 'auto' || value === 'normal') continue;
            
            // 如果有父元素，比较差异
            if (parentStyles && (inheritableProperties.has(prop) || prop.startsWith('--'))) {
                const parentValue = parentStyles.getPropertyValue(prop);
                // 继承属性：只有与父元素不同时才保留
                if (value === parentValue) {
                    continue; // 跳过相同的继承属性
                }
            }
            
            differences[prop] = value;
        }
        
        return differences;
    }
    
    // 获取有效的（非默认的）样式
    function getEffectiveStyles(element) {
        const computed = getComputedStyles(element);
        const effective = {};
        
        // 只保留看起来被设置过的样式
        const importantProps = [
            // 布局（position 非常重要，必须保留！）
            'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear',
            'visibility', 'vertical-align', 
            
            // 盒模型
            'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height', 
            'box-sizing', 'aspect-ratio',
            
            // 间距
            'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
            'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
            
            // 边框
            'border', 'border-width', 'border-style', 'border-color', 'border-radius',
            'border-top', 'border-right', 'border-bottom', 'border-left',
            'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
            'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
            'outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset',
            
            // 背景
            'background', 'background-color', 'background-image', 'background-size', 'background-position',
            'background-repeat', 'background-attachment', 'background-clip', 'background-origin',
            
            // 文字
            'color', 'font-size', 'font-weight', 'font-family', 'line-height', 'text-align',
            'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
            'text-transform', 'text-indent', 'text-overflow', 
            'letter-spacing', 'word-spacing', 'white-space', 'word-wrap', 'word-break',
            'writing-mode', 'direction',
            
            // Flexbox
            'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'flex-flow',
            'justify-content', 'align-items', 'align-content', 'align-self',
            'order', 'place-items', 'place-content', 'place-self',
            'gap', 'row-gap', 'column-gap',
            
            // Grid
            'grid', 'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
            'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
            'grid-gap', 'grid-row-gap', 'grid-column-gap',
            'grid-column', 'grid-column-start', 'grid-column-end',
            'grid-row', 'grid-row-start', 'grid-row-end',
            'grid-area',
            
            // 效果
            'opacity', 'transform', 'transform-origin', 'transform-style',
            'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
            'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay',
            'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state',
            'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
            
            // 溢出和滚动
            'overflow', 'overflow-x', 'overflow-y', 'overscroll-behavior',
            
            // 裁剪和遮罩
            'clip', 'clip-path', 'mask', 'mask-image',
            
            // 对象适配
            'object-fit', 'object-position',
            
            // 列表
            'list-style', 'list-style-type', 'list-style-position', 'list-style-image',
            
            // 表格
            'border-collapse', 'border-spacing', 'table-layout', 'caption-side', 'empty-cells',
            
            // 用户交互
            'cursor', 'pointer-events', 'user-select', 'resize', 'touch-action',
            
            // 混合模式
            'mix-blend-mode', 'isolation',
            
            // 内容
            'content', 'quotes',
            
            // 其他
            'will-change', 'contain'
        ];
        
        importantProps.forEach(prop => {
            if (computed[prop] && computed[prop] !== 'none' && computed[prop] !== 'auto' && computed[prop] !== 'normal') {
                effective[prop] = computed[prop];
            }
        });
        
        // 🔧 特殊处理：position 属性必须保留（即使是 static）
        // 因为它影响子元素的 absolute 定位参考
        if (computed['position']) {
            effective['position'] = computed['position'];
        }
        
        // 🔧 特殊处理：合并 row-gap 和 column-gap 为 gap
        if (effective['row-gap'] && effective['column-gap']) {
            if (effective['row-gap'] === effective['column-gap']) {
                // 如果两者相同，使用简写形式
                effective['gap'] = effective['row-gap'];
                delete effective['row-gap'];
                delete effective['column-gap'];
            } else {
                // 如果不同，使用完整形式 gap: row column
                effective['gap'] = `${effective['row-gap']} ${effective['column-gap']}`;
                delete effective['row-gap'];
                delete effective['column-gap'];
            }
        } else if (effective['row-gap'] && effective['row-gap'] !== '0px') {
            // 只有 row-gap
            effective['gap'] = effective['row-gap'];
            delete effective['row-gap'];
        } else if (effective['column-gap'] && effective['column-gap'] !== '0px') {
            // 只有 column-gap
            effective['gap'] = effective['column-gap'];
            delete effective['column-gap'];
        }
        
        // 保留所有自定义属性（CSS变量以 -- 开头），这些通常承载主题色等关键信息
        for (let i = 0; i < computed.length; i++) {
            const prop = computed[i];
            if (prop && prop.startsWith('--')) {
                const value = computed.getPropertyValue(prop);
                if (value && value !== 'initial' && value !== 'unset') {
                    effective[prop] = value.trim();
                }
            }
        }
        
        return effective;
    }
    
    // 从样式表中提取匹配元素的CSS规则（包括属性选择器）
    function extractMatchingRules(element) {
        const matchedRules = [];
        
        try {
            // 遍历所有样式表
            Array.from(document.styleSheets).forEach(sheet => {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) return;
                    
                    Array.from(rules).forEach(rule => {
                        // 只处理样式规则
                        if (rule instanceof CSSStyleRule) {
                            try {
                                // 检查选择器是否匹配当前元素
                                if (element.matches(rule.selectorText)) {
                                    // 提取该规则的样式
                                    const styles = {};
                                    for (let i = 0; i < rule.style.length; i++) {
                                        const prop = rule.style[i];
                                        const value = rule.style.getPropertyValue(prop);
                                        if (value) {
                                            styles[prop] = value;
                                        }
                                    }
                                    
                                    if (Object.keys(styles).length > 0) {
                                        matchedRules.push({
                                            selector: rule.selectorText,
                                            styles: styles,
                                            specificity: getSpecificity(rule.selectorText)
                                        });
                                    }
                                }
                            } catch (e) {
                                // 某些选择器可能无效或无法使用 matches()
                            }
                        }
                    });
                } catch (e) {
                    // 跨域样式表可能无法访问
                }
            });
        } catch (e) {
            console.warn('提取匹配规则时出错:', e);
        }
        
        return matchedRules;
    }
    
    // 计算CSS选择器的特异性（简化版）
    function getSpecificity(selector) {
        let specificity = 0;
        // ID选择器权重 100
        specificity += (selector.match(/#/g) || []).length * 100;
        // 类选择器、属性选择器权重 10
        specificity += (selector.match(/\.|(\[[\w-]+\])/g) || []).length * 10;
        // 标签选择器权重 1
        specificity += (selector.match(/^[a-z]+|[ >+~][a-z]+/gi) || []).length;
        return specificity;
    }
    
    // 格式化 CSS
    function formatCSS(styles, selector = '.cloned-element') {
        if (Object.keys(styles).length === 0) return '';
        
        let css = `${selector} {\n`;
        
        // 按类型分组
        const groups = {
            layout: ['display', 'position', 'top', 'right', 'bottom', 'left', 'z-index', 'float', 'clear', 'visibility', 'vertical-align'],
            box: ['width', 'height', 'max-width', 'max-height', 'min-width', 'min-height', 'box-sizing', 'aspect-ratio', 'object-fit', 'object-position'],
            spacing: ['padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 
                     'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 
                     'gap', 'row-gap', 'column-gap'],
            border: ['border', 'border-width', 'border-style', 'border-color', 'border-radius',
                    'border-top', 'border-right', 'border-bottom', 'border-left',
                    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
                    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
                    'outline', 'outline-width', 'outline-style', 'outline-color', 'outline-offset'],
            background: ['background', 'background-color', 'background-image', 'background-size', 'background-position', 
                        'background-repeat', 'background-attachment', 'background-clip', 'background-origin'],
            text: ['color', 'font-size', 'font-weight', 'font-family', 'line-height', 'text-align',
                  'text-decoration', 'text-decoration-line', 'text-decoration-color', 'text-decoration-style',
                  'text-transform', 'text-indent', 'text-overflow',
                  'letter-spacing', 'word-spacing', 'white-space', 'word-wrap', 'word-break',
                  'writing-mode', 'direction'],
            flex: ['flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'flex-flow',
                  'justify-content', 'align-items', 'align-content', 'align-self',
                  'order', 'place-items', 'place-content', 'place-self'],
            grid: ['grid', 'grid-template', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
                  'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
                  'grid-gap', 'grid-row-gap', 'grid-column-gap',
                  'grid-column', 'grid-column-start', 'grid-column-end',
                  'grid-row', 'grid-row-start', 'grid-row-end', 'grid-area'],
            effects: ['opacity', 'transform', 'transform-origin', 'transform-style',
                     'transition', 'transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay',
                     'animation', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay',
                     'animation-iteration-count', 'animation-direction', 'animation-fill-mode', 'animation-play-state',
                     'box-shadow', 'text-shadow', 'filter', 'backdrop-filter',
                     'mix-blend-mode', 'isolation'],
            overflow: ['overflow', 'overflow-x', 'overflow-y', 'overscroll-behavior'],
            list: ['list-style', 'list-style-type', 'list-style-position', 'list-style-image'],
            table: ['border-collapse', 'border-spacing', 'table-layout', 'caption-side', 'empty-cells'],
            interaction: ['cursor', 'pointer-events', 'user-select', 'resize', 'touch-action'],
            advanced: ['clip', 'clip-path', 'mask', 'mask-image', 'content', 'quotes', 'will-change', 'contain'],
            other: []
        };
        
        const categorized = {};
        const uncategorized = [];
        
        Object.entries(styles).forEach(([prop, value]) => {
            let found = false;
            for (const [category, props] of Object.entries(groups)) {
                if (props.includes(prop)) {
                    if (!categorized[category]) categorized[category] = [];
                    categorized[category].push([prop, value]);
                    found = true;
                    break;
                }
            }
            if (!found) {
                uncategorized.push([prop, value]);
            }
        });
        
        // 按分组输出
        ['layout', 'box', 'spacing', 'border', 'background', 'text', 'flex', 'grid', 'effects', 'overflow', 'list', 'table', 'interaction', 'advanced'].forEach(category => {
            if (categorized[category] && categorized[category].length > 0) {
                css += `  /* ${category.toUpperCase()} */\n`;
                categorized[category].forEach(([prop, value]) => {
                    css += `  ${prop}: ${value};\n`;
                });
                css += '\n';
            }
        });
        
        // 其他属性
        if (uncategorized.length > 0) {
            css += `  /* OTHER */\n`;
            uncategorized.forEach(([prop, value]) => {
                css += `  ${prop}: ${value};\n`;
            });
        }
        
        css += '}\n';
        return css;
    }
    
    // 安全转义 CSS 选择器片段（兼容 Tailwind 这种带特殊字符的类名）
    function escapeCSSIdentifier(value) {
        if (!value) return value;
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(value);
        }
        // fallback：手动给特殊字符加反斜杠
        return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    }
    
    // 获取元素的选择器路径（包括data属性）
    function getSelector(element, includeAttributes = false) {
        let selector = '';
        
        if (element.id) {
            selector = `#${escapeCSSIdentifier(element.id)}`;
        } else if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).filter(c => c);
            if (classes.length > 0) {
                const escapedClasses = classes.map(escapeCSSIdentifier);
                selector = `.${escapedClasses.join('.')}`;
            }
        } else {
            selector = element.tagName.toLowerCase();
        }
        
        // 如果需要，添加data属性选择器（如 [data-v-xxxxx]）
        if (includeAttributes) {
            const dataAttrs = [];
            for (let attr of element.attributes) {
                if (attr.name.startsWith('data-v-')) {
                    dataAttrs.push(`[${attr.name}]`);
                }
            }
            if (dataAttrs.length > 0) {
                selector += dataAttrs.join('');
            }
        }
        
        return selector;
    }
    
    // ============================================
    // 资源路径处理函数
    // ============================================
    
    // 将相对URL转换为绝对URL
    function convertToAbsoluteURL(url, baseURL = window.location.href) {
        if (!url) return url;
        
        // 已经是绝对URL
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
            return url;
        }
        
        // Data URL
        if (url.startsWith('data:')) {
            return url;
        }
        
        // Blob URL
        if (url.startsWith('blob:')) {
            return url;
        }
        
        try {
            return new URL(url, baseURL).href;
        } catch (e) {
            console.warn('URL转换失败:', url, e);
            return url;
        }
    }
    
    // 处理HTML中的图片元素
    function processImageElements(htmlString, originalElement) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        
        // 处理 img 标签
        const images = tempDiv.querySelectorAll('img');
        const originalImages = originalElement ? originalElement.querySelectorAll('img') : [];
        
        images.forEach((img, index) => {
            // 处理 src
            if (img.hasAttribute('src')) {
                const src = img.getAttribute('src');
                img.setAttribute('src', convertToAbsoluteURL(src));
            }
            
            // 处理 srcset
            if (img.hasAttribute('srcset')) {
                const srcset = img.getAttribute('srcset');
                const newSrcset = srcset.split(',').map(part => {
                    const [url, descriptor] = part.trim().split(/\s+/);
                    return `${convertToAbsoluteURL(url)}${descriptor ? ' ' + descriptor : ''}`;
                }).join(', ');
                img.setAttribute('srcset', newSrcset);
            }
            
            // 确保保留图片尺寸
            const originalImg = originalImages[index];
            if (originalImg) {
                const computed = window.getComputedStyle(originalImg);
                
                // 如果没有明确的 width/height 属性，添加计算后的尺寸
                if (!img.hasAttribute('width') && computed.width && computed.width !== 'auto' && computed.width !== '0px') {
                    // 移除单位 (px, em, rem 等)，HTML width/height 属性只接受数字
                    const widthValue = parseFloat(computed.width);
                    if (!isNaN(widthValue) && widthValue > 0) {
                        img.setAttribute('width', Math.round(widthValue).toString());
                    }
                }
                if (!img.hasAttribute('height') && computed.height && computed.height !== 'auto' && computed.height !== '0px') {
                    // 移除单位 (px, em, rem 等)，HTML height/height 属性只接受数字
                    const heightValue = parseFloat(computed.height);
                    if (!isNaN(heightValue) && heightValue > 0) {
                        img.setAttribute('height', Math.round(heightValue).toString());
                    }
                }
                
                // 🆕 智能添加 style 属性（防止覆盖布局约束）
                // 检查是否有布局约束（max-width, max-height 等）
                const hasMaxWidth = computed.maxWidth && computed.maxWidth !== 'none';
                const hasMaxHeight = computed.maxHeight && computed.maxHeight !== 'none';
                const hasMinWidth = computed.minWidth && computed.minWidth !== '0px' && computed.minWidth !== 'auto';
                const hasMinHeight = computed.minHeight && computed.minHeight !== '0px' && computed.minHeight !== 'auto';
                const hasFlexSizing = computed.flexBasis && computed.flexBasis !== 'auto';
                
                // 🆕 检查是否是绝对定位 + 四边定位
                const isAbsolute = computed.position === 'absolute' || computed.position === 'fixed';
                const hasTopBottom = computed.top !== 'auto' && computed.bottom !== 'auto';
                const hasLeftRight = computed.left !== 'auto' && computed.right !== 'auto';
                const hasInset = (hasTopBottom || hasLeftRight);
                
                // 🆕 检查父容器是否是 Grid 布局
                const parentComputed = originalImg.parentElement ? window.getComputedStyle(originalImg.parentElement) : null;
                const parentIsGrid = parentComputed && parentComputed.display.includes('grid');
                
                // 🆕 Grid 布局中的绝对定位元素特殊处理
                // 在 Grid 中，即使是 absolute + inset，也需要 width: 100% / height: 100%
                const isGridAbsolute = isAbsolute && parentIsGrid && hasInset;
                
                const inlineStyles = [];
                
                // 处理尺寸：
                // 1. 如果有 max-width/max-height 约束，保留约束而不是固定尺寸
                // 2. 如果是普通的 absolute + inset（非 Grid），不需要 width/height
                // 3. 如果是 Grid 中的 absolute + inset，需要保留 width/height
                // 4. 其他情况，保留计算后的尺寸
                
                const shouldAddSize = !hasMaxWidth && !hasMaxHeight && !hasFlexSizing && (!isAbsolute || isGridAbsolute);
                
                if (shouldAddSize) {
                    if (computed.width && computed.width !== 'auto' && computed.width !== '0px') {
                        inlineStyles.push(`width: ${computed.width}`);
                    }
                    if (computed.height && computed.height !== 'auto' && computed.height !== '0px') {
                        inlineStyles.push(`height: ${computed.height}`);
                    }
                }
                
                // 保留重要的约束属性（不包括 auto 值）
                if (hasMaxWidth) {
                    inlineStyles.push(`max-width: ${computed.maxWidth}`);
                }
                if (hasMaxHeight) {
                    inlineStyles.push(`max-height: ${computed.maxHeight}`);
                }
                if (hasMinWidth) {
                    inlineStyles.push(`min-width: ${computed.minWidth}`);
                }
                if (hasMinHeight) {
                    inlineStyles.push(`min-height: ${computed.minHeight}`);
                }
                
                // 🆕 保留 position 和定位值（用于 absolute/fixed 定位）
                if (isAbsolute) {
                    inlineStyles.push(`position: ${computed.position}`);
                    
                    // 使用 inset 简写（如果所有边都设置了）
                    if (computed.top !== 'auto' && computed.right !== 'auto' && 
                        computed.bottom !== 'auto' && computed.left !== 'auto') {
                        // 所有边都设置了，使用 inset
                        if (computed.top === computed.right && computed.right === computed.bottom && computed.bottom === computed.left) {
                            // 四边相同
                            inlineStyles.push(`inset: ${computed.top}`);
                        } else if (computed.top === computed.bottom && computed.left === computed.right) {
                            // 上下相同，左右相同
                            inlineStyles.push(`inset: ${computed.top} ${computed.right}`);
                        } else {
                            // 完整形式
                            inlineStyles.push(`inset: ${computed.top} ${computed.right} ${computed.bottom} ${computed.left}`);
                        }
                    } else {
                        // 不是所有边都设置，单独添加
                        if (computed.top !== 'auto') inlineStyles.push(`top: ${computed.top}`);
                        if (computed.right !== 'auto') inlineStyles.push(`right: ${computed.right}`);
                        if (computed.bottom !== 'auto') inlineStyles.push(`bottom: ${computed.bottom}`);
                        if (computed.left !== 'auto') inlineStyles.push(`left: ${computed.left}`);
                    }
                }
                
                // 保留 object-fit 属性（防止图片变形）
                if (computed.objectFit && computed.objectFit !== 'fill') {
                    inlineStyles.push(`object-fit: ${computed.objectFit}`);
                }
                // 保留 object-position 属性
                if (computed.objectPosition && computed.objectPosition !== '50% 50%') {
                    inlineStyles.push(`object-position: ${computed.objectPosition}`);
                }
                
                if (inlineStyles.length > 0) {
                    const existingStyle = img.getAttribute('style') || '';
                    const newStyle = existingStyle ? `${existingStyle}; ${inlineStyles.join('; ')}` : inlineStyles.join('; ');
                    img.setAttribute('style', newStyle);
                }
            }
            
            // 添加 crossorigin 属性（如果需要）
            if (!img.hasAttribute('crossorigin')) {
                img.setAttribute('crossorigin', 'anonymous');
            }
        });
        
        // 处理 picture > source 标签
        const sources = tempDiv.querySelectorAll('source');
        sources.forEach(source => {
            if (source.hasAttribute('srcset')) {
                const srcset = source.getAttribute('srcset');
                const newSrcset = srcset.split(',').map(part => {
                    const [url, descriptor] = part.trim().split(/\s+/);
                    return `${convertToAbsoluteURL(url)}${descriptor ? ' ' + descriptor : ''}`;
                }).join(', ');
                source.setAttribute('srcset', newSrcset);
            }
        });
        
        // 处理 video 标签
        const videos = tempDiv.querySelectorAll('video');
        videos.forEach(video => {
            if (video.hasAttribute('src')) {
                video.setAttribute('src', convertToAbsoluteURL(video.getAttribute('src')));
            }
            if (video.hasAttribute('poster')) {
                video.setAttribute('poster', convertToAbsoluteURL(video.getAttribute('poster')));
            }
        });
        
        // 处理 video > source 标签
        const videoSources = tempDiv.querySelectorAll('video source');
        videoSources.forEach(source => {
            if (source.hasAttribute('src')) {
                source.setAttribute('src', convertToAbsoluteURL(source.getAttribute('src')));
            }
        });
        
        // 处理 link 标签（图标等）
        const links = tempDiv.querySelectorAll('link[href]');
        links.forEach(link => {
            const rel = link.getAttribute('rel');
            if (rel && (rel.includes('icon') || rel.includes('stylesheet'))) {
                link.setAttribute('href', convertToAbsoluteURL(link.getAttribute('href')));
            }
        });
        
        return tempDiv.innerHTML;
    }
    
    // 处理SVG元素
    function processSVGElements(htmlString, originalElement) {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlString;
        
        // 处理 SVG 元素尺寸（确保保留宽高）
        const svgs = tempDiv.querySelectorAll('svg');
        svgs.forEach((svgClone, index) => {
            // 从原始元素中找到对应的 SVG
            const originalSVGs = originalElement.querySelectorAll('svg');
            const originalSVG = originalSVGs[index];
            
            if (originalSVG) {
                const computed = window.getComputedStyle(originalSVG);
                
                // 如果 SVG 没有明确的 width/height 属性，添加计算后的尺寸
                if (!svgClone.hasAttribute('width') && computed.width && computed.width !== 'auto' && computed.width !== '0px') {
                    // SVG 的 width/height 属性可以接受带单位的值，但为了兼容性，也可以只使用数字
                    const widthValue = parseFloat(computed.width);
                    if (!isNaN(widthValue) && widthValue > 0) {
                        // SVG 可以使用带单位的值或纯数字，这里使用带单位的更安全
                        svgClone.setAttribute('width', computed.width);
                    }
                }
                if (!svgClone.hasAttribute('height') && computed.height && computed.height !== 'auto' && computed.height !== '0px') {
                    const heightValue = parseFloat(computed.height);
                    if (!isNaN(heightValue) && heightValue > 0) {
                        svgClone.setAttribute('height', computed.height);
                    }
                }
                
                // 🆕 智能添加 style 属性（防止覆盖布局约束）
                const hasMaxWidth = computed.maxWidth && computed.maxWidth !== 'none';
                const hasMaxHeight = computed.maxHeight && computed.maxHeight !== 'none';
                const hasMinWidth = computed.minWidth && computed.minWidth !== '0px' && computed.minWidth !== 'auto';
                const hasMinHeight = computed.minHeight && computed.minHeight !== '0px' && computed.minHeight !== 'auto';
                const hasFlexSizing = computed.flexBasis && computed.flexBasis !== 'auto';
                
                // 🆕 检查是否是绝对定位 + 四边定位
                const isAbsolute = computed.position === 'absolute' || computed.position === 'fixed';
                const hasTopBottom = computed.top !== 'auto' && computed.bottom !== 'auto';
                const hasLeftRight = computed.left !== 'auto' && computed.right !== 'auto';
                const hasInset = (hasTopBottom || hasLeftRight);
                
                // 🆕 检查父容器是否是 Grid 布局
                const parentComputed = originalSVG.parentElement ? window.getComputedStyle(originalSVG.parentElement) : null;
                const parentIsGrid = parentComputed && parentComputed.display.includes('grid');
                
                // 🆕 Grid 布局中的绝对定位元素特殊处理
                const isGridAbsolute = isAbsolute && parentIsGrid && hasInset;
                
                const inlineStyles = [];
                
                // 处理尺寸（与图片相同的逻辑）
                const shouldAddSize = !hasMaxWidth && !hasMaxHeight && !hasFlexSizing && (!isAbsolute || isGridAbsolute);
                
                if (shouldAddSize) {
                    if (computed.width && computed.width !== 'auto' && computed.width !== '0px') {
                        inlineStyles.push(`width: ${computed.width}`);
                    }
                    if (computed.height && computed.height !== 'auto' && computed.height !== '0px') {
                        inlineStyles.push(`height: ${computed.height}`);
                    }
                }
                
                // 保留重要的约束属性（不包括 auto 值）
                if (hasMaxWidth) {
                    inlineStyles.push(`max-width: ${computed.maxWidth}`);
                }
                if (hasMaxHeight) {
                    inlineStyles.push(`max-height: ${computed.maxHeight}`);
                }
                if (hasMinWidth) {
                    inlineStyles.push(`min-width: ${computed.minWidth}`);
                }
                if (hasMinHeight) {
                    inlineStyles.push(`min-height: ${computed.minHeight}`);
                }
                
                // 🆕 保留 position 和定位值（用于 absolute/fixed 定位）
                if (isAbsolute) {
                    inlineStyles.push(`position: ${computed.position}`);
                    
                    // 使用 inset 简写（如果所有边都设置了）
                    if (computed.top !== 'auto' && computed.right !== 'auto' && 
                        computed.bottom !== 'auto' && computed.left !== 'auto') {
                        if (computed.top === computed.right && computed.right === computed.bottom && computed.bottom === computed.left) {
                            inlineStyles.push(`inset: ${computed.top}`);
                        } else if (computed.top === computed.bottom && computed.left === computed.right) {
                            inlineStyles.push(`inset: ${computed.top} ${computed.right}`);
                        } else {
                            inlineStyles.push(`inset: ${computed.top} ${computed.right} ${computed.bottom} ${computed.left}`);
                        }
                    } else {
                        if (computed.top !== 'auto') inlineStyles.push(`top: ${computed.top}`);
                        if (computed.right !== 'auto') inlineStyles.push(`right: ${computed.right}`);
                        if (computed.bottom !== 'auto') inlineStyles.push(`bottom: ${computed.bottom}`);
                        if (computed.left !== 'auto') inlineStyles.push(`left: ${computed.left}`);
                    }
                }
                
                // 保留 display 属性（SVG 有时是 inline-block）
                if (computed.display && computed.display !== 'inline') {
                    inlineStyles.push(`display: ${computed.display}`);
                }
                
                if (inlineStyles.length > 0) {
                    const existingStyle = svgClone.getAttribute('style') || '';
                    const newStyle = existingStyle ? `${existingStyle}; ${inlineStyles.join('; ')}` : inlineStyles.join('; ');
                    svgClone.setAttribute('style', newStyle);
                }
                
                // 确保 viewBox 存在（如果原始有的话）
                if (originalSVG.hasAttribute('viewBox') && !svgClone.hasAttribute('viewBox')) {
                    svgClone.setAttribute('viewBox', originalSVG.getAttribute('viewBox'));
                }
            }
        });
        
        // 处理 SVG 中的 image 标签
        const svgImages = tempDiv.querySelectorAll('svg image');
        svgImages.forEach(img => {
            if (img.hasAttribute('href')) {
                img.setAttribute('href', convertToAbsoluteURL(img.getAttribute('href')));
            }
            if (img.hasAttribute('xlink:href')) {
                img.setAttribute('xlink:href', convertToAbsoluteURL(img.getAttribute('xlink:href')));
            }
        });
        
        // 处理 SVG use 标签
        const uses = tempDiv.querySelectorAll('use');
        uses.forEach(use => {
            if (use.hasAttribute('href')) {
                const href = use.getAttribute('href');
                if (!href.startsWith('#')) {
                    use.setAttribute('href', convertToAbsoluteURL(href));
                }
            }
            if (use.hasAttribute('xlink:href')) {
                const href = use.getAttribute('xlink:href');
                if (!href.startsWith('#')) {
                    use.setAttribute('xlink:href', convertToAbsoluteURL(href));
                }
            }
        });
        
        return tempDiv.innerHTML;
    }
    
    // 处理CSS中的URL（背景图片、字体等）
    function processCSS_URLs(cssText) {
        // 匹配 url() 中的路径
        return cssText.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (match, url) => {
            // 跳过 data: 和绝对路径
            if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
                return match;
            }
            
            const absoluteURL = convertToAbsoluteURL(url);
            return `url('${absoluteURL}')`;
        });
    }
    
    // 提取页面中使用的字体
    function extractUsedFonts(element) {
        const fonts = new Set();
        const fontInfo = [];
        
        // 获取元素及其子元素的所有字体
        function collectFonts(el) {
            const computed = window.getComputedStyle(el);
            const fontFamily = computed.getPropertyValue('font-family');
            
            if (fontFamily && fontFamily !== 'inherit') {
                // 解析字体族（可能包含多个字体）
                const families = fontFamily.split(',').map(f => f.trim().replace(/['"]/g, ''));
                families.forEach(family => {
                    if (family && !fonts.has(family)) {
                        fonts.add(family);
                        
                        // 尝试获取字体信息
                        const fontWeight = computed.getPropertyValue('font-weight');
                        const fontStyle = computed.getPropertyValue('font-style');
                        
                        fontInfo.push({
                            family: family,
                            weight: fontWeight,
                            style: fontStyle
                        });
                    }
                });
            }
            
            // 递归处理子元素
            Array.from(el.children).forEach(child => collectFonts(child));
        }
        
        collectFonts(element);
        
        return { fonts: Array.from(fonts), fontInfo };
    }
    
    // 提取 @font-face 规则
    function extractFontFaceRules(fontsUsed) {
        const fontFaces = [];
        
        try {
            // 遍历所有样式表
            Array.from(document.styleSheets).forEach(sheet => {
                try {
                    const rules = sheet.cssRules || sheet.rules;
                    if (!rules) return;
                    
                    Array.from(rules).forEach(rule => {
                        if (rule instanceof CSSFontFaceRule) {
                            const fontFamily = rule.style.getPropertyValue('font-family').replace(/['"]/g, '');
                            
                            // 只提取当前使用的字体
                            if (fontsUsed.includes(fontFamily) || fontsUsed.length === 0) {
                                let fontFaceText = rule.cssText;
                                
                                // 处理字体文件的URL
                                fontFaceText = processCSS_URLs(fontFaceText);
                                
                                fontFaces.push(fontFaceText);
                            }
                        }
                    });
                } catch (e) {
                    // 跨域样式表可能无法访问
                    console.warn('无法访问样式表:', sheet.href, e.message);
                }
            });
        } catch (e) {
            console.warn('提取字体规则时出错:', e);
        }
        
        return fontFaces;
    }
    
    // 提取完整的克隆数据（包括子元素）
    function extractCloneData(element, includeChildren = true) {
        const data = {
            html: element.outerHTML,
            css: '',
            selector: getSelector(element),
            children: [],
            resources: {
                images: 0,
                svgs: 0,
                fonts: [],
                hasBackgroundImage: false
            }
        };
        
        // ============================================
        // 1. 处理 HTML 中的资源路径
        // ============================================
        
        // 处理图片路径（img, srcset, video 等）并保留尺寸
        data.html = processImageElements(data.html, element);
        
        // 处理 SVG 元素（传入原始元素以获取尺寸）
        data.html = processSVGElements(data.html, element);
        
        // 统计资源
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = data.html;
        data.resources.images = tempDiv.querySelectorAll('img').length;
        data.resources.svgs = tempDiv.querySelectorAll('svg').length;
        
        // ============================================
        // 2. 提取字体信息
        // ============================================
        
        const fontData = extractUsedFonts(element);
        data.resources.fonts = fontData.fonts;
        
        // ============================================
        // 3. 提取和处理 CSS 样式
        // ============================================
        
        // 🆕 从样式表中提取匹配的规则（包括属性选择器，如 [data-v-xxxxx]）
        const matchedRules = extractMatchingRules(element);
        let rulesCSS = '';
        
        if (matchedRules.length > 0) {
            // 按特异性排序
            matchedRules.sort((a, b) => a.specificity - b.specificity);
            
            // 格式化规则
            matchedRules.forEach(rule => {
                let ruleCSS = formatCSS(rule.styles, rule.selector);
                ruleCSS = processCSS_URLs(ruleCSS);
                rulesCSS += ruleCSS + '\n';
                
                // 检查背景图片
                if (rule.styles['background-image'] && rule.styles['background-image'] !== 'none') {
                    data.resources.hasBackgroundImage = true;
                }
            });
        }
        
        // 主元素样式（computed styles）
        const mainStyles = getEffectiveStyles(element);
        
        // 检查是否有背景图片
        if (mainStyles['background-image'] && mainStyles['background-image'] !== 'none') {
            data.resources.hasBackgroundImage = true;
        }
        
        // 格式化主元素CSS
        let mainCSS = formatCSS(mainStyles, data.selector);
        
        // 处理CSS中的URL（背景图片、字体等）
        mainCSS = processCSS_URLs(mainCSS);
        
        // 🆕 合并样式表规则和计算样式
        // 优先使用样式表规则（保留原始选择器），然后补充计算样式
        if (rulesCSS) {
            data.css = '/* Matched CSS Rules from Stylesheets */\n' + rulesCSS + '\n/* Computed Styles */\n' + mainCSS;
        } else {
            data.css = mainCSS;
        }
        
        // ============================================
        // 4. 处理子元素样式（使用差异比较减少冗余）
        // ============================================
        
        if (includeChildren && element.children.length > 0) {
            const childrenCSS = [];
            const MAX_CHILD_DEPTH = 6;
            const MAX_CHILD_COUNT = 500;
            let processedChildren = 0;
            
            function traverseChildren(parent, depth = 1, parentSelector = data.selector) {
                if (depth > MAX_CHILD_DEPTH || processedChildren >= MAX_CHILD_COUNT) return; // 限制深度与数量
                
                Array.from(parent.children).forEach(child => {
                    if (processedChildren >= MAX_CHILD_COUNT) return;
                    const childSelector = `${parentSelector} > ${getSelector(child)}`;
                    
                    // 🆕 从样式表提取匹配子元素的规则
                    const childMatchedRules = extractMatchingRules(child);
                    
                    if (childMatchedRules.length > 0) {
                        // 按特异性排序
                        childMatchedRules.sort((a, b) => a.specificity - b.specificity);
                        
                        // 格式化规则
                        childMatchedRules.forEach(rule => {
                            let ruleCSS = formatCSS(rule.styles, rule.selector);
                            ruleCSS = processCSS_URLs(ruleCSS);
                            childrenCSS.push(ruleCSS);
                            
                            // 检查背景图片
                            if (rule.styles['background-image'] && rule.styles['background-image'] !== 'none') {
                                data.resources.hasBackgroundImage = true;
                            }
                        });
                    }
                    
                    // 🆕 使用差异比较：只提取与父元素不同的样式
                    const allChildStyles = getStyleDifferences(child, parent);
                    const childStyles = {};
                    
                    // 只保留重要的属性
                    const importantProps = [
                        'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
                        'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
                        'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
                        'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
                        'border', 'border-radius', 'background', 'background-color', 'background-image',
                        'color', 'font-size', 'font-weight', 'line-height', 'text-align',
                        'flex', 'flex-direction', 'gap', 'justify-content', 'align-items',
                        'grid', 'grid-template-columns', 'opacity', 'transform', 'transition',
                        'box-shadow', 'overflow'
                    ];
                    
                    importantProps.forEach(prop => {
                        if (allChildStyles[prop] && allChildStyles[prop] !== 'none' && allChildStyles[prop] !== 'auto') {
                            childStyles[prop] = allChildStyles[prop];
                        }
                    });
                    
                    // 自定义属性也需要保留，否则依赖 var() 的子元素会丢失主题变量
                    Object.keys(allChildStyles).forEach(prop => {
                        if (prop.startsWith('--') && allChildStyles[prop]) {
                            childStyles[prop] = allChildStyles[prop];
                        }
                    });
                    
                    // 检查子元素的背景图片
                    if (childStyles['background-image'] && childStyles['background-image'] !== 'none') {
                        data.resources.hasBackgroundImage = true;
                    }
                    
                    // 只有当子元素有独特样式时才输出
                    if (Object.keys(childStyles).length > 0) {
                        let childCSS = formatCSS(childStyles, childSelector);
                        // 处理子元素CSS中的URL
                        childCSS = processCSS_URLs(childCSS);
                        childrenCSS.push(childCSS);
                    }
                    
                    // 递归处理子元素
                    processedChildren++;
                    
                    if (child.children.length > 0 && depth < MAX_CHILD_DEPTH) {
                        traverseChildren(child, depth + 1, childSelector);
                    }
                });
            }
            
            traverseChildren(element);
            
            if (childrenCSS.length > 0) {
                data.css += '\n/* CHILDREN STYLES (optimized) */\n' + childrenCSS.join('\n');
            }
        }
        
        // ============================================
        // 5. 提取字体定义
        // ============================================
        
        if (data.resources.fonts.length > 0) {
            const fontFaces = extractFontFaceRules(data.resources.fonts);
            
            if (fontFaces.length > 0) {
                const fontFaceCSS = '\n/* FONT FACES */\n' + fontFaces.join('\n\n');
                // 字体定义放在最前面
                data.css = fontFaceCSS + '\n' + data.css;
            }
        }
        
        return data;
    }
    
    // 复制到剪贴板
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.error('复制失败:', err);
            return false;
        }
    }
    
    // 高亮元素
    function highlightElement(element) {
        // 如果是同一个元素，不需要重复处理
        if (currentHighlighted === element) {
            return;
        }
        
        // 先移除之前的高亮
        if (currentHighlighted) {
            removeHighlight(currentHighlighted);
        }
        
        // 如果元素已经被高亮过（防止重复），先清理
        if (element._originalStyles) {
            delete element._originalStyles;
        }
        
        // 保存原始样式
        const originalStyles = {};
        Object.keys(highlightStyle).forEach(prop => {
            // 使用 getPropertyValue 获取计算后的样式，而不是内联样式
            originalStyles[prop] = element.style.getPropertyValue(prop) || '';
            element.style.setProperty(prop, highlightStyle[prop], 'important');
        });
        
        // 标记元素（用于追踪和清理）
        element._originalStyles = originalStyles;
        element._isHighlighted = true;
        element.setAttribute('data-clone-highlighted', 'true');
        currentHighlighted = element;
    }
    
    // 移除高亮
    function removeHighlight(element) {
        if (!element) return;
        
        // 检查是否有保存的原始样式
        if (element._originalStyles) {
            Object.entries(element._originalStyles).forEach(([prop, value]) => {
                if (value === '' || value === null) {
                    element.style.removeProperty(prop);
                } else {
                    element.style.setProperty(prop, value);
                }
            });
            delete element._originalStyles;
        }
        
        // 清除所有标记
        if (element._isHighlighted) {
            delete element._isHighlighted;
        }
        
        // 移除 data 属性
        if (element.hasAttribute('data-clone-highlighted')) {
            element.removeAttribute('data-clone-highlighted');
        }
        
        // 如果这是当前高亮的元素，清空引用
        if (currentHighlighted === element) {
            currentHighlighted = null;
        }
    }
    
    // 鼠标移动事件
    function handleMouseOver(e) {
        if (!isActive) return;
        e.stopPropagation();
        highlightElement(e.target);
    }
    
    // 鼠标移出事件
    function handleMouseOut(e) {
        if (!isActive) return;
        e.stopPropagation();
        // 不立即移除，等待点击或移到其他元素
    }
    
    // 点击事件
    async function handleClick(e) {
        if (!isActive) return;
        
        e.preventDefault();
        e.stopPropagation();
        isActive = false;
        
        const element = e.target;
        
        // ⚡️ 立即清除高亮边框，防止移动到其他元素时残留
        if (currentHighlighted) {
            removeHighlight(currentHighlighted);
            currentHighlighted = null;
        }
        
        try {
            console.log('%c━'.repeat(80), 'color: #95a5a6;');
            console.log('%c📦 提取的元素:', 'font-size: 14px; color: #2c3e50; font-weight: bold;');
            console.log(element);
            
            // 提取数据
            console.log('%c⏳ 正在处理资源...', 'color: #f39c12; font-style: italic;');
            const data = extractCloneData(element, true);
            
            // ============================================
            // 显示资源统计信息
            // ============================================
            console.log('\n%c📊 资源统计:', 'font-size: 13px; color: #9b59b6; font-weight: bold;');
            
            const resourceInfo = [];
            if (data.resources.images > 0) {
                resourceInfo.push(`🖼️  图片: ${data.resources.images} 个（已转换为绝对路径）`);
            }
            if (data.resources.svgs > 0) {
                resourceInfo.push(`🎨 SVG: ${data.resources.svgs} 个`);
            }
            if (data.resources.hasBackgroundImage) {
                resourceInfo.push(`🌄 背景图片: 已处理 URL`);
            }
            if (data.resources.fonts.length > 0) {
                resourceInfo.push(`🔤 字体: ${data.resources.fonts.length} 个 (${data.resources.fonts.slice(0, 3).join(', ')}${data.resources.fonts.length > 3 ? '...' : ''})`);
            }
            
            if (resourceInfo.length > 0) {
                console.log('%c' + resourceInfo.join('\n'), 'color: #8e44ad; font-size: 11px; line-height: 1.6;');
            } else {
                console.log('%c无外部资源', 'color: #95a5a6; font-size: 11px;');
            }
            
            // ============================================
            // 输出HTML和CSS
            // ============================================
            
            console.log('\n%c📄 HTML:', 'font-size: 13px; color: #e74c3c; font-weight: bold;');
            console.log(data.html);
            
            console.log('\n%c🎨 CSS:', 'font-size: 13px; color: #3498db; font-weight: bold;');
            console.log(data.css);
            
            // 组合输出为完整的 HTML 文件
            const combined = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>克隆的元素</title>
    <style>
        /* Reset */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.5;
            padding: 20px;
        }
        
        /* Extracted Styles */
${data.css}
    </style>
</head>
<body>
    ${data.html}
</body>
</html>`;
        
            console.log('\n%c📋 完整 HTML 文件（已复制到剪贴板）:', 'font-size: 13px; color: #27ae60; font-weight: bold;');
            console.log('%c' + combined, 'color: #7f8c8d; font-size: 11px;');
            
            // ============================================
            // 显示提示信息
            // ============================================
            
            if (data.resources.images > 0 || data.resources.hasBackgroundImage) {
                console.log('\n%c💡 提示: 图片路径已自动转换为绝对路径', 'color: #3498db; background: #ecf0f1; padding: 5px; border-radius: 3px;');
            }
            
            if (data.resources.fonts.length > 0) {
                console.log('%c💡 提示: 已提取 @font-face 定义（如果有）', 'color: #3498db; background: #ecf0f1; padding: 5px; border-radius: 3px;');
            }
            
            // ============================================
            // 复制到剪贴板
            // ============================================
            
            const copied = await copyToClipboard(combined);
            
            if (copied) {
                console.log('\n%c✅ 已复制到剪贴板！可以直接粘贴到 .html 文件中在浏览器打开', 'font-size: 12px; color: #27ae60; font-weight: bold; background: #d5f4e6; padding: 8px; border-radius: 4px;');
                console.log('%c💡 使用方法: 创建 test.html → 粘贴内容 → 浏览器打开即可', 'font-size: 11px; color: #16a085; font-style: italic;');
                
                // 显示临时提示
                let notificationText = '✅ 完整 HTML 已复制！';
                if (data.resources.images > 0) {
                    notificationText += ` (${data.resources.images} 张图片)`;
                }
                showNotification(notificationText);
            } else {
                console.log('\n%c⚠️ 自动复制失败，请手动复制上面的完整 HTML 内容', 'font-size: 12px; color: #e67e22; font-weight: bold;');
            }
            
            console.log('%c━'.repeat(80), 'color: #95a5a6;');
            console.log('');
            
            // 闪烁提示
            flashElement(element);
        } catch (error) {
            console.error('%c❌ 克隆过程中发生错误，请检查元素或稍后重试', 'color: #e74c3c; font-weight: bold;');
            console.error(error);
        } finally {
            stop({ silent: true });
            console.log('%c🛑 当前克隆已完成，提取器已暂停', 'font-size: 13px; color: #e74c3c; font-weight: bold;');
            console.log('%c提示: 调用 cloneExtractor.start() 可以继续克隆其他元素', 'color: #95a5a6; font-style: italic;');
        }
    }
    
    // 键盘事件（ESC 退出）
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            stop();
        }
    }
    
    // 显示通知
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #27ae60;
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 999999;
            font-size: 14px;
            font-weight: bold;
            animation: slideIn 0.3s ease-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.transition = 'all 0.3s';
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => notification.remove(), 300);
        }, 2500);
    }
    
    // 闪烁提示
    function flashElement(element) {
        // 保存原始的 outline 样式
        const originalOutline = element.style.outline;
        const originalOutlineOffset = element.style.outlineOffset;
        
        let count = 0;
        const interval = setInterval(() => {
            if (count >= 4) {
                clearInterval(interval);
                // 恢复原始样式
                element.style.outline = originalOutline;
                element.style.outlineOffset = originalOutlineOffset;
                return;
            }
            
            if (count % 2 === 0) {
                element.style.outline = '3px solid #27ae60';
                element.style.outlineOffset = '2px';
            } else {
                element.style.outline = '3px solid #3498db';
                element.style.outlineOffset = '2px';
            }
            count++;
        }, 200);
    }
    
    // 清理
    function stop(options = {}) {
        const { silent = false } = options;
        
        isActive = false;
        // 移除当前高亮的元素
        if (currentHighlighted) {
            removeHighlight(currentHighlighted);
            currentHighlighted = null;
        }
        
        // 清理所有可能残留的高亮标记（安全措施）
        document.querySelectorAll('[data-clone-highlighted]').forEach(el => {
            el.removeAttribute('data-clone-highlighted');
            if (el._originalStyles) {
                removeHighlight(el);
            }
        });
        
        // 移除事件监听器
        if (eventsBound) {
            document.removeEventListener('mouseover', handleMouseOver, true);
            document.removeEventListener('mouseout', handleMouseOut, true);
            document.removeEventListener('click', handleClick, true);
            document.removeEventListener('keydown', handleKeyDown, true);
            eventsBound = false;
        }
        
        // 恢复默认光标
        if (document.body) {
            document.body.style.cursor = '';
        }
        
        if (!silent) {
            console.log('%c🛑 已退出克隆提取模式', 'font-size: 14px; color: #e74c3c; font-weight: bold;');
            console.log('%c提示: 调用 cloneExtractor.start() 可以重新启动提取器', 'color: #95a5a6; font-style: italic;');
        }
    }
    
    function ensureStyle() {
        if (styleElement && document.head.contains(styleElement)) {
            return;
        }
        const existing = document.getElementById('clone-extractor-style');
        if (existing) {
            styleElement = existing;
            return;
        }
        styleElement = document.createElement('style');
        styleElement.id = 'clone-extractor-style';
        styleElement.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
        document.head.appendChild(styleElement);
    }
    
    function start(options = {}) {
        const { silent = false } = options;
        if (isActive) {
            if (!silent) {
                console.log('%c⚠️ 提取器已经在运行', 'color: #f39c12; font-weight: bold;');
            }
            return;
        }
        
        ensureStyle();
        
        isActive = true;
        
        document.addEventListener('mouseover', handleMouseOver, true);
        document.addEventListener('mouseout', handleMouseOut, true);
        document.addEventListener('click', handleClick, true);
        document.addEventListener('keydown', handleKeyDown, true);
        eventsBound = true;
        
        if (document.body) {
            document.body.style.cursor = 'crosshair';
        }
        
        if (!silent) {
            printBanner();
            console.log('%c提示: 调用 cloneExtractor.stop() 或按 ESC 可退出', 'color: #95a5a6; font-style: italic;');
            console.log('%c提示: 输入 stopCloneExtractor() 兼容旧脚本停止命令', 'color: #95a5a6; font-style: italic;');
        }
    }
    
    const api = {
        start: (options) => start(options),
        stop,
        version: '2.7',
        isActive: () => isActive
    };
    
    global[API_NAMESPACE] = api;
    global.stopCloneExtractor = stop;
    global.launchCloneExtractor = (options) => {
        try {
            start(options);
        } catch (error) {
            console.error('[clone-extractor] Failed to start:', error);
        }
    };
    
    if (shouldAutoStart) {
        start();
    }
    
})(typeof window !== 'undefined' ? window : globalThis);
