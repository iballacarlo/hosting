<?php

$_SERVER['REQUEST_URI'] = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

require __DIR__ . '/api.php';
