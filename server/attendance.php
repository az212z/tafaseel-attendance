<?php
declare(strict_types=1);

function attendanceReady(): void {
 if (!one("SELECT value FROM settings WHERE key='attendance_schema_v1'")) fail(503,'يلزم تثبيت جداول الحضور بواسطة مسؤول الاستضافة.');
}
function attendanceClock(): string { return now(); }
function attendanceEpoch(string $value): int { return (new DateTimeImmutable($value,new DateTimeZone('UTC')))->getTimestamp(); }
function attendanceTime(mixed $value): string {
 if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|\+03:00)$/D',$value)) fail(422,'أدخل تاريخًا ووقتًا صحيحين بتوقيت الرياض.');
 try { $date=new DateTimeImmutable($value); } catch (Throwable) { fail(422,'التاريخ غير صحيح.'); }
 $errors=DateTimeImmutable::getLastErrors();
 if ($errors && ($errors['warning_count'] || $errors['error_count'])) fail(422,'التاريخ غير صحيح.');
 return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}
function attendanceId(mixed $value): string {
 if (!is_string($value) || !preg_match('/^[a-f0-9]{32}$/D',$value)) fail(422,'السجل غير صحيح.');
 return $value;
}
function attendanceSmsReady(): bool {
 $c=attendanceConfig();
 return ($c['sms_enabled']??false)===true && ($c['sms_provider']??'')==='taqnyat' && !empty($c['sms_token']) && !empty($c['sms_sender']) && !($c['preview']??false) && function_exists('curl_init');
}
function attendanceSystem(): array {
 $c=attendanceConfig();
 return ['preview'=>(bool)($c['preview']??false),'sms_ready'=>attendanceSmsReady(),'sms_provider'=>($c['sms_provider']??'')==='taqnyat'?'تقنيات':'غير محدد',
  'last_cron'=>one("SELECT value FROM settings WHERE key='attendance_last_cron'")['value']??null,
  'clock'=>attendanceClock(),'absence_minutes'=>20,'origin'=>$c['origin']];
}
function attendanceSessions(): array {
 return rows("SELECT a.*,c.title course_title,g.number cohort_number,
  COUNT(r.student_id) total,
  SUM(CASE WHEN r.checked_in IS NOT NULL THEN 1 ELSE 0 END) present,
  SUM(CASE WHEN r.checked_in>=datetime(a.starts_at,'+20 minutes') THEN 1 ELSE 0 END) late,
  SUM(CASE WHEN r.excused=1 THEN 1 ELSE 0 END) excused
  FROM attendance_sessions a JOIN cohorts g ON g.id=a.cohort_id JOIN courses c ON c.slug=g.course_slug
  LEFT JOIN attendance_roster r ON r.session_id=a.id GROUP BY a.id ORDER BY a.starts_at DESC LIMIT 200");
}
function attendanceRoster(string $id): array {
 $s=one('SELECT a.*,c.title course_title,g.number cohort_number FROM attendance_sessions a JOIN cohorts g ON g.id=a.cohort_id JOIN courses c ON c.slug=g.course_slug WHERE a.id=?',[$id]);
 if (!$s) fail(404,'الحصة غير موجودة.');
 $items=rows("SELECT r.*,s.name,s.mobile,s.guardian,g.reference,g.status registration_status,
  COALESCE(p.guardian_mobile,'') guardian_mobile,p.sms_consent_at,p.pin_hash IS NOT NULL has_pin,
  m.status message_status,m.reason message_reason
  FROM attendance_roster r JOIN students s ON s.id=r.student_id JOIN registrations g ON g.id=r.registration_id
  LEFT JOIN attendance_students p ON p.student_id=r.student_id
  LEFT JOIN attendance_messages m ON m.session_id=r.session_id AND m.student_id=r.student_id
  WHERE r.session_id=? ORDER BY s.name",[$id]);
 return ['session'=>$s,'items'=>$items];
}
function attendanceCreate(array $d,array $user): array {
 $title=textInput($d['title']??'',120,'اسم الحصة',true);
 $start=attendanceTime($d['starts_at']??''); $end=attendanceTime($d['ends_at']??'');
 $t=attendanceEpoch($start); $duration=attendanceEpoch($end)-$t;
 if ($duration<21*60 || $duration>12*3600) fail(422,'مدة الحصة يجب أن تكون بين ٢١ دقيقة و١٢ ساعة.');
 if ($t < time()-60 || $t > time()+366*86400) fail(422,'اختر موعدًا قادمًا للحصة خلال سنة.');
 $cohort=(int)($d['cohort_id']??0); $id=uid();
 return transaction(function()use($title,$start,$end,$cohort,$id,$user){
  $g=one("SELECT g.id FROM cohorts g JOIN courses c ON c.slug=g.course_slug WHERE g.id=? AND g.status IN ('collecting','running') AND c.active=1",[$cohort]);
  if (!$g) fail(422,'اختر مجموعة نشطة من دورات المركز.');
  if (one("SELECT id FROM attendance_sessions WHERE cohort_id=? AND status='open' AND starts_at<? AND ends_at>?",[$cohort,$end,$start])) fail(409,'توجد حصة متداخلة لهذه المجموعة.');
  $members=rows("SELECT id,student_id FROM registrations WHERE cohort_id=? AND status='registered'",[$cohort]);
  if (!$members) fail(422,'لا يوجد طلاب مسجلون في هذه المجموعة. أضف الطلاب أولًا.');
  run('INSERT INTO attendance_sessions(id,cohort_id,title,starts_at,ends_at,token,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)',[$id,$cohort,$title,$start,$end,bin2hex(random_bytes(32)),$user['id'],now()]);
  foreach($members as $m) run('INSERT INTO attendance_roster(session_id,student_id,registration_id) VALUES(?,?,?)',[$id,$m['student_id'],$m['id']]);
  audit($user['id'],'attendance.session.created',$id,['cohort'=>$cohort,'students'=>count($members)]);
  return ['id'=>$id];
 });
}
function attendancePin(string $id,array $user): array {
 return transaction(function()use($id,$user){
  if(!one('SELECT id FROM students WHERE id=?',[$id])) fail(404,'الطالب غير موجود.');
  $pin=(string)random_int(10000000,99999999);
  run('INSERT INTO attendance_students(student_id,pin_hash,updated_at) VALUES(?,?,?) ON CONFLICT(student_id) DO UPDATE SET pin_hash=excluded.pin_hash,updated_at=excluded.updated_at',[$id,password_hash($pin,PASSWORD_DEFAULT),now()]);
  audit($user['id'],'attendance.pin.reset',$id);
  return ['pin'=>$pin];
 });
}
function attendanceContact(array $d,array $user): array {
 $id=attendanceId($d['student_id']??''); $phone=empty($d['guardian_mobile'])?'':mobile($d['guardian_mobile']);
 $guardian=textInput($d['guardian']??'',100,'اسم ولي الأمر');
 if ($phone && ($d['consent']??false)!==true) fail(422,'أكد موافقة ولي الأمر على إشعارات الحضور.');
 return transaction(function()use($id,$phone,$guardian,$user){
  if(!one('SELECT id FROM students WHERE id=?',[$id])) fail(404,'الطالب غير موجود.');
  run('UPDATE students SET guardian=? WHERE id=?',[$guardian,$id]);
  run('INSERT INTO attendance_students(student_id,guardian_mobile,sms_consent_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(student_id) DO UPDATE SET guardian_mobile=excluded.guardian_mobile,sms_consent_at=excluded.sms_consent_at,updated_at=excluded.updated_at',[$id,$phone,$phone?now():null,now()]);
  audit($user['id'],'attendance.contact.updated',$id);
  return ['ok'=>true];
 });
}
function attendanceAddStudent(array $d,array $user): array {
 $name=textInput($d['name']??'',100,'اسم الطالب',true);$phone=mobile($d['mobile']??'');
 $guardian=textInput($d['guardian']??'',100,'اسم ولي الأمر');
 $guardianPhone=empty($d['guardian_mobile'])?'':mobile($d['guardian_mobile']);
 if($guardianPhone && ($d['consent']??false)!==true) fail(422,'أكد موافقة ولي الأمر على الإشعارات.');
 $cohort=(int)($d['cohort_id']??0);$id=uid();$pin=(string)random_int(10000000,99999999);
 return transaction(function()use($name,$phone,$guardian,$guardianPhone,$cohort,$id,$pin,$user){
  if(one('SELECT id FROM students WHERE name_key=? AND mobile=?',[nameKey($name),$phone])) fail(409,'هذا الطالب موجود بالفعل. ابحث عنه في قائمة الطلاب.');
  $g=null;
  if($cohort){
   $g=one("SELECT g.*,c.title,c.program_id FROM cohorts g JOIN courses c ON c.slug=g.course_slug WHERE g.id=? AND g.status IN ('collecting','running') AND c.active=1",[$cohort]);
   if(!$g)fail(422,'المجموعة غير متاحة.');
   if($g['program_id']==='children' && mb_strlen($guardian)<2)fail(422,'أدخل اسم ولي الأمر لدورات الأطفال.');
  }
  run('INSERT INTO students(id,name,name_key,mobile,guardian,created_at) VALUES(?,?,?,?,?,?)',[$id,$name,nameKey($name),$phone,$guardian,now()]);
  run('INSERT INTO attendance_students(student_id,guardian_mobile,sms_consent_at,pin_hash,updated_at) VALUES(?,?,?,?,?)',[$id,$guardianPhone,$guardianPhone?now():null,password_hash($pin,PASSWORD_DEFAULT),now()]);
  $reference=null; $status=null;
  if($g){
   $status=cohortCount($cohort)>=$g['capacity']?'waitlist':'registered';
   run('UPDATE registration_sequence SET last_number=last_number+1 WHERE id=1');
   $reference=one('SELECT CAST(last_number AS TEXT) reference FROM registration_sequence WHERE id=1')['reference'];$registration=uid();
   run('INSERT INTO registrations(id,reference,student_id,course_slug,course_title,cohort_id,status,source,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[$registration,$reference,$id,$g['course_slug'],$g['title'],$cohort,$status,'attendance-admin',now(),now()]);
   notification('registration:'.$registration,'registration','تسجيل طالب جديد',$name.' · '.$g['title'],$id,$cohort);notifyFullCohort($cohort);
   // Upcoming rosters can grow; a running session's roster stays fixed.
   if($status==='registered')foreach(rows("SELECT id FROM attendance_sessions WHERE cohort_id=? AND status='open' AND starts_at>?",[$cohort,now()]) as $s)run('INSERT OR IGNORE INTO attendance_roster(session_id,student_id,registration_id) VALUES(?,?,?)',[$s['id'],$id,$registration]);
  }
  audit($user['id'],'attendance.student.created',$id,['reference'=>$reference,'status'=>$status]);
  return ['id'=>$id,'pin'=>$pin,'reference'=>$reference,'status'=>$status];
 });
}
function attendancePublicSession(string $token): array {
 if(!preg_match('/^[a-f0-9]{64}$/D',$token)) fail(404,'رمز الحصة غير صالح.');
 $s=one('SELECT id,title,starts_at,ends_at,status FROM attendance_sessions WHERE token=?',[$token]);
 if(!$s) fail(404,'رمز الحصة غير صالح.');
 return ['session'=>$s,'clock'=>attendanceClock()];
}
function attendanceCheck(array $d): array {
 $token=(string)($d['token']??'');$reference=textInput($d['reference']??'',32,'رقم التسجيل');
 $pin=$d['pin']??''; $mode=$d['mode']??'in';
 if(!is_string($pin)||!preg_match('/^\d{8}$/D',$pin)||!in_array($mode,['in','out'],true))fail(422,'أدخل رقم التسجيل ورمز الطالب المكوّن من ٨ أرقام.');
 rate('attendance:ip:'.ip(),30,900);rate('attendance:ref:'.$reference,40,3600);
 $s=attendancePublicSession($token)['session'];
 if($s['status']!=='open')fail(409,'أُغلق تسجيل الحضور لهذه الحصة.');
 $clock=attendanceEpoch(attendanceClock());$start=attendanceEpoch($s['starts_at']);$end=attendanceEpoch($s['ends_at']);
 if($clock<$start-900 || $clock>$end+1800)fail(409,'الرمز متاح من ١٥ دقيقة قبل الحصة وحتى ٣٠ دقيقة بعد نهايتها.');
 if($mode==='out' && $clock<$end-900)fail(409,'يفتح تسجيل الانصراف قبل نهاية الحصة بـ١٥ دقيقة.');
 $r=one("SELECT r.*,p.pin_hash FROM attendance_roster r JOIN registrations g ON g.id=r.registration_id JOIN attendance_students p ON p.student_id=r.student_id WHERE r.session_id=? AND g.reference=? AND g.status='registered' AND g.cohort_id=?",[$s['id'],$reference,$s['cohort_id']??one('SELECT cohort_id FROM attendance_sessions WHERE id=?',[$s['id']])['cohort_id']]);
 $valid=password_verify($pin,$r['pin_hash']??'$2y$12$YJaOwODctYwAC86vwF8BjOlp6PrHx.WgIWIVvq2vnthNOIr3CeeYe');
 if(!$r||!$valid)fail(401,'تحقق من رقم التسجيل ورمز الطالب لهذه الحصة.');
 return transaction(function()use($r,$s,$mode){
  $current=one('SELECT r.*,a.status FROM attendance_roster r JOIN attendance_sessions a ON a.id=r.session_id JOIN registrations g ON g.id=r.registration_id WHERE r.session_id=? AND r.student_id=? AND g.status=\'registered\' AND g.cohort_id=a.cohort_id',[$s['id'],$r['student_id']]);
  if(!$current||$current['status']!=='open')fail(409,'تغيرت حالة الحصة أو التسجيل. راجع الإدارة.');
  if($current['excused'])fail(409,'يوجد عذر مسجل لهذه الحصة. راجع الإدارة لتعديله.');
  if($mode==='out'&&!$current['checked_in'])fail(409,'سجّل حضورك أولًا قبل تسجيل الانصراف.');
  $column=$mode==='in'?'checked_in':'checked_out';
  $already=(bool)$current[$column];
  if(!$already){
   run("UPDATE attendance_roster SET $column=?,method='student' WHERE session_id=? AND student_id=?",[attendanceClock(),$s['id'],$r['student_id']]);
   if($mode==='in')run("UPDATE attendance_messages SET status='cancelled',reason='attendance_recorded',updated_at=? WHERE session_id=? AND student_id=? AND status IN ('pending','blocked','failed')",[now(),$s['id'],$r['student_id']]);
   audit(null,'attendance.student.'.$mode,$s['id'],['student_id'=>$r['student_id']]);
  }
  return ['ok'=>true,'already'=>$already,'mode'=>$mode,'time'=>$already?$current[$column]:attendanceClock(),'late'=>$mode==='in'&&attendanceEpoch($already?$current[$column]:attendanceClock())>=attendanceEpoch($s['starts_at'])+1200];
 });
}
function attendanceMark(array $d,array $user): array {
 $sid=attendanceId($d['session_id']??'');$student=attendanceId($d['student_id']??'');
 $mode=$d['mode']??'';$note=textInput($d['note']??'',300,'سبب التعديل',true);
 if(!in_array($mode,['in','out','excused'],true))fail(422,'الحالة غير صحيحة.');
 return transaction(function()use($sid,$student,$mode,$note,$user){
  $r=one('SELECT r.*,a.starts_at FROM attendance_roster r JOIN attendance_sessions a ON a.id=r.session_id WHERE r.session_id=? AND r.student_id=?',[$sid,$student]);
  if(!$r)fail(404,'الطالب غير موجود في الحصة.');
  if(attendanceEpoch($r['starts_at'])>time())fail(409,'لم تبدأ الحصة بعد.');
  if($mode==='out'&&!$r['checked_in'])fail(409,'سجّل حضور الطالب أولًا.');
  if($mode==='excused'&&$r['checked_in'])fail(409,'الطالب مسجل حاضرًا بالفعل.');
  if($mode==='excused')run('UPDATE attendance_roster SET excused=1,method=\'admin\',note=? WHERE session_id=? AND student_id=?',[$note,$sid,$student]);
  else { $column=$mode==='in'?'checked_in':'checked_out';run("UPDATE attendance_roster SET $column=COALESCE($column,?),excused=0,method='admin',note=? WHERE session_id=? AND student_id=?",[now(),$note,$sid,$student]); }
  run("UPDATE attendance_messages SET status='cancelled',reason='admin_updated',updated_at=? WHERE session_id=? AND student_id=? AND status IN ('pending','blocked','failed')",[now(),$sid,$student]);
  audit($user['id'],'attendance.manual.'.$mode,$sid,['student_id'=>$student,'reason'=>$note]);
  return ['ok'=>true];
 });
}
function attendanceEligible(array $r,string $clock): bool {
 return $r['session_status']==='open' && !$r['checked_in'] && !$r['excused'] && $r['registration_status']==='registered'
  && (int)$r['current_cohort']===(int)$r['session_cohort'] && attendanceEpoch($clock)>=attendanceEpoch($r['starts_at'])+1200
  && attendanceEpoch($clock)<=attendanceEpoch($r['ends_at']);
}
function attendanceCandidates(?string $message=null): array {
 $sql="SELECT a.id session_id,a.title,a.starts_at,a.ends_at,a.cohort_id session_cohort,a.status session_status,r.student_id,r.checked_in,r.excused,
  g.status registration_status,g.cohort_id current_cohort,s.name,p.guardian_mobile,p.sms_consent_at
  FROM attendance_sessions a JOIN attendance_roster r ON r.session_id=a.id JOIN registrations g ON g.id=r.registration_id JOIN students s ON s.id=r.student_id
  LEFT JOIN attendance_students p ON p.student_id=r.student_id";
 if($message!==null)return rows($sql.' JOIN attendance_messages m ON m.session_id=r.session_id AND m.student_id=r.student_id WHERE m.id=?',[$message]);
 return rows($sql." WHERE a.status='open' AND a.starts_at<=?",[gmdate('Y-m-d H:i:s',attendanceEpoch(attendanceClock())-1200)]);
}
function attendanceQueue(): void {
 transaction(function(){
  $clock=attendanceClock();
  foreach(attendanceCandidates() as $r){
   if(!attendanceEligible($r,$clock))continue;
   $reason=empty($r['guardian_mobile'])?'missing_guardian':(empty($r['sms_consent_at'])?'missing_consent':(!attendanceSmsReady()?'sms_disabled':''));
   $state=$reason?'blocked':'pending';
   run("INSERT INTO attendance_messages(id,session_id,student_id,status,reason,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(session_id,student_id) DO UPDATE SET status=excluded.status,reason=excluded.reason,updated_at=excluded.updated_at WHERE attendance_messages.status IN ('blocked','pending')",[uid(),$r['session_id'],$r['student_id'],$state,$reason,$clock,$clock]);
  }
  foreach(rows("SELECT m.id FROM attendance_messages m WHERE m.status IN ('pending','blocked')") as $m){
   $r=attendanceCandidates($m['id'])[0]??null;
   if(!$r||!attendanceEligible($r,$clock))run("UPDATE attendance_messages SET status=?,reason='no_longer_eligible',updated_at=? WHERE id=?",[$r&&attendanceEpoch($clock)>attendanceEpoch($r['ends_at'])?'expired':'cancelled',$clock,$m['id']]);
  }
  run("UPDATE attendance_messages SET status='unknown',reason='worker_interrupted',updated_at=? WHERE status='sending' AND updated_at<?",[$clock,gmdate('Y-m-d H:i:s',attendanceEpoch($clock)-300)]);
 });
}
function attendancePayload(string $recipient,string $body): array {
 return ['recipients'=>[ltrim($recipient,'+')],'body'=>$body,'sender'=>attendanceConfig()['sms_sender']??''];
}
function attendanceInterpret(int $http,string|false $raw,int $curlError): array {
 if($curlError || $raw===false)return ['status'=>'unknown','reason'=>'connection_uncertain','provider_id'=>null];
 $data=json_decode($raw,true);
 if($http===201 && is_array($data) && ($data['statusCode']??0)===201 && !empty($data['messageId']) && (int)($data['totalCount']??0)===1){
  $rejected=$data['rejected']??[];if(is_string($rejected))$rejected=json_decode($rejected,true);
  if(is_array($rejected)&&count($rejected)===0)return ['status'=>'submitted','reason'=>'','provider_id'=>(string)$data['messageId']];
 }
 if($http>=400 && $http<500)return ['status'=>'failed','reason'=>'provider_rejected','provider_id'=>null];
 return ['status'=>'unknown','reason'=>'provider_response_uncertain','provider_id'=>null];
}
function attendanceDispatch(): array {
 $counts=['submitted'=>0,'failed'=>0,'unknown'=>0];
 if(!attendanceSmsReady())return $counts;
 foreach(rows("SELECT id FROM attendance_messages WHERE status='pending' ORDER BY created_at LIMIT 100") as $item){
  $job=transaction(function()use($item){
   $m=one("SELECT * FROM attendance_messages WHERE id=? AND status='pending'",[$item['id']]);if(!$m)return null;
   $r=attendanceCandidates($m['id'])[0]??null;$clock=attendanceClock();
   if(!$r||!attendanceEligible($r,$clock)) {run("UPDATE attendance_messages SET status='cancelled',reason='no_longer_eligible',updated_at=? WHERE id=?",[$clock,$m['id']]);return null;}
   if(empty($r['guardian_mobile'])||empty($r['sms_consent_at'])) {run("UPDATE attendance_messages SET status='blocked',reason='missing_guardian',updated_at=? WHERE id=?",[$clock,$m['id']]);return null;}
   $date=(new DateTimeImmutable($r['starts_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Riyadh'))->format('Y/m/d H:i');
   $cutoff=(new DateTimeImmutable($clock,new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Riyadh'))->format('H:i');
   $body='مركز تفاصيل للتدريب: لم يسجل الطالب '.$r['name'].' حضوره لحصة «'.$r['title'].'» بتاريخ '.$date.'، حتى الساعة '.$cutoff.'، بعد مرور ٢٠ دقيقة على بداية الحصة.';
   run("UPDATE attendance_messages SET status='sending',recipient=?,body=?,attempts=attempts+1,updated_at=? WHERE id=? AND status='pending'",[$r['guardian_mobile'],$body,$clock,$m['id']]);
   return ['id'=>$m['id'],'recipient'=>$r['guardian_mobile'],'body'=>$body];
  });
  if(!$job)continue;
  $c=attendanceConfig();$ch=curl_init('https://api.taqnyat.sa/v1/messages');
  curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode(attendancePayload($job['recipient'],$job['body']),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),CURLOPT_HTTPHEADER=>['Content-Type: application/json; charset=utf-8','Authorization: Bearer '.$c['sms_token']],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>15,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS]);
  $raw=curl_exec($ch);$result=attendanceInterpret((int)curl_getinfo($ch,CURLINFO_HTTP_CODE),$raw,curl_errno($ch));
  run('UPDATE attendance_messages SET status=?,reason=?,provider_id=?,updated_at=? WHERE id=?',[$result['status'],$result['reason'],$result['provider_id'],now(),$job['id']]);
  $counts[$result['status']]++;
 }
 return $counts;
}
function attendanceApi(string $action,string $method,array $d): array {
 $gets=['session','overview','courses','students','roster','messages','system','public_session'];
 if($method!==(in_array($action,$gets,true)?'GET':'POST'))fail(405,'طريقة الطلب غير مسموحة.');
 attendanceReady();
 if($action==='session')return [...api('session','GET',[]),'system'=>attendanceSystem()];
 if($action==='public_session')return attendancePublicSession((string)($_GET['token']??''));
 csrf();
 if($action==='check')return attendanceCheck($d);
 if($action==='login')return api('login','POST',$d);
 if($action==='demo_login'){
  if(!(attendanceConfig()['preview']??false)||!config()['local']||!in_array(ip(),['127.0.0.1','::1'],true))fail(404,'العملية غير موجودة.');
  return api('login','POST',['username'=>'admin','password'=>attendanceConfig()['demo_password']]);
 }
 $u=authorize();
 if($action==='logout')return api('logout','POST',[]);
 if($action==='system')return attendanceSystem();
 if($action==='overview')return ['sessions'=>attendanceSessions(),'students'=>(int)one('SELECT COUNT(*) n FROM students')['n'],'courses'=>(int)one('SELECT COUNT(*) n FROM courses WHERE active=1')['n'],'system'=>attendanceSystem()];
 if($action==='courses')return ['items'=>rows("SELECT g.id,g.number,g.status,g.course_slug,c.title,c.program_id,COUNT(r.id) students FROM cohorts g JOIN courses c ON c.slug=g.course_slug LEFT JOIN registrations r ON r.cohort_id=g.id AND r.status='registered' WHERE g.status IN ('collecting','running') AND c.active=1 GROUP BY g.id ORDER BY c.sort_order,g.number DESC")];
 if($action==='students'){
  $q=substr((string)($_GET['q']??''),0,100);$pattern='%'.$q.'%';$offset=max(0,(int)($_GET['offset']??0));
  $where='s.name LIKE ? OR s.mobile LIKE ? OR s.guardian LIKE ?';$args=[$pattern,$pattern,$pattern];
  return ['items'=>rows("SELECT s.id,s.name,s.mobile,s.guardian,COALESCE(p.guardian_mobile,'') guardian_mobile,p.sms_consent_at,p.pin_hash IS NOT NULL has_pin,
   (SELECT GROUP_CONCAT(reference, '، ') FROM registrations g WHERE g.student_id=s.id AND g.status='registered') refs,
   (SELECT COUNT(*) FROM registrations g WHERE g.student_id=s.id AND g.status='registered') registrations
   FROM students s LEFT JOIN attendance_students p ON p.student_id=s.id WHERE $where ORDER BY s.created_at DESC,s.rowid DESC LIMIT 50 OFFSET ?",[...$args,$offset]),'total'=>(int)one("SELECT COUNT(*) n FROM students s WHERE $where",$args)['n']];
 }
 if($action==='roster')return attendanceRoster(attendanceId($_GET['id']??''));
 if($action==='messages')return ['items'=>rows('SELECT m.id,m.status,m.reason,m.provider_id,m.attempts,m.created_at,m.updated_at,s.name,a.title,m.body,m.recipient FROM attendance_messages m JOIN students s ON s.id=m.student_id JOIN attendance_sessions a ON a.id=m.session_id ORDER BY m.created_at DESC LIMIT 200'),'system'=>attendanceSystem()];
 if($action==='create_session')return attendanceCreate($d,$u);
 if($action==='add_student')return attendanceAddStudent($d,$u);
 if($action==='contact')return attendanceContact($d,$u);
 if($action==='reset_pin')return attendancePin(attendanceId($d['student_id']??''),$u);
 if($action==='mark')return attendanceMark($d,$u);
 if($action==='sync_roster')return transaction(function()use($d,$u){
  $id=attendanceId($d['session_id']??'');$s=one('SELECT * FROM attendance_sessions WHERE id=?',[$id]);
  if(!$s||$s['status']!=='open'||attendanceEpoch($s['starts_at'])<=time())fail(409,'يمكن تحديث القائمة قبل بداية الحصة فقط.');
  run("DELETE FROM attendance_roster WHERE session_id=? AND registration_id NOT IN (SELECT id FROM registrations WHERE cohort_id=? AND status='registered')",[$id,$s['cohort_id']]);
  run("INSERT OR IGNORE INTO attendance_roster(session_id,student_id,registration_id) SELECT ?,student_id,id FROM registrations WHERE cohort_id=? AND status='registered'",[$id,$s['cohort_id']]);
  audit($u['id'],'attendance.roster.synced',$id);return ['ok'=>true];
 });
 if($action==='close_session')return transaction(function()use($d,$u){
  $id=attendanceId($d['session_id']??'');if(!one('SELECT id FROM attendance_sessions WHERE id=?',[$id]))fail(404,'الحصة غير موجودة.');
  run("UPDATE attendance_sessions SET status='closed' WHERE id=?",[$id]);
  run("UPDATE attendance_messages SET status='cancelled',reason='session_closed',updated_at=? WHERE session_id=? AND status IN ('pending','blocked','failed')",[now(),$id]);
  audit($u['id'],'attendance.session.closed',$id);return ['ok'=>true];
 });
 fail(404,'العملية غير موجودة.');
}
function attendanceHandle(): void {
 date_default_timezone_set('Asia/Riyadh');
 try{
  $origin=$_SERVER['HTTP_ORIGIN']??'';
  if($origin && $origin!==attendanceConfig()['origin'])fail(403,'مصدر الطلب غير مسموح.');
  $method=$_SERVER['REQUEST_METHOD']??'GET';if(!in_array($method,['GET','POST'],true))fail(405,'طريقة الطلب غير مسموحة.');
  $action=(string)($_GET['action']??'session');$d=$method==='POST'?requestData():[];
  $result=attendanceApi($action,$method,$d);
  if($method==='POST'&&!in_array($action,['login','logout','demo_login'],true))maintainSafely();
  echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
 }catch(HttpError $e){http_response_code($e->status);echo json_encode(['error'=>$e->getMessage()],JSON_UNESCAPED_UNICODE);}
 catch(Throwable $e){error_log('Attendance API: '.get_class($e));http_response_code(503);echo json_encode(['error'=>'تعذّر حفظ العملية. حدّث البيانات للتحقق ثم حاول مجددًا.'],JSON_UNESCAPED_UNICODE);}
}
