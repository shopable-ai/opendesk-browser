"""The supported static subset of the original ItemLoader DSL."""
import hashlib
import json
import re
from functools import lru_cache
from cssselect import HTMLTranslator, SelectorError
from scrapling import Selector
from .errors import Fault


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def config_hash(value):
    return 'sha256:' + hashlib.sha256(canonical(value).encode()).hexdigest()


def css(selector):
    if not isinstance(selector, str) or not selector.strip() or len(selector) > 1024:
        raise Fault('INVALID_CONFIG', 'A nonempty CSS selector of at most 1024 characters is required')
    selector = selector.strip()
    if selector == '.': return selector
    if re.match(r'^(?:\.?/|\.\.?(?:/|$)|[a-z-]+::)', selector):
        raise Fault('NOT_SUPPORTED', 'XPath is not supported by local-runner')
    try:
        Selector('<html></html>', adaptive=False).css(selector)
    except Exception:
        raise Fault('INVALID_SELECTOR', 'Invalid CSS selector') from None
    return selector


def suffix(value):
    quote, depth, split = '', 0, -1
    i = 0
    while i < len(value):
        char = value[i]
        if char == '\\':
            i += 2
            continue
        if quote:
            if char == quote: quote = ''
        elif char in ('"', "'"): quote = char
        elif char in '[(': depth += 1
        elif char in '])': depth -= 1
        elif depth == 0 and value[i:i+2] == '::':
            split = i
            i += 1
        i += 1
    if split < 0: return value.strip(), None
    query, attr = value[:split].strip(), value[split+2:].strip()
    if not re.fullmatch(r'[\w-]+', attr, re.ASCII):
        raise Fault('INVALID_SELECTOR', 'Invalid terminal read suffix')
    return query, attr


def rule(value):
    if isinstance(value, str):
        # Detect XPath before interpreting terminal read metadata.
        if re.match(r'^(?:\.?/|\.\.(?:/|$)|(?:ancestor|ancestor-or-self|attribute|child|descendant|descendant-or-self|following|following-sibling|namespace|parent|preceding|preceding-sibling|self)::)', value.strip()):
            raise Fault('NOT_SUPPORTED', 'XPath is not supported')
        selector, attr = suffix(value)
        cardinality = 'auto'
    elif isinstance(value, dict) and 'selector' in value:
        if set(value) - {'selector', 'read', 'attr', 'cardinality'}:
            raise Fault('NOT_SUPPORTED', 'Unknown field descriptor property')
        selector, read = value['selector'], value.get('read')
        if read not in (None, 'text', 'attr'):
            raise Fault('NOT_SUPPORTED', 'Only text and attr reads are supported')
        attr = value.get('attr') if read == 'attr' else read
        if read == 'attr' and (not isinstance(attr, str) or not re.fullmatch(r'[\w:-]+', attr, re.ASCII)):
            raise Fault('INVALID_CONFIG', 'Attribute read requires a valid attr')
        if read != 'attr' and 'attr' in value:
            raise Fault('INVALID_CONFIG', 'attr requires read:attr')
        cardinality = value.get('cardinality', 'auto')
    else:
        raise Fault('INVALID_CONFIG', 'Expected field selector or descriptor')
    if attr in ('innerHTML', 'outerHTML'):
        raise Fault('NOT_SUPPORTED', 'HTML reads are not supported')
    if cardinality not in ('auto', 'one', 'many'):
        raise Fault('INVALID_CONFIG', 'Unknown cardinality')
    return {'selector': css(selector), 'attr': attr, 'cardinality': cardinality}


def compile_config(config):
    if not isinstance(config, dict) or len(canonical(config).encode()) > 8192:
        raise Fault('INVALID_CONFIG', 'Config must be an object of at most 8192 bytes')
    allowed = {'url','itemConfig','nextPageSelector','maxPages','dedupeKey','timeoutMs','waitForSelector'}
    if set(config) - allowed:
        raise Fault('NOT_SUPPORTED', 'Unsupported configuration: ' + ', '.join(sorted(set(config)-allowed)))
    if not isinstance(config.get('url'), str): raise Fault('INVALID_CONFIG', 'url is required')
    item = config.get('itemConfig')
    if not isinstance(item, dict) or len(canonical(item).encode()) > 4096:
        raise Fault('INVALID_CONFIG', 'itemConfig must be an object of at most 4096 bytes')
    def walk(obj, depth=0):
        if not obj or depth > 12: raise Fault('INVALID_CONFIG', 'Empty or deeply nested itemConfig')
        fields = {}
        for key, value in obj.items():
            if key in ('__proto__', 'constructor', 'prototype') or not key or len(key)>128:
                raise Fault('INVALID_CONFIG', 'Invalid field name')
            if depth == 0 and key in ('_listContainer','_listItem'): continue
            fields[key] = walk(value, depth+1) if isinstance(value,dict) and not isinstance(value.get('selector'),str) else rule(value)
        if not fields: raise Fault('INVALID_CONFIG', 'At least one field is required')
        return fields
    fields = walk(item)
    for name in ('_listContainer','_listItem'):
        if name in item: css(item[name])
    if '_listItem' in item and '_listContainer' not in item:
        raise Fault('INVALID_CONFIG', '_listItem requires _listContainer')
    for name, default, high in [('maxPages', 50, 50), ('timeoutMs', 15000, 60000)]:
        value = config.get(name, default)
        if type(value) is not int or not 1 <= value <= high:
            raise Fault('INVALID_CONFIG', name + ' is out of bounds')
    for name in ('waitForSelector','nextPageSelector'):
        if name in config: css(config[name])
    if 'dedupeKey' in config and (not isinstance(config['dedupeKey'],str) or config['dedupeKey'] not in fields or config['dedupeKey'].startswith('_')):
        raise Fault('INVALID_CONFIG', 'dedupeKey must name an existing field')
    return {'fields': fields, 'container': item.get('_listContainer'), 'item': item.get('_listItem')}


class Document(Selector):
    """Document scope is distinct from an Element that happens to be html."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._query_cache = {}


class _ScopeTranslator(HTMLTranslator):
    def __init__(self):
        super().__init__()
        self.scoped = False

    def xpath_scope_pseudo(self, xpath):
        self.scoped = True
        xpath.add_name_test()
        return xpath.add_condition('count(. | $runner_scope) = 1')


@lru_cache(maxsize=256)
def _scope_expression(selector):
    translator = _ScopeTranslator()
    try:
        expression = translator.css_to_xpath(selector)
    except SelectorError:
        # Keep Scrapling's own extensions on its normal CSS path.
        return None
    return expression if translator.scoped else None


def document(html):
    # Disable adaptive selection/storage and huge trees. No fallback selectors.
    return Document(html, adaptive=False, huge_tree=False, keep_comments=False)


def query(context, selector, *, root=None):
    if selector == '.': return [context]
    if root is None:
        root = context if isinstance(context,Document) else Document(
            root=context._root.getroottree().getroot(), adaptive=False)
    expression = _scope_expression(selector)
    if expression:
        # Bind :scope to this context without mutating page attributes. The
        # full document still supplies ancestor/sibling matching semantics.
        matches = root.xpath(expression, runner_scope=context._root)
    else:
        if selector not in root._query_cache:
            matches = root.css(selector)
            root._query_cache[selector] = (matches, {node._root:node for node in matches})
        matches, matched = root._query_cache[selector]
    if isinstance(context,Document): return list(matches)
    if expression: matched = {node._root:node for node in matches}
    # Iterate real descendants in document order, so no CSS combinator can
    # escape the row. Cached document matches avoid rescanning every row.
    return [matched[node] for node in context._root.iterdescendants() if node in matched]


def text(node):
    # lxml is Scrapling's actual parsed tree; itertext matches DOM textContent
    # including descendants, without introducing artificial line separators.
    return ''.join(node._root.itertext()).strip()


def extract(html, compiled):
    root = document(html) if isinstance(html, (str,bytes)) else html
    if not isinstance(root,Document):
        root = Document(root=root._root, adaptive=False)
    def row(context, fields):
        result = {}
        for name, spec in fields.items():
            if not ('selector' in spec and isinstance(spec['selector'],str)):
                result[name] = row(context, spec)
                continue
            nodes = query(context,spec['selector'],root=root)
            if spec['cardinality']=='one' and len(nodes)>1:
                raise Fault('CARDINALITY','Expected at most one match for '+name)
            values = []
            for node in nodes:
                attr = spec['attr']
                if attr in ('text','innerText'): value = text(node)
                elif attr: value = node.attrib.get(attr,'')
                elif node.tag == 'a': value = text(node) or node.attrib.get('href','')
                elif node.tag in ('img','audio','video'): value = node.attrib.get('src','')
                else: value = text(node)
                values.append(str(value))
            result[name] = values if spec['cardinality']=='many' or len(values)>1 else values[0] if values else ''
        return result
    if not compiled['container']: return [row(root,compiled['fields'])]
    matched = {node._root for node in query(root,compiled['item'])} if compiled['item'] else None
    seen, records = set(), []
    for container in query(root,compiled['container']):
        for node in container.children:
            if node._root in seen or (matched is not None and node._root not in matched): continue
            seen.add(node._root)
            records.append(row(node,compiled['fields']))
    return records


def nonempty(value):
    if isinstance(value,dict): return any(nonempty(x) for x in value.values())
    if isinstance(value,list): return any(nonempty(x) for x in value)
    return value is not None and value != ''
