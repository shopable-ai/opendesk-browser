// listSelector.js - Main entry point
// Import all the components
import { ListSelector } from './listSelectorCore.js';
import { ListDetector } from './listDetector.js';
import { TableDataExtractor } from './tableDataExtractor.js';
import { UIManager } from './uiManager.js';
import { SelectorUtils } from './selectorUtils.js';

// Export the main ListSelector class
export { ListSelector };

// Initialize ListSelector when this script is loaded
window.initListSelector = (options) => {
  const selector = new ListSelector(options || {});
  console.log('ListSelector initialized', selector);
  return selector;
};

// Auto-initialize if in browser context
if (typeof window !== 'undefined') {
  window.ListSelector = ListSelector;
  window.selector = window.initListSelector({
    minChildren: 3,
    preferredMin: 10,
    preferredMax: 20,
    maxLists: 5,
  });
  
  console.log('scrapyJsHelper loaded', window.selector);
}