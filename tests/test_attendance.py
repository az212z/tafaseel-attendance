"""HTTP and database tests against disposable synthetic data; never production."""
import http.cookiejar, json, os, socket, sqlite3, subprocess, tempfile, time, unittest, urllib.error, urllib.request
from datetime import datetime, timedelta, timezone
from contextlib import closing
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def utc(seconds=0): return (datetime.now(timezone.utc)+timedelta(seconds=seconds)).strftime('%Y-%m-%d %H:%M:%S')
def iso(seconds=0): return (datetime.now(timezone.utc)+timedelta(seconds=seconds)).strftime('%Y-%m-%dT%H:%M:%SZ')

class AttendanceTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.tmp=tempfile.TemporaryDirectory(prefix='tafaseel-attendance-test-');cls.target=Path(cls.tmp.name)
  with socket.socket() as sock: sock.bind(('127.0.0.1',0)); cls.port=sock.getsockname()[1]
  cls.origin=f'http://127.0.0.1:{cls.port}'
  subprocess.run(['python3',str(ROOT/'scripts/prepare_preview.py'),'--target',str(cls.target),'--origin',cls.origin],check=True,capture_output=True)
  cls.database=cls.target/'demo.sqlite'
  with closing(sqlite3.connect(cls.database)) as source,closing(sqlite3.connect(cls.target/'baseline.sqlite')) as dest: source.backup(dest)
  cls.env=os.environ.copy();cls.env.update({'ATTENDANCE_CONFIG_PATH':str(cls.target/'attendance-config.php'),'ATTENDANCE_PRIVATE_DIR':str(ROOT/'server')})
  cls.log=(cls.target/'php.log').open('w')
  cls.server=subprocess.Popen(['php','-S',f'127.0.0.1:{cls.port}','-t',str(ROOT/'public'),str(ROOT/'scripts/router.php')],env=cls.env,stdout=cls.log,stderr=cls.log)
  for _ in range(100):
   try:
    with socket.create_connection(('127.0.0.1',cls.port),timeout=.1): break
   except OSError: time.sleep(.03)
  else: raise RuntimeError('PHP test server did not start')
 @classmethod
 def tearDownClass(cls):
  cls.server.terminate();cls.server.wait(timeout=5);cls.log.close();cls.tmp.cleanup()
 def setUp(self):
  with closing(sqlite3.connect(self.target/'baseline.sqlite')) as source,closing(sqlite3.connect(self.database)) as dest: source.backup(dest)
  self.cookies=http.cookiejar.CookieJar();self.browser=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
  self.csrf='';code,data=self.api('session');self.assertEqual(code,200);self.csrf=data['csrf']
 def sql(self,query,args=(),one=False):
  with closing(sqlite3.connect(self.database)) as db:
   db.row_factory=sqlite3.Row;rows=db.execute(query,args).fetchall();db.commit();return (dict(rows[0]) if rows else None) if one else [dict(r) for r in rows]
 def api(self,action,data=None,params=None,csrf=True,origin=None):
  from urllib.parse import urlencode
  url=self.origin+'/api/?'+urlencode({'action':action,**(params or {})})
  headers={'Content-Type':'application/json','Origin':origin or self.origin}
  if csrf: headers['X-CSRF-Token']=self.csrf
  req=urllib.request.Request(url,data=json.dumps(data).encode() if data is not None else None,headers=headers)
  try: response=self.browser.open(req,timeout=10)
  except urllib.error.HTTPError as e: response=e
  with closing(response): return response.code,json.loads(response.read())
 def login(self):
  status,data=self.api('demo_login',{});self.assertEqual(status,200,data);self.csrf=data['csrf']
 def active(self):
  s=self.sql('SELECT * FROM attendance_sessions ORDER BY starts_at LIMIT 1',one=True)
  self.sql("UPDATE attendance_sessions SET starts_at=?,ends_at=?,status='open' WHERE id=?",[utc(-600),utc(3600),s['id']])
  self.sql('UPDATE attendance_roster SET checked_in=NULL,checked_out=NULL,excused=0 WHERE session_id=?',[s['id']])
  return self.sql('SELECT * FROM attendance_sessions WHERE id=?',[s['id']],one=True)
 def pupil(self,s):
  return self.sql('SELECT r.student_id,g.reference FROM attendance_roster r JOIN registrations g ON g.id=r.registration_id WHERE r.session_id=? LIMIT 1',[s['id']],one=True)
 def check(self,s,p,mode='in',pin='24681357'):
  return self.api('check',{'token':s['token'],'reference':p['reference'],'pin':pin,'mode':mode})
 def worker(self):
  proc=subprocess.run(['php',str(ROOT/'server/cron.php')],env=self.env,capture_output=True,text=True,timeout=15)
  self.assertEqual(proc.returncode,0,proc.stderr);return json.loads(proc.stdout)
 def test_anonymous_access_and_public_qr_privacy(self):
  for action in ['overview','students','courses','messages','system']:
   self.assertEqual(self.api(action)[0],401,action)
  s=self.active();status,data=self.api('public_session',params={'token':s['token']});self.assertEqual(status,200)
  self.assertEqual(set(data['session']),{'id','title','starts_at','ends_at','status'})
  self.assertNotIn('students',data);self.assertNotIn('mobile',json.dumps(data))
 def test_csrf_and_origin_protection(self):
  self.assertEqual(self.api('demo_login',{},csrf=False)[0],403)
  self.assertEqual(self.api('session',origin='https://untrusted.example')[0],403)
  self.login();self.assertEqual(self.api('add_student',{'name':'اختبار'},csrf=False)[0],403)
 def test_shared_students_and_course_tables(self):
  self.login();g=self.sql('SELECT id,course_slug FROM cohorts LIMIT 1',one=True)
  self.sql('UPDATE courses SET title=? WHERE slug=?',['دورة اختبار مشتركة',g['course_slug']])
  status,data=self.api('courses');self.assertEqual(status,200);self.assertTrue(any(c['title']=='دورة اختبار مشتركة' for c in data['items']))
  status,data=self.api('add_student',{'name':'طالب اختبار مشترك','mobile':'٠٥١١١١١١١١','guardian':'ولي اختبار','guardian_mobile':'0522222222','consent':True,'cohort_id':g['id']})
  self.assertEqual(status,200,data);self.assertEqual(len(data['pin']),8)
  student=self.sql('SELECT * FROM students WHERE id=?',[data['id']],one=True)
  self.assertEqual(student['name'],'طالب اختبار مشترك');self.assertEqual(student['mobile'],'+966511111111')
  self.assertIsNotNone(self.sql('SELECT id FROM registrations WHERE student_id=?',[data['id']],one=True))
  profile=self.sql('SELECT * FROM attendance_students WHERE student_id=?',[data['id']],one=True)
  self.assertEqual(profile['guardian_mobile'],'+966522222222');self.assertNotEqual(profile['pin_hash'],data['pin'])
  self.assertEqual(self.api('add_student',{'name':'طالب اختبار مشترك','mobile':'0511111111'})[0],409)
 def test_session_roster_excludes_waitlist_and_cancelled(self):
  self.login();s=self.active();p=self.pupil(s)
  self.sql("UPDATE registrations SET status='waitlist' WHERE student_id=?",[p['student_id']])
  status,data=self.api('create_session',{'title':'حصة اختبار','cohort_id':s['cohort_id'],'starts_at':iso(7200),'ends_at':iso(10800)})
  self.assertEqual(status,200,data)
  roster=self.sql('SELECT * FROM attendance_roster WHERE session_id=?',[data['id']]);self.assertEqual(len(roster),5)
  self.assertTrue(all(r['student_id']!=p['student_id'] for r in roster))
  self.assertEqual(self.api('create_session',{'title':'متداخلة','cohort_id':s['cohort_id'],'starts_at':iso(7500),'ends_at':iso(11000)})[0],409)
  self.assertEqual(self.api('create_session',{'title':'موعد قديم','cohort_id':s['cohort_id'],'starts_at':iso(-7200),'ends_at':iso(-3600)})[0],422)
 def test_scan_idempotent_and_wrong_pin(self):
  s=self.active();p=self.pupil(s)
  self.assertEqual(self.check(s,p,pin='11111111')[0],401)
  status,first=self.check(s,p);self.assertEqual(status,200,first);self.assertFalse(first['already'])
  status,second=self.check(s,p);self.assertEqual(status,200);self.assertTrue(second['already']);self.assertEqual(first['time'],second['time'])
  self.assertEqual(len(self.sql("SELECT id FROM audit WHERE action='attendance.student.in'")),1)
 def test_checkout_requires_presence_and_end_window(self):
  s=self.active();p=self.pupil(s)
  self.assertEqual(self.check(s,p,'out')[0],409)
  self.sql('UPDATE attendance_sessions SET ends_at=? WHERE id=?',[utc(600),s['id']])
  self.assertEqual(self.check(s,p,'out')[0],409)
  self.assertEqual(self.check(s,p)[0],200)
  self.assertEqual(self.check(s,p,'out')[0],200)
  self.assertTrue(self.check(s,p,'out')[1]['already'])
 def test_scan_window_and_closed_session(self):
  s=self.active();p=self.pupil(s)
  self.sql('UPDATE attendance_sessions SET starts_at=?,ends_at=? WHERE id=?',[utc(1800),utc(5400),s['id']]);self.assertEqual(self.check(s,p)[0],409)
  self.sql('UPDATE attendance_sessions SET starts_at=?,ends_at=? WHERE id=?',[utc(-5400),utc(-1860),s['id']]);self.assertEqual(self.check(s,p)[0],409)
  self.sql("UPDATE attendance_sessions SET status='closed' WHERE id=?",[s['id']]);self.assertEqual(self.check(s,p)[0],409)
 def test_twenty_minute_queue_and_deduplication(self):
  s=self.active();self.sql('UPDATE attendance_sessions SET starts_at=? WHERE id=?',[utc(-1190),s['id']])
  self.worker();self.assertEqual(len(self.sql('SELECT id FROM attendance_messages')),0)
  self.sql('UPDATE attendance_sessions SET starts_at=? WHERE id=?',[utc(-1200),s['id']])
  self.worker();first=self.sql('SELECT * FROM attendance_messages');self.assertEqual(len(first),6)
  self.assertTrue(all(m['status']=='blocked' and m['reason']=='missing_guardian' for m in first))
  self.worker();self.assertEqual(len(self.sql('SELECT id FROM attendance_messages')),6)
  self.assertTrue(all(m['attempts']==0 for m in self.sql('SELECT * FROM attendance_messages')))
 def test_no_notification_for_present_excused_or_cancelled(self):
  s=self.active();roster=self.sql('SELECT * FROM attendance_roster WHERE session_id=?',[s['id']])
  self.sql('UPDATE attendance_sessions SET starts_at=? WHERE id=?',[utc(-1260),s['id']])
  self.sql('UPDATE attendance_roster SET checked_in=? WHERE session_id=? AND student_id=?',[utc(-1000),s['id'],roster[0]['student_id']])
  self.sql('UPDATE attendance_roster SET excused=1 WHERE session_id=? AND student_id=?',[s['id'],roster[1]['student_id']])
  self.sql("UPDATE registrations SET status='cancelled' WHERE id=?",[roster[2]['registration_id']])
  self.worker();self.assertEqual(len(self.sql('SELECT id FROM attendance_messages')),3)
 def test_late_arrival_cancels_unsent_message(self):
  s=self.active();p=self.pupil(s);self.sql('UPDATE attendance_sessions SET starts_at=? WHERE id=?',[utc(-1260),s['id']])
  self.worker();status,result=self.check(s,p);self.assertEqual(status,200,result);self.assertTrue(result['late'])
  m=self.sql('SELECT * FROM attendance_messages WHERE student_id=?',[p['student_id']],one=True);self.assertEqual(m['status'],'cancelled')
  self.worker();self.assertEqual(self.sql('SELECT status FROM attendance_messages WHERE id=?',[m['id']],one=True)['status'],'cancelled')
 def test_sms_disabled_is_not_reported_as_sent(self):
  s=self.active();p=self.pupil(s);self.sql('UPDATE attendance_sessions SET starts_at=? WHERE id=?',[utc(-1260),s['id']])
  self.login();status,_=self.api('contact',{'student_id':p['student_id'],'guardian':'ولي اختبار','guardian_mobile':'0533333333','consent':True});self.assertEqual(status,200)
  self.assertEqual(self.worker(),{'submitted':0,'failed':0,'unknown':0})
  m=self.sql('SELECT * FROM attendance_messages WHERE student_id=?',[p['student_id']],one=True);self.assertEqual((m['status'],m['reason'],m['attempts']),('blocked','sms_disabled',0))
 def test_end_and_close_suppress_pending_alerts(self):
  s=self.active();self.sql('UPDATE attendance_sessions SET starts_at=? WHERE id=?',[utc(-1260),s['id']]);self.worker()
  self.sql('UPDATE attendance_sessions SET ends_at=? WHERE id=?',[utc(-1),s['id']]);self.worker()
  self.assertTrue(all(m['status']=='expired' for m in self.sql('SELECT * FROM attendance_messages')))
  self.login();self.assertEqual(self.api('close_session',{'session_id':s['id']})[0],200)
 def test_pin_hash_not_exposed_and_reset_invalidates_old(self):
  s=self.active();p=self.pupil(s);self.login()
  _,students=self.api('students');self.assertNotIn('pin_hash',json.dumps(students));self.assertNotIn('24681357',json.dumps(students))
  status,new=self.api('reset_pin',{'student_id':p['student_id']});self.assertEqual(status,200)
  self.assertEqual(self.check(s,p)[0],401);self.assertEqual(self.check(s,p,pin=new['pin'])[0],200)
 def test_provider_interpretation_and_exact_deadline(self):
  process=subprocess.run(['php',str(ROOT/'tests/domain.php'),str(ROOT)],env=self.env,text=True,capture_output=True)
  self.assertEqual(process.returncode,0,process.stderr);self.assertIn('Domain checks passed',process.stdout)
 def test_legacy_student_delete_cascades_attendance(self):
  s=self.active();p=self.pupil(s)
  self.sql('INSERT INTO audit(user_id,action,entity,detail,created_at) VALUES(NULL,?,?,?,?)',['attendance.manual.in',s['id'],json.dumps({'student_id':p['student_id'],'reason':'ملاحظة اختبار خاصة'}),utc()])
  script=self.target/'delete-test.php'
  script.write_text('''<?php
require $argv[1].'/server/bootstrap.php';sessionStart();
$u=one("SELECT * FROM users WHERE role='owner' LIMIT 1");
$_SESSION['user']=$u['id'];$_SESSION['auth_version']=$u['auth_version'];$_SESSION['last']=$_SESSION['login']=time();
$_SERVER['HTTP_X_CSRF_TOKEN']=$_SESSION['csrf'];
api('student_delete','POST',['id'=>$argv[2],'confirm_delete'=>true]);
''')
  process=subprocess.run(['php',str(script),str(ROOT),p['student_id']],env=self.env,text=True,capture_output=True)
  self.assertEqual(process.returncode,0,process.stderr)
  self.assertIsNone(self.sql('SELECT id FROM students WHERE id=?',[p['student_id']],one=True))
  self.assertEqual(self.sql('PRAGMA foreign_key_check'),[])
  self.assertFalse(any(p['student_id'] in a['detail'] for a in self.sql("SELECT detail FROM audit WHERE action LIKE 'attendance.%'")))

if __name__=='__main__': unittest.main(verbosity=2)
