<?php
// 1. Payagan ang iyong Vercel layout na makipag-usap dito sa backend mo nang walang CORS error
header("Access-Control-Allow-Origin: https://brgymambogdos.vercel.app");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Credentials: true");

// Pag-handle sa mga OPTIONS requests ng browser
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}

$cfg = require __DIR__ . '/config.php';

try {
    $dsn = "mysql:host=".$cfg['db_host'].";dbname=".$cfg['db_name'].";charset=utf8mb4";
    $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success'=>false,'message'=>'Database connection failed: '.$e->getMessage()]);
    exit;
}

function json($data){
  header('Content-Type: application/json');
  echo json_encode($data);
  exit;
}
