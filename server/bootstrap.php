<?php
declare(strict_types=1);
function attendanceConfig(): array {
 static $config;
 if ($config !== null) return $config;
 $path = getenv('ATTENDANCE_CONFIG_PATH') ?: __DIR__.'/config.php';
 if (!is_file($path)) throw new RuntimeException('Attendance configuration missing');
 $config = require $path;
 if (!is_array($config) || !is_file(($config['legacy_dir'] ?? '').'/app.php')) throw new RuntimeException('Shared application path missing');
 return $config;
}
$attendanceConfig = attendanceConfig();
require_once $attendanceConfig['legacy_dir'].'/app.php';
require_once __DIR__.'/attendance.php';
