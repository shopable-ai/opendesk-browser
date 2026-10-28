const LinkExtractor = require('../link/LinkExtractor');
const Request = require('../http/Request');

class Rule {
  constructor({
    link_extractor = null,
    callback = null,
    cb_kwargs = {},
    follow = true,
    process_links = links => links,
    process_request = request => request
  } = {}) {
    this.link_extractor = link_extractor instanceof LinkExtractor
      ? link_extractor
      : new LinkExtractor(link_extractor || {});
    this.callback = callback;
    this.cb_kwargs = cb_kwargs;
    this.follow = follow;
    this._process_links = process_links;
    this._process_request = process_request;
  }

  extract_links(response) {
    return this.link_extractor.extract_links(response);
  }

  process_links(links) {
    return this._process_links(links);
  }

  process_request(request) {
    return this._process_request(request);
  }

  resolve_callback(spider) {
    if (!this.callback) {
      return null;
    }

    const callback = typeof this.callback === 'string'
      ? spider[this.callback]
      : this.callback;

    if (typeof callback !== 'function') {
      throw new Error(`Rule callback "${this.callback}" is not defined on spider ${spider.name}.`);
    }

    return callback.bind(spider);
  }

  create_request_callback(spider) {
    const callback = this.resolve_callback(spider);
    const cb_kwargs = this.cb_kwargs;
    const shouldFollow = this.follow;

    if (callback && shouldFollow) {
      return async function* ruleCallback(response, scrapy) {
        yield* spider._run_callback(callback, response, scrapy, cb_kwargs);
        yield* spider._follow_rules(response, scrapy);
      };
    }

    if (callback) {
      return async function* ruleCallback(response, scrapy) {
        yield* spider._run_callback(callback, response, scrapy, cb_kwargs);
      };
    }

    if (shouldFollow) {
      return spider._parse_response.bind(spider);
    }

    return null;
  }

  create_request(link, spider) {
    const callback = this.create_request_callback(spider);
    if (!callback) {
      return null;
    }

    return new Request(link, callback);
  }

  async *build_requests(response, spider) {
    const links = await this.extract_links(response);
    const processedLinks = await this.process_links(links);

    for (const link of this.ensure_links(processedLinks)) {
      const request = this.create_request(link, spider);
      if (!request) continue;

      const processedRequest = await this.process_request(request);
      if (processedRequest) {
        yield processedRequest;
      }
    }
  }

  ensure_links(links) {
    if (!links) return [];
    return Array.isArray(links) ? links : [links];
  }
}

module.exports = Rule;
