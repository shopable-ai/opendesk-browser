// genericTableExtractor.js - Enhanced table data extraction with generic handling
import { SelectorUtils } from './selectorUtils.js';

/**
 * GenericTableExtractor - Handles extracting data from various HTML structures
 * Designed for flexibility and adaptability across different websites
 */
export class TableDataExtractor {
  constructor(listSelector) {
    this.listSelector = listSelector;
    this.utils = new SelectorUtils();
    // Store processed items to avoid duplicates
    this.processedSrcs = new Set();
    this.processedHrefs = new Set();
  }
  
  /**
   * Get the data from any table-like structure
   * Works with tables, lists, and generic container elements
   */
  getTableData(callback, specificSelector = null) {
    // Get the element to process
    let selector, element, children;
    
    // Determine what to process based on inputs and current selection state
    if (specificSelector) {
      // Case 1: Process specific selector provided as parameter
      element = document.querySelector(specificSelector);
      if (!element) {
        console.error('Cannot find specified element:', specificSelector);
        if (callback) callback({ error: 'Element not found' });
        return null;
      }
      children = this.listSelector.getValidChildren(element);
      selector = specificSelector;
    } else if (this.listSelector.currentIndex !== -1 && this.listSelector.lists.length > 0) {
      // Case 2: Process current selected list by index
      const currentList = this.listSelector.lists[this.listSelector.currentIndex];
      if (!currentList || !currentList.element) {
        console.error('Selected list is invalid');
        if (callback) callback({ error: 'Invalid selected list' });
        return null;
      }
      element = currentList.element;
      children = currentList.children;
      selector = currentList.selector;
    } else if (this.listSelector.lists.length > 0 && this.listSelector.lists.some(list => list.isManualSelection)) {
      // Case 3: Find and process manually selected list (from click selection)
      const manualList = this.listSelector.lists.find(list => list.isManualSelection);
      element = manualList.element;
      children = manualList.children;
      selector = manualList.selector;
      
      // Update current index to match the manual selection for future calls
      this.listSelector.currentIndex = this.listSelector.lists.indexOf(manualList);
    } else {
      console.error('No selected element. Call next() method first or provide a selector');
      if (callback) callback({ error: 'No selected element' });
      return null;
    }
    
    // Reset processed sets for a fresh extraction
    this.processedSrcs = new Set();
    this.processedHrefs = new Set();
    
    // Extract data
    const data = this.extractTableData(element, children);
    
    // Return or callback with result
    const result = {
      selector: selector,
      tableId: this.listSelector.currentIndex,
      data: data,
      itemCount: children.length,
      elementClasses: element.classList ? Array.from(element.classList) : []
    };
    
    if (callback) {
      callback(result);
    }
    
    return result;
  }
  
  /**
   * Extract data from any element that can contain structured data
   */
  extractTableData(containerElement, children) {
    const data = [];
    const tagName = containerElement.tagName.toLowerCase();
    
    if (tagName === 'table') {
      // Process HTML table
      this.processTableElement(containerElement, data);
    } else {
      // Process non-table elements (div, ul, ol, etc.)
      children.forEach(child => {
        // Create flat data structure for this item
        const itemData = {};
        
        // Track processed selectors to avoid duplicates within this item
        const processedSelectors = new Set();
        
        // Process this child element and all its descendants
        this.extractFlatData(child, containerElement, itemData, processedSelectors);
        
        // Only add item if it contains valid data
        if (Object.keys(itemData).length > 0) {
          data.push(itemData);
        }
      });
    }
    
    return data;
  }
  
  /**
   * Process HTML tables specifically
   */
  processTableElement(tableElement, data) {
    const rows = tableElement.querySelectorAll('tr');
    let headers = [];
    let headerSelectors = [];
    
    // Extract headers and their selectors
    const headerRow = tableElement.querySelector('thead tr, tr:first-child');
    if (headerRow) {
      const headerCells = headerRow.querySelectorAll('th, td');
      headers = Array.from(headerCells).map(th => th.textContent.trim());
      // Generate relative selectors for headers
      headerSelectors = Array.from(headerCells).map(th => 
        this.generateSimpleSelector(th)
      );
    }
    
    // Extract data rows
    Array.from(rows).forEach((row, rowIndex) => {
      // Skip header row
      if (rowIndex === 0 && headers.length > 0) return;
      
      const rowData = {};
      // Generate row selector
      const rowSelector = this.generateSimpleSelector(row);
      rowData['_rowSelector'] = rowSelector;
      let hasValidData = false;
      
      const cells = row.querySelectorAll('td');
      
      cells.forEach((cell, cellIndex) => {
        // Generate selector for cell
        const cellSelector = this.generateSimpleSelector(cell);
        const cellText = cell.textContent.trim();
        
        // Only add if text is not empty or has valid images/links
        if (cellText || cell.querySelector('img[src]') || cell.querySelector('a[href]')) {
          hasValidData = true;
          
          // Create cell data object
          rowData[cellSelector] = {
            selector: cellSelector,
            tag: cell.tagName.toLowerCase()
          };
          
          // Add text content if available
          if (cellText) {
            rowData[cellSelector].text = cellText;
          }
          
          // Add header information if available
          if (headerSelectors[cellIndex]) {
            rowData[cellSelector].header = headers[cellIndex] || '';
            rowData[cellSelector].headerSelector = headerSelectors[cellIndex];
          }
          
          // Extract and add links and images directly
          this.processDirectLinks(cell, rowData);
          this.processDirectImages(cell, rowData);
        }
      });
      
      // Only add row if it has valid data
      if (hasValidData) {
        data.push(rowData);
      }
    });
  }
  
  /**
   * Extract data in a flat structure from an element and its descendants
   */
  extractFlatData(element, parentElement, result, processedSelectors) {
    // Skip if element is not valid or not visible
    if (!element || !this.isElementVisible(element)) {
      return;
    }
    
    // Process the element itself
    this.processElementFlat(element, parentElement, result, processedSelectors);
    
    // Process child elements based on element type
    if (element.children && element.children.length > 0) {
      // Special handling for list elements
      if (['ul', 'ol'].includes(element.tagName.toLowerCase())) {
        this.processList(element, result, processedSelectors);
      } else {
        // For non-list elements, process each child recursively
        Array.from(element.children).forEach(child => {
          this.extractFlatData(child, element, result, processedSelectors);
        });
      }
    }
  }
  
  /**
   * Process list elements (ul, ol)
   */
  processList(listElement, result, processedSelectors) {
    const listSelector = this.generateSimpleSelector(listElement);
    
    // Get all list items
    const listItems = listElement.querySelectorAll('li');
    if (listItems.length === 0) return;
    
    // For short lists, store text values as an array
    if (listItems.length <= 5) {
      const textValues = Array.from(listItems)
        .map(li => li.textContent.trim())
        .filter(text => text.length > 0);
      
      if (textValues.length > 0) {
        result[listSelector] = {
          selector: listSelector,
          tag: listElement.tagName.toLowerCase(),
          text: textValues
        };
        processedSelectors.add(listSelector);
      }
    } else {
      // For longer lists, process each item individually
      Array.from(listItems).forEach(item => {
        this.extractFlatData(item, listElement, result, processedSelectors);
      });
    }
  }
  
  /**
   * Process a single element and add its data to the result object
   */
  processElementFlat(element, parentElement, result, processedSelectors) {
    // Get simple selector for this element
    const selector = this.generateSimpleSelector(element);
    
    // Skip if already processed
    if (processedSelectors.has(selector)) {
      return;
    }
    
    // Mark as processed
    processedSelectors.add(selector);
    
    // Get element information
    const tagName = element.tagName.toLowerCase();
    const elementText = this.getDirectTextContent(element);
    const isLink = tagName === 'a' && element.hasAttribute('href');
    const isImage = tagName === 'img' && element.hasAttribute('src');
    
    // Check if element has valuable content
    const hasContent = 
      elementText || 
      (isLink && element.getAttribute('href')) || 
      (isImage && element.getAttribute('src')) ||
      element.querySelector('a[href], img[src]');
    
    // Skip elements without valuable content, unless they're important containers
    if (!hasContent && !this.isContentContainer(element)) {
      return;
    }
    
    // Process elements with valuable content
    if (elementText || isLink || isImage || this.isContentContainer(element)) {
      // Create base data object
      const elementData = {
        selector: selector,
        tag: tagName
      };
      
      // Add text content if available
      if (elementText) {
        elementData.text = elementText;
      }
      
      // Add link information if it's a link
      if (isLink) {
        const href = element.getAttribute('href');
        if (href && !this.processedHrefs.has(href)) {
          elementData.href = href;
          this.processedHrefs.add(href);
        }
      }
      
      // Add image information if it's an image
      if (isImage) {
        const imgSrc = element.getAttribute('src');
        if (imgSrc && !this.processedSrcs.has(imgSrc)) {
          elementData.src = imgSrc;
          if (element.hasAttribute('alt')) {
            elementData.alt = element.getAttribute('alt');
          }
          this.processedSrcs.add(imgSrc);
        }
      }
      
      // Only add if it has valuable properties
      if (Object.keys(elementData).length > 2) {
        result[selector] = elementData;
      }
      
      // Process child links and images if not already a link
      if (!isLink) {
        this.processDirectLinks(element, result);
      }
      
      // Process child images if not already an image
      if (!isImage) {
        this.processDirectImages(element, result);
      }
    }
  }
  
  /**
   * Process links within an element and add them directly to the result
   */
  processDirectLinks(element, result) {
    const links = element.querySelectorAll('a[href]');
    
    links.forEach(link => {
      // Skip links without href or text
      const linkText = link.textContent.trim();
      const linkHref = link.getAttribute('href');
      if (!linkHref) return;
      
      // Skip if we've already processed this href
      if (this.processedHrefs.has(linkHref)) return;
      this.processedHrefs.add(linkHref);
      
      // Generate a simple selector
      const linkSelector = this.generateSimpleSelector(link);
      
      // Skip if we already have this selector in the results
      if (result[linkSelector]) return;
      
      // Create link data
      const linkData = {
        selector: linkSelector,
        tag: 'a',
        href: linkHref
      };
      
      // Add text if it exists
      if (linkText) {
        linkData.text = linkText;
      }
      
      // Add to results
      result[linkSelector] = linkData;
    });
  }
  
  /**
   * Process images within an element and add them directly to the result
   */
  processDirectImages(element, result) {
    const images = element.querySelectorAll('img[src]');
    
    images.forEach(img => {
      const imgSrc = img.getAttribute('src');
      if (!imgSrc) return;
      
      // Skip if we've already processed this source
      if (this.processedSrcs.has(imgSrc)) return;
      this.processedSrcs.add(imgSrc);
      
      // Generate a simple selector
      const imgSelector = this.generateSimpleSelector(img);
      
      // Skip if we already have this selector in the results
      if (result[imgSelector]) {
        // Try an alternative selector
        const altSelector = this.getAlternativeSelector(imgSelector);
        if (result[altSelector]) return;
        
        // Create image data with alternative selector
        result[altSelector] = {
          selector: altSelector,
          tag: 'img',
          src: imgSrc
        };
        
        // Add alt text if available
        if (img.hasAttribute('alt') && img.getAttribute('alt')) {
          result[altSelector].alt = img.getAttribute('alt');
        }
      } else {
        // Create image data
        result[imgSelector] = {
          selector: imgSelector,
          tag: 'img',
          src: imgSrc
        };
        
        // Add alt text if available
        if (img.hasAttribute('alt') && img.getAttribute('alt')) {
          result[imgSelector].alt = img.getAttribute('alt');
        }
      }
    });
  }
  
  /**
   * Generate a simple, efficient selector for an element
   */
  generateSimpleSelector(element) {
    if (!element) return null;
    
    const tagName = element.tagName.toLowerCase();
    
    // Skip non-content elements
    if (['script', 'style', 'noscript', 'meta'].includes(tagName)) {
      return null;
    }
    
    // Try ID if available (most specific)
    if (element.id) {
      return `#${element.id}`;
    }
    
    // Try with classes if available
    if (element.classList && element.classList.length > 0) {
      // Filter out generic utility classes
      const genericClasses = ['active', 'selected', 'hover', 'highlight', 'current', 'container', 'wrapper'];
      const validClasses = Array.from(element.classList).filter(cls => !genericClasses.includes(cls));
      
      if (validClasses.length > 0) {
        // Use the first valid class
        return `.${validClasses[0]}`;
      }
    }
    
    // For basic elements, use tagname with role or attribute if available
    if (element.hasAttribute('role')) {
      return `${tagName}[role="${element.getAttribute('role')}"]`;
    }
    
    // For links and images use their natural attributes
    if (tagName === 'a' && element.hasAttribute('href')) {
      // Try to get a more specific selector using parent context
      const parent = element.parentElement;
      if (parent && parent.classList && parent.classList.length > 0) {
        const parentClass = Array.from(parent.classList)[0];
        return `.${parentClass} > a`;
      }
      return 'a';
    }
    
    if (tagName === 'img' && element.hasAttribute('src')) {
      // Try to get a more specific selector using parent context
      const parent = element.parentElement;
      if (parent && parent.classList && parent.classList.length > 0) {
        const parentClass = Array.from(parent.classList)[0];
        return `.${parentClass} > img`;
      }
      return 'img';
    }
    
    // Last resort: use tag name with position
    return tagName;
  }
  
  /**
   * Generate an alternative selector when needed
   */
  getAlternativeSelector(selector) {
    // Simple suffix approach
    return `${selector}_alt`;
  }
  
  /**
   * Check if an element is a meaningful content container
   */
  isContentContainer(element) {
    if (!element) return false;
    
    // Check if element has semantic meaning
    const semanticTags = ['article', 'section', 'header', 'footer', 'nav', 'aside', 'main'];
    if (semanticTags.includes(element.tagName.toLowerCase())) {
      return true;
    }
    
    // Check for common content-related attributes
    if (element.hasAttribute('role')) {
      const contentRoles = ['article', 'banner', 'main', 'navigation', 'region', 'contentinfo'];
      if (contentRoles.includes(element.getAttribute('role'))) {
        return true;
      }
    }
    
    // Check if it has many children which might indicate a content container
    if (element.children.length > 3) {
      return true;
    }
    
    // Check if it has list-like descendants
    if (element.querySelectorAll('li, tr, th, td').length > 0) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Get direct text content (excluding child element text)
   */
  getDirectTextContent(element) {
    let text = '';
    for (let node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }
  
  /**
   * Check if an element is visible
   */
  isElementVisible(element) {
    if (!element) return false;
    
    // Quick check for inline style display:none or visibility:hidden
    const style = window.getComputedStyle(element);
    return !(style.display === 'none' || style.visibility === 'hidden' || element.offsetParent === null);
  }
}