"""Exactly one child, independently supervised by the service owner."""
import fcntl
import os
import threading
import time
from urllib.parse import urljoin,urldefrag
from .dsl import canonical,compile_config,document,extract,query
from .errors import Fault
from .security import Downloader,target_url
from .storage import Store


def run_worker(directory,run_id,boot,expected_parent,stop,fixtures,preview_pages):
    def watchdog():
        while True:
            if os.getppid()!=expected_parent: os._exit(70)
            time.sleep(.2)
    threading.Thread(target=watchdog,daemon=True).start()
    store=Store(directory)
    started=time.monotonic()
    def check():
        if stop.is_set(): raise Fault('STOP_REQUESTED')
        if time.monotonic()-started>=1800: raise Fault('TIME_LIMIT')
        if os.getppid()!=expected_parent: raise Fault('OWNER_EXITED')
        with store.connect() as db: store.assert_boot(db,boot)
    outcome={'status':'FAILED','stopReason':'WORKER_ERROR','errors':[{'code':'WORKER_ERROR','message':'Worker failed'}]}
    with open(os.path.join(directory,'worker.lock'),'a+b') as lease:
        try:
            fcntl.flock(lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
            check()
            snap=__import__('json').loads(store.get(run_id)['snapshot'])
            cfg=snap['config']; compiled=compile_config(cfg)
            maximum=min(50,cfg.get('maxPages',50),preview_pages if snap['mode']=='preview' else 50)
            downloader=Downloader(snap['scope'],fixtures,check,cfg.get('timeoutMs',15000)/1000)
            url=cfg['url']; requested_urls=set(); visited_urls=set(); seen_records=set()
            for page_number in range(maximum):
                check()
                if url in requested_urls or url in visited_urls: raise Fault('PAGINATION_LOOP')
                requested_urls.add(url)
                html,final_url=downloader.html(url)
                check()
                target_url(final_url,snap['scope'])
                # A new alias may redirect to an already committed document.
                # Check its final URL before extracting or committing anything.
                if final_url in visited_urls: raise Fault('PAGINATION_LOOP')
                visited_urls.add(final_url)
                root=document(html)
                if cfg.get('waitForSelector') and not query(root,cfg['waitForSelector']):
                    raise Fault('STATIC_SELECTOR_MISSING','waitForSelector was absent from downloaded HTML; no JS browser is used')
                records=extract(root,compiled)
                if cfg.get('dedupeKey'):
                    unique=[]
                    for record in records:
                        key=canonical(record[cfg['dedupeKey']])
                        if key not in seen_records:
                            seen_records.add(key); unique.append(record)
                    records=unique
                remaining=2000-snap['recordsCount']
                limited=len(records)>remaining
                snap=store.commit_page(run_id,records[:remaining],boot)
                check()
                if limited: raise Fault('RECORD_LIMIT')
                links=query(root,cfg['nextPageSelector']) if cfg.get('nextPageSelector') else []
                links=[link for link in links if link.attrib.get('aria-disabled','').lower()!='true' and 'disabled' not in link.attrib and not {'disabled','is-disabled','ant-pagination-disabled'}.intersection(link.attrib.get('class','').split())]
                if not links:
                    reason='NO_NEXT_PAGE'; break
                if len(links)>1: raise Fault('PAGINATION_AMBIGUOUS','Next page selector matched multiple enabled elements')
                href=links[0].attrib.get('href')
                if not href: raise Fault('NOT_SUPPORTED','Static pagination requires an href; JS clicks are unsupported')
                bases=query(root,'base[href]')
                base_url=urljoin(final_url,bases[0].attrib['href']) if bases else final_url
                # A base fragment is legal but is not itself fetched. URL
                # credentials and a base outside the token scope stay denied.
                target_url(urldefrag(base_url)[0],snap['scope'])
                next_url=urljoin(base_url,href)
                target_url(next_url,snap['scope'])
                if next_url in requested_urls or next_url in visited_urls: raise Fault('PAGINATION_LOOP')
                if page_number+1==maximum:
                    reason='PREVIEW_LIMIT' if snap['mode']=='preview' else 'PAGE_LIMIT'; break
                if snap['recordsCount']>=2000: raise Fault('RECORD_LIMIT')
                url=next_url
            outcome={'status':'COMPLETED','stopReason':reason,'errors':[]}
        except Fault as error:
            normal_budget = error.code in ('TIME_LIMIT','RECORD_LIMIT')
            outcome={'status':'COMPLETED' if normal_budget else 'STOPPED' if error.code=='STOP_REQUESTED' else 'FAILED','stopReason':error.code,'errors':[] if normal_budget or error.code=='STOP_REQUESTED' else [error.public()]}
        except BaseException:
            # Never expose credential/config/HTML through tracebacks.
            pass
        finally:
            try: store.outcome(run_id,outcome,boot)
            except Exception: pass
