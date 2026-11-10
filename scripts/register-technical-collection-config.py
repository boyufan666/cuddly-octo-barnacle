#!/usr/bin/env python3
import urllib.request,urllib.error,http.cookiejar,json,pathlib,os
import sys,argparse,stat,hashlib,re
from urllib.parse import urlparse
parser=argparse.ArgumentParser(description="Register game-specific technical collection configuration; default read-only")
for flag in ["credentials","catalog","backup-evidence","evidence-dir","base-url","runtime-gates"]:parser.add_argument("--"+flag,required=True)
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

# Explicit operator-authorized project engineering scope, not clinical approval.
catalog=json.loads(pathlib.Path(args.catalog).read_text());gates=json.loads(pathlib.Path(args.runtime_gates).read_text())
for source in catalog['provenance']:
 assert hashlib.sha256(pathlib.Path(source['path']).read_bytes()).hexdigest()==source['sha256'],'catalog source drift'
assert len(catalog['games'])==9 and len({x['create']['code'] for x in catalog['games']})==9 and len(gates)==7
out=pathlib.Path(args.evidence_dir);out.mkdir(parents=True,exist_ok=True)
report={'mode':'apply' if args.apply else 'dry-run','scope':'customer learning project engineering configuration; no clinical approval; no enforced fictional-user isolation','conditions':[],'protocols':[],'events':events}
if args.apply:
 backup=pathlib.Path(args.backup_evidence).read_text().split();assert len(backup)==2 and re.fullmatch(r'[0-9a-f]{64}',backup[0]) and backup[1].startswith('/opt/rehab/shared/backups/') and backup[1].endswith('.dump');report.update(backupSha256=backup[0],backupPath=backup[1])
def save():
 (out/('technical-collection-registration.json' if args.apply else 'technical-collection-catalog.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
c=Client();c.token();c.req('/auth/login',{'account':d['administrator']['account'],'password':d['administrator']['password']},expected=201)
games=c.req('/admin/game-contents');conditions=c.req('/admin/collection-conditions');protocols=c.req('/collection-protocols')
for entry in catalog['games']:
 source=entry['create'];matches=[g for g in games if g['code']==source['code']];assert len(matches)==1;g=matches[0]
 assert g['buildStatus']=='released' and g['releaseChannel']=='production' and g['status']=='active' and g['publishedStatus']=='published'
 for field in ['runtimeType','gameVersion','supportedInputModes','requiredMetrics','resultSchema']:assert g[field]==source[field],field+' drift'
 if 'publish' in entry:assert g['bridgeProtocolVersion']==entry['publish']['bridgeProtocolVersion'],'bridge drift'
 quality=gates[g['code']] if g['runtimeType']=='browser_pose_canvas' else ({'minConfidence':0.8} if g['runtimeType']=='unity_webgl' else {'resultSchemaVersion':g['resultSchema']['schemaVersion'],'requireRuntimeEvidence':True})
 cond={'code':'technical-'+g['code'],'name':g['name']+'技术采集条件','description':'客户学习项目技术流程参数，不构成临床适应证、医疗处方或医师批准。适用范围不代表真实人群训练安全性。','environment':{'secureContext':True,'network':'online'},'deviceRequirements':{'camera':g['supportsCamera'],'microphone':g['supportsMicrophone'],'inputModes':g['supportedInputModes']},'taskParameters':{'source':'project_engineering_scope','gameCode':g['code'],'gameVersion':g['gameVersion']},'qualityRules':quality}
 old=[x for x in conditions if x['code']==cond['code']];assert len(old)<=1
 if old:assert old[0]['status']=='active' and all(old[0].get(k)==v for k,v in cond.items()),'condition collision';created=old[0];result='already-identical-no-write'
 elif args.apply:created=c.req('/admin/collection-conditions',cond,expected=201);result='created'
 else:created={'id':'pending-'+g['code']};result='would-create'
 report['conditions'].append({'payload':cond,'id':created['id'],'result':result});save()
 proto={'conditionId':created['id'],'gameContentId':g['id'],'code':'technical-'+g['code'],'name':g['name']+'技术采集协议','version':g['gameVersion'],'runtimeType':g['runtimeType'],'requiredConsentTypes':['privacy_policy','ai_processing']+(['camera_capture'] if g['supportsCamera'] else [])+(['microphone_capture'] if g['supportsMicrophone'] else []),'requiredInputModes':g['supportedInputModes'],'requiredMetrics':g['requiredMetrics'],'conditionRules':{'physicalConditions':['no_known_limitations','upper_limb_limited','wheelchair'],'riskLevels':['low','moderate','high'],'source':'project_engineering_scope'},'samplingConfig':{'source':'runtime_result_contract','resultSchemaVersion':g['resultSchema']['schemaVersion']},'qualityGate':quality}
 old=[x for x in protocols if x['code']==proto['code'] and x['version']==proto['version']];assert len(old)<=1
 if old:assert old[0]['status']=='active' and all(old[0].get(k)==v for k,v in proto.items()),'protocol collision';createdProto=old[0];result='already-identical-no-write'
 elif args.apply:createdProto=c.req('/admin/collection-protocols',proto,expected=201);result='created'
 else:createdProto={};result='would-create'
 audits=[]
 if args.apply:
  for obj in [created,createdProto]:audits.extend(x['action'] for x in c.req('/admin/audit-logs?targetId='+obj['id']+'&take=10'))
  assert 'collection_condition.create' in audits and 'collection_protocol.create' in audits
 report['protocols'].append({'payload':proto,'id':createdProto.get('id'),'result':result,'auditActions':audits});save()
print(json.dumps({'mode':report['mode'],'conditions':len(report['conditions']),'protocols':len(report['protocols']),'results':[x['result'] for x in report['protocols']]}))
