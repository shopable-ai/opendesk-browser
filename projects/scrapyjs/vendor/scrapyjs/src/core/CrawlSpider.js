const { BaseSpider } = require('./BaseSpider');
const Rule = require('./Rule');

class CrawlSpider extends BaseSpider {
  constructor(config = {}) {
    super(config);
    this.rules = this.initializeRules(config.rules || []);
  }

  initializeRules(rules) {
    return rules.map(rule => {
      if (rule instanceof Rule) {
        return rule;
      }

      console.warn('Invalid rule object. Creating a new Rule instance.');
      return new Rule(rule);
    });
  }

  async *_iterate_outputs(output) {
    if (output == null) {
      return;
    }

    if (
      typeof output.then === 'function' &&
      typeof output[Symbol.asyncIterator] !== 'function' &&
      typeof output[Symbol.iterator] !== 'function'
    ) {
      yield* this._iterate_outputs(await output);
      return;
    }

    if (typeof output[Symbol.asyncIterator] === 'function') {
      for await (const value of output) {
        yield value;
      }
      return;
    }

    if (typeof output[Symbol.iterator] === 'function' && typeof output !== 'string') {
      for (const value of output) {
        yield value;
      }
      return;
    }

    yield output;
  }

  async *_run_callback(callback, response, scrapy, cb_kwargs = {}) {
    yield* this._iterate_outputs(callback(response, scrapy, cb_kwargs));
  }

  async *_parse_response(response, scrapy) {
    yield* this._run_callback(this.parse.bind(this), response, scrapy);
    yield* this._follow_rules(response, scrapy);
  }

  async *_follow_rules(response, scrapy) {
    for (const rule of this.rules) {
      yield* rule.build_requests(response, this, scrapy);
    }
  }

  async *parse(response, scrapy) {
    console.warn('parse method should be overridden by subclasses');
    yield null;
  }
}

module.exports = CrawlSpider;
