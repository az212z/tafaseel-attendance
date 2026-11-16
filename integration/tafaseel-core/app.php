<?php
declare(strict_types=1);
// This file and all database files live outside public_html.
require_once __DIR__.'/maintenance.php';
require_once __DIR__.'/followups.php';
final class HttpError extends RuntimeException { public function __construct(public int $status, string $message) { parent::__construct($message); } }
function fail(int $status, string $message): never { throw new HttpError($status, $message); }
function config(): array { static $c; return $c ??= require __DIR__.'/config.php'; }
function now(): string { return gmdate('Y-m-d H:i:s'); }
function uid(): string { return bin2hex(random_bytes(16)); }
function db(): SQLite3 {
 static $db;
 if ($db) return $db;
 $db = new SQLite3(config()['database']); $db->enableExceptions(true); $db->busyTimeout(10000);
 $db->exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
 @chmod(config()['database'],0600);
 $db->exec(file_get_contents(__DIR__.'/schema.sql'));
 if (!in_array('confirmed',array_column(rows('PRAGMA table_info(registrations)'),'name'),true)) transaction(function(){
  if (!in_array('confirmed',array_column(rows('PRAGMA table_info(registrations)'),'name'),true)) run('ALTER TABLE registrations ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0 CHECK(confirmed IN (0,1))');
 });
 if (!one('SELECT value FROM settings WHERE key=?',['seeded'])) transaction(function() {
  if (one('SELECT value FROM settings WHERE key=?',['seeded'])) return;
  $seed=json_decode(file_get_contents(__DIR__.'/catalog-seed.json'),true,512,JSON_THROW_ON_ERROR);
  foreach ($seed['programs'] as $i=>$p) run('INSERT INTO programs(id,title,short_title,sort_order) VALUES(?,?,?,?)',[$p['id'],$p['title'],$p['shortTitle'],$i]);
  foreach ($seed['courses'] as $c) {
   run('INSERT INTO courses(slug,title,description,program_id,sort_order,capacity,created_at) VALUES(?,?,?,?,?,?,?)',[$c['slug'],$c['title'],$c['description'],$c['program_id'],$c['sort_order'],20,now()]);
   run('INSERT INTO cohorts(course_slug,number,capacity,created_at) VALUES(?,1,20,?)',[$c['slug'],now()]);
  }
  run('INSERT INTO settings(key,value) VALUES(?,?)',['seeded',now()]);
 });
 if (!one('SELECT value FROM settings WHERE key=?',['registration_numbering_v1'])) transaction(function() {
  if (one('SELECT value FROM settings WHERE key=?',['registration_numbering_v1'])) return;
  // Keep old references searchable; cancelled requests also retain their place.
  $number=0;
  foreach(rows('SELECT id,reference FROM registrations ORDER BY created_at,rowid') as $r){
   $number++;
   run('INSERT INTO registration_reference_aliases(reference,registration_id) VALUES(?,?)',[$r['reference'],$r['id']]);
   run('UPDATE registrations SET reference=? WHERE id=?',[(string)$number,$r['id']]);
  }
  run('INSERT INTO registration_sequence(id,last_number) VALUES(1,?)',[$number]);
  run('INSERT INTO settings(key,value) VALUES(?,?)',['registration_numbering_v1',now()]);
 });
 return $db;
}
function query(string $s,array $args=[]): SQLite3Result {
 $stmt=db()->prepare($s); foreach(array_values($args) as $i=>$v) $stmt->bindValue($i+1,$v,is_int($v)?SQLITE3_INTEGER:($v===null?SQLITE3_NULL:SQLITE3_TEXT));
 return $stmt->execute();
}
function rows(string $s,array $args=[]): array { $r=query($s,$args); $out=[]; while($row=$r->fetchArray(SQLITE3_ASSOC))$out[]=$row; $r->finalize(); return $out; }
function one(string $s,array $args=[]): ?array { return rows($s,$args)[0]??null; }
function run(string $s,array $args=[]): void { query($s,$args)->finalize(); }
function transaction(callable $f,bool $write=true): mixed { db()->exec($write?'BEGIN IMMEDIATE':'BEGIN'); try {$r=$f();db()->exec('COMMIT');return $r;}catch(Throwable $e){db()->exec('ROLLBACK');throw $e;} }
function textInput(mixed $v,int $max,string $label,bool $required=false): string {
 if (!is_string($v)) fail(422,"تحقق من $label.");
 $v=trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u','',$v));
 if (mb_strlen($v)>$max||($required&&mb_strlen($v)<2))fail(422,"تحقق من $label."); return $v;
}
function mobile(mixed $v): string {
 if(!is_string($v))fail(422,'أدخل رقم جوال سعودي صحيحًا.');
 $v=strtr($v,array_combine(preg_split('//u','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',-1,PREG_SPLIT_NO_EMPTY),str_split('01234567890123456789')));
 $v=preg_replace('/[\s()\-]/u','',$v);
 if(preg_match('/^05\d{8}$/',$v))return '+966'.substr($v,1);
 if(preg_match('/^(?:\+?966|00966)5\d{8}$/',$v))return '+966'.substr($v,-9);
 fail(422,'أدخل رقم جوال سعودي صحيحًا.');
}
function nameKey(string $s): string { return hash('sha256',mb_strtolower(preg_replace('/\s+/u',' ',trim($s)))); }
function rate(string $key,int $limit,int $seconds): void {
 $hash=hash_hmac('sha256',$key,config()['key']);$slot=(int)floor(time()/$seconds);
 transaction(function()use($hash,$slot,$limit){
  run('INSERT INTO limits(key,slot,hits) VALUES(?,?,1) ON CONFLICT(key,slot) DO UPDATE SET hits=hits+1',[$hash,$slot]);
 });
 if((int)one('SELECT hits FROM limits WHERE key=? AND slot=?',[$hash,$slot])['hits']>$limit)fail(429,'طلبات كثيرة. يرجى المحاولة لاحقًا.');
}
function ip(): string { return $_SERVER['REMOTE_ADDR']??'local'; }
function sessionStart(): void {
 if(session_status()===PHP_SESSION_ACTIVE)return;
 ini_set('session.use_strict_mode','1');ini_set('session.use_only_cookies','1');ini_set('session.gc_maxlifetime','28800');ini_set('session.gc_probability','1');ini_set('session.gc_divisor','100');
 $sessions=dirname(config()['database']).'/sessions';if(!is_dir($sessions))mkdir($sessions,0700,true);session_save_path($sessions);
 $secure=!config()['local'];session_name($secure?'__Host-tafaseel':'tafaseel_local');
 session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>$secure,'httponly'=>true,'samesite'=>'Strict']);session_start();
 if(!isset($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));
}
function currentUser(bool $touch=true): ?array {
 sessionStart();if(empty($_SESSION['user']))return null;
 if(time()-($_SESSION['last']??0)>1800||time()-($_SESSION['login']??0)>28800){unset($_SESSION['user']);return null;}
 $u=one('SELECT id,name,email,role,auth_version FROM users WHERE id=? AND active=1',[$_SESSION['user']]);
 if(!$u||$u['role']!=='owner'||$u['email']!==config()['owner_email']||$u['auth_version']!==($_SESSION['auth_version']??1)){unset($_SESSION['user']);return null;}unset($u['auth_version']);if($touch)$_SESSION['last']=time();return $u;
}
function authorize(bool $touch=true): array {
 $u=currentUser($touch); if(!$u)fail(401,'سجّل الدخول للمتابعة.');
 return $u;
}
function csrf(): void { sessionStart();if(!hash_equals($_SESSION['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN']??''))fail(403,'انتهت صلاحية النموذج. حدّث الصفحة وحاول مجددًا.'); }
function audit(?string $user,string $action,string $entity,array $detail=[]): void {run('INSERT INTO audit(user_id,action,entity,detail,created_at) VALUES(?,?,?,?,?)',[$user,$action,$entity,json_encode($detail,JSON_UNESCAPED_UNICODE),now()]);}
function catalog(): array {
 return ['programs'=>rows('SELECT id,title,short_title AS shortTitle FROM programs ORDER BY sort_order'), 'courses'=>rows("SELECT c.slug,c.title,c.description,c.program_id,c.sort_order,c.capacity FROM courses c WHERE c.active=1 ORDER BY c.sort_order,c.created_at")];
}
function cohortCount(int $id): int { return (int)one("SELECT COUNT(*) n FROM registrations WHERE cohort_id=? AND status='registered'",[$id])['n']; }
function notification(string $key,string $kind,string $title,string $body,?string $student,?int $cohort): void {
 run('INSERT OR IGNORE INTO notifications(event_key,kind,title,body,student_id,cohort_id,created_at) VALUES(?,?,?,?,?,?,?)',[$key,$kind,$title,$body,$student,$cohort,now()]);
}
function notifyFullCohort(int $id): void {
 $g=one("SELECT g.*,c.title FROM cohorts g JOIN courses c ON c.slug=g.course_slug WHERE g.id=? AND g.status='collecting'",[$id]);
 if($g&&cohortCount($id)>=$g['capacity'])notification('cohort-full:'.$id,'cohort_full','اكتمل عدد الدورة',$g['title'].' · المجموعة '.$g['number'].' · اكتمل العدد المستهدف: '.$g['capacity'].' طالبًا',null,$id);
}
function receipt(array $r): array { return ['reference'=>$r['reference'],'course'=>$r['course_title'],'status'=>$r['status']]; }
function register(array $d,string $source='website',?string $actor=null): array {
 $name=textInput($d['name']??'',100,'اسم الطالب',true);$phone=mobile($d['mobile']??'');
 $city=textInput($d['city']??'',80,'المدينة');$note=textInput($d['note']??'',1000,'الملاحظات');
 $guardian=textInput($d['guardian']??'',100,'اسم ولي الأمر');$email=textInput($d['email']??'',190,'البريد الإلكتروني');
 if($email&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail(422,'البريد الإلكتروني غير صحيح.');
 $slugs=$d['courses']??[];if(!is_array($slugs)||!count($slugs)||count($slugs)>20)fail(422,'اختر دورة واحدة على الأقل.');
 foreach($slugs as $slug)if(!is_string($slug)||strlen($slug)>80)fail(422,'الدورة غير صحيحة.');$slugs=array_values(array_unique($slugs));
 if(($d['consent']??false)!==true)fail(422,'الموافقة على حفظ بيانات التسجيل مطلوبة.');
 if($source==='admin'&&array_key_exists('confirmed',$d)&&!is_bool($d['confirmed']))fail(422,'اختر حالة تأكيد صحيحة.');
 $confirmed=$source==='admin'&&($d['confirmed']??false)===true?1:0;
 return transaction(function()use($name,$phone,$city,$note,$guardian,$email,$slugs,$source,$actor,$confirmed){
  $courses=[];foreach($slugs as $slug){
   if($slug==='help-me-choose'){$courses[]=['slug'=>null,'title'=>'المساعدة في اختيار الدورة','program_id'=>'assistance'];continue;}
   $c=one('SELECT * FROM courses WHERE slug=? AND active=1',[$slug]);if(!$c)fail(422,'إحدى الدورات لم تعد متاحة. حدّث القائمة.');
   if($c['program_id']==='children'&&mb_strlen($guardian)<2)fail(422,'أدخل اسم ولي الأمر لدورات الأطفال.');$courses[]=$c;
  }
  $student=one('SELECT * FROM students WHERE mobile=? AND name_key=?',[$phone,nameKey($name)]);
  if(!$student){$id=uid();run('INSERT INTO students(id,name,name_key,mobile,email,city,guardian,created_at) VALUES(?,?,?,?,?,?,?,?)',[$id,$name,nameKey($name),$phone,$email,$city,$guardian,now()]);$student=['id'=>$id];}
  $out=[];
  foreach($courses as $c){
   $existing=one("SELECT r.* FROM registrations r LEFT JOIN cohorts g ON g.id=r.cohort_id WHERE r.student_id=? AND r.course_slug IS ? AND r.status!='cancelled' AND (g.status IN ('collecting','running') OR r.cohort_id IS NULL) ORDER BY r.created_at DESC LIMIT 1",[$student['id'],$c['slug']]);
   if($existing){$out[]=receipt($existing);continue;}
   $group=$c['slug']?one("SELECT * FROM cohorts WHERE course_slug=? AND status='collecting'",[$c['slug']]):null;
   if($c['slug']&&!$group)fail(409,'التسجيل في هذه الدورة متوقف مؤقتًا. تواصل مع المركز.');
   $status=$group&&cohortCount((int)$group['id'])>=$group['capacity']?'waitlist':'registered';
   // Allocated inside the same write transaction: retries and rollbacks consume no number.
   run('UPDATE registration_sequence SET last_number=last_number+1 WHERE id=1');
   $reference=one('SELECT CAST(last_number AS TEXT) reference FROM registration_sequence WHERE id=1')['reference'];$id=uid();
   run('INSERT INTO registrations(id,reference,student_id,course_slug,course_title,cohort_id,status,confirmed,note,source,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$reference,$student['id'],$c['slug'],$c['title'],$group['id']??null,$status,$confirmed,$note,$source,now(),now()]);
   notification('registration:'.$id,'registration','تسجيل طالب جديد',$name.' · '.$c['title'].($status==='waitlist'?' · قائمة الانتظار':''),$student['id'],$group['id']??null);
   if($group)notifyFullCohort((int)$group['id']);
   audit($actor,'registration.created',$reference,['source'=>$source,'confirmed'=>(bool)$confirmed]);$out[]=['reference'=>$reference,'course'=>$c['title'],'status'=>$status];
  }
  return ['registrations'=>$out];
 });
}
function requestData(): array {
 if(!str_starts_with($_SERVER['CONTENT_TYPE']??'','application/json'))fail(415,'صيغة الطلب غير صحيحة.');
 $raw=file_get_contents('php://input',false,null,0,32769);if(strlen($raw)>32768)fail(413,'الطلب أكبر من المسموح.');
 try{$d=json_decode($raw,true,32,JSON_THROW_ON_ERROR);}catch(JsonException){fail(400,'تعذّر قراءة الطلب.');}
 if(!is_array($d))fail(400,'تعذّر قراءة الطلب.');return $d;
}
function api(string $action,string $method,array $d): array {
 $get=['health','session','catalog','overview','courses','cohorts','registrations','students','student','analytics','audit','system','users','notifications','followups'];
 if($method!== (in_array($action,$get,true)?'GET':'POST'))fail(405,'طريقة الطلب غير مسموحة.');
 if($action==='health'){db();return ['ok'=>true,'version'=>'1.5.1'];}
 if($action==='catalog')return catalog();
 if($action==='session'){sessionStart();return ['user'=>currentUser(),'csrf'=>$_SESSION['csrf'],'setupRequired'=>!one('SELECT id FROM users LIMIT 1')];}
 if($action==='visit'){
  $id=$d['visitor']??'';$path=$d['path']??'';
  if(!is_string($id)||!preg_match('/^[a-f0-9-]{32,36}$/',$id)||!is_string($path)||strlen($path)>180||!preg_match('#^/[a-z0-9/_-]*$#',$path)||str_starts_with($path,'/admin'))fail(422,'طلب غير صحيح.');
  rate('visit:'.ip(),600,3600);$day=date('Y-m-d');$hash=hash_hmac('sha256',$day.$id,config()['key']);
  run('INSERT INTO visits(day,visitor,path,views) VALUES(?,?,?,1) ON CONFLICT(day,visitor,path) DO UPDATE SET views=MIN(views+1,100)',[$day,$hash,$path]);return ['ok'=>true];
 }
 csrf();
 if($action==='setup'){
  rate('setup:'.ip(),10,3600);
  if(one('SELECT id FROM users LIMIT 1'))fail(403,'تم تفعيل لوحة الإدارة مسبقًا.');
  if(time()>config()['setup_expires']||!hash_equals(config()['setup_hash'],hash('sha256',(string)($d['token']??''))))fail(403,'رابط التفعيل غير صالح أو منتهي.');
  $name=textInput($d['name']??'',80,'الاسم',true);$username=strtolower(textInput($d['username']??'',80,'اسم الدخول',true));$email=config()['owner_email'];$pw=$d['password']??'';
  if($username!=='admin')fail(422,'اسم دخول مدير المركز هو admin.');
  if(!is_string($pw)||mb_strlen($pw)<8||strlen($pw)>72)fail(422,'استخدم كلمة مرور من ٨ أحرف على الأقل وبحد أقصى ٧٢ بايت.');
  $id=uid();transaction(function()use($id,$name,$email,$pw){if(one('SELECT id FROM users LIMIT 1'))fail(409,'تم التفعيل مسبقًا.');run('INSERT INTO users(id,name,email,password,role,created_at) VALUES(?,?,?,?,?,?)',[$id,$name,$email,password_hash($pw,PASSWORD_DEFAULT),'owner',now()]);audit($id,'system.activated','admin');});
  session_regenerate_id(true);$_SESSION['user']=$id;$_SESSION['last']=$_SESSION['login']=time();$_SESSION['csrf']=bin2hex(random_bytes(32));return ['user'=>currentUser(),'csrf'=>$_SESSION['csrf']];
 }
 if($action==='login'){
  $username=strtolower(textInput($d['username']??'',80,'اسم الدخول'));$pw=$d['password']??'';if(!is_string($pw)||strlen($pw)>72)fail(422,'تحقق من بيانات الدخول.');
  rate('login:'.ip(),15,900);rate('login-username:'.$username,30,3600);
  $u=$username==='admin'?one("SELECT * FROM users WHERE email=? AND role='owner' AND active=1",[config()['owner_email']]):null;
  $valid=password_verify($pw,$u['password']??'$2y$12$YJaOwODctYwAC86vwF8BjOlp6PrHx.WgIWIVvq2vnthNOIr3CeeYe');
  if(!$u||!$valid||$u['role']!=='owner'||$u['email']!==config()['owner_email'])fail(401,'اسم الدخول أو كلمة المرور غير صحيحة.');
  session_regenerate_id(true);$_SESSION['user']=$u['id'];$_SESSION['auth_version']=$u['auth_version'];$_SESSION['last']=$_SESSION['login']=time();$_SESSION['csrf']=bin2hex(random_bytes(32));audit($u['id'],'session.login','admin');return ['user'=>currentUser(),'csrf'=>$_SESSION['csrf']];
 }
 if($action==='register'){
  rate('register:'.ip(),30,3600);if(!empty($d['website']))fail(422,'تعذّر إرسال الطلب.');
  return register($d);
 }
 $u=authorize($action!=='notifications');
 if($method==='GET'){/* CSRF also protects authenticated reads from browser misuse. */}
 if($action==='logout'){audit($u['id'],'session.logout','admin');$_SESSION=[];session_destroy();setcookie(session_name(),'', ['expires'=>1,'path'=>'/','secure'=>!config()['local'],'httponly'=>true,'samesite'=>'Strict']);return ['ok'=>true];}
 if($action==='notifications')return transaction(function(){
  $offset=max(0,(int)($_GET['offset']??0));$after=max(0,(int)($_GET['after']??0));
  return ['items'=>rows('SELECT * FROM notifications ORDER BY id DESC LIMIT 50 OFFSET ?',[$offset]),'total'=>(int)one('SELECT COUNT(*) n FROM notifications')['n'],'unread'=>(int)one('SELECT COUNT(*) n FROM notifications WHERE read_at IS NULL')['n'],'latest'=>(int)(one('SELECT MAX(id) n FROM notifications')['n']??0),'new_count'=>(int)one('SELECT COUNT(*) n FROM notifications WHERE id>?',[$after])['n'],'followups_due'=>followupDueCount(),'system_alerts'=>maintenanceAlerts(),'new_full'=>(int)one("SELECT COUNT(*) n FROM notifications WHERE id>? AND kind='cohort_full'",[$after])['n']];
 },false);
 if($action==='notification_read'){
  if(isset($d['id']))run('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=?',[now(),(int)$d['id']]);
  elseif(isset($d['through']))run('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id<=?',[now(),max(0,(int)$d['through'])]);
  else fail(422,'حدد التنبيه المطلوب.');
  return ['ok'=>true];
 }
 if($action==='overview'){
  $ready=rows("SELECT g.id,g.number,c.title,g.capacity,COUNT(r.id) registered FROM cohorts g JOIN courses c ON c.slug=g.course_slug LEFT JOIN registrations r ON r.cohort_id=g.id AND r.status='registered' WHERE g.status='collecting' GROUP BY g.id HAVING registered>=g.capacity ORDER BY g.created_at");
  return ['totals'=>['students'=>(int)one('SELECT COUNT(*) n FROM students')['n'],'registrations'=>(int)one("SELECT COUNT(*) n FROM registrations WHERE status!='cancelled'")['n'],'courses'=>(int)one('SELECT COUNT(*) n FROM courses WHERE active=1')['n'],'ready'=>count($ready),'waitlist'=>(int)one("SELECT COUNT(*) n FROM registrations WHERE status='waitlist'")['n'],'visitors'=>(int)one('SELECT COUNT(DISTINCT visitor) n FROM visits WHERE day=?',[date('Y-m-d')])['n']], 'ready'=>$ready,'recent'=>registrationList(['limit'=>6])['items'],'trend'=>rows("SELECT date(created_at,'+3 hours') day,COUNT(*) total FROM registrations WHERE created_at>=datetime('now','+3 hours','start of day','-29 days','-3 hours') GROUP BY day ORDER BY day")];
 }
 if($action==='courses')return ['items'=>rows("SELECT c.*,p.title program_title,(SELECT COUNT(*) FROM registrations r WHERE r.course_slug=c.slug AND r.status!='cancelled') total,(SELECT COUNT(*) FROM registrations r JOIN cohorts g ON r.cohort_id=g.id WHERE r.course_slug=c.slug AND r.status='registered' AND g.status='collecting') enrolled FROM courses c JOIN programs p ON c.program_id=p.id ORDER BY c.sort_order,c.created_at"),'programs'=>catalog()['programs']];
 if($action==='course_save'){
  $title=textInput($d['title']??'',100,'اسم الدورة',true);$desc=textInput($d['description']??'',500,'وصف الدورة',true);$program=$d['program_id']??'';if(!is_string($program)||!one('SELECT id FROM programs WHERE id=?',[$program]))fail(422,'اختر قسمًا صحيحًا.');
  $slug=$d['slug']??'';if(!is_string($slug)||strlen($slug)>80)fail(422,'معرّف غير صحيح.');
  return transaction(function()use($d,$title,$desc,$program,$slug,$u){
   $existing=$slug?one('SELECT * FROM courses WHERE slug=?',[$slug]):null;if($slug&&!$existing)fail(404,'الدورة غير موجودة.');
   if($existing){run('UPDATE courses SET title=?,description=?,program_id=?,updated_at=? WHERE slug=?',[$title,$desc,$program,now(),$slug]);audit($u['id'],'course.updated',$slug);}
   else{$slug='course-'.substr(uid(),0,12);run('INSERT INTO courses(slug,title,description,program_id,sort_order,capacity,created_at) VALUES(?,?,?,?,?,20,?)',[$slug,$title,$desc,$program,1000,now()]);run('INSERT INTO cohorts(course_slug,number,capacity,created_at) VALUES(?,1,20,?)',[$slug,now()]);audit($u['id'],'course.created',$slug);}
   return ['slug'=>$slug];
  });
 }
 if($action==='course_archive'){
  $slug=(string)($d['slug']??'');$active=($d['active']??false)===true?1:0;
  if(!one('SELECT slug FROM courses WHERE slug=?',[$slug]))fail(404,'الدورة غير موجودة.');
  transaction(function()use($slug,$active,$u){run('UPDATE courses SET active=?,updated_at=? WHERE slug=?',[$active,now(),$slug]);audit($u['id'],$active?'course.restored':'course.archived',$slug);});return ['ok'=>true];
 }
 if($action==='cohorts')return ['items'=>rows("SELECT g.*,c.title,c.active,(SELECT COUNT(*) FROM registrations r WHERE r.cohort_id=g.id AND r.status='registered') enrolled,(SELECT COUNT(*) FROM registrations r WHERE r.cohort_id=g.id AND r.status='registered' AND r.confirmed=1) confirmed,(SELECT COUNT(*) FROM registrations r WHERE r.cohort_id=g.id AND r.status='waitlist') waiting FROM cohorts g JOIN courses c ON c.slug=g.course_slug ORDER BY CASE g.status WHEN 'collecting' THEN 0 WHEN 'running' THEN 1 ELSE 2 END,g.created_at DESC")];
 if($action==='cohort_start')return transaction(function()use($d,$u){
  $g=one('SELECT * FROM cohorts WHERE id=?',[(int)($d['id']??0)]);if(!$g||$g['status']!=='collecting')fail(409,'المجموعة ليست بانتظار الاكتمال.');
  $startingCount=cohortCount((int)$g['id']);
  run("UPDATE cohorts SET status='running',started_at=? WHERE id=?",[now(),$g['id']]);
  $number=(int)one('SELECT MAX(number) n FROM cohorts WHERE course_slug=?',[$g['course_slug']])['n']+1;
  run('INSERT INTO cohorts(course_slug,number,capacity,created_at) VALUES(?,?,20,?)',[$g['course_slug'],$number,now()]);$new=db()->lastInsertRowID();
  foreach(rows("SELECT id FROM registrations WHERE cohort_id=? AND status='waitlist' ORDER BY created_at,rowid",[$g['id']]) as $i=>$r)run('UPDATE registrations SET cohort_id=?,status=? WHERE id=?',[$new,$i<20?'registered':'waitlist',$r['id']]);
  notifyFullCohort($new);
  audit($u['id'],'cohort.started',(string)$g['id'],['next_cohort'=>$new,'starting_count'=>$startingCount]);return ['ok'=>true,'next'=>$new];
 });
 if($action==='cohort_complete')return transaction(function()use($d,$u){$id=(int)($d['id']??0);$g=one('SELECT * FROM cohorts WHERE id=?',[$id]);if(!$g||$g['status']!=='running')fail(409,'المجموعة ليست قيد التنفيذ.');run("UPDATE cohorts SET status='completed',completed_at=? WHERE id=?",[now(),$id]);audit($u['id'],'cohort.completed',(string)$id);return ['ok'=>true];});
 if($action==='followups')return followupSummary();
 if($action==='followup_save')return saveFollowup($d,$u);
 if($action==='registrations')return registrationList($_GET);
 if($action==='registration_add')return register($d,'admin',$u['id']);
 if($action==='registration_update')return transaction(function()use($d,$u){
  $id=(string)($d['id']??'');$r=one('SELECT * FROM registrations WHERE id=?',[$id]);if(!$r)fail(404,'الطلب غير موجود.');
  if(array_key_exists('confirmed',$d)){
   if(!is_bool($d['confirmed']))fail(422,'اختر حالة تأكيد صحيحة.');
   if($r['status']==='cancelled')fail(409,'التسجيل ملغي؛ لا يمكن تعديل تأكيده.');
   $confirmed=$d['confirmed']?1:0;
   if($r['confirmed']!==$confirmed){run('UPDATE registrations SET confirmed=? WHERE id=?',[$confirmed,$id]);syncFollowupConfirmation($id,$confirmed);audit($u['id'],'registration.confirmation',$r['reference'],['confirmed'=>(bool)$confirmed]);}
  }
  if(isset($d['contacted'])){
   if(!is_bool($d['contacted']))fail(422,'تحقق من حالة التواصل.');
   if($r['status']==='cancelled')fail(409,'التسجيل ملغي.');
   run('UPDATE registrations SET contacted=? WHERE id=?',[$d['contacted']?1:0,$id]);
   if(!$r['confirmed'])run("INSERT INTO registration_followups(registration_id,stage,updated_at) VALUES(?,?,?) ON CONFLICT(registration_id) DO UPDATE SET stage=excluded.stage,updated_at=excluded.updated_at",[$id,$d['contacted']?'contacted':'new',now()]);
   audit($u['id'],'registration.contacted',$r['reference']);
  }
  if(($d['cancel']??false)===true)cancelRegistration($r,$u['id']);
  return ['ok'=>true];
 });
 if($action==='students'){
  $q=substr((string)($_GET['q']??''),0,100);$offset=max(0,(int)($_GET['offset']??0));$pattern='%'.$q.'%';$where='name LIKE ? OR mobile LIKE ? OR guardian LIKE ?';$args=[$pattern,$pattern,$pattern];
  return ['items'=>rows("SELECT s.*,(SELECT COUNT(*) FROM registrations r WHERE r.student_id=s.id) registrations FROM students s WHERE $where ORDER BY created_at DESC LIMIT 50 OFFSET ?",[...$args,$offset]),'total'=>(int)one("SELECT COUNT(*) n FROM students WHERE $where",$args)['n']];
 }
 if($action==='student'){
  $id=(string)($_GET['id']??'');$s=one('SELECT * FROM students WHERE id=?',[$id]);if(!$s)fail(404,'الطالب غير موجود.');return ['student'=>$s,'registrations'=>registrationList(['student'=>$id,'limit'=>100])['items']];
 }
 // Account provisioning is disabled: only the configured center administrator may sign in.
 if(in_array($action,['users','user_save','user_toggle'],true))fail(404,'إدارة الحسابات الإضافية غير متاحة.');
 if($action==='student_update')return transaction(function()use($d,$u){
  $id=(string)($d['id']??'');if(!one('SELECT id FROM students WHERE id=?',[$id]))fail(404,'الطالب غير موجود.');
  $name=textInput($d['name']??'',100,'الاسم',true);$phone=mobile($d['mobile']??'');$email=textInput($d['email']??'',190,'البريد');if($email&&!filter_var($email,FILTER_VALIDATE_EMAIL))fail(422,'البريد غير صحيح.');
  if(one('SELECT id FROM students WHERE mobile=? AND name_key=? AND id!=?',[$phone,nameKey($name),$id]))fail(409,'يوجد طالب بنفس الاسم ورقم الجوال.');
  run('UPDATE students SET name=?,name_key=?,mobile=?,email=?,city=?,guardian=? WHERE id=?',[$name,nameKey($name),$phone,$email,textInput($d['city']??'',80,'المدينة'),textInput($d['guardian']??'',100,'ولي الأمر'),$id]);audit($u['id'],'student.updated',$id);return ['ok'=>true];
 });
 if($action==='student_delete'){
  $id=textInput($d['id']??'',40,'الطالب',true);
  if(!preg_match('/^[a-f0-9]{32}$/',$id))fail(422,'حدد الطالب المطلوب.');
  if(($d['confirm_delete']??false)!==true)fail(422,'أكد حذف الطالب وملفه نهائيًا.');
  return transaction(function()use($id,$u){
   if(!one('SELECT id FROM students WHERE id=?',[$id]))fail(404,'الطالب غير موجود أو حُذف مسبقًا.');
   $count=(int)one('SELECT COUNT(*) n FROM registrations WHERE student_id=?',[$id])['n'];
   $groups=rows("SELECT DISTINCT g.id,g.capacity FROM cohorts g JOIN registrations r ON r.cohort_id=g.id WHERE r.student_id=? AND r.status='registered' AND g.status='collecting'",[$id]);
   // Remove personal follow-up notes also held in registration audit details.
   run("DELETE FROM audit WHERE (action='student.updated' AND entity=?) OR (action LIKE 'registration.%' AND (entity IN (SELECT reference FROM registrations WHERE student_id=?) OR entity IN (SELECT a.reference FROM registration_reference_aliases a JOIN registrations r ON r.id=a.registration_id WHERE r.student_id=?)))",[$id,$id,$id]);
   run('DELETE FROM notifications WHERE student_id=?',[$id]);
   run('DELETE FROM registration_followups WHERE registration_id IN (SELECT id FROM registrations WHERE student_id=?)',[$id]);
   run('DELETE FROM registration_reference_aliases WHERE registration_id IN (SELECT id FROM registrations WHERE student_id=?)',[$id]);
   run('DELETE FROM registrations WHERE student_id=?',[$id]);
   run('DELETE FROM students WHERE id=?',[$id]);
   $promoted=0;
   foreach($groups as $g){
    $vacancies=max(0,$g['capacity']-cohortCount((int)$g['id']));
    foreach(rows("SELECT id,reference FROM registrations WHERE cohort_id=? AND status='waitlist' ORDER BY created_at,rowid LIMIT ?",[$g['id'],$vacancies]) as $w){
     run("UPDATE registrations SET status='registered' WHERE id=?",[$w['id']]);audit($u['id'],'registration.promoted',$w['reference']);$promoted++;
    }
    notifyFullCohort((int)$g['id']);
   }
   // The sequence is deliberately untouched, and the deletion receipt contains no profile data.
   audit($u['id'],'student.deleted',$id,['registrations'=>$count,'promoted'=>$promoted]);
   return ['ok'=>true,'deleted_registrations'=>$count,'promoted'=>$promoted];
  });
 }
 if($action==='analytics')return ['days'=>rows('SELECT day,COUNT(DISTINCT visitor) visitors,SUM(views) views FROM visits WHERE day>=? GROUP BY day ORDER BY day',[date('Y-m-d',strtotime('-29 days'))]),'pages'=>rows('SELECT path,SUM(views) views FROM visits WHERE day>=? GROUP BY path ORDER BY views DESC LIMIT 20',[date('Y-m-d',strtotime('-29 days'))])];
 if($action==='audit')return ['items'=>rows("SELECT id,action,entity,created_at,CASE WHEN user_id IS NOT NULL THEN 'أدمن' ELSE NULL END actor FROM audit ORDER BY id DESC LIMIT 50 OFFSET ?",[max(0,(int)($_GET['offset']??0))]),'total'=>(int)one('SELECT COUNT(*) n FROM audit')['n']];
 if($action==='system'){maintainSafely();return ['database'=>'SQLite 3 · WAL','integrity'=>db()->querySingle('PRAGMA quick_check'),'version'=>'1.5.1','capacity'=>20,...maintenanceStatus()];}
 if($action==='export'){
  audit($u['id'],'registrations.exported','csv');
  db()->exec('BEGIN');
  $filters=$d;$filters['limit']=500;$filters['offset']=0;$page=registrationList($filters);
  header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="tafaseel-registrations-'.gmdate('Y-m-d').'.csv"');
  $f=fopen('php://output','w');fwrite($f,"\xEF\xBB\xBF");fputcsv($f,['المرجع','اسم الطالب','رقم الجوال','البريد','المدينة','ولي الأمر','الدورة','المجموعة','الحالة','التأكيد','تم التواصل','تاريخ التسجيل (الرياض)','الملاحظات','حالة المتابعة','موعد المتابعة (الرياض)','ملاحظة المتابعة'],',','"','');
  do {
   foreach($page['items'] as $r){
    $time=(new DateTimeImmutable($r['created_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Riyadh'))->format('Y-m-d H:i:s');
    $status=['registered'=>'مسجّل','waitlist'=>'قائمة الانتظار','cancelled'=>'ملغي'][$r['status']];
    $line=[$r['reference'],$r['name'],$r['mobile'],$r['email'],$r['city'],$r['guardian'],$r['course_title'],$r['cohort_number'],$status,$r['confirmed']?'مؤكد':'غير مؤكد',$r['contacted']?'نعم':'لا',$time,$r['note'],followupLabels()[$r['followup_stage']],$r['followup_due_at']?(new DateTimeImmutable($r['followup_due_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Riyadh'))->format('Y-m-d H:i:s'):'',$r['followup_note']];
    $line=array_map(fn($v)=>preg_match('/^[\s\p{Cf}]*[=+@\-\t\r]/u',(string)$v)?"'".$v:$v,$line);fputcsv($f,$line,',','"','');
   }
   $filters['offset']+=500;if($filters['offset']>=$page['total'])break;$page=registrationList($filters);
  }while($page['items']);
  db()->exec('COMMIT');fclose($f);exit;
 }
 if($action==='backup'){$b=backup(true);if(!$b)fail(503,'تعذّر إنشاء النسخة الاحتياطية الآن.');audit($u['id'],'database.backup','database');header('Content-Type: application/octet-stream');header('Content-Disposition: attachment; filename="'.basename($b).'"');readfile($b);exit;}
 fail(404,'العملية غير موجودة.');
}
function registrationList(array $f): array {
 $where=[];$args=[];$stage=followupStageSql();
 foreach(['course'=>'r.course_slug','cohort'=>'r.cohort_id','student'=>'r.student_id'] as $key=>$column)if(!empty($f[$key])){$where[]="$column=?";$args[]=(string)$f[$key];}
 if(($f['status']??'')==='active')$where[]="r.status!='cancelled'";
 elseif(!empty($f['status'])){$where[]='r.status=?';$args[]=(string)$f['status'];}
 if(isset($f['confirmed'])&&in_array((string)$f['confirmed'],['0','1'],true)){$where[]='r.confirmed=?';$args[]=(int)$f['confirmed'];}
 if(!empty($f['followup_stage'])){$where[]="$stage=?";$args[]=(string)$f['followup_stage'];}
 if(($f['followup_due']??'')==='due'){$where[]="r.status!='cancelled' AND f.due_at<=?";$args[]=now();}
 elseif(($f['followup_due']??'')==='scheduled')$where[]="r.status!='cancelled' AND f.due_at IS NOT NULL";
 if(!empty($f['q'])){$where[]='(s.name LIKE ? OR s.mobile LIKE ? OR r.reference LIKE ? OR EXISTS(SELECT 1 FROM registration_reference_aliases a WHERE a.registration_id=r.id AND a.reference LIKE ?))';$q='%'.substr((string)$f['q'],0,100).'%';$numeric=strtr($q,array_combine(preg_split('//u','٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',-1,PREG_SPLIT_NO_EMPTY),str_split('01234567890123456789')));array_push($args,$q,$numeric,$numeric,$q);}
 $clause=$where?' WHERE '.implode(' AND ',$where):'';$join=' FROM registrations r JOIN students s ON s.id=r.student_id LEFT JOIN cohorts g ON g.id=r.cohort_id LEFT JOIN registration_followups f ON f.registration_id=r.id';
 $total=(int)one('SELECT COUNT(*) n'.$join.$clause,$args)['n'];$limit=min(100000,max(1,(int)($f['limit']??50)));$offset=max(0,(int)($f['offset']??0));
 return ['items'=>rows('SELECT r.*,s.name,s.mobile,s.email,s.city,s.guardian,g.number cohort_number,g.status cohort_status,'. $stage .' followup_stage,f.due_at followup_due_at,COALESCE(f.note,"") followup_note'.$join.$clause.((($f['sort']??'')==='followup')?' ORDER BY f.due_at IS NULL,f.due_at,r.created_at DESC,r.rowid DESC':' ORDER BY r.created_at DESC,r.rowid DESC').' LIMIT ? OFFSET ?',[...$args,$limit,$offset]),'total'=>$total];
}
function handle(): void {
 date_default_timezone_set('Asia/Riyadh');header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store, private');header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header('Referrer-Policy: no-referrer');
 try{
  $origin=$_SERVER['HTTP_ORIGIN']??'';if($origin&&$origin!==config()['origin'])fail(403,'مصدر الطلب غير مسموح.');
  $method=$_SERVER['REQUEST_METHOD']??'GET';if(!in_array($method,['GET','POST'],true))fail(405,'طريقة الطلب غير مسموحة.');
  $action=(string)($_GET['action']??'health');$data=$method==='POST'?requestData():[];
  $result=api($action,$method,$data);
  if($method==='POST'&&!in_array($action,['visit','login','logout','notification_read'],true))maintainSafely();
  echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
 }catch(HttpError $e){http_response_code($e->status);echo json_encode(['error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);}
 catch(Throwable $e){error_log('Tafaseel API error: '.get_class($e));http_response_code(503);echo json_encode(['error'=>'تعذّر إتمام العملية الآن. لم نفترض نجاحها؛ يرجى المحاولة مجددًا.'],JSON_UNESCAPED_UNICODE);}
}
