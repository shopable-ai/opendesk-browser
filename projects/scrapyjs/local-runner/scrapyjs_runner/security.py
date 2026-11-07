"""Loopback listener authentication and DNS-pinned, same-origin HTTP."""
import http.client
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import ssl
import stat
import threading
import time
from urllib.parse import urlsplit, urljoin
from urllib.robotparser import RobotFileParser
from .errors import Fault

UA = 'ScrapyJSLocalRunner'


def strict_json(raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result: raise ValueError('Duplicate JSON property')
            result[key] = value
        return result
    def invalid(_): raise ValueError('Nonfinite number')
    try:
        return json.loads(raw, object_pairs_hook=unique, parse_constant=invalid)
    except (ValueError, UnicodeError, RecursionError):
        raise Fault('INVALID_JSON', 'Invalid or ambiguous JSON', 400) from None


def load_credential(path, port):
    fd = None
    try:
        fd = os.open(Path(path), os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        meta = os.fstat(fd)
        if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.getuid() or meta.st_mode & 0o077 or not 1 <= meta.st_size <= 8192:
            raise ValueError()
        obj = strict_json(os.read(fd, 8193))
        if not isinstance(obj,dict) or set(obj) != {'format','secret','endpoint'}:
            raise ValueError()
        if obj['format'] != 'opendesk.local-task-credential.v1' or obj['endpoint'] != f'http://127.0.0.1:{port}':
            raise ValueError()
        secret = obj['secret']
        if not isinstance(secret,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32,128}',secret):
            raise ValueError()
        return secret
    except (OSError, ValueError, Fault, TypeError):
        raise Fault('CREDENTIAL_FILE', 'Credential must be owner-only JSON with the matching loopback endpoint', 503) from None
    finally:
        if fd is not None: os.close(fd)



def init_credential(path, port):
    """Explicit, no-clobber initialization. Never return or print a secret."""
    path = Path(path)
    parent = path.parent
    try:
        parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o777 != 0o700:
            raise Fault('CREDENTIAL_DIRECTORY','Credential directory must be owned by this user with mode 0700',503)
        if os.path.lexists(path):
            load_credential(path,port)
            return
        temporary = parent/('.credential-'+secrets.token_hex(12)+'.tmp')
        fd = os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        try:
            payload = {'format':'opendesk.local-task-credential.v1','secret':secrets.token_urlsafe(48),'endpoint':f'http://127.0.0.1:{port}'}
            with os.fdopen(fd,'w',encoding='utf-8') as file:
                json.dump(payload,file,separators=(',',':'))
                file.write('\n'); file.flush(); os.fsync(file.fileno())
            try:
                # link is atomic and refuses an existing destination. rename/
                # replace would silently destroy a concurrently created secret.
                os.link(temporary,path,follow_symlinks=False)
            except FileExistsError:
                load_credential(path,port)
        finally:
            temporary.unlink(missing_ok=True)
        load_credential(path,port)
    except Fault: raise
    except OSError:
        raise Fault('CREDENTIAL_INIT','Could not create private credential file',503) from None


def extension_origin(value):
    if not isinstance(value,str) or not re.fullmatch(r'chrome-extension://[a-p]{32}',value):
        raise Fault('EXTENSION_ORIGIN','Expected a configured Chrome extension origin',403)
    return value


def target_url(value, scope=None):
    try:
        if not isinstance(value,str) or len(value)>4096 or any(ord(c)<33 or ord(c)>126 for c in value) or '\\' in value:
            raise ValueError()
        part = urlsplit(value)
        if part.scheme not in ('http','https') or not part.hostname or part.username is not None or part.password is not None or part.fragment:
            raise ValueError()
        if '%' in part.netloc or part.hostname.endswith('.') or not part.port and part.netloc.endswith(':'):
            raise ValueError()
        # Reject alternative numeric hosts and ambiguous browser/HTTP URL forms.
        part.hostname.encode('idna')
        if scope is not None and origin(value) != scope:
            raise Fault('SCOPE_MISMATCH','config.url and every request must match token.scope',403)
        return part
    except (ValueError, UnicodeError):
        raise Fault('INVALID_URL','A plain HTTP(S) URL without credentials or fragment is required',422) from None


def origin(value):
    part = target_url(value)
    host = part.hostname.lower()
    if ':' in host: host = '['+host+']'
    default = 443 if part.scheme=='https' else 80
    port = part.port or default
    return f'{part.scheme}://{host}' + (f':{port}' if port != default else '')


def scope_origin(value):
    if origin(value) != value: raise Fault('INVALID_SCOPE','scope must be an exact canonical origin',422)
    return value


def pinned_addresses(url, fixtures):
    part = target_url(url)
    try:
        addresses = socket.getaddrinfo(part.hostname,part.port or (443 if part.scheme=='https' else 80),type=socket.SOCK_STREAM)
    except OSError:
        raise Fault('DNS_FAILED','Target DNS lookup failed') from None
    if not addresses: raise Fault('DNS_FAILED')
    for _,_,_,_,addr in addresses:
        ip = ipaddress.ip_address(addr[0])
        mapped = getattr(ip,'ipv4_mapped',None)
        if origin(url) not in fixtures and (not ip.is_global or ip.is_multicast or ip.is_reserved or ip.is_unspecified or mapped is not None and not mapped.is_global):
            raise Fault('PRIVATE_ADDRESS','Nonpublic target address denied',403)
    return addresses


class Sessions:
    def __init__(self, master, extensions):
        self.master = master
        self.extensions = frozenset(extensions)
        self.tokens = {}
        self.lock = threading.RLock()

    def master_auth(self, bearer):
        if not secrets.compare_digest(bearer.encode(), self.master.encode()):
            raise Fault('UNAUTHORIZED','Invalid master credential',401)

    def create(self, obj, request_origin):
        if not isinstance(obj,dict) or set(obj) != {'owner','origin','scope'}:
            raise Fault('INVALID_SESSION')
        owner = obj['owner']
        if not isinstance(owner,str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}',owner):
            raise Fault('INVALID_OWNER')
        ext = extension_origin(obj['origin'])
        if ext not in self.extensions or request_origin is not None and request_origin != ext:
            raise Fault('ORIGIN_DENIED',status=403)
        scope_origin(obj['scope'])
        with self.lock:
            now = int(time.time())
            self.tokens = {k:v for k,v in self.tokens.items() if v['expiresAt']>now}
            if len(self.tokens)>=256: raise Fault('SESSION_LIMIT',status=429)
            token = secrets.token_urlsafe(32)
            grant = {**obj,'expiresAt':now+900}
            self.tokens[token] = grant
            return {'token':token,'tokenType':'Bearer','expiresIn':900,**grant}

    def check(self, bearer, request_origin):
        with self.lock:
            grant = self.tokens.get(bearer)
            if not grant or grant['expiresAt']<=time.time():
                self.tokens.pop(bearer,None)
                raise Fault('UNAUTHORIZED','Session expired or invalid',401)
            if request_origin is not None and request_origin != grant['origin']:
                raise Fault('ORIGIN_DENIED',status=403)
            return dict(grant)

    def revoke(self, owner):
        with self.lock:
            self.tokens = {k:v for k,v in self.tokens.items() if v['owner']!=owner}


class Downloader:
    def __init__(self, scope, fixtures, check, timeout=15):
        self.scope, self.fixtures, self.check, self.timeout = scope,set(fixtures),check,min(timeout,30)
        self.context = ssl.create_default_context()
        self.robots = None

    def raw(self, url, limit=2*1024*1024):
        for hop in range(4):
            self.check()
            part = target_url(url,self.scope)
            addresses = pinned_addresses(url,self.fixtures)
            conn = http.client.HTTPConnection(part.hostname,part.port or (443 if part.scheme=='https' else 80),timeout=self.timeout)
            sock = None
            try:
                # Never give a hostname to connect after policy validation.
                for family,kind,proto,_,addr in addresses:
                    self.check()
                    try:
                        sock = socket.socket(family,kind,proto)
                        sock.settimeout(self.timeout)
                        sock.connect(addr)
                        break
                    except OSError:
                        if sock: sock.close()
                        sock = None
                if sock is None: raise Fault('CONNECT_FAILED','Could not connect to checked target')
                if part.scheme=='https': sock = self.context.wrap_socket(sock,server_hostname=part.hostname)
                conn.sock = sock
                path = part.path or '/'
                if part.query: path += '?'+part.query
                conn.request('GET',path,headers={'Host':part.netloc,'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,text/plain','Accept-Encoding':'identity','Connection':'close'})
                response = conn.getresponse()
                if response.status in (301,302,303,307,308):
                    location = response.getheader('Location')
                    if not location or hop==3: raise Fault('REDIRECT_LIMIT')
                    next_url = urljoin(url,location)
                    target_url(next_url,self.scope)
                    # Redirect destinations must independently obey robots, even
                    # though the source URL had already been allowed.
                    if self.robots is not None and not self.robots.can_fetch(UA,next_url):
                        raise Fault('ROBOTS_DENIED',status=403)
                    url = next_url
                    continue
                if response.getheader('Content-Encoding','identity').lower() not in ('','identity'):
                    raise Fault('ENCODING_NOT_SUPPORTED')
                length = response.getheader('Content-Length')
                if length is not None and (not length.isdigit() or int(length)>limit):
                    raise Fault('RESPONSE_TOO_LARGE')
                chunks, count = [],0
                while True:
                    self.check()
                    chunk = response.read1(min(65536,limit-count+1))
                    if not chunk: break
                    count += len(chunk)
                    if count>limit: raise Fault('RESPONSE_TOO_LARGE')
                    chunks.append(chunk)
                return response.status, b''.join(chunks), response.getheader('Content-Type',''),url
            except Fault: raise
            except (OSError, http.client.HTTPException, ValueError):
                raise Fault('DOWNLOAD_FAILED','Target request failed') from None
            finally:
                conn.close()
                if sock: sock.close()
        raise Fault('REDIRECT_LIMIT')

    def load_robots(self):
        status, body, _, _ = self.raw(self.scope+'/robots.txt',256*1024)
        parser = RobotFileParser()
        if status == 404: parser.parse([])
        elif 200 <= status < 300: parser.parse(body.decode('utf-8','replace').splitlines())
        else: raise Fault('ROBOTS_UNAVAILABLE','robots.txt did not permit crawling',403)
        self.robots = parser

    def html(self,url):
        if self.robots is None: self.load_robots()
        if not self.robots.can_fetch(UA,url): raise Fault('ROBOTS_DENIED',status=403)
        status, body, content_type, final_url = self.raw(url)
        if not 200 <= status < 300: raise Fault('HTTP_STATUS','Target did not return successful HTML')
        if content_type.split(';')[0].strip().lower() not in ('text/html','application/xhtml+xml'):
            raise Fault('CONTENT_TYPE','Only HTML responses are parsed')
        delay = self.robots.crawl_delay(UA)
        if delay:
            if delay > 60: raise Fault('ROBOTS_DELAY','robots crawl delay exceeds supported budget')
            until=time.monotonic()+delay
            while time.monotonic()<until:
                self.check()
                time.sleep(min(.05,until-time.monotonic()))
        # Scrapling/lxml detects the document/meta encoding from these bytes.
        return body,final_url
