<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__.'/bootstrap.php';
try {
 db();
 if (!backup(true)) throw new RuntimeException('A verified backup is required before migration');
 transaction(function() {
  db()->exec(file_get_contents(__DIR__.'/schema.sql'));
  run("INSERT INTO settings(key,value) VALUES('attendance_schema_v1',?) ON CONFLICT(key) DO NOTHING",[now()]);
 });
 echo "Attendance schema installed; existing courses, students, and registrations preserved.\n";
} catch (Throwable $e) { fwrite(STDERR,"Migration failed: ".$e->getMessage()."\n"); exit(1); }
