"""A bounded inert outline of one anonymously downloaded static document."""
from datetime import datetime, timezone
import hashlib
from html import escape
import json
import re
from urllib.parse import urljoin, urlsplit
from .dsl import canonical, document
from .errors import Fault


def compile_structure_config(config):
    if not isinstance(config,dict) or set(config)!={'url','inputHash','maxPages','previewPages'}:
        raise Fault('INVALID_CONFIG','Structure requires url, inputHash and the current page budgets')
    if len(canonical(config).encode())>8192 or not isinstance(config['url'],str):
        raise Fault('INVALID_CONFIG')
    if not isinstance(config['inputHash'],str) or not re.fullmatch(r'sha256:[a-f0-9]{64}',config['inputHash']):
        raise Fault('INVALID_CONFIG','Structure must be bound to the current inputs')
    for name,high in [('maxPages',50),('previewPages',3)]:
        if type(config[name]) is not int or not 1<=config[name]<=high:
            raise Fault('INVALID_CONFIG','Invalid page budget')
    return {'fields':dict.fromkeys(['format','url','inputHash','sourceHash','fetchedAt','sample','truncated'])}


def structure_record(html, final_url, input_hash, check):
    root=document(html)._root
    dropped={'script','style','noscript','template','form','input','textarea','select','button',
             'iframe','object','embed','svg','canvas','head'}
    attrs={'id','class','href','src','title','alt','role','aria-label','aria-disabled','rel','data-id',
           'data-price','data-value','data-title','data-author','data-name','data-url','data-href','data-src',
           'itemprop','itemscope','itemtype'}
    void={'area','base','br','col','hr','img','link','meta','param','source','track','wbr'}
    parts=[]; used=0; json_used=0; nodes=0; truncated=False; useful=False
    def cost(text):
        return len(text.encode()),len(json.dumps(text,ensure_ascii=False).encode())-2
    def emit(text, reserve):
        nonlocal used,json_used
        a,b=cost(text)
        if used+a+reserve[0]>8000 or json_used+b+reserve[1]>9000: return False
        used+=a; json_used+=b; parts.append(text); return True
    def text(value,reserve):
        nonlocal truncated,useful
        value=' '.join((value or '').split())
        if not value: return
        if len(value)>160: value=value[:160]; truncated=True
        if emit(escape(value),reserve): useful=True
        else: truncated=True
    def walk(node,depth,reserve):
        nonlocal nodes,truncated,useful
        check()
        tag=node.tag
        if not isinstance(tag,str) or tag.lower() in dropped: return
        tag=tag.lower()
        if not re.fullmatch(r'[a-z][a-z0-9-]{0,31}',tag): return
        if nodes>=400 or depth>16: truncated=True; return
        nodes+=1; values=[]; has_url=False
        for name,value in node.attrib.items():
            if name not in attrs or not value: continue
            if name in ('href','src','data-url','data-href','data-src'):
                try:
                    parsed=urlsplit(urljoin(final_url,value))
                    if parsed.scheme not in ('http','https') or parsed.username is not None or parsed.password is not None:
                        continue
                except ValueError: continue
                # Do not return a different, truncated URL as a real attribute.
                if len(value)>512: truncated=True; continue
                has_url=True
            elif len(value)>256: value=value[:256]; truncated=True
            values.append(' '+name+'="'+escape(value,quote=True)+'"')
        closing='' if tag in void else '</'+tag+'>'
        close_cost=cost(closing)
        child_reserve=(reserve[0]+close_cost[0],reserve[1]+close_cost[1])
        if not emit('<'+tag+''.join(values)+'>',child_reserve): truncated=True; return
        if has_url: useful=True
        if tag not in void:
            text(node.text,child_reserve)
            for child in node:
                if nodes>=400: truncated=True; break
                walk(child,depth+1,child_reserve)
                text(child.tail,child_reserve)
            emit(closing,reserve)
    walk(root,0,(0,0))
    sample=''.join(parts)
    if not useful: raise Fault('STRUCTURE_EMPTY','No usable public static structure was found')
    return {'format':'scrapyjs.static-structure.v1','url':final_url,'inputHash':input_hash,
            'sourceHash':'sha256:'+hashlib.sha256(html).hexdigest(),
            'fetchedAt':datetime.now(timezone.utc).isoformat(),'sample':sample,'truncated':truncated}
