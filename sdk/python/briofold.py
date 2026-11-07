"""Server-only merchant client. Operations are generated from OpenAPI."""
import json
import pathlib
import urllib.parse
import urllib.request
import urllib.error

OPERATIONS=json.loads((pathlib.Path(__file__).parent.parent/'operations.json').read_text())
class ApiError(Exception):
    def __init__(self,status,code,correlation_id=None):
        super().__init__(code);self.status=status;self.code=code;self.correlation_id=correlation_id
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, hdrs, newurl): return None
class Client:
    def __init__(self,origin,key,environment):
        u=urllib.parse.urlsplit(origin)
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.path not in ('','/') or u.query or u.fragment or environment not in ('sandbox','live'):
            raise ValueError('Configured HTTPS origin and environment required')
        self.origin=origin;self.key=key;self.environment=environment;self.http=urllib.request.build_opener(NoRedirect())
    def request(self,operation,*,path=None,query=None,body=None,idempotency_key=None,raw_body=None,filename=None):
        spec=OPERATIONS[operation];target=spec['path']
        for name,value in (path or {}).items(): target=target.replace('{'+name+'}',urllib.parse.quote(str(value),safe=''))
        if '{' in target: raise ValueError('Missing path parameter')
        q=dict(query or {})
        if 'environment' in q and q['environment']!=self.environment: raise ValueError('Environment cannot change')
        q['environment']=self.environment
        url=urllib.parse.urljoin(self.origin,target)+'?'+urllib.parse.urlencode(q)
        headers={'Content-Type':'application/octet-stream' if raw_body is not None else 'application/json'}
        if not spec['public']: headers['Authorization']='Bearer '+self.key
        if filename is not None:
            if any(c in filename for c in ('\r','\n','\x00')): raise ValueError('Invalid filename')
            headers['X-Filename']=urllib.parse.quote(filename,safe='')
            headers['X-Filename-Encoding']='uri-component'
        if idempotency_key:
            if any(c in idempotency_key for c in ('\r','\n')): raise ValueError('Invalid idempotency key')
            headers['Idempotency-Key']=idempotency_key
        data=raw_body if raw_body is not None else json.dumps(body).encode() if body is not None else None
        req=urllib.request.Request(url,data=data,headers=headers,method=spec['method'])
        try: response=self.http.open(req,timeout=15)
        except urllib.error.HTTPError as error:
            raw=error.read(16384)
            try: d=json.loads(raw).get('error',{});raise ApiError(error.code,d.get('code','REQUEST_FAILED'),d.get('correlation_id')) from None
            except (ValueError,TypeError): raise ApiError(error.code,'REQUEST_FAILED') from None
        except urllib.error.URLError: raise ApiError(None,'OUTCOME_UNCONFIRMED') from None
        with response:
            raw=response.read(2097153)
            if len(raw)>2097152: raise ApiError(response.status,'RESPONSE_TOO_LARGE')
            if 'application/json' not in response.headers.get('Content-Type',''): return raw
            return json.loads(raw)
