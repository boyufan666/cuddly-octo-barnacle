#!/usr/bin/env python3
import urllib.request,urllib.error,http.cookiejar,json,pathlib,os
import sys,argparse,stat,hashlib,re
from urllib.parse import urlparse
parser=argparse.ArgumentParser(description="Register only verified existing product games through authenticated admin API; default read-only")
for flag in ["credentials","catalog","backup-evidence","evidence-dir","base-url"]:parser.add_argument("--"+flag,required=True)
parser.add_argument("--apply",action="store_true")
args=parser.parse_args()
base=args.base_url.rstrip("/");url=urlparse(base)
if url.scheme!="https" or not url.netloc or url.username or url.password or url.path or url.query or url.fragment:raise SystemExit("base-url must be exact HTTPS origin")
p=pathlib.Path(args.credentials)
if not p.is_file() or p.is_symlink() or stat.S_IMODE(p.stat().st_mode)!=0o600:raise SystemExit('credentials must be a regular non-symlink file with mode 0600')
d=json.loads(p.read_text());events=[]
class Client:
 def __init__(self):self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar));self.csrf=None
 def req(self,path,body=None,method=None,expected=200):
  headers={'Origin':base}
  if body is not None:headers.update({'Content-Type':'application/json','x-csrf-token':self.csrf or ''})
  req=urllib.request.Request(base+path,data=None if body is None else json.dumps(body).encode(),headers=headers,method=method)
  try:
   with self.opener.open(req,timeout=30) as r:status=r.status;content=r.read()
  except urllib.error.HTTPError as e:status=e.code;content=e.read()
  events.append({'path':path,'http':status})
  assert status==expected,f'{path}:HTTP{status}'
  return json.loads(content) if content else None
 def token(self):self.csrf=self.req('/auth/csrf')['csrfToken']
# Only explicit --apply writes. No seed, patient data, or protocol mutation.
catalog=json.loads(pathlib.Path(args.catalog).read_text());assert len(catalog['games'])==9
for source in catalog['provenance']:
 assert hashlib.sha256(pathlib.Path(source['path']).read_bytes()).hexdigest()==source['sha256'],'catalog source drift'
expected_codes={x['create']['code'] for x in catalog['games']};assert len(expected_codes)==9
out=pathlib.Path(args.evidence_dir);out.mkdir(parents=True,exist_ok=True)
report={'mode':'apply' if args.apply else 'dry-run','catalogProvenance':catalog['provenance'],'registered':[],'events':events}
c=Client();c.token();c.req('/auth/login',{'account':d['administrator']['account'],'password':d['administrator']['password']},expected=201)
existing=c.req('/admin/game-contents');assert isinstance(existing,list)
report['existingGameCount']=len(existing)
for entry in catalog['games']:
 g=entry['create'];matches=[x for x in existing if x['code']==g['code']]
 assert len(matches)<=1
 if matches:
  cur=matches[0];assert all(cur.get(k)==v for k,v in g.items()),'Existing code mismatch: '+g['code']
  if 'publish' in entry:assert all(cur.get(k)==v for k,v in entry['publish'].items()),'Existing Unity release mismatch'
  report['registered'].append({'code':g['code'],'id':cur['id'],'result':'already-identical-no-write'});continue
 if not args.apply:
  report['registered'].append({'code':g['code'],'result':'would-create','runtimeType':g['runtimeType'],'gameVersion':g['gameVersion']});continue
 backup=pathlib.Path(args.backup_evidence).read_text().strip().split();assert len(backup)==2 and re.fullmatch(r'[0-9a-f]{64}',backup[0]) and backup[1].startswith('/opt/rehab/shared/backups/') and backup[1].endswith('.dump');report['backupSha256']=backup[0];report['backupPath']=backup[1]
 created=c.req('/admin/game-contents',g,expected=201)
 report['registered'].append({'code':g['code'],'id':created['id'],'result':'created','runtimeType':g['runtimeType']})
 (out/'production-game-registration.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 if 'publish' in entry:
  created=c.req('/admin/game-contents/'+created['id']+'/unity-build',entry['publish'],method='PATCH');report['registered'][-1]['unityPublished']=True
 assert created['buildStatus']=='released' and created['releaseChannel']=='production' and created['status']=='active' and created['publishedStatus']=='published'
 logs=c.req('/admin/audit-logs?targetId='+created['id']+'&take=10');report['registered'][-1]['auditActions']=[x['action'] for x in logs]
 (out/'production-game-registration.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
final=c.req('/admin/game-contents');report['finalGameCount']=len(final);assert expected_codes.issubset({x['code'] for x in final}) if args.apply else True;
if args.apply:
 for x in final:
  if x['code'] in expected_codes:assert x['buildStatus']=='released' and x['releaseChannel']=='production' and x['status']=='active' and x['publishedStatus']=='published'
(out/('production-game-registration.json' if args.apply else 'production-game-registration-dry-run.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False))
