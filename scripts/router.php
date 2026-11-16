<?php
$path=parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path,'/api')) { require $_SERVER['DOCUMENT_ROOT'].'/api/index.php'; return true; }
if (is_file($_SERVER['DOCUMENT_ROOT'].$path)) return false;
if (is_file($_SERVER['DOCUMENT_ROOT'].'/index.html')) { readfile($_SERVER['DOCUMENT_ROOT'].'/index.html'); return true; }
http_response_code(404);
