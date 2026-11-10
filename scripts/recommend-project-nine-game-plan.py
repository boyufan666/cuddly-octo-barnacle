#!/usr/bin/env python3
import urllib.request,urllib.error,http.cookiejar,json,pathlib,os
import sys,argparse,stat,hashlib,re
from urllib.parse import urlparse
parser=argparse.ArgumentParser(description="Explicitly recommend nine verified games for a dedicated fictional project patient; default read-only; no sessions or results")
for flag in ["credentials","doctor-credentials","patient-id","catalog","backup-evidence","consent-version","evidence-dir","base-url"]:parser.add_argument("--"+flag,required=True)
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


q=pathlib.Path(args.doctor_credentials);assert q.is_file() and not q.is_symlink() and stat.S_IMODE(q.stat().st_mode)==0o600
cred=json.loads(q.read_text())['doctor'];assert args.patient_id==d['patient']['profileId'],'dedicated patient mismatch'
catalog=json.loads(pathlib.Path(args.catalog).read_text());assert len(catalog['games'])==9
codes=[x['create']['code'] for x in catalog['games']];assert len(set(codes))==9
for source in catalog['provenance']:
 assert hashlib.sha256(pathlib.Path(source['path']).read_bytes()).hexdigest()==source['sha256'],'source drift'
out=pathlib.Path(args.evidence_dir);out.mkdir(parents=True,exist_ok=True)
r={'mode':'apply' if args.apply else 'dry-run','patientId':args.patient_id,'codes':codes,'events':events,'startedSessions':0,'submittedResults':0}
def save():(out/('nine-game-plan-recommendation.json' if args.apply else 'nine-game-plan-dry-run.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2))
c=Client();c.token();c.req('/auth/login',{'account':cred['account'],'password':cred['password']},expected=201)
patient=c.req('/patients/'+args.patient_id);assert patient['id']==args.patient_id
records=c.req('/patients/'+args.patient_id+'/training-records');assert not any(x['sessionStatus'] in ['started','in_progress'] for x in records['sessions']),'active training session must be resolved before replacing plan'
risk=[{'id':x['id'],'riskLevel':x['riskLevel'],'isCurrent':x['isCurrent'],'confirmedById':x.get('confirmedById')} for x in patient['riskGrades']];r['riskBefore']=risk
current=[x for x in risk if x['isCurrent']];assert len(current)==1 and current[0]['riskLevel']=='high','expected existing high risk'
# Administrator read access verifies actual published catalog; never changes content.
a=Client();a.token();a.req('/auth/login',{'account':d['administrator']['account'],'password':d['administrator']['password']},expected=201);games=a.req('/admin/game-contents');ids=[]
for entry in catalog['games']:
 source=entry['create'];matches=[g for g in games if g['code']==source['code']];assert len(matches)==1;g=matches[0]
 for field in ['runtimeType','gameVersion','supportedInputModes','requiredMetrics','resultSchema']:assert g[field]==source[field],'game contract drift'
 assert all(g[k]==v for k,v in {'status':'active','buildStatus':'released','releaseChannel':'production','publishedStatus':'published'}.items())
 ids.append(g['id'])
r['gameContentIds']=ids
# Reuse only an exact existing nine-item plan; do not produce duplicate drafts.
matching=[p for p in patient['rehabPlans'] if p['status'] in ['pending_confirm','active'] and [i['gameContentId'] for i in p['items']]==ids]
assert len(matching)<=1
r['existingExactPlanId']=matching[0]['id'] if matching else None
if args.apply:
 backup=pathlib.Path(args.backup_evidence).read_text().split();assert len(backup)==2 and re.fullmatch(r'[0-9a-f]{64}',backup[0]) and backup[1].startswith('/opt/rehab/shared/backups/') and backup[1].endswith('.dump');r.update(backupSha256=backup[0],backupPath=backup[1])
 if matching:plan=matching[0];r['recommendation']='existing-exact-no-write'
 else:
  assert not any(p['status']=='pending_confirm' for p in patient['rehabPlans']),'another pending draft requires explicit decision'
  plan=c.req('/rehab-plans/recommend',{'patientId':args.patient_id,'gameContentIds':ids},expected=201);r['recommendation']='created'
 assert plan['patientId']==args.patient_id and [i['gameContentId'] for i in plan['items']]==ids
 assert len(plan['items'])==9 and plan['status'] in ['pending_confirm','active'];r['planId']=plan['id'];r['planStatus']=plan['status'];save()
 audits=a.req('/admin/audit-logs?targetId='+plan['id']+'&take=20');assert any(x['action']=='rehab_plan.recommend' for x in audits);r['auditActions']=[x['action'] for x in audits]
 # Reuse existing normal confirm/consent/batch CLI with explicit plan id.
 import subprocess
 command=[sys.executable,str(pathlib.Path(__file__).with_name('prepare-project-patient-plan.py')),'--credentials',args.credentials,'--doctor-credentials',args.doctor_credentials,'--patient-id',args.patient_id,'--plan-id',plan['id'],'--consent-version',args.consent_version,'--evidence-dir',args.evidence_dir,'--base-url',args.base_url,'--apply']
 subprocess.run(command,check=True)
 prepared=json.loads((out/'technical-plan-preparation.json').read_text());assert prepared['planId']==plan['id'] and len(prepared['batches'])==9 and all(x['status']=='ready' for x in prepared['batches']);r['batches']=prepared['batches']
 after=c.req('/patients/'+args.patient_id);r['riskAfter']=[{'id':x['id'],'riskLevel':x['riskLevel'],'isCurrent':x['isCurrent'],'confirmedById':x.get('confirmedById')} for x in after['riskGrades']];assert r['riskBefore']==r['riskAfter']
save();print(json.dumps({'mode':r['mode'],'gameCount':len(ids),'planId':r.get('planId'),'readyBatches':len(r.get('batches',[]))}))
