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
  
    // List-related terms for priority detection
    const listTerms = [
      'list', 'items', 'results', 'video-list', 'card', 'grid', 'gallery',
      'product', 'article', 'job', 'feed', 'content', 'collection'
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
  
    // ==================== APPROACH 2: Look for elements with list-related classes or IDs ====================
    try {
      // Create combined selector for list-related terms
      const listClassSelectors = listTerms.map(term => `[class*="${term}"]`);
      const listIdSelectors = listTerms.map(term => `[id*="${term}"]`);
      const combinedSelector = [...listClassSelectors, ...listIdSelectors].join(', ');
      
      const listRelatedElements = document.querySelectorAll(combinedSelector);
      
      for (const element of listRelatedElements) {
        if (processedElements.has(element) || !this.isElementVisible(element)) continue;
        
        // Skip elements with exclusion classes
        if (this.hasExcludedClass(element, excludeClasses)) continue;
        
        const children = this.getValidChildren(element);
        if (children.length >= this.minChildren) {
          const rect = element.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          if (area < 1000) continue; // Skip tiny containers
          
          // Calculate similarity score
          const similarity = this.calculateSimilarityBetweenElements(children);
          const priority = this.calculatePriorityScore(element);
          
          candidates.push({
            element,
            children,
            score: area * Math.log(children.length + 1) * similarity * (1 + priority) * 1.5,
            similarity,
            isPrioritySelector: priority > 0,
            selector: this.generateSelector(element),
            childCount: children.length,
            area
          });
          
          processedElements.add(element);
        }
      }
    } catch (e) {
      console.error("Error finding list-related elements:", e);
    }
  
    // ==================== APPROACH 3: Standard list structures (ul, ol, table) ====================
    try {
      // Look for standard HTML list structures
      const standardLists = document.querySelectorAll('ul, ol, table, dl, div.video-list, div.list, div.cards, div.results');
      
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
        const priority = this.calculatePriorityScore(element);
        
        candidates.push({
          element,
          children,
          score: area * Math.log(children.length + 1) * (1 + similarity) * (1 + priority) * 2, // Bonus for standard lists
          similarity,
          isStandardList: true,
          isPrioritySelector: priority > 0,
          selector: this.generateSelector(element),
          childCount: children.length,
          area
        });
        
        processedElements.add(element);
      }
    } catch (e) {
      console.error("Error detecting standard lists:", e);
    }
  
    // ==================== APPROACH 4: Find common parent of similar elements ====================
    try {
      // Get all visible elements that could be list items
      const potentialListItems = Array.from(document.querySelectorAll('.col_3, .card, .item, li, tr, .video-card, article, .product'))
        .filter(el => this.isElementVisible(el) && !processedElements.has(el));
      
      // Group by parent
      const elementsByParent = {};
      for (const element of potentialListItems) {
        if (!element.parentElement) continue;
        
        const parentSelector = this.generateSelector(element.parentElement);
        if (!elementsByParent[parentSelector]) {
          elementsByParent[parentSelector] = {
            parent: element.parentElement,
            children: []
          };
        }
        elementsByParent[parentSelector].children.push(element);
      }
      
      // Check each parent with multiple children
      for (const parentSelector in elementsByParent) {
        const info = elementsByParent[parentSelector];
        const parentElement = info.parent;
        const siblingElements = info.children;
        
        if (siblingElements.length < this.minChildren || 
            processedElements.has(parentElement) ||
            this.hasExcludedClass(parentElement, excludeClasses)) {
          continue;
        }
        
        const similarity = this.calculateSimilarityBetweenElements(siblingElements);
        if (similarity > 0.3) { // Require some similarity
          const rect = parentElement.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          if (area < 1000) continue; // Skip tiny containers
          
          const priority = this.calculatePriorityScore(parentElement);
          
          candidates.push({
            element: parentElement,
            children: siblingElements,
            score: area * Math.log(siblingElements.length + 1) * similarity * (1 + priority) * 1.3,
            similarity,
            isPrioritySelector: priority > 0,
            selector: this.generateSelector(parentElement),
            childCount: siblingElements.length,
            area
          });
          
          processedElements.add(parentElement);
        }
      }
    } catch (e) {
      console.error("Error finding common parents:", e);
    }
  
    // ==================== APPROACH 5: Visual pattern detection (grid/row layouts) ====================
    try {
      // Find large visible containers
      const containers = Array.from(document.querySelectorAll('div, section, article, main'))
        .filter(el => {
          if (processedElements.has(el) || !this.isElementVisible(el)) return false;
          
          const rect = el.getBoundingClientRect();
          return rect.width * rect.height > 5000; // Consider only reasonably sized containers
        });
      
      for (const container of containers) {
        const children = this.getValidChildren(container);
        
        if (children.length < this.minChildren) continue;
        
        // Check for visual alignment patterns
        const alignmentInfo = this.detectVisualAlignment(children);
        
        if (alignmentInfo.aligned) {
          const rect = container.getBoundingClientRect();
          const area = rect.width * rect.height;
          const priority = this.calculatePriorityScore(container);
          
          candidates.push({
            element: container,
            children,
            score: area * Math.log(children.length + 1) * alignmentInfo.score * (1 + priority) * 1.4,
            alignment: alignmentInfo.score,
            isGrid: alignmentInfo.isGrid,
            isPrioritySelector: priority > 0,
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
  
    // ==================== APPROACH 6: Check for element class/structure consistency ====================
    try {
      // Find containers with 3+ children
      const containers = Array.from(document.querySelectorAll('div, section, article'))
        .filter(el => {
          if (processedElements.has(el) || !this.isElementVisible(el)) return false;
          
          const children = this.getValidChildren(el);
          return children.length >= this.minChildren;
        });
      
      for (const container of containers) {
        if (processedElements.has(container)) continue;
        
        const children = this.getValidChildren(container);
        
        // Check for class consistency
        const classPatterns = this.hasRepeatingClassPatterns(children);
        const sizeSimilarity = this.calculateSizeSimilarity(children);
        
        if (classPatterns || sizeSimilarity > 0.7) {
          const rect = container.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          if (area < 2000) continue; // Skip tiny containers
          
          const priority = this.calculatePriorityScore(container);
          const multiplier = classPatterns ? 1.2 : 1.0;
          
          candidates.push({
            element: container,
            children,
            score: area * Math.log(children.length + 1) * sizeSimilarity * multiplier * (1 + priority),
            sizeSimilarity,
            hasClassPatterns: classPatterns,
            isPrioritySelector: priority > 0,
            selector: this.generateSelector(container),
            childCount: children.length,
            area
          });
          
          processedElements.add(container);
        }
      }
    } catch (e) {
      console.error("Error checking element consistency:", e);
    }
  
    // ==================== APPROACH 7: Emergency fallback for Bilibili and other video sites ====================
    if (candidates.length < 2) {
      try {
        // Look specifically for video-card containers (Bilibili specific)
        const videoCardContainers = [];
        
        // 1. Find all video card elements
        const videoCards = document.querySelectorAll('.bili-video-card, .video-card, .video-item, .card');
        
        if (videoCards.length >= this.minChildren) {
          // Group by parent
          const parentMap = new Map();
          
          videoCards.forEach(card => {
            const parent = card.parentElement;
            if (!parent) return;
            
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
          });
          
          // Find parents with multiple video cards
          for (const [parent, info] of parentMap.entries()) {
            if (info.count >= this.minChildren && this.isElementVisible(parent)) {
              const rect = parent.getBoundingClientRect();
              const area = rect.width * rect.height;
              
              videoCardContainers.push({
                element: parent,
                children: info.children,
                count: info.count,
                area
              });
            }
          }
          
          // Take the container with the most cards or the largest area
          videoCardContainers.sort((a, b) => {
            // Prioritize by count, then by area
            if (b.count !== a.count) return b.count - a.count;
            return b.area - a.area;
          });
          
          if (videoCardContainers.length > 0) {
            const bestContainer = videoCardContainers[0];
            candidates.push({
              element: bestContainer.element,
              children: bestContainer.children,
              score: bestContainer.area * Math.log(bestContainer.count + 1) * 3, // High score for emergency detection
              selector: this.generateSelector(bestContainer.element),
              childCount: bestContainer.count,
              area: bestContainer.area,
              isBilibiliEmergency: true
            });
          }
        }
        
        // 2. Also try to find row/col structure which is common in Bilibili
        const rowColContainers = document.querySelectorAll('.row, .col-container, .video-list');
        
        for (const container of rowColContainers) {
          if (processedElements.has(container) || !this.isElementVisible(container)) continue;
          
          const children = this.getValidChildren(container);
          if (children.length >= this.minChildren) {
            const rect = container.getBoundingClientRect();
            const area = rect.width * rect.height;
            
            candidates.push({
              element: container,
              children,
              score: area * Math.log(children.length + 1) * 2.5, // High score for emergency detection
              selector: this.generateSelector(container),
              childCount: children.length,
              area,
              isBilibiliEmergency: true
            });
            
            processedElements.add(container);
          }
        }
      } catch (e) {
        console.error("Error in Bilibili emergency detection:", e);
      }
    }
  
    // ==================== APPROACH 8: Final fallback for any site ====================
    if (candidates.length === 0) {
      try {
        // Find any large container with 3+ similar-sized children
        const containers = Array.from(document.querySelectorAll('div, section, article, main'))
          .filter(el => {
            if (!this.isElementVisible(el)) return false;
            
            const rect = el.getBoundingClientRect();
            return rect.width * rect.height > bodyArea * 0.1; // Only consider large containers
          })
          .sort((a, b) => {
            // Sort by area, largest first
            const areaA = a.offsetWidth * a.offsetHeight;
            const areaB = b.offsetWidth * b.offsetHeight;
            return areaB - areaA;
          })
          .slice(0, 20); // Check only the 20 largest containers
        
        for (const container of containers) {
          if (processedElements.has(container)) continue;
          
          const children = this.getValidChildren(container);
          
          if (children.length >= this.minChildren) {
            const sizeSimilarity = this.calculateSizeSimilarity(children);
            
            if (sizeSimilarity > 0.5) { // Lower threshold for fallback
              const rect = container.getBoundingClientRect();
              const area = rect.width * rect.height;
              
              candidates.push({
                element: container,
                children,
                score: area * sizeSimilarity,
                sizeSimilarity,
                selector: this.generateSelector(container),
                childCount: children.length,
                area,
                isFallback: true
              });
              
              processedElements.add(container);
            }
          }
        }
      } catch (e) {
        console.error("Error in final fallback detection:", e);
      }
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
    
    return this.lists;
  }
  
  /**
   * Calculate priority score for elements based on their class/id names
   * Higher score = higher priority for content lists
   */
  calculatePriorityScore(element) {
    if (!element) return 0;
    
    // High priority keywords for content lists
    const highPriorityTerms = [
      'video-list', 'content-list', 'search-result', 'items', 
      'product-list', 'article-list', 'job-list', 'search-all-list',
      'video-list-row', 'course-list', 'file-content'
    ];
    
    // Check classes
    const classes = element.className ? element.className.toLowerCase().split(/\s+/) : [];
    for (const cls of classes) {
      for (const term of highPriorityTerms) {
        if (cls.includes(term)) {
          return 2.0; // High priority
        }
      }
    }
    
    // Check ID
    const id = element.id ? element.id.toLowerCase() : '';
    for (const term of highPriorityTerms) {
      if (id.includes(term)) {
        return 1.5; // Medium-high priority
      }
    }
    
    return 0; // No priority boost
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
    const rows = this.groupElementsByPosition(rects, 'top', 20); // Increased tolerance
    
    // Group elements by horizontal position (columns)
    const columns = this.groupElementsByPosition(rects, 'left', 20); // Increased tolerance
    
    // Check if elements form a grid pattern
    const isGrid = rows.length > 1 && columns.length > 1;
    
    // Calculate alignment score based on how many elements are in aligned rows/columns
    let alignedElements = 0;
    let validRows = 0;
    
    for (const row of rows) {
      if (row.length >= 2) { // Row has multiple elements
        alignedElements += row.length;
        validRows++;
      }
    }
    
    // Calculate ratio of aligned elements
    const alignmentScore = elements.length > 0 ? alignedElements / elements.length : 0;
    
    // Add bonus for multiple aligned rows (grid layouts)
    const rowBonus = validRows > 1 ? 0.2 : 0;
    
    return {
      aligned: alignmentScore > 0.6 || (isGrid && alignmentScore > 0.4), // Lower threshold for grids
      score: Math.min(1, alignmentScore + rowBonus),
      isGrid: isGrid,
      rowCount: rows.length,
      columnCount: columns.length
    };
  }
  
  /**
   * Group elements by position coordinate with tolerance
   */
  groupElementsByPosition(rects, prop, tolerance) {
    // Sort by position
    const indices = Array.from(rects.keys());
    indices.sort((a, b) => rects[a][prop] - rects[b][prop]);
    
    // Create clusters
    const clusters = [];
    let currentCluster = [indices[0]];
    let referencePos = rects[indices[0]][prop];
    
    for (let i = 1; i < indices.length; i++) {
      const idx = indices[i];
      const pos = rects[idx][prop];
      
      if (Math.abs(pos - referencePos) <= tolerance) {
        // Add to current cluster
        currentCluster.push(idx);
      } else {
        // Start new cluster
        clusters.push(currentCluster);
        currentCluster = [idx];
        referencePos = pos;
      }
    }
    
    // Add the last cluster
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }
    
    return clusters;
  }
  
  /**
   * Check if elements have repeating class patterns
   */
  hasRepeatingClassPatterns(children) {
    if (children.length < 3) return false;
    
    // Count class patterns
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
    
    // Calculate repeat ratio
    const repeatRatio = totalPatternsFound / children.length;
    return repeatRatio > 0.4; // If over 40% of elements have same class pattern
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