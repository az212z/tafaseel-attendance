<?php
declare(strict_types=1);
function followupLabels(): array { return ['new'=>'جديد','contacted'=>'تم التواصل','awaiting'=>'بانتظار التأكيد','confirmed'=>'مؤكد','declined'=>'اعتذر']; }
function followupStageSql(): string { return "COALESCE(f.stage,CASE WHEN r.confirmed=1 THEN 'confirmed' WHEN r.contacted=1 THEN 'contacted' ELSE 'new' END)"; }
function followupDueCount(): int { return (int)one("SELECT COUNT(*) n FROM registration_followups f JOIN registrations r ON r.id=f.registration_id WHERE r.status!='cancelled' AND f.due_at<=?",[now()])['n']; }
function followupSummary(): array {
 $stage=followupStageSql();
 return ['due'=>followupDueCount(),'stages'=>rows("SELECT $stage stage,COUNT(*) total FROM registrations r LEFT JOIN registration_followups f ON f.registration_id=r.id WHERE r.status!='cancelled' OR f.stage='declined' GROUP BY $stage")];
}
function syncFollowupConfirmation(string $id,int $confirmed): void {
 run("INSERT INTO registration_followups(registration_id,stage,updated_at) VALUES(?,?,?) ON CONFLICT(registration_id) DO UPDATE SET stage=excluded.stage,due_at=CASE WHEN excluded.stage='confirmed' THEN NULL ELSE due_at END,updated_at=excluded.updated_at",[$id,$confirmed?'confirmed':'awaiting',now()]);
}
function cancelRegistration(array $r,string $actor): void {
 if($r['status']==='cancelled')return;
 run("UPDATE registrations SET status='cancelled' WHERE id=?",[$r['id']]);
 run('UPDATE registration_followups SET due_at=NULL,updated_at=? WHERE registration_id=?',[now(),$r['id']]);
 audit($actor,'registration.cancelled',$r['reference']);
 $g=one('SELECT status FROM cohorts WHERE id=?',[$r['cohort_id']]);
 if($r['status']==='registered'&&$g&&$g['status']==='collecting'){
  $w=one("SELECT id,reference FROM registrations WHERE cohort_id=? AND status='waitlist' ORDER BY created_at,rowid LIMIT 1",[$r['cohort_id']]);
  if($w){run("UPDATE registrations SET status='registered' WHERE id=?",[$w['id']]);audit($actor,'registration.promoted',$w['reference']);notifyFullCohort((int)$r['cohort_id']);}
 }
}
function saveFollowup(array $d,array $u): array {
 $id=textInput($d['id']??'',40,'الطلب',true);$stage=$d['stage']??'';
 if(!is_string($stage)||!isset(followupLabels()[$stage]))fail(422,'اختر حالة متابعة صحيحة.');
 $note=textInput($d['note']??'',1000,'ملاحظة المتابعة');$due=$d['due_at']??null;
 if($due!==null){
  if(!is_string($due))fail(422,'حدد موعد متابعة صحيحًا.');
  $parsed=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s\Z',$due,new DateTimeZone('UTC'));
  if(!$parsed||$parsed->format('Y-m-d\TH:i:s\Z')!==$due||$parsed->getTimestamp()>time()+5*366*86400||$parsed->getTimestamp()<time()-60)fail(422,'اختر موعدًا قادمًا خلال خمس سنوات.');
  $due=$parsed->format('Y-m-d H:i:s');
 }
 if(in_array($stage,['confirmed','declined'],true)&&$due!==null)fail(422,'أزل موعد المتابعة عند التأكيد أو الاعتذار.');
 if($stage==='declined'&&($d['confirm_cancel']??false)!==true)fail(422,'أكد إلغاء المقعد عند الاعتذار.');
 return transaction(function()use($id,$stage,$note,$due,$u){
  $r=one('SELECT * FROM registrations WHERE id=?',[$id]);if(!$r)fail(404,'الطلب غير موجود.');
  if($r['status']==='cancelled')fail(409,'التسجيل ملغي؛ أضف تسجيلًا جديدًا إذا رغب الطالب بالعودة.');
  $old=one('SELECT * FROM registration_followups WHERE registration_id=?',[$id]);
  run("INSERT INTO registration_followups(registration_id,stage,due_at,note,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(registration_id) DO UPDATE SET stage=excluded.stage,due_at=excluded.due_at,note=excluded.note,updated_at=excluded.updated_at",[$id,$stage,$due,$note,now()]);
  run('UPDATE registrations SET confirmed=?,contacted=? WHERE id=?',[$stage==='confirmed'?1:0,$stage==='new'?0:1,$id]);
  if($stage==='declined')cancelRegistration($r,$u['id']);
  audit($u['id'],'registration.followup',$r['reference'],['from'=>$old['stage']??($r['confirmed']?'confirmed':($r['contacted']?'contacted':'new')),'stage'=>$stage,'due_at'=>$due,'note'=>$note]);
  return ['ok'=>true];
 });
}
