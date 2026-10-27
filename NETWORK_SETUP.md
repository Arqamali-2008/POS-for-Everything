# LAN Multi-Terminal Setup — One Shared `.db`

Multiple POS terminals (PCs/shop devices) share **one** SQLite data file over the
network, without any extra database software.

## Architecture

```
[ Server PC ]                          [ Terminals ]
 backend (Node)  ──── talks to ───►   \\SERVER\POS\data\pos.db
 serves the built frontend  ◄─── open http://SERVER-PC:3000 in browser
```

- The **server PC** runs the backend. It is the ONLY machine that touches the
  `.db` file, so concurrent access is always safe.
- Every other terminal just opens `http://<server-pc>:3000` in a browser
  (Chrome/Edge recommended). In production mode the backend serves the built
  frontend, so there is no CORS or CORS setup involved.
- The data file can live on a local drive or a network shared drive (mapped
  drive `D:\...` or UNC `\\SERVER\...`). The path is configurable at runtime
  from the admin UI (Settings → Database → **Data File**).

## Step-by-step (one-time)

1. **Build the app** (on the server PC or any dev machine):

   ```cmd
   npm install
   npm run build
   ```

2. **The network share**: create a shared folder (e.g. `\\POS-SERVER\posdata`)
   that stays reachable; all terminals share the same data because they all go
   through the one backend.

3. **Start the backend** on the server PC:

   ```cmd
   npm run start --workspace=@pospro/backend
   ```

   Or `node packages/backend/dist/index.js`. Default address: `0.0.0.0:3000`.

4. **Choose the shared data file** (optional, if not the default local file):
   - Login as admin → **Settings → Database → Data File**
   - Enter a path like `\\POS-SERVER\posdata\posdata.db` (or `D:\pos\posdata.db`)
   - Click **Test** (checks the folder is writable and the file is SQLite),
     then **Switch**. The server reconnects live — no restart needed and the
     choice is persisted in `packages/backend/data/runtime-config.json`
     (wins over the `SQLITE_DB_PATH` env default). Switch back any time the
     same way.
   - **Overview / Backup**: shows current path, size, SQLite journal mode;
     **Backup Now** checkpoints the WAL and copies the file next to the data
     file, e.g. `posdata.backup-2026-10-27T09-00-00.db`.

5. **Terminals**: open `http://<server-pc>:3000` and login
   (`admin@pos.com` / `admin123` by default — change it in Settings → Security).

## Env config (all optional, see `.env.example`)

| Variable                                | Meaning                                    | Default |
| --------------------------------------- | ------------------------------------------ | ------- |
| `PORT`                                  | API + served frontend port                 | `3000`  |
| `HOST`                                  | Bind address (`0.0.0.0` for LAN)           | `0.0.0.0` |
| `SQLITE_DB_PATH`                        | Default data file path                     | `./data/pos.db` |
| `LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD` | Bootstrap admin login                 | `admin@pos.com` / `admin123` |

Frontend: `VITE_DATA_MODE=api` + `VITE_API_URL` only matter in dev mode; in
production the built frontend talks to the same origin that serves it.

## Windows Firewall

Allow inbound TCP 3000 for Node.js (first start usually prompts), or:

```powershell
netsh advfirewall firewall add rule name="POS for Everything" dir=in action=allow protocol=TCP localport=3000
```

## Safety notes

- **Back up regularly** (Settings → Database → Backup, or copy the `.db` when
  the server is stopped).
- Do **not** point two backends at the same `.db` (two server PCs) — WAL mode
  allows it on a LAN share but checkpoints can be flaky over SMB; use one
  server PC as designed.
- If AN SMB share drops mid-write, SQLite's WAL keeps the last committed
  transaction; run **Backup Now** after reconnecting to checkpoint cleanly.
- `runtime-config.json` lives next to the default DB folder; delete it (with
  the server stopped) to fall back to the env default path.
