'use strict';

const {recordSelection} = require('./record-selection');

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
    let domOnlyScope = null;
    // Scope selectors share structural CSS; native state requires a DOM backend.
    // Reject query-relative scope and engine extensions rather than interpreting
    // the same saved rule differently in another consumer. Strings/attributes
    // and escaped identifier characters are not pseudo-classes.
    for (const key of ['_listContainer', '_listItem']) {
        if (!Object.hasOwn(config, key)) continue;
        const selector = config[key];
        let quote = '', brackets = 0;
        const stack = [{ name: '', start: true }], functions = new Map();
        const nativeState = ['enabled', 'disabled', 'checked', 'required', 'optional', 'any-link', 'link',
            'hover', 'active', 'visited', 'focus', 'focus-visible', 'focus-within', 'target', 'lang', 'dir',
            'indeterminate', 'default', 'valid', 'invalid', 'in-range', 'out-of-range', 'read-only', 'read-write',
            'placeholder-shown', 'autofill', 'defined', 'modal', 'fullscreen', 'picture-in-picture', 'open', 'user-valid', 'user-invalid'];
        const structural = ['not', 'is', 'where', 'has', 'root', 'empty',
            'first-child', 'last-child', 'only-child', 'nth-child', 'nth-last-child',
            'first-of-type', 'last-of-type', 'only-of-type', 'nth-of-type', 'nth-last-of-type'];
        for (let i = 0; i < selector.length; i++) {
            const char = selector[i], scope = stack[stack.length - 1];
            if (char === '\\') { i++; scope.start = false; continue; }
            if (quote) { if (char === quote) quote = ''; continue; }
            if (char === '"' || char === "'") { quote = char; continue; }
            if (char === '/' && selector[i + 1] === '*') {
                const end = selector.indexOf('*/', i + 2);
                if (end === -1) throw fault('E_ITEMLOADER_SELECTOR', key, 'Unterminated CSS comment');
                i = end + 1;
                continue;
            }
            if (char === '[') { brackets++; scope.start = false; }
            if (char === ']') brackets--;
            if (brackets) {
                if (char === '!' && selector[i + 1] === '=') throw fault('E_ITEMLOADER_SELECTOR', key, 'Nonstandard attribute operator');
                continue;
            }
            if (char === '(') { stack.push({ name: functions.get(i) || '', start: true, index: i + 1 }); continue; }
            if (char === ')') {
                if (stack.length === 1) throw fault('E_ITEMLOADER_SELECTOR', key, 'Unbalanced selector function');
                const frame = stack.pop();
                if (frame.name.startsWith('nth-')) {
                    const formula = selector.slice(frame.index, i).replace(/\/\*[\s\S]*?\*\//g, '').trim();
                    if (!/^(?:odd|even|[+-]?(?:\d*n(?:\s*[+-]\s*\d+)?|\d+))$/i.test(formula)) {
                        if (/\bof\b/i.test(formula)) domOnlyScope ||= key;
                        else throw fault('E_ITEMLOADER_SELECTOR', key, 'Invalid An+B nth formula');
                    }
                }
                stack[stack.length - 1].start = false;
                continue;
            }
            if (char === ',') { scope.start = true; continue; }
            if (scope.start && /[>+~]/.test(char) && scope.name !== 'has') {
                throw fault('E_ITEMLOADER_SELECTOR', key, 'Relative selector arguments are supported only in :has()');
            }
            if (!/\s/.test(char)) scope.start = false;
            if (char === ':') {
                const token = selector.slice(i + 1).match(/^((?:[\w-]|\\(?:[0-9a-f]{1,6}\s?|[^\r\n\f]))+)/i)?.[1];
                const name = token?.replace(/\\([0-9a-f]{1,6})\s?|\\(.)/gi,
                    (_match, hex, literal) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : literal).toLowerCase();
                if (selector[i + 1] === ':' || (!structural.includes(name) && !nativeState.includes(name))) {
                    throw fault('E_ITEMLOADER_SELECTOR', key, 'Record scope requires supported CSS; relative :scope and selector extensions are not portable');
                }
                if (nativeState.includes(name)) domOnlyScope ||= key;
                if (name === 'has' && stack.some(frame => frame.name === 'has')) {
                    throw fault('E_ITEMLOADER_SELECTOR', key, 'Nested :has() is not portable CSS');
                }
                functions.set(i + 1 + token.length, name);
            }
        }
    }
    return { ...recordSelection(config._listContainer, config._listItem), fields, ...(domOnlyScope ? { domOnlyScope } : {}) };
}

// Self-contained callback: ChromePage/Puppeteer serialize this function. The same
// implementation accepts Cheerio locally, keeping values and records identical.
function extractRecords(config, $, context) {
    // Author preparation and the ordinary record executor share this synchronous
    // callback. Website tasks cannot replace nodes between proof and reads.
    function discover(input, $, context) {
      const dom = !$;
      const root = dom ? context || document : null;
      const parent = node => dom ? node.parentElement : node.parent;
      const element = node => dom ? node?.nodeType === 1 : node?.type === 'tag';
      const tag = node => dom ? node.tagName.toLowerCase() : node.name;
      const attr = (node, name) => dom ? node.getAttribute(name) : node.attribs?.[name];
      const contains = (a, b) => { for (let p = parent(b); p; p = parent(p)) if (p === a) return true; return false; };
      const fail = (code, message, path = '') => { throw Object.assign(new Error(message), {code, path}); };
      const query = (selector, context) => {
        try { return dom ? Array.from((context || root).querySelectorAll(selector)) : (context ? $(context).find(selector) : $(selector)).toArray(); }
        catch (error) { fail('E_ITEMLOADER_SELECTOR', error.message, selector); }
      };
      const safe = value => /^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(value) && !/token|secret|session|highlight|listselector/i.test(value);
      const semantic = node => ['article', 'li', 'tr'].includes(tag(node)) || attr(node, 'role') === 'listitem' || attr(node, 'itemscope') !== undefined && attr(node, 'itemscope') !== null;
      const all = query('*');
      if (all.length > 20000) return {status:'rejected', diagnostics:[{code:'E_LIST_BUDGET',message:'Preparation supports at most 20,000 elements'}]};
      try {
        const excluded = query('script,style,noscript,template,iframe,object,embed,input,textarea,select,button,[hidden],[aria-hidden="true"],[contenteditable]:not([contenteditable="false"]),[data-ai-selector-ui]' + (input.excludedRegions.length ? ',' + input.excludedRegions.join(',') : ''));
        const blocked = node => excluded.some(root => root === node || contains(root, node));
        const matches = input.fields.map(entry => query(entry.field.selector));
        const missing = matches.flatMap((nodes, i) => nodes.length ? [] : [input.fields[i].key]);
        if (missing.length) return {status:'needsInput', missing:missing.map(key => 'a representative match for ' + key), diagnostics:[{code:'E_LIST_NO_MATCH',message:'Fields have no matching evidence: ' + missing.join(', '),fields:missing}]};
        const targets = [...new Set(matches.flat())];
        if (targets.some(blocked)) fail('E_LIST_EXCLUDED', 'Field evidence intersects an excluded or non-content region');
        if (matches.some((nodes,i) => nodes.some(node => {
          const read = input.fields[i].field.attr;
          const subtree = ['text','innerText','innerHTML','outerHTML'].includes(read) || read === null && !['img','video','audio'].includes(tag(node));
          return subtree && excluded.some(region => contains(node,region));
        }))) fail('E_LIST_EXCLUDED', 'Field reads include an excluded descendant');
        if (input.fields.some(entry => !entry.boundaries)) return {status:'needsInput',missing:['structural CSS fields or an explicit record configuration'],diagnostics:[{code:'E_LIST_CAPABILITY',message:'Automatic preparation supports one structural CSS branch per field; contextual, pseudo, sibling and namespace selectors require an explicit record configuration'}]};
        // These are AST compound boundaries in the ORIGINAL selectors, not class
        // names invented from one sample or a common string prefix. A boundary is
        // accepted only after full-field node ownership and local queries agree.
        const selectors = input.fields[0].boundaries.map(boundary => boundary.record).filter(selector => input.fields.every(entry => entry.boundaries.some(boundary => boundary.record === selector)));
        const candidates = [];
        for (const selector of selectors) {
          const rows = query(selector);
          if (rows.length > 500) fail('E_LIST_BUDGET', 'A possible record boundary exceeds 500 rows; cannot safely resolve other business groupings', selector);
          if (!rows.length || rows.some(blocked)) continue;
          if (rows.length === 1 && !semantic(rows[0])) continue;
          if (rows.some(a => rows.some(b => a !== b && contains(a, b)))) continue;
          const ownership = matches.map(nodes => rows.map(row => nodes.filter(node => contains(row, node))));
          if (matches.some((nodes, i) => ownership[i].reduce((n, group) => n + group.length, 0) !== nodes.length)) continue;
          if (rows.some((_, r) => !ownership.some(groups => groups[r].length))) continue;
          if (input.fields.some((entry, i) => entry.field.cardinality === 'one' && ownership[i].some(group => group.length > 1))) continue;
          const relative = input.fields.map(entry => entry.boundaries.find(boundary => boundary.record === selector).relative);
          if (!relative.every((local,i) => rows.every((row,r) => {
            const observed = query(local,row), wanted = ownership[i][r];
            return observed.length === wanted.length && observed.every((node,n) => node === wanted[n]);
          }))) continue;
          candidates.push({selector,rows,ownership,relative});
        }
        const ambiguous = (message, choices = []) => ({status:'needsInput', missing:['one intended record example or an explicit record selector'],diagnostics:[{code:'E_LIST_AMBIGUOUS',message,candidates:choices.map(candidate => ({selector:candidate.selector,records:candidate.rows.length}))}]});
        if (!candidates.length) return ambiguous('No record boundary covers all field nodes with the declared per-record cardinalities');
        const choices = candidates; // Semantic tags cannot resolve a business boundary.
        // Same ownership partitions are equivalent for extraction. Different ones
        // are business alternatives, not a score that can choose the first list.
        const partitions = choices.map(candidate => JSON.stringify(candidate.rows.map((_, r) => candidate.ownership.map(groups => groups[r].map(node => all.indexOf(node))))));
        if (new Set(partitions).size > 1) return ambiguous('Several record groupings satisfy the fields; specify which entity is a record', choices);
        for (const a of choices) for (const b of choices) if (a !== b && tag(a.rows[0]) === tag(b.rows[0]) && a.rows.some(node => b.rows.some(other => contains(node, other)))) return ambiguous('Nested record boundaries are indistinguishable in this sample; specify the product or nested entity', choices);
        if (choices.length > 1) return ambiguous('Several explicit selector boundaries describe the same sample; identify the intended record instead of choosing a future-page rule',choices);
        const chosen = choices[0];
        const collection = node => {
          for (let p = parent(node); element(p); p = parent(p)) if (['ul','ol','table'].includes(tag(p)) || attr(p,'role') === 'list') return p;
          return null;
        };
        if (new Set(chosen.rows.map(collection)).size > 1) return ambiguous('Field evidence spans independent list containers; identify the intended list or explicitly select their records', [chosen]);
        const itemConfig = {_listItem:chosen.selector};
        for (const [i,entry] of input.fields.entries()) {
          const field = entry.field, output = {selector:chosen.relative[i],cardinality:field.cardinality};
          if (field.attr !== null) {
            if (['text','innerHTML','outerHTML'].includes(field.attr)) output.read = field.attr;
            else { output.read = 'attr'; output.attr = field.attr; }
          }
          itemConfig[entry.key] = output;
        }
        const shape = node => tag(node)+(attr(node,'class') || '').split(/\s+/).filter(safe).slice(0,3).map(value=>'.'+value).join('');
        const rowShape = shape(chosen.rows[0]);
        if (chosen.rows.some(node => shape(node) !== rowShape)) return {status:'needsInput',missing:['a uniform row shape or an explicit record configuration'],diagnostics:[{code:'E_LIST_ROW_SHAPE',message:'Prepared browser rules require the same tag/class shape in every row; layout variants need an explicit configuration'}]};
        return {status:'ready',itemConfig,rowShape,recordCount:chosen.rows.length,diagnostics:[]};
      } catch (error) { return {status:'rejected',diagnostics:[{code:error.code || 'E_ITEMLOADER_SELECTOR',message:error.message,path:error.path || ''}]}; }
    }
    let prepared;
    if (config.preparation) {
        const input = config.preparation;
        prepared = discover(input, $, context);
        if (prepared.status !== 'ready') return prepared;
        config = {listSelector:null, itemSelector:prepared.itemConfig._listItem,
            fields:input.fields.map(({key,field}) => ({key,field:{...field,selector:prepared.itemConfig[key].selector}}))};
    }
    const complete = records => prepared ? {...prepared,records} : {records};
    const dom = !$;
    const root = dom ? context || document : context || $.root();
    const listMode = !!(config.listSelector || config.itemSelector);
    const fail = (code, path, message) => { const error = new Error(`${code} (${path}): ${message}`); error.code = code; error.path = path; throw error; };
    const css = (context, selector, path) => {
        try { return dom ? Array.from(context.querySelectorAll(selector)) : context.find(selector).toArray(); }
        catch (error) { fail('E_ITEMLOADER_SELECTOR', path, error.message); }
    };
    const xpathQuery = field => {
        if (!dom) fail('E_ITEMLOADER_CAPABILITY', field.path, 'XPath requires a DOM evaluate backend');
        if (listMode && field.selector.startsWith('/') && !field.selector.startsWith('//')) {
            fail('E_ITEMLOADER_XPATH_SCOPE', field.path, 'Absolute XPath is not allowed in list records; use .//');
        }
        return listMode && field.selector.startsWith('//') ? '.' + field.selector : field.selector;
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
        if ($ && config.domOnlyScope) fail('E_ITEMLOADER_CAPABILITY', config.domOnlyScope, 'This scope selector requires native DOM CSS semantics; HTML/Cheerio cannot safely emulate it');
        const containers = config.listSelector ? css(root, config.listSelector, '_listContainer') : [];
        const selectedItems = config.itemSelector ? css(root, config.itemSelector, '_listItem') : [];
        validate(config.fields);
        if (!listMode) return complete([item(root, config.fields)]);
        if (!config.listSelector) return complete(selectedItems.map(node => item(dom ? node : $(node), config.fields)));
        const seen = new Set(), selected = new Set(selectedItems);
        for (const container of containers) {
            const children = dom ? Array.from(container.children) : $(container).children().toArray();
            for (const child of children) {
                if (!config.itemSelector || selected.has(child)) seen.add(child);
            }
        }
        // Container iteration groups nested records incorrectly. Query order is
        // document order and identity membership preserves distinct equal rows.
        const records = css(root, '*', '_listContainer').filter(node => seen.has(node))
            .map(node => item(dom ? node : $(node), config.fields));
        return complete(records);
    } catch (error) {
        if (prepared) return {status:'rejected',diagnostics:[{code:error.code || 'E_ITEMLOADER_SELECTOR',path:error.path || '',message:error.message}]};
        return { error: { code: error.code || 'E_ITEMLOADER_SELECTOR', path: error.path || '', message: error.message } };
    }
}

module.exports = { fault, selectorParts, fieldRule, normalizeConfig, extractRecords };
