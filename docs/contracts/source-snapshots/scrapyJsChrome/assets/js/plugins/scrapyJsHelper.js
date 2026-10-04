// class ListSelector {
//   constructor(options = {}) {
//     this.lists = [];
//     this.currentIndex = -1;
//     this.minChildren = options.minChildren || 3;
//     this.preferredMin = options.preferredMin || 10;
//     this.preferredMax = options.preferredMax || 20;
//     this.maxLists = options.maxLists || 5;
//     this.detectLists();
//     this.injectStyles();
//     this.bindKeyboardEvents();
//   }

//   // 注入样式时添加悬停高亮样式
//   injectStyles() {
//     const style = document.createElement('style');
//     style.textContent = `
//       .listselector-highlight { border: 2px solid red; transition: border 0.3s; }
//       .listselector-highlight-child { background: rgba(255, 0, 0, 0.1); }
//       .listselector-step { position: absolute; background: #000; color: #fff; padding: 5px; cursor: pointer; font-size: 12px; z-index: 1000; }
//       .listselector-next-btn { 
//         position: relative; 
//         border: 2px solid green !important; 
//         background-color: rgba(0, 255, 0, 0.2) !important; 
//         transition: all 0.3s; 
//       }
//       .listselector-next-btn::after { 
//         content: "已选中 - 再次点击正常翻页"; 
//         position: absolute; 
//         top: -25px; 
//         left: 0; 
//         background: #00a000; 
//         color: #fff; 
//         padding: 3px 6px; 
//         font-size: 12px; 
//         border-radius: 3px;
//         white-space: nowrap;
//         z-index: 10001;
//       }
//       .listselector-next-btn-hover { 
//         border: 2px dashed orange !important; 
//         background-color: rgba(255, 165, 0, 0.1) !important;
//         position: relative;
//         cursor: pointer;
//       }
//       .listselector-next-btn-hover::after {
//         content: "点击选择此元素作为下一页按钮"; 
//         position: absolute; 
//         top: -25px; 
//         left: 0; 
//         background: #ff8c00; 
//         color: #fff; 
//         padding: 3px 6px; 
//         font-size: 12px; 
//         border-radius: 3px;
//         white-space: nowrap;
//         z-index: 10001;
//       }
//       .listselector-prompt { 
//         position: fixed; 
//         top: 20px; 
//         left: 50%; 
//         transform: translateX(-50%); 
//         background: rgba(0, 0, 0, 0.8); 
//         color: #fff; 
//         padding: 10px 20px; 
//         border-radius: 5px;
//         font-size: 14px;
//         box-shadow: 0 2px 10px rgba(0,0,0,0.3);
//         z-index: 10000; 
//       }
//     `;
//     document.head.appendChild(style);
//   }

//   // 获取有效子元素
//   getValidChildren(container) {
//     const validTags = ['div', 'li', 'tr', 'td', 'th', 'p', 'span', 'a', 'article', 'section', 'dd', 'dt'];
//     const invalidTags = ['script', 'style', 'meta', 'link', 'noscript', 'iframe'];
    
//     return Array.from(container.children).filter(child => {
//       const tag = child.tagName.toLowerCase();
      
//       // 排除明显无效的标签
//       if (invalidTags.includes(tag)) return false;
      
//       // 检查文本内容
//       const hasText = child.textContent.trim().length > 0;
      
//       // 检查是否有子元素
//       const hasChildren = child.children.length > 0;
      
//       // 检查是否有图片或链接
//       const hasImg = child.querySelector('img[src]') !== null;
//       const hasLink = child.querySelector('a[href]') !== null;
      
//       // 如果是有效标签或者有文本内容或者有有效子元素，则认为是有效的
//       return validTags.includes(tag) || hasText || hasChildren || hasImg || hasLink;
//     });
//   }

//   // 改进的选择器生成方法 - 确保不会生成重复的选择器
//   generateSelector(element, parentNode = null) {
//     // 如果元素不存在或不是元素节点则返回空字符串
//     if (!element || element.nodeType !== Node.ELEMENT_NODE) {
//       return '';
//     }
    
//     // 优先使用 CssSelectorGenerator 如果存在
//     if (typeof CssSelectorGenerator !== 'undefined') {
//       try {
//         if (parentNode) {
//           const options = { root: parentNode };
//           let selector = CssSelectorGenerator.getCssSelector(element, options);
//           return selector;
//         }
//         return CssSelectorGenerator.getCssSelector(element);
//       } catch (e) {
//         console.warn('CssSelectorGenerator failed, falling back to custom selector generation', e);
//       }
//     }
    
//     // 自定义选择器生成逻辑
//     // 检查元素是否有ID
//     if (element.id && !/\d/.test(element.id)) {
//       // 使用ID选择器，这通常是最精确的
//       return `#${element.id}`;
//     }
    
//     // 检查是否是相对于父节点的直接子元素
//     if (parentNode && element.parentElement === parentNode) {
//       // 检查当前元素是否有可用的类名
//       if (element.className) {
//         const classes = element.className.trim().split(/\s+/)
//           .filter(cls => !cls.startsWith('listselector-'));
        
//         if (classes.length > 0) {
//           // 尝试找到唯一标识此元素的最简短类选择器组合
//           for (let i = 1; i <= classes.length; i++) {
//             // 尝试使用i个类的组合
//             const combinations = this.getCombinations(classes, i);
//             for (const combo of combinations) {
//               const classSelector = combo.map(cls => `.${cls}`).join('');
//               const selector = `${element.tagName.toLowerCase()}${classSelector}`;
//               // 检查该选择器在父元素中是否唯一
//               const matches = parentNode.querySelectorAll(selector);
//               if (matches.length === 1) {
//                 return selector;
//               }
//             }
//           }
//         }
//       }
      
//       // 如果没有唯一类，使用nth-child
//       const siblings = Array.from(parentNode.children)
//         .filter(child => child.tagName === element.tagName);
      
//       if (siblings.length > 1) {
//         const index = siblings.indexOf(element) + 1;
//         return `${element.tagName.toLowerCase()}:nth-of-type(${index})`;
//       } else {
//         // 如果是唯一的标签类型，直接使用标签选择器
//         return element.tagName.toLowerCase();
//       }
//     }
    
//     // 对于更复杂的关系，构建一个相对路径
//     // 找到一个能够唯一标识元素的父路径
//     let current = element;
//     let path = [];
//     let maxPathLength = parentNode ? 3 : 5; // 限制路径长度
//     let pathLength = 0;
    
//     while (current && current !== document.body && current !== document.documentElement && current !== parentNode && pathLength < maxPathLength) {
//       // 为当前元素创建选择器段
//       let part = current.tagName.toLowerCase();
      
//       // 尝试添加ID
//       if (current.id && !/\d/.test(current.id)) {
//         part = `#${current.id}`;
//         path.unshift(part);
//         break; // ID是唯一的，可以结束路径构建
//       }
      
//       // 尝试添加类
//       if (current.className) {
//         const classes = current.className.trim().split(/\s+/)
//           .filter(cls => !cls.startsWith('listselector-'));
        
//         // 尝试找到最小的类组合以唯一标识元素
//         for (let i = 1; i <= Math.min(classes.length, 2); i++) { // 最多使用两个类名
//           const combinations = this.getCombinations(classes, i);
//           for (const combo of combinations) {
//             const classSelector = combo.map(cls => `.${cls}`).join('');
//             const testSelector = `${part}${classSelector}`;
//             // 检查在父元素上下文中的唯一性
//             if (current.parentElement) {
//               const matches = current.parentElement.querySelectorAll(testSelector);
//               if (matches.length === 1) {
//                 part = testSelector;
//                 break;
//               }
//             }
//           }
//           // 如果找到了唯一选择器，跳出循环
//           if (part !== current.tagName.toLowerCase()) break;
//         }
//       }
      
//       // 如果没有找到唯一标识符，使用nth-of-type
//       if (part === current.tagName.toLowerCase() && current.parentElement) {
//         const siblings = Array.from(current.parentElement.children)
//           .filter(child => child.tagName === current.tagName);
        
//         if (siblings.length > 1) {
//           const index = siblings.indexOf(current) + 1;
//           part += `:nth-of-type(${index})`;
//         }
//       }
      
//       path.unshift(part);
//       current = current.parentElement;
//       pathLength++;
      
//       // 如果当前路径已足够唯一，可以提前结束
//       if (pathLength >= 2) {
//         const testPath = path.join(' > ');
//         try {
//           const matches = document.querySelectorAll(testPath);
//           if (matches.length === 1) {
//             break;
//           }
//         } catch (e) {
//           // 忽略无效选择器错误，继续构建路径
//         }
//       }
//     }
    
//     // 返回完整路径选择器
//     return path.join(' > ');
//   }
  
//   // 获取元素组合的辅助方法
//   getCombinations(array, size) {
//     if (size > array.length) return [];
//     if (size === 1) return array.map(item => [item]);
    
//     return array.reduce((acc, current, index) => {
//       const smallerCombinations = this.getCombinations(
//         array.slice(index + 1), 
//         size - 1
//       );
//       const combinationsWithCurrent = smallerCombinations.map(
//         smallerComb => [current].concat(smallerComb)
//       );
//       return acc.concat(combinationsWithCurrent);
//     }, []);
//   }

//   // 高亮指定列表
//   highlight(index) {
//     if (index < 0 || index >= this.lists.length) return;
//     this.lists.forEach((list, i) => {
//       list.element.classList.remove('listselector-highlight');
//       list.children.forEach(child => child.classList.remove('listselector-highlight-child'));
//       if (i === index) {
//         list.element.classList.add('listselector-highlight');
//         list.children.forEach(child => child.classList.add('listselector-highlight-child'));
//       }
//     });
//     this.currentIndex = index;
//   }
  
//   clearHighlight() {
//     this.lists.forEach(list => {
//       list.element.classList.remove('listselector-highlight');
//       list.children.forEach(child => child.classList.remove('listselector-highlight-child'));
//     });
//     this.currentIndex = -1;
//   }

//   // 切换到下一个列表
//   next() {
//     if (this.currentIndex === -1) {
//       // If currently in unselected state, select the first list
//       this.highlight(0);
//     } else {
//       // Otherwise cycle to the next list
//       this.currentIndex = (this.currentIndex + 1) % this.lists.length;
//       this.highlight(this.currentIndex);
//     }
    
//     if (this.currentIndex !== -1) {
//       let tableData = this.getTableData();
//       return tableData;
//     }
//     return null;
//   }

//   // 获取当前选中列表的选择器
//   getCurrentSelector() {
//     if (this.lists.length === 0 || this.currentIndex < 0 || this.currentIndex >= this.lists.length) {
//       console.log('没有选中的列表或列表为空');
//       return null;
//     }
    
//     const currentList = this.lists[this.currentIndex];
//     return {
//       selector: currentList.selector,
//       itemCount: currentList.children.length,
//       element: currentList.element
//     };
//   }

//   // 改进的getTableData方法，保持原始结构
//   getTableData(callback, specificSelector = null) {
//     // 获取要处理的元素
//     let selector, element, children;
    
//     if (specificSelector) {
//       element = document.querySelector(specificSelector);
//       if (!element) {
//         console.error('找不到指定的表格元素:', specificSelector);
//         if (callback) callback({ error: '表格未找到' });
//         return null;
//       }
//       children = this.getValidChildren(element);
//       selector = specificSelector;
//     } else if (this.currentIndex !== -1) {
//       const currentList = this.lists[this.currentIndex];
//       element = currentList.element;
//       children = currentList.children;
//       selector = currentList.selector;
//     } else {
//       console.error('没有选中的表格，请先调用next()方法或提供选择器');
//       if (callback) callback({ error: '没有选中的表格' });
//       return null;
//     }
    
//     // 提取表格数据
//     const data = this.extractTableData(element, children);
    
//     // 返回或回调结果
//     const result = {
//       selector: selector,
//       tableId: this.currentIndex,
//       data: data,
//       itemCount: children.length,
//       goodClasses: element.classList ? Array.from(element.classList) : []
//     };
    
//     if (callback) {
//       callback(result);
//     }
    
//     return result;
//   }

//   // 改进的表格数据提取方法
//   extractTableData(tableElement, children) {
//     const data = [];
//     const tagName = tableElement.tagName.toLowerCase();
    
//     if (tagName === 'table') {
//       // 处理HTML表格
//       const rows = tableElement.querySelectorAll('tr');
//       let headers = [];
//       let headerSelectors = [];
      
//       // 提取表头及其选择器
//       const headerRow = tableElement.querySelector('thead tr, tr:first-child');
//       if (headerRow) {
//         const headerCells = headerRow.querySelectorAll('th, td');
//         headers = Array.from(headerCells).map(th => th.textContent.trim());
//         // 使用表头行作为父节点生成相对选择器
//         headerSelectors = Array.from(headerCells).map(th => this.generateSelector(th, headerRow));
//       }
      
//       // 提取数据行
//       Array.from(rows).forEach((row, rowIndex) => {
//         // 跳过表头行
//         if (rowIndex === 0 && headers.length > 0) return;
        
//         const rowData = {};
//         // 生成行选择器
//         const rowSelector = this.generateSelector(row, tableElement);
//         rowData['_rowSelector'] = rowSelector; // 存储行选择器
//         let hasValidData = false; // 标记行是否有有效数据
        
//         const cells = row.querySelectorAll('td');
        
//         cells.forEach((cell, cellIndex) => {
//           // 为每个单元格生成唯一选择器
//           const cellSelector = this.generateSelector(cell, row);
//           const cellText = cell.textContent.trim();
          
//           // 只有当文本不为空或有有效图片或链接时才添加
//           if (cellText || cell.querySelector('img[src]') || cell.querySelector('a[href]')) {
//             hasValidData = true; // 标记有效数据存在
            
//             // 创建单元格数据对象
//             rowData[cellSelector] = {};
            
//             // 只有当文本不为空时才添加文本属性
//             if (cellText) {
//               rowData[cellSelector].text = cellText;
//             }
            
//             rowData[cellSelector].selector = cellSelector;
            
//             // 如果有表头，也添加表头信息
//             if (headerSelectors[cellIndex]) {
//               rowData[cellSelector].header = headers[cellIndex] || '';
//               rowData[cellSelector].headerSelector = headerSelectors[cellIndex];
//             }
            
//             // 提取链接
//             const links = cell.querySelectorAll('a');
//             if (links.length > 0) {
//               const validLinks = [];
//               links.forEach((link, linkIndex) => {
//                 const linkText = link.textContent.trim();
//                 const linkHref = link.href;
//                 if (linkText || linkHref) {
//                   // 使用单元格作为父节点生成链接选择器
//                   const linkSelector = this.generateSelector(link, cell);
//                   validLinks.push({
//                     href: linkHref,
//                     text: linkText || '',
//                     selector: linkSelector
//                   });
//                 }
//               });
//               // 只有当有有效链接时才添加
//               if (validLinks.length > 0) {
//                 rowData[cellSelector].links = validLinks;
//               }
//             }
            
//             // 提取图片
//             const images = cell.querySelectorAll('img');
//             if (images.length > 0) {
//               const validImages = [];
//               images.forEach((img, imgIndex) => {
//                 if (img.src) {
//                   // 使用单元格作为父节点生成图片选择器
//                   const imgSelector = this.generateSelector(img, cell);
//                   validImages.push({
//                     src: img.src,
//                     alt: img.alt || '',
//                     selector: imgSelector
//                   });
//                 }
//               });
//               // 只有当有有效图片时才添加
//               if (validImages.length > 0) {
//                 rowData[cellSelector].images = validImages;
//               }
//             }
//           }
//         });
        
//         // 只有当行有效数据时才添加
//         if (hasValidData) {
//           data.push(rowData);
//         }
//       });
//     } else {
//       // 处理非表格元素 (div, ul, ol 等)
//       children.forEach((child, index) => {
//         // 创建基本项数据结构
//         const itemData = {};
        
//         // 使用与父容器相对的选择器标识子元素
//         const childSelector = this.generateSelector(child, tableElement);
//         // 存储子元素的选择器和索引
//         // itemData._itemSelector = childSelector;
//         // itemData._index = index + 1;
        
//         // 检查子元素是否有直接文本内容
//         const childText = this.getPureText(child);
//         if (childText) {
//           // 如果子元素本身有直接文本，存储为主要内容属性
//           itemData.text = childText;
//         }
        
//         // 创建已处理元素的映射，防止重复处理
//         const processedSelectors = new Set();
        
//         // 处理子元素的所有可见和有意义的后代元素
//         this.processVisibleElements(child, itemData, processedSelectors);
        
//         // 只有当项包含有效数据时才添加到结果中
//         if (Object.keys(itemData).length > 2) { // 超过_itemSelector和_index
//           data.push(itemData);
//         }
//       });
//     }
    
//     return data;
//   }
  
//   // 处理元素的可见子元素
//   processVisibleElements(element, itemData, processedSelectors, depth = 0) {
//     // 限制递归深度，避免过深的嵌套
//     const maxDepth = 3;
//     if (depth > maxDepth) return false;
    
//     // 是否找到了有意义的数据
//     let foundData = false;
    
//     // 处理元素的直接子元素
//     Array.from(element.children).forEach(child => {
//       // 检查子元素是否可见和有意义
//       const isVisible = child.offsetParent !== null; // 简单的可见性检查
//       const tagName = child.tagName.toLowerCase();
      
//       // 忽略脚本和样式元素
//       if (['script', 'style', 'meta'].includes(tagName)) return;
      
//       // 为子元素生成唯一标识符
//       const selector = this.generateSelector(child, element);
      
//       // 如果此选择器已处理，跳过
//       if (processedSelectors.has(selector)) return;
//       processedSelectors.add(selector);
      
//       // 检查元素是否有直接文本、链接或图片
//       const text = this.getPureText(child);
//       const isLink = tagName === 'a' && child.href;
//       const isImage = tagName === 'img' && child.src;
      
//       // 如果元素有文本、是链接或图片，添加到数据中
//       if (text || isLink || isImage) {
//         foundData = true;
        
//         // 创建元素数据
//         itemData[selector] = {
//           selector: selector,
//           tag: tagName
//         };
        
//         // 添加文本（如果有）
//         if (text) {
//           itemData[selector].text = text;
//         }
        
//         // 添加链接信息（如果是链接）
//         if (isLink) {
//           itemData[selector].href = child.href;
//         }
        
//         // 添加图片信息（如果是图片）
//         if (isImage) {
//           itemData[selector].src = child.src;
//           if (child.alt) {
//             itemData[selector].alt = child.alt;
//           }
//         }
//       }
      
//       // 递归处理子元素的子元素
//       // 对于容器元素如div，递归处理可能会找到更多有意义的内容
//       if (child.children.length > 0) {
//         // 对于特殊的容器类型（list、directory等），可以创建子数据结构
//         if (['ul', 'ol', 'dl'].includes(tagName) || 
//             child.classList.contains('list') || 
//             child.classList.contains('directory')) {
          
//           // 为容器创建子元素集合
//           if (!itemData[selector]) {
//             itemData[selector] = {
//               selector: selector,
//               tag: tagName
//             };
//           }
          
//           // 添加子元素容器
//           itemData[selector].children = {};
          
//           // 递归处理子元素
//           if (this.processContainerChildren(child, itemData[selector].children, processedSelectors, depth + 1)) {
//             foundData = true;
//           }
//         } else {
//           // 对于普通容器，正常递归
//           if (this.processVisibleElements(child, itemData, processedSelectors, depth + 1)) {
//             foundData = true;
//           }
//         }
//       }
//     });
    
//     return foundData;
//   }
  
//   // 专门处理容器子元素的方法
//   processContainerChildren(container, dataContainer, processedSelectors, depth) {
//     let foundData = false;
    
//     // 处理容器的直接子元素
//     Array.from(container.children).forEach((child, index) => {
//       const childSelector = this.generateSelector(child, container);
      
//       // 防止重复处理
//       if (processedSelectors.has(childSelector)) return;
//       processedSelectors.add(childSelector);
      
//       const tagName = child.tagName.toLowerCase();
//       const text = this.getPureText(child);
//       const isLink = tagName === 'a' && child.href;
//       const isImage = tagName === 'img' && child.src;
      
//       // 如果子元素有内容
//       if (text || isLink || isImage) {
//         foundData = true;
        
//         // 添加子元素数据
//         dataContainer[childSelector] = {
//           selector: childSelector,
//           tag: tagName,
//           index: index + 1
//         };
        
//         if (text) {
//           dataContainer[childSelector].text = text;
//         }
        
//         if (isLink) {
//           dataContainer[childSelector].href = child.href;
//         }
        
//         if (isImage) {
//           dataContainer[childSelector].src = child.src;
//           if (child.alt) {
//             dataContainer[childSelector].alt = child.alt;
//           }
//         }
//       }
//     });
    
//     return foundData;
//   }

//   // 获取元素的纯文本（排除子元素文本）
//   getPureText(element) {
//     let text = '';
//     for (let node of element.childNodes) {
//       if (node.nodeType === Node.TEXT_NODE) {
//         text += node.textContent;
//       }
//     }
//     return text.trim();
//   }

  
// // 改进的 detectLists 方法
// detectLists() {
//   const bodyArea = document.body.offsetWidth * document.body.offsetHeight;
//   const candidates = [];
  
//   // 广泛的排除类 - 避免选择导航、分页、页脚等
//   const excludeClasses = [
//     'pagination', 'pager', 'pages', 'page-numbers',
//     'btn-prev', 'btn-next', 'prev', 'next',
//     'nav', 'navbar', 'navigation', 'menu', 'submenu',
//     'footer', 'header', 'banner', 'sidebar',
//     'ad', 'ads', 'advertisement', 'social', 'share',
//     'search', 'login', 'signup', 'modal', 'popup'
//   ];
  
//   // 优先考虑的列表类名，增加了更多常见列表类名
//   const preferredClasses = [
//     'list', 'items', 'results', 'products', 'cards', 'grid',
//     'subject-list', 'content-list', 'search-results', 
//     'collection', 'gallery', 'catalog', 'feed',
//     'goods', 'product-list', 'item-list', 'article-list',
//     'course-list', 'book-list', 'movie-list', 'news-list', 'comment-list',
//     'job-list', 'search-content-col', 'rec-job-list', 'subject-item',
//     'rank-list', 'directory', 'card-area', 'search-list'
//   ];

//   // 查找所有可能的列表容器，增加更多常见选择器
//   const potentialSelectors = [
//     // 标准列表标签
//     'table', 'ul', 'ol', 'dl',
//     // 常见的列表容器DIV
//     'div[class*="list"]', 'div[class*="items"]', 'div[class*="results"]',
//     'div[class*="grid"]', 'div[class*="cards"]', 'div[class*="collection"]',
//     'div[class*="feed"]', 'div[class*="product"]', 'div[id*="list"]',
//     'div[id*="results"]', 'div[id*="products"]',
//     'div[class*="row"]', 'div[class*="content"]', 'div[class*="job"]',
//     'div[class*="course"]', 'div[class*="subject"]', 'div[class*="card"]',
//     '.subject-list', '.m-itemlist', '.gl-warp', '.flow-list',
//     '.search-list', '.goods-list', '.search-result-list',
//     '.job-list-container', '.course-list', '.bottom-content',
//     '.directory', '.card-area', '.tbpc-row', '.tbpc-col',
//     '.rank-list', '.doubleCard', '.rec-job-list'
//   ];
  
//   // 首先尝试处理已经标记了listselector-highlight的元素
//   try {
//     const markedLists = document.querySelectorAll('.listselector-highlight');
//     if (markedLists.length > 0) {
//       markedLists.forEach(container => {
//         const children = this.getValidChildren(container);
//         const childCount = children.length;
        
//         if (childCount >= this.minChildren) {
//           // 使用原有方法获取常见类名
//           const goodClasses = this.getGoodClasses(children);
          
//           candidates.push({
//             type: container.tagName.toLowerCase(),
//             element: container,
//             parent: container.parentElement,
//             children,
//             goodClasses: goodClasses,
//             area: container.offsetWidth * container.offsetHeight,
//             score: childCount * 200, // 给标记的元素更高权重
//             isStandardList: true,
//             hasPreferredClass: true,
//             selector: this.generateSelector(container),
//             childCount: childCount
//           });
//         }
//       });
//     }
//   } catch (e) {
//     console.error("处理已标记元素错误:", e);
//   }
  
//   // 合并选择器以一次性查询
//   try {
//     const combinedSelector = potentialSelectors.join(', ');
//     document.querySelectorAll(combinedSelector).forEach(container => {
//       // 跳过具有排除类名的容器
//       if (this.hasExcludedClass(container, excludeClasses)) return;
      
//       // 计算容器面积
//       const rect = container.getBoundingClientRect();
//       const area = rect.width * rect.height;
      
//       // 跳过过小或不可见的容器
//       if (area < 0.01 * bodyArea || isNaN(area) || !this.isElementVisible(container)) return;
      
//       // 获取有效子元素 - 考虑直接子元素和子元素的子元素
//       const directChildren = this.getValidChildren(container);
//       let children = directChildren;
      
//       // 如果直接子元素太少，但这些子元素自身包含更多子元素，则考虑这些子元素
//       if (directChildren.length < this.minChildren) {
//         let nestedChildren = [];
//         directChildren.forEach(child => {
//           if (child.children && child.children.length > 0) {
//             nestedChildren = nestedChildren.concat(Array.from(child.children));
//           }
//         });
        
//         if (nestedChildren.length >= this.minChildren) {
//           children = nestedChildren.filter(child => {
//             const tag = child.tagName.toLowerCase();
//             return !['script', 'img', 'meta', 'style', 'button'].includes(tag) && 
//                   child.textContent.trim().length > 0;
//           });
//         }
//       }
      
//       const childCount = children.length;
      
//       // 跳过子元素过少的容器
//       if (childCount < this.minChildren) return;
      
//       // 检查是否是标准列表结构
//       const isStandardList = this.isStandardListStructure(container);
      
//       // 检查是否具有优先类名
//       const hasPreferredClass = this.hasPreferredClass(container, preferredClasses);
      
//       // 计算基础分数
//       const goodClasses = this.getGoodClasses(children);
//       const consistencyScore = goodClasses.length > 0 ? 2 : 1;
      
//       // 基本分数 = 面积 * log(子元素数) * 一致性分数
//       let score = area * Math.log(childCount + 1) * consistencyScore;
      
//       // 子元素数量在理想范围内
//       if (childCount >= this.preferredMin && childCount <= this.preferredMax) {
//         score *= 1.5;
//       }
      
//       // 标准列表结构(ul>li, ol>li, table>tr)
//       if (isStandardList) {
//         score *= 3;
//       }
      
//       // 具有列表相关类名
//       if (hasPreferredClass) {
//         score *= 2;
//       }
      
//       // 降低div容器优先级(除非有列表类名)
//       if (container.tagName.toLowerCase() === 'div' && !hasPreferredClass) {
//         score *= 0.8;
//       }
      
//       // 额外的启发式规则：子元素一致性
//       const childrenSimilarity = this.calculateChildrenSimilarity(children);
//       score *= (1 + childrenSimilarity);
      
//       // 检查子元素是否有重复的类名模式
//       const hasRepeatingPattern = this.hasRepeatingClassPatterns(children);
//       if (hasRepeatingPattern) {
//         score *= 1.5;
//       }
      
//       // 将候选添加到列表
//       candidates.push({
//         type: container.tagName.toLowerCase(),
//         element: container,
//         parent: container.parentElement,
//         children,
//         goodClasses: goodClasses,
//         area,
//         score,
//         isStandardList,
//         hasPreferredClass,
//         childCount,
//         selector: this.generateSelector(container),
//       });
//     });
//   } catch (e) {
//     console.error("选择器查询错误:", e);
//     // 出错时使用更保守的方法
//     document.querySelectorAll('table, ul, ol, .listselector-highlight').forEach(container => {
//       // 基本检查
//       if (this.hasExcludedClass(container, excludeClasses)) return;
      
//       const children = this.getValidChildren(container);
//       if (children.length < this.minChildren) return;
      
//       candidates.push({
//         type: container.tagName.toLowerCase(),
//         element: container,
//         parent: container.parentElement,
//         children,
//         goodClasses: this.getGoodClasses(children),
//         area: container.offsetWidth * container.offsetHeight,
//         score: children.length * 100,
//         isStandardList: true,
//         selector: this.generateSelector(container),
//         childCount: children.length
//       });
//     });
//   }
  
//   // 如果找到候选列表
//   if (candidates.length > 0) {
//     // 先按分数排序
//     candidates.sort((a, b) => b.score - a.score);
    
//     // 优先选择标准列表结构
//     const standardLists = candidates.filter(item => item.isStandardList);
    
//     if (standardLists.length > 0) {
//       this.lists = standardLists.slice(0, this.maxLists);
//     } else {
//       this.lists = candidates.slice(0, this.maxLists);
//     }
    
//     // 验证我们选择的是列表容器而非列表项
//     this.lists = this.lists.map(list => this.validateListSelection(list)).filter(Boolean);
    
//     // 移除重复列表(可能有嵌套选择)
//     this.lists = this.removeDuplicateLists(this.lists);
//   } else {
//     this.lists = [];
//   }
  
//   console.log("检测到的列表:", this.lists.map(list => ({
//     selector: list.selector,
//     childCount: list.childCount,
//     score: list.score
//   })));
// }
  
//   // 替代原有的getGoodClasses方法
//   getCommonClassesFromChildren(children) {
//     const classCount = {};
//     children.forEach(child => {
//       const classes = (child.className || '').trim().split(/\s+/).filter(c => c);
//       classes.forEach(cls => classCount[cls] = (classCount[cls] || 0) + 1);
//     });
//     const threshold = children.length / 3; // 降低阈值，只要1/3的元素有相同类名就考虑
//     return Object.keys(classCount).filter(cls => 
//       classCount[cls] >= threshold && 
//       !cls.startsWith('listselector-') // 排除插件自己添加的类
//     );
//   }
  
//   // 原始的 getGoodClasses 方法保持不变
// getGoodClasses(children) {
//   const classCount = {};
//   children.forEach(child => {
//     const classes = (child.className || '').trim().split(/\s+/).filter(c => c);
//     classes.forEach(cls => classCount[cls] = (classCount[cls] || 0) + 1);
//   });
//   const threshold = children.length / 2 - 2;
//   return Object.keys(classCount).filter(cls => classCount[cls] >= threshold);
// }


// // 添加检测重复的类名模式的方法
// hasRepeatingClassPatterns(children) {
//   if (children.length < 3) return false;
  
//   // 检查类名模式
//   const classPatterns = {};
//   let totalPatternsFound = 0;
  
//   children.forEach(child => {
//     if (!child.className) return;
    
//     const classNames = child.className.trim();
//     if (classPatterns[classNames]) {
//       classPatterns[classNames]++;
//       totalPatternsFound++;
//     } else {
//       classPatterns[classNames] = 1;
//     }
//   });
  
//   // 计算重复率
//   const repeatRatio = totalPatternsFound / children.length;
//   return repeatRatio > 0.5; // 如果超过50%的元素有相同的类名模式，则认为是列表
// }
    
//   // 改进的获取有效子元素方法
//   getValidChildren(container) {
//     const validTags = ['div', 'li', 'tr', 'td', 'th', 'p', 'span', 'a', 'article', 'section', 'dd', 'dt'];
//     const invalidTags = ['script', 'style', 'meta', 'link', 'noscript', 'iframe'];
    
//     return Array.from(container.children).filter(child => {
//       const tag = child.tagName.toLowerCase();
      
//       // 排除明显无效的标签
//       if (invalidTags.includes(tag)) return false;
      
//       // 检查文本内容
//       const hasText = child.textContent.trim().length > 0;
      
//       // 检查是否有子元素
//       const hasChildren = child.children.length > 0;
      
//       // 检查是否有图片或链接
//       const hasImg = child.querySelector('img[src]') !== null;
//       const hasLink = child.querySelector('a[href]') !== null;
      
//       // 如果是有效标签或者有文本内容或者有有效子元素，则认为是有效的
//       return validTags.includes(tag) || hasText || hasChildren || hasImg || hasLink;
//     });
//   }
  
//   hasRepeatingClassPatterns(children) {
//     if (children.length < 3) return false;
    
//     // 检查类名模式
//     const classPatterns = {};
//     let totalPatternsFound = 0;
    
//     children.forEach(child => {
//       if (!child.className) return;
      
//       const classNames = child.className.trim();
//       if (classPatterns[classNames]) {
//         classPatterns[classNames]++;
//         totalPatternsFound++;
//       } else {
//         classPatterns[classNames] = 1;
//       }
//     });
    
//     // 计算重复率
//     const repeatRatio = totalPatternsFound / children.length;
//     return repeatRatio > 0.5; // 如果超过50%的元素有相同的类名模式，则认为是列表
//   }

  

//   // 检查容器是否具有标准列表结构
//   isStandardListStructure(container) {
//     const tagName = container.tagName.toLowerCase();
    
//     // ul或ol内主要是li元素
//     if (tagName === 'ul' || tagName === 'ol') {
//       const children = Array.from(container.children);
//       if (children.length === 0) return false;
      
//       const liCount = children.filter(child => child.tagName.toLowerCase() === 'li').length;
//       return liCount >= children.length * 0.7; // 至少70%是li
//     }
    
//     // table内有tr元素
//     if (tagName === 'table') {
//       const rows = container.querySelectorAll('tr');
//       return rows.length >= 2; // 至少有标题行和数据行
//     }
    
//     // div列表: 子元素标签和类一致性
//     if (tagName === 'div') {
//       const children = Array.from(container.children);
//       if (children.length < 3) return false;
      
//       // 检查子元素标签一致性
//       const tags = {};
//       children.forEach(child => {
//         const tag = child.tagName.toLowerCase();
//         tags[tag] = (tags[tag] || 0) + 1;
//       });
      
//       // 找到最常见的标签和占比
//       let maxTag = '', maxCount = 0;
//       for (const tag in tags) {
//         if (tags[tag] > maxCount) {
//           maxTag = tag;
//           maxCount = tags[tag];
//         }
//       }
      
//       const tagConsistency = maxCount / children.length;
      
//       // 检查类名一致性
//       const classes = {};
//       children.forEach(child => {
//         if (!child.className) return;
        
//         // 提取第一个类名作为主要类
//         const mainClass = child.className.trim().split(/\s+/)[0];
//         if (mainClass) {
//           classes[mainClass] = (classes[mainClass] || 0) + 1;
//         }
//       });
      
//       // 找到最常见的类和占比
//       let maxClass = '', maxClassCount = 0;
//       for (const cls in classes) {
//         if (classes[cls] > maxClassCount) {
//           maxClass = cls;
//           maxClassCount = classes[cls];
//         }
//       }
      
//       const classConsistency = maxClassCount / children.length;
      
//       // 结合标签和类的一致性评估
//       return tagConsistency > 0.7 || classConsistency > 0.6;
//     }
    
//     return false;
//   }
  
//   // 检查元素是否具有排除类
//   hasExcludedClass(element, excludeClasses) {
//     if (!element.className) return false;
    
//     const classes = element.className.toLowerCase().split(/\s+/);
//     return excludeClasses.some(excludeClass => 
//       classes.includes(excludeClass) || 
//       element.className.toLowerCase().includes(excludeClass)
//     );
//   }
  
//   // 检查元素是否具有优先类
//   hasPreferredClass(element, preferredClasses) {
//     if (!element.className && !element.id) return false;
    
//     // 检查类名
//     if (element.className) {
//       const classes = element.className.toLowerCase().split(/\s+/);
//       const hasPreferredClass = preferredClasses.some(preferredClass => 
//         classes.includes(preferredClass) || 
//         element.className.toLowerCase().includes(preferredClass)
//       );
      
//       if (hasPreferredClass) return true;
//     }
    
//     // 检查ID
//     if (element.id) {
//       return preferredClasses.some(preferredClass => 
//         element.id.toLowerCase().includes(preferredClass)
//       );
//     }
    
//     return false;
//   }
  
//   // 计算子元素相似度
//   calculateChildrenSimilarity(children) {
//     if (children.length < 2) return 0;
    
//     // 计算平均大小
//     let totalWidth = 0, totalHeight = 0;
//     children.forEach(child => {
//       const rect = child.getBoundingClientRect();
//       totalWidth += rect.width;
//       totalHeight += rect.height;
//     });
    
//     const avgWidth = totalWidth / children.length;
//     const avgHeight = totalHeight / children.length;
    
//     // 计算标准差
//     let widthVariance = 0, heightVariance = 0;
//     children.forEach(child => {
//       const rect = child.getBoundingClientRect();
//       widthVariance += Math.pow(rect.width - avgWidth, 2);
//       heightVariance += Math.pow(rect.height - avgHeight, 2);
//     });
    
//     const widthStdDev = Math.sqrt(widthVariance / children.length);
//     const heightStdDev = Math.sqrt(heightVariance / children.length);
    
//     // 计算变异系数(标准差/平均值)
//     const widthCV = avgWidth ? widthStdDev / avgWidth : 1;
//     const heightCV = avgHeight ? heightStdDev / avgHeight : 1;
    
//     // 相似度 = 1 - 平均变异系数 (越低越相似)
//     const similarityScore = 1 - (widthCV + heightCV) / 2;
    
//     // 确保分数在0-1之间
//     return Math.max(0, Math.min(1, similarityScore));
//   }
  
//   // 验证列表选择，确保我们选择的是列表容器而非列表项
//   validateListSelection(listCandidate) {
//     const element = listCandidate.element;
//     const tagName = element.tagName.toLowerCase();
    
//     // 标准列表容器直接返回
//     if (tagName === 'ul' || tagName === 'ol' || tagName === 'table') {
//       return listCandidate;
//     }
    
//     // 检查是否是列表项而非列表容器
//     const parent = element.parentElement;
//     if (parent && parent.tagName.toLowerCase() !== 'body') {
//       // 查找相似兄弟元素
//       const siblings = Array.from(parent.children).filter(child => 
//         child.tagName === element.tagName
//       );
      
//       // 如果有多个相似兄弟，父元素可能是真正的列表容器
//       if (siblings.length >= 3) {
//         // 检查父元素是否已在候选列表中
//         const parentAlreadyCandidate = this.lists.some(item => 
//           item.element === parent
//         );
        
//         if (!parentAlreadyCandidate) {
//           // 创建父元素的候选项
//           const parentChildren = this.getValidChildren(parent);
//           return {
//             type: parent.tagName.toLowerCase(),
//             element: parent,
//             parent: parent.parentElement,
//             children: parentChildren,
//             goodClasses: this.getGoodClasses(parentChildren),
//             area: listCandidate.area * 1.1,
//             score: listCandidate.score * 1.2,
//             selector: this.generateSelector(parent),
//             childCount: parentChildren.length
//           };
//         }
//       }
//     }
    
//     return listCandidate;
//   }
  
//   // 移除重复的列表选择
//   removeDuplicateLists(lists) {
//     const uniqueLists = [];
//     const seenElements = new Set();
    
//     for (const list of lists) {
//       // 检查元素是否已经处理过
//       if (!seenElements.has(list.element)) {
//         seenElements.add(list.element);
//         uniqueLists.push(list);
        
//         // 同时标记此元素的所有子元素
//         this.markAllChildren(list.element, seenElements);
//       }
//     }
    
//     return uniqueLists;
//   }
  
//   // 将元素的所有子元素标记为已处理
//   markAllChildren(element, seenSet) {
//     for (const child of element.children) {
//       seenSet.add(child);
//       this.markAllChildren(child, seenSet);
//     }
//   }
  
//   // 检查元素是否可见
//   isElementVisible(element) {
//     const style = window.getComputedStyle(element);
//     return style.display !== 'none' && 
//            style.visibility !== 'hidden' && 
//            style.opacity !== '0' &&
//            element.offsetWidth > 0 && 
//            element.offsetHeight > 0;
//   }

//   // 获取表格结构的方法
//   getTableStructure() {
//     if (this.currentIndex === -1 || !this.lists[this.currentIndex]) {
//       console.error('没有选中的表格，无法获取结构');
//       return null;
//     }
    
//     const currentList = this.lists[this.currentIndex];
//     const element = currentList.element;
//     const tagName = element.tagName.toLowerCase();
    
//     // 结构数据
//     const structure = {
//       type: tagName,
//       selector: currentList.selector,
//       childCount: currentList.children.length
//     };
    
//     if (tagName === 'table') {
//       // 表格特有结构
//       const headerRow = element.querySelector('thead tr, tr:first-child');
//       if (headerRow) {
//         const headerCells = headerRow.querySelectorAll('th, td');
//         structure.headers = Array.from(headerCells).map((cell, index) => {
//           return {
//             text: cell.textContent.trim(),
//             selector: this.generateSelector(cell, headerRow),
//             index: index
//           };
//         });
//       }
      
//       // 示例行数据结构
//       const sampleRow = element.querySelector('tbody tr, tr:nth-child(2)');
//       if (sampleRow) {
//         structure.sampleRow = {
//           selector: this.generateSelector(sampleRow, element),
//           cells: Array.from(sampleRow.querySelectorAll('td')).map((cell, index) => {
//             return {
//               text: cell.textContent.trim(),
//               selector: this.generateSelector(cell, sampleRow),
//               index: index,
//               hasLinks: cell.querySelectorAll('a').length > 0,
//               hasImages: cell.querySelectorAll('img').length > 0
//             };
//           })
//         };
//       }
//     } else {
//       // 非表格元素结构
//       if (currentList.children.length > 0) {
//         const sampleChild = currentList.children[0];
//         structure.sampleItem = {
//           selector: this.generateSelector(sampleChild, element),
//           hasLinks: sampleChild.querySelectorAll('a').length > 0,
//           hasImages: sampleChild.querySelectorAll('img').length > 0,
//           childElements: Array.from(sampleChild.children).map(child => {
//             return {
//               tag: child.tagName.toLowerCase(),
//               selector: this.generateSelector(child, sampleChild),
//               hasContent: child.textContent.trim().length > 0
//             };
//           })
//         };
//       }
//     }
    
//     return structure;
//   }


//   // 获取元素的纯文本（排除子元素文本）
//   getPureText(element) {
//     let text = '';
//     for (let node of element.childNodes) {
//       if (node.nodeType === Node.TEXT_NODE) {
//         text += node.textContent;
//       }
//     }
//     return text.trim();
//   }

//   // 添加步骤引导
//   addSteps() {
//     this.lists.forEach((list, index) => {
//       const stepLabel = document.createElement('div');
//       stepLabel.className = 'listselector-step';
//       stepLabel.textContent = `Table ${index + 1}`;
//       stepLabel.style.top = `${list.element.offsetTop - 30}px`;
//       stepLabel.style.left = `${list.element.offsetLeft}px`;
//       document.body.appendChild(stepLabel);
//       stepLabel.addEventListener('click', () => this.highlight(index));
//     });
//   }

//   // 绑定键盘事件
//   bindKeyboardEvents() {
//     document.addEventListener('keydown', (e) => {
//       if (e.key === 'ArrowRight') this.next();
//     });
//   }
    
//   // 清除所有"下一页"按钮的高亮和相关类
//   clearAllNextButtonStyles() {
//     // 清除悬停高亮
//     document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
//       el.classList.remove('listselector-next-btn-hover')
//     );
    
//     // 清除选中高亮
//     document.querySelectorAll('.listselector-next-btn').forEach(el => 
//       el.classList.remove('listselector-next-btn')
//     );
    
//     // 清除已保存的状态
//     this.nextButtonSelector = null;
//     if (this.selectedButton) {
//       this.selectedButton = null;
//     }
//   }


//   // 通过点击获取"下一页"按钮 - 修改过的方法
//   getNextButtonByClick(callback) {
//     // Create and show prompt to guide user
//     const prompt = document.createElement('div');
//     prompt.className = 'listselector-prompt';
//     prompt.textContent = '请点击"下一页"按钮以选中';
//     document.body.appendChild(prompt);
  
//     // 确保从干净状态开始
//     this.clearAllNextButtonStyles();

//     // Track if this is our first selection
//     let isFirstSelection = true;
//     let selectedButton = null;
//     let selectedSelector = null;
  
//     // Hover handler to preview highlight potential buttons
//     const hoverHandler = (e) => {
//       const target = e.target.closest('a, button, span, div');
//       if (target) {
//         document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
//           el.classList.remove('listselector-next-btn-hover')
//         );
//         target.classList.add('listselector-next-btn-hover');
//       }
//     };
  
//     // Click handler for button selection
//     const handleClick = (e) => {
//       const target = e.target.closest('a, button, span, div');
//       if (!target) return;
  
//       if (isFirstSelection) {
//         // First click: prevent default navigation and just select
//         e.preventDefault();
//         e.stopPropagation();
        
//         // Generate selector BEFORE adding our custom classes
//         selectedSelector = this.generateSelector(target);
        
//         // Remove prompt and hover highlights
//         document.body.removeChild(prompt);
//         document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
//           el.classList.remove('listselector-next-btn-hover')
//         );
        
//         // Highlight the selected button
//         target.classList.add('listselector-next-btn');
        
//         // Store the selected button
//         selectedButton = target;
        
//         // Remember this button for future
//         if (typeof callback === 'function') {
//           callback({ selector: selectedSelector, element: target });
//         }
        
//         // Change the flag for next click
//         isFirstSelection = false;
        
//         console.log('下一页按钮已选中，再次点击即可正常翻页');
        
//         // Remove hover handler after selection to prevent hovering effects on other elements
//         document.removeEventListener('mouseover', hoverHandler);
        
//         // Keep only the click listener active for the second click
//       } else if (target === selectedButton) {
//         // Allow natural navigation on second click of the same button
//         // We don't prevent default here so natural navigation works
        
//         // Clean up event listeners
//         document.removeEventListener('click', handleClick, true);
//       }
//     };
  
//     // Add event listeners - note the capture phase (true) for click to ensure we catch it first
//     document.addEventListener('mouseover', hoverHandler);
//     document.addEventListener('click', handleClick, true);
    
//     // Return a function to cancel the selection mode
//     return () => {
//       if (prompt.parentNode) {
//         document.body.removeChild(prompt);
//       }
//       document.removeEventListener('mouseover', hoverHandler);
//       document.removeEventListener('click', handleClick, true);
//       document.querySelectorAll('.listselector-next-btn-hover').forEach(el => 
//         el.classList.remove('listselector-next-btn-hover')
//       );
//     };
//   }
  
//   // Function to start the next button selection process
//   startNextButtonSelection() {
//     // First cancel any existing selection process
//     if (this.cancelNextButtonSelection) {
//       this.cancelNextButtonSelection();
//       this.cancelNextButtonSelection = null;
//     }
    
//     // Start new selection process
//     this.cancelNextButtonSelection = this.getNextButtonByClick((result) => {
//       if (result) {
//         console.log('Selected next button:', result.selector);
//         // Store the selector for future use
//         this.nextButtonSelector = result.selector;

//         // 发送选择器到扩展的其他部分
//         this.sendSelectorToExtension(result.selector);
//       } 
//     });
    
//     console.log('请移动鼠标到下一页按钮并点击以选择它');
//   }
    
//   // 添加到ListSelector类中，用于传递选择器到扩展
//   sendSelectorToExtension(selector) {
//     console.log('选择器已通过事件发送:', selector);
//     if (typeof callChromeBridgeInterface === 'function') {
//       callChromeBridgeInterface("ScrapyJs.selected_nextPageBtn", { data: selector }, "CHROME_BRIDGE_POPUP");
//     } else {
//       // 备选方案：使用自定义事件
//       let event = new CustomEvent('SELECTOR_SELECTED', { 
//         detail: { 
//           type: 'nextPageBtn',
//           selector: selector 
//         } 
//       });
//       window.dispatchEvent(event);
//     }
//   }
  
//   // 发送表格数据到扩展
//   sendTableDataToExtension(data) {
//     console.log('表格数据已通过事件发送:', data);
//     if (typeof callChromeBridgeInterface === 'function') {
//       callChromeBridgeInterface("ScrapyJs.selected_tableData", { data: data }, "CHROME_BRIDGE_POPUP");
//     } else {
//       // 备选方案：使用自定义事件
//       let event = new CustomEvent('SELECTOR_SELECTED', { 
//         detail: { 
//           type: 'tableData',
//           data: data 
//         } 
//       });
//       window.dispatchEvent(event);
//     }
//   }

//   // Function to programmatically click the selected next button
//   clickNextButton() {
//     if (this.nextButtonSelector) {
//       const btn = document.querySelector(this.nextButtonSelector);
//       if (btn) {
//         console.log('Clicking next button...');
//         btn.click();
//       } else {
//         console.log('Next button not found on current page');
//       }
//     } else {
//       console.log('No next button selected yet. Please use startNextButtonSelection() first');
//     }
//   }
  
//   // 获取当前已选中"下一页"按钮的选择器
//   getSelectedNextButtonSelector() {
//     if (this.nextButtonSelector) {
//       return this.nextButtonSelector;
//     } else {
//       console.log('尚未选择"下一页"按钮，请先使用startNextButtonSelection()方法');
//       return null;
//     }
//   }

//   detectNextButton() {
//     const keywords = ['下一页', 'next', '>', '→', '前进'];
//     const candidates = Array.from(document.querySelectorAll('a, button, span'))
//       .filter(el => {
//         const text = el.textContent.trim().toLowerCase();
//         return keywords.some(k => text.includes(k)) && 
//                !el.closest('.pagination') && // 排除分页容器内的其他按钮
//                el.offsetWidth * el.offsetHeight > 50; // 确保有一定面积
//       })
//       .sort((a, b) => b.offsetLeft - a.offsetLeft); // 优先右侧按钮
//     if (candidates.length) {
//       const nextBtn = candidates[0];
//       // Generate selector before adding our class
//       const selector = this.generateSelector(nextBtn);
//       nextBtn.classList.add('listselector-next-btn');
//       return selector;
//     }
//     return null;
//   }
  
//   // 获取当前表格和对应数据，并通过回调通知扩展
//   getCurrentTableAndData(callback) {
//     const selectorInfo = this.getCurrentSelector();
//     if (!selectorInfo) {
//       if (callback) callback({ error: '没有选中的表格' });
//       return null;
//     }
    
//     const result = this.getTableData(null, selectorInfo.selector);
//     if (callback) callback(result);
    
//     // 发送数据到扩展
//     this.sendTableDataToExtension(result);
    
//     return result;
//   }
  
//   // 创建包含表格元素选择器和数据的快照
//   createTableSnapshot() {
//     if (this.currentIndex === -1 || !this.lists[this.currentIndex]) {
//       console.error('没有选中的表格，无法创建快照');
//       return null;
//     }
    
//     const currentList = this.lists[this.currentIndex];
//     const tableData = this.getTableData();
    
//     if (!tableData) return null;
    
//     // 创建包含选择器和数据的快照
//     const snapshot = {
//       timestamp: new Date().toISOString(),
//       url: window.location.href,
//       tableSelector: currentList.selector,
//       data: tableData.data,
//       structure: this.getTableStructure(),
//       nextButtonSelector: this.nextButtonSelector || null
//     };
    
//     return snapshot;
//   }
  
//   // 从上一个快照恢复表格选择
//   restoreFromSnapshot(snapshot, callback) {
//     if (!snapshot || !snapshot.tableSelector) {
//       console.error('无效的快照数据');
//       if (callback) callback({ error: '无效的快照数据' });
//       return false;
//     }
    
//     // 查找匹配的表格
//     const matchIndex = this.lists.findIndex(list => 
//       list.selector === snapshot.tableSelector
//     );
    
//     if (matchIndex >= 0) {
//       // 找到匹配的表格
//       this.highlight(matchIndex);
//       this.currentIndex = matchIndex;
      
//       // 恢复下一页按钮选择器
//       if (snapshot.nextButtonSelector) {
//         this.nextButtonSelector = snapshot.nextButtonSelector;
        
//         // 尝试高亮下一页按钮
//         const nextBtn = document.querySelector(snapshot.nextButtonSelector);
//         if (nextBtn) {
//           this.clearAllNextButtonStyles();
//           nextBtn.classList.add('listselector-next-btn');
//         }
//       }
      
//       if (callback) callback({ 
//         success: true, 
//         tableSelector: snapshot.tableSelector,
//         currentIndex: this.currentIndex 
//       });
      
//       return true;
//     } else {
//       // 未找到匹配的表格
//       console.warn('未能找到匹配的表格:', snapshot.tableSelector);
//       if (callback) callback({ 
//         error: '未能找到匹配的表格', 
//         tableSelector: snapshot.tableSelector 
//       });
      
//       return false;
//     }
//   }
// }

// // 使用示例
// var selector = new ListSelector({
//   minChildren: 3,
//   preferredMin: 10,
//   preferredMax: 20,
//   maxLists: 5,
// });

// console.log('scrapyJsHelper loaded', selector);

// // 获取所有表格
// // selector.detectLists();

// // 高亮第一个表格
// // selector.highlight(0); 

// // 切换到下一个表格
// // const nextTableSelector = selector.next();
// // console.log('下一个表格选择器:', nextTableSelector);
// // const structure = selector.getTableStructure();
// // selector.getTableData()

// // 获取当前表格数据
// // const tableData = selector.getCurrentTableAndData(result => {
// //   console.log('当前表格数据:', result);
// // });

// // 选择下一页按钮
// // selector.startNextButtonSelection();