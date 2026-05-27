CREATE TABLE IF NOT EXISTS Resident (
  resident_id INT AUTO_INCREMENT PRIMARY KEY,

  first_name VARCHAR(255) NOT NULL,
  middle_name VARCHAR(255) DEFAULT NULL,
  last_name VARCHAR(255) NOT NULL,

  birth_date DATE DEFAULT NULL,
  gender VARCHAR(32) DEFAULT NULL,

  address VARCHAR(500) DEFAULT NULL,

  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,

  account_status VARCHAR(50) DEFAULT 'Active',
  suspension_end_date DATE DEFAULT NULL,

  registration_date DATETIME DEFAULT CURRENT_TIMESTAMP,

  api_token VARCHAR(255) DEFAULT NULL
);


CREATE TABLE IF NOT EXISTS Staff (
  staff_id INT AUTO_INCREMENT PRIMARY KEY,

  full_name VARCHAR(255) NOT NULL,

  role VARCHAR(50) DEFAULT 'Staff',

  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,

  account_status VARCHAR(50) DEFAULT 'Active',

  suspension_end_date DATE DEFAULT NULL,

  api_token VARCHAR(255) DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS Category (
  category_id INT AUTO_INCREMENT PRIMARY KEY,

  category_name VARCHAR(255) NOT NULL,

  description VARCHAR(1000) DEFAULT NULL
);



CREATE TABLE IF NOT EXISTS Complaint (
  complaint_id INT AUTO_INCREMENT PRIMARY KEY,

  resident_id INT DEFAULT NULL,

  category_id INT DEFAULT NULL,

  assigned_staff_id INT DEFAULT NULL,

  title VARCHAR(255) NOT NULL,

  description TEXT,

  incident_location VARCHAR(255) DEFAULT NULL,

  incident_date DATE DEFAULT NULL,
  anonymous BOOLEAN DEFAULT FALSE,
  respondent_name VARCHAR(255) DEFAULT NULL,
  respondent_contact VARCHAR(255) DEFAULT NULL,

  status VARCHAR(50) DEFAULT 'Submitted',

  resolution_notes TEXT DEFAULT NULL,

  date_submitted DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_updated DATETIME DEFAULT CURRENT_TIMESTAMP,

  date_resolved DATETIME DEFAULT NULL,

  CONSTRAINT fk_complaint_resident
    FOREIGN KEY (resident_id)
    REFERENCES Resident(resident_id)
    ON DELETE SET NULL,

  CONSTRAINT fk_complaint_category
    FOREIGN KEY (category_id)
    REFERENCES Category(category_id)
    ON DELETE SET NULL,

  CONSTRAINT fk_complaint_staff
    FOREIGN KEY (assigned_staff_id)
    REFERENCES Staff(staff_id)
    ON DELETE SET NULL
);



CREATE TABLE IF NOT EXISTS Complaint_Attachment (
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
);


CREATE TABLE IF NOT EXISTS Document_Request (
  request_id INT AUTO_INCREMENT PRIMARY KEY,
  resident_id INT,
  processed_by INT NULL,

  full_name VARCHAR(255),
  birth_date DATE,
  address TEXT,

  document_type VARCHAR(255),
  purpose VARCHAR(1000),

  status VARCHAR(50) DEFAULT 'Pending',
  reference_number VARCHAR(255) UNIQUE,

  date_requested DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_approved DATETIME NULL,
  date_released DATETIME NULL,

  FOREIGN KEY (resident_id) REFERENCES Resident(resident_id) ON DELETE SET NULL,
  FOREIGN KEY (processed_by) REFERENCES Staff(staff_id) ON DELETE SET NULL
);


CREATE TABLE IF NOT EXISTS Document_Type (
  document_type_id INT AUTO_INCREMENT PRIMARY KEY,
  document_name VARCHAR(255) UNIQUE NOT NULL,
  status VARCHAR(50) DEFAULT 'enabled',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS Accessibility_Settings (
  accessibility_id INT AUTO_INCREMENT PRIMARY KEY,

  resident_id INT UNIQUE,

  text_to_speech_enabled BOOLEAN DEFAULT FALSE,

  high_contrast_mode BOOLEAN DEFAULT FALSE,

  dark_mode BOOLEAN DEFAULT FALSE,

  font_size VARCHAR(50) DEFAULT 'small',

  CONSTRAINT fk_accessibility_resident
    FOREIGN KEY (resident_id)
    REFERENCES Resident(resident_id)
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS Notification (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,

  resident_id INT DEFAULT NULL,

  message TEXT NOT NULL,

  type VARCHAR(50) DEFAULT 'info',

  is_read BOOLEAN DEFAULT FALSE,

  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_notification_resident
    FOREIGN KEY (resident_id)
    REFERENCES Resident(resident_id)
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS Chat_Message (
  chat_message_id INT AUTO_INCREMENT PRIMARY KEY,

  resident_id INT NOT NULL,

  sender_role VARCHAR(20) NOT NULL,
  sender_id INT NOT NULL,

  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,

  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_chat_resident_date (resident_id, date_created),

  CONSTRAINT fk_chat_resident
    FOREIGN KEY (resident_id)
    REFERENCES Resident(resident_id)
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS Password_Reset (
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
);


CREATE TABLE IF NOT EXISTS Registration_Otp (
  otp_id INT AUTO_INCREMENT PRIMARY KEY,

  email VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  last_sent_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_registration_otp_email (email),
  INDEX idx_registration_otp_expires_at (expires_at)
);


CREATE TABLE IF NOT EXISTS Login_Attempt (
  attempt_id INT AUTO_INCREMENT PRIMARY KEY,

  identifier VARCHAR(255) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  last_failed_at DATETIME DEFAULT NULL,
  locked_until DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_login_attempt_identifier (identifier),
  INDEX idx_login_attempt_locked_until (locked_until)
);


CREATE TABLE IF NOT EXISTS Archive_Item (
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
);


INSERT IGNORE INTO Category (category_id, category_name, description)
VALUES
(1, 'Noise Complaint', 'Noise related complaints'),
(2, 'Garbage Collection', 'Garbage collection concerns'),
(3, 'Road/Drainage Issue', 'Road and drainage concerns'),
(4, 'Peace and Order', 'Peace and order concerns'),
(5, 'Other', 'Other concerns');


INSERT IGNORE INTO Document_Type (document_type_id, document_name, status)
VALUES
(1, 'Barangay Clearance', 'enabled'),
(2, 'Certificate of Residency', 'enabled'),
(3, 'Certificate of Indigency', 'enabled');



DELETE FROM Staff WHERE email = 'admin@gmail.com';

INSERT INTO Staff (
  full_name,
  role,
  email,
  password,
  account_status
)
VALUES (
  'Admin',
  'Admin',
  'admin@gmail.com',
  '$2y$12$SehuW12J4Nm5YLfemjdnlOUC6pqt0oHDxITB7anKQP2l6jXV.p8Bm',
  'Active'
);


DELETE FROM Resident WHERE email = 'carlo@gmail.com';

INSERT INTO Resident (
  first_name,
  middle_name,
  last_name,
  birth_date,
  gender,
  address,
  email,
  password,
  account_status,
  registration_date
)
VALUES (
  'Carlo',
  '',
  'Resident',
  '2000-01-01',
  'Male',
  'Sample Address',
  'carlo@gmail.com',
  '$2y$12$y.1LWnWa33aNTPCaK3hg..u.FeDm57.odqQEsVSzycSCUVT/.oWf2',
  'Active',
  NOW()
);

