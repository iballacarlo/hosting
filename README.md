# Barangay Frontend (Accessible)

This repository is a frontend-only React scaffold for an Accessible Web-Based Barangay Service & Complaint Management System

Quick start:

1. Install dependencies

```bash
npm install
```

2. Run development server

```bash
npm run dev
```

Notes:
- Built with Vite + React.
- Accessibility settings are stored in localStorage.
- Pure CSS, no UI frameworks.
- Connect to a PHP backend later via `src/api/axios.js`.
 
Logo:
- To use the official barangay seal you provided, place the image file at `src/assets/logo.png`. The app will use that file when available; it falls back to `src/assets/logo.svg` if not present.

Backend (PHP + MySQL)
1) Create the MySQL database and tables using the provided SQL script:

```sql
-- from project root
mysql -u root -p < sql/schema.sql
```

2) Configure `backend/config.php` with your DB credentials.

3) **(Recommended)** Place the `backend` folder in your web server's document root so that PHP runs under Apache/Nginx.  With XAMPP on Windows the easiest approach is:

```powershell
# copy or symlink the files into htdocs
Copy-Item -Recurse backend C:\xampp\htdocs\barangay-api
```

Then start Apache from the XAMPP control panel.  The API will be available at `http://localhost/barangay-api/api.php`.

To make client requests simpler you can hide `api.php` from the URL by adding a rewrite rule.  A `.htaccess` file is already included in the `backend` folder and the copy under `htdocs`:

```apacheconf
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /barangay-api/
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule ^(.*)$ api.php/$1 [L,QSA]
</IfModule>
```

With the rewrite in place both `http://localhost/barangay-api/seed` and
`http://localhost/barangay-api/api.php/seed` hit the API.

> **Warning:** the built‑in PHP server (`php -S`) is convenient, but it may
> fail to load extensions such as `pdo_mysql`.  If you run into the “could not
> find driver” error or the frontend shows a **Network Error** when logging in,
> switch to Apache or ensure the CLI PHP you launch has the necessary PDO
> driver enabled:
>
> ```powershell
> php -S localhost:8000 -t backend
> ```
>
> then set `VITE_API_BASE` accordingly in the frontend.

4) The frontend now defaults to `http://localhost/barangay-api` as the backend base (see `src/api/axios.js`).  If you run the API at a different address or port, override it with `VITE_API_BASE`:

   ```bash
   VITE_API_BASE=http://127.0.0.1/barangay-api npm run dev
   ```

   (PowerShell: `$env:VITE_API_BASE="http://127.0.0.1/barangay-api"; npm run dev`)

Notes:
- Passwords in the SQL seed are left blank; when you register/login via the app the API will store hashed passwords and tokens.
- This PHP API is a minimal demo and uses token strings stored in the DB (not full JWT). For production, add HTTPS, JWT, input validation, and stricter auth.

Password reset OTP email:
- Railway Free/Trial/Hobby cannot use SMTP. The backend sends password reset OTPs through an HTTPS mail relay.
- Recommended free option with the barangay Gmail: Google Apps Script.

Google Apps Script setup:
1. Log in to `brgy.mambog.ii@gmail.com`.
2. Open https://script.google.com and create a new project named `BRGY Mail Relay`.
3. Paste this code into `Code.gs`:

```javascript
const SECRET = 'BRGY-2026-x9Kp72LmQ4vTz88A';

function doGet() {
  return json({
    success: true,
    message: 'BRGY Mail Relay is running. Use POST to send email.'
  });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');

    if (String(data.secret || '').trim() !== SECRET) {
      return json({ success: false, message: 'Unauthorized' });
    }

    if (!data.to || !data.subject || !data.body) {
      return json({ success: false, message: 'Missing email fields' });
    }

    MailApp.sendEmail({
      to: data.to,
      subject: data.subject,
      body: data.body,
      htmlBody: data.htmlBody || data.body,
      name: data.fromName || 'Barangay Mambog II'
    });

    return json({
      success: true,
      sent: true,
      sentTo: data.to,
      remainingDailyQuota: MailApp.getRemainingDailyQuota()
    });
  } catch (err) {
    return json({ success: false, message: err.message });
  }
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Click Deploy, then New deployment.
5. Type: Web app.
6. Execute as: Me.
7. Who has access: Anyone.
8. Copy the Web app URL.
9. Set these Railway environment variables on the backend service:

```text
MAIL_API_URL=your_google_apps_script_web_app_url
MAIL_API_SECRET=BRGY-2026-x9Kp72LmQ4vTz88A
MAIL_FROM_NAME=Barangay Mambog II
```

- Use the exact same secret in Apps Script and Railway. If the app shows
  `Unable to send OTP email: Unauthorized (HTTP 200)`, your Google Apps Script
  `SECRET` and Railway `MAIL_API_SECRET` do not match, or the script was not
  redeployed after editing `Code.gs`.
- After changing `Code.gs`, click Deploy, then Manage deployments, edit the
  web app deployment, choose a new version, and deploy again.
- OTPs can be resent after 30 seconds and expire after 15 minutes.
- The app creates the `Password_Reset` table automatically if it is missing, but `sql/schema.sql` also includes it for fresh databases.
