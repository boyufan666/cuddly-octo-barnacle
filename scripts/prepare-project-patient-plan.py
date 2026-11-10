#!/usr/bin/env python3
import urllib.request,urllib.error,http.cookiejar,json,pathlib,os
import sys,argparse,stat,hashlib,re
from urllib.parse import urlparse
parser=argparse.ArgumentParser(description="Confirm only explicitly selected fictional project patient plan and prepare batches; never start sessions or submit results")
for flag in ["credentials","doctor-credentials","patient-id","plan-id","consent-version","evidence-dir","base-url"]:parser.add_argument("--"+flag,required=True)
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
out=pathlib.Path(args.evidence_dir);out.mkdir(parents=True,exist_ok=True)
r={'mode':'apply' if args.apply else 'dry-run','patientId':args.patient_id,'planId':args.plan_id,'consents':[],'batches':[],'events':events,'startedSessions':0,'submittedResults':0}
def save():(out/('technical-plan-preparation.json' if args.apply else 'technical-plan-preparation-dry-run.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2))
c=Client();c.token();c.req('/auth/login',{'account':cred['account'],'password':cred['password']},expected=201)
patient=c.req('/patients/'+args.patient_id);plans=[x for x in patient['rehabPlans'] if x['id']==args.plan_id];assert len(plans)==1;plan=plans[0];assert plan['patientId']==args.patient_id
protocols=c.req('/collection-protocols');batches=c.req('/patients/'+args.patient_id+'/collection-batches');assert isinstance(batches,list)
r['existingBatchCount']=len(batches);r['existingMatchingBatches']=[{'id':x['id'],'status':x['status']} for x in batches if x['rehabPlanId']==args.plan_id];r['observedPlanStatus']=plan['status'];r['observedIsCurrent']=plan['isCurrent']
r['riskBefore']=[{'riskLevel':x['riskLevel'],'isCurrent':x['isCurrent']} for x in patient['riskGrades']];save()
required=set()
for item in plan['items']:
 game=item['gameContent'];ps=[p for p in protocols if p['gameContentId']==game['id'] and p['code']=='technical-'+game['code'] and p['status']=='active'];assert len(ps)==1
 required.update(ps[0]['requiredConsentTypes'])
if args.apply:
 pc=Client();pc.token();pc.req('/auth/login',{'account':d['patient']['account'],'password':d['patient']['password']},expected=201);me=pc.req('/me');assert me['user']['id']==patient['userId']
 for kind in sorted(required):
  old=[x for x in patient['consents'] if x['consentType']==kind and x['consentVersion']==args.consent_version and not x.get('revokedAt')]
  if old:r['consents'].append({'consentType':kind,'result':'existing','id':old[0]['id']});continue
  obj=pc.req('/consents',{'patientId':args.patient_id,'subjectUserId':patient['userId'],'consentType':kind,'consentVersion':args.consent_version,'evidenceSnapshot':{'source':'project_operator_authorization','purpose':'dedicated fictional account technical acceptance','applicationConsentOnly':True,'operatingSystemCameraOpened':False}},expected=201);r['consents'].append({'consentType':kind,'id':obj['id'],'result':'created'});save()
 if plan['status']=='pending_confirm' and not plan['isCurrent']:
  plan=c.req('/rehab-plans/'+args.plan_id+'/confirm',{'dailyDuration':plan['dailyDuration'],'weekFrequency':plan['weekFrequency'],'adjustmentReason':'客户学习项目专用虚构患者技术流程确认，沿用现有参数与风险标签，不构成真实医疗处方。'},method='PATCH');r['confirmation']='confirmed';save()
 else:assert plan['status']=='active' and plan['isCurrent'];r['confirmation']='already-active-no-write'
 for item in plan['items']:
  ps=[p for p in protocols if p['gameContentId']==item['gameContentId'] and p['code']=='technical-'+item['gameContent']['code'] and p['status']=='active'];assert len(ps)==1;p=ps[0]
  old=[x for x in batches if x['rehabPlanId']==args.plan_id and x['planItemId']==item['id'] and x['protocolId']==p['id']]
  assert len(old)<=1
  if old:obj=old[0];result='existing-no-write'
  else:obj=c.req('/collection-batches',{'patientId':args.patient_id,'rehabPlanId':args.plan_id,'planItemId':item['id'],'gameContentId':item['gameContentId'],'protocolId':p['id'],'idempotencyKey':'technical-'+args.plan_id+'-'+item['id'],'operatorNotes':'专用虚构学习账号技术准备；未开启摄像头，未生成训练结果。'},expected=201);result='created'
  assert obj['status']=='ready';r['batches'].append({'id':obj['id'],'gameCode':item['gameContent']['code'],'status':obj['status'],'result':result});save()
 after=c.req('/patients/'+args.patient_id);r['riskAfter']=[{'riskLevel':x['riskLevel'],'isCurrent':x['isCurrent']} for x in after['riskGrades']];assert r['riskBefore']==r['riskAfter'];r['finalPlanStatus']='active';r['finalIsCurrent']=True
save();print(json.dumps({'mode':r['mode'],'confirmation':r.get('confirmation'),'batches':r['batches']}))
