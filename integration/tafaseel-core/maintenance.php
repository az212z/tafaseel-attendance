<?php
declare(strict_types=1);
const DATA_WARNING_BYTES = 1073741824; // An app-data warning budget, not the hosting account quota.
function backupDirectory(): string {
 $dir=dirname(config()['database']).'/backups';
 if(!is_dir($dir)&&!mkdir($dir,0700,true)&&!is_dir($dir))throw new RuntimeException('Backup directory unavailable');
 return $dir;
}
function maintenanceRead(): array {
 $path=dirname(config()['database']).'/maintenance.json';
 $state=is_file($path)?(json_decode(file_get_contents($path),true)?:[]):[];
 // Retire the discontinued workstation destination; audit history remains intact.
 if(($state['external_destination']??null)==='جهاز Mac الخاص بالمدير'){
  foreach(['external_at','external_snapshot_at','external_destination','external_sha256'] as $key)unset($state[$key]);
 }
 return $state;
}
function maintenanceWrite(array $data): void {
 $path=dirname(config()['database']).'/maintenance.json';$tmp=$path.'.'.bin2hex(random_bytes(5)).'.tmp';
 if(file_put_contents($tmp,json_encode($data,JSON_THROW_ON_ERROR))===false)throw new RuntimeException('Maintenance state unavailable');
 chmod($tmp,0600);if(!rename($tmp,$path))throw new RuntimeException('Maintenance state unavailable');
}
function backupFiles(string $kind): array {
 $files=glob(backupDirectory().'/tafaseel-*.sqlite')?:[];
 $pattern=$kind==='hourly'?'/^tafaseel-\d{4}-\d{2}-\d{2}-\d{2}\.sqlite$/':'/^tafaseel-\d{4}-\d{2}-\d{2}\.sqlite$/';
 $files=array_values(array_filter($files,fn($p)=>!is_link($p)&&preg_match($pattern,basename($p))));rsort($files,SORT_STRING);return $files;
}
function backup(bool $fresh=false,bool $cron=false): ?string {
 $dir=backupDirectory();$lock=fopen($dir.'/.lock','c');
 if(!$lock)return null;
 if(!flock($lock,LOCK_EX|LOCK_NB)){fclose($lock);return null;}
 $temp=null;
 try {
  $state=maintenanceRead();$latest=$state['backup_file']??'';
  if($cron)$state['cron_at']=now();
  if(!$fresh&&$latest&&preg_match('/^tafaseel-[0-9-]+\.sqlite$/',$latest)&&is_file($dir.'/'.$latest)&&time()-filemtime($dir.'/'.$latest)<3600){
   if($cron)maintenanceWrite($state);return $dir.'/'.$latest;
  }
  $dest=$dir.'/tafaseel-'.gmdate('Y-m-d-H').'.sqlite';$temp=$dest.'.tmp';
  if(is_file($temp))unlink($temp);
  $target=new SQLite3($temp);chmod($temp,0600);
  try {if(!db()->backup($target)||$target->querySingle('PRAGMA integrity_check')!=='ok')throw new RuntimeException('Backup integrity failed');}
  finally {$target->close();}
  if(!rename($temp,$dest))throw new RuntimeException('Backup save failed');$temp=null;
  $daily=$dir.'/tafaseel-'.gmdate('Y-m-d').'.sqlite';
  if(!is_file($daily)){
   $temp=$daily.'.tmp';if(!copy($dest,$temp))throw new RuntimeException('Daily backup failed');chmod($temp,0600);
   if(!rename($temp,$daily))throw new RuntimeException('Daily backup save failed');$temp=null;
  }
  // Prune only our dated snapshots, and only after a new verified snapshot exists.
  foreach(['hourly'=>24,'daily'=>30] as $kind=>$keep)foreach(array_slice(backupFiles($kind),$keep) as $old)if(!unlink($old))throw new RuntimeException('Backup retention failed');
  $files=[...backupFiles('hourly'),...backupFiles('daily')];$backupBytes=0;foreach($files as $file)$backupBytes+=filesize($file);
  $databaseBytes=0;foreach(['','-wal','-shm'] as $suffix){$file=config()['database'].$suffix;clearstatcache(true,$file);if(is_file($file))$databaseBytes+=filesize($file);}
  $state=array_merge($state,['backup_file'=>basename($dest),'backup_at'=>now(),'backup_sha256'=>hash_file('sha256',$dest),'backup_count'=>count($files),'backup_bytes'=>$backupBytes,'database_bytes'=>$databaseBytes,'storage_checked_at'=>now(),'error_at'=>null]);
  maintenanceWrite($state);return $dest;
 } catch(Throwable $e) {
  if($temp&&is_file($temp))unlink($temp);
  try{$state=maintenanceRead();$state['error_at']=now();if($cron)$state['cron_at']=now();maintenanceWrite($state);}catch(Throwable){}
  throw $e;
 } finally {flock($lock,LOCK_UN);fclose($lock);}
}
function maintainSafely(bool $cron=false): void {
 try{backup(false,$cron);}catch(Throwable){error_log('Tafaseel maintenance failed; committed data remains available');}
}
function maintenanceAlerts(): array {
 $s=maintenanceRead();$alerts=[];
 if(!empty($s['error_at']))$alerts[]='تعذّر إتمام آخر نسخ احتياطي. راجع صفحة النظام والنسخ.';
 if(empty($s['backup_at'])||strtotime($s['backup_at'].' UTC')<time()-26*3600)$alerts[]='نسخة الاستضافة الاحتياطية غير متوفرة أو تجاوز عمرها يومًا.';
 if(($s['backup_bytes']??0)+($s['database_bytes']??0)>=DATA_WARNING_BYTES*.8)$alerts[]='بيانات النظام والنسخ تجاوزت ٨٠٪ من حد التنبيه (١ غيغابايت).';
 $free=@disk_free_space(dirname(config()['database']));if($free!==false&&$free<104857600)$alerts[]='المساحة الحرة على قرص الخادم أقل من ١٠٠ ميغابايت.';
 if(!empty($s['cron_at'])&&strtotime($s['cron_at'].' UTC')<time()-3*3600)$alerts[]='مهمة النسخ المجدولة لم تعمل منذ أكثر من ثلاث ساعات.';
 if(!empty($s['external_at'])&&strtotime($s['external_at'].' UTC')<time()-48*3600)$alerts[]='لم تُحفظ نسخة خارجية موثّقة منذ أكثر من يومين.';
 return $alerts;
}
function maintenanceStatus(): array {
 $s=maintenanceRead();unset($s['backup_file']);
 return array_merge(['backup_at'=>null,'backup_count'=>0,'backup_bytes'=>0,'database_bytes'=>0,'cron_at'=>null,'external_at'=>null,'external_destination'=>null],$s,['warning_bytes'=>DATA_WARNING_BYTES,'retention_hourly'=>24,'retention_daily'=>30,'alerts'=>maintenanceAlerts()]);
}
