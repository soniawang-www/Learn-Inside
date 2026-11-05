# 语文（汉字小达人）接口流程测试：python3 backend/tests/chinese/api.py <math-data 目录> [http://127.0.0.1:8788]
import json,urllib.request,sys
B=sys.argv[2] if len(sys.argv)>2 else 'http://127.0.0.1:8788'
def call(path,body=None,tok=None,method=None):
    r=urllib.request.Request(B+path,data=json.dumps(body).encode() if body is not None else None,method=method or ('POST' if body is not None else 'GET'),headers={'content-type':'application/json',**({'authorization':'Bearer '+tok} if tok else {})})
    try: return json.loads(urllib.request.urlopen(r).read())
    except urllib.error.HTTPError as e: return {'_status':e.code, **json.loads(e.read() or b'{}')}
exam=json.load(open(sys.argv[1]+'/exams/hanzi/hanzi-2021-city.json'))
key={p['number']:p for p in exam['problems']}
ok=lambda c,m: print(('✓' if c else '✗'),m) or (c or sys.exit(1))
g=call('/api/auth/guest',{}); tok=g['token']; st=g['student']['id']
ex=call(f'/api/exams?student={st}&family=hanzi',tok=tok); ok(any(e['id']=='hanzi-2021-city' and e['problem_count']==150 for e in ex),f"语文试卷 {[(e['id'],e['problem_count']) for e in ex]}")
mx=call(f'/api/exams?student={st}&family=amc8',tok=tok); ok(all(not e['id'].startswith('hanzi') for e in mx),f"数学 AMC8 列表不含语文（{len(mx)} 套）")
s=call('/api/sessions',{'exam_id':'hanzi-2021-city','student_id':st,'mode':'exam'},tok)
P=s['problems']; ok(len(P)==150 and 'answer' not in P[0],'开考：150 题，题目不带答案')
ok(s['exam']['sections'] and len(s['exam']['sections'])==9 and P[140]['input_hint'],'大题划分和填空输入提示下发')
ok(call(f"/api/sessions/{s['session']['id']}/check",{'problem_id':P[0]['id'],'answer':'A'},tok).get('_status')==403,'模考中不能查答案')
ans={}
for p in P:
    k=key[p['number']]; a=k['answer']
    if p['number']==141: a='不须迎向东郊去，春在千门万户中。'   # 带标点也算对
    ans[p['id']]=a
r=call(f"/api/sessions/{s['session']['id']}/submit",{'answers':ans,'times':{}},tok)
ok(sum(1 for x in r['items'] if x['correct'])==150,f"按标准答案作答：{sum(1 for x in r['items'] if x['correct'])}/150")
ok(all(x.get('basic') for x in r['items']) and r['items'][0]['section']==1,'复盘带解析和大题号')
ok(call(f'/api/students/{st}/mistakes?subject=chinese',tok=tok).get('_status')==403,'游客不能用错题本')
pf=call(f'/api/students/{st}/profile?subject=chinese',tok=tok); ok(len(pf['sessions'])==1,'语文成绩记录 1 条')
pm=call(f'/api/students/{st}/profile',tok=tok); ok(len(pm['sessions'])==0,'数学成绩记录里没有语文')
# 注册用户：故意做错 5 题
import random
u=call('/api/auth/register',{'phone':'139%08d'%random.randint(0,99999999),'password':'abc12345','nickname':'测试'}); tok=u['token']; st=u['student']['id']
s=call('/api/sessions',{'exam_id':'hanzi-2021-city','student_id':st,'mode':'exam'},tok); P=s['problems']
wrongs={1,31,95,121,150}; ans={}
for p in P:
    k=key[p['number']]
    ans[p['id']]=('错字' if k['kind']=='fill' else [c for c in k['choices'] if c!=k['answer']][0]) if p['number'] in wrongs else k['answer']
r=call(f"/api/sessions/{s['session']['id']}/submit",{'answers':ans},tok); ok(r['session']['score']==145,f"做错 5 题得 {r['session']['score']} 分")
mk=call(f'/api/students/{st}/mistakes?subject=chinese',tok=tok)['mistakes']; ok(sorted(m['number'] for m in mk)==sorted(wrongs) and all(m.get('stem') and m.get('section_name') for m in mk),f"错题本 {sorted(m['number'] for m in mk)}，带题目和大题名")
mm=call(f'/api/students/{st}/profile',tok=tok); ok(not mm['mistakes'],'数学错题本里没有语文')
d=call('/api/sessions',{'student_id':st,'problem_ids':[m['problem_id'] for m in mk],'purpose':'pending'},tok); ok(d['session']['mode']=='practice' and len(d['problems'])==5,'错题重做：练习会话 5 题')
c1=call(f"/api/sessions/{d['session']['id']}/check",{'problem_id':d['problems'][0]['id'],'answer':key[d['problems'][0]['number']]['answer']},tok)
ok(c1['correct'] is True and c1['basic'],'练习：答对即时判对并给解析')
c2=call(f"/api/sessions/{d['session']['id']}/check",{'problem_id':d['problems'][1]['id'],'answer':'X'},tok); ok(c2['correct'] is False and c2['answer'],'练习：答错给正确答案')
print('全部通过')
