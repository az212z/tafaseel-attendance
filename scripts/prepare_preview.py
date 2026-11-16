"""Build an isolated, synthetic preview. Never read or copy the live database."""
import argparse, hashlib, json, secrets, shutil, subprocess, tempfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--target', default='/tmp/tafaseel-attendance-preview')
parser.add_argument('--origin', default='http://127.0.0.1:3080')
args = parser.parse_args()
target = Path(args.target).resolve()
target.mkdir(mode=0o700, parents=True, exist_ok=True)
legacy = target / 'core'
legacy.mkdir(mode=0o700, exist_ok=True)
for file in (root / 'integration/tafaseel-core').iterdir():
    if file.is_file(): shutil.copy(file, legacy / file.name)
def php_config(path, data):
    path.write_text('<?php return json_decode(' + repr(json.dumps(data)) + ', true);\n')
    path.chmod(0o600)
password = secrets.token_urlsafe(24)
php_config(legacy/'config.php', {'database':str(target/'demo.sqlite'), 'local':True, 'origin':args.origin,
    'key':secrets.token_hex(32), 'owner_email':'admin@example.test', 'setup_hash':hashlib.sha256(secrets.token_bytes(32)).hexdigest(), 'setup_expires':0})
php_config(target/'attendance-config.php', {'legacy_dir':str(legacy), 'origin':args.origin, 'preview':True,
    'sms_enabled':False, 'sms_provider':'taqnyat', 'sms_token':'', 'sms_sender':'', 'demo_password':password})
env = __import__('os').environ.copy()
env['ATTENDANCE_CONFIG_PATH'] = str(target/'attendance-config.php')
php = '''<?php
require $argv[1].'/server/bootstrap.php';
db(); db()->exec(file_get_contents($argv[1].'/server/schema.sql'));
run("INSERT OR IGNORE INTO settings(key,value) VALUES('attendance_schema_v1',?)",[now()]);
if(one('SELECT id FROM users LIMIT 1')){run('UPDATE users SET password=? WHERE email=?',[password_hash(attendanceConfig()['demo_password'],PASSWORD_DEFAULT),'admin@example.test']);echo "Existing isolated preview retained\\n";exit;}
$admin=uid();run('INSERT INTO users(id,name,email,password,role,created_at) VALUES(?,?,?,?,?,?)',[$admin,'مدير المركز','admin@example.test',password_hash(attendanceConfig()['demo_password'],PASSWORD_DEFAULT),'owner',now()]);
$groups=rows('SELECT g.*,c.title FROM cohorts g JOIN courses c ON c.slug=g.course_slug ORDER BY c.sort_order LIMIT 2');
$names=['طالب تجريبي أحمد','طالب تجريبي عمر','طالب تجريبي محمد','طالب تجريبي خالد','طالب تجريبي يوسف','طالب تجريبي عبدالرحمن','طالب تجريبي فهد','طالب تجريبي زياد'];
foreach($names as $i=>$name){$g=$groups[$i<6?0:1];attendanceAddStudent(['name'=>$name,'mobile'=>'05000000'.str_pad((string)($i+1),2,'0',STR_PAD_LEFT),'guardian'=>'ولي أمر تجريبي','guardian_mobile'=>'','cohort_id'=>$g['id']],['id'=>$admin]);}
run('UPDATE attendance_students SET pin_hash=?',[password_hash('24681357',PASSWORD_DEFAULT)]);
$first=uid();$second=uid();
foreach([[$first,$groups[0],gmdate('Y-m-d H:i:s',time()-720),gmdate('Y-m-d H:i:s',time()+6480),'الحصة الأولى · تدريب ومراجعة'],[$second,$groups[1],gmdate('Y-m-d H:i:s',time()+10800),gmdate('Y-m-d H:i:s',time()+18000),'الحصة الأولى · تأسيس']] as [$id,$g,$start,$end,$title]){
run('INSERT INTO attendance_sessions(id,cohort_id,title,starts_at,ends_at,token,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',[$id,$g['id'],$title,$start,$end,bin2hex(random_bytes(32)),$admin,now()]);
run("INSERT INTO attendance_roster(session_id,student_id,registration_id) SELECT ?,student_id,id FROM registrations WHERE cohort_id=? AND status='registered'",[$id,$g['id']]);}
foreach(rows('SELECT student_id FROM attendance_roster WHERE session_id=? LIMIT 4',[$first]) as $r)run("UPDATE attendance_roster SET checked_in=?,method='student' WHERE session_id=? AND student_id=?",[gmdate('Y-m-d H:i:s',time()-400),$first,$r['student_id']]);
echo "Synthetic preview created; no SMS provider enabled.\\n";
'''
seed = target/'seed.php'
seed.write_text(php)
subprocess.run(['php',str(seed),str(root)],env=env,check=True)
seed.unlink()
print('ATTENDANCE_CONFIG_PATH='+str(target/'attendance-config.php'))
print('ATTENDANCE_PRIVATE_DIR='+str(root/'server'))
