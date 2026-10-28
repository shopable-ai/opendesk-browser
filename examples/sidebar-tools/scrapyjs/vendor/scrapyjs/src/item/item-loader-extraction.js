'use strict';

function fault(code, path, message) {
    const error = new Error(`${code}${path ? ` (${path})` : ''}: ${message}`);
    error.code = code;
    error.path = path;
    return error;
}

const axes = new Set(['ancestor', 'ancestor-or-self', 'attribute', 'child', 'descendant',
    'descendant-or-self', 'following', 'following-sibling', 'namespace', 'parent', 'preceding', 'preceding-sibling', 'self']);

// Only a terminal read suffix outside quotes/brackets/parentheses is metadata.
// XPath axes and CSS attribute values containing :: remain part of the query.
function selectorParts(input, path) {
    let quote = '', depth = 0, suffix = -1;
    const value = input.trim();
    for (let i = 0; i < value.length; i++) {
        const char = value[i];
        if (char === '\\') { i++; continue; }
        if (quote) { if (char === quote) quote = ''; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '[' || char === '(') depth++;
        if (char === ']' || char === ')') depth--;
        if (depth === 0 && value.slice(i, i + 2) === '::') {
            const prefix = value.slice(0, i).match(/([a-z-]+)$/)?.[1];
            if (!axes.has(prefix)) suffix = i;
            i++;
        }
    }
    if (suffix === -1) return { selector: value, attr: undefined };
    const selector = value.slice(0, suffix).trim(), attr = value.slice(suffix + 2).trim();
    if (!selector || !/^[\w-]+$/.test(attr)) throw fault('E_ITEMLOADER_SELECTOR', path, 'Invalid terminal read suffix');
    return { selector, attr };
}

function fieldRule(rule, path) {
    let parts, cardinality = 'auto';
    if (typeof rule === 'string') parts = selectorParts(rule, path);
    else {
        if (!rule || Array.isArray(rule) || typeof rule !== 'object' || typeof rule.selector !== 'string' || !rule.selector.trim()) {
            throw fault('E_ITEMLOADER_CONFIG', path, 'Field descriptor requires a nonempty selector');
        }
        if (Object.keys(rule).some(key => !['selector', 'read', 'attr', 'cardinality'].includes(key))) {
            throw fault('E_ITEMLOADER_CONFIG', path, 'Unknown field descriptor property');
        }
        parts = { selector: rule.selector.trim(), attr: undefined };
        cardinality = rule.cardinality ?? 'auto';
        if (!['auto', 'one', 'many'].includes(cardinality) || (rule.read !== undefined && !['text', 'attr', 'innerHTML', 'outerHTML'].includes(rule.read))) {
            throw fault('E_ITEMLOADER_CONFIG', path, 'Invalid read or cardinality');
        }
        if (rule.read === 'attr') {
            if (typeof rule.attr !== 'string' || !/^[\w:-]+$/.test(rule.attr)) throw fault('E_ITEMLOADER_CONFIG', path, 'Attribute read requires attr');
            parts.attr = rule.attr;
        } else {
            if (rule.attr !== undefined) throw fault('E_ITEMLOADER_CONFIG', path, 'attr requires read=attr');
            parts.attr = rule.read;
        }
    }
    const xpath = /^(?:\.?\/|\.\.?(?:\/|$)|[a-z-]+::)/.test(parts.selector);
    return { ...parts, attr: parts.attr ?? null, xpath, cardinality, path };
}

function normalizeConfig(config) {
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    const walk = (value, path, top = false, ancestors = new Set()) => {
        if (!object(value) || !Object.keys(value).length || ancestors.has(value)) throw fault('E_ITEMLOADER_CONFIG', path, 'Expected nonempty, acyclic field configuration');
        const next = new Set(ancestors).add(value);
        const fields = [];
        for (const [key, rule] of Object.entries(value)) {
            if (top && ['_listContainer', '_listItem'].includes(key)) continue;
            const fieldPath = path ? `${path}.${key}` : key;
            if (typeof rule === 'string' || (object(rule) && Object.hasOwn(rule, 'selector') && typeof rule.selector === 'string')) {
                fields.push({ key, field: fieldRule(rule, fieldPath) });
            } else if (object(rule)) fields.push({ key, fields: walk(rule, fieldPath, false, next) });
            else throw fault('E_ITEMLOADER_CONFIG', fieldPath, 'Expected selector, descriptor or nested configuration');
        }
        if (!fields.length) throw fault('E_ITEMLOADER_CONFIG', path, 'At least one field is required');
        return fields;
    };
    const fields = walk(config, '', true);
    for (const key of ['_listContainer', '_listItem']) {
        if (Object.hasOwn(config, key) && (typeof config[key] !== 'string' || !config[key].trim())) {
            throw fault('E_ITEMLOADER_CONFIG', key, `${key} must be a nonempty CSS selector`);
        }
    }
    if (config._listItem !== undefined && config._listContainer === undefined) throw fault('E_ITEMLOADER_CONFIG', '_listItem', '_listItem requires _listContainer');
    return { listSelector: config._listContainer ?? null, itemSelector: config._listItem ?? null, fields };
}

// Self-contained callback: ChromePage/Puppeteer serialize this function. The same
// implementation accepts Cheerio locally, keeping values and records identical.
function extractRecords(config, $, context) {
    const dom = !$;
    const root = dom ? document : context || $.root();
    const fail = (code, path, message) => { const error = new Error(`${code} (${path}): ${message}`); error.code = code; error.path = path; throw error; };
    const css = (context, selector, path) => {
        try { return dom ? Array.from(context.querySelectorAll(selector)) : context.find(selector).toArray(); }
        catch (error) { fail('E_ITEMLOADER_SELECTOR', path, error.message); }
    };
    const xpathQuery = field => {
        if (!dom) fail('E_ITEMLOADER_CAPABILITY', field.path, 'XPath requires a DOM evaluate backend');
        if (config.listSelector && field.selector.startsWith('/') && !field.selector.startsWith('//')) {
            fail('E_ITEMLOADER_XPATH_SCOPE', field.path, 'Absolute XPath is not allowed in list records; use .//');
        }
        return config.listSelector && field.selector.startsWith('//') ? '.' + field.selector : field.selector;
    };
    const query = (context, field) => {
        if (!field.selector) return [];
        if (!field.xpath) return css(context, field.selector, field.path);
        const selector = xpathQuery(field);
        try {
            const result = document.evaluate(selector, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
            const nodes = [];
            for (let i = 0; i < result.snapshotLength; i++) {
                const node = result.snapshotItem(i);
                const owner = node.nodeType === 2 ? node.ownerElement : node;
                if (context === document || context.contains(owner)) nodes.push(node);
            }
            return nodes;
        } catch (error) { fail('E_ITEMLOADER_SELECTOR', field.path, error.message); }
    };
    const validate = fields => {
        for (const entry of fields) {
            if (entry.fields) validate(entry.fields);
            else query(root, entry.field); // Validate even when no records match.
        }
    };
    const read = (node, attr) => {
        const text = () => (dom ? node.textContent || '' : $(node).text()).trim();
        if (dom && node.nodeType === 2) return node.value || '';
        if (dom && node.nodeType === 3) return node.textContent?.trim() || '';
        if (attr === 'text' || attr === 'innerText') return text();
        if (attr === 'innerHTML') return (dom ? node.innerHTML : $(node).html()) || '';
        if (attr === 'outerHTML') return (dom ? node.outerHTML : $.html(node)) || '';
        const attribute = name => (dom ? node.getAttribute?.(name) : $(node).attr(name)) || '';
        if (attr) return attribute(attr);
        const tag = (dom ? node.tagName || '' : node.name || '').toLowerCase();
        if (tag === 'a') return text() || attribute('href');
        if (['img', 'video', 'audio'].includes(tag)) return attribute('src');
        return text();
    };
    const item = (context, fields) => {
        const row = {};
        for (const entry of fields) {
            let value;
            if (entry.fields) value = item(context, entry.fields);
            else {
                const field = entry.field, nodes = query(context, field);
                if (field.cardinality === 'one' && nodes.length > 1) fail('E_ITEMLOADER_CARDINALITY', field.path, `Expected at most one match, received ${nodes.length}`);
                const values = nodes.map(node => read(node, field.attr));
                value = field.cardinality === 'many' ? values : values.length === 0 ? '' : values.length === 1 ? values[0] : values;
            }
            Object.defineProperty(row, entry.key, { value, writable: true, enumerable: true, configurable: true });
        }
        return row;
    };
    try {
        const containers = config.listSelector ? css(root, config.listSelector, '_listContainer') : [];
        if (config.itemSelector) css(root, config.itemSelector, '_listItem');
        validate(config.fields);
        if (!config.listSelector) return { records: [item(root, config.fields)] };
        const seen = new Set(), records = [];
        for (const container of containers) {
            const children = dom ? Array.from(container.children) : $(container).children().toArray();
            for (const child of children) {
                if (seen.has(child) || (config.itemSelector && !(dom ? child.matches(config.itemSelector) : $(child).is(config.itemSelector)))) continue;
                seen.add(child);
                records.push(item(dom ? child : $(child), config.fields));
            }
        }
        return { records };
    } catch (error) {
        return { error: { code: error.code || 'E_ITEMLOADER_SELECTOR', path: error.path || '', message: error.message } };
    }
}

module.exports = { fault, selectorParts, fieldRule, normalizeConfig, extractRecords };
