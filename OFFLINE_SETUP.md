# AMi POS - Offline-First Setup Guide

## 🎯 Quick Start (Zero Config - Works Offline!)

The system runs **100% offline by default** with zero configuration needed.

```cmd
:: 1. Navigate to project
cd /d E:\Projects\POS\pospro-v2

:: 2. Install dependencies
npm install

:: 3. Start the frontend only (no database, no backend)
npm run dev:frontend
```

Open **http://localhost:5173** and sign in with `admin@pos.com` / `admin123`.

That's it! The system will:
- ✅ Store every record in the browser's localStorage (`ami-pos:data:*` keys)
- ✅ Use local authentication (admin@pos.com / admin123)
- ✅ Work completely offline — no server, no database driver
- ✅ Keep the data after a page refresh (it lives in the browser)

To run the **full stack** (backend API + SQLite database) instead:

```cmd
cd /d E:\Projects\POS\pospro-v2
npm install
npm run dev
```

- Backend API: http://localhost:3000
- Frontend: http://localhost:5173

---

## 🔧 What Works Offline (Default)

| Feature | Status |
|---------|--------|
| Products & Inventory | ✅ Full CRUD |
| Sales & Checkout | ✅ Atomic transactions (stock decrement + movements) |
| Customers & Credit | ✅ Full management |
| Purchases & Suppliers | ✅ Complete |
| Expenses & Reports | ✅ All reports |
| Authentication | ✅ Local admin login |
| Receipt Printing | ✅ Local/Network printers |
| Barcode Scanning | ✅ Camera/USB scanners |
| Data Backup/Restore | ✅ JSON + QR codes |

---

## 🗂 Where the local data lives

| Data | Storage key |
|------|-------------|
| Products | `ami-pos:data:products` |
| Categories | `ami-pos:data:categories` |
| Customers | `ami-pos:data:customers` |
| Suppliers | `ami-pos:data:suppliers` |
| Sales | `ami-pos:data:sales` |
| Purchases | `ami-pos:data:purchases` |
| Expenses | `ami-pos:data:expenses` |
| Cheques / Loans | `ami-pos:data:cheques`, `ami-pos:data:loans` |
| Inventory | `ami-pos:data:inventoryAdjustments`, `ami-pos:data:stockMovements` |
| Employees | `ami-pos:data:employees` |
| Settings | `ami-pos:data:settings` |
| Signed-in session | `ami-pos:local-session` |

Clear the site data in the browser to reset the app to a clean state.

---

## ☁️ Optional: Enable a real database / cloud sync

Set `VITE_DATA_MODE=api` in `packages\frontend\.env` and add credentials to the
backend `.env`. One provider is active at a time:

### Supabase (PostgreSQL)
```env
DB_PROVIDER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
SYNC_ENABLED=true
```

### Turso (LibSQL)
```env
DB_PROVIDER=turso
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
SYNC_ENABLED=true
```

### Azure SQL
```env
DB_PROVIDER=azuresql
AZURE_SQL_SERVER=your-server.database.windows.net
AZURE_SQL_DATABASE=posdb
AZURE_SQL_USER=your-user
AZURE_SQL_PASSWORD=your-password
SYNC_ENABLED=true
```

Then restart: `npm run dev`

---

## 🐳 Production Deployment (Docker)

```cmd
:: Build and run
docker-compose up -d

:: View logs
docker-compose logs -f backend
```

**Production .env** (required):
```env
NODE_ENV=production
JWT_SECRET=your-32-char-secret-from-openssl-rand-base64-32
DB_PROVIDER=sqlite  :: or your cloud provider
```

---

## 📁 Data Location

- **Browser mode**: browser localStorage (keys listed above)
- **Backend mode**: `./data/pos.db` (SQLite via the built-in `node:sqlite` driver)
- **Backups**: `./backups/` (JSON exports)
- **Logs**: console output

---

## 🔑 Default Login

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@pos.com | admin123 |

Change password immediately after first login!

---

## 🛠 Troubleshooting

### "Port 5173 in use"
Vite automatically moves to the next free port — use the URL printed in the terminal.

### "Port 3000 in use"
- Change PORT in `.env.local`
- Or stop the other process: `netstat -ano | findstr :3000` then `taskkill /PID <pid> /F`

### Frontend can't connect to backend (API mode only)
- Check `VITE_API_URL` in `packages\frontend\.env`
- Ensure the backend runs on port 3000

### Data looks empty after a browser change
The data is per browser profile — open the app in the same browser/profile that
created the records.

---

## 📝 Key Points

1. **No cloud account needed** - works 100% offline in the browser
2. **No database driver needed** - the default mode is pure localStorage
3. **Add a database later** - set `VITE_DATA_MODE=api` and pick one provider
4. **Full POS features** - all work offline
5. **Data ownership** - your data stays on your device

---

**Enjoy your fully offline POS system! 🎉**