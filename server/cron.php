<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require __DIR__.'/bootstrap.php';
date_default_timezone_set('Asia/Riyadh');
$lock=fopen(dirname(config()['database']).'/attendance-cron.lock','c');
if(!$lock||!flock($lock,LOCK_EX|LOCK_NB)){fwrite(STDERR,"Attendance worker already running.\n");exit(0);}
try{
 attendanceReady();attendanceQueue();$result=attendanceDispatch();
 run("INSERT INTO settings(key,value) VALUES('attendance_last_cron',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[now()]);
 echo json_encode($result,JSON_UNESCAPED_UNICODE)."\n";
}catch(Throwable $e){error_log('Attendance worker: '.get_class($e));fwrite(STDERR,"Attendance processing failed; inspect server logs.\n");exit(1);}
finally{flock($lock,LOCK_UN);fclose($lock);}
