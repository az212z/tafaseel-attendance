<?php
declare(strict_types=1);
require $argv[1].'/server/bootstrap.php';
function checkDomain(bool $condition,string $message): void {if(!$condition)throw new RuntimeException($message);}
$candidate=['session_status'=>'open','checked_in'=>null,'excused'=>0,'registration_status'=>'registered','current_cohort'=>1,'session_cohort'=>1,'starts_at'=>'2026-11-16 10:00:00','ends_at'=>'2026-11-16 12:00:00'];
checkDomain(!attendanceEligible($candidate,'2026-11-16 10:19:59'),'Must wait the full 20 minutes');
checkDomain(attendanceEligible($candidate,'2026-11-16 10:20:00'),'Exact deadline must be eligible');
checkDomain(!attendanceEligible($candidate,'2026-11-16 12:00:01'),'No stale messages after class');
$candidate['current_cohort']=2;checkDomain(!attendanceEligible($candidate,'2026-11-16 10:20:00'),'Moved registration must not receive an absence alert');
$success=attendanceInterpret(201,json_encode(['statusCode'=>201,'messageId'=>123,'totalCount'=>1,'rejected'=>'[]']),0);
checkDomain($success['status']==='submitted'&&$success['provider_id']==='123','Provider acceptance, not delivery');
checkDomain(attendanceInterpret(401,'{"statusCode":401}',0)['status']==='failed','Rejected credentials');
checkDomain(attendanceInterpret(500,'{}',0)['status']==='unknown','Server error may be uncertain');
checkDomain(attendanceInterpret(201,'not json',0)['status']==='unknown','Malformed response cannot prove acceptance');
checkDomain(attendanceInterpret(201,'{}',28)['status']==='unknown','Timeout cannot be retried automatically');
checkDomain(attendanceInterpret(201,json_encode(['statusCode'=>201,'messageId'=>123,'totalCount'=>1,'rejected'=>'[966500000000]']),0)['status']==='unknown','Rejected recipient is not accepted');
checkDomain(attendancePayload('+966500000000','نص اختبار')['recipients']===['966500000000'],'Correct international recipient format');
checkDomain(!attendanceSmsReady(),'Synthetic preview must never send SMS');
echo "Domain checks passed\n";
