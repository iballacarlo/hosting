<?php

$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

$file = __DIR__ . $path;

if ($path !== '/' && file_exists($file)) {
    return false;
}

require __DIR__ . '/api.php';
