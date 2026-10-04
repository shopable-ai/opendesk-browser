
import { SelectorUtils } from './selectorUtils.js';

/**
 * ListDetector - Handles detection of lists in the page
 * With improved generic detection and customizable selector patterns
 */
export class ListDetector {
  constructor(listSelector) {
    this.listSelector = listSelector;
    this.utils = new SelectorUtils();
    
    // Default configurations that can be overridden
    this.config = {
      // Common classes that indicate list containers
      listClasses: [
        'list', 'items', 'results', 'card', 'grid', 'gallery',
        'product', 'article', 'job', 'feed', 'content', 'collection',
        'directory', 'course', 'rank', 'item', 'container',
        'search-content', 'bottom-content', 'file-content'
      ],
      
      // Classes to exclude from list detection
      excludeClasses: [
        'nav', 'navbar', 'navigation', 'menu', 'submenu',
        'footer', 'header', 'banner', 'sidebar',
        'ad', 'ads', 'advertisement', 'social', 'share',
        'search', 'login', 'signup', 'modal', 'popup',
        'user-info', 'info', 'profile', 'subscribe'
      ],
      
      // Similarity threshold for considering elements as part of a list
      similarityThreshold: 0.5,
      
      // Area threshold for considering a container (in px²)
      minArea: 1000
    };
  }

  /**
   * Determine whether element matches a known special-case list structure.
   * Delegates to SelectorUtils when available.
   */
  isSpecialCase(element) {
    if (!element) {
      return false;
    }
    if (typeof this.utils.isSpecialCaseList === 'function') {
      return this.utils.isSpecialCaseList(element);
    }
    return false;
  }

  /**
   * Attempt to extract list items for special-case containers.
   */
  findSpecialCaseItems(element) {
    if (!element) {
      return [];
    }
    const specialPatterns = [
      { container: '.course-list', itemSelector: '.course-item, li, .item, .course-card' },
      { container: '.file-content', itemSelector: 'li, .file-item, .list-item' },
      { container: '.hot-sale-list', itemSelector: '.bottom-content > *' },
      { container: '.directory', itemSelector: 'li, a, .directory-item' },
      { container: '.search-content', itemSelector: '.result, .search-item, .item' },
      { container: '.subject-list', itemSelector: '.subject-item, li, .item' }
    ];

    const matchesPattern = (pattern) => {
      try {
        return element.matches(pattern.container) || element.querySelector(pattern.container);
      } catch {
        return false;
      }
    };

    for (const pattern of specialPatterns) {
      if (matchesPattern(pattern)) {
        const scope = element.matches(pattern.container) ? element : element.querySelector(pattern.container);
        if (!scope) {
          continue;
        }
        const items = scope.querySelectorAll(pattern.itemSelector);
        if (items.length > 0) {
          return Array.from(items).filter((item) => this.utils.isElementVisible(item));
        }
      }
    }

    return [];
  }
  
  /**
   * Update detector configuration
   * Can be called at any time to adjust detection parameters
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this.config;
  }
  
  /**
   * Add custom list classes to detect
   * Can be called before detectLists or at any time
   */
  addListClasses(classNames) {
    if (Array.isArray(classNames)) {
      this.config.listClasses = [...this.config.listClasses, ...classNames];
    } else if (typeof classNames === 'string') {
      this.config.listClasses.push(classNames);
    }
    return this.config.listClasses;
  }
  
  /**
   * Add classes to exclude from list detection
   * Can be called before detectLists or at any time
   */
  addExcludeClasses(classNames) {
    if (Array.isArray(classNames)) {
      this.config.excludeClasses = [...this.config.excludeClasses, ...classNames];
    } else if (typeof classNames === 'string') {
      this.config.excludeClasses.push(classNames);
    }
    return this.config.excludeClasses;
  }
  
  /**
   * Universal list detection method that works across various websites
   * Detects content lists based on DOM patterns and visual structure
   * Can accept optional customSelectors to prioritize specific patterns
  */
  detectLists(customSelectors = null) {
    console.log("Starting universal list detection...");
    console.log('dectect:', this.utils )
    const bodyArea = document.body.offsetWidth * document.body.offsetHeight;
    const candidates = [];
    
    // Prepare selectors based on configuration
    const listRelatedClasses = this.config.listClasses;
    const excludeClasses = this.config.excludeClasses;
    
    // Create list of selectors to try, combining defaults with any custom ones
    let selectors = [];
    
    // Add selectors for each list class
    listRelatedClasses.forEach(className => {
      selectors.push(`[class*="${className}"]`);
      selectors.push(`[id*="${className}"]`);
    });
    
    // Add standard list structure selectors
    selectors.push('ul', 'ol', 'table', 'dl');
    
    // Add common UI pattern selectors
    selectors.push('.el-carousel__container > .el-carousel__item'); // Carousel items
    selectors.push('div > a[class*="list"]'); // Link lists
    selectors.push('div > div[class*="item"]'); // Item containers
    
    // 特别处理包含"list"的类名 - 这些很可能是真正的列表
    const listSpecificSelectors = [
      '[class*="list"]', 
      '[class*="List"]',
      '[class*="items"]',
      '[class*="Items"]',
      '[class*="results"]',
      '[class*="Results"]',
      '[class*="grid"]',
      '[class*="Grid"]',
      '[class*="collection"]',
      '[class*="Collection"]'
    ];
    
    // 如果在类名中同时包含这些词，更有可能是列表
    const listClassCombinations = [
      '[class*="product"][class*="list"]',
      '[class*="article"][class*="list"]',
      '[class*="search"][class*="result"]',
      '[class*="item"][class*="container"]',
      '[class*="course"][class*="list"]',
      '[class*="card"][class*="list"]',
      '[class*="job"][class*="list"]'
    ];
    
    // 特别处理CSDN常见列表 - 这些是已知问题的直接修复
    const specialCaseSelectors = [
      '.course-list',  // 课程列表
      '.file-content', // 文件内容
      '.hot-sale-list .bottom-content', // 热销榜单
      '.directory',    // 目录
      '.search-content' // 搜索内容
    ];
    
    // 将所有列表特定选择器添加到选择器列表中
    selectors = [...specialCaseSelectors, ...selectors, ...listSpecificSelectors, ...listClassCombinations];
    
    // If custom selectors were provided, add them to the beginning with high priority
    if (customSelectors) {
      if (Array.isArray(customSelectors)) {
        selectors = [...customSelectors, ...selectors];
      } else if (typeof customSelectors === 'string') {
        selectors.unshift(customSelectors);
      }
    }
    
    // Track processed elements to avoid duplicates
    const processedElements = new Set();
    
    // ==================== APPROACH 1: Check previously marked elements ====================
    try {
      const markedElements = document.querySelectorAll('.listselector-highlight');
      for (const element of markedElements) {
        if (processedElements.has(element)) continue;
        
        const children = this.listSelector.getValidChildren(element);
        if (children.length >= this.listSelector.minChildren) {
          candidates.push({
            element,
            children,
            score: 100000, // Very high score for user-selected elements
            isMarked: true,
            selector: this.listSelector.generateSelector(element),
            childCount: children.length,
            area: element.offsetWidth * element.offsetHeight
          });
          processedElements.add(element);
        }

        // Also check for list items that might be marked as children
        const markedChildren = element.querySelectorAll('.listselector-highlight-child');
        if (markedChildren.length >= this.listSelector.minChildren) {
          candidates.push({
            element,
            children: Array.from(markedChildren),
            score: 95000, // High score but slightly lower than directly marked elements
            isMarkedChild: true,
            selector: this.listSelector.generateSelector(element),
            childCount: markedChildren.length,
            area: element.offsetWidth * element.offsetHeight
          });
        }
      }
    } catch (e) {
      console.error("Error processing marked elements:", e);
    }
    // ==================== APPROACH 2: Try all selectors ====================
    try {
      // First try any provided custom selectors with high priority
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        for (const element of elements) {
          if (processedElements.has(element) || 
              !this.utils.isElementVisible(element) || 
              this.utils.hasExcludedClass(element, excludeClasses)) {
            continue;
          }
          
          // 检查是否包含指示列表的类名
          const isStrongListIndicator = this.utils.hasListIndicatorClass(element);
          
          // 特殊处理一些已知的列表结构
          const isSpecialCase = this.isSpecialCase(element);
          
          // For containers with list class, check both children and nested items
          let children = this.listSelector.getValidChildren(element);
          
          // 对于特殊情况的列表，尝试查找嵌套的列表项
          if (isSpecialCase || isStrongListIndicator) {
            // 如果是特殊情况，检查是否有特定的嵌套结构
            if (isSpecialCase && children.length < this.listSelector.minChildren) {
              const nestedListItems = this.findSpecialCaseItems(element);
              if (nestedListItems.length >= this.listSelector.minChildren) {
                children = nestedListItems;
              }
            }
            
            // 即使子元素少于最小数量，也为特殊情况创建候选项
            if (children.length < this.listSelector.minChildren && isSpecialCase) {
              const rect = element.getBoundingClientRect();
              const area = rect.width * rect.height;
              
              if (area < this.config.minArea) continue; // Skip tiny elements
              
              // 对于特殊情况，使用较高的分数
              candidates.push({
                element,
                children,
                score: 300000, // 非常高的分数
                isSpecialCase: true,
                isListIndicator: isStrongListIndicator,
                selector: this.listSelector.generateSelector(element),
                childCount: children.length,
                area
              });
              
              processedElements.add(element);
              continue;
            }
          }
          
          // Skip if too few children
          if (children.length < this.listSelector.minChildren) {
            // Try finding nested list items for common patterns
            const nestedItems = this.findNestedListItems(element);
            
            if (nestedItems.length < this.listSelector.minChildren) continue;
            
            const rect = element.getBoundingClientRect();
            const area = rect.width * rect.height;
            
            if (area < this.config.minArea) continue; // Skip tiny elements
            
            const similarity = this.calculateSimilarityBetweenElements(nestedItems);
            let baseScore = area * Math.log(nestedItems.length + 1) * Math.max(0.5, similarity);
            
            // Higher score for custom selectors that matched
            const isCustom = customSelectors && (
              (Array.isArray(customSelectors) && customSelectors.includes(selector)) ||
              customSelectors === selector
            );
            
            // 如果有强烈的列表类名指示，提高分数
            if (isStrongListIndicator) {
              baseScore *= 2;
            }
            
            candidates.push({
              element,
              children: nestedItems,
              score: isCustom ? baseScore * 3 : baseScore * (isStrongListIndicator ? 2 : 1.2),
              similarity,
              selector: this.listSelector.generateSelector(element),
              childCount: nestedItems.length,
              area,
              isCustomSelector: isCustom,
              isListIndicator: isStrongListIndicator
            });
            
            processedElements.add(element);
            continue;
          }
          
          // Process elements with enough direct children
          const rect = element.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          if (area < this.config.minArea) continue; // Skip tiny elements
          
          const similarity = this.calculateSimilarityBetweenElements(children);
          let baseScore = area * Math.log(children.length + 1) * Math.max(0.5, similarity);
          
          // Higher score for custom selectors that matched
          const isCustom = customSelectors && (
            (Array.isArray(customSelectors) && customSelectors.includes(selector)) ||
            customSelectors === selector
          );
          
          // 如果有强烈的列表类名指示，提高分数
          if (isStrongListIndicator) {
            baseScore *= 2;
          }
          
          candidates.push({
            element,
            children,
            score: isCustom ? baseScore * 3 : baseScore * (isStrongListIndicator ? 2 : 1.2),
            similarity,
            selector: this.listSelector.generateSelector(element),
            childCount: children.length,
            area,
            isCustomSelector: isCustom,
            isListIndicator: isStrongListIndicator
          });
          
          processedElements.add(element);
        }
      }
    } catch (e) {
      console.error("Error processing selectors:", e);
    }

    // ==================== APPROACH 3: Find common parent of similar elements ====================
    try {
      // Get all visible elements
      const allElements = Array.from(document.querySelectorAll('*')).filter(el => 
        this.utils.isElementVisible(el) && !processedElements.has(el)
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
        if (elements.length < this.listSelector.minChildren) continue;
        
        // Group elements by their parent
        const elementsByParent = {};
        for (const element of elements) {
          if (!element.parentElement) continue;
          
          const parentSelector = this.listSelector.generateSelector(element.parentElement);
          elementsByParent[parentSelector] = elementsByParent[parentSelector] || [];
          elementsByParent[parentSelector].push(element);
        }
        
        // Check each parent with multiple children
        for (const parentSelector in elementsByParent) {
          const siblingElements = elementsByParent[parentSelector];
          
          if (siblingElements.length < this.listSelector.minChildren) continue;
          
          // Get parent element
          const parentElement = siblingElements[0].parentElement;
          
          // Skip if parent has exclusion classes or has been processed
          if (!parentElement || 
              processedElements.has(parentElement) || 
              this.utils.hasExcludedClass(parentElement, excludeClasses)) {
            continue;
          }
          
          // Calculate similarity between siblings
          const similarityScore = this.calculateSimilarityBetweenElements(siblingElements);
          
          // If siblings are similar enough, consider parent as a list container
          if (similarityScore > this.config.similarityThreshold) {
            const rect = parentElement.getBoundingClientRect();
            const area = rect.width * rect.height;
            
            if (area < this.config.minArea) continue; // Skip tiny containers
            
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
    } catch (e) {
      console.error("Error finding common parents:", e);
    }

    // ==================== APPROACH 4: Visual pattern detection ====================
    try {
      // Find containers with visually aligned children
      const allContainers = Array.from(document.querySelectorAll('div, section, article, main, aside'))
        .filter(el => !processedElements.has(el) && this.utils.isElementVisible(el) && 
                !this.utils.hasExcludedClass(el, excludeClasses));
      
      for (const container of allContainers) {
        const children = this.listSelector.getValidChildren(container);
        
        if (children.length < this.listSelector.minChildren) continue;
        
        // Check if children have visual alignment patterns
        const alignmentInfo = this.detectVisualAlignment(children);
        
        if (alignmentInfo.aligned) {
          const rect = container.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          if (area < this.config.minArea) continue; // Skip tiny elements
          
          candidates.push({
            element: container,
            children,
            score: area * Math.log(children.length + 1) * alignmentInfo.score * 1.3, // Bonus for visual alignment
            alignment: alignmentInfo.score,
            isGrid: alignmentInfo.isGrid,
            selector: this.listSelector.generateSelector(container),
            childCount: children.length,
            area
          });
          
          processedElements.add(container);
        }
      }
    } catch (e) {
      console.error("Error detecting visual patterns:", e);
    }

    // ==================== APPROACH 5: Check containers with A tags as direct children ====================
    try {
      // Look for containers with multiple A elements as direct children
      const potentialLinkLists = Array.from(document.querySelectorAll('div, section, article'))
        .filter(el => !processedElements.has(el) && this.utils.isElementVisible(el) && 
                !this.utils.hasExcludedClass(el, excludeClasses));
      
      for (const container of potentialLinkLists) {
        // Look specifically for <a> tags as direct children - common pattern in many websites
        const linkChildren = Array.from(container.children).filter(child => 
          child.tagName.toLowerCase() === 'a' && this.utils.isElementVisible(child)
        );
        
        if (linkChildren.length >= this.listSelector.minChildren) {
          const rect = container.getBoundingClientRect();
          const area = rect.width * rect.height;
          
          if (area < this.config.minArea) continue; // Skip tiny containers
          
          // Check for similarity in structure/visual alignment
          const similarity = this.calculateSimilarityBetweenElements(linkChildren);
          const alignmentInfo = this.detectVisualAlignment(linkChildren);
          
          // Use the max of calculated similarity or alignment score
          const finalScore = Math.max(similarity, alignmentInfo.score);
          
          if (finalScore > 0.4) { // Lower threshold for link lists
            candidates.push({
              element: container,
              children: linkChildren,
              score: area * Math.log(linkChildren.length + 1) * finalScore * 1.7, // Higher bonus for link lists
              similarity: finalScore,
              isLinkList: true,
              selector: this.listSelector.generateSelector(container),
              childCount: linkChildren.length,
              area
            });
            
            processedElements.add(container);
          }
        }
      }
    } catch (e) {
      console.error("Error detecting link lists:", e);
    }

    // ==================== APPROACH 6: Check parent-child structure similarity ====================
    try {
      this.findRepeatingStructures(document.body, candidates, processedElements);
    } catch (e) {
      console.error("Error in repeating structure detection:", e);
    }

    // ==================== FINALIZE CANDIDATES ====================
    
    // If we still have no candidates, try one final direct search for job/product cards
    if (candidates.length === 0) {
      try {
        // Last-ditch effort: search for common item patterns
        const itemSelectors = this.config.listClasses.map(cls => `[class*="${cls}"]`).join(', ');
        const cardElements = document.querySelectorAll(itemSelectors);
        
        if (cardElements.length >= this.listSelector.minChildren) {
          // Group cards by parent
          const parentMap = new Map();
          
          cardElements.forEach(card => {
            const parent = card.parentElement;
            if (!parent || this.utils.hasExcludedClass(parent, excludeClasses)) return;
            
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
          
          // Find parent with most cards
          let bestParent = null;
          let maxCount = 0;
          
          for (const [parent, info] of parentMap.entries()) {
            if (info.count > maxCount && info.count >= this.listSelector.minChildren) {
              maxCount = info.count;
              bestParent = info;
            }
          }
          
          // Add best parent to candidates
          if (bestParent && this.utils.isElementVisible(bestParent.element)) {
            const rect = bestParent.element.getBoundingClientRect();
            const area = rect.width * rect.height;
            
            candidates.push({
              element: bestParent.element,
              children: bestParent.children,
              score: area * bestParent.count,
              selector: this.listSelector.generateSelector(bestParent.element),
              childCount: bestParent.count,
              area,
              isEmergencyFallback: true
            });
          }
        }
      } catch (e) {
        console.error("Error in emergency detection:", e);
      }
    }

    // Sort candidates by score
    candidates.sort((a, b) => b.score - a.score);
    
    // Take top candidates
    const selectedLists = candidates.slice(0, this.listSelector.maxLists);
    
    // Remove nested and duplicate lists
    this.listSelector.lists = this.removeDuplicateLists(selectedLists);
    this.listSelector.lists = this.filterNestedLists(this.listSelector.lists);
    
    console.log("List detection complete. Found", this.listSelector.lists.length, "lists");
    console.log("Lists:", this.listSelector.lists.map(list => ({
      selector: list.selector,
      childCount: list.childCount,
      score: list.score,
      similarity: list.similarity || "N/A",
      isCustom: list.isCustomSelector || false
    })));
    
    return this.listSelector.lists;
  }
  
  
  /**
   * Find nested list items inside a container
   * Handles common patterns where list items are not direct children
   */
  findNestedListItems(container) {
    let items = [];
    
    // Check for common list item patterns
    const itemCandidates = Array.from(container.querySelectorAll(
      // Common list item selectors
      'li, .item, [class*="item"], [class*="card"], [class*="result"], ' +
      'tr, .rank-list, [class*="rank"], [class*="list-item"], [class*="product"]'
    ));
    
    if (itemCandidates.length >= this.listSelector.minChildren) {
      // Group by parent to find the most common parent level
      const parentGroups = {};
      
      itemCandidates.forEach(item => {
        // Get all parent levels up to the container
        let currentParent = item.parentElement;
        let level = 1;
        
        while (currentParent && currentParent !== container && level <= 3) {
          const key = `level-${level}`;
          parentGroups[key] = parentGroups[key] || [];
          parentGroups[key].push(item);
          
          currentParent = currentParent.parentElement;
          level++;
        }
      });
      
      // Find the level with the most items
      let maxItems = 0;
      let bestLevel = null;
      
      for (const level in parentGroups) {
        if (parentGroups[level].length > maxItems) {
          maxItems = parentGroups[level].length;
          bestLevel = level;
        }
      }
      
      if (bestLevel && parentGroups[bestLevel].length >= this.listSelector.minChildren) {
        items = parentGroups[bestLevel];
      } else {
        // Fallback: use all item candidates
        items = itemCandidates;
      }
    }
    
    return items;
  }
  
  /**
   * Helper method to find repeating structures
   */
  findRepeatingStructures(rootElement, candidates, processedElements, depth = 0) {
    if (depth > 3) return; // Limit recursion depth

    // Skip invisible elements
    if (!this.utils.isElementVisible(rootElement)) return;

    const children = this.listSelector.getValidChildren(rootElement);

    // Check if this element's children form a list
    if (children.length >= this.listSelector.minChildren) {
      // Calculate structure similarity
      const structureSimilarity = this.calculateStructureSimilarity(children);

      // If children have similar structure, consider this a list
      if (structureSimilarity > this.config.similarityThreshold) {
        const rect = rootElement.getBoundingClientRect();
        const area = rect.width * rect.height;

        // Only add if not tiny and not already processed
        if (area > this.config.minArea && !processedElements.has(rootElement) && 
            !this.utils.hasExcludedClass(rootElement, this.config.excludeClasses)) {
          candidates.push({
            element: rootElement,
            children,
            area,
            score: area * structureSimilarity * Math.log(children.length + 1),
            similarity: structureSimilarity,
            structureSimilarity,
            selector: this.listSelector.generateSelector(rootElement),
            childCount: children.length
          });
          
          processedElements.add(rootElement);
        }
      }
    }

    // Continue recursion with a subset of children to avoid performance issues
    const childrenToProcess = children.slice(0, 10); // Limit to first 10 children
    for (const child of childrenToProcess) {
      this.findRepeatingStructures(child, candidates, processedElements, depth + 1);
    }
  }

  /**
   * Calculate structure similarity between elements
   */
  calculateStructureSimilarity(elements) {
    if (elements.length < 3) return 0;
    
    // Analyze DOM structure
    const structureSignatures = [];
    
    for (const el of elements) {
      // Create a simple signature of element's structure
      let signature = '';
      signature += `tag:${el.tagName}`;
      signature += `,children:${el.children.length}`;
      
      // Add child tag types
      const childTags = Array.from(el.children).map(child => child.tagName);
      signature += `,childTypes:${childTags.join('|')}`;
      
      // Count certain element types
      signature += `,imgs:${el.querySelectorAll('img').length}`;
      signature += `,links:${el.querySelectorAll('a').length}`;
      
      structureSignatures.push(signature);
    }
    
    // Count occurrences of each signature
    const signatureCounts = {};
    structureSignatures.forEach(sig => {
      signatureCounts[sig] = (signatureCounts[sig] || 0) + 1;
    });
    
    // Find the most common signature and its frequency
    let maxCount = 0;
    for (const count of Object.values(signatureCounts)) {
      maxCount = Math.max(maxCount, count);
    }
    
    // Calculate similarity as the ratio of elements with the most common structure
    return maxCount / elements.length;
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
    if (elements.length === 0) return 0;
    
    // Get element dimensions
    const dimensions = elements.map(el => {
      const rect = el.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    
    // Calculate average dimensions
    const avgWidth = dimensions.reduce((sum, dim) => sum + dim.width, 0) / dimensions.length;
    const avgHeight = dimensions.reduce((sum, dim) => sum + dim.height, 0) / dimensions.length;
    
    if (avgWidth === 0 || avgHeight === 0) return 0;
    
    // Calculate deviations from average
    const deviations = dimensions.map(dim => {
      const widthDev = Math.abs(dim.width - avgWidth) / avgWidth;
      const heightDev = Math.abs(dim.height - avgHeight) / avgHeight;
      return (widthDev + heightDev) / 2;
    });
    
    // Average deviation (lower is better)
    const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;
    
    // Convert to similarity score (0-1)
    return Math.max(0, 1 - avgDeviation);
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
   * Remove nested lists, prioritizing more focused content lists
   */
  filterNestedLists(candidates) {
    const result = [];
    const visited = new Set();

    // 首先，优先处理特殊情况的列表（如CSDN的course-list）
    const specialCaseCandidates = candidates.filter(c => c.isSpecialCase);
    for (const candidate of specialCaseCandidates) {
      if (!visited.has(candidate.element)) {
        result.push(candidate);
        visited.add(candidate.element);
        
        // 对于特殊情况，我们不标记其祖先元素为已访问
        // 因为我们可能需要同时保留父元素和子元素
        this.markAllChildren(candidate.element, visited);
      }
    }
    
    // 然后，优先处理有明确列表类名指示的元素
    const listIndicatorCandidates = candidates.filter(c => c.isListIndicator && !visited.has(c.element));
    for (const candidate of listIndicatorCandidates) {
      if (!visited.has(candidate.element)) {
        result.push(candidate);
        visited.add(candidate.element);
        
        // 标记所有祖先和子元素为已访问以避免重复
        // 但对于特殊列表类型，保留处理祖先的可能性
        if (!this.isSpecialCase(candidate.element)) {
          this.markAllAncestors(candidate.element, visited);
        }
        this.markAllChildren(candidate.element, visited);
      }
    }

    // 接着处理自定义选择器匹配的元素
    const customMatches = candidates.filter(c => c.isCustomSelector && !visited.has(c.element));
    for (const candidate of customMatches) {
      if (!visited.has(candidate.element)) {
        result.push(candidate);
        visited.add(candidate.element);
        
        // 标记所有子元素为已访问以避免重复
        // 但对于自定义选择器，我们也允许其祖先或子元素可能是列表
        this.markAllChildren(candidate.element, visited);
      }
    }
    
    // 最后处理剩余的候选项（按分数排序）
    // 首先对剩余候选项按分数排序
    const remainingCandidates = candidates
      .filter(c => !visited.has(c.element))
      .sort((a, b) => b.score - a.score);
    
    for (const candidate of remainingCandidates) {
      if (visited.has(candidate.element)) continue;

      // 检查此元素是否是另一个元素的子元素
      let isChild = false;
      for (const other of candidates) {
        if (other.element !== candidate.element &&
            other.element.contains(candidate.element)) {
          // 如果是子元素且质量更好，标记父元素为已访问
          if ((candidate.isMarkedChild || candidate.similarity > this.config.similarityThreshold ||
              (candidate.childCount >= this.listSelector.minChildren &&
               candidate.childCount <= this.listSelector.preferredMax)) &&
              !other.isMarkedChild && !other.isCustomSelector && !other.isListIndicator && !other.isSpecialCase) {
            visited.add(other.element);
            isChild = true;
          }
        }
      }

      // 如果不是子元素或者是高质量子元素，添加到结果中
      if (!isChild && !visited.has(candidate.element)) {
        result.push(candidate);
        visited.add(candidate.element);
        
        // 标记所有子元素为已访问
        this.markAllChildren(candidate.element, visited);
      }
    }

    // 确保至少返回一个列表（如果有候选项的话）
    return result.length > 0 ? result : candidates.slice(0, 1);
  }
  
  /**
   * Mark all ancestor elements as seen
   */
  markAllAncestors(element, seenSet) {
    let parent = element.parentElement;
    while (parent) {
      seenSet.add(parent);
      parent = parent.parentElement;
    }
  }
  
  /**
   * Mark all children of an element as seen
   */
  markAllChildren(element, seenSet) {
    for (const child of element.children) {
      seenSet.add(child);
      this.markAllChildren(child, seenSet);
    }
  }
  
  /**
   * Remove duplicate lists from candidates
   */
  removeDuplicateLists(lists) {
    const uniqueLists = [];
    const seenElements = new Set();
    
    // 首先处理带有列表类名标识的候选项
    const listIndicatorLists = lists.filter(list => list.isListIndicator);
    
    // Then handle custom selector matches
    const customMatches = lists.filter(list => 
      list.isCustomSelector && !listIndicatorLists.includes(list)
    );
    
    // Then handle marked elements
    const markedLists = lists.filter(list => 
      list.isMarked && 
      !customMatches.includes(list) && 
      !listIndicatorLists.includes(list)
    );
    
    // Then handle remaining lists
    const regularLists = lists.filter(list => 
      !customMatches.includes(list) && 
      !markedLists.includes(list) && 
      !listIndicatorLists.includes(list)
    );
    
    // Process in priority order
    const orderedLists = [...listIndicatorLists, ...customMatches, ...markedLists, ...regularLists];
    
    for (const list of orderedLists) {
      if (!seenElements.has(list.element)) {
        seenElements.add(list.element);
        uniqueLists.push(list);
        
        // Mark all child elements as seen
        this.markAllChildren(list.element, seenElements);
      }
    }
    
    return uniqueLists;
  }
  
  
  /**
   * Mark all children of an element as seen
   */
  markAllChildren(element, seenSet) {
    for (const child of element.children) {
      seenSet.add(child);
      this.markAllChildren(child, seenSet);
    }
  }
  
  /**
   * Detect grid-like or row-like visual patterns
   */
  detectVisualPatterns(candidates) {
    // Get all elements with multiple children
    const containers = Array.from(document.querySelectorAll('*')).filter(el =>
      this.utils.isElementVisible(el) &&
      this.listSelector.getValidChildren(el).length >= this.listSelector.minChildren
    );

    for (const container of containers) {
      // Skip if already in candidates
      if (candidates.some(c => c.element === container)) continue;

      const children = this.listSelector.getValidChildren(container);

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
          goodClasses: this.utils.getGoodClasses(children),
          area,
          score: area * alignment.score * Math.log(children.length + 1),
          alignment: alignment.score,
          isGrid: alignment.isGrid,
          selector: this.listSelector.generateSelector(container),
          childCount: children.length
        });
      }
    }
  }

  /**
   * Calculate how well elements are visually aligned
   */
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

  /**
   * Check if a container has a standard list structure
   */
  isStandardListStructure(container) {
    const tagName = container.tagName.toLowerCase();
    
    // ul or ol containing mostly li elements
    if (tagName === 'ul' || tagName === 'ol') {
      const children = Array.from(container.children);
      if (children.length === 0) return false;
      
      const liCount = children.filter(child => child.tagName.toLowerCase() === 'li').length;
      return liCount >= children.length * 0.7; // At least 70% are li
    }
    
    // table with tr elements
    if (tagName === 'table') {
      const rows = container.querySelectorAll('tr');
      return rows.length >= 2; // At least header row and data row
    }
    
    // div list: check child tag and class consistency
    if (tagName === 'div') {
      const children = Array.from(container.children);
      if (children.length < 3) return false;
      
      // Check child tag consistency
      const tags = {};
      children.forEach(child => {
        const tag = child.tagName.toLowerCase();
        tags[tag] = (tags[tag] || 0) + 1;
      });
      
      // Find most common tag and its ratio
      let maxTag = '', maxCount = 0;
      for (const tag in tags) {
        if (tags[tag] > maxCount) {
          maxTag = tag;
          maxCount = tags[tag];
        }
      }
      
      const tagConsistency = maxCount / children.length;
      
      // Check class consistency
      const classes = {};
      children.forEach(child => {
        if (!child.className) return;
        
        // Extract first class as main class
        const mainClass = child.className.trim().split(/\s+/)[0];
        if (mainClass) {
          classes[mainClass] = (classes[mainClass] || 0) + 1;
        }
      });
      
      // Find most common class and its ratio
      let maxClass = '', maxClassCount = 0;
      for (const cls in classes) {
        if (classes[cls] > maxClassCount) {
          maxClass = cls;
          maxClassCount = classes[cls];
        }
      }
      
      const classConsistency = maxClassCount / children.length;
      
      // Combined tag and class consistency assessment
      return tagConsistency > 0.7 || classConsistency > 0.6;
    }
    
    return false;
  }

  /**
   * Check if a container has repeating class patterns in its children
   */
  hasRepeatingClassPatterns(children) {
    if (children.length < 3) return false;
    
    // Check for class name patterns
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
    
    // Calculate repetition ratio
    const repeatRatio = totalPatternsFound / children.length;
    return repeatRatio > 0.5; // If over 50% have the same class pattern, consider it a list
  }

  /**
   * Validate list selection to ensure we're selecting a list container, not a list item
   */
  validateListSelection(listCandidate) {
    const element = listCandidate.element;
    const tagName = element.tagName.toLowerCase();
    
    // Standard list containers are returned as is
    if (tagName === 'ul' || tagName === 'ol' || tagName === 'table') {
      return listCandidate;
    }
    
    // Check if this is a list item rather than a list container
    const parent = element.parentElement;
    if (parent && parent.tagName.toLowerCase() !== 'body') {
      // Look for similar sibling elements
      const siblings = Array.from(parent.children).filter(child => 
        child.tagName === element.tagName
      );
      
      // If there are multiple similar siblings, the parent may be the real list container
      if (siblings.length >= 3) {
        // Check if parent is already a candidate
        const parentAlreadyCandidate = this.listSelector.lists.some(item => 
          item.element === parent
        );
        
        if (!parentAlreadyCandidate) {
          // Create a candidate entry for the parent
          const parentChildren = this.listSelector.getValidChildren(parent);
          return {
            type: parent.tagName.toLowerCase(),
            element: parent,
            parent: parent.parentElement,
            children: parentChildren,
            goodClasses: this.utils.getGoodClasses(parentChildren),
            area: listCandidate.area * 1.1,
            score: listCandidate.score * 1.2,
            selector: this.listSelector.generateSelector(parent),
            childCount: parentChildren.length
          };
        }
      }
    }
    
    return listCandidate;
  }
}
