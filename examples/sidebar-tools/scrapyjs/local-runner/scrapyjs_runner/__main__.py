import argparse
import os
import sys
from pathlib import Path


def main():
    parser=argparse.ArgumentParser(description='Manually started loopback Scrapling runner')
    parser.add_argument('--port',type=int,default=43231)
    parser.add_argument('--data-dir',type=Path,required=True)
    parser.add_argument('--credential-file',type=Path,required=True)
    parser.add_argument('--init-credential',action='store_true',help='Atomically create a private credential JSON if missing, validate if existing, then start')
    parser.add_argument('--extension-origin',action='append',required=True)
    parser.add_argument('--fixture-origin',action='append',default=[])
    args=parser.parse_args()
    if not 1024<=args.port<=65535: parser.error('port must be 1024..65535')
    os.umask(0o077)
    from .errors import Fault
    try:
        from .security import extension_origin,scope_origin,load_credential,init_credential,target_url
        from .manager import Manager
        from .service import create_app
        for value in args.extension_origin: extension_origin(value)
        for value in args.fixture_origin:
            scope_origin(value)
            if target_url(value).hostname not in ('127.0.0.1','::1'):
                raise Fault('FIXTURE_ORIGIN','Fixture exception must be an explicit loopback origin')
        if args.init_credential: init_credential(args.credential_file,args.port)
        master=load_credential(args.credential_file,args.port)
        manager=Manager(args.data_dir.absolute(),args.fixture_origin)
        app=create_app(manager,master,args.extension_origin,args.port)
        import uvicorn
        try:
            uvicorn.run(app,host='127.0.0.1',port=args.port,workers=1,access_log=False,log_level='critical',proxy_headers=False,server_header=False,timeout_keep_alive=5,limit_concurrency=32,limit_max_requests=None,h11_max_incomplete_event_size=16384)
        finally:
            if not manager.closing: manager.close()
    except Fault as error:
        print('local-runner: '+error.code+' — '+error.message,file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':
    sys.exit(main())
