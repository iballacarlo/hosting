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