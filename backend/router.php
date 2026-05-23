<?php

$path = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);

// Always route requests to api.php
$_SERVER['REQUEST_URI'] = $path;

require __DIR__ . '/api.php';
