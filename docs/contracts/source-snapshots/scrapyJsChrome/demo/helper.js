/**
 * Function to remove all SVG elements from the current webpage
 * Can be executed in browser console (F12 developer tools)
 */
function removeSVGElements() {
    // Get all SVG elements on the page
    const svgElements = document.querySelectorAll('svg');
    
    // Count SVGs before removal
    const svgCount = svgElements.length;
    
    // Remove each SVG element
    svgElements.forEach(svg => {
      svg.remove();
    });
    
    // Also look for use tags with xlink:href referencing SVG
    const useTags = document.querySelectorAll('use[xlink\\:href]');
    useTags.forEach(useTag => {
      useTag.remove();
    });
    
    // Return a confirmation message
    return `Removed ${svgCount} SVG elements from the page`;
  }
  
  // Execute the function to remove SVGs
  removeSVGElements();
  

/**
 * Function to shorten long URLs in href attributes
 * Can be executed in browser console (F12 developer tools)
 */
function shortenHrefAttributes() {
    // Get all anchor elements on the page
    const anchorElements = document.querySelectorAll('a[href]');
    let modifiedCount = 0;
    
    anchorElements.forEach(anchor => {
      const href = anchor.getAttribute('href');
      
      // Check if the href contains a "?" character (query parameters)
      if (href && href.includes('?')) {
        // Keep only the URL up to the "?" character
        const shortenedHref = href.split('?')[0];
        anchor.setAttribute('href', shortenedHref);
        modifiedCount++;
      }
      
      // Alternative approach: if href is longer than a specific length
      else if (href && href.length > 100) {
        // Keep only the first 100 characters
        const shortenedHref = href.substring(0, 100);
        anchor.setAttribute('href', shortenedHref);
        modifiedCount++;
      }
    });
    
    return `Modified ${modifiedCount} URLs on the page`;
  }
  
  // Execute the function to shorten URLs
  shortenHrefAttributes();

