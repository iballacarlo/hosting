<?php

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = realpath(__DIR__ . $path);
$uploadsRoot = realpath(__DIR__ . '/uploads');

if(strpos($path, '/uploads/') === 0 && $file && $uploadsRoot && strpos($file, $uploadsRoot) === 0 && is_file($file)){
  return false;
}

require __DIR__ . '/api.php';
