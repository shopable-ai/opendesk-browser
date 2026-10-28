/**
 * Item object for data (保持与 Scrapy 中 Item 类相似)
 */
class Item {
  constructor(data = {}) {
    Object.assign(this, data);
  }

  static applySchema(data, schema = {}) {
    const source = { ...(data || {}) };
    const fields = Array.isArray(schema.fields) ? schema.fields : null;
    const whitelist = Array.isArray(schema.whitelist) ? schema.whitelist : fields;
    const required = Array.isArray(schema.required) ? schema.required : [];
    const validators = schema.validators || {};

    const output = whitelist
      ? whitelist.reduce((acc, key) => {
          if (Object.prototype.hasOwnProperty.call(source, key)) {
            acc[key] = source[key];
          }
          return acc;
        }, {})
      : source;

    for (const key of required) {
      if (output[key] == null || output[key] === '') {
        throw new Error(`Item schema missing required field: ${key}`);
      }
    }

    for (const [key, validator] of Object.entries(validators)) {
      if (typeof validator === 'function' && Object.prototype.hasOwnProperty.call(output, key)) {
        const valid = validator(output[key], output);
        if (!valid) {
          throw new Error(`Item schema validation failed for field: ${key}`);
        }
      }
    }

    return output;
  }
}

module.exports = Item;
