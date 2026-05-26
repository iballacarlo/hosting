<?php
return [
  'db_host' => getenv('MYSQLHOST') ?: '127.0.0.1',     
  'db_name' => getenv('MYSQLDATABASE') ?: 'barangay_db',   
  'db_user' => getenv('MYSQLUSER') ?: 'root',          
  'db_pass' => getenv('MYSQLPASSWORD') ?: '',              
  'db_port' => getenv('MYSQLPORT') ?: '3306',

  'smtp_host' => getenv('SMTP_HOST') ?: 'smtp.gmail.com',
  'smtp_port' => getenv('SMTP_PORT') ?: '465',
  'smtp_secure' => getenv('SMTP_SECURE') ?: 'ssl',
  'smtp_user' => getenv('SMTP_USER') ?: 'brgy.mambog.ii@gmail.com',
  'smtp_pass' => getenv('SMTP_PASS') ?: '',
  'smtp_from' => getenv('SMTP_FROM') ?: 'brgy.mambog.ii@gmail.com',
  'smtp_from_name' => getenv('SMTP_FROM_NAME') ?: 'Barangay Mambog II',
];
