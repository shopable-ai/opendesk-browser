class ListSelector {
    constructor(options = {}) {
      this.lists = [];
      this.currentIndex = -1;
      this.minChildren = options.minChildren || 3;
      this.preferredMin = options.preferredMin || 10;
      this.preferredMax = options.preferredMax || 20;
      this.maxLists = options.maxLists || 5;
      this.detectLists();
      this.injectStyles();
    }
  
    // 注入样式时添加悬停高亮样式
    injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        .listselector-highlight { border: 2px solid red; transition: border 0.3s; }
        .listselector-highlight-child { background: rgba(255, 0, 0, 0.1); }
        .listselector-step { position: absolute; background: #000; color: #fff; padding: 5px; cursor: pointer; font-size: 12px; z-index: 1000; }
        .listselector-next-btn { 
          position: relative; 
          border: 2px solid green !important; 
          background-color: rgba(0, 255, 0, 0.2) !important; 
          transition: all 0.3s; 
        }
        .listselector-next-btn::after { 
          content: "已选中 - 再次点击正常翻页"; 
          position: absolute; 
          top: -25px; 
          left: 0; 
          background: #00a000; 
          color: #fff; 
          padding: 3px 6px; 
          font-size: 12px; 
          border-radius: 3px;
          white-space: nowrap;
          z-index: 10001;
        }
        .listselector-next-btn-hover { 
          border: 2px dashed orange !important; 
          background-color: rgba(255, 165, 0, 0.1) !important;
          position: relative;
          cursor: pointer;
        }
        .listselector-next-btn-hover::after {
          content: "点击选择此元素作为下一页按钮"; 
          position: absolute; 
          top: -25px; 
          left: 0; 
          background: #ff8c00; 
          color: #fff; 
          padding: 3px 6px; 
          font-size: 12px; 
          border-radius: 3px;
          white-space: nowrap;
          z-index: 10001;
        }
        .listselector-prompt { 
          position: fixed; 
          top: 20px; 
          left: 50%; 
          transform: translateX(-50%); 
          background: rgba(0, 0, 0, 0.8); 
          color: #fff; 
          padding: 10px 20px; 
          border-radius: 5px;
          font-size: 14px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          z-index: 10000; 
        }
      `;
      document.head.appendChild(style);
    }
  
    // 获取有效子元素
    getValidChildren(container) {
      const validTags = ['div', 'li', 'tr', 'td', 'th', 'p', 'span', 'a', 'article', 'section', 'dd', 'dt'];
      const invalidTags = ['script', 'style', 'meta', 'link', 'noscript', 'iframe'];
      
      return Array.from(container.children).filter(child => {
        const tag = child.tagName.toLowerCase();
        
        // 排除明显无效的标签
        if (invalidTags.includes(tag)) return false;
        
        // 检查文本内容
        const hasText = child.textContent.trim().length > 0;
        
        // 检查是否有子元素
        const hasChildren = child.children.length > 0;
        
        // 检查是否有图片或链接
        const hasImg = child.querySelector('img[src]') !== null;
        const hasLink = child.querySelector('a[href]') !== null;
        
        // 如果是有效标签或者有文本内容或者有有效子元素，则认为是有效的
        return validTags.includes(tag) || hasText || hasChildren || hasImg || hasLink;
      });
    }
  
    // 改进的选择器生成方法 - 确保不会生成重复的选择器
    generateSelector(element, parentNode = null) {
      // 如果元素不存在或不是元素节点则返回空字符串
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }
      
      // 优先使用 CssSelectorGenerator 如果存在
      if (typeof CssSelectorGenerator !== 'undefined') {
        try {
          if (parentNode) {
            const options = { root: parentNode };
            let selector = CssSelectorGenerator.getCssSelector(element, options);
            return selector;
          }
          return CssSelectorGenerator.getCssSelector(element);
        } catch (e) {
          console.warn('CssSelectorGenerator failed, falling back to custom selector generation', e);
        }
      }
      
      // 自定义选择器生成逻辑
      // 检查元素是否有ID
      if (element.id && !/\d/.test(element.id)) {
        // 使用ID选择器，这通常是最精确的
        return `#${element.id}`;
      }
      
      // 检查是否是相对于父节点的直接子元素
      if (parentNode && element.parentElement === parentNode) {
        // 检查当前元素是否有可用的类名
        if (element.className) {
          const classes = element.className.trim().split(/\s+/)
            .filter(cls => !cls.startsWith('listselector-'));
          
          if (classes.length > 0) {
            // 尝试找到唯一标识此元素的最简短类选择器组合
            for (let i = 1; i <= classes.length; i++) {
              // 尝试使用i个类的组合
              const combinations = this.getCombinations(classes, i);
              for (const combo of combinations) {
                const classSelector = combo.map(cls => `.${cls}`).join('');
                const selector = `${element.tagName.toLowerCase()}${classSelector}`;
                // 检查该选择器在父元素中是否唯一
                const matches = parentNode.querySelectorAll(selector);
                if (matches.length === 1) {
                  return selector;
                }
              }
            }
          }
        }
        
        // 如果没有唯一类，使用nth-child
        const siblings = Array.from(parentNode.children)
          .filter(child => child.tagName === element.tagName);
        
        if (siblings.length > 1) {
          const index = siblings.indexOf(element) + 1;
          return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
        } else {
          // 如果是唯一的标签类型，直接使用标签选择器
          return element.tagName.toLowerCase();
        }
      }
      
      // 对于更复杂的关系，构建一个相对路径
      // 找到一个能够唯一标识元素的父路径
      let current = element;
      let path = [];
      let maxPathLength = parentNode ? 3 : 5; // 限制路径长度
      let pathLength = 0;
      
      while (current && current !== document.body && current !== document.documentElement && current !== parentNode && pathLength < maxPathLength) {
        // 为当前元素创建选择器段
        let part = current.tagName.toLowerCase();
        
        // 尝试添加ID
        if (current.id && !/\d/.test(current.id)) {
          part = `#${current.id}`;
          path.unshift(part);
          break; // ID是唯一的，可以结束路径构建
        }
        
        // 尝试添加类
        if (current.className) {
          const classes = current.className.trim().split(/\s+/)
            .filter(cls => !cls.startsWith('listselector-'));
          
          // 尝试找到最小的类组合以唯一标识元素
          for (let i = 1; i <= Math.min(classes.length, 2); i++) { // 最多使用两个类名
            const combinations = this.getCombinations(classes, i);
            for (const combo of combinations) {
              const classSelector = combo.map(cls => `.${cls}`).join('');
              const testSelector = `${part}${classSelector}`;
              // 检查在父元素上下文中的唯一性
              if (current.parentElement) {
                const matches = current.parentElement.querySelectorAll(testSelector);
                if (matches.length === 1) {
                  part = testSelector;
                  break;
                }
              }
            }
            // 如果找到了唯一选择器，跳出循环
            if (part !== current.tagName.toLowerCase()) break;
          }
        }
        
        // 如果没有找到唯一标识符，使用nth-of-type
        if (part === current.tagName.toLowerCase() && current.parentElement) {
          const siblings = Array.from(current.parentElement.children)
            .filter(child => child.tagName === current.tagName);
          
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            part += `:nth-of-type(${index})`;
          }
        }
        
        path.unshift(part);
        current = current.parentElement;
        pathLength++;
        
        // 如果当前路径已足够唯一，可以提前结束
        if (pathLength >= 2) {
          const testPath = path.join(' > ');
          try {
            const matches = document.querySelectorAll(testPath);
            if (matches.length === 1) {
              break;
            }
          } catch (e) {
            // 忽略无效选择器错误，继续构建路径
          }
        }
      }
      
      // 返回完整路径选择器
      return path.join(' > ');
    }
    
    // 获取元素组合的辅助方法
    getCombinations(array, size) {
      if (size > array.length) return [];
      if (size === 1) return array.map(item => [item]);
      
      return array.reduce((acc, current, index) => {
        const smallerCombinations = this.getCombinations(
          array.slice(index + 1), 
          size - 1
        );
        const combinationsWithCurrent = smallerCombinations.map(
          smallerComb => [current].concat(smallerComb)
        );
        return acc.concat(combinationsWithCurrent);
      }, []);
    }
  
    // 高亮指定列表
    highlight(index) {
      if (index < 0 || index >= this.lists.length) return;
      this.lists.forEach((list, i) => {
        list.element.classList.remove('listselector-highlight');
        list.children.forEach(child => child.classList.remove('listselector-highlight-child'));
        if (i === index) {
          list.element.classList.add('listselector-highlight');
          list.children.forEach(child => child.classList.add('listselector-highlight-child'));
        }
      });
      this.currentIndex = index;
    }
    
    clearHighlight() {
      this.lists.forEach(list => {
        list.element.classList.remove('listselector-highlight');
        list.children.forEach(child => child.classList.remove('listselector-highlight-child'));
      });
      this.currentIndex = -1;
    }
  
    // 切换到下一个列表
    next() {
        if (this.currentIndex === -1) {
          // 如果当前未选中，首先尝试查找关键内容列表
          const criticalIndex = this.lists.findIndex(list => 
            list.isCriticalSelector || 
            (list.element.className && 
             (list.element.className.includes('file-content') || 
              list.element.className.includes('course-list')))
          );
          
          if (criticalIndex !== -1) {
            // 找到关键内容列表，直接选中
            this.highlight(criticalIndex);
          } else {
            // 未找到，选中第一个列表
            this.highlight(0);
          }
        } else {
          // 已选中某个列表，循环到下一个
          this.currentIndex = (this.currentIndex + 1) % this.lists.length;
          this.highlight(this.currentIndex);
        }
        
        if (this.currentIndex !== -1) {
          let tableData = this.getTableData();
          return tableData;
        }
        return null;
    }
  
    // 获取当前选中列表的选择器
    getCurrentSelector() {
      if (this.lists.length === 0 || this.currentIndex < 0 || this.currentIndex >= this.lists.length) {
        console.log('没有选中的列表或列表为空');
        return null;
      }
      
      const currentList = this.lists[this.currentIndex];
      return {
        selector: currentList.selector,
        itemCount: currentList.children.length,
        element: currentList.element
      };
    }
  
    // 改进的getTableData方法，保持原始结构
    getTableData(callback, specificSelector = null) {
      // 获取要处理的元素
      let selector, element, children;
      
      if (specificSelector) {
        element = document.querySelector(specificSelector);
        if (!element) {
          console.error('找不到指定的表格元素:', specificSelector);
          if (callback) callback({ error: '表格未找到' });
          return null;
        }
        children = this.getValidChildren(element);
        selector = specificSelector;
      } else if (this.currentIndex !== -1) {
        const currentList = this.lists[this.currentIndex];
        element = currentList.element;
        children = currentList.children;
        selector = currentList.selector;
      } else {
        console.error('没有选中的表格，请先调用next()方法或提供选择器');
        if (callback) callback({ error: '没有选中的表格' });
        return null;
      }
      
      // 提取表格数据
      const data = this.extractTableData(element, children);
      
      // 返回或回调结果
      const result = {
        selector: selector,
        tableId: this.currentIndex,
        data: data,
        itemCount: children.length,
        goodClasses: element.classList ? Array.from(element.classList) : []
      };
      
      if (callback) {
        callback(result);
      }
      
      return result;
    }
  
    // 改进的表格数据提取方法
    extractTableData(tableElement, children) {
      const data = [];
      const tagName = tableElement.tagName.toLowerCase();
      
      if (tagName === 'table') {
        // 处理HTML表格
        const rows = tableElement.querySelectorAll('tr');
        let headers = [];
        let headerSelectors = [];
        
        // 提取表头及其选择器
        const headerRow = tableElement.querySelector('thead tr, tr:first-child');
        if (headerRow) {
          const headerCells = headerRow.querySelectorAll('th, td');
          headers = Array.from(headerCells).map(th => th.textContent.trim());
          // 使用表头行作为父节点生成相对选择器
          headerSelectors = Array.from(headerCells).map(th => this.generateSelector(th, headerRow));
        }
        
        // 提取数据行
        Array.from(rows).forEach((row, rowIndex) => {
          // 跳过表头行
          if (rowIndex === 0 && headers.length > 0) return;
          
          const rowData = {};
          // 生成行选择器
          const rowSelector = this.generateSelector(row, tableElement);
          rowData['_rowSelector'] = rowSelector; // 存储行选择器
          let hasValidData = false; // 标记行是否有有效数据
          
          const cells = row.querySelectorAll('td');
          
          cells.forEach((cell, cellIndex) => {
            // 为每个单元格生成唯一选择器
            const cellSelector = this.generateSelector(cell, row);
            const cellText = cell.textContent.trim();
            
            // 只有当文本不为空或有有效图片或链接时才添加
            if (cellText || cell.querySelector('img[src]') || cell.querySelector('a[href]')) {
              hasValidData = true; // 标记有效数据存在
              
              // 创建单元格数据对象
              rowData[cellSelector] = {};
              
              // 只有当文本不为空时才添加文本属性
              if (cellText) {
                rowData[cellSelector].text = cellText;
              }
              
              rowData[cellSelector].selector = cellSelector;
              
              // 如果有表头，也添加表头信息
              if (headerSelectors[cellIndex]) {
                rowData[cellSelector].header = headers[cellIndex] || '';
                rowData[cellSelector].headerSelector = headerSelectors[cellIndex];
              }
              
              // 提取链接
              const links = cell.querySelectorAll('a');
              if (links.length > 0) {
                const validLinks = [];
                links.forEach((link, linkIndex) => {
                  const linkText = link.textContent.trim();
                  const linkHref = link.href;
                  if (linkText || linkHref) {
                    // 使用单元格作为父节点生成链接选择器
                    const linkSelector = this.generateSelector(link, cell);
                    validLinks.push({
                      href: linkHref,
                      text: linkText || '',
                      selector: linkSelector
                    });
                  }
                });
                // 只有当有有效链接时才添加
                if (validLinks.length > 0) {
                  rowData[cellSelector].links = validLinks;
                }
              }
              
              // 提取图片
              const images = cell.querySelectorAll('img');
              if (images.length > 0) {
                const validImages = [];
                images.forEach((img, imgIndex) => {
                  if (img.src) {
                    // 使用单元格作为父节点生成图片选择器
                    const imgSelector = this.generateSelector(img, cell);
                    validImages.push({
                      src: img.src,
                      alt: img.alt || '',
                      selector: imgSelector
                    });
                  }
                });
                // 只有当有有效图片时才添加
                if (validImages.length > 0) {
                  rowData[cellSelector].images = validImages;
                }
              }
            }
          });
          
          // 只有当行有效数据时才添加
          if (hasValidData) {
            data.push(rowData);
          }
        });
      } else {
        // 处理非表格元素 (div, ul, ol 等)
        children.forEach((child, index) => {
          // 创建基本项数据结构
          const itemData = {};
          
          // 使用与父容器相对的选择器标识子元素
          const childSelector = this.generateSelector(child, tableElement);
          // 存储子元素的选择器和索引
          // itemData._itemSelector = childSelector;
          // itemData._index = index + 1;
          
          // 检查子元素是否有直接文本内容
          const childText = this.getPureText(child);
          if (childText) {
            // 如果子元素本身有直接文本，存储为主要内容属性
            itemData.text = childText;
          }
          
          // 创建已处理元素的映射，防止重复处理
          const processedSelectors = new Set();
          
          // 处理子元素的所有可见和有意义的后代元素
          this.processVisibleElements(child, itemData, processedSelectors);
          
          // 只有当项包含有效数据时才添加到结果中
          if (Object.keys(itemData).length > 2) { // 超过_itemSelector和_index
            data.push(itemData);
          }
        });
      }
      
      return data;
    }
    
    // 处理元素的可见子元素
    processVisibleElements(element, itemData, processedSelectors, depth = 0) {
      // 限制递归深度，避免过深的嵌套
      const maxDepth = 3;
      if (depth > maxDepth) return false;
      
      // 是否找到了有意义的数据
      let foundData = false;
      
      // 处理元素的直接子元素
      Array.from(element.children).forEach(child => {
        // 检查子元素是否可见和有意义
        const isVisible = child.offsetParent !== null; // 简单的可见性检查
        const tagName = child.tagName.toLowerCase();
        
        // 忽略脚本和样式元素
        if (['script', 'style', 'meta'].includes(tagName)) return;
        
        // 为子元素生成唯一标识符
        const selector = this.generateSelector(child, element);
        
        // 如果此选择器已处理，跳过
        if (processedSelectors.has(selector)) return;
        processedSelectors.add(selector);
        
        // 检查元素是否有直接文本、链接或图片
        const text = this.getPureText(child);
        const isLink = tagName === 'a' && child.href;
        const isImage = tagName === 'img' && child.src;
        
        // 如果元素有文本、是链接或图片，添加到数据中
        if (text || isLink || isImage) {
          foundData = true;
          
          // 创建元素数据
          itemData[selector] = {
            selector: selector,
            tag: tagName
          };
          
          // 添加文本（如果有）
          if (text) {
            itemData[selector].text = text;
          }
          
          // 添加链接信息（如果是链接）
          if (isLink) {
            itemData[selector].href = child.href;
          }
          
          // 添加图片信息（如果是图片）
          if (isImage) {
            itemData[selector].src = child.src;
            if (child.alt) {
              itemData[selector].alt = child.alt;
            }
          }
        }
        
        // 递归处理子元素的子元素
        // 对于容器元素如div，递归处理可能会找到更多有意义的内容
        if (child.children.length > 0) {
          // 对于特殊的容器类型（list、directory等），可以创建子数据结构
          if (['ul', 'ol', 'dl'].includes(tagName) || 
              child.classList.contains('list') || 
              child.classList.contains('directory')) {
            
            // 为容器创建子元素集合
            if (!itemData[selector]) {
              itemData[selector] = {
                selector: selector,
                tag: tagName
              };
            }
            
            // 添加子元素容器
            itemData[selector].children = {};
            
            // 递归处理子元素
            if (this.processContainerChildren(child, itemData[selector].children, processedSelectors, depth + 1)) {
              foundData = true;
            }
          } else {
            // 对于普通容器，正常递归
            if (this.processVisibleElements(child, itemData, processedSelectors, depth + 1)) {
              foundData = true;
            }
          }
        }
      });
      
      return foundData;
    }
    
    // 专门处理容器子元素的方法
    processContainerChildren(container, dataContainer, processedSelectors, depth) {
      let foundData = false;
      
      // 处理容器的直接子元素
      Array.from(container.children).forEach((child, index) => {
        const childSelector = this.generateSelector(child, container);
        
        // 防止重复处理
        if (processedSelectors.has(childSelector)) return;
        processedSelectors.add(childSelector);
        
        const tagName = child.tagName.toLowerCase();
        const text = this.getPureText(child);
        const isLink = tagName === 'a' && child.href;
        const isImage = tagName === 'img' && child.src;
        
        // 如果子元素有内容
        if (text || isLink || isImage) {
          foundData = true;
          
          // 添加子元素数据
          dataContainer[childSelector] = {
            selector: childSelector,
            tag: tagName,
            index: index + 1
          };
          
          if (text) {
            dataContainer[childSelector].text = text;
          }
          
          if (isLink) {
            dataContainer[childSelector].href = child.href;
          }
          
          if (isImage) {
            dataContainer[childSelector].src = child.src;
            if (child.alt) {
              dataContainer[childSelector].alt = child.alt;
            }
          }
        }
      });
      
      return foundData;
    }
  
    // 获取元素的纯文本（排除子元素文本）
    getPureText(element) {
      let text = '';
      for (let node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        }
      }
      return text.trim();
    }

/**
 * Universal list detection method that works across various websites
 * Detects content lists based on DOM patterns and visual structure
 */
detectLists() {
    console.log("Starting universal list detection...");
    const bodyArea = document.body.offsetWidth * document.body.offsetHeight;
    const candidates = [];
  
    // Common exclusion classes to avoid navigation, footer, etc.
    const excludeClasses = [
      'nav', 'navbar', 'navigation', 'menu', 'submenu',
      'footer', 'header', 'banner', 'sidebar',
      'ad', 'ads', 'advertisement', 'social', 'share',
      'search', 'login', 'signup', 'modal', 'popup'
    ];
    
    // Common terms that might indicate list containers
    const listTerms = [
      'list', 'items', 'results', 'card', 'grid', 'gallery',
      'product', 'article', 'job', 'feed', 'content', 'collection',
      'row', 'container', 'wrapper', 'box', 'layout'
    ];
  
    // Track processed elements to avoid duplicates
    const processedElements = new Set();
    
    // ==================== APPROACH 1: Check previously marked elements ====================
    try {
      const markedElements = document.querySelectorAll('.listselector-highlight');
      for (const element of markedElements) {
        if (processedElements.has(element)) continue;
        
        const children = this.getValidChildren(element);
        if (children.length >= this.minChildren) {
          candidates.push({
            element,
            children,
            score: 100000, // Very high score for user-selected elements
            isMarked: true,
            selector: this.generateSelector(element),
            childCount: children.length,
            area: element.offsetWidth * element.offsetHeight
          });
          processedElements.add(element);
        }
      }
    } catch (e) {
      console.error("Error processing marked elements:", e);
    }
  
    // ==================== APPROACH 2: Detect Grid or Flex Layouts ====================
    try {
      // Find elements that might be using grid or flex layouts
      const gridContainers = Array.from(document.querySelectorAll('*')).filter(el => {
        if (processedElements.has(el) || !this.isElementVisible(el)) return false;
        
        const style = window.getComputedStyle(el);
        return style.display === 'grid' || 
               style.display === 'flex' || 
               el.classList.contains('grid') || 
               el.classList.contains('row') ||
               el.classList.contains('flex');
      });
      
      for (const container of gridContainers) {
        const children = this.getValidChildren(container);
        
        if (children.length < this.minChildren) continue;
        
        const rect = container.getBoundingClientRect();
        const containerArea = rect.width * rect.height;
        
        if (containerArea < 2500) continue; // Skip tiny containers
        
        // Check if children have consistent styling/structure
        const similarity = this.calculateSimilarityBetweenElements(children);
        const visualAlignment = this.detectVisualAlignment(children);
        
        if (similarity > 0.4 || visualAlignment.aligned) {
          candidates.push({
            element: container,
            children,
            score: containerArea * Math.log(children.length + 1) * (similarity + visualAlignment.score) * 2,
            isGrid: true,
            gridInfo: visualAlignment,
            similarity,
            selector: this.generateSelector(container),
            childCount: children.length,
            area: containerArea
          });
          
          processedElements.add(container);
        }
      }
    } catch (e) {
      console.error("Error detecting grid/flex layouts:", e);
    }
  
    // ==================== APPROACH 3: Find common parent of similar elements ====================
    try {
      // Get all visible elements
      const allElements = Array.from(document.querySelectorAll('*')).filter(el => 
        this.isElementVisible(el) && !processedElements.has(el)
      );
      
      // Group elements by their tag name
      const elementsByTagName = {};
      for (const element of allElements) {
        const tagName = element.tagName.toLowerCase();
        elementsByTagName[tagName] = elementsByTagName[tagName] || [];
        elementsByTagName[tagName].push(element);
      }
      
      // Find groups of similar sibling elements
      for (const tagName in elementsByTagName) {
        const elements = elementsByTagName[tagName];
        
        // Skip if too few elements
        if (elements.length < this.minChildren) continue;
        
        // Group elements by their parent
        const elementsByParent = {};
        for (const element of elements) {
          if (!element.parentElement) continue;
          
          const parentSelector = this.generateSelector(element.parentElement);
          elementsByParent[parentSelector] = elementsByParent[parentSelector] || [];
          elementsByParent[parentSelector].push(element);
        }
        
        // Check each parent with multiple children
        for (const parentSelector in elementsByParent) {
          const siblingElements = elementsByParent[parentSelector];
          
          if (siblingElements.length < this.minChildren) continue;
          
          // Get parent element
          const parentElement = siblingElements[0].parentElement;
          
          // Skip if parent has exclusion classes or has been processed
          if (!parentElement || 
              processedElements.has(parentElement) || 
              this.hasExcludedClass(parentElement, excludeClasses)) {
            continue;
          }
          
          // Calculate similarity between siblings
          const similarityScore = this.calculateSimilarityBetweenElements(siblingElements);
          
          // If siblings are similar enough, consider parent as a list container
          if (similarityScore > 0.4) { // Lower threshold to catch more potential lists
            const rect = parentElement.getBoundingClientRect();
            const area = rect.width * rect.height;
            
            if (area > 1000) { // Skip tiny containers
              candidates.push({
                element: parentElement,
                children: siblingElements,
                score: area * Math.log(siblingElements.length + 1) * similarityScore * 1.5,
                similarity: similarityScore,
                selector: parentSelector,
                childCount: siblingElements.length,
                area
              });
              processedElements.add(parentElement);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error finding common parents:", e);
    }
  
    // ==================== APPROACH 4: Standard list structures (ul, ol, table) ====================
    try {
      // Look for standard HTML list structures
      const standardLists = document.querySelectorAll('ul, ol, table, dl, [role="list"], [role="listbox"], [role="grid"], .list, .items');
      
      for (const element of standardLists) {
        if (processedElements.has(element) || 
            !this.isElementVisible(element) || 
            this.hasExcludedClass(element, excludeClasses)) {
          continue;
        }
        
        const children = this.getValidChildren(element);
        if (children.length < this.minChildren) continue;
        
        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;
        
        if (area < 1000) continue; // Skip tiny elements
        
        const similarity = this.calculateSimilarityBetweenElements(children);
        
        candidates.push({
          element,
          children,
          score: area * Math.log(children.length + 1) * (1 + similarity) * 2, // Bonus for standard lists
          similarity,
          isStandardList: true,
          selector: this.generateSelector(element),
          childCount: children.length,
          area
        });
        
        processedElements.add(element);
      }
    } catch (e) {
      console.error("Error detecting standard lists:", e);
    }
  
    // ==================== APPROACH 5: Content containers with list-related classes or IDs ====================
    try {      
      // Create selectors for elements with list-related classes or IDs
      const listSelectors = [];
      
      // Class selectors
      for (const term of listTerms) {
        listSelectors.push(`[class*="${term}"]`);
      }
      
      // ID selectors
      for (const term of listTerms) {
        listSelectors.push(`[id*="${term}"]`);
      }
      
      // Add common component class patterns
      listSelectors.push('.video-list', '.card-list', '.item-list', '.article-list', '.product-list');
      listSelectors.push('.cards', '.items', '.results', '.videos', '.products');
      listSelectors.push('.container > .row', '.video-container', '.list-container');
      
      // Query elements with list-related classes or IDs
      const combinedSelector = listSelectors.join(', ');
      const potentialLists = document.querySelectorAll(combinedSelector);
      
      for (const element of potentialLists) {
        if (processedElements.has(element) || 
            !this.isElementVisible(element) || 
            this.hasExcludedClass(element, excludeClasses)) {
          continue;
        }
        
        const children = this.getValidChildren(element);
        if (children.length < this.minChildren) continue;
        
        const rect = element.getBoundingClientRect();
        const area = rect.width * rect.height;
        
        if (area < 1000) continue; // Skip tiny elements
        
        const similarity = this.calculateSimilarityBetweenElements(children);
        
        if (similarity > 0.3) { // Require at least some similarity
          candidates.push({
            element,
            children,
            score: area * Math.log(children.length + 1) * similarity * 1.2, // Bonus for matching class/ID
            similarity,
            selector: this.generateSelector(element),
            childCount: children.length,
            area
          });
          
          processedElements.add(element);
        }
      }
    } catch (e) {
      console.error("Error detecting lists by class/ID patterns:", e);
    }
  
    // ==================== APPROACH 6: Visual pattern detection ====================
    try {
      // Find containers with visually aligned children
      const allContainers = Array.from(document.querySelectorAll('div, section, article, main, aside'))
        .filter(el => !processedElements.has(el) && this.isElementVisible(el));
      
      for (const container of allContainers) {
        const children = this.getValidChildren(container);
        
        if (children.length < this.minChildren) continue;
        
        // Check if children have visual alignment patterns
        const alignmentInfo = this.detectVisualAlignment(children);
        
        if (alignmentInfo.aligned) {
          const rect = container.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          if (area < 1000) continue; // Skip tiny elements
          
          candidates.push({
            element: container,
            children,
            score: area * Math.log(children.length + 1) * alignmentInfo.score * 1.3, // Bonus for visual alignment
            alignment: alignmentInfo.score,
            isGrid: alignmentInfo.isGrid,
            selector: this.generateSelector(container),
            childCount: children.length,
            area
          });
          
          processedElements.add(container);
        }
      }
    } catch (e) {
      console.error("Error detecting visual patterns:", e);
    }
  
    // ==================== APPROACH 7: Check for parent elements with card-like children ====================
    try {
      // Look for common card-like elements
      const cardLikeElements = document.querySelectorAll('[class*="card"], [class*="item"], [class*="cell"], [class*="box"], [class*="tile"]');
      
      if (cardLikeElements.length >= this.minChildren) {
        // Group cards by parent
        const parentMap = new Map();
        
        for (const card of cardLikeElements) {
          const parent = card.parentElement;
          if (!parent || processedElements.has(parent)) continue;
          
          if (!parentMap.has(parent)) {
            parentMap.set(parent, {
              element: parent,
              count: 1,
              children: [card]
            });
          } else {
            const info = parentMap.get(parent);
            info.count++;
            info.children.push(card);
          }
        }
        
        // Find parents with enough card children
        for (const [parent, info] of parentMap.entries()) {
          if (info.count >= this.minChildren && 
              this.isElementVisible(parent) && 
              !this.hasExcludedClass(parent, excludeClasses)) {
            
            const rect = parent.getBoundingClientRect();
            const area = rect.width * rect.height;
            
            if (area < 1000) continue; // Skip tiny containers
            
            const similarity = this.calculateSimilarityBetweenElements(info.children);
            
            candidates.push({
              element: parent,
              children: info.children,
              score: area * Math.log(info.count + 1) * similarity * 1.4,
              similarity,
              selector: this.generateSelector(parent),
              childCount: info.count,
              area
            });
            
            processedElements.add(parent);
          }
        }
      }
    } catch (e) {
      console.error("Error detecting card patterns:", e);
    }
  
    // ==================== APPROACH 8: Deep structure similarity ====================
    try {
      // For remaining large containers, look for deep structure similarity
      const largeContainers = Array.from(document.querySelectorAll('div, section, article'))
        .filter(el => {
          if (processedElements.has(el) || !this.isElementVisible(el)) return false;
          
          const rect = el.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          return area > 0.05 * bodyArea; // Only consider relatively large containers
        });
      
      for (const container of largeContainers) {
        const children = this.getValidChildren(container);
        
        if (children.length < this.minChildren) continue;
        
        // Analyze deep structure similarity
        const structureSimilarity = this.analyzeDeepStructureSimilarity(children);
        
        if (structureSimilarity > 0.6) { // High structure similarity threshold
          const rect = container.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          candidates.push({
            element: container,
            children,
            score: area * Math.log(children.length + 1) * structureSimilarity,
            structureSimilarity,
            selector: this.generateSelector(container),
            childCount: children.length,
            area
          });
          
          processedElements.add(container);
        }
      }
    } catch (e) {
      console.error("Error detecting deep structure similarity:", e);
    }
  
    // ==================== APPROACH 9: Emergency fallback for low candidate count ====================
    if (candidates.length < 2) {
      try {
        // As a last resort, search for any container with multiple similar-sized children
        const containers = Array.from(document.querySelectorAll('div, section, article'))
          .filter(el => !processedElements.has(el) && this.isElementVisible(el));
        
        for (const container of containers) {
          const children = this.getValidChildren(container);
          
          if (children.length >= Math.max(4, this.minChildren)) { // Higher threshold for fallback
            // Check size consistency
            const sizeSimilarity = this.calculateSizeSimilarity(children);
            
            if (sizeSimilarity > 0.7) { // High size similarity required
              const rect = container.getBoundingClientRect();
              const area = rect.width * rect.height;
              
              if (area > 5000) { // Must be reasonably large
                candidates.push({
                  element: container,
                  children,
                  score: area * children.length * 0.2, // Lower score for fallback
                  sizeSimilarity,
                  selector: this.generateSelector(container),
                  childCount: children.length,
                  area,
                  isFallback: true
                });
              }
            }
          }
        }
      } catch (e) {
        console.error("Error in fallback detection:", e);
      }
    }
  
    // ==================== APPROACH 10: Direct search for specific components ====================
    if (candidates.length === 0) {
      try {
        // Last-ditch effort: search for common item patterns directly
        const specificSelectors = [
          '.video-item', '.product-item', '.article-item', '.job-card',
          '.bili-video-card', '.video-list .col_3', '.items > .item',
          '[class*="card-container"]', '[class*="video-card"]', '[class*="product-card"]',
          '.search-all-list > div'
        ];
        
        const specificSelector = specificSelectors.join(', ');
        const specificElements = document.querySelectorAll(specificSelector);
        
        if (specificElements.length >= this.minChildren) {
          // Group by parent
          const parentMap = new Map();
          
          specificElements.forEach(el => {
            const parent = el.parentElement;
            if (!parent) return;
            
            if (!parentMap.has(parent)) {
              parentMap.set(parent, {
                element: parent,
                count: 1,
                children: [el]
              });
            } else {
              const info = parentMap.get(parent);
              info.count++;
              info.children.push(el);
            }
          });
          
          // Find parent with most elements
          let bestParent = null;
          let maxCount = 0;
          
          for (const [parent, info] of parentMap.entries()) {
            if (info.count > maxCount && info.count >= this.minChildren) {
              maxCount = info.count;
              bestParent = info;
            }
          }
          
          // Add best parent to candidates
          if (bestParent && this.isElementVisible(bestParent.element)) {
            const rect = bestParent.element.getBoundingClientRect();
            const area = rect.width * rect.height;
            
            candidates.push({
              element: bestParent.element,
              children: bestParent.children,
              score: area * bestParent.count,
              selector: this.generateSelector(bestParent.element),
              childCount: bestParent.count,
              area,
              isEmergencyFallback: true
            });
          }
        }
      } catch (e) {
        console.error("Error in specific component detection:", e);
      }
    }
    
    // ==================== APPROACH 11: Check for DOM patterns in modern web frameworks ====================
    try {
      // Modern frameworks often use patterns like repeating components with similar structure
      const allElements = document.querySelectorAll('*');
      const potentialContainers = new Set();
      
      // First pass: find elements with data-* attributes that might indicate components
      for (const el of allElements) {
        if (processedElements.has(el)) continue;
        
        // Look for elements with data-v-*, data-reactid, ng-*, etc.
        const hasFrameworkAttrs = Array.from(el.attributes).some(attr => {
          const name = attr.name.toLowerCase();
          return name.startsWith('data-v-') || 
                 name.startsWith('data-react') || 
                 name.startsWith('ng-') ||
                 name === 'data-id' ||
                 name.includes('component');
        });
        
        if (hasFrameworkAttrs) {
          // Check if parent might be a container
          const parent = el.parentElement;
          if (parent && this.isElementVisible(parent) && !processedElements.has(parent)) {
            potentialContainers.add(parent);
          }
        }
      }
      
      // Second pass: evaluate potential containers
      for (const container of potentialContainers) {
        const children = this.getValidChildren(container);
        
        if (children.length >= this.minChildren) {
          const similarity = this.calculateSimilarityBetweenElements(children);
          
          if (similarity > 0.5) {
            const rect = container.getBoundingClientRect();
            const area = rect.width * rect.height;
            
            if (area > 1000) {
              candidates.push({
                element: container,
                children,
                score: area * Math.log(children.length + 1) * similarity * 1.1,
                similarity,
                selector: this.generateSelector(container),
                childCount: children.length,
                area,
                isFrameworkComponent: true
              });
              
              processedElements.add(container);
            }
          }
        }
      }
    } catch (e) {
      console.error("Error detecting framework components:", e);
    }
    
    // ==================== FINALIZE CANDIDATES ====================
    
    // Sort candidates by score
    candidates.sort((a, b) => b.score - a.score);
    
    // Take top candidates
    this.lists = candidates.slice(0, this.maxLists);
    
    // Remove nested and duplicate lists
    this.lists = this.removeDuplicateLists(this.lists);
    this.lists = this.filterNestedLists(this.lists);
    
    console.log("List detection complete. Found", this.lists.length, "lists");
    console.log("Lists:", this.lists.map(list => ({
      selector: list.selector,
      childCount: list.childCount,
      score: list.score,
      similarity: list.similarity || "N/A"
    })));
  }    
    
  /**
   * Calculate visual alignment of elements
   * Detects grid or row/column patterns
   */
  detectVisualAlignment(elements) {
    if (elements.length < 3) return { aligned: false, score: 0 };
    
    // Get bounding rects
    const rects = elements.map(el => el.getBoundingClientRect());
    
    // Group elements by vertical position (rows)
    const rows = this.groupElementsByPosition(rects, 'top', 10);
    
    // Group elements by horizontal position (columns)
    const columns = this.groupElementsByPosition(rects, 'left', 10);
    
    // Check if elements form a grid pattern
    const isGrid = rows.length > 1 && columns.length > 1;
    
    // Calculate alignment score based on how many elements are in aligned rows/columns
    let alignedElements = 0;
    
    for (const row of rows) {
      if (row.length >= 2) { // Row has multiple elements
        alignedElements += row.length;
      }
    }
    
    const alignmentScore = alignedElements / elements.length;
    
    return {
      aligned: alignmentScore > 0.7, // At least 70% of elements are aligned
      score: alignmentScore,
      isGrid: isGrid,
      rowCount: rows.length,
      columnCount: columns.length
    };
  }
  
  /**
   * Group elements by position coordinate
   */
  groupElementsByPosition(rects, prop, tolerance) {
    // Create clusters of elements with similar position
    const clusters = [];
    
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      let foundCluster = false;
      
      // Check if element fits in an existing cluster
      for (const cluster of clusters) {
        const reference = rects[cluster[0]];
        
        if (Math.abs(rect[prop] - reference[prop]) <= tolerance) {
          cluster.push(i);
          foundCluster = true;
          break;
        }
      }
      
      // If not found in any cluster, create a new one
      if (!foundCluster) {
        clusters.push([i]);
      }
    }
    
    // Filter to only include non-singleton clusters
    return clusters;
  }
  
  /**
   * Calculate similarity between elements
   * Combines multiple factors: size, structure, class, content
   */
  calculateSimilarityBetweenElements(elements) {
    if (elements.length < 3) return 0;
    
    // Calculate various similarity metrics
    const sizeSimilarity = this.calculateSizeSimilarity(elements);
    const classSimilarity = this.calculateClassSimilarity(elements);
    const tagSimilarity = this.calculateTagSimilarity(elements);
    const contentSimilarity = this.calculateContentTypeSimilarity(elements);
    
    // Weighted combination
    return sizeSimilarity * 0.4 + 
           classSimilarity * 0.3 + 
           tagSimilarity * 0.2 + 
           contentSimilarity * 0.1;
  }
  
  /**
   * Calculate size similarity between elements
   */
  calculateSizeSimilarity(elements) {
    // Get dimensions
    const dimensions = elements.map(el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    
    // Calculate averages
    const avgWidth = dimensions.reduce((sum, dim) => sum + dim.width, 0) / dimensions.length;
    const avgHeight = dimensions.reduce((sum, dim) => sum + dim.height, 0) / dimensions.length;
    
    // Calculate coefficient of variation (lower means more consistent)
    const widthCV = this.calculateCoeffOfVariation(dimensions.map(d => d.width), avgWidth);
    const heightCV = this.calculateCoeffOfVariation(dimensions.map(d => d.height), avgHeight);
    
    // Size similarity score (1 = perfect similarity, 0 = no similarity)
    return Math.max(0, 1 - Math.min(1, (widthCV + heightCV) / 2));
  }
  
  /**
   * Calculate coefficient of variation
   */
  calculateCoeffOfVariation(values, mean) {
    if (mean === 0) return 1; // Maximum variation
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev / mean;
  }
  
  /**
   * Calculate class similarity between elements
   */
  calculateClassSimilarity(elements) {
    // Extract class lists
    const elementClasses = elements.map(el => {
      return el.className ? new Set(el.className.trim().split(/\s+/)) : new Set();
    });
    
    // Count how many elements share each class
    const classFrequency = {};
    
    elementClasses.forEach(classes => {
      classes.forEach(cls => {
        if (cls && !cls.startsWith('listselector-')) {
          classFrequency[cls] = (classFrequency[cls] || 0) + 1;
        }
      });
    });
    
    // Find the most common class
    let maxFrequency = 0;
    for (const frequency of Object.values(classFrequency)) {
      maxFrequency = Math.max(maxFrequency, frequency);
    }
    
    // Class similarity score
    return maxFrequency / elements.length;
  }
  
  /**
   * Calculate tag name similarity between elements
   */
  calculateTagSimilarity(elements) {
    if (elements.length === 0) return 0;
    
    // Count tag names
    const tagCounts = {};
    
    for (const el of elements) {
      const tag = el.tagName.toLowerCase();
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
    
    // Find most common tag
    let maxCount = 0;
    for (const count of Object.values(tagCounts)) {
      maxCount = Math.max(maxCount, count);
    }
    
    // Tag similarity score
    return maxCount / elements.length;
  }
  
  /**
   * Calculate content type similarity between elements
   */
  calculateContentTypeSimilarity(elements) {
    if (elements.length < 3) return 0;
    
    // Define content features to check
    const features = [
      el => !!el.querySelector('img'),                // Has image
      el => !!el.querySelector('a'),                  // Has link
      el => el.textContent.trim().length > 0,         // Has text
      el => el.querySelectorAll('div').length > 0,    // Has div children
      el => el.querySelectorAll('span').length > 0,   // Has span children
      el => el.querySelectorAll('p').length > 0       // Has paragraph children
    ];
    
    // Calculate feature vectors for each element
    const featureVectors = elements.map(el => 
      features.map(feature => feature(el) ? 1 : 0)
    );
    
    // Count elements with matching feature patterns
    const patternCounts = {};
    
    featureVectors.forEach(vector => {
      const pattern = vector.join(',');
      patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
    });
    
    // Find the most common pattern
    let maxCount = 0;
    for (const count of Object.values(patternCounts)) {
      maxCount = Math.max(maxCount, count);
    }
    
    // Content similarity score
    return maxCount / elements.length;
  }
  
  /**
   * Analyze deep structure similarity of elements
   */
  analyzeDeepStructureSimilarity(elements) {
    if (elements.length < 3) return 0;
    
    // Generate structure signatures
    const signatures = elements.map(el => this.generateStructureSignature(el, 2));
    
    // Count signature occurrences
    const signatureCounts = {};
    
    signatures.forEach(sig => {
      signatureCounts[sig] = (signatureCounts[sig] || 0) + 1;
    });
    
    // Find most common signature
    let maxCount = 0;
    for (const count of Object.values(signatureCounts)) {
      maxCount = Math.max(maxCount, count);
    }
    
    // Structure similarity score
    return maxCount / elements.length;
  }
  
  /**
   * Generate a structure signature for an element
   */
  generateStructureSignature(element, depth = 2) {
    if (depth <= 0) return '';
    
    let signature = element.tagName.toLowerCase();
    
    // Count child elements by tag
    const childTagCounts = {};
    
    for (const child of element.children) {
      const tag = child.tagName.toLowerCase();
      childTagCounts[tag] = (childTagCounts[tag] || 0) + 1;
    }
    
    // Add child tag counts to signature
    for (const tag in childTagCounts) {
      signature += `|${tag}:${childTagCounts[tag]}`;
    }
    
    // Add special element counts
    signature += `|a:${element.querySelectorAll('a').length}`;
    signature += `|img:${element.querySelectorAll('img').length}`;
    
    // Add recursive signatures for first few children if depth > 1
    if (depth > 1 && element.children.length > 0) {
      // Limit to first 3 children to keep signature manageable
      const childrenToProcess = Array.from(element.children).slice(0, 3);
      
      for (let i = 0; i < childrenToProcess.length; i++) {
        signature += `|c${i}:${this.generateStructureSignature(childrenToProcess[i], depth - 1)}`;
      }
    }
    
    return signature;
  }

    // Helper method to find repeating structures
    findRepeatingStructures(rootElement, candidates, depth = 0) {
        if (depth > 5) return; // Limit recursion depth

        // Skip invisible elements
        if (!this.isElementVisible(rootElement)) return;

        const children = this.getValidChildren(rootElement);

        // Check if this element's children form a list
        if (children.length >= this.minChildren) {
            // Calculate structure similarity
            const structureSimilarity = this.calculateStructureSimilarity(children);

            // If children have similar structure, consider this a list
            if (structureSimilarity > 0.5) {
                const rect = rootElement.getBoundingClientRect();
                const area = rect.width * rect.height;

                // Only add if not tiny
                if (area > 2500) {
                    // Skip if already in candidates
                    if (!candidates.some(c => c.element === rootElement)) {
                        candidates.push({
                            type: rootElement.tagName.toLowerCase(),
                            element: rootElement,
                            parent: rootElement.parentElement,
                            children,
                            goodClasses: this.getGoodClasses(children),
                            area,
                            score: area * structureSimilarity * Math.log(children.length + 1),
                            similarity: structureSimilarity,
                            structureSimilarity,
                            selector: this.generateSelector(rootElement),
                            childCount: children.length
                        });
                    }
                }
            }
        }

        // Continue recursion with children
        for (const child of children) {
            this.findRepeatingStructures(child, candidates, depth + 1);
        }
    }

    // Calculate structure similarity among elements
    calculateStructureSimilarity(elements) {
        if (elements.length < 3) return 0;

        // Get structure signatures for each element
        const signatures = elements.map(el => this.getElementStructureSignature(el));

        // Count occurrences of each signature
        const signatureCounts = {};
        for (const sig of signatures) {
            signatureCounts[sig] = (signatureCounts[sig] || 0) + 1;
        }

        // Find the most common signature
        let maxCount = 0;
        for (const count of Object.values(signatureCounts)) {
            maxCount = Math.max(maxCount, count);
        }

        // Calculate similarity as ratio of elements with the most common signature
        return maxCount / elements.length;
    }

    // Generate a signature that represents element structure
    getElementStructureSignature(element) {
        let signature = element.tagName;

        // Add child tag counts to signature
        const childTagCounts = {};
        for (const child of element.children) {
            const tag = child.tagName;
            childTagCounts[tag] = (childTagCounts[tag] || 0) + 1;
        }

        // Convert counts to string
        for (const [tag, count] of Object.entries(childTagCounts)) {
            signature += `${tag}:${count};`;
        }

        // Add additional information about links and images
        signature += `;IMG:${element.querySelectorAll('img').length}`;
        signature += `;A:${element.querySelectorAll('a').length}`;

        return signature;
    }

    // Detect grid-like or row-like visual patterns
    detectVisualPatterns(candidates) {
        // Get all elements with multiple children
        const containers = Array.from(document.querySelectorAll('*')).filter(el =>
            this.isElementVisible(el) &&
            this.getValidChildren(el).length >= this.minChildren
        );

        for (const container of containers) {
            // Skip if already in candidates
            if (candidates.some(c => c.element === container)) continue;

            const children = this.getValidChildren(container);

            // Calculate visual alignment
            const alignment = this.calculateVisualAlignment(children);

            if (alignment.score > 0.7) {  // High alignment score
                const rect = container.getBoundingClientRect();
                const area = rect.width * rect.height;

                // Skip tiny containers
                if (area < 2500) continue;

                // Add to candidates
                candidates.push({
                    type: container.tagName.toLowerCase(),
                    element: container,
                    parent: container.parentElement,
                    children,
                    goodClasses: this.getGoodClasses(children),
                    area,
                    score: area * alignment.score * Math.log(children.length + 1),
                    alignment: alignment.score,
                    isGrid: alignment.isGrid,
                    selector: this.generateSelector(container),
                    childCount: children.length
                });
            }
        }
    }

    // Calculate how well elements are visually aligned
    calculateVisualAlignment(elements) {
        if (elements.length < 3) return { score: 0, isGrid: false };

        // Get bounding rects
        const rects = elements.map(el => el.getBoundingClientRect());

        // Check for horizontal rows
        const topPositions = rects.map(r => Math.round(r.top));
        const uniqueTops = [...new Set(topPositions)];
        const topGroups = {};

        for (let i = 0; i < topPositions.length; i++) {
            const top = topPositions[i];
            topGroups[top] = topGroups[top] || [];
            topGroups[top].push(i);
        }

        // Check for vertical columns
        const leftPositions = rects.map(r => Math.round(r.left));
        const uniqueLefts = [...new Set(leftPositions)];
        const leftGroups = {};

        for (let i = 0; i < leftPositions.length; i++) {
            const left = leftPositions[i];
            leftGroups[left] = leftGroups[left] || [];
            leftGroups[left].push(i);
        }

        // Calculate alignment scores
        const rowScore = uniqueTops.length > 0 ?
            Math.max(...Object.values(topGroups).map(g => g.length)) / elements.length : 0;

        const colScore = uniqueLefts.length > 0 ?
            Math.max(...Object.values(leftGroups).map(g => g.length)) / elements.length : 0;

        // Check if it's a grid
        const isGrid = uniqueTops.length > 1 && uniqueLefts.length > 1 &&
            uniqueTops.length * uniqueLefts.length >= elements.length * 0.8;

        // Overall alignment score
        const alignmentScore = Math.max(rowScore, colScore);

        return {
            score: alignmentScore,
            isGrid,
            rowCount: uniqueTops.length,
            colCount: uniqueLefts.length
        };
    }

    // 过滤嵌套列表，优先选择更精细的内容列表
    filterNestedLists(candidates) {
        const result = [];
        const visited = new Set();

        // 首先处理优先级高的元素
        for (const candidate of candidates) {
            if (visited.has(candidate.element)) continue;

            // 检查这个元素是否是其他元素的子元素
            let isChild = false;
            for (const other of candidates) {
                if (other.element !== candidate.element &&
                    other.element.contains(candidate.element)) {
                    // 如果是子元素且子元素质量更高，标记父元素为已访问
                    if ((candidate.isMarkedChild || candidate.isPrioritySelector ||
                        (candidate.childCount >= this.minChildren &&
                            candidate.childCount <= this.preferredMax)) &&
                        !other.isMarkedChild && !other.isPrioritySelector) {
                        visited.add(other.element);
                        isChild = true;
                    }
                }
            }

            // 如果不是子元素或者是高质量子元素，添加到结果
            if (!isChild && !visited.has(candidate.element)) {
                result.push(candidate);
                visited.add(candidate.element);
            }
        }

        // 如果筛选后没有结果，返回所有候选
        return result.length > 0 ? result : candidates;
    }

    // 检测子元素中是否有重复的类名模式
    hasRepeatingClassPatterns(children) {
        if (children.length < 3) return false;

        // 检查类名模式
        const classPatterns = {};
        let totalPatternsFound = 0;

        children.forEach(child => {
            if (!child.className) return;

            const classNames = child.className.trim();
            if (classPatterns[classNames]) {
                classPatterns[classNames]++;
                totalPatternsFound++;
            } else {
                classPatterns[classNames] = 1;
            }
        });

        // 计算重复率
        const repeatRatio = totalPatternsFound / children.length;
        return repeatRatio > 0.5; // 如果超过50%的元素有相同的类名模式，则认为是列表
    }
    
    // 替代原有的getGoodClasses方法
    getCommonClassesFromChildren(children) {
      const classCount = {};
      children.forEach(child => {
        const classes = (child.className || '').trim().split(/\s+/).filter(c => c);
        classes.forEach(cls => classCount[cls] = (classCount[cls] || 0) + 1);
      });
      const threshold = children.length / 3; // 降低阈值，只要1/3的元素有相同类名就考虑
      return Object.keys(classCount).filter(cls => 
        classCount[cls] >= threshold && 
        !cls.startsWith('listselector-') // 排除插件自己添加的类
      );
    }
    
    // 原始的 getGoodClasses 方法保持不变
  getGoodClasses(children) {
    const classCount = {};
    children.forEach(child => {
      const classes = (child.className || '').trim().split(/\s+/).filter(c => c);
      classes.forEach(cls => classCount[cls] = (classCount[cls] || 0) + 1);
    });
    const threshold = children.length / 2 - 2;
    return Object.keys(classCount).filter(cls => classCount[cls] >= threshold);
  }
  
  
  // 添加检测重复的类名模式的方法
  hasRepeatingClassPatterns(children) {
    if (children.length < 3) return false;
    
    // 检查类名模式
    const classPatterns = {};
    let totalPatternsFound = 0;
    
    children.forEach(child => {
      if (!child.className) return;
      
      const classNames = child.className.trim();
      if (classPatterns[classNames]) {
        classPatterns[classNames]++;
        totalPatternsFound++;
      } else {
        classPatterns[classNames] = 1;
      }
    });
    
    // 计算重复率
    const repeatRatio = totalPatternsFound / children.length;
    return repeatRatio > 0.5; // 如果超过50%的元素有相同的类名模式，则认为是列表
  }
      
    // 改进的获取有效子元素方法
    getValidChildren(container) {
      const validTags = ['div', 'li', 'tr', 'td', 'th', 'p', 'span', 'a', 'article', 'section', 'dd', 'dt'];
      const invalidTags = ['script', 'style', 'meta', 'link', 'noscript', 'iframe'];
      
      return Array.from(container.children).filter(child => {
        const tag = child.tagName.toLowerCase();
        
        // 排除明显无效的标签
        if (invalidTags.includes(tag)) return false;
        
        // 检查文本内容
        const hasText = child.textContent.trim().length > 0;
        
        // 检查是否有子元素
        const hasChildren = child.children.length > 0;
        
        // 检查是否有图片或链接
        const hasImg = child.querySelector('img[src]') !== null;
        const hasLink = child.querySelector('a[href]') !== null;
        
        // 如果是有效标签或者有文本内容或者有有效子元素，则认为是有效的
        return validTags.includes(tag) || hasText || hasChildren || hasImg || hasLink;
      });
    }
    
    
  
    // 检查容器是否具有标准列表结构
    isStandardListStructure(container) {
      const tagName = container.tagName.toLowerCase();
      
      // ul或ol内主要是li元素
      if (tagName === 'ul' || tagName === 'ol') {
        const children = Array.from(container.children);
        if (children.length === 0) return false;
        
        const liCount = children.filter(child => child.tagName.toLowerCase() === 'li').length;
        return liCount >= children.length * 0.7; // 至少70%是li
      }
      
      // table内有tr元素
      if (tagName === 'table') {
        const rows = container.querySelectorAll('tr');
        return rows.length >= 2; // 至少有标题行和数据行
      }
      
      // div列表: 子元素标签和类一致性
      if (tagName === 'div') {
        const children = Array.from(container.children);
        if (children.length < 3) return false;
        
        // 检查子元素标签一致性
        const tags = {};
        children.forEach(child => {
          const tag = child.tagName.toLowerCase();
          tags[tag] = (tags[tag] || 0) + 1;
        });
        
        // 找到最常见的标签和占比
        let maxTag = '', maxCount = 0;
        for (const tag in tags) {
          if (tags[tag] > maxCount) {
            maxTag = tag;
            maxCount = tags[tag];
          }
        }
        
        const tagConsistency = maxCount / children.length;
        
        // 检查类名一致性
        const classes = {};
        children.forEach(child => {
          if (!child.className) return;
          
          // 提取第一个类名作为主要类
          const mainClass = child.className.trim().split(/\s+/)[0];
          if (mainClass) {
            classes[mainClass] = (classes[mainClass] || 0) + 1;
          }
        });
        
        // 找到最常见的类和占比
        let maxClass = '', maxClassCount = 0;
        for (const cls in classes) {
          if (classes[cls] > maxClassCount) {
            maxClass = cls;
            maxClassCount = classes[cls];
          }
        }
        
        const classConsistency = maxClassCount / children.length;
        
        // 结合标签和类的一致性评估
        return tagConsistency > 0.7 || classConsistency > 0.6;
      }
      
      return false;
    }
    
    // 检查元素是否具有排除类
    hasExcludedClass(element, excludeClasses) {
      if (!element.className) return false;
      
      const classes = element.className.toLowerCase().split(/\s+/);
      return excludeClasses.some(excludeClass => 
        classes.includes(excludeClass) || 
        element.className.toLowerCase().includes(excludeClass)
      );
    }
    
    // 检查元素是否具有优先类
    hasPreferredClass(element, preferredClasses) {
      if (!element.className && !element.id) return false;
      
      // 检查类名
      if (element.className) {
        const classes = element.className.toLowerCase().split(/\s+/);
        const hasPreferredClass = preferredClasses.some(preferredClass => 
          classes.includes(preferredClass) || 
          element.className.toLowerCase().includes(preferredClass)
        );
        
        if (hasPreferredClass) return true;
      }
      
      // 检查ID
      if (element.id) {
        return preferredClasses.some(preferredClass => 
          element.id.toLowerCase().includes(preferredClass)
        );
      }
      
      return false;
    }
    
    // 计算子元素相似度
    calculateChildrenSimilarity(children) {
      if (children.length < 2) return 0;
      
      // 计算平均大小
      let totalWidth = 0, totalHeight = 0;
      children.forEach(child => {
        const rect = child.getBoundingClientRect();
        totalWidth += rect.width;
        totalHeight += rect.height;
      });
      
      const avgWidth = totalWidth / children.length;
      const avgHeight = totalHeight / children.length;
      
      // 计算标准差
      let widthVariance = 0, heightVariance = 0;
      children.forEach(child => {
        const rect = child.getBoundingClientRect();
        widthVariance += Math.pow(rect.width - avgWidth, 2);
        heightVariance += Math.pow(rect.height - avgHeight, 2);
      });
      
      const widthStdDev = Math.sqrt(widthVariance / children.length);
      const heightStdDev = Math.sqrt(heightVariance / children.length);
      
      // 计算变异系数(标准差/平均值)
      const widthCV = avgWidth ? widthStdDev / avgWidth : 1;
      const heightCV = avgHeight ? heightStdDev / avgHeight : 1;
      
      // 相似度 = 1 - 平均变异系数 (越低越相似)
      const similarityScore = 1 - (widthCV + heightCV) / 2;
      
      // 确保分数在0-1之间
      return Math.max(0, Math.min(1, similarityScore));
    }
    
    // 验证列表选择，确保我们选择的是列表容器而非列表项
    validateListSelection(listCandidate) {
      const element = listCandidate.element;
      const tagName = element.tagName.toLowerCase();
      
      // 标准列表容器直接返回
      if (tagName === 'ul' || tagName === 'ol' || tagName === 'table') {
        return listCandidate;
      }
      
      // 检查是否是列表项而非列表容器
      const parent = element.parentElement;
      if (parent && parent.tagName.toLowerCase() !== 'body') {
        // 查找相似兄弟元素
        const siblings = Array.from(parent.children).filter(child => 
          child.tagName === element.tagName
        );
        
        // 如果有多个相似兄弟，父元素可能是真正的列表容器
        if (siblings.length >= 3) {
          // 检查父元素是否已在候选列表中
          const parentAlreadyCandidate = this.lists.some(item => 
            item.element === parent
          );
          
          if (!parentAlreadyCandidate) {
            // 创建父元素的候选项
            const parentChildren = this.getValidChildren(parent);
            return {
              type: parent.tagName.toLowerCase(),
              element: parent,
              parent: parent.parentElement,
              children: parentChildren,
              goodClasses: this.getGoodClasses(parentChildren),
              area: listCandidate.area * 1.1,
              score: listCandidate.score * 1.2,
              selector: this.generateSelector(parent),
              childCount: parentChildren.length
            };
          }
        }
      }
      
      return listCandidate;
    }
    
    // 移除重复的列表选择
    removeDuplicateLists(lists) {
      const uniqueLists = [];
      const seenElements = new Set();
      
      for (const list of lists) {
        // 检查元素是否已经处理过
        if (!seenElements.has(list.element)) {
          seenElements.add(list.element);
          uniqueLists.push(list);
          
          // 同时标记此元素的所有子元素
          this.markAllChildren(list.element, seenElements);
        }
      }
      
      return uniqueLists;
    }
    
    // 将元素的所有子元素标记为已处理
    markAllChildren(element, seenSet) {
      for (const child of element.children) {
        seenSet.add(child);
        this.markAllChildren(child, seenSet);
      }
    }
    
    // 检查元素是否可见
    isElementVisible(element) {
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0' &&
             element.offsetWidth > 0 && 
             element.offsetHeight > 0;
    }
    
    // 获取元素的纯文本（排除子元素文本）
    getPureText(element) {
      let text = '';
      for (let node of element.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent;
        }
      }
      return text.trim();
    }
        
    // 清除所有"下一页"按钮的高亮和相关类
    clearAllNextButtonStyles() {
      // 清除悬停高亮
      document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
        el.classList.remove('listselector-next-btn-hover')
      );
      
      // 清除选中高亮
      document.querySelectorAll('.listselector-next-btn').forEach(el => 
        el.classList.remove('listselector-next-btn')
      );
      
      // 清除已保存的状态
      this.nextButtonSelector = null;
      if (this.selectedButton) {
        this.selectedButton = null;
      }
    }
  
  
    // 通过点击获取"下一页"按钮 - 修改过的方法
    getNextButtonByClick(callback) {
      // Create and show prompt to guide user
      const prompt = document.createElement('div');
      prompt.className = 'listselector-prompt';
      prompt.textContent = '请点击"下一页"按钮以选中';
      document.body.appendChild(prompt);
    
      // 确保从干净状态开始
      this.clearAllNextButtonStyles();
  
      // Track if this is our first selection
      let isFirstSelection = true;
      let selectedButton = null;
      let selectedSelector = null;
    
      // Hover handler to preview highlight potential buttons
      const hoverHandler = (e) => {
        const target = e.target.closest('a, button, span, div');
        if (target) {
          document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
            el.classList.remove('listselector-next-btn-hover')
          );
          target.classList.add('listselector-next-btn-hover');
        }
      };
    
      // Click handler for button selection
      const handleClick = (e) => {
        const target = e.target.closest('a, button, span, div');
        if (!target) return;
    
        if (isFirstSelection) {
          // First click: prevent default navigation and just select
          e.preventDefault();
          e.stopPropagation();
          
          // Generate selector BEFORE adding our custom classes
          selectedSelector = this.generateSelector(target);
          
          // Remove prompt and hover highlights
          document.body.removeChild(prompt);
          document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
            el.classList.remove('listselector-next-btn-hover')
          );
          
          // Highlight the selected button
          target.classList.add('listselector-next-btn');
          
          // Store the selected button
          selectedButton = target;
          
          // Remember this button for future
          if (typeof callback === 'function') {
            callback({ selector: selectedSelector, element: target });
          }
          
          // Change the flag for next click
          isFirstSelection = false;
          
          console.log('下一页按钮已选中，再次点击即可正常翻页');
          
          // Remove hover handler after selection to prevent hovering effects on other elements
          document.removeEventListener('mouseover', hoverHandler);
          
          // Keep only the click listener active for the second click
        } else if (target === selectedButton) {
          // Allow natural navigation on second click of the same button
          // We don't prevent default here so natural navigation works
          
          // Clean up event listeners
          document.removeEventListener('click', handleClick, true);
        }
      };
    
      // Add event listeners - note the capture phase (true) for click to ensure we catch it first
      document.addEventListener('mouseover', hoverHandler);
      document.addEventListener('click', handleClick, true);
      
      // Return a function to cancel the selection mode
      return () => {
        if (prompt.parentNode) {
          document.body.removeChild(prompt);
        }
        document.removeEventListener('mouseover', hoverHandler);
        document.removeEventListener('click', handleClick, true);
        document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
          el.classList.remove('listselector-next-btn-hover')
        );
      };
    }
    
    // Function to start the next button selection process
    startNextButtonSelection() {
      // First cancel any existing selection process
      if (this.cancelNextButtonSelection) {
        this.cancelNextButtonSelection();
        this.cancelNextButtonSelection = null;
      }
      
      // Start new selection process
      this.cancelNextButtonSelection = this.getNextButtonByClick((result) => {
        if (result) {
          console.log('Selected next button:', result.selector);
          // Store the selector for future use
          this.nextButtonSelector = result.selector;
  
          // 发送选择器到扩展的其他部分
          this.sendSelectorToExtension(result.selector);
        } 
      });
      
      console.log('请移动鼠标到下一页按钮并点击以选择它');
    }
      
    // 添加到ListSelector类中，用于传递选择器到扩展
    sendSelectorToExtension(selector) {
      console.log('选择器已通过事件发送:', selector);
      if (typeof callChromeBridgeInterface === 'function') {
        callChromeBridgeInterface("ScrapyJs.selected_nextPageBtn", { data: selector }, "CHROME_BRIDGE_POPUP");
      } else {
        // 备选方案：使用自定义事件
        let event = new CustomEvent('SELECTOR_SELECTED', { 
          detail: { 
            type: 'nextPageBtn',
            selector: selector 
          } 
        });
        window.dispatchEvent(event);
      }
    }
    
    // 发送表格数据到扩展
    sendTableDataToExtension(data) {
      console.log('表格数据已通过事件发送:', data);
      if (typeof callChromeBridgeInterface === 'function') {
        callChromeBridgeInterface("ScrapyJs.selected_tableData", { data: data }, "CHROME_BRIDGE_POPUP");
      } else {
        // 备选方案：使用自定义事件
        let event = new CustomEvent('SELECTOR_SELECTED', { 
          detail: { 
            type: 'tableData',
            data: data 
          } 
        });
        window.dispatchEvent(event);
      }
    }
      
    // 获取当前已选中"下一页"按钮的选择器
    getSelectedNextButtonSelector() {
      if (this.nextButtonSelector) {
        return this.nextButtonSelector;
      } else {
        console.log('尚未选择"下一页"按钮，请先使用startNextButtonSelection()方法');
        return null;
      }
    }
  
    detectNextButton() {
      const keywords = ['下一页', 'next', '>', '→', '前进'];
      const candidates = Array.from(document.querySelectorAll('a, button, span'))
        .filter(el => {
          const text = el.textContent.trim().toLowerCase();
          return keywords.some(k => text.includes(k)) && 
                 !el.closest('.pagination') && // 排除分页容器内的其他按钮
                 el.offsetWidth * el.offsetHeight > 50; // 确保有一定面积
        })
        .sort((a, b) => b.offsetLeft - a.offsetLeft); // 优先右侧按钮
      if (candidates.length) {
        const nextBtn = candidates[0];
        // Generate selector before adding our class
        const selector = this.generateSelector(nextBtn);
        nextBtn.classList.add('listselector-next-btn');
        return selector;
      }
      return null;
    }
        
  }
  
  // 使用示例
  var selector = new ListSelector({
    minChildren: 3,
    preferredMin: 10,
    preferredMax: 20,
    maxLists: 5,
  });
  
  console.log('scrapyJsHelper loaded', selector);
  
  // 获取所有表格
  // selector.detectLists();
  
  // 高亮第一个表格
  // selector.highlight(0); 
  
  // 切换到下一个表格
  // const nextTableSelector = selector.next();
  // console.log('下一个表格选择器:', nextTableSelector);
  // selector.getTableData()
    
  // 选择下一页按钮
  // selector.startNextButtonSelection();