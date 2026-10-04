// uiManager.js - UI interaction and styling
import { SelectorUtils } from './selectorUtils.js';

/**
 * UIManager - Handles UI interaction, highlighting, and styles
 */
export class UIManager {
  constructor(listSelector) {
    this.listSelector = listSelector;
    this.utils = new SelectorUtils();
    this.cancelNextButtonSelection = null;
    this.cancelTableSelection = null;
  }
  
  /**
   * Inject CSS styles for highlighting and UI elements
   */
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
        content: "点击选择此元素"; 
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
      .listselector-table-hover {
        border: 2px dashed blue !important; 
        background-color: rgba(0, 0, 255, 0.05) !important;
        position: relative;
        cursor: pointer;
      }
      .listselector-table-hover::after {
        content: "点击选择此列表/表格"; 
        position: absolute; 
        top: -25px; 
        left: 0; 
        background: #0000ff; 
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
  
  /**
   * Clear all next button styles
   */
  clearAllNextButtonStyles() {
    // Clear hover highlights
    document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
      el.classList.remove('listselector-next-btn-hover')
    );
    
    // Clear selected highlights
    document.querySelectorAll('.listselector-next-btn').forEach(el => 
      el.classList.remove('listselector-next-btn')
    );
    
    // Clear saved state
    this.listSelector.nextButtonSelector = null;
    if (this.listSelector.selectedButton) {
      this.listSelector.selectedButton = null;
    }
  }
  
  /**
   * Clear all table selection styles
   */
  clearAllTableSelectionStyles() {
    // Clear hover highlights
    document.querySelectorAll('.listselector-table-hover').forEach(el => 
      el.classList.remove('listselector-table-hover')
    );
  }
  
  /**
   * Get next button by click interaction
   */
  getNextButtonByClick(callback) {
    // Create and show prompt
    const prompt = document.createElement('div');
    prompt.className = 'listselector-prompt';
    prompt.textContent = '请点击"下一页"按钮以选中';
    document.body.appendChild(prompt);
  
    // Ensure clean state
    this.clearAllNextButtonStyles();

    // Track selection state
    let isFirstSelection = true;
    let selectedButton = null;
    let selectedSelector = null;
  
    // Hover handler for preview highlighting
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
        // First click: prevent default navigation and select
        e.preventDefault();
        e.stopPropagation();
        
        // Generate selector BEFORE adding custom classes
        selectedSelector = this.listSelector.generateSelector(target);
        
        // Remove prompt and hover highlights
        document.body.removeChild(prompt);
        document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
          el.classList.remove('listselector-next-btn-hover')
        );
        
        // Highlight selected button
        target.classList.add('listselector-next-btn');
        
        // Store selected button
        selectedButton = target;
        
        // Remember button for future
        if (typeof callback === 'function') {
          callback({ selector: selectedSelector, element: target });
        }
        
        // Change flag for next click
        isFirstSelection = false;
        
        console.log('Next page button selected. Click again for normal navigation');
        
        // Remove hover handler after selection
        document.removeEventListener('mouseover', hoverHandler);
        
        // Keep click listener active for second click
      } else if (target === selectedButton) {
        // Allow natural navigation on second click
        // Don't prevent default here to allow navigation
        
        // Clean up event listeners
        document.removeEventListener('click', handleClick, true);
      }
    };
  
    // Add event listeners - note capture phase (true) for click
    document.addEventListener('mouseover', hoverHandler);
    document.addEventListener('click', handleClick, true);
    
    // Return a function to cancel selection mode
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
  
  /**
   * Start the next button selection process
   */
  startNextButtonSelection() {
    // Cancel existing selection process
    if (this.cancelNextButtonSelection) {
      this.cancelNextButtonSelection();
      this.cancelNextButtonSelection = null;
    }
    
    // Start new selection process
    this.cancelNextButtonSelection = this.getNextButtonByClick((result) => {
      if (result) {
        console.log('Selected next button:', result.selector);
        // Store selector for future use
        this.listSelector.nextButtonSelector = result.selector;

        // Send selector to extension
        this.listSelector.sendSelectorToExtension(result.selector);
      } 
    });
    
    console.log('Move your mouse to the next page button and click to select it');
  }

  /**
   * Calculate similarity between children elements (enhanced)
   * @param {Array} elements - Array of DOM elements to compare
   * @returns {number} - Similarity score between 0 and 1
   */
  calculateSimpleChildSimilarity(elements) {
    if (!elements || elements.length < 3) return 0;
    
    // Check tag name consistency
    const tagNames = {};
    elements.forEach(el => {
      const tag = el.tagName.toLowerCase();
      tagNames[tag] = (tagNames[tag] || 0) + 1;
    });
    
    let maxTagCount = 0;
    for (const count of Object.values(tagNames)) {
      maxTagCount = Math.max(maxTagCount, count);
    }
    
    const tagSimilarity = maxTagCount / elements.length;
    
    // Check class name similarity (now with pattern recognition)
    const classPatterns = {};
    const classNames = {};
    let elementsWithClasses = 0;
    
    elements.forEach(el => {
      if (el.className) {
        elementsWithClasses++;
        
        // Store full pattern
        const pattern = el.className.trim();
        if (pattern) {
          classPatterns[pattern] = (classPatterns[pattern] || 0) + 1;
        }
        
        // Count individual classes
        const classes = pattern.split(/\s+/);
        classes.forEach(cls => {
          if (cls && !cls.startsWith('listselector-')) {
            classNames[cls] = (classNames[cls] || 0) + 1;
          }
        });
      }
    });
    
    // Find the most common pattern and class
    let maxPatternCount = 0;
    for (const count of Object.values(classPatterns)) {
      maxPatternCount = Math.max(maxPatternCount, count);
    }
    
    let maxClassCount = 0;
    for (const count of Object.values(classNames)) {
      maxClassCount = Math.max(maxClassCount, count);
    }
    
    // Calculate both pattern and class similarity
    const patternSimilarity = elementsWithClasses > 0 ? 
      maxPatternCount / elementsWithClasses : 0;
      
    const classSimilarity = elementsWithClasses > 0 ? 
      maxClassCount / elementsWithClasses : 0;
    
    // Check structure similarity (number of children)
    const childCounts = elements.map(el => el.children.length);
    const avgChildCount = childCounts.reduce((sum, count) => sum + count, 0) / elements.length;
    
    let structureSimilarity = 0;
    if (avgChildCount > 0) {
      const deviation = childCounts.reduce(
        (sum, count) => sum + Math.abs(count - avgChildCount), 0
      ) / elements.length;
      
      structureSimilarity = Math.max(0, 1 - (deviation / avgChildCount));
    }
    
    // Check size similarity
    const rects = elements.map(el => el.getBoundingClientRect());
    const avgWidth = rects.reduce((sum, rect) => sum + rect.width, 0) / elements.length;
    const avgHeight = rects.reduce((sum, rect) => sum + rect.height, 0) / elements.length;
    
    let sizeSimilarity = 0;
    if (avgWidth > 0 && avgHeight > 0) {
      const widthDeviation = rects.reduce(
        (sum, rect) => sum + Math.abs(rect.width - avgWidth), 0
      ) / (elements.length * avgWidth);
      
      const heightDeviation = rects.reduce(
        (sum, rect) => sum + Math.abs(rect.height - avgHeight), 0
      ) / (elements.length * avgHeight);
      
      sizeSimilarity = Math.max(0, 1 - (widthDeviation + heightDeviation) / 2);
    }
    
    // Calculate DOM structure similarity by looking at node types
    const structureSignatures = elements.map(el => {
      let signature = '';
      // Add child element types to signature
      Array.from(el.children).forEach(child => {
        signature += child.tagName.toLowerCase() + ',';
      });
      return signature;
    });
    
    const signatureCounts = {};
    structureSignatures.forEach(sig => {
      signatureCounts[sig] = (signatureCounts[sig] || 0) + 1;
    });
    
    let maxSignatureCount = 0;
    for (const count of Object.values(signatureCounts)) {
      maxSignatureCount = Math.max(maxSignatureCount, count);
    }
    
    const domStructureSimilarity = maxSignatureCount / elements.length;
    
    // Combine similarities with weights
    // Give more weight to pattern and structure similarities
    return tagSimilarity * 0.15 + 
           Math.max(patternSimilarity, classSimilarity) * 0.3 + 
           structureSimilarity * 0.2 + 
           sizeSimilarity * 0.15 + 
           domStructureSimilarity * 0.2;
  }

  /**
   * Start the table selection process
   */
  startTableSelection() {
    console.log('Starting table selection process');
    
    // Cancel existing selection processes
    if (this.cancelTableSelection) {
      this.cancelTableSelection();
      this.cancelTableSelection = null;
    }
    
    // Create and show prompt
    const prompt = document.createElement('div');
    prompt.className = 'listselector-prompt';
    prompt.textContent = '请点击表格中的任意内容以选中整个列表';
    document.body.appendChild(prompt);
    
    // Clear existing highlights
    this.listSelector.clearHighlight();
    this.clearAllTableSelectionStyles();
    
    // Hover handler for preview highlighting
    const hoverHandler = (e) => {
      const target = e.target;
      
      // Clear previous hover highlights
      document.querySelectorAll('.listselector-table-hover').forEach(el => {
        el.classList.remove('listselector-table-hover');
      });
      
      // Find potential list containers by bubbling up
      let currentElement = target;
      let listCandidate = null;
      
      while (currentElement && currentElement !== document.body) {
        // Check if this element could be a list container
        const children = this.utils.getValidChildren(currentElement);
        
        if (children.length >= this.listSelector.minChildren) {
          // Calculate similarity of children
          const similarity = this.calculateSimpleChildSimilarity(children);
          
          if (similarity > 0.5) {
            listCandidate = currentElement;
            break;
          }
        }
        
        currentElement = currentElement.parentElement;
      }
      
      // Highlight the found list container
      if (listCandidate) {
        listCandidate.classList.add('listselector-table-hover');
      }
    };
    
    // Click handler for table selection
    const handleClick = (e) => {
      // Prevent default actions
      e.preventDefault();
      e.stopPropagation();
      
      const target = e.target;
      
      // Find the list container
      let currentElement = target;
      let selectedList = null;
      let selectedChildren = [];
      let bestScore = 0;
      let bestContainer = null;
      let bestChildren = [];
      
      // First check if we clicked on an already highlighted candidate
      const hoveredElement = document.querySelector('.listselector-table-hover');
      if (hoveredElement && (hoveredElement === target || hoveredElement.contains(target))) {
        // User clicked on an already highlighted table
        const children = this.utils.getValidChildren(hoveredElement);
        if (children.length >= this.listSelector.minChildren) {
          selectedList = hoveredElement;
          selectedChildren = children;
        }
      } else {
        // Bubble up to find all potential table containers
        while (currentElement && currentElement !== document.body) {
          // Skip elements that are too small
          const rect = currentElement.getBoundingClientRect();
          if (rect.width < 100 || rect.height < 100) {
            currentElement = currentElement.parentElement;
            continue;
          }
          
          const children = this.utils.getValidChildren(currentElement);
          
          if (children.length >= this.listSelector.minChildren) {
            const similarity = this.calculateSimpleChildSimilarity(children);
            const score = similarity * (children.length / 100 + 1) * Math.sqrt(rect.width * rect.height / 10000);
            
            // Keep track of best container
            if (score > bestScore) {
              bestScore = score;
              bestContainer = currentElement;
              bestChildren = children;
            }
            
            // Check if we should select this container directly
            if (similarity > 0.7) {
              selectedList = currentElement;
              selectedChildren = children;
              break;
            }
          }
          
          currentElement = currentElement.parentElement;
        }
        
        // If we didn't find a high-quality match, use the best one we found
        if (!selectedList && bestContainer) {
          selectedList = bestContainer;
          selectedChildren = bestChildren;
        }
      }
      
      if (selectedList) {
        // Remove prompt
        if (prompt.parentNode) {
          document.body.removeChild(prompt);
        }
        
        // Clear all hover highlights
        this.clearAllTableSelectionStyles();
        
        // Generate selector BEFORE adding custom classes
        const selector = this.utils.generateSelector(selectedList);
        const area = selectedList.offsetWidth * selectedList.offsetHeight;
        
        // Create list object
        const listObject = {
          element: selectedList,
          children: selectedChildren,
          selector: selector,
          childCount: selectedChildren.length,
          area: area,
          score: area * Math.log(selectedChildren.length + 1),
          isManualSelection: true
        };
        
        // Clear existing lists and add this one
        this.listSelector.lists = [listObject];
        this.listSelector.currentIndex = 0;
        
        // Highlight the selected list
        selectedList.classList.add('listselector-highlight');
        selectedChildren.forEach(child => child.classList.add('listselector-highlight-child'));
        
        // Get table data and send to extension
        const tableData = this.listSelector.getTableData();
        if (tableData) {
          this.listSelector.sendTableDataToExtension(tableData);
        }
        
        console.log('Table selected:', selector);
        console.log('Table data:', tableData);
        
        // Clean up event listeners
        document.removeEventListener('mouseover', hoverHandler);
        document.removeEventListener('click', handleClick, true);
        
        // Callback could be added here if needed
      } else {
        console.log('No valid table/list found at clicked position');
      }
    };
    
    // Add event listeners
    document.addEventListener('mouseover', hoverHandler);
    document.addEventListener('click', handleClick, true);
    
    // Store cancel function
    this.cancelTableSelection = () => {
      if (prompt.parentNode) {
        document.body.removeChild(prompt);
      }
      document.removeEventListener('mouseover', hoverHandler);
      document.removeEventListener('click', handleClick, true);
      this.clearAllTableSelectionStyles();
    };
    
    console.log('Move your mouse over the table content and click to select the entire table');
    return this.cancelTableSelection;
  }
  
  /**
   * Detect next button automatically
   */
  detectNextButton() {
    const keywords = ['下一页', 'next', '>', '→', '前进'];
    const candidates = Array.from(document.querySelectorAll('a, button, span'))
      .filter(el => {
        const text = el.textContent.trim().toLowerCase();
        return keywords.some(k => text.includes(k)) && 
               !el.closest('.pagination') && // Exclude other buttons in pagination
               el.offsetWidth * el.offsetHeight > 50; // Ensure minimum area
      })
      .sort((a, b) => b.offsetLeft - a.offsetLeft); // Prioritize right-side buttons
    
    if (candidates.length) {
      const nextBtn = candidates[0];
      // Generate selector before adding class
      const selector = this.listSelector.generateSelector(nextBtn);
      nextBtn.classList.add('listselector-next-btn');
      return selector;
    }
    
    return null;
  }
}