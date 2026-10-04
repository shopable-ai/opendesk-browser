// selectorUtils.js - Utility functions for element selection and manipulation

/**
 * SelectorUtils - Common utilities for element selection, visibility detection, 
 * and selector generation
 */
export class SelectorUtils {
  constructor() {
    // Empty constructor - no initialization needed
  }
  
  /**
   * Normalize the class name representation for an element.
   * Handles SVGAnimatedString and other non-string className values.
   * @param {Element} element
   * @returns {string}
   */
  getClassNameString(element) {
    if (!element) {
      return '';
    }
    
    const raw = element.className;
    if (typeof raw === 'string') {
      return raw;
    }
    
    if (raw && typeof raw.baseVal === 'string') {
      // SVGAnimatedString like objects expose baseVal
      return raw.baseVal;
    }
    
    if (element.classList && element.classList.length) {
      return Array.from(element.classList).join(' ');
    }
    
    if (typeof element.getAttribute === 'function') {
      return element.getAttribute('class') || '';
    }
    
    return '';
  }
  
  /**
   * Get an array of class tokens for an element.
   * @param {Element} element
   * @returns {string[]}
   */
  getClassList(element) {
    const classString = this.getClassNameString(element);
    if (!classString) {
      return [];
    }
    return classString.trim().split(/\s+/).filter(Boolean);
  }
  
  /**
   * Check if an element is visible
   * @param {HTMLElement} element - The element to check
   * @returns {boolean} - Whether the element is visible
   */
  isElementVisible(element) {
    if (!element) return false;
    
    // Check if element or its ancestors have display:none or visibility:hidden
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false;
    }
    
    // Check dimensions - must have some size to be visible
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    
    // Check if element is within viewport
    // First check if element is outside viewport boundaries
    if (rect.bottom < 0 || rect.top > window.innerHeight || 
        rect.right < 0 || rect.left > window.innerWidth) {
      return false;
    }
    
    // Additional check for fixed position elements (like headers/footers)
    if (style.position === 'fixed' && rect.top < 0 && rect.bottom < 50) {
      return false; // Hidden fixed elements above viewport
    }
    
    // Check parent visibility recursively (but only up to 10 levels to avoid performance issues)
    let parent = element.parentElement;
    let depth = 0;
    while (parent && depth < 10) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden' || parentStyle.opacity === '0') {
        return false;
      }
      parent = parent.parentElement;
      depth++;
    }
    
    return true;
  }
  
  /**
   * Detect whether element class/id hints at list container semantics.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  hasListIndicatorClass(element) {
    if (!element) {
      return false;
    }
    const indicatorTokens = [
      "list",
      "items",
      "item-list",
      "results",
      "result-list",
      "cards",
      "card-list",
      "grid",
      "gallery",
      "feed",
      "collection",
      "directory",
      "product",
      "search-content",
      "content-list",
      "course-list"
    ];
    const combined = `${this.getClassNameString(element)} ${element.id || ""}`.toLowerCase();
    return indicatorTokens.some((token) => combined.includes(token));
  }

  /**
   * Special-case detection for known layout patterns that represent lists but don't follow generic indicators.
   * @param {HTMLElement} element
   * @returns {boolean}
   */
  isSpecialCaseList(element) {
    if (!element) {
      return false;
    }
    const specialSelectors = [
      ".course-list",
      ".file-content",
      ".hot-sale-list",
      ".directory",
      ".search-content",
      ".subject-list",
      ".item-list",
      ".article-list",
      ".user-list",
      ".news-list"
    ];
    return specialSelectors.some((selector) => {
      try {
        return element.matches(selector) || element.querySelector(selector);
      } catch {
        return false;
      }
    });
  }
  
  /**
   * Check if an element has any of the excluded classes
   * @param {HTMLElement} element - The element to check
   * @param {Array} excludeClasses - Array of class names to exclude
   * @returns {boolean} - Whether the element has any excluded class
   */
  hasExcludedClass(element, excludeClasses) {
    if (!element || !excludeClasses || excludeClasses.length === 0) {
      return false;
    }
    
    const classNames = this.getClassList(element);
    if (classNames.length === 0) {
      return false;
    }
    
    return classNames.some(className => {
      return excludeClasses.some(excludeClass => 
        className.toLowerCase().includes(excludeClass.toLowerCase())
      );
    });
  }
  
  /**
   * Get a list of valid children for a container element
   * @param {HTMLElement} container - The container element
   * @returns {Array} - Array of valid child elements
   */
  getValidChildren(container) {
    if (!container) return [];
    
    // Start with direct children
    let children = Array.from(container.children);
    
    // Filter out invisible or tiny elements
    children = children.filter(child => {
      if (!this.isElementVisible(child)) return false;
      
      const rect = child.getBoundingClientRect();
      return rect.width >= 5 && rect.height >= 5; // Minimum size check
    });
    
    // Special handling for certain container types
    const tagName = container.tagName.toLowerCase();
    
    // Handle table rows
    if (tagName === 'table') {
      // For tables, get rows as children
      const rows = container.querySelectorAll('tr');
      if (rows.length > 0) {
        return Array.from(rows).filter(row => this.isElementVisible(row));
      }
    }
    
    // Handle special grid container classes
    const className = this.getClassNameString(container) || '';
    if (className.includes('grid') || className.includes('cards') || 
        className.includes('items') || className.includes('product-list')) {
      // Look for common grid item patterns
      const items = container.querySelectorAll(
        '[class*="item"], [class*="card"], [class*="cell"], [class*="product"], ' +
        '[class*="result"], [class*="box"], [class*="tile"]'
      );
      
      if (items.length > 2) {
        return Array.from(items).filter(item => this.isElementVisible(item));
      }
    }
    
    // If we found valid direct children, return them
    if (children.length > 0) {
      return children;
    }
    
    // Otherwise, try to find nested list items
    const nestedItems = this.findNestedListItems(container);
    return nestedItems;
  }
  
  /**
   * Find nested list items inside a container
   * @param {HTMLElement} container - The container element
   * @returns {Array} - Array of list item elements
   */
  findNestedListItems(container) {
    // Try to find patterns for list items at different depths
    const patterns = [
      // Direct children with indicators of being list items
      '> [class*="item"]', '> [class*="card"]', '> [class*="row"]',
      '> [class*="result"]', '> .cell', '> [class*="product"]',
      '> li', '> article',
      
      // Nested at 1 level
      '> div > [class*="item"]', '> div > [class*="card"]',
      '> ul > li', '> div > [class*="row"]', '> div > article',
      
      // Nested at 2 levels
      '> div > div > [class*="item"]', '> div > ul > li',
      '> div > div > article', '> div > div > [class*="card"]'
    ];
    
    for (const pattern of patterns) {
      try {
        const items = container.querySelectorAll(`:scope ${pattern}`);
        if (items.length >= 3) { // Minimum threshold for a list
          return Array.from(items).filter(item => this.isElementVisible(item));
        }
      } catch (e) {
        continue; // Some browsers might not support :scope
      }
    }
    
    // Fallback to global selector if :scope is not supported
    const potentialSelectors = [
      '.item', '[class*="item"]', '.card', '[class*="card"]',
      '.row', '[class*="row"]', '.result', '[class*="result"]',
      '.product', '[class*="product"]', 'li', 'article'
    ];
    
    for (const selector of potentialSelectors) {
      const items = container.querySelectorAll(selector);
      if (items.length >= 3) {
        return Array.from(items).filter(item => 
          this.isElementVisible(item) && container.contains(item)
        );
      }
    }
    
    return [];
  }
  
  
  
  /**
   * Generate a CSS selector for an element
   * Enhanced to prioritize CssSelectorGenerator when available
   * @param {Element} element - The DOM element to generate a selector for
   * @param {Element} parentNode - Optional parent node to generate selector relative to
   * @returns {string} - CSS selector for the element
   */
  generateSelector(element, parentNode = null) {
    // If element doesn't exist or is not an element node, return empty string
    if (!element || element.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    
    // Priority 1: Use CssSelectorGenerator if available (original behavior)
    if (typeof CssSelectorGenerator !== 'undefined') {
      try {
        if (parentNode) {
          const options = { root: parentNode };
          let selector = CssSelectorGenerator.getCssSelector(element, options);
          // console.log('CssSelectorGenerator selector:', selector, element, parentNode);
          return selector;
        }
        return CssSelectorGenerator.getCssSelector(element);
      } catch (e) {
        console.warn('CssSelectorGenerator failed, falling back to custom selector generation', e);
      }
    }
    
    // Priority 2: Check if element has an ID (most specific)
    if (element.id && !/\d/.test(element.id)) {
      return `#${element.id}`;
    }
    
    // Priority 3: For direct children of parentNode, try to generate a simple selector
    if (parentNode && element.parentElement === parentNode) {
      // Check if the element has useful class names
      const classTokens = this.getClassList(element)
        .filter(cls => !cls.startsWith('listselector-'));
      
      if (classTokens.length > 0) {
        // Try to find the shortest class combination that uniquely identifies this element
        for (let i = 1; i <= classTokens.length; i++) {
          const combinations = this.getCombinations(classTokens, i);
          for (const combo of combinations) {
            const classSelector = combo.map(cls => `.${cls}`).join('');
            const selector = `${element.tagName.toLowerCase()}${classSelector}`;
            // Check if this selector is unique within the parent
            const matches = parentNode.querySelectorAll(selector);
            if (matches.length === 1) {
              return selector;
            }
          }
        }
      }
      
      // If no unique class, use nth-child
      const siblings = Array.from(parentNode.children)
        .filter(child => child.tagName === element.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
      } else {
        // If it's the only tag of its type, just use the tag selector
        return element.tagName.toLowerCase();
      }
    }
    
    // Priority 4: For more complex relationships, build a relative path
    let current = element;
    let path = [];
    let maxPathLength = parentNode ? 3 : 5; // Limit path length
    let pathLength = 0;
    
    while (current && current !== document.body && current !== document.documentElement 
           && current !== parentNode && pathLength < maxPathLength) {
      // Create a selector segment for the current element
      const tagLower = current.tagName.toLowerCase();
      let part = tagLower;
      
      // Try to add ID (IDs are unique, so we can stop building the path)
      if (current.id && !/\d/.test(current.id)) {
        part = `#${current.id}`;
        path.unshift(part);
        break;
      }
      
      // Try to add classes
      const classTokens = this.getClassList(current)
        .filter(cls => !cls.startsWith('listselector-'));
      
      // Try to find the smallest class combination to uniquely identify the element
      for (let i = 1; i <= Math.min(classTokens.length, 2); i++) { // Use at most 2 classes
        const combinations = this.getCombinations(classTokens, i);
        for (const combo of combinations) {
          const classSelector = combo.map(cls => `.${cls}`).join('');
          const testSelector = `${tagLower}${classSelector}`;
          // Check uniqueness in parent context
          if (current.parentElement) {
            const matches = current.parentElement.querySelectorAll(testSelector);
            if (matches.length === 1) {
              part = testSelector;
              break;
            }
          }
        }
        // If we found a unique selector, break the loop
        if (part !== tagLower) break;
      }
      
      // If no unique identifier was found, use nth-of-type
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
      
      // Check if the current path is already unique enough to stop
      if (pathLength >= 2) {
        const testPath = path.join(' > ');
        try {
          const matches = document.querySelectorAll(testPath);
          if (matches.length === 1) {
            break;
          }
        } catch (e) {
          // Ignore invalid selector errors, continue building the path
        }
      }
    }
    
    // Return the complete path selector
    return path.join(' > ');
  }
  
  /**
   * Get all combinations of the given array elements
   * @param {Array} array - The array to get combinations from
   * @param {number} size - Size of each combination
   * @returns {Array} - Array of combinations
   */
  getCombinations(array, size) {
    const result = [];
    
    // Recursive function to generate combinations
    function combine(current, start) {
      if (current.length === size) {
        result.push([...current]);
        return;
      }
      
      for (let i = start; i < array.length; i++) {
        current.push(array[i]);
        combine(current, i + 1);
        current.pop();
      }
    }
    
    combine([], 0);
    return result;
  }
  
  /**
   * Get valid children of a container element
   * @param {Element} container - The container element
   * @returns {Array} - Array of valid child elements
   */
  getValidChildren(container) {
    if (!container) return [];
    
    // Exclude script, style, and hidden elements
    const invalidTags = ['SCRIPT', 'STYLE', 'META', 'LINK', 'BR', 'HR'];
    
    // Get all direct children
    const children = Array.from(container.children);
    
    // Filter out invalid elements
    return children.filter(child => {
      // Skip invalid tags
      if (invalidTags.includes(child.tagName)) return false;
      
      // Skip hidden elements
      const computedStyle = window.getComputedStyle(child);
      if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
        return false;
      }
      
      // Skip elements with zero dimensions
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      
      return true;
    });
  }
  
  /**
   * Generate a more robust but potentially complex selector
   * @param {HTMLElement} element - The element to generate a selector for
   * @returns {string} - The generated complex CSS selector
   */
  generateComplexSelector(element) {
    if (!element || element === document.body) return '';
    
    // Start with basic element type
    let selector = element.tagName.toLowerCase();
    
    // Add ID if it exists
    if (element.id && !element.id.match(/^\d/)) {
      selector += `#${CSS.escape(element.id)}`;
      return selector; // ID should be unique, so we can stop here
    }
    
    // Add significant classes (skip common utility classes)
    const classTokens = this.getClassList(element);
    if (classTokens.length > 0) {
      // Filter utility classes
      const significantClasses = classTokens.filter(cls => 
        cls && 
        !cls.match(/^(js-|is-|has-|active|selected|hover|open|hidden|visible|show|hide|fade)/) &&
        !cls.match(/^\d/)
      );
      
      if (significantClasses.length > 0) {
        // Add up to 2 classes to avoid overly specific selectors
        const classesToAdd = significantClasses.slice(0, 2);
        classesToAdd.forEach(cls => {
          selector += `.${CSS.escape(cls)}`;
        });
      }
    }
    
    // Add data attributes that might help identify the element
    const dataAttributes = ['data-id', 'data-testid', 'data-name', 'data-type', 'data-role'];
    for (const attr of dataAttributes) {
      const value = element.getAttribute(attr);
      if (value) {
        selector += `[${attr}="${CSS.escape(value)}"]`;
        break; // One data attribute is enough
      }
    }
    
    // If we've created a specific selector, test if it's unique
    if (selector !== element.tagName.toLowerCase()) {
      const matches = document.querySelectorAll(selector);
      if (matches.length === 1) {
        return selector;
      }
    }
    
    // If not unique yet, add positional information
    const parent = element.parentElement;
    if (!parent || parent === document.body) {
      return selector;
    }
    
    // Get position among siblings
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(element) + 1;
    
    // Generate parent selector
    const parentSelector = this.generateComplexSelector(parent);
    
    // Combine selectors - limit to 3 levels to avoid overly complex selectors
    if (parentSelector.split('>').length > 3) {
      return `${parentSelector} ${selector}:nth-child(${index})`;
    } else {
      return `${parentSelector} > ${selector}:nth-child(${index})`;
    }
  }
  
  /**
   * Get classes that represent meaningful structure
   * @param {Array} elements - Array of elements to analyze
   * @returns {Array} - Array of good class names
   */
  getGoodClasses(elements) {
    if (!elements || elements.length === 0) return [];
    
    // Count class occurrences across elements
    const classCount = {};
    
    elements.forEach(element => {
      const classes = this.getClassList(element);
      if (classes.length === 0) {
        return;
      }
      
      classes.forEach(cls => {
        if (cls && !cls.match(/^(js-|is-|has-|active|selected|hover|open|hidden|visible)/)) {
          classCount[cls] = (classCount[cls] || 0) + 1;
        }
      });
    });
    
    // Find classes that appear in most elements (> 50%)
    const threshold = elements.length * 0.5;
    const goodClasses = Object.entries(classCount)
      .filter(([cls, count]) => count >= threshold)
      .map(([cls]) => cls);
    
    return goodClasses;
  }
  
  /**
   * Check if elements are arranged in a grid pattern
   * @param {Array} elements - Elements to check
   * @returns {boolean} - Whether elements form a grid
   */
  isGridLayout(elements) {
    if (elements.length < 4) return false;
    
    // Get positions of elements
    const positions = elements.map(el => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      };
    });
    
    // Count unique left and top positions
    const uniqueLefts = new Set(positions.map(p => p.left));
    const uniqueTops = new Set(positions.map(p => p.top));
    
    // If we have multiple rows and columns, it's likely a grid
    return uniqueLefts.size >= 2 && uniqueTops.size >= 2;
  }
  
  /**
   * Check if elements are arranged in a vertical list
   * @param {Array} elements - Elements to check
   * @returns {boolean} - Whether elements form a vertical list
   */
  isVerticalList(elements) {
    if (elements.length < 3) return false;
    
    // Get positions of elements
    const positions = elements.map(el => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      };
    });
    
    // Sort by top position
    positions.sort((a, b) => a.top - b.top);
    
    // Check if all elements have similar left position
    const leftPositions = positions.map(p => p.left);
    const avgLeft = leftPositions.reduce((sum, left) => sum + left, 0) / leftPositions.length;
    
    // Calculate deviation - consider it a vertical list if left positions are within 20px
    const maxDeviation = 20;
    const isVertical = leftPositions.every(left => Math.abs(left - avgLeft) <= maxDeviation);
    
    return isVertical;
  }
  
  /**
   * Check if elements are arranged in a horizontal list
   * @param {Array} elements - Elements to check
   * @returns {boolean} - Whether elements form a horizontal list
   */
  isHorizontalList(elements) {
    if (elements.length < 3) return false;
    
    // Get positions of elements
    const positions = elements.map(el => {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top)
      };
    });
    
    // Sort by left position
    positions.sort((a, b) => a.left - b.left);
    
    // Check if all elements have similar top position
    const topPositions = positions.map(p => p.top);
    const avgTop = topPositions.reduce((sum, top) => sum + top, 0) / topPositions.length;
    
    // Calculate deviation - consider it a horizontal list if top positions are within 20px
    const maxDeviation = 20;
    const isHorizontal = topPositions.every(top => Math.abs(top - avgTop) <= maxDeviation);
    
    return isHorizontal;
  }
}
