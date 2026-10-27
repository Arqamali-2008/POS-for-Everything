🔴 Critical/High Priority Issues
1. storage-service.js - LocalStorage Error Handling
Line 97: Failed to serialize value to JSON — Will crash if value exceeds localStorage quota
Line 171: localStorage Quota Exceeded! — No graceful handling when user fills up storage
Line 128: Error during legacy migration — Migration may silently fail
Risk: Data loss if localStorage fills up or migration fails
2. msaccess-handler.js - MS Access Import/Export
Line 214-215: MDB file parsing not fully implemented — Throws error if someone tries to import MDB format
Risk: Users with existing .mdb files cannot import; must use JSON export instead
3. qr-backup.js - Backup Corruption
Line 87: Invalid backup type — If backup chunks are corrupted or tampered with, import fails
Line 114: Invalid chunk — Same issue for partial/failed chunks
Risk: Backup import fails if any chunk is missing/corrupt
4. universal-scanner.js - Scanner Input Validation
Line 193: Invalid invoice core — Throws if scanned data isn't valid invoice core JSON
Line 196: Missing invoiceNumber — Crashes if scanner inputs bare invoice number without JSON
Risk: Barcode wedge scanners may input plain text that throws error
5. receipt-printing.js - Missing Dependencies
Line 264: qrcode.js not loaded — QR receipts fail if QR code library not loaded
Line 298: JsBarcode not loaded — Barcode receipts fail if library missing
Risk: Page loads but print functions throw errors
6. pos-api.js - API Response Validation
Line 96: Invalid sync response — Throws if API response doesn't have expected success/data structure
Risk: Network changes or API updates break sync functionality
🟡 Medium Priority Issues
7. supabase-sync.js - Connection Errors
Line 18: Supabase URL and Key are required — Crashes if config missing
Line 65: Supabase connection failed — Network errors not gracefully handled
Risk: App becomes unusable if Supabase temporarily unavailable
8. sync-manager.js - EMS Sync Errors
Line 111/192: Error syncing to/from EMS — EMS (Employee Management System?) sync failures
Risk: Background sync may fail silently or crash
9. msaccess-handler.js - Auto-Backup
Line 245: Auto-backup failed: — Background auto-backup to MS Access may fail unnoticed
Risk: Data not backed up without user knowing
10. pos-api.js - Offline Queue
Line 175/204: Offline mutation deferred/flush failures — May leave data in inconsistent state
Risk: Offline changes lost if flush fails
🟢 Low Priority / Expected Errors
11. Invoice/Validation Errors (Expected)
Many files throw errors on invalid input — this is expected behavior:

invoice-core.js: Validates invoice core structure
qr-backup.js: Validates backup format
universal-scanner.js: Validates scanner input
receipt-printing.js: Validates required components
These errors protect the system from corrupt data — they're features, not bugs, when they occur due to actual invalid input.

12. Console Warnings (Informational)
Many console.warn calls are normal operational messages, not actual bugs.

📊 Summary Table
File	Errors	Issue Type	Fix Priority
storage-service.js	6+	Data loss risk	🔴 High
msaccess-handler.js	3	Import limited	🟡 Medium
qr-backup.js	2	Backup corruption	🟡 Medium
universal-scanner.js	2	Scanner input crash	🟡 Medium
receipt-printing.js	2	Missing libs	🟢 Low
supabase-sync.js	2	Network dependent	🟢 Low
pos-api.js	2	API changes	🟢 Low
Others	~15	Expected validation	🟢 Very Low
💡 Recommendations
✅ RESOLVED (Oct 26, 2026) — all fixes applied to `E:\Projects\POS\pospro\js\`:

1. ✅ storage-service.js
   - `safeJsonStringify` now falls back to a string matching the value's shape (`[]`/`{}`/`null`) instead of always `[]`.
   - Quota exceeded: automatic recovery first — trims audit logs to 200 entries, drops stale (>24h) restore safety backup, then retries the write once. Alert only shown if recovery fails.
   - Legacy migration is per-key try/catch: one failing key no longer aborts the rest; failures are audit-logged.

2. ✅ msaccess-handler.js
   - Binary .mdb/.accdb files detected via Jet/ACE header magic bytes with a clear, actionable message (export as JSON instead).
   - Auto-backup failures are no longer silent: last error stored under `msaccess_last_backup_error`, `msaccess:autobackup-failed`/`-success` events dispatched for the UI.

3. ✅ qr-backup.js
   - `importChunk` no longer throws — returns `{ success, error }`; corrupt/incomplete joined payload is detected and buffers reset; input-field and scanner callers handle the result with friendly alerts.

4. ✅ universal-scanner.js
   - `applyInvoiceCoreToSystem` returns `{ applied, error }` objects instead of throwing; button handlers keep the modal open and show the friendly message. Invalid scan formats produce user-friendly text, not stack traces.
   - Backup-chunk routing wraps the importer in try/catch.

5. ✅ receipt-printing.js
   - Missing `window.QRCode` / `window.JsBarcode` now shows a clear "please refresh the page" alert and aborts gracefully instead of throwing.

6. ✅ pos-api.js
   - Invalid sync responses no longer mislabeled as "offline": distinct console error + toast, and local data is protected (nothing mirrored).
   - Offline-flush failures (HTTP or network) now surface a toast; server rejections keep the queue; queue is capped at 500 entries (oldest dropped) to stay bounded.

7. ✅ supabase-sync.js
   - `init()` checks `navigator.onLine` first and returns a graceful offline error object; missing-credentials case already returned structured errors.

8. ✅ sync-manager.js
   - Both Supabase sync branches wrapped in try/catch with fallback to local EMS sync.

9. ✅ Global error handler added
   - New `js/error-handler.js` loaded FIRST in index.html: catches `error` + `unhandledrejection`, shows rate-limited non-intrusive toast, keeps a rolling 50-entry log in `ami_pos_error_log` (inspectable via `window.ErrorLog.entries()`).

Verified: `node --check` passes for all 9 files; behavioral smoke tests (storage roundtrip/circular fallback, QR chunk import paths, scanner error objects) all pass.
