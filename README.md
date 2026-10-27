# POS for Everything v2.0 - Modern Point of Sale System

A full-stack, offline-first Point of sale system built with TypeScript, React, Node.js, and multi-database support (SQLite, Supabase, Turso, Azure SQL).

![POS for Everything Banner](https://images.unsplash.com/photo-1531239080096-e2bb6a9e1f1e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80)

## 🚀 Features

### Core POS Features
- **Modern POS Interface** - Touch-friendly, responsive design
- **Product Management** - Categories, variants, barcodes, inventory tracking
- **Sales Processing** - Cart, payments (Cash, Card, UPI, Credit), receipts
- **Customer Management** - Profiles, credit limits, loyalty points, ledger
- **Purchase Management** - Purchase orders, receiving, supplier management
- **Expense Tracking** - Categories, receipts, recurring expenses
- **Financial Tools** - Cheques, loans, inventory adjustments, daily reconciliation
- **Reports & Analytics** - Sales, inventory, customer, financial reports

### Technical Features
- **Offline-First** - Works completely offline, syncs when online
- **Multi-Database** - SQLite (local), Supabase (PostgreSQL), Turso (LibSQL), Azure SQL
- **Real-time Sync** - WebSocket for LAN terminal synchronization
- **Type-Safe** - End-to-end TypeScript with Zod validation
- **Modern Stack** - React 18, Node.js, Express, Drizzle ORM, TanStack Query
- **Monorepo** - Turborepo with shared packages
- **Cloudflare Pages** - Static frontend deployment

## 🚦 Quick Start

### Prerequisites
- Node.js 20+ (tested on Node 26)
- npm 10+
- Docker (optional)

### Development Setup (Windows `cmd`)

```cmd
cd /d E:\Projects\POS\pospro-v2
npm install
npm run dev
```

This starts:
- Backend API: http://localhost:3000
- Frontend: http://localhost:5173

### Run with NO database (browser localStorage only)

The frontend ships with a **localStorage data layer** that needs neither a backend nor a database. It is the default (`VITE_DATA_MODE=local`).

```cmd
cd /d E:\Projects\POS\pospro-v2
npm install
npm run dev:frontend
```

Then open **http://localhost:5173** and sign in with:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@pos.com | admin123 |

Everything (products, categories, customers, suppliers, sales, purchases, expenses,
cheques, loans, inventory, employees, settings) is stored in the browser under the
`ami-pos:data:*` keys, so the data survives a refresh and stays on the machine.

Production build of the same localStorage app:

```cmd
cd /d E:\Projects\POS\pospro-v2
npm run build
npm run preview --workspace=@pospro/frontend
```

### Switching to the API backend

```cmd
:: set VITE_DATA_MODE=api in packages\frontend\.env, then:
cd /d E:\Projects\POS\pospro-v2
npm run dev
```

### Database Providers

#### SQLite (Default - Local Development, backend mode)
```env
DB_PROVIDER=sqlite
SQLITE_DB_PATH=./data/pos.db
```

#### Supabase (PostgreSQL Cloud)
```env
DB_PROVIDER=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
```

#### Turso (LibSQL Cloud)
```env
DB_PROVIDER=turso
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token
```

#### Azure SQL Database
```env
DB_PROVIDER=azuresql
AZURE_SQL_SERVER=your-server.database.windows.net
AZURE_SQL_DATABASE=posdb
AZURE_SQL_USER=your-user
AZURE_SQL_PASSWORD=your-password
```

Only one provider is active at a time — pick the one you need via `DB_PROVIDER`.

## 🐳 Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

### Production Deployment

1. Set `NODE_ENV=production` in environment
2. Generate secure `JWT_SECRET` (32+ characters)
3. Configure your database provider
4. Set `FRONTEND_URL` to your domain
5. **Cloudflare Pages**: Push to GitHub → auto-deploys
6. **Or Docker**: `docker-compose -f docker-compose.yml up -d`

### Cloudflare Pages Deployment

This project is configured for Cloudflare Pages static frontend deployment:

1. Connect your GitHub repository to Cloudflare Pages
2. Framework: **Vite**
3. Build command: `npm run build`
4. Build output: `packages/frontend/dist`
5. On each Git push, Cloudflare automatically builds and deploys the frontend
6. No `wrangler deploy` needed — this is a Pages deployment, not Workers

The `wrangler.jsonc` at the repository root configures Cloudflare asset deployment:
```json
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "pos-for-everything",
  "compatibility_date": "2026-11-01",
  "assets": {
    "directory": "./packages/frontend/dist"
  }
}
```

## 📁 Project Structure

```
pospro-v2/
├ packages/
│   ├── core/           # Shared types, schemas, constants, utilities
│   ├── database/       # Database abstraction layer with multi-provider support
│   ├── backend/        # Node.js/Express API server
│   └── frontend/       # React 18 + Vite + Tailwind CSS
├ docker-compose.yml    # Docker deployment
├ turbo.json            # Turborepo configuration
├ package.json          # Root workspace
└ wrangler.jsonc       # Cloudflare configuration
```

## 🛠 Quick Start

### Prerequisites
- Node.js 20+ (tested on Node 26)
- npm 10+

### Development Setup (Windows `cmd`)

```cmd
cd /d E:\Projects\POS\pospro-v2
npm install
npm run dev
```

This starts:
- Backend API: http://localhost:3000
- Frontend: http://localhost:5173

### Run with NO database (browser localStorage only)

The frontend ships with a **localStorage data layer** that needs neither a backend nor a database. It is the default (`VITE_DATA_MODE=local`).

```cmd
cd /d E:\Projects\POS\pospro-v2
npm install
npm run dev:frontend
```

Then open **http://localhost:5173** and sign in with:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@pos.com | admin123 |

Everything (products, categories, customers, suppliers, sales, purchases, expenses,
cheques, loans, inventory, employees, settings) is stored in the browser under the
`ami-pos:data:*` keys, so the data survives a refresh and stays on the machine.

Production build of the same localStorage app:

```cmd
cd /d E:\Projects\POS\pospro-v2
npm run build
npm run preview --workspace=@pospro/frontend
```

### Production Deployment

1. Set `NODE_ENV=production` in environment
2. Generate secure `JWT_SECRET` (32+ characters)
3. Configure your database provider
4. Set `FRONTEND_URL` to your domain
5. **Cloudflare Pages**: Push to GitHub → auto-deploys
6. **Docker**: `docker-compose -f docker-compose.yml up -d`

## 📦 Available Scripts

```bash
# Development
npm run dev              # Start all dev servers
npm run dev:backend      # Backend only
npm run dev:frontend     # Frontend only

# Building
npm run build            # Build all packages
npm run build:backend    # Build backend only
npm run build:frontend   # Build frontend only

# Database
npm run db:generate      # Generate migrations
npm run db:migrate       # Run migrations
npm run db:push          # Push schema changes
npm run db:studio        # Open Drizzle Studio

# Code Quality
npm run lint             # Lint all packages
npm run typecheck        # TypeScript check
npm run format           # Prettier format

# Cleanup
npm run clean            # Clean all build artifacts
```

## 🔧 Architecture

### Database Abstraction Layer

The `@pospro/database` package provides a unified interface for all database providers:

```typescript
import { createDatabaseProvider } from '@pospro/database';
const db = await createDatabaseProvider('sqlite', { sqlitePath: './data/pos.db' });
const users = await db.findMany('users', { filters: [{ field: 'isActive', operator: 'eq', value: true }] });
```

### Shared Types & Validation

The `@pospro/core` package provides TypeScript types and Zod schemas:

```typescript
import { Product, productSchema } from '@pospro/core';
const product = productSchema.parse(rawData);
```

### Real-time Synchronization

WebSocket-based real-time updates across all connected terminals:

```typescript
// Backend broadcasts
wsService.emitSaleRecorded(saleData);

// Frontend listens
wsService.on('SALE_RECORDED', (data) => {
  updateCart(data);
});
```

## 🔐 Authentication

- **Supabase Auth** - Email/password with JWT tokens
- **Local Fallback** - Admin login (admin@pos.com / admin123)
- **PIN Support** - Quick login for cashiers
- **Role-Based Access** - Admin, Manager, Cashier permissions
- **Session Management** - Access/refresh tokens with rotation

## 📊 API Endpoints

| Category | Endpoints |
|----------|-----------|
| Auth | `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh` |
| Products | `GET/POST /api/products`, `GET/PUT/DELETE /api/products/:id` |
| Categories | `GET/POST /api/categories` |
| Customers | `GET/POST /api/customers` |
| Sales | `GET/POST /api/sales`, `POST /api/sales/:id/cancel` |
| Purchases | `GET/POST /api/purchases` |
| Expenses | `GET/POST /api/expenses` |
| Stats | `GET /api/stats/dashboard`, `/sales`, `/inventory` |
| Sync | `GET /api/sync/status`, `POST /api/sync/trigger` |
| Health | `GET /api/health`, `/health/detailed` |

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Coverage
npm run test:coverage
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

- Documentation: [Wiki](https://github.com/Arqamali-2008/POS-for-Everything/wiki)
- Issues: [GitHub Issues](https://github.com/Arqamali-2008/POS-for-Everything/issues)
- Discussions: [GitHub Discussions](https://github.com/Arqamali-2008/POS-for-Everything/discussions)

---

**Built with ❤️ for modern retail businesses**