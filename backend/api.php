<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

// CORS
header("Access-Control-Allow-Origin: https://brgymambogdos.vercel.app");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Credentials: true");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require __DIR__ . '/db.php';

const RESET_OTP_TTL_SECONDS = 900;
const RESET_OTP_RESEND_SECONDS = 30;

// REQUEST INFO
$method = $_SERVER['REQUEST_METHOD'];

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

error_log("URI => " . $uri);

// remove trailing slash
$uri = rtrim($uri, '/');

if ($uri === '') {
    $uri = '/';
}

// DEBUG
error_log("REQUEST METHOD: " . $method);
error_log("REQUEST URI: " . $uri);

// Also handle legacy /barangay_api/api.php or /api.php paths for backwards compatibility
if (strpos($uri, '/barangay_api/api.php') === 0 || strpos($uri, '/barangay-api/api.php') === 0 || strpos($uri, '/api.php') === 0) {
    $uri = preg_replace('#^/(?:[^/]+)(?:/api\.php)?#', '', $uri);
    if ($uri === '') {
        $uri = '/';
    }
}

function getBearerToken(){
  $h = getallheaders();
  if(!empty($h['Authorization'])){
    if(preg_match('/Bearer\s+(.*)$/i', $h['Authorization'], $m)) return $m[1];
  }
  return null;
}

function tableExists($pdo, $table){
  static $cache = [];
  if(isset($cache[$table])) return $cache[$table];
  try {
    $pdo->query("SELECT 1 FROM `{$table}` LIMIT 1");
    $cache[$table] = true;
  } catch (PDOException $e) {
    $cache[$table] = false;
  }
  return $cache[$table];
}

function ensurePasswordResetTable($pdo){
  static $ready = false;
  if($ready) return;

  $pdo->exec('CREATE TABLE IF NOT EXISTS Password_Reset (
    reset_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    user_role VARCHAR(20) NOT NULL,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    last_sent_at DATETIME NOT NULL,
    used_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_password_reset_user (user_id, user_role),
    INDEX idx_password_reset_email (email),
    INDEX idx_password_reset_expires_at (expires_at)
  )');

  $ready = true;
}

function getPasswordReset($pdo, $user){
  ensurePasswordResetTable($pdo);
  $stmt = $pdo->prepare('SELECT * FROM Password_Reset WHERE user_id = ? AND user_role = ? LIMIT 1');
  $stmt->execute([$user['id'], $user['role']]);
  return $stmt->fetch();
}

function upsertPasswordResetOtp($pdo, $user, $code){
  ensurePasswordResetTable($pdo);
  $hash = password_hash($code, PASSWORD_BCRYPT);
  $stmt = $pdo->prepare('INSERT INTO Password_Reset (user_id, user_role, email, otp_hash, expires_at, last_sent_at)
    VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NOW())
    ON DUPLICATE KEY UPDATE
      email = VALUES(email),
      otp_hash = VALUES(otp_hash),
      expires_at = VALUES(expires_at),
      last_sent_at = VALUES(last_sent_at),
      used_at = NULL');
  $stmt->execute([$user['id'], $user['role'], $user['email'], $hash]);
}

function deletePasswordResetOtp($pdo, $user){
  ensurePasswordResetTable($pdo);
  $stmt = $pdo->prepare('DELETE FROM Password_Reset WHERE user_id = ? AND user_role = ?');
  $stmt->execute([$user['id'], $user['role']]);
}

function secondsUntilOtpCanResend($reset){
  if(!$reset || empty($reset['last_sent_at'])) return 0;
  $lastSent = strtotime($reset['last_sent_at']);
  if(!$lastSent) return 0;
  $elapsed = time() - $lastSent;
  return max(0, RESET_OTP_RESEND_SECONDS - $elapsed);
}

function sendSmtpCommand($socket, $command, $expectCodes){
  if($command !== null){
    fwrite($socket, $command . "\r\n");
  }

  $response = '';
  while(($line = fgets($socket, 515)) !== false){
    $response .= $line;
    if(strlen($line) >= 4 && $line[3] === ' ') break;
  }

  $code = substr($response, 0, 3);
  if(!in_array($code, $expectCodes, true)){
    throw new Exception('SMTP error: ' . trim($response));
  }

  return $response;
}

function sendOtpEmail($toEmail, $code){
  $smtpHost = getenv('SMTP_HOST') ?: 'smtp.gmail.com';
  $smtpPort = intval(getenv('SMTP_PORT') ?: 587);
  $smtpUser = getenv('SMTP_USER') ?: 'brgy.mambog.ii@gmail.com';
  $smtpPass = getenv('SMTP_PASS') ?: '';
  $fromEmail = getenv('SMTP_FROM') ?: $smtpUser;
  $fromName = getenv('SMTP_FROM_NAME') ?: 'Barangay Mambog II';

  if(!$smtpPass){
    throw new Exception('SMTP_PASS is not configured');
  }

  $socket = fsockopen($smtpHost, $smtpPort, $errno, $errstr, 20);
  if(!$socket){
    throw new Exception('Unable to connect to SMTP server: ' . $errstr);
  }

  stream_set_timeout($socket, 20);

  try {
    sendSmtpCommand($socket, null, ['220']);
    sendSmtpCommand($socket, 'EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'), ['250']);
    sendSmtpCommand($socket, 'STARTTLS', ['220']);

    if(!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)){
      throw new Exception('Unable to start SMTP TLS');
    }

    sendSmtpCommand($socket, 'EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'), ['250']);
    sendSmtpCommand($socket, 'AUTH LOGIN', ['334']);
    sendSmtpCommand($socket, base64_encode($smtpUser), ['334']);
    sendSmtpCommand($socket, base64_encode($smtpPass), ['235']);
    sendSmtpCommand($socket, 'MAIL FROM:<' . $fromEmail . '>', ['250']);
    sendSmtpCommand($socket, 'RCPT TO:<' . $toEmail . '>', ['250', '251']);
    sendSmtpCommand($socket, 'DATA', ['354']);

    $subject = 'Your Barangay Mambog II password reset OTP';
    $body = "Hello,\r\n\r\nYour password reset OTP is: {$code}\r\n\r\nThis code expires in 15 minutes. If you did not request this, you can ignore this email.\r\n\r\nBarangay Mambog II";
    $headers = [
      'From: ' . $fromName . ' <' . $fromEmail . '>',
      'To: <' . $toEmail . '>',
      'Subject: ' . $subject,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8'
    ];
    $message = implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.";

    sendSmtpCommand($socket, $message, ['250']);
    sendSmtpCommand($socket, 'QUIT', ['221']);
  } finally {
    fclose($socket);
  }
}

function findUserByToken($pdo, $token){
  if(!$token) return null;
  // check residents
  if(tableExists($pdo, 'Resident')){
    $stmt = $pdo->prepare('SELECT resident_id as id, first_name, last_name, email, "resident" as role FROM Resident WHERE api_token = ?');
    $stmt->execute([$token]);
    $r = $stmt->fetch();
    if($r) return $r;
  }
  // check staff
  if(tableExists($pdo, 'Staff')){
    $stmt = $pdo->prepare('SELECT staff_id as id, full_name as first_name, email, "staff" as role FROM Staff WHERE api_token = ?');
    $stmt->execute([$token]);
    $s = $stmt->fetch();
    if($s) return $s;
  }
  return null;
}

function findUserByEmail($pdo, $email){
  if(!$email) return null;
  if(tableExists($pdo, 'Resident')){
    $stmt = $pdo->prepare('SELECT resident_id AS id, first_name, last_name, email, password, api_token, "resident" AS role FROM Resident WHERE email = ?');
    $stmt->execute([$email]);
    $r = $stmt->fetch();
    if($r) return $r;
  }
  if(tableExists($pdo, 'Staff')){
    $stmt = $pdo->prepare('SELECT staff_id AS id, full_name AS first_name, email, password, api_token, "staff" AS role FROM Staff WHERE email = ?');
    $stmt->execute([$email]);
    return $stmt->fetch();
  }
  return null;
}

function updateUserApiToken($pdo, $role, $id, $token){
  if($role === 'staff'){
    if(tableExists($pdo, 'Staff')){
      $pdo->prepare('UPDATE Staff SET api_token = ? WHERE staff_id = ?')->execute([$token, $id]);
    }
  } else {
    if(tableExists($pdo, 'Resident')){
      $pdo->prepare('UPDATE Resident SET api_token = ? WHERE resident_id = ?')->execute([$token, $id]);
    }
  }
}

function updateUserPassword($pdo, $role, $id, $hash){
  if($role === 'staff'){
    if(tableExists($pdo, 'Staff')){
      $pdo->prepare('UPDATE Staff SET password = ?, api_token = NULL WHERE staff_id = ?')->execute([$hash, $id]);
    }
  } else {
    if(tableExists($pdo, 'Resident')){
      $pdo->prepare('UPDATE Resident SET password = ?, api_token = NULL WHERE resident_id = ?')->execute([$hash, $id]);
    }
  }
}

function restoreTestAccounts($pdo){
  if(!tableExists($pdo, 'Resident')){
    return;
  }

  if(tableExists($pdo, 'Staff')){
    $adminEmail = 'admin@gmail.com';
    $adminPass = '123';
    $stmt = $pdo->prepare('SELECT staff_id FROM Staff WHERE email = ?');
    $stmt->execute([$adminEmail]);
    $admin = $stmt->fetch();
    $adminHash = password_hash($adminPass, PASSWORD_BCRYPT);
    if($admin){
      $pdo->prepare('UPDATE Staff SET full_name = ?, role = ?, password = ?, account_status = ?, suspension_end_date = NULL WHERE staff_id = ?')
        ->execute(['Admin', 'Admin', $adminHash, 'Active', $admin['staff_id']]);
    } else {
      $pdo->prepare('INSERT INTO Staff (full_name, role, email, password, account_status) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute(['Admin', 'Admin', $adminEmail, $adminHash, 'Active']);
    }
  }

  $resEmail = 'carlo@gmail.com';
  $resPass = '123';
  $stmt = $pdo->prepare('SELECT resident_id FROM Resident WHERE email = ?');
  $stmt->execute([$resEmail]);
  $resident = $stmt->fetch();
  $residentHash = password_hash($resPass, PASSWORD_BCRYPT);
  if($resident){
    $pdo->prepare('UPDATE Resident SET first_name = ?, last_name = ?, birth_date = ?, gender = ?, address = ?, password = ?, account_status = ?, suspension_end_date = NULL WHERE resident_id = ?')
      ->execute(['Carlo', 'Resident', '2000-01-01', 'Male', 'Sample Address', $residentHash, 'Active', $resident['resident_id']]);
  } else {
    $pdo->prepare('INSERT INTO Resident (first_name, middle_name, last_name, birth_date, gender, address, email, password, account_status, registration_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())')
      ->execute(['Carlo', '', 'Resident', '2000-01-01', 'Male', 'Sample Address', $resEmail, $residentHash, 'Active']);
  }
}

function createNotification($pdo, $residentId, $message, $type = 'info'){
  $stmt = $pdo->prepare('INSERT INTO Notification (resident_id, message, type, is_read, date_created) VALUES (?, ?, ?, FALSE, NOW())');
  $stmt->execute([$residentId, $message, $type]);
  return $pdo->lastInsertId();
}

function getNotificationsForUser($pdo, $user){
  if(!$user) return [];
  if($user['role'] === 'staff'){
    $stmt = $pdo->prepare('SELECT * FROM Notification WHERE resident_id IS NULL ORDER BY date_created DESC LIMIT 200');
    $stmt->execute([]);
    return $stmt->fetchAll();
  }
  $stmt = $pdo->prepare('SELECT * FROM Notification WHERE resident_id = ? ORDER BY date_created DESC LIMIT 200');
  $stmt->execute([$user['id']]);
  return $stmt->fetchAll();
}

function markAllNotificationsRead($pdo, $user){
  if(!$user) return 0;
  if($user['role'] === 'staff'){
    $stmt = $pdo->prepare('UPDATE Notification SET is_read = TRUE WHERE resident_id IS NULL');
    $stmt->execute([]);
    return $stmt->rowCount();
  }
  $stmt = $pdo->prepare('UPDATE Notification SET is_read = TRUE WHERE resident_id = ?');
  $stmt->execute([$user['id']]);
  return $stmt->rowCount();
}

function markNotificationRead($pdo, $user, $notificationId){
  if(!$user) return 0;
  if($user['role'] === 'staff'){
    $stmt = $pdo->prepare('UPDATE Notification SET is_read = TRUE WHERE notification_id = ? AND resident_id IS NULL');
    $stmt->execute([$notificationId]);
    return $stmt->rowCount();
  }
  $stmt = $pdo->prepare('UPDATE Notification SET is_read = TRUE WHERE notification_id = ? AND resident_id = ?');
  $stmt->execute([$notificationId, $user['id']]);
  return $stmt->rowCount();
}

function getUnreadNotificationCount($pdo, $user){
  if(!$user) return 0;
  if($user['role'] === 'staff'){
    $stmt = $pdo->prepare('SELECT COUNT(*) AS c FROM Notification WHERE resident_id IS NULL AND is_read = FALSE');
    $stmt->execute([]);
  } else {
    $stmt = $pdo->prepare('SELECT COUNT(*) AS c FROM Notification WHERE resident_id = ? AND is_rezad = FALSE');
    $stmt->execute([$user['id']]);
  }
  $row = $stmt->fetch();
  return $row ? intval($row['c']) : 0;
}

// Route: /register
if($uri === '/register' && $method === 'POST'){
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['email']) || empty($data['password'])) json(['success'=>false,'message'=>'Email and password required']);
  // check unique
  $stmt = $pdo->prepare('SELECT resident_id FROM Resident WHERE email = ?');
  $stmt->execute([$data['email']]);
  if($stmt->fetch()) json(['success'=>false,'message'=>'Email already registered']);
  $hash = password_hash($data['password'], PASSWORD_BCRYPT);
  $stmt = $pdo->prepare('INSERT INTO Resident (first_name, middle_name, last_name, birth_date, gender, address, email, password, account_status, registration_date) VALUES (?,?,?,?,?,?,?,?,?,"Active",NOW())');
  $stmt->execute([$data['first_name'] ?? '', $data['middle_name'] ?? '', $data['last_name'] ?? '', $data['birth_date'] ?? null, $data['gender'] ?? null, $data['address'] ?? null, $data['email'], $hash]);
  $id = $pdo->lastInsertId();
  $token = bin2hex(random_bytes(16));
  $pdo->prepare('UPDATE Resident SET api_token = ? WHERE resident_id = ?')->execute([$token, $id]);  $residentName = trim(($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? '')) ?: $data['email'];
  createNotification($pdo, null, 'New resident registration: ' . $residentName, 'registration');  json(['success'=>true,'token'=>$token,'user'=>['id'=>$id,'email'=>$data['email'],'role'=>'resident']]);
}

// Route: /login
if($uri === '/login' && $method === 'POST'){
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['email']) || empty($data['password'])) json(['success'=>false,'message'=>'Email and password required']);
  if(in_array(strtolower(trim($data['email'])), ['admin@gmail.com', 'carlo@gmail.com'], true)){
    restoreTestAccounts($pdo);
  }
  // try staff
  if(tableExists($pdo, 'Staff')){
    $stmt = $pdo->prepare('SELECT staff_id, full_name, email, password, account_status, suspension_end_date FROM Staff WHERE email = ?');
    $stmt->execute([$data['email']]);
    $s = $stmt->fetch();
    if($s && password_verify($data['password'], $s['password'])){
      $now = new DateTime('now');
      $staffStatus = trim($s['account_status'] ?? '');
      if(strcasecmp($staffStatus, 'Banned') === 0){
        json(['success'=>false,'message'=>'Your account has been banned. Please contact the barangay for assistance.','status'=>'Banned']);
      }
      if(strcasecmp($staffStatus, 'Suspended') === 0){
        if(!empty(trim($s['suspension_end_date'] ?? ''))){
          $end = DateTime::createFromFormat('Y-m-d', $s['suspension_end_date']);
          if($end){
            $end->setTime(23, 59, 59);
          }
          if($end && $end >= $now){
            json(['success'=>false,'message'=>'Your account is suspended until '.$end->format('F j, Y').'.','status'=>'Suspended','suspension_end_date'=>$s['suspension_end_date']]);
          }
          $pdo->prepare('UPDATE Staff SET account_status = ?, suspension_end_date = NULL WHERE staff_id = ?')->execute(['Active', $s['staff_id']]);
        } else {
          json(['success'=>false,'message'=>'Your account is suspended. Please contact the barangay for assistance.','status'=>'Suspended']);
        }
      }
      $token = bin2hex(random_bytes(16));
      $pdo->prepare('UPDATE Staff SET api_token = ? WHERE staff_id = ?')->execute([$token, $s['staff_id']]);
      json(['success'=>true,'token'=>$token,'user'=>['id'=>$s['staff_id'],'name'=>$s['full_name'],'role'=>'staff']]);
    }
  }
  // try resident
  if(tableExists($pdo, 'Resident')){
    $stmt = $pdo->prepare('SELECT resident_id, first_name, last_name, email, password, account_status, suspension_end_date FROM Resident WHERE email = ?');
    $stmt->execute([$data['email']]);
    $r = $stmt->fetch();
    if($r && password_verify($data['password'], $r['password'])){
      $now = new DateTime('now');
      $accountStatus = trim($r['account_status'] ?? '');
      if(strcasecmp($accountStatus, 'Banned') === 0){
        json(['success'=>false,'message'=>'Your account has been banned. Please contact the barangay for assistance.','status'=>'Banned']);
      }
      if(strcasecmp($accountStatus, 'Suspended') === 0){
        if(!empty(trim($r['suspension_end_date'] ?? ''))){
          $end = DateTime::createFromFormat('Y-m-d', $r['suspension_end_date']);
          if($end){
            $end->setTime(23, 59, 59);
          }
          if($end && $end >= $now){
            json(['success'=>false,'message'=>'Your account is suspended until '.$end->format('F j, Y').'.','status'=>'Suspended','suspension_end_date'=>$r['suspension_end_date']]);
          }
          // suspension expired; automatically reactivate
          $pdo->prepare('UPDATE Resident SET account_status = ?, suspension_end_date = NULL WHERE resident_id = ?')->execute(['Active', $r['resident_id']]);
          $r['account_status'] = 'Active';
          $r['suspension_end_date'] = null;
        } else {
          json(['success'=>false,'message'=>'Your account is suspended. Please contact the barangay for assistance.','status'=>'Suspended']);
        }
      }
      $token = bin2hex(random_bytes(16));
      $pdo->prepare('UPDATE Resident SET api_token = ? WHERE resident_id = ?')->execute([$token, $r['resident_id']]);
      json(['success'=>true,'token'=>$token,'user'=>['id'=>$r['resident_id'],'name'=>($r['first_name'].' '.$r['last_name']),'role'=>'resident','account_status'=>$r['account_status'],'suspension_end_date'=>$r['suspension_end_date']]]);
    }
  }
  json(['success'=>false,'message'=>'Invalid credentials']);
}

// Route: /me - get current user from Bearer token
if($uri === '/me' && $method === 'GET'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  if($user['role'] === 'resident' || $user['role'] === 'staff'){
    $table = $user['role'] === 'resident' ? 'Resident' : 'Staff';
    $key = $user['role'] === 'resident' ? 'resident_id' : 'staff_id';
    $stmt = $pdo->prepare("SELECT account_status, suspension_end_date FROM {$table} WHERE {$key} = ?");
    $stmt->execute([$user['id']]);
    $details = $stmt->fetch();
    if($details){
      $user['account_status'] = $details['account_status'];
      $user['suspension_end_date'] = $details['suspension_end_date'];
    }
    $accountStatus = trim($user['account_status'] ?? '');
    if(strcasecmp($accountStatus, 'Banned') === 0){
      json(['success'=>false,'message'=>'Your account has been banned. Please contact the barangay for assistance.','status'=>'Banned']);
    }
    if(strcasecmp($accountStatus, 'Suspended') === 0){
      $now = new DateTime('now');
      if(!empty(trim($user['suspension_end_date'] ?? ''))){
        $end = DateTime::createFromFormat('Y-m-d', $user['suspension_end_date']);
        if($end){
          $end->setTime(23, 59, 59);
        }
        if($end && $end >= $now){
          json(['success'=>false,'message'=>'Your account is suspended until '.$end->format('F j, Y').'.','status'=>'Suspended','suspension_end_date'=>$user['suspension_end_date']]);
        }
        $pdo->prepare("UPDATE {$table} SET account_status = ?, suspension_end_date = NULL WHERE {$key} = ?")->execute(['Active', $user['id']]);
        $user['account_status'] = 'Active';
        $user['suspension_end_date'] = null;
      } else {
        json(['success'=>false,'message'=>'Your account is suspended. Please contact the barangay for assistance.','status'=>'Suspended']);
      }
    }
  }
  json(['success'=>true,'user'=>$user]);
}

// Route: /forgot-password
if($uri === '/forgot-password' && $method === 'POST'){
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['email'])) json(['success'=>false,'message'=>'Email is required']);
  if(!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) json(['success'=>false,'message'=>'Enter a valid email address']);
  $user = findUserByEmail($pdo, $data['email']);
  if(!$user) json(['success'=>false,'message'=>'Email not found']);

  $existingReset = getPasswordReset($pdo, $user);
  $waitSeconds = secondsUntilOtpCanResend($existingReset);
  if($waitSeconds > 0){
    json([
      'success'=>false,
      'message'=>'Please wait before requesting another OTP.',
      'retry_after'=>$waitSeconds
    ]);
  }

  $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

  try {
    upsertPasswordResetOtp($pdo, $user, $code);
    sendOtpEmail($user['email'], $code);
  } catch (Exception $e) {
    deletePasswordResetOtp($pdo, $user);
    error_log('Password reset OTP email failed: ' . $e->getMessage());
    json(['success'=>false,'message'=>'Unable to send OTP email. Please try again later.']);
  }

  json([
    'success'=>true,
    'message'=>'OTP sent to your email.',
    'expires_in'=>RESET_OTP_TTL_SECONDS,
    'resend_after'=>RESET_OTP_RESEND_SECONDS
  ]);
}

// Route: /reset-password
if($uri === '/reset-password' && $method === 'POST'){
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['email']) || empty($data['token']) || empty($data['password'])) json(['success'=>false,'message'=>'Email, reset code, and password are required']);
  if(!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) json(['success'=>false,'message'=>'Enter a valid email address']);
  $user = findUserByEmail($pdo, $data['email']);
  if(!$user) json(['success'=>false,'message'=>'Email not found']);

  $reset = getPasswordReset($pdo, $user);
  if(!$reset || !empty($reset['used_at'])) json(['success'=>false,'message'=>'Invalid or expired reset code']);
  if(strtotime($reset['expires_at']) < time()){
    deletePasswordResetOtp($pdo, $user);
    json(['success'=>false,'message'=>'Reset code expired. Please request a new OTP.']);
  }
  if(!password_verify(trim($data['token']), $reset['otp_hash'])) json(['success'=>false,'message'=>'Invalid reset code']);
  if(strlen($data['password']) < 6) json(['success'=>false,'message'=>'Password must be at least 6 characters']);

  $hash = password_hash($data['password'], PASSWORD_BCRYPT);
  updateUserPassword($pdo, $user['role'], $user['id'], $hash);
  deletePasswordResetOtp($pdo, $user);

  json(['success'=>true,'message'=>'Password reset successful']);
}

// Route: /seed - development helper to create/hash test accounts
if($uri === '/seed' && $method === 'GET'){
  restoreTestAccounts($pdo);
  json(['success'=>true,'message'=>'Recreated test accounts: admin@gmail.com / 123 and carlo@gmail.com / 123']);
}

// Route: /complaints GET (list) or POST (create)
if($uri === '/complaints'){
  if($method === 'GET'){
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);

    if($user['role'] === 'staff'){
      $stmt = $pdo->query('SELECT * FROM Complaint ORDER BY date_submitted DESC LIMIT 200');
      $rows = $stmt->fetchAll();
    } else {
      $stmt = $pdo->prepare('SELECT * FROM Complaint WHERE resident_id = ? ORDER BY date_submitted DESC LIMIT 200');
      $stmt->execute([$user['id']]);
      $rows = $stmt->fetchAll();
    }

    json(['success'=>true,'data'=>$rows]);
  }
  if($method === 'POST'){
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare('INSERT INTO Complaint (resident_id, category_id, assigned_staff_id, title, description, incident_location, incident_date, status, date_submitted) VALUES (?, ?, NULL, ?, ?, ?, ?, "Submitted", NOW())');
    $stmt->execute([$user['id'], $data['category_id'] ?? null, $data['title'] ?? '', $data['description'] ?? '', $data['incident_location'] ?? '', $data['incident_date'] ?? null]);
    $complaintId = $pdo->lastInsertId();

    $authorName = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: ($user['email'] ?? 'Resident');
    $message = 'New complaint submitted by ' . $authorName . ': ' . trim($data['title'] ?? $data['description'] ?? 'Complaint');
    if($message === ''){
      $message = 'New complaint submitted by ' . $authorName;
    }
    createNotification($pdo, null, $message, 'complaint');

    json(['success'=>true,'id'=>$complaintId]);
  }
}

// Route: /complaints/{id} - update complaint (admin)
if(preg_match('#^/complaints/(\d+)$#', $uri, $m) && in_array($method, ['PUT','PATCH','POST'])){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  // only staff can update complaints
  if($user['role'] !== 'staff') json(['success'=>false,'message'=>'Forbidden']);
  $id = intval($m[1]);
  $data = json_decode(file_get_contents('php://input'), true);
  $fields = [];
  $vals = [];
  $statusUpdate = false;
  $newStatus = null;
  if(isset($data['status'])){ $fields[] = 'status = ?'; $vals[] = $data['status']; $statusUpdate = true; $newStatus = $data['status']; }
  if(isset($data['assigned_staff_id'])){ $fields[] = 'assigned_staff_id = ?'; $vals[] = $data['assigned_staff_id']; }
  if(isset($data['resolution_notes'])){ $fields[] = 'resolution_notes = ?'; $vals[] = $data['resolution_notes']; }
  if(count($fields) === 0) json(['success'=>false,'message'=>'Nothing to update']);

  if($statusUpdate){
    $stmt = $pdo->prepare('SELECT resident_id, title, description FROM Complaint WHERE complaint_id = ?');
    $stmt->execute([$id]);
    $complaint = $stmt->fetch();
    if($complaint && !empty($complaint['resident_id'])){
      $title = trim($complaint['title'] ?: $complaint['description'] ?: 'Complaint');
      createNotification($pdo, intval($complaint['resident_id']), 'Your complaint "' . $title . '" status is now ' . $newStatus . '.', 'complaint_status');
    }
  }

  $vals[] = $id;
  $sql = 'UPDATE Complaint SET '.implode(', ', $fields).' WHERE complaint_id = ?';
  $pdo->prepare($sql)->execute($vals);
  json(['success'=>true]);
}

// Route: /complaints/{id} - delete complaint
if(preg_match('#^/complaints/(\d+)$#', $uri, $m) && $method === 'DELETE'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);

  $id = intval($m[1]);
  $stmt = $pdo->prepare('SELECT resident_id FROM Complaint WHERE complaint_id = ?');
  $stmt->execute([$id]);
  $complaint = $stmt->fetch();
  if(!$complaint) json(['success'=>false,'message'=>'Complaint not found']);

  $isOwner = ($user['role'] !== 'staff' && intval($complaint['resident_id']) === intval($user['id']));
  if($user['role'] !== 'staff' && !$isOwner) json(['success'=>false,'message'=>'Forbidden']);

  $pdo->prepare('DELETE FROM Complaint WHERE complaint_id = ?')->execute([$id]);
  json(['success'=>true]);
}

// Route: /docs GET/POST
if($uri === '/docs'){
  if($method === 'GET'){
    $stmt = $pdo->query('SELECT * FROM Document_Request ORDER BY date_requested DESC LIMIT 200');
    json(['success'=>true,'data'=>$stmt->fetchAll()]);
  }
  if($method === 'POST'){
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
    $data = json_decode(file_get_contents('php://input'), true);
    $ref = 'REQ-'.time();
    $stmt = $pdo->prepare('INSERT INTO Document_Request (resident_id, processed_by, document_type, purpose, business_name, status, reference_number, date_requested) VALUES (?, NULL, ?, ?, ?, "Submitted", ?, NOW())');
    $stmt->execute([$user['id'], $data['document_type'] ?? '', $data['purpose'] ?? '', $data['business_name'] ?? '', $ref]);
    createNotification($pdo, null, 'New document request submitted by ' . trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) . ': ' . trim($data['document_type'] ?? $ref), 'document_request');
    json(['success'=>true,'id'=>$pdo->lastInsertId(),'reference'=>$ref]);
  }
}

// Route: /docs/{id} - update document request (admin)
if(preg_match('#^/docs/(\d+)$#', $uri, $m) && in_array($method, ['PUT','PATCH','POST'])){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  if($user['role'] !== 'staff') json(['success'=>false,'message'=>'Forbidden']);
  $id = intval($m[1]);
  $data = json_decode(file_get_contents('php://input'), true);
  $fields = [];
  $vals = [];
  $statusUpdate = false;
  $newStatus = null;
  if(isset($data['status'])){ $fields[] = 'status = ?'; $vals[] = $data['status']; $statusUpdate = true; $newStatus = $data['status']; }
  if(isset($data['processed_by'])){ $fields[] = 'processed_by = ?'; $vals[] = $data['processed_by']; }
  if(count($fields) === 0) json(['success'=>false,'message'=>'Nothing to update']);

  if($statusUpdate){
    $stmt = $pdo->prepare('SELECT resident_id, reference_number, document_type FROM Document_Request WHERE request_id = ?');
    $stmt->execute([$id]);
    $request = $stmt->fetch();
    if($request && !empty($request['resident_id'])){
      $label = trim($request['document_type'] ?: $request['reference_number'] ?: 'Document request');
      $message = $newStatus === 'Released'
        ? 'Your document request "' . $label . '" has been released and is ready for pickup at the barangay.'
        : 'Your document request "' . $label . '" status is now ' . $newStatus . '.';
      createNotification($pdo, intval($request['resident_id']), $message, 'document_status');
    }
  }

  $vals[] = $id;
  $sql = 'UPDATE Document_Request SET '.implode(', ', $fields).' WHERE request_id = ?';
  $pdo->prepare($sql)->execute($vals);
  json(['success'=>true]);
}

// Route: /notifications GET
if($uri === '/notifications' && $method === 'GET'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  $notifications = getNotificationsForUser($pdo, $user);
  json(['success'=>true,'data'=>$notifications]);
}

// Route: /notifications/mark-all-read
if($uri === '/notifications/mark-all-read' && $method === 'POST'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  markAllNotificationsRead($pdo, $user);
  json(['success'=>true]);
}

// Route: /notifications/{id}/read
if(preg_match('#^/notifications/(\d+)/read$#', $uri, $m) && $method === 'POST'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  markNotificationRead($pdo, $user, intval($m[1]));
  json(['success'=>true]);
}

// Route: /residents GET - list residents (admin)
if($uri === '/residents' && $method === 'GET'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  if($user['role'] !== 'staff') json(['success'=>false,'message'=>'Forbidden']);
  $stmt = $pdo->query('SELECT resident_id, first_name, middle_name, last_name, email, account_status, suspension_end_date, registration_date FROM Resident ORDER BY registration_date DESC');
  json(['success'=>true,'data'=>$stmt->fetchAll()]);
}

// Route: /residents/{id} - patch or delete resident (admin)
if(preg_match('#^/residents/(\d+)$#', $uri, $m) && in_array($method, ['PATCH','PUT','DELETE'])){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  if($user['role'] !== 'staff') json(['success'=>false,'message'=>'Forbidden']);
  $id = intval($m[1]);
  if($method === 'DELETE'){
    $pdo->prepare('DELETE FROM Resident WHERE resident_id = ?')->execute([$id]);
    json(['success'=>true]);
  }
  $data = json_decode(file_get_contents('php://input'), true);
  $fields = [];
  $vals = [];
  if(isset($data['account_status'])){
    $fields[] = 'account_status = ?';
    $vals[] = $data['account_status'];
    if(strcasecmp($data['account_status'], 'Suspended') !== 0){
      $fields[] = 'suspension_end_date = NULL';
    }
  }
  if(isset($data['first_name'])){ $fields[] = 'first_name = ?'; $vals[] = $data['first_name']; }
  if(isset($data['last_name'])){ $fields[] = 'last_name = ?'; $vals[] = $data['last_name']; }
  if(isset($data['suspension_end_date'])){ $fields[] = 'suspension_end_date = ?'; $vals[] = $data['suspension_end_date']; }
  if(count($fields) === 0) json(['success'=>false,'message'=>'Nothing to update']);
  $vals[] = $id;
  $sql = 'UPDATE Resident SET '.implode(', ', $fields).' WHERE resident_id = ?';
  $pdo->prepare($sql)->execute($vals);
  json(['success'=>true]);
}

// default
http_response_code(404);
json(['success'=>false,'message'=>'Not found']);
