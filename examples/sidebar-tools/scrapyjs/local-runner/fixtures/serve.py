"""Bounded, loopback-only HTML fixture; never a production crawler service."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import time
from urllib.parse import urlsplit

parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=43233)
parser.add_argument('--pages',type=int,default=3)
parser.add_argument('--delay',type=float,default=.25)
args=parser.parse_args()
if not 1024<=args.port<=65535 or not 1<=args.pages<=50 or not 0<=args.delay<=2:
    parser.error('port 1024..65535, pages 1..50, delay 0..2 seconds')

class Fixture(BaseHTTPRequestHandler):
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/robots.txt':
            self.send_response(200);self.end_headers();self.wfile.write(b'User-agent: *\nAllow: /\n');return
        match=re.fullmatch(r'/page-(\d{1,2})\.html',path)
        page=int(match[1]) if match else 0
        if not 1<=page<=args.pages:self.send_error(404);return
        if page<=3:
            text=(Path(__file__).parent/f'page-{page}.html').read_text()
            text=re.sub(r'<a class="next".*?</a>','',text)
        else:
            text=f'<html lang="zh-CN"><meta charset="utf-8"><title>本地长任务 Fixture {page}</title><main><ul id="books"><li data-id="page-{page}"><h2>长任务第 {page} 页</h2><span class="price">{page}.00</span></li></ul></main></html>'
        if page<args.pages:
            text=text.replace('</main>',f'<a class="next" href="page-{page+1}.html">下一页</a></main>')
        time.sleep(args.delay)
        data=text.encode();self.send_response(200)
        self.send_header('Content-Type','text/html;charset=utf-8');self.send_header('Content-Length',str(len(data)))
        self.end_headers()
        try:self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError):pass
    def log_message(self,*_):pass

ThreadingHTTPServer(('127.0.0.1',args.port),Fixture).serve_forever()
