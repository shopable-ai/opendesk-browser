// listSelectorCore.js - Updated integration with TableDataExtractor
import { ListDetector } from './listDetector.js';
import { TableDataExtractor } from './tableDataExtractor.js';
import { UIManager } from './uiManager.js';
import { SelectorUtils } from './selectorUtils.js';

/**
 * ListSelector - Core class that handles list detection and interaction
 * With improved support for dynamic configuration and custom selectors
 */
export class ListSelector {
  constructor(options = {}) {
    // Initialize configuration
    this.lists = [];
    this.currentIndex = -1;
    this.minChildren = options.minChildren || 3;
    this.preferredMin = options.preferredMin || 10;
    this.preferredMax = options.preferredMax || 20;
    this.maxLists = options.maxLists || 5;
    this.nextButtonSelector = null;
    this.selectedButton = null;
    this.customSelectors = options.customSelectors || null;
    this.manuallySelectedList = null; // Track manually selected list
    
    // Initialize components
    this.utils = new SelectorUtils();
    this.detector = new ListDetector(this);
    this.extractor = new TableDataExtractor(this);
    this.ui = new UIManager(this);
    
    // Setup
    this.initializeDetector();
  }

  /**
   * Initialize the detector with default settings
   */
  initializeDetector() {
    console.log("Initializing ListSelector...");
    
    // Inject UI styles
    this.ui.injectStyles();
    
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.runDetection();
      });
    } else {
      // DOM already loaded, run detection
      this.runDetection();
    }
  }
  
  /**
   * Run list detection process
   */
  runDetection() {
    console.log("Running list detection...");
    
    // Set a small delay to ensure all dynamic content is loaded
    setTimeout(() => {
      this.detector.detectLists(this.customSelectors);
      
      // Log detection results
      if (this.lists.length > 0) {
        console.log(`Detected ${this.lists.length} list(s)`);
        this.lists.forEach((list, index) => {
          console.log(`List ${index + 1}: ${list.selector} - ${list.childCount} items`);
        });
      } else {
        console.log("No lists detected");
      }
    }, 500);
  }
  
  /**
   * Update the detector configuration dynamically
   * Can be called at any time to adjust detection parameters
   */
  updateConfig(newConfig) {
    return this.detector.updateConfig(newConfig);
  }
  
  /**
   * Add custom list classes to detect
   * Can be called before detectLists or at any time
   */
  addListClasses(classNames) {
    return this.detector.addListClasses(classNames);
  }
  
  /**
   * Add classes to exclude from list detection
   * Can be called before detectLists or at any time
   */
  addExcludeClasses(classNames) {
    return this.detector.addExcludeClasses(classNames);
  }

  /**
   * Get a list of valid children for a container element
   */
  getValidChildren(container) {
    return this.utils.getValidChildren(container);
  }
  
  /**
   * Generate a CSS selector for an element
   */
  generateSelector(element, parentNode = null) {
    return this.utils.generateSelector(element, parentNode);
  }
  
  /**
   * Highlight a list at the specified index
   */
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
  
  /**
   * Clear highlight from all lists
   */
  clearHighlight() {
    this.lists.forEach(list => {
      list.element.classList.remove('listselector-highlight');
      list.children.forEach(child => child.classList.remove('listselector-highlight-child'));
    });
    
    this.currentIndex = -1;
  }
  
  /**
   * Move to the next list in the sequence
   */
  next(customSelectors = null) {
    // If custom selectors were provided, re-run detection
    if (customSelectors) {
      this.clearHighlight();
      this.lists = [];
      this.currentIndex = -1;
      this.detector.detectLists(customSelectors);
    }
    
    // If we have no lists, try detecting again (as a fallback)
    if (this.lists.length === 0) {
      this.detector.detectLists();
    }
    
    // First check if we have a manually selected list
    const manualIndex = this.lists.findIndex(list => list.isManualSelection);
    
    if (manualIndex !== -1) {
      // Prioritize manually selected list
      this.highlight(manualIndex);
    } else if (this.currentIndex === -1) {
      // If we have custom selectors that matched, prioritize them
      const customIndex = this.lists.findIndex(list => list.isCustomSelector);
      
      if (customIndex !== -1) {
        this.highlight(customIndex);
      } else {
        // Otherwise, select first list
        this.highlight(0);
      }
    } else {
      // Move to next list
      this.currentIndex = (this.currentIndex + 1) % this.lists.length;
      this.highlight(this.currentIndex);
    }
    
    // Return table data if a list is selected
    if (this.currentIndex !== -1) {
      let tableData = this.getTableData();
      return tableData;
    }
    
    return null;
  }
  
  /**
   * Get the selector for the currently selected list
   */
  getCurrentSelector() {
    if (this.lists.length === 0 || this.currentIndex < 0 || this.currentIndex >= this.lists.length) {
      console.log('No selected list or list is empty');
      return null;
    }
    
    const currentList = this.lists[this.currentIndex];
    return {
      selector: currentList.selector,
      itemCount: currentList.children.length,
      element: currentList.element
    };
  }
  
  /**
   * Get data from the selected table/list
   * Updated to use the extractor with proper handling of manual selection
   */
  getTableData(callback, specificSelector = null) {
    return this.extractor.getTableData(callback, specificSelector);
  }
  
  /**
   * Start the process of selecting a "Next Page" button
   */
  startNextButtonSelection() {
    return this.ui.startNextButtonSelection();
  }

  /**
   * Start the process of manually selecting a table/list
   * Improved to properly track the selected table
   */
  startTableSelection() {
    return this.ui.startTableSelection();
  }
  
  /**
   * Get the selector for the currently selected "Next Page" button
   */
  getSelectedNextButtonSelector() {
    if (this.nextButtonSelector) {
      return this.nextButtonSelector;
    } else {
      console.log('No "Next Page" button selected yet. Please use startNextButtonSelection() first');
      return null;
    }
  }
  
  /**
   * Attempt to automatically detect a "Next Page" button
   */
  detectNextButton() {
    return this.ui.detectNextButton();
  }
  
  /**
   * Send selector to extension
   */
  sendSelectorToExtension(selector) {
    console.log('Selector sent via event:', selector);
    if (typeof callChromeBridgeInterface === 'function') {
      callChromeBridgeInterface("ScrapyJs.selected_nextPageBtn", { data: selector }, "CHROME_BRIDGE_POPUP");
    } else {
      // Fallback: use custom event
      let event = new CustomEvent('SELECTOR_SELECTED', { 
        detail: { 
          type: 'nextPageBtn',
          selector: selector 
        } 
      });
      window.dispatchEvent(event);
    }
  }
  
  
  /**
   * Send table data to the extension
   */
  sendTableDataToExtension(data) {
    if (typeof callChromeBridgeInterface === 'function') {
      callChromeBridgeInterface("ScrapyJs.selected_tableData", { data: data }, "CHROME_BRIDGE_POPUP");
    } else {
      // Fallback: use custom event
      let event = new CustomEvent('SELECTOR_SELECTED', { 
        detail: { 
          type: 'tableData',
          data: data 
        } 
      });
      window.dispatchEvent(event);
    }
    
    console.log('Table data sent to extension:', data);
  }
  
  /**
   * Select a list by index
   * @param {number} index - The index of the list to select
   * @returns {Object|null} - The table data or null if selection failed
   */
  selectListByIndex(index) {
    if (index < 0 || index >= this.lists.length) {
      console.error(`Invalid list index: ${index}. Available range: 0-${this.lists.length - 1}`);
      return null;
    }
    
    this.highlight(index);
    return this.getTableData();
  }
  
  /**
   * Select a list by selector
   * Enhanced to properly mark the selection as manual and update currentIndex
   */
  selectListBySelector(selector) {
    const element = document.querySelector(selector);
    if (!element) {
      console.error(`Element not found for selector: ${selector}`);
      return null;
    }
    
    // Check if this matches an existing list
    const listIndex = this.lists.findIndex(list => list.element === element);
    
    if (listIndex !== -1) {
      // If list exists, mark it as manually selected
      this.lists[listIndex].isManualSelection = true;
      return this.selectListByIndex(listIndex);
    }
    
    // Add as a new list if not found
    const children = this.getValidChildren(element);
    if (children.length < this.minChildren) {
      console.error(`Selected element does not have enough children (${children.length} found, ${this.minChildren} required)`);
      return null;
    }
    
    const area = element.offsetWidth * element.offsetHeight;
    const newList = {
      element: element,
      children: children,
      score: area * Math.log(children.length + 1),
      selector: selector,
      childCount: children.length,
      area: area,
      isManualSelection: true
    };
    
    // Add to lists and select it
    this.lists.push(newList);
    this.currentIndex = this.lists.length - 1;
    this.highlight(this.currentIndex);
    return this.getTableData();
  }
}

// Export a singleton instance for global use
// export const listSelector = new ListSelector();

// Also export the class for custom instantiation
export default ListSelector;

// 初始化时可以提供默认配置
// const listSelector = new ListSelector({
//   minChildren: 3,
//   customSelectors: ['.product-list', '.course-container']
// });

// // 动态添加列表类型
// listSelector.addListClasses(['article-grid', 'search-results']);

// // 运行时更新配置
// listSelector.updateConfig({
//   similarityThreshold: 0.4,
//   minArea: 500
// });

// // 在next方法中使用自定义选择器
// listSelector.next('.special-list-container');

// // 或者提供多个选择器
// listSelector.next(['.course-list', '.file-content .right-content']);