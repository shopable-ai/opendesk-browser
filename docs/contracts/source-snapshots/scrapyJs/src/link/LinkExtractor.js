function getCheerio() {
  try {
    return require('cheerio');
  } catch {
    throw new Error('LinkExtractor requires "cheerio". Please install it with `npm install cheerio`.');
  }
}

class LinkExtractor {
  constructor({
    allow = [],
    deny = [],
    allowed_domains = [],
    deny_domains = [],
    restrict_xpaths = [],
    restrict_css = [],
    tags = ['a'],
    attrs = ['href'],
    canonicalize = false,
    unique = true,
    process_value = (value) => value
  } = {}) {
    this.allow = Array.isArray(allow) ? allow : [allow];
    this.deny = Array.isArray(deny) ? deny : [deny];
    this.allowed_domains = Array.isArray(allowed_domains) ? allowed_domains : [allowed_domains];
    this.deny_domains = Array.isArray(deny_domains) ? deny_domains : [deny_domains];
    this.restrict_xpaths = Array.isArray(restrict_xpaths) ? restrict_xpaths : [restrict_xpaths];
    this.restrict_css = Array.isArray(restrict_css) ? restrict_css : [restrict_css];
    this.tags = Array.isArray(tags) ? tags : [tags];
    this.attrs = Array.isArray(attrs) ? attrs : [attrs];
    this.canonicalize = canonicalize;
    this.unique = unique;
    this.process_value = process_value;
  }

  extract_links(response) {
    return this.extractLinks(response);
  }

  extractLinks(response) {
    const body = response?.body ?? response?.text ?? response ?? '';
    const $ = getCheerio().load(body);
    let links = [];
    const selectorEntries = this.getSelectorEntries($);

    const extractUrl = (el, attr) => {
      const relativeUrl = $(el).attr(attr);
      if (!relativeUrl) return null;

      try {
        if (response?.url) {
          return new URL(relativeUrl, response.url).href;
        }
        return new URL(relativeUrl).href;
      } catch {
        return null;
      }
    };

    for (const { selector, textContains } of selectorEntries) {
      $(selector).each((_, el) => {
        if (textContains && !$(el).text().includes(textContains)) {
          return;
        }
        this.extractFromElement(el, $, links, extractUrl);
      });
    }

    links = this.processLinks(links);

    if (this.canonicalize) {
      links = links.map(link => this.canonicalizeUrl(link));
    }

    if (this.unique) {
      links = [...new Set(links)];
    }

    return links;
  }

  getSelectorEntries() {
    const cssSelectors = this.restrict_css.filter(Boolean);
    if (cssSelectors.length > 0) {
      return cssSelectors.map(selector => ({ selector, textContains: null }));
    }

    const xpathSelectors = this.restrict_xpaths.filter(Boolean);
    if (xpathSelectors.length > 0) {
      return xpathSelectors.map(xpath => this.convertXPathToSelectorEntry(xpath));
    }

    return this.tags.filter(Boolean).map(selector => ({ selector, textContains: null }));
  }

  convertXPathToSelectorEntry(xpath) {
    const normalized = String(xpath).trim();
    const idMatch = normalized.match(/@id='([^']+)'/);
    const classMatch = normalized.match(/@class='([^']+)'/);
    const tagMatches = [...normalized.matchAll(/\/\/([a-zA-Z][\w-]*)/g)].map(match => match[1]);
    const textMatch = normalized.match(/contains\(text\(\),'([^']+)'\)/);

    const selectorParts = [];
    if (idMatch) {
      selectorParts.push(`#${idMatch[1]}`);
    }

    const trailingTag = tagMatches[tagMatches.length - 1];
    if (trailingTag) {
      selectorParts.push(trailingTag);
    }

    if (classMatch) {
      const classSelector = classMatch[1]
        .split(/\s+/)
        .filter(Boolean)
        .map(name => `.${name}`)
        .join('');
      if (classSelector) {
        selectorParts.push(classSelector);
      }
    }

    const selector = selectorParts.join(' ').replace(/\s+\./g, '.').trim();
    if (!selector) {
      throw new Error(`LinkExtractor could not convert restrict_xpaths entry: ${xpath}`);
    }

    return {
      selector,
      textContains: textMatch ? textMatch[1] : null
    };
  }

  extractFromElement(el, $, links, extractUrl) {
    this.attrs.forEach(attr => {
      const url = extractUrl(el, attr);
      if (!url || !this.isAllowed(url)) return;

      const processedUrl = this.process_value(url);
      if (processedUrl) {
        links.push(processedUrl);
      }
    });
  }

  isAllowed(url) {
    try {
      const urlObj = new URL(url);
      const isDomainAllowed = this.allowed_domains.length === 0 ||
        this.allowed_domains.some(domain => urlObj.hostname.endsWith(domain));
      if (!isDomainAllowed) return false;

      const isDomainDenied = this.deny_domains.some(domain => urlObj.hostname.endsWith(domain));
      if (isDomainDenied) return false;

      const isUrlAllowed = this.allow.length === 0 ||
        this.allow.some(pattern => pattern instanceof RegExp ? pattern.test(url) : url.includes(pattern));
      if (!isUrlAllowed) return false;

      const isUrlDenied = this.deny.some(pattern => pattern instanceof RegExp ? pattern.test(url) : url.includes(pattern));
      if (isUrlDenied) return false;

      return true;
    } catch {
      return false;
    }
  }

  canonicalizeUrl(url) {
    try {
      return new URL(url).href;
    } catch {
      return url;
    }
  }

  process_links(links) {
    return this.processLinks(links);
  }

  processLinks(links) {
    return links;
  }
}

module.exports = LinkExtractor;
