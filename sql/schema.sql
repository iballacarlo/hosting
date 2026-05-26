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

  status VARCHAR(50) DEFAULT 'Submitted',

  resolution_notes TEXT DEFAULT NULL,

  date_submitted DATETIME DEFAULT CURRENT_TIMESTAMP,

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


CREATE TABLE IF NOT EXISTS Digital_ID (
  digital_id INT AUTO_INCREMENT PRIMARY KEY,

  resident_id INT UNIQUE,

  id_number VARCHAR(255) UNIQUE,

  qr_token VARCHAR(255) UNIQUE,

  issue_date DATE DEFAULT NULL,

  expiration_date DATE DEFAULT NULL,

  status VARCHAR(50) DEFAULT 'Active',

  CONSTRAINT fk_digital_resident
    FOREIGN KEY (resident_id)
    REFERENCES Resident(resident_id)
    ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS Accessibility_Settings (
  accessibility_id INT AUTO_INCREMENT PRIMARY KEY,

  resident_id INT UNIQUE,

  text_to_speech_enabled BOOLEAN DEFAULT FALSE,

  high_contrast_mode BOOLEAN DEFAULT FALSE,

  dark_mode BOOLEAN DEFAULT FALSE,

  font_size VARCHAR(50) DEFAULT 'medium',

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


CREATE TABLE IF NOT EXISTS Report_Log (
  report_id INT AUTO_INCREMENT PRIMARY KEY,

  generated_by INT DEFAULT NULL,

  report_type VARCHAR(255),

  date_generated DATETIME DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_report_staff
    FOREIGN KEY (generated_by)
    REFERENCES Staff(staff_id)
    ON DELETE SET NULL
);


INSERT IGNORE INTO Category (category_id, category_name, description)
VALUES
(1, 'Noise', 'Noise related complaints'),
(2, 'Garbage', 'Garbage collection concerns'),
(3, 'Traffic', 'Traffic related complaints'),
(4, 'Water Supply', 'Water supply concerns'),
(5, 'Electricity', 'Electricity related concerns'),
(6, 'Public Safety', 'Public safety concerns'),
(7, 'Other', 'Other concerns');



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

