import { SelectorUtils } from './selectorUtils.js';

/**
 * ListDetector - Universal list detection with BOSS support
 * Maintains general logic while handling BOSS edge cases
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
   * Update detector configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this.config;
  }
  
  /**
   * Add custom list classes to detect
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
   */
  detectLists(customSelectors = null) {
    console.log("Starting universal list detection...");
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
      }
    } catch (e) {
      console.error("Error processing marked elements:", e);
    }
    
    // ==================== APPROACH 2: Try all selectors ====================
    try {
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        
        for (const element of elements) {
          if (processedElements.has(element) || 
              !this.utils.isElementVisible(element) || 
              this.utils.hasExcludedClass(element, excludeClasses)) {
            continue;
          }
          
          // Key improvement: Enhanced list item detection
          let children = this.listSelector.getValidChildren(element);
          
          // Special handling for ul elements (e.g., rec-job-list)
          if (element.tagName.toLowerCase() === 'ul') {
            // Try to find better children structure
            const cardAreas = Array.from(element.querySelectorAll(':scope > .card-area'));
            if (cardAreas.length >= this.listSelector.minChildren) {
              children = cardAreas;
            } else {
              // Check for nested li elements
              const nestedLis = Array.from(element.querySelectorAll(':scope > div > li'));
              if (nestedLis.length >= this.listSelector.minChildren) {
                children = nestedLis;
              }
            }
          }
          
          // Skip if too few children
          if (children.length < this.listSelector.minChildren) {
            // Try finding nested list items
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
            
            candidates.push({
              element,
              children: nestedItems,
              score: isCustom ? baseScore * 3 : baseScore,
              similarity,
              selector: this.listSelector.generateSelector(element),
              childCount: nestedItems.length,
              area,
              isCustomSelector: isCustom
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
          
          candidates.push({
            element,
            children,
            score: isCustom ? baseScore * 3 : baseScore,
            similarity,
            selector: this.listSelector.generateSelector(element),
            childCount: children.length,
            area,
            isCustomSelector: isCustom
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
      similarity: list.similarity || "N/A"
    })));
    
    return this.listSelector.lists;
  }
  
  /**
   * Find nested list items inside a container
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
   * Calculate similarity between elements
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
   * Remove nested lists
   */
  filterNestedLists(candidates) {
    const result = [];
    const visited = new Set();
    
    // Sort by score to prioritize better candidates
    candidates.sort((a, b) => b.score - a.score);
    
    for (const candidate of candidates) {
      if (visited.has(candidate.element)) continue;
      
      // Check if this element contains any other candidates
      let isContainer = true;
      for (const other of candidates) {
        if (other.element !== candidate.element && 
            candidate.element.contains(other.element) &&
            other.score > candidate.score * 0.8) { // Allow some leeway
          isContainer = false;
          break;
        }
      }
      
      if (isContainer) {
        result.push(candidate);
        visited.add(candidate.element);
        this.markAllChildren(candidate.element, visited);
      }
    }
    
    return result.length > 0 ? result : candidates.slice(0, 1);
  }
  
  /**
   * Remove duplicate lists from candidates
   */
  removeDuplicateLists(lists) {
    const uniqueLists = [];
    const seenElements = new Set();
    
    for (const list of lists) {
      if (!seenElements.has(list.element)) {
        seenElements.add(list.element);
        uniqueLists.push(list);
        
        // Mark all children as seen
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