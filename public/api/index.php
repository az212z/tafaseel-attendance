<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
try {
 $private = getenv('ATTENDANCE_PRIVATE_DIR') ?: dirname(__DIR__, 2).'/attendance-private';
 require $private.'/bootstrap.php';
 attendanceHandle();
} catch (Throwable $e) {
 error_log('Attendance bootstrap: '.get_class($e));
 http_response_code(503);
 echo json_encode(['error'=>'خدمة الحضور غير متصلة بعد. يلزم إعداد الاتصال بقاعدة بيانات المركز.'],JSON_UNESCAPED_UNICODE);
}
