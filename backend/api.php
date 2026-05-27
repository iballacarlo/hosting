<?php
ini_set('display_errors', 0);
error_reporting(E_ALL);

// CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowedOrigins = [
  'https://brgymambogdos.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

$allowOrigin = in_array($origin, $allowedOrigins, true);
if(!$allowOrigin && preg_match('/^https:\/\/brgymambogdos(?:-[a-z0-9-]+)?\.vercel\.app$/i', $origin)){
  $allowOrigin = true;
}
if(!$allowOrigin && preg_match('/^https:\/\/brgymambogdos-[a-z0-9-]+-caaarlooo-s-projects4\.vercel\.app$/i', $origin)){
  $allowOrigin = true;
}

if($allowOrigin){
  header("Access-Control-Allow-Origin: {$origin}");
  header("Vary: Origin");
}
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
const REGISTRATION_OTP_TTL_SECONDS = 900;
const REGISTRATION_OTP_RESEND_SECONDS = 30;
const LOGIN_FAILED_ATTEMPT_LIMIT = 5;
const LOGIN_COOLDOWN_SECONDS = 180;
const BARANGAY_CONTACT_EMAIL = 'brgy.mambog.ii@gmail.com';

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

function tableColumnExists($pdo, $table, $column){
  static $cache = [];
  $key = $table . '.' . $column;
  if(isset($cache[$key])) return $cache[$key];
  try {
    $stmt = $pdo->prepare('SHOW COLUMNS FROM `' . $table . '` LIKE ?');
    $stmt->execute([$column]);
    $cache[$key] = (bool)$stmt->fetch();
  } catch (PDOException $e) {
    $cache[$key] = false;
  }
  return $cache[$key];
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

function ensureRegistrationOtpTable($pdo){
  static $ready = false;
  if($ready) return;

  $pdo->exec('CREATE TABLE IF NOT EXISTS Registration_Otp (
    otp_id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    last_sent_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_registration_otp_email (email),
    INDEX idx_registration_otp_expires_at (expires_at)
  )');

  $ready = true;
}

function ensureLoginAttemptTable($pdo){
  static $ready = false;
  if($ready) return;

  $pdo->exec('CREATE TABLE IF NOT EXISTS Login_Attempt (
    attempt_id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(255) NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    last_failed_at DATETIME DEFAULT NULL,
    locked_until DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_login_attempt_identifier (identifier),
    INDEX idx_login_attempt_locked_until (locked_until)
  )');

  $ready = true;
}

function ensureComplaintAttachmentTable($pdo){
  static $ready = false;
  if($ready) return;

  $pdo->exec('CREATE TABLE IF NOT EXISTS Complaint_Attachment (
    attachment_id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    file_path VARCHAR(1000) NOT NULL,
    file_name VARCHAR(255) DEFAULT NULL,
    file_type VARCHAR(100) DEFAULT NULL,
    file_size INT DEFAULT NULL,
    upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_attachment_complaint
      FOREIGN KEY (complaint_id)
      REFERENCES Complaint(complaint_id)
      ON DELETE CASCADE
  )');

  foreach([
    'file_name' => 'VARCHAR(255) DEFAULT NULL',
    'file_type' => 'VARCHAR(100) DEFAULT NULL',
    'file_size' => 'INT DEFAULT NULL',
  ] as $column => $definition){
    if(!tableColumnExists($pdo, 'Complaint_Attachment', $column)){
      $pdo->exec('ALTER TABLE Complaint_Attachment ADD COLUMN ' . $column . ' ' . $definition);
    }
  }

  $ready = true;
}

function ensureAccessibilitySettingsTable($pdo){
  static $ready = false;
  if($ready) return;

  $pdo->exec('CREATE TABLE IF NOT EXISTS Accessibility_Settings (
    accessibility_id INT AUTO_INCREMENT PRIMARY KEY,
    resident_id INT UNIQUE,
    text_to_speech_enabled BOOLEAN DEFAULT FALSE,
    high_contrast_mode BOOLEAN DEFAULT FALSE,
    dark_mode BOOLEAN DEFAULT FALSE,
    font_size VARCHAR(50) DEFAULT "small",
    CONSTRAINT fk_accessibility_resident
      FOREIGN KEY (resident_id)
      REFERENCES Resident(resident_id)
      ON DELETE CASCADE
  )');

  $ready = true;
}

function ensureArchiveTable($pdo){
  static $ready = false;
  if($ready) return;

  $pdo->exec('CREATE TABLE IF NOT EXISTS Archive_Item (
    archive_id INT AUTO_INCREMENT PRIMARY KEY,
    item_type VARCHAR(50) NOT NULL,
    original_id INT NOT NULL,
    owner_resident_id INT DEFAULT NULL,
    deleted_by_role VARCHAR(20) NOT NULL,
    deleted_by_id INT NOT NULL,
    deleted_by_name VARCHAR(255) DEFAULT NULL,
    label VARCHAR(255) DEFAULT NULL,
    snapshot LONGTEXT NOT NULL,
    deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    INDEX idx_archive_deleted_by (deleted_by_role, deleted_by_id),
    INDEX idx_archive_owner (owner_resident_id),
    INDEX idx_archive_expires (expires_at)
  )');

  $ready = true;
}

function purgeExpiredArchiveItems($pdo){
  ensureArchiveTable($pdo);
  $pdo->exec('DELETE FROM Archive_Item WHERE expires_at <= NOW()');
}

function getActorName($user){
  if(($user['role'] ?? '') === 'staff'){
    return trim($user['name'] ?? $user['full_name'] ?? 'Admin');
  }
  return trim($user['name'] ?? (($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''))) ?: 'Resident';
}

function createArchiveItem($pdo, $type, $originalId, $ownerResidentId, $label, $snapshot, $user){
  ensureArchiveTable($pdo);
  purgeExpiredArchiveItems($pdo);
  $stmt = $pdo->prepare('INSERT INTO Archive_Item (item_type, original_id, owner_resident_id, deleted_by_role, deleted_by_id, deleted_by_name, label, snapshot, deleted_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY))');
  $stmt->execute([
    $type,
    intval($originalId),
    $ownerResidentId ? intval($ownerResidentId) : null,
    $user['role'],
    intval($user['id']),
    getActorName($user),
    $label,
    json_encode($snapshot)
  ]);
}

function restoreComplaintFromArchive($pdo, $snapshot){
  ensureComplaintExtraColumns($pdo);
  $row = $snapshot['record'] ?? [];
  if(empty($row)) return false;

  if(!empty($row['resident_id'])){
    $stmt = $pdo->prepare('SELECT resident_id FROM Resident WHERE resident_id = ?');
    $stmt->execute([$row['resident_id']]);
    if(!$stmt->fetch()) $row['resident_id'] = null;
  }
  if(!empty($row['category_id'])){
    $stmt = $pdo->prepare('SELECT category_id FROM Category WHERE category_id = ?');
    $stmt->execute([$row['category_id']]);
    if(!$stmt->fetch()) $row['category_id'] = null;
  }
  if(!empty($row['assigned_staff_id'])){
    $stmt = $pdo->prepare('SELECT staff_id FROM Staff WHERE staff_id = ?');
    $stmt->execute([$row['assigned_staff_id']]);
    if(!$stmt->fetch()) $row['assigned_staff_id'] = null;
  }

  $stmt = $pdo->prepare('INSERT INTO Complaint (complaint_id, resident_id, category_id, assigned_staff_id, title, description, incident_location, incident_date, anonymous, respondent_name, respondent_contact, status, resolution_notes, date_submitted, date_updated, date_resolved)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  $stmt->execute([
    $row['complaint_id'] ?? null,
    $row['resident_id'] ?? null,
    $row['category_id'] ?? null,
    $row['assigned_staff_id'] ?? null,
    $row['title'] ?? 'Restored Complaint',
    $row['description'] ?? null,
    $row['incident_location'] ?? null,
    $row['incident_date'] ?? null,
    !empty($row['anonymous']) ? 1 : 0,
    $row['respondent_name'] ?? null,
    $row['respondent_contact'] ?? null,
    $row['status'] ?? 'Submitted',
    $row['resolution_notes'] ?? null,
    $row['date_submitted'] ?? date('Y-m-d H:i:s'),
    $row['date_updated'] ?? $row['date_submitted'] ?? date('Y-m-d H:i:s'),
    $row['date_resolved'] ?? null
  ]);

  ensureComplaintAttachmentTable($pdo);
  $attachmentStmt = $pdo->prepare('INSERT INTO Complaint_Attachment (complaint_id, file_path, file_name, file_type, file_size, upload_date) VALUES (?, ?, ?, ?, ?, ?)');
  foreach(($snapshot['attachments'] ?? []) as $attachment){
    $attachmentStmt->execute([
      $row['complaint_id'],
      $attachment['file_path'] ?? '',
      $attachment['file_name'] ?? null,
      $attachment['file_type'] ?? null,
      $attachment['file_size'] ?? null,
      $attachment['upload_date'] ?? date('Y-m-d H:i:s')
    ]);
  }
  return true;
}

function restoreDocumentFromArchive($pdo, $snapshot){
  $row = $snapshot['record'] ?? [];
  if(empty($row)) return false;

  if(!empty($row['resident_id'])){
    $stmt = $pdo->prepare('SELECT resident_id FROM Resident WHERE resident_id = ?');
    $stmt->execute([$row['resident_id']]);
    if(!$stmt->fetch()) $row['resident_id'] = null;
  }
  if(!empty($row['processed_by'])){
    $stmt = $pdo->prepare('SELECT staff_id FROM Staff WHERE staff_id = ?');
    $stmt->execute([$row['processed_by']]);
    if(!$stmt->fetch()) $row['processed_by'] = null;
  }

  $stmt = $pdo->prepare('INSERT INTO Document_Request (request_id, resident_id, processed_by, full_name, birth_date, address, document_type, purpose, status, reference_number, date_requested, date_approved, date_released)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  $stmt->execute([
    $row['request_id'] ?? null,
    $row['resident_id'] ?? null,
    $row['processed_by'] ?? null,
    $row['full_name'] ?? null,
    $row['birth_date'] ?? null,
    $row['address'] ?? null,
    $row['document_type'] ?? null,
    $row['purpose'] ?? null,
    $row['status'] ?? 'Submitted',
    $row['reference_number'] ?? null,
    $row['date_requested'] ?? date('Y-m-d H:i:s'),
    $row['date_approved'] ?? null,
    $row['date_released'] ?? null
  ]);
  return true;
}

function restoreResidentFromArchive($pdo, $snapshot){
  $row = $snapshot['record'] ?? [];
  if(empty($row)) return false;

  $stmt = $pdo->prepare('INSERT INTO Resident (resident_id, first_name, middle_name, last_name, birth_date, gender, address, email, password, account_status, suspension_end_date, registration_date, api_token)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)');
  $stmt->execute([
    $row['resident_id'] ?? null,
    $row['first_name'] ?? '',
    $row['middle_name'] ?? null,
    $row['last_name'] ?? '',
    $row['birth_date'] ?? null,
    $row['gender'] ?? null,
    $row['address'] ?? null,
    $row['email'] ?? '',
    $row['password'] ?? '',
    $row['account_status'] ?? 'Active',
    $row['suspension_end_date'] ?? null,
    $row['registration_date'] ?? date('Y-m-d H:i:s')
  ]);
  return true;
}

function archiveOriginalRecordExists($pdo, $archive){
  $type = $archive['item_type'] ?? '';
  $id = intval($archive['original_id'] ?? 0);
  if($id <= 0) return false;

  if($type === 'complaint'){
    $stmt = $pdo->prepare('SELECT complaint_id FROM Complaint WHERE complaint_id = ?');
  } elseif($type === 'document'){
    $stmt = $pdo->prepare('SELECT request_id FROM Document_Request WHERE request_id = ?');
  } elseif($type === 'resident'){
    $stmt = $pdo->prepare('SELECT resident_id FROM Resident WHERE resident_id = ?');
  } else {
    return false;
  }

  $stmt->execute([$id]);
  return (bool)$stmt->fetch();
}

function ensureComplaintExtraColumns($pdo){
  static $ready = false;
  if($ready) return;

  foreach([
    'anonymous' => 'BOOLEAN DEFAULT FALSE',
    'respondent_name' => 'VARCHAR(255) DEFAULT NULL',
    'respondent_contact' => 'VARCHAR(255) DEFAULT NULL',
    'date_updated' => 'DATETIME DEFAULT CURRENT_TIMESTAMP',
  ] as $column => $definition){
    if(!tableColumnExists($pdo, 'Complaint', $column)){
      $pdo->exec('ALTER TABLE Complaint ADD COLUMN ' . $column . ' ' . $definition);
    }
  }

  $ready = true;
}

function ensureDocumentTypeTable($pdo){
  static $ready = false;
  if($ready) return;

  $pdo->exec('CREATE TABLE IF NOT EXISTS Document_Type (
    document_type_id INT AUTO_INCREMENT PRIMARY KEY,
    document_name VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT "enabled",
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )');

  $defaults = [
    'Barangay Clearance',
    'Certificate of Residency',
    'Certificate of Indigency',
  ];

  $stmt = $pdo->prepare('INSERT IGNORE INTO Document_Type (document_name, status) VALUES (?, "enabled")');
  foreach($defaults as $documentName){
    $stmt->execute([$documentName]);
  }

  $ready = true;
}

function ensureDefaultCategories($pdo){
  $defaults = [
    ['Noise Complaint', 'Noise related complaints'],
    ['Garbage Collection', 'Garbage collection concerns'],
    ['Road/Drainage Issue', 'Road and drainage concerns'],
    ['Peace and Order', 'Peace and order concerns'],
    ['Other', 'Other concerns'],
  ];

  $existingStmt = $pdo->query('SELECT category_name FROM Category');
  $existing = [];
  foreach($existingStmt->fetchAll() as $row){
    $existing[strtolower($row['category_name'])] = true;
  }

  $stmt = $pdo->prepare('INSERT INTO Category (category_name, description) VALUES (?, ?)');
  foreach($defaults as $item){
    if(!isset($existing[strtolower($item[0])])){
      $stmt->execute($item);
    }
  }

  consolidateDuplicateCategories($pdo);
}

function normalizeCategoryAliasKey($name){
  $key = strtolower(trim($name ?? ''));
  $key = str_replace('&', 'and', $key);
  $key = preg_replace('/[^a-z0-9]+/', ' ', $key);
  return trim(preg_replace('/\s+/', ' ', $key));
}

function canonicalCategoryName($name){
  $trimmed = trim($name ?? '');
  $aliases = [
    'garbage' => 'Garbage Collection',
    'garbage concern' => 'Garbage Collection',
    'garbage collection' => 'Garbage Collection',
    'trash' => 'Garbage Collection',
    'trash collection' => 'Garbage Collection',
    'noise' => 'Noise Complaint',
    'noise complaint' => 'Noise Complaint',
    'road drainage' => 'Road/Drainage Issue',
    'road drainage issue' => 'Road/Drainage Issue',
    'road and drainage' => 'Road/Drainage Issue',
    'road and drainage issue' => 'Road/Drainage Issue',
    'road issue' => 'Road/Drainage Issue',
    'drainage issue' => 'Road/Drainage Issue',
    'peace order' => 'Peace and Order',
    'peace and order' => 'Peace and Order',
    'peace order concern' => 'Peace and Order',
    'peace and order concern' => 'Peace and Order',
    'other' => 'Other',
    'others' => 'Other',
  ];

  $key = normalizeCategoryAliasKey($trimmed);
  return $aliases[$key] ?? $trimmed;
}

function consolidateDuplicateCategories($pdo){
  $rows = $pdo->query('SELECT category_id, category_name FROM Category ORDER BY category_id ASC')->fetchAll();
  $canonicalRows = [];

  foreach($rows as $row){
    $sourceId = intval($row['category_id']);
    $canonical = canonicalCategoryName($row['category_name']);
    if($canonical === '') continue;
    $key = strtolower($canonical);

    if(!isset($canonicalRows[$key])){
      if($row['category_name'] !== $canonical){
        $stmt = $pdo->prepare('UPDATE Category SET category_name = ? WHERE category_id = ?');
        $stmt->execute([$canonical, $sourceId]);
      }
      $canonicalRows[$key] = $sourceId;
      continue;
    }

    $targetId = intval($canonicalRows[$key]);
    if($targetId === $sourceId) continue;

    $updateComplaints = $pdo->prepare('UPDATE Complaint SET category_id = ? WHERE category_id = ?');
    $updateComplaints->execute([$targetId, $sourceId]);

    $deleteCategory = $pdo->prepare('DELETE FROM Category WHERE category_id = ?');
    $deleteCategory->execute([$sourceId]);
  }
}

function categoryOrderSql(){
  return "CASE WHEN LOWER(category_name) IN ('other', 'others') THEN 1 ELSE 0 END ASC, category_name ASC";
}

function getComplaintSelectSql($where = ''){
  return 'SELECT c.*, 
      CONCAT("CMP-", LPAD(c.complaint_id, 4, "0")) AS ref,
      cat.category_name AS category,
      cat.category_name,
      c.incident_location AS location,
      CONCAT_WS(" ", r.first_name, r.middle_name, r.last_name) AS resident_name
    FROM Complaint c
    LEFT JOIN Category cat ON c.category_id = cat.category_id
    LEFT JOIN Resident r ON c.resident_id = r.resident_id ' . $where . '
    ORDER BY c.date_submitted DESC
    LIMIT 200';
}

function maskAnonymousComplaints($rows, $maskResidentId = false){
  foreach($rows as &$row){
    if(!empty($row['anonymous'])){
      $row['resident_name'] = 'Anonymous';
      $row['name'] = 'Anonymous';
      if($maskResidentId){
        $row['resident_id'] = null;
      }
    }
  }
  unset($row);
  return $rows;
}

function inferMediaTypeFromPath($path){
  $extension = strtolower(pathinfo(parse_url($path ?? '', PHP_URL_PATH) ?: '', PATHINFO_EXTENSION));
  $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  $videoExtensions = ['mp4', 'webm', 'mov', 'm4v', 'avi'];
  if(in_array($extension, $imageExtensions, true)) return 'image/' . ($extension === 'jpg' ? 'jpeg' : $extension);
  if(in_array($extension, $videoExtensions, true)) return 'video/' . ($extension === 'mov' ? 'quicktime' : $extension);
  return '';
}

function getComplaintAttachments($pdo, $complaintIds){
  ensureComplaintAttachmentTable($pdo);
  $ids = array_values(array_filter(array_map('intval', $complaintIds)));
  if(count($ids) === 0) return [];

  $placeholders = implode(',', array_fill(0, count($ids), '?'));
  $stmt = $pdo->prepare('SELECT * FROM Complaint_Attachment WHERE complaint_id IN (' . $placeholders . ') ORDER BY upload_date ASC');
  $stmt->execute($ids);

  $grouped = [];
  foreach($stmt->fetchAll() as $row){
    $complaintId = intval($row['complaint_id']);
    if(!isset($grouped[$complaintId])) $grouped[$complaintId] = [];
    $fileType = $row['file_type'] ?: inferMediaTypeFromPath($row['file_path'] ?? '');
    $grouped[$complaintId][] = [
      'attachment_id' => intval($row['attachment_id']),
      'complaint_id' => $complaintId,
      'file_path' => $row['file_path'],
      'url' => $row['file_path'],
      'name' => $row['file_name'] ?? basename($row['file_path']),
      'type' => $fileType,
      'size' => isset($row['file_size']) ? intval($row['file_size']) : null,
      'upload_date' => $row['upload_date'],
    ];
  }

  return $grouped;
}

function attachComplaintMedia($pdo, $rows){
  $attachments = getComplaintAttachments($pdo, array_column($rows, 'complaint_id'));
  foreach($rows as &$row){
    $id = intval($row['complaint_id']);
    $row['attachments'] = $attachments[$id] ?? [];
    $row['images'] = $row['attachments'];
  }
  unset($row);
  return $rows;
}

function saveComplaintUploads($pdo, $complaintId){
  ensureComplaintAttachmentTable($pdo);
  $files = $_FILES['attachments'] ?? ($_FILES['attachments[]'] ?? null);
  if(empty($files)) return;

  $uploadedFiles = [];
  $names = is_array($files['name']) ? $files['name'] : [$files['name']];
  $types = is_array($files['type']) ? $files['type'] : [$files['type']];
  $tmpNames = is_array($files['tmp_name']) ? $files['tmp_name'] : [$files['tmp_name']];
  $errors = is_array($files['error']) ? $files['error'] : [$files['error']];
  $sizes = is_array($files['size']) ? $files['size'] : [$files['size']];

  foreach($names as $index => $name){
    $uploadedFiles[] = [
      'name' => $name,
      'type' => $types[$index] ?? '',
      'tmp_name' => $tmpNames[$index] ?? '',
      'error' => $errors[$index] ?? UPLOAD_ERR_NO_FILE,
      'size' => $sizes[$index] ?? 0,
    ];
  }

  $uploadDir = __DIR__ . '/uploads/complaints';
  if(!is_dir($uploadDir)){
    mkdir($uploadDir, 0775, true);
  }

  $allowedPrefixes = ['image/', 'video/'];
  $maxSize = 10 * 1024 * 1024;
  $stmt = $pdo->prepare('INSERT INTO Complaint_Attachment (complaint_id, file_path, file_name, file_type, file_size, upload_date) VALUES (?, ?, ?, ?, ?, NOW())');

  foreach($uploadedFiles as $file){
    $originalName = $file['name'] ?? '';
    if(($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) continue;
    $tmpName = $file['tmp_name'] ?? '';
    if(!is_uploaded_file($tmpName)) continue;

    $fileType = $file['type'] ?: mime_content_type($tmpName);
    $allowed = false;
    foreach($allowedPrefixes as $prefix){
      if(strpos($fileType, $prefix) === 0){
        $allowed = true;
        break;
      }
    }
    if(!$allowed || intval($file['size'] ?? 0) > $maxSize) continue;

    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $safeExtension = preg_match('/^[a-z0-9]{1,8}$/', $extension) ? $extension : 'bin';
    $fileName = 'complaint_' . intval($complaintId) . '_' . bin2hex(random_bytes(8)) . '.' . $safeExtension;
    $targetPath = $uploadDir . '/' . $fileName;

    if(move_uploaded_file($tmpName, $targetPath)){
      $publicPath = '/uploads/complaints/' . $fileName;
      $stmt->execute([$complaintId, $publicPath, $originalName, $fileType, intval($file['size'] ?? 0)]);
    }
  }
}

function deleteComplaintAttachments($pdo, $complaintId, $attachmentIds){
  ensureComplaintAttachmentTable($pdo);
  $ids = array_values(array_unique(array_filter(array_map('intval', $attachmentIds))));
  if(count($ids) === 0) return;

  $placeholders = implode(',', array_fill(0, count($ids), '?'));
  $stmt = $pdo->prepare('SELECT attachment_id, file_path FROM Complaint_Attachment WHERE complaint_id = ? AND attachment_id IN (' . $placeholders . ')');
  $stmt->execute(array_merge([intval($complaintId)], $ids));
  $rows = $stmt->fetchAll();

  $deleteIds = [];
  foreach($rows as $row){
    $deleteIds[] = intval($row['attachment_id']);
    $filePath = $row['file_path'] ?? '';
    if(strpos($filePath, '/uploads/complaints/') === 0){
      $absolutePath = realpath(__DIR__ . $filePath);
      $uploadRoot = realpath(__DIR__ . '/uploads/complaints');
      if($absolutePath && $uploadRoot && strpos($absolutePath, $uploadRoot) === 0 && is_file($absolutePath)){
        @unlink($absolutePath);
      }
    }
  }

  if(count($deleteIds) > 0){
    $deletePlaceholders = implode(',', array_fill(0, count($deleteIds), '?'));
    $deleteStmt = $pdo->prepare('DELETE FROM Complaint_Attachment WHERE complaint_id = ? AND attachment_id IN (' . $deletePlaceholders . ')');
    $deleteStmt->execute(array_merge([intval($complaintId)], $deleteIds));
  }
}

function normalizeEmail($email){
  return strtolower(trim($email ?? ''));
}

function getCommonEmailDomains(){
  return [
    'gmail.com',
    'yahoo.com',
    'ymail.com',
    'outlook.com',
    'hotmail.com',
    'live.com',
    'icloud.com',
    'aol.com',
    'proton.me',
    'protonmail.com',
    'mail.com',
  ];
}

function suggestEmailDomain($domain){
  $commonDomains = getCommonEmailDomains();
  if(in_array($domain, $commonDomains, true)) return '';

  $bestDomain = '';
  $bestDistance = 99;
  foreach($commonDomains as $commonDomain){
    $distance = levenshtein($domain, $commonDomain);
    if($distance < $bestDistance){
      $bestDistance = $distance;
      $bestDomain = $commonDomain;
    }
  }

  return $bestDistance <= 2 ? $bestDomain : '';
}

function emailDomainExists($domain){
  if(!preg_match('/^[a-z0-9.-]+\.[a-z]{2,}$/i', $domain)) return false;
  if(function_exists('checkdnsrr')){
    return checkdnsrr($domain, 'MX') || checkdnsrr($domain, 'A');
  }
  return true;
}

function validateRegistrationEmail($email){
  $email = normalizeEmail($email);
  if(!filter_var($email, FILTER_VALIDATE_EMAIL)){
    return 'Enter a valid email address';
  }

  $domain = substr(strrchr($email, '@') ?: '', 1);
  $suggestedDomain = suggestEmailDomain($domain);
  if($suggestedDomain){
    return 'Enter a valid email address.';
  }

  if(!emailDomainExists($domain)){
    return 'Enter a valid email address.';
  }

  return '';
}

function validateStrongPassword($password){
  if(strlen($password ?? '') < 8){
    return 'Password must be at least 8 characters';
  }
  if(!preg_match('/[a-z]/', $password)){
    return 'Password must include a lowercase letter';
  }
  if(!preg_match('/[A-Z]/', $password)){
    return 'Password must include an uppercase letter';
  }
  if(!preg_match('/\d/', $password)){
    return 'Password must include a number';
  }
  if(!preg_match('/[^A-Za-z0-9]/', $password)){
    return 'Password must include a special character';
  }
  return '';
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

function getRegistrationOtp($pdo, $email){
  ensureRegistrationOtpTable($pdo);
  $stmt = $pdo->prepare('SELECT * FROM Registration_Otp WHERE email = ? LIMIT 1');
  $stmt->execute([strtolower(trim($email))]);
  return $stmt->fetch();
}

function upsertRegistrationOtp($pdo, $email, $code){
  ensureRegistrationOtpTable($pdo);
  $hash = password_hash($code, PASSWORD_BCRYPT);
  $stmt = $pdo->prepare('INSERT INTO Registration_Otp (email, otp_hash, expires_at, last_sent_at)
    VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NOW())
    ON DUPLICATE KEY UPDATE
      otp_hash = VALUES(otp_hash),
      expires_at = VALUES(expires_at),
      last_sent_at = VALUES(last_sent_at)');
  $stmt->execute([strtolower(trim($email)), $hash]);
}

function deleteRegistrationOtp($pdo, $email){
  ensureRegistrationOtpTable($pdo);
  $stmt = $pdo->prepare('DELETE FROM Registration_Otp WHERE email = ?');
  $stmt->execute([strtolower(trim($email))]);
}

function secondsUntilOtpCanResend($reset){
  if(!$reset || empty($reset['last_sent_at'])) return 0;
  $lastSent = strtotime($reset['last_sent_at']);
  if(!$lastSent) return 0;
  $elapsed = time() - $lastSent;
  return max(0, RESET_OTP_RESEND_SECONDS - $elapsed);
}

function getLoginAttempt($pdo, $identifier){
  ensureLoginAttemptTable($pdo);
  $stmt = $pdo->prepare('SELECT * FROM Login_Attempt WHERE identifier = ? LIMIT 1');
  $stmt->execute([$identifier]);
  return $stmt->fetch();
}

function secondsUntilLoginCanRetry($attempt){
  if(!$attempt || empty($attempt['locked_until'])) return 0;
  $lockedUntil = strtotime($attempt['locked_until']);
  if(!$lockedUntil) return 0;
  return max(0, $lockedUntil - time());
}

function recordFailedLogin($pdo, $identifier){
  ensureLoginAttemptTable($pdo);
  $attempt = getLoginAttempt($pdo, $identifier);
  $waitSeconds = secondsUntilLoginCanRetry($attempt);
  if($waitSeconds > 0) return $waitSeconds;

  $failedAttempts = 1;
  if($attempt){
    $lastFailed = strtotime($attempt['last_failed_at'] ?? '');
    $lockedUntil = strtotime($attempt['locked_until'] ?? '');
    if($lockedUntil && $lockedUntil <= time()){
      $failedAttempts = 1;
    } elseif($lastFailed && (time() - $lastFailed) <= 900){
      $failedAttempts = intval($attempt['failed_attempts']) + 1;
    }
  }

  $lockedUntilSql = null;
  if($failedAttempts >= LOGIN_FAILED_ATTEMPT_LIMIT){
    $lockedUntilSql = date('Y-m-d H:i:s', time() + LOGIN_COOLDOWN_SECONDS);
  }

  if($attempt){
    $stmt = $pdo->prepare('UPDATE Login_Attempt SET failed_attempts = ?, last_failed_at = NOW(), locked_until = ? WHERE identifier = ?');
    $stmt->execute([$failedAttempts, $lockedUntilSql, $identifier]);
  } else {
    $stmt = $pdo->prepare('INSERT INTO Login_Attempt (identifier, failed_attempts, last_failed_at, locked_until) VALUES (?, ?, NOW(), ?)');
    $stmt->execute([$identifier, $failedAttempts, $lockedUntilSql]);
  }

  return $lockedUntilSql ? LOGIN_COOLDOWN_SECONDS : 0;
}

function clearLoginAttempt($pdo, $identifier){
  ensureLoginAttemptTable($pdo);
  $stmt = $pdo->prepare('DELETE FROM Login_Attempt WHERE identifier = ?');
  $stmt->execute([$identifier]);
}

function sendOtpEmail($toEmail, $code, $type = 'password_reset'){
  global $cfg;

  $url = trim($cfg['mail_api_url'] ?? '');
  $secret = trim($cfg['mail_api_secret'] ?? '');
  if($url === '' || $secret === ''){
    throw new Exception('Mail API is not configured. Set MAIL_API_URL and MAIL_API_SECRET in Railway Variables.');
  }

  $isRegistration = $type === 'registration';
  $subject = $isRegistration
    ? 'Your Barangay Mambog II registration OTP'
    : 'Your Barangay Mambog II password reset OTP';
  $title = $isRegistration ? 'Account Registration Verification' : 'Password Reset Verification';
  $instruction = $isRegistration
    ? 'Use this 6-digit OTP to verify your email and finish creating your account:'
    : 'Use this 6-digit OTP to reset your account password:';
  $htmlInstruction = $isRegistration
    ? 'Use this 6-digit OTP to verify your email and finish creating your account.'
    : 'Use this 6-digit OTP to reset your account password.';

  $payload = json_encode([
    'secret' => $secret,
    'to' => $toEmail,
    'subject' => $subject,
    'body' => implode("\n", [
      'Barangay Mambog II',
      $title,
      '',
      $instruction,
      '',
      $code,
      '',
      'This code expires in 15 minutes.',
      'For your security, do not share this code with anyone.',
      '',
      'If you did not request a password reset, you can safely ignore this email.',
      '',
      'Barangay Mambog II Service & Complaint Management System',
    ]),
    'htmlBody' => '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#111827;line-height:1.55">'
      . '<div style="border:1px solid #dbeafe;border-radius:12px;overflow:hidden;background:#ffffff">'
      . '<div style="background:#2563eb;color:#ffffff;padding:18px 22px">'
      . '<div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Barangay Mambog II</div>'
      . '<div style="font-size:22px;font-weight:800;margin-top:4px">' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</div>'
      . '</div>'
      . '<div style="padding:22px">'
      . '<p style="margin:0 0 14px">' . htmlspecialchars($htmlInstruction, ENT_QUOTES, 'UTF-8') . '</p>'
      . '<div style="font-size:34px;font-weight:900;letter-spacing:10px;text-align:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 12px;color:#1d4ed8">'
      . htmlspecialchars($code, ENT_QUOTES, 'UTF-8')
      . '</div>'
      . '<p style="margin:18px 0 0;color:#374151">This code expires in <strong>15 minutes</strong>. For your security, do not share this code with anyone.</p>'
      . '<p style="margin:14px 0 0;color:#6b7280;font-size:14px">If you did not request a password reset, you can safely ignore this email.</p>'
      . '</div>'
      . '</div>'
      . '<p style="margin:14px 0 0;text-align:center;color:#6b7280;font-size:12px">Barangay Mambog II Service &amp; Complaint Management System</p>'
      . '</div>',
    'fromName' => $cfg['mail_from_name'] ?? 'Barangay Mambog II',
  ]);

  $context = stream_context_create([
    'http' => [
      'method' => 'POST',
      'header' => "Content-Type: application/json\r\n",
      'content' => $payload,
      'timeout' => 12,
      'ignore_errors' => true,
      'follow_location' => 1,
      'max_redirects' => 5,
    ],
  ]);

  $response = @file_get_contents($url, false, $context);
  $status = getLastHttpStatus($http_response_header ?? []);
  $location = getHttpHeaderValue($http_response_header ?? [], 'Location');

  if($status >= 300 && $status < 400 && $location){
    $redirectContext = stream_context_create([
      'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/json\r\n",
        'content' => $payload,
        'timeout' => 12,
        'ignore_errors' => true,
      ],
    ]);
    $response = @file_get_contents($location, false, $redirectContext);
    $status = getLastHttpStatus($http_response_header ?? []);
  }

  $result = json_decode($response ?: '', true);
  if($status < 200 || $status >= 300 || !is_array($result) || empty($result['success'])){
    $message = is_array($result) && !empty($result['message']) ? $result['message'] : 'Mail API request failed';
    if(strcasecmp($message, 'Unauthorized') === 0){
      $message = 'Unauthorized - MAIL_API_SECRET in Railway does not match SECRET in Google Apps Script';
    }
    if($status) $message .= ' (HTTP ' . $status . ')';
    if(!$response && !empty($http_response_header)){
      $message .= ': ' . implode(' ', array_slice($http_response_header, 0, 2));
    }
    throw new Exception($message);
  }

  if(!array_key_exists('sent', $result) || empty($result['sent'])){
    throw new Exception('Mail API did not confirm that the email was sent. Update and redeploy the Google Apps Script mail relay.');
  }

  if(!empty($result['sentTo']) && strcasecmp(trim($result['sentTo']), trim($toEmail)) !== 0){
    throw new Exception('Mail API sent the email to a different recipient');
  }
}

function getLastHttpStatus($headers){
  $status = 0;
  foreach($headers as $header){
    if(preg_match('#HTTP/\S+\s+(\d+)#', $header, $m)){
      $status = intval($m[1]);
    }
  }
  return $status;
}

function getHttpHeaderValue($headers, $name){
  foreach($headers as $header){
    if(stripos($header, $name . ':') === 0){
      return trim(substr($header, strlen($name) + 1));
    }
  }
  return '';
}

function findUserByToken($pdo, $token){
  if(!$token) return null;
  // check residents
  if(tableExists($pdo, 'Resident')){
    $stmt = $pdo->prepare('SELECT resident_id as id, first_name, middle_name, last_name, birth_date, address, email, account_status, suspension_end_date, "resident" as role FROM Resident WHERE api_token = ?');
    $stmt->execute([$token]);
    $r = $stmt->fetch();
    if($r){
      $restriction = getAccountRestriction($pdo, 'Resident', 'resident_id', $r['id'], $r['account_status'] ?? '', $r['suspension_end_date'] ?? null);
      if($restriction) return null;
      return $r;
    }
  }
  // check staff
  if(tableExists($pdo, 'Staff')){
    $stmt = $pdo->prepare('SELECT staff_id as id, full_name as first_name, email, account_status, suspension_end_date, "staff" as role FROM Staff WHERE api_token = ?');
    $stmt->execute([$token]);
    $s = $stmt->fetch();
    if($s){
      $restriction = getAccountRestriction($pdo, 'Staff', 'staff_id', $s['id'], $s['account_status'] ?? '', $s['suspension_end_date'] ?? null);
      if($restriction) return null;
      return $s;
    }
  }
  return null;
}

function findUserByEmail($pdo, $email){
  if(!$email) return null;
  if(tableExists($pdo, 'Resident')){
    $stmt = $pdo->prepare('SELECT resident_id AS id, first_name, last_name, email, password, api_token, account_status, suspension_end_date, "resident" AS role FROM Resident WHERE email = ?');
    $stmt->execute([$email]);
    $r = $stmt->fetch();
    if($r) return $r;
  }
  if(tableExists($pdo, 'Staff')){
    $stmt = $pdo->prepare('SELECT staff_id AS id, full_name AS first_name, email, password, api_token, account_status, suspension_end_date, "staff" AS role FROM Staff WHERE email = ?');
    $stmt->execute([$email]);
    return $stmt->fetch();
  }
  return null;
}

function getAccountRestriction($pdo, $table, $keyColumn, $id, $status, $suspensionEndDate){
  $accountStatus = trim($status ?? '');
  if(strcasecmp($accountStatus, 'Banned') === 0){
    return ['status'=>'Banned','message'=>'Your account has been banned. Please contact the barangay at '.BARANGAY_CONTACT_EMAIL.' for assistance.','contact_email'=>BARANGAY_CONTACT_EMAIL];
  }
  if(strcasecmp($accountStatus, 'Suspended') === 0){
    $now = new DateTime('now');
    if(!empty(trim($suspensionEndDate ?? ''))){
      $end = DateTime::createFromFormat('Y-m-d', $suspensionEndDate);
      if($end){
        $end->setTime(23, 59, 59);
      }
      if($end && $end >= $now){
        return ['status'=>'Suspended','message'=>'Your account is suspended until '.$end->format('F j, Y').'. Please contact the barangay at '.BARANGAY_CONTACT_EMAIL.' for assistance.','suspension_end_date'=>$suspensionEndDate,'contact_email'=>BARANGAY_CONTACT_EMAIL];
      }
      $pdo->prepare("UPDATE {$table} SET account_status = ?, suspension_end_date = NULL WHERE {$keyColumn} = ?")->execute(['Active', $id]);
      return null;
    }
    return ['status'=>'Suspended','message'=>'Your account is suspended. Please contact the barangay at '.BARANGAY_CONTACT_EMAIL.' for assistance.','contact_email'=>BARANGAY_CONTACT_EMAIL];
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

  restoreAdminAccount($pdo);

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

function deleteNotificationForUser($pdo, $user, $notificationId){
  if(!$user) return 0;
  if($user['role'] === 'staff'){
    $stmt = $pdo->prepare('DELETE FROM Notification WHERE notification_id = ? AND resident_id IS NULL');
    $stmt->execute([$notificationId]);
    return $stmt->rowCount();
  }
  $stmt = $pdo->prepare('DELETE FROM Notification WHERE notification_id = ? AND resident_id = ?');
  $stmt->execute([$notificationId, $user['id']]);
  return $stmt->rowCount();
}

function deleteAllNotificationsForUser($pdo, $user){
  if(!$user) return 0;
  if($user['role'] === 'staff'){
    $stmt = $pdo->prepare('DELETE FROM Notification WHERE resident_id IS NULL');
    $stmt->execute([]);
    return $stmt->rowCount();
  }
  $stmt = $pdo->prepare('DELETE FROM Notification WHERE resident_id = ?');
  $stmt->execute([$user['id']]);
  return $stmt->rowCount();
}

function getUnreadNotificationCount($pdo, $user){
  if(!$user) return 0;
  if($user['role'] === 'staff'){
    $stmt = $pdo->prepare('SELECT COUNT(*) AS c FROM Notification WHERE resident_id IS NULL AND is_read = FALSE');
    $stmt->execute([]);
  } else {
    $stmt = $pdo->prepare('SELECT COUNT(*) AS c FROM Notification WHERE resident_id = ? AND is_read = FALSE');
    $stmt->execute([$user['id']]);
  }
  $row = $stmt->fetch();
  return $row ? intval($row['c']) : 0;
}

try {
  purgeExpiredArchiveItems($pdo);
} catch(Throwable $e) {
  error_log('Archive purge failed: ' . $e->getMessage());
}

// Route: /register-otp
if($uri === '/register-otp' && $method === 'POST'){
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['email'])) json(['success'=>false,'message'=>'Email is required'], 400);
  $email = normalizeEmail($data['email']);
  $emailError = validateRegistrationEmail($email);
  if($emailError) json(['success'=>false,'message'=>$emailError], 400);
  if(findUserByEmail($pdo, $email)) json(['success'=>false,'message'=>'Email already registered'], 409);

  $existingOtp = getRegistrationOtp($pdo, $email);
  $waitSeconds = secondsUntilOtpCanResend($existingOtp);
  if($waitSeconds > 0){
    json([
      'success'=>false,
      'message'=>'Please wait before requesting another OTP.',
      'retry_after'=>$waitSeconds
    ], 429);
  }

  $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

  try {
    upsertRegistrationOtp($pdo, $email, $code);
    sendOtpEmail($email, $code, 'registration');
  } catch (Exception $e) {
    deleteRegistrationOtp($pdo, $email);
    error_log('Registration OTP email failed: ' . $e->getMessage());
    json(['success'=>false,'message'=>'Unable to send OTP email: '.$e->getMessage()], 502);
  }

  json([
    'success'=>true,
    'message'=>'OTP sent to your email.',
    'expires_in'=>REGISTRATION_OTP_TTL_SECONDS,
    'resend_after'=>REGISTRATION_OTP_RESEND_SECONDS
  ]);
}

// Route: /register
if($uri === '/register' && $method === 'POST'){
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['email']) || empty($data['password']) || empty($data['otp'])) json(['success'=>false,'message'=>'Email, password, and OTP are required'], 400);
  $email = normalizeEmail($data['email']);
  $emailError = validateRegistrationEmail($email);
  if($emailError) json(['success'=>false,'message'=>$emailError], 400);
  $passwordError = validateStrongPassword($data['password']);
  if($passwordError) json(['success'=>false,'message'=>$passwordError], 400);
  // check unique
  if(findUserByEmail($pdo, $email)) json(['success'=>false,'message'=>'Email already registered'], 409);

  $registrationOtp = getRegistrationOtp($pdo, $email);
  if(!$registrationOtp) json(['success'=>false,'message'=>'Please request a registration OTP first'], 400);
  if(strtotime($registrationOtp['expires_at']) < time()){
    deleteRegistrationOtp($pdo, $email);
    json(['success'=>false,'message'=>'Registration code expired. Please request a new OTP.'], 400);
  }
  if(!password_verify(trim($data['otp']), $registrationOtp['otp_hash'])) json(['success'=>false,'message'=>'Invalid registration code'], 400);

  $hash = password_hash($data['password'], PASSWORD_BCRYPT);
  $stmt = $pdo->prepare('INSERT INTO Resident (first_name, middle_name, last_name, birth_date, gender, address, email, password, account_status, registration_date) VALUES (?,?,?,?,?,?,?,?,"Active",NOW())');
  $stmt->execute([$data['first_name'] ?? '', $data['middle_name'] ?? '', $data['last_name'] ?? '', $data['birth_date'] ?? null, $data['gender'] ?? null, $data['address'] ?? null, $email, $hash]);
  $id = $pdo->lastInsertId();
  $token = bin2hex(random_bytes(16));
  $pdo->prepare('UPDATE Resident SET api_token = ? WHERE resident_id = ?')->execute([$token, $id]);  $residentName = trim(($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? '')) ?: $data['email'];
  deleteRegistrationOtp($pdo, $email);
  createNotification($pdo, null, 'New resident registration: ' . $residentName, 'registration');  json(['success'=>true,'token'=>$token,'user'=>['id'=>$id,'email'=>$email,'role'=>'resident']]);
}

// Route: /login
if($uri === '/login' && $method === 'POST'){
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['email']) || empty($data['password'])) json(['success'=>false,'message'=>'Email and password required']);
  $loginIdentifier = normalizeEmail($data['email']);
  $loginWaitSeconds = secondsUntilLoginCanRetry(getLoginAttempt($pdo, $loginIdentifier));
  if($loginWaitSeconds > 0){
    json([
      'success'=>false,
      'message'=>'Too many failed login attempts. Please wait 3 minutes before trying again.',
      'retry_after'=>$loginWaitSeconds
    ], 429);
  }
  if($loginIdentifier === 'admin@gmail.com'){
    restoreAdminAccount($pdo);
  }
  // try staff
  if(tableExists($pdo, 'Staff')){
    $stmt = $pdo->prepare('SELECT staff_id, full_name, email, password, account_status, suspension_end_date FROM Staff WHERE email = ?');
    $stmt->execute([$loginIdentifier]);
    $s = $stmt->fetch();
    if($s && password_verify($data['password'], $s['password'])){
      $restriction = getAccountRestriction($pdo, 'Staff', 'staff_id', $s['staff_id'], $s['account_status'] ?? '', $s['suspension_end_date'] ?? null);
      if($restriction){
        json(array_merge(['success'=>false], $restriction));
      }
      $token = bin2hex(random_bytes(16));
      $pdo->prepare('UPDATE Staff SET api_token = ? WHERE staff_id = ?')->execute([$token, $s['staff_id']]);
      clearLoginAttempt($pdo, $loginIdentifier);
      json(['success'=>true,'token'=>$token,'user'=>['id'=>$s['staff_id'],'name'=>$s['full_name'],'role'=>'staff']]);
    }
  }
  // try resident
  if(tableExists($pdo, 'Resident')){
    $stmt = $pdo->prepare('SELECT resident_id, first_name, last_name, email, password, account_status, suspension_end_date FROM Resident WHERE email = ?');
    $stmt->execute([$loginIdentifier]);
    $r = $stmt->fetch();
    if($r && password_verify($data['password'], $r['password'])){
      $restriction = getAccountRestriction($pdo, 'Resident', 'resident_id', $r['resident_id'], $r['account_status'] ?? '', $r['suspension_end_date'] ?? null);
      if($restriction){
        json(array_merge(['success'=>false], $restriction));
      }
      $token = bin2hex(random_bytes(16));
      $pdo->prepare('UPDATE Resident SET api_token = ? WHERE resident_id = ?')->execute([$token, $r['resident_id']]);
      clearLoginAttempt($pdo, $loginIdentifier);
      json(['success'=>true,'token'=>$token,'user'=>['id'=>$r['resident_id'],'name'=>($r['first_name'].' '.$r['last_name']),'role'=>'resident','account_status'=>$r['account_status'],'suspension_end_date'=>$r['suspension_end_date']]]);
    }
  }
  $retryAfter = recordFailedLogin($pdo, $loginIdentifier);
  if($retryAfter > 0){
    json([
      'success'=>false,
      'message'=>'Too many failed login attempts. Please wait 3 minutes before trying again.',
      'retry_after'=>$retryAfter
    ], 429);
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
    $restriction = getAccountRestriction($pdo, $table, $key, $user['id'], $user['account_status'] ?? '', $user['suspension_end_date'] ?? null);
    if($restriction){
      json(array_merge(['success'=>false], $restriction));
    }
  }
  json(['success'=>true,'user'=>$user]);
}

// Route: /profile - update current user profile/password
if($uri === '/profile' && in_array($method, ['PATCH', 'PUT', 'POST'])){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);

  $data = json_decode(file_get_contents('php://input'), true) ?: [];
  $fields = [];
  $vals = [];

  if($user['role'] === 'staff'){
    $name = trim($data['name'] ?? (($data['first_name'] ?? '') . ' ' . ($data['last_name'] ?? '')));
    if($name !== ''){
      $fields[] = 'full_name = ?';
      $vals[] = $name;
    }
    if(isset($data['password']) && trim($data['password']) !== ''){
      $passwordError = validateStrongPassword($data['password']);
      if($passwordError) json(['success'=>false,'message'=>$passwordError], 400);
      $fields[] = 'password = ?';
      $vals[] = password_hash($data['password'], PASSWORD_BCRYPT);
    }
    if(count($fields) === 0) json(['success'=>false,'message'=>'Nothing to update'], 400);
    $vals[] = $user['id'];
    $pdo->prepare('UPDATE Staff SET ' . implode(', ', $fields) . ' WHERE staff_id = ?')->execute($vals);
  } else {
    if(isset($data['first_name'])){ $fields[] = 'first_name = ?'; $vals[] = trim($data['first_name']); }
    if(isset($data['middle_name'])){ $fields[] = 'middle_name = ?'; $vals[] = trim($data['middle_name']); }
    if(isset($data['last_name'])){ $fields[] = 'last_name = ?'; $vals[] = trim($data['last_name']); }
    if(isset($data['address'])){ $fields[] = 'address = ?'; $vals[] = trim($data['address']); }
    if(isset($data['password']) && trim($data['password']) !== ''){
      $passwordError = validateStrongPassword($data['password']);
      if($passwordError) json(['success'=>false,'message'=>$passwordError], 400);
      $fields[] = 'password = ?';
      $vals[] = password_hash($data['password'], PASSWORD_BCRYPT);
    }
    if(count($fields) === 0) json(['success'=>false,'message'=>'Nothing to update'], 400);
    $vals[] = $user['id'];
    $pdo->prepare('UPDATE Resident SET ' . implode(', ', $fields) . ' WHERE resident_id = ?')->execute($vals);
  }

  $updated = findUserByToken($pdo, $token);
  json(['success'=>true,'user'=>$updated]);
}

// Route: /forgot-password
if($uri === '/forgot-password' && $method === 'POST'){
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['email'])) json(['success'=>false,'message'=>'Email is required'], 400);
  if(!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) json(['success'=>false,'message'=>'Enter a valid email address'], 400);
  $user = findUserByEmail($pdo, $data['email']);
  if(!$user) json(['success'=>false,'message'=>'Email not found'], 404);

  $existingReset = getPasswordReset($pdo, $user);
  $waitSeconds = secondsUntilOtpCanResend($existingReset);
  if($waitSeconds > 0){
    json([
      'success'=>false,
      'message'=>'Please wait before requesting another OTP.',
      'retry_after'=>$waitSeconds
    ], 429);
  }

  $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

  try {
    upsertPasswordResetOtp($pdo, $user, $code);
    sendOtpEmail($user['email'], $code);
  } catch (Exception $e) {
    deletePasswordResetOtp($pdo, $user);
    error_log('Password reset OTP email failed: ' . $e->getMessage());
    json(['success'=>false,'message'=>'Unable to send OTP email: '.$e->getMessage()], 502);
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
  if(empty($data['email']) || empty($data['token']) || empty($data['password'])) json(['success'=>false,'message'=>'Email, reset code, and password are required'], 400);
  if(!filter_var($data['email'], FILTER_VALIDATE_EMAIL)) json(['success'=>false,'message'=>'Enter a valid email address'], 400);
  $user = findUserByEmail($pdo, $data['email']);
  if(!$user) json(['success'=>false,'message'=>'Email not found'], 404);

  $reset = getPasswordReset($pdo, $user);
  if(!$reset || !empty($reset['used_at'])) json(['success'=>false,'message'=>'Invalid or expired reset code'], 400);
  if(strtotime($reset['expires_at']) < time()){
    deletePasswordResetOtp($pdo, $user);
    json(['success'=>false,'message'=>'Reset code expired. Please request a new OTP.'], 400);
  }
  if(!password_verify(trim($data['token']), $reset['otp_hash'])) json(['success'=>false,'message'=>'Invalid reset code'], 400);
  if(strlen($data['password']) < 6) json(['success'=>false,'message'=>'Password must be at least 6 characters'], 400);

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

// Route: /categories - complaint categories shared by admin and residents
if($uri === '/categories'){
  ensureDefaultCategories($pdo);

  if($method === 'GET'){
    $stmt = $pdo->query('SELECT category_id, category_name, description FROM Category ORDER BY ' . categoryOrderSql());
    json(['success'=>true,'data'=>$stmt->fetchAll()]);
  }

  if($method === 'PUT' || $method === 'POST'){
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
    if($user['role'] !== 'staff') json(['success'=>false,'message'=>'Forbidden'], 403);

    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $categories = $data['categories'] ?? [];
    if(!is_array($categories)) json(['success'=>false,'message'=>'Categories must be an array'], 400);

    $names = [];
    foreach($categories as $category){
      $name = is_array($category) ? trim($category['category_name'] ?? $category['name'] ?? '') : trim($category);
      if($name !== '') $names[] = canonicalCategoryName($name);
    }
    $dedupedNames = [];
    foreach($names as $name){
      $key = strtolower($name);
      if(!isset($dedupedNames[$key])) $dedupedNames[$key] = $name;
    }
    $names = array_values($dedupedNames);
    $lowerNames = array_map('strtolower', $names);
    if(!in_array('other', $lowerNames, true) && !in_array('others', $lowerNames, true)){
      $names[] = 'Other';
    }

    $pdo->beginTransaction();
    try {
      $existingStmt = $pdo->query('SELECT category_id, category_name FROM Category');
      $existing = [];
      foreach($existingStmt->fetchAll() as $row){
        $existing[strtolower(canonicalCategoryName($row['category_name']))] = $row;
      }

      $insertStmt = $pdo->prepare('INSERT INTO Category (category_name, description) VALUES (?, ?)');
      foreach($names as $name){
        if(!isset($existing[strtolower($name)])){
          $insertStmt->execute([$name, null]);
        }
      }

      if(count($names) > 0){
        $placeholders = implode(',', array_fill(0, count($names), '?'));
        $deleteSql = 'DELETE FROM Category
          WHERE category_name NOT IN (' . $placeholders . ')
          AND LOWER(category_name) NOT IN (\'other\', \'others\')
          AND category_id NOT IN (SELECT DISTINCT category_id FROM Complaint WHERE category_id IS NOT NULL)';
        $pdo->prepare($deleteSql)->execute($names);
      }

      consolidateDuplicateCategories($pdo);
      $pdo->commit();
    } catch(Exception $e){
      $pdo->rollBack();
      json(['success'=>false,'message'=>'Failed to save categories'], 500);
    }

    $stmt = $pdo->query('SELECT category_id, category_name, description FROM Category ORDER BY ' . categoryOrderSql());
    json(['success'=>true,'data'=>$stmt->fetchAll()]);
  }
}

function restoreAdminAccount($pdo){
  if(!tableExists($pdo, 'Staff')){
    return;
  }

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
    $pdo->prepare('INSERT INTO Staff (full_name, role, email, password, account_status) VALUES (?, ?, ?, ?, ?)')
      ->execute(['Admin', 'Admin', $adminEmail, $adminHash, 'Active']);
  }
}

// Route: /document-types - document availability shared by admin and residents
if($uri === '/document-types'){
  ensureDocumentTypeTable($pdo);

  if($method === 'GET'){
    $stmt = $pdo->query('SELECT document_type_id, document_name, status FROM Document_Type ORDER BY document_type_id ASC');
    json(['success'=>true,'data'=>$stmt->fetchAll()]);
  }

  if($method === 'PUT' || $method === 'POST'){
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
    if($user['role'] !== 'staff') json(['success'=>false,'message'=>'Forbidden'], 403);

    $data = json_decode(file_get_contents('php://input'), true) ?: [];
    $documentTypes = $data['document_types'] ?? $data['documents'] ?? [];
    if(!is_array($documentTypes)) json(['success'=>false,'message'=>'Document types must be an array'], 400);

    $pdo->beginTransaction();
    try {
      $pdo->exec('DELETE FROM Document_Type');
      $stmt = $pdo->prepare('INSERT INTO Document_Type (document_name, status) VALUES (?, ?)');
      foreach($documentTypes as $item){
        $name = is_array($item) ? trim($item['document_name'] ?? $item['name'] ?? '') : trim($item);
        if($name === '') continue;
        $status = is_array($item) ? strtolower(trim($item['status'] ?? 'enabled')) : 'enabled';
        $stmt->execute([$name, $status === 'disabled' ? 'disabled' : 'enabled']);
      }
      $pdo->commit();
    } catch(Exception $e){
      $pdo->rollBack();
      json(['success'=>false,'message'=>'Failed to save document types'], 500);
    }

    $stmt = $pdo->query('SELECT document_type_id, document_name, status FROM Document_Type ORDER BY document_type_id ASC');
    json(['success'=>true,'data'=>$stmt->fetchAll()]);
  }
}

// Route: /complaints GET (list) or POST (create)
if($uri === '/complaints'){
  ensureComplaintExtraColumns($pdo);
  if($method === 'GET'){
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);

    if($user['role'] === 'staff'){
      $stmt = $pdo->query(getComplaintSelectSql());
      $rows = maskAnonymousComplaints($stmt->fetchAll(), true);
    } else {
      $stmt = $pdo->prepare(getComplaintSelectSql('WHERE c.resident_id = ?'));
      $stmt->execute([$user['id']]);
      $rows = maskAnonymousComplaints($stmt->fetchAll(), false);
    }

    $rows = attachComplaintMedia($pdo, $rows);
    json(['success'=>true,'data'=>$rows]);
  }
  if($method === 'POST'){
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if(stripos($contentType, 'multipart/form-data') !== false){
      $data = $_POST;
    } else {
      $data = json_decode(file_get_contents('php://input'), true) ?: [];
    }
    $stmt = $pdo->prepare('INSERT INTO Complaint (resident_id, category_id, assigned_staff_id, title, description, incident_location, incident_date, anonymous, respondent_name, status, date_submitted, date_updated) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, "Submitted", NOW(), NOW())');
    $stmt->execute([$user['id'], $data['category_id'] ?? null, $data['title'] ?? '', $data['description'] ?? '', $data['incident_location'] ?? '', $data['incident_date'] ?? null, !empty($data['anonymous']) ? 1 : 0, $data['respondent_name'] ?? null]);
    $complaintId = $pdo->lastInsertId();
    saveComplaintUploads($pdo, $complaintId);

    $isAnonymous = !empty($data['anonymous']);
    $authorName = $isAnonymous ? 'Anonymous' : (trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: ($user['email'] ?? 'Resident'));
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
  ensureComplaintExtraColumns($pdo);
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  $id = intval($m[1]);

  $stmt = $pdo->prepare('SELECT resident_id, status, date_submitted, title, description FROM Complaint WHERE complaint_id = ?');
  $stmt->execute([$id]);
  $existingComplaint = $stmt->fetch();
  if(!$existingComplaint) json(['success'=>false,'message'=>'Complaint not found'], 404);

  $isOwner = $user['role'] !== 'staff' && intval($existingComplaint['resident_id']) === intval($user['id']);
  if($user['role'] !== 'staff'){
    if(!$isOwner) json(['success'=>false,'message'=>'Forbidden'], 403);
    if(strcasecmp($existingComplaint['status'] ?? '', 'Submitted') !== 0) json(['success'=>false,'message'=>'Cannot edit a complaint that is already in process or completed.'], 403);
    $submittedAt = strtotime(str_replace(' ', 'T', $existingComplaint['date_submitted']) . 'Z');
    if($submittedAt && time() - $submittedAt > 15 * 60){
      json(['success'=>false,'message'=>'Cannot edit - 15 minutes have passed since submission'], 403);
    }
  }

  $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
  if(stripos($contentType, 'multipart/form-data') !== false){
    $data = $_POST;
  } else {
    $data = json_decode(file_get_contents('php://input'), true) ?: [];
  }
  $fields = [];
  $vals = [];
  $statusUpdate = false;
  $newStatus = null;
  if($user['role'] === 'staff' && isset($data['status'])){ $fields[] = 'status = ?'; $vals[] = $data['status']; $statusUpdate = true; $newStatus = $data['status']; }
  if($user['role'] === 'staff' && isset($data['assigned_staff_id'])){ $fields[] = 'assigned_staff_id = ?'; $vals[] = $data['assigned_staff_id']; }
  if($user['role'] === 'staff' && isset($data['resolution_notes'])){ $fields[] = 'resolution_notes = ?'; $vals[] = $data['resolution_notes']; }
  if(isset($data['title'])){ $fields[] = 'title = ?'; $vals[] = $data['title']; }
  if(isset($data['description'])){ $fields[] = 'description = ?'; $vals[] = $data['description']; }
  if(isset($data['location'])){ $fields[] = 'incident_location = ?'; $vals[] = $data['location']; }
  if(isset($data['incident_location'])){ $fields[] = 'incident_location = ?'; $vals[] = $data['incident_location']; }
  if(isset($data['date'])){ $fields[] = 'incident_date = ?'; $vals[] = $data['date'] ?: null; }
  if(isset($data['incident_date'])){ $fields[] = 'incident_date = ?'; $vals[] = $data['incident_date'] ?: null; }
  if(isset($data['category_id'])){ $fields[] = 'category_id = ?'; $vals[] = $data['category_id']; }
  if(isset($data['anonymous'])){ $fields[] = 'anonymous = ?'; $vals[] = !empty($data['anonymous']) ? 1 : 0; }
  if(isset($data['respondent_name'])){ $fields[] = 'respondent_name = ?'; $vals[] = $data['respondent_name']; }
  $removedAttachmentIds = [];
  if(isset($data['removed_attachment_ids'])){
    $decodedIds = is_array($data['removed_attachment_ids']) ? $data['removed_attachment_ids'] : json_decode($data['removed_attachment_ids'], true);
    if(is_array($decodedIds)) $removedAttachmentIds = $decodedIds;
  }

  $hasUploads = !empty($_FILES['attachments']) || !empty($_FILES['attachments[]']);
  if(count($fields) === 0 && count($removedAttachmentIds) === 0 && !$hasUploads) json(['success'=>false,'message'=>'Nothing to update']);

  if(count($fields) > 0 || count($removedAttachmentIds) > 0 || $hasUploads){
    $fields[] = 'date_updated = NOW()';
    if($statusUpdate && in_array(strtolower($newStatus ?? ''), ['resolved', 'closed'], true)){
      $fields[] = 'date_resolved = NOW()';
    }
  }

  if($statusUpdate){
    $complaint = $existingComplaint;
    if($complaint && !empty($complaint['resident_id'])){
      $title = trim($complaint['title'] ?: $complaint['description'] ?: 'Complaint');
      createNotification($pdo, intval($complaint['resident_id']), 'Your complaint "' . $title . '" status is now ' . $newStatus . '.', 'complaint_status');
    }
  }

  if(count($fields) > 0){
    $vals[] = $id;
    $sql = 'UPDATE Complaint SET '.implode(', ', $fields).' WHERE complaint_id = ?';
    $pdo->prepare($sql)->execute($vals);
  }

  deleteComplaintAttachments($pdo, $id, $removedAttachmentIds);
  saveComplaintUploads($pdo, $id);

  $stmt = $pdo->prepare(getComplaintSelectSql('WHERE c.complaint_id = ?'));
  $stmt->execute([$id]);
  $rows = attachComplaintMedia($pdo, maskAnonymousComplaints($stmt->fetchAll(), $user['role'] === 'staff'));
  json(['success'=>true,'data'=>$rows[0] ?? null]);
}

// Route: /complaints/{id} - delete complaint
if(preg_match('#^/complaints/(\d+)$#', $uri, $m) && $method === 'DELETE'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);

  $id = intval($m[1]);
  $stmt = $pdo->prepare('SELECT * FROM Complaint WHERE complaint_id = ?');
  $stmt->execute([$id]);
  $complaint = $stmt->fetch();
  if(!$complaint) json(['success'=>false,'message'=>'Complaint not found']);

  $isStaffUser = in_array($user['role'] ?? '', ['staff', 'admin'], true);
  $isOwner = (!$isStaffUser && intval($complaint['resident_id']) === intval($user['id']));
  if(!$isStaffUser && !$isOwner) json(['success'=>false,'message'=>'Forbidden']);

  ensureComplaintAttachmentTable($pdo);
  $attachmentsStmt = $pdo->prepare('SELECT * FROM Complaint_Attachment WHERE complaint_id = ? ORDER BY upload_date ASC');
  $attachmentsStmt->execute([$id]);
  createArchiveItem(
    $pdo,
    'complaint',
    $id,
    $complaint['resident_id'] ?? null,
    trim($complaint['title'] ?? '') ?: ('Complaint #' . $id),
    ['record' => $complaint, 'attachments' => $attachmentsStmt->fetchAll()],
    $user
  );
  $pdo->prepare('DELETE FROM Complaint WHERE complaint_id = ?')->execute([$id]);
  json(['success'=>true]);
}

// Route: /docs GET/POST
if($uri === '/docs'){
  if($method === 'GET'){
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);

    if($user['role'] === 'staff'){
      $stmt = $pdo->query('SELECT *, full_name AS name, birth_date AS birthdate FROM Document_Request ORDER BY date_requested DESC LIMIT 200');
      $rows = $stmt->fetchAll();
    } else {
      $stmt = $pdo->prepare('SELECT *, full_name AS name, birth_date AS birthdate FROM Document_Request WHERE resident_id = ? ORDER BY date_requested DESC LIMIT 200');
      $stmt->execute([$user['id']]);
      $rows = $stmt->fetchAll();
    }

    json(['success'=>true,'data'=>$rows]);
  }
  if($method === 'POST'){
    ensureDocumentTypeTable($pdo);
    $token = getBearerToken();
    $user = findUserByToken($pdo, $token);
    if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
    $data = json_decode(file_get_contents('php://input'), true);
    $requestedType = trim($data['document_type'] ?? '');
    $typeStmt = $pdo->prepare('SELECT status FROM Document_Type WHERE document_name = ? LIMIT 1');
    $typeStmt->execute([$requestedType]);
    $documentTypeRow = $typeStmt->fetch();
    if($documentTypeRow && strtolower($documentTypeRow['status'] ?? '') === 'disabled'){
      json(['success'=>false,'message'=>'This document type is currently frozen by the administrator.'], 403);
    }
    $fullName = trim($data['name'] ?? '');
    if($fullName === ''){
      $fullName = trim(($user['first_name'] ?? '') . ' ' . ($user['middle_name'] ?? '') . ' ' . ($user['last_name'] ?? ''));
    }
    $stmt = $pdo->prepare('INSERT INTO Document_Request (resident_id, processed_by, full_name, birth_date, address, document_type, purpose, status, reference_number, date_requested) VALUES (?, NULL, ?, ?, ?, ?, ?, "Submitted", NULL, NOW())');
    $stmt->execute([$user['id'], $fullName, $data['birthdate'] ?? null, $data['address'] ?? '', $requestedType, $data['purpose'] ?? '']);
    $requestId = $pdo->lastInsertId();
    $ref = 'DOC-' . date('Y') . '-' . str_pad($requestId, 4, '0', STR_PAD_LEFT);
    $pdo->prepare('UPDATE Document_Request SET reference_number = ? WHERE request_id = ?')->execute([$ref, $requestId]);
    createNotification($pdo, null, 'New document request submitted by ' . trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) . ': ' . trim($requestedType ?: $ref), 'document_request');
    json(['success'=>true,'id'=>$requestId,'reference'=>$ref]);
  }
}

// Route: /docs/{id} - update/delete document request
if(preg_match('#^/docs/(\d+)$#', $uri, $m) && in_array($method, ['PUT','PATCH','POST','DELETE'])){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  $id = intval($m[1]);
  $stmt = $pdo->prepare('SELECT resident_id, status, reference_number, document_type, date_requested FROM Document_Request WHERE request_id = ?');
  $stmt->execute([$id]);
  $request = $stmt->fetch();
  if(!$request) json(['success'=>false,'message'=>'Document request not found'], 404);
  $isStaffUser = in_array($user['role'] ?? '', ['staff', 'admin'], true);
  $isOwner = !$isStaffUser && intval($request['resident_id']) === intval($user['id']);

  if($method === 'DELETE'){
    if(!$isStaffUser && !$isOwner) json(['success'=>false,'message'=>'Forbidden']);
    $fullStmt = $pdo->prepare('SELECT * FROM Document_Request WHERE request_id = ?');
    $fullStmt->execute([$id]);
    $fullRequest = $fullStmt->fetch();
    createArchiveItem(
      $pdo,
      'document',
      $id,
      $request['resident_id'] ?? null,
      trim(($request['document_type'] ?? '') . ' ' . ($request['reference_number'] ?? '')) ?: ('Document request #' . $id),
      ['record' => $fullRequest],
      $user
    );
    $pdo->prepare('DELETE FROM Document_Request WHERE request_id = ?')->execute([$id]);
    json(['success'=>true]);
  }

  $data = json_decode(file_get_contents('php://input'), true) ?: [];
  $residentMarksReceived = $isOwner
    && count($data) === 1
    && isset($data['status'])
    && strcasecmp($data['status'], 'Received') === 0
    && strcasecmp($request['status'] ?? '', 'Released') === 0;

  if($user['role'] !== 'staff' && !$residentMarksReceived){
    if(!$isOwner) json(['success'=>false,'message'=>'Forbidden'], 403);
    if(strcasecmp($request['status'] ?? '', 'Submitted') !== 0){
      json(['success'=>false,'message'=>'Cannot edit a document request that is already in process or completed.'], 403);
    }
    $editWindowStmt = $pdo->prepare('SELECT TIMESTAMPDIFF(SECOND, date_requested, NOW()) AS elapsed_seconds FROM Document_Request WHERE request_id = ?');
    $editWindowStmt->execute([$id]);
    $editWindow = $editWindowStmt->fetch();
    if($editWindow && intval($editWindow['elapsed_seconds']) > 15 * 60){
      json(['success'=>false,'message'=>'Cannot edit - 15 minutes have passed since request'], 403);
    }
  }

  $fields = [];
  $vals = [];
  $statusUpdate = false;
  $newStatus = null;
  if(($user['role'] === 'staff' || $residentMarksReceived) && isset($data['status'])){ $fields[] = 'status = ?'; $vals[] = $data['status']; $statusUpdate = true; $newStatus = $data['status']; }
  if($user['role'] === 'staff' && isset($data['processed_by'])){ $fields[] = 'processed_by = ?'; $vals[] = $data['processed_by']; }
  if(isset($data['name'])){ $fields[] = 'full_name = ?'; $vals[] = $data['name']; }
  if(isset($data['full_name'])){ $fields[] = 'full_name = ?'; $vals[] = $data['full_name']; }
  if(isset($data['birthdate'])){ $fields[] = 'birth_date = ?'; $vals[] = $data['birthdate'] ?: null; }
  if(isset($data['birth_date'])){ $fields[] = 'birth_date = ?'; $vals[] = $data['birth_date'] ?: null; }
  if(isset($data['address'])){ $fields[] = 'address = ?'; $vals[] = $data['address']; }
  if(isset($data['document_type'])){ $fields[] = 'document_type = ?'; $vals[] = $data['document_type']; }
  if(isset($data['purpose'])){ $fields[] = 'purpose = ?'; $vals[] = $data['purpose']; }
  if(isset($data['business_name']) && tableColumnExists($pdo, 'Document_Request', 'business_name')){ $fields[] = 'business_name = ?'; $vals[] = $data['business_name']; }
  if(count($fields) === 0) json(['success'=>false,'message'=>'Nothing to update']);

  if($statusUpdate){
    if(strcasecmp($newStatus, 'Released') === 0){
      $fields[] = 'date_released = NOW()';
    } elseif(strcasecmp($newStatus, 'Received') === 0){
      $fields[] = 'date_released = COALESCE(date_released, NOW())';
    }
  }

  if($statusUpdate){
    if($request && !empty($request['resident_id'])){
      $label = trim($request['document_type'] ?: $request['reference_number'] ?: 'Document request');
      if(strcasecmp($newStatus, 'Received') === 0){
        createNotification($pdo, null, 'Document request "' . $label . '" has been marked as received by the resident.', 'document_received');
      } else {
        if(strcasecmp($newStatus, 'Released') === 0){
          $message = 'Your document request "' . $label . '" has been released and is ready for pickup at the barangay.';
        } elseif(in_array(strtolower($newStatus), ['rejected', 'denied'], true)){
          $message = 'Your document request "' . $label . '" has been rejected.';
        } else {
          $message = 'Your document request "' . $label . '" status is now ' . $newStatus . '.';
        }
        createNotification($pdo, intval($request['resident_id']), $message, 'document_status');
      }
    }
  }

  $vals[] = $id;
  $sql = 'UPDATE Document_Request SET '.implode(', ', $fields).' WHERE request_id = ?';
  $pdo->prepare($sql)->execute($vals);
  json(['success'=>true]);
}

// Route: /accessibility-settings GET/PUT - resident accessibility preferences
if($uri === '/accessibility-settings' && in_array($method, ['GET', 'PUT', 'PATCH', 'POST'])){
  ensureAccessibilitySettingsTable($pdo);
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  if($user['role'] !== 'resident') json(['success'=>false,'message'=>'Accessibility settings are stored per resident only'], 403);

  if($method === 'GET'){
    $stmt = $pdo->prepare('SELECT * FROM Accessibility_Settings WHERE resident_id = ? LIMIT 1');
    $stmt->execute([$user['id']]);
    $settings = $stmt->fetch();

    json([
      'success' => true,
      'data' => [
        'dark' => $settings ? (bool)$settings['dark_mode'] : false,
        'contrast' => $settings ? (bool)$settings['high_contrast_mode'] : false,
        'screenReader' => $settings ? (bool)$settings['text_to_speech_enabled'] : false,
        'fontSize' => $settings['font_size'] ?? 'small',
      ]
    ]);
  }

  $data = json_decode(file_get_contents('php://input'), true) ?: [];
  $dark = !empty($data['dark']) ? 1 : 0;
  $contrast = !empty($data['contrast']) ? 1 : 0;
  $screenReader = !empty($data['screenReader']) ? 1 : 0;
  $fontSize = $data['fontSize'] ?? 'small';
  if(!in_array($fontSize, ['small', 'medium', 'large', 'xlarge'], true)){
    $fontSize = 'small';
  }

  $stmt = $pdo->prepare('INSERT INTO Accessibility_Settings (resident_id, text_to_speech_enabled, high_contrast_mode, dark_mode, font_size)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      text_to_speech_enabled = VALUES(text_to_speech_enabled),
      high_contrast_mode = VALUES(high_contrast_mode),
      dark_mode = VALUES(dark_mode),
      font_size = VALUES(font_size)');
  $stmt->execute([$user['id'], $screenReader, $contrast, $dark, $fontSize]);

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

// Route: /notifications/mark-read - backwards-compatible single notification read endpoint
if($uri === '/notifications/mark-read' && $method === 'POST'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  $data = json_decode(file_get_contents('php://input'), true);
  if(empty($data['id'])) json(['success'=>false,'message'=>'Notification id is required'], 400);
  markNotificationRead($pdo, $user, intval($data['id']));
  json(['success'=>true]);
}

// Route: /notifications delete all
if(($uri === '/notifications' && $method === 'DELETE') || ($uri === '/notifications/delete-all' && $method === 'POST')){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  $deleted = deleteAllNotificationsForUser($pdo, $user);
  json(['success'=>true,'deleted'=>$deleted]);
}

// Route: /notifications/{id} delete specific notification
if((preg_match('#^/notifications/(\d+)$#', $uri, $m) && $method === 'DELETE') || (preg_match('#^/notifications/(\d+)/delete$#', $uri, $m) && $method === 'POST')){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  $deleted = deleteNotificationForUser($pdo, $user, intval($m[1]));
  json(['success'=>true,'deleted'=>$deleted]);
}

// Route: /residents GET - list residents (admin)
if($uri === '/residents' && $method === 'GET'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  if($user['role'] !== 'staff') json(['success'=>false,'message'=>'Forbidden']);
  $stmt = $pdo->query('SELECT resident_id, first_name, middle_name, last_name, birth_date, gender, address, email, account_status, suspension_end_date, registration_date FROM Resident ORDER BY registration_date DESC');
  json(['success'=>true,'data'=>$stmt->fetchAll()]);
}

// Route: /archive - recycle bin for records deleted by the current user/admin
if($uri === '/archive' && $method === 'GET'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  purgeExpiredArchiveItems($pdo);

  $stmt = $pdo->prepare('SELECT archive_id, item_type, original_id, owner_resident_id, deleted_by_role, deleted_by_id, deleted_by_name, label, deleted_at, expires_at
    FROM Archive_Item
    WHERE deleted_by_role = ? AND deleted_by_id = ?
    ORDER BY deleted_at DESC
    LIMIT 200');
  $stmt->execute([$user['role'], intval($user['id'])]);
  json(['success'=>true,'data'=>$stmt->fetchAll()]);
}

if(preg_match('#^/archive/(\d+)/restore$#', $uri, $m) && $method === 'POST'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  purgeExpiredArchiveItems($pdo);

  $id = intval($m[1]);
  $stmt = $pdo->prepare('SELECT * FROM Archive_Item WHERE archive_id = ? AND deleted_by_role = ? AND deleted_by_id = ?');
  $stmt->execute([$id, $user['role'], intval($user['id'])]);
  $archive = $stmt->fetch();
  if(!$archive) json(['success'=>false,'message'=>'Archive item not found'], 404);

  $snapshot = json_decode($archive['snapshot'] ?? '{}', true) ?: [];
  try {
    $pdo->beginTransaction();
    if($archive['item_type'] === 'complaint'){
      restoreComplaintFromArchive($pdo, $snapshot);
    } elseif($archive['item_type'] === 'document'){
      restoreDocumentFromArchive($pdo, $snapshot);
    } elseif($archive['item_type'] === 'resident'){
      restoreResidentFromArchive($pdo, $snapshot);
    } else {
      throw new Exception('Unsupported archive item type');
    }
    $pdo->prepare('DELETE FROM Archive_Item WHERE archive_id = ?')->execute([$id]);
    $pdo->commit();
    json(['success'=>true]);
  } catch(Throwable $e){
    if($pdo->inTransaction()) $pdo->rollBack();
    if(archiveOriginalRecordExists($pdo, $archive)){
      $pdo->prepare('DELETE FROM Archive_Item WHERE archive_id = ?')->execute([$id]);
      json(['success'=>true,'restored'=>true,'message'=>'Item restored']);
    }
    error_log('Archive restore failed: ' . $e->getMessage());
    json(['success'=>false,'message'=>'Restore failed. The original ID or unique value may already exist.'], 409);
  }
}

if(preg_match('#^/archive/(\d+)$#', $uri, $m) && $method === 'DELETE'){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  purgeExpiredArchiveItems($pdo);

  $stmt = $pdo->prepare('DELETE FROM Archive_Item WHERE archive_id = ? AND deleted_by_role = ? AND deleted_by_id = ?');
  $stmt->execute([intval($m[1]), $user['role'], intval($user['id'])]);
  json(['success'=>true,'deleted'=>$stmt->rowCount()]);
}

// Route: /residents/{id} - patch or delete resident (admin)
if(preg_match('#^/residents/(\d+)$#', $uri, $m) && in_array($method, ['PATCH','PUT','DELETE'])){
  $token = getBearerToken();
  $user = findUserByToken($pdo, $token);
  if(!$user) json(['success'=>false,'message'=>'Unauthorized']);
  if($user['role'] !== 'staff') json(['success'=>false,'message'=>'Forbidden']);
  $id = intval($m[1]);
  if($method === 'DELETE'){
    $stmt = $pdo->prepare('SELECT * FROM Resident WHERE resident_id = ?');
    $stmt->execute([$id]);
    $resident = $stmt->fetch();
    if(!$resident) json(['success'=>false,'message'=>'Resident not found'], 404);
    $residentName = trim(($resident['first_name'] ?? '') . ' ' . ($resident['middle_name'] ?? '') . ' ' . ($resident['last_name'] ?? ''));
    createArchiveItem(
      $pdo,
      'resident',
      $id,
      $id,
      $residentName ?: ($resident['email'] ?? ('Resident #' . $id)),
      ['record' => $resident],
      $user
    );
    $pdo->prepare('DELETE FROM Resident WHERE resident_id = ?')->execute([$id]);
    json(['success'=>true]);
  }
  $data = json_decode(file_get_contents('php://input'), true);
  $fields = [];
  $vals = [];
  if(isset($data['account_status'])){
    $status = trim($data['account_status']);
    if(!in_array($status, ['Active', 'Suspended', 'Banned'], true)){
      json(['success'=>false,'message'=>'Invalid account status'], 400);
    }
    $fields[] = 'account_status = ?';
    $vals[] = $status;
    if(strcasecmp($status, 'Suspended') !== 0){
      $fields[] = 'suspension_end_date = NULL';
    }
    if(strcasecmp($status, 'Active') !== 0){
      $fields[] = 'api_token = NULL';
    }
  }
  if(isset($data['first_name'])){ $fields[] = 'first_name = ?'; $vals[] = $data['first_name']; }
  if(isset($data['last_name'])){ $fields[] = 'last_name = ?'; $vals[] = $data['last_name']; }
  if(isset($data['suspension_end_date'])){ $fields[] = 'suspension_end_date = ?'; $vals[] = $data['suspension_end_date'] ?: null; }
  if(count($fields) === 0) json(['success'=>false,'message'=>'Nothing to update']);
  $vals[] = $id;
  $sql = 'UPDATE Resident SET '.implode(', ', $fields).' WHERE resident_id = ?';
  $pdo->prepare($sql)->execute($vals);
  json(['success'=>true]);
}

// default
http_response_code(404);
json(['success'=>false,'message'=>'Not found']);
