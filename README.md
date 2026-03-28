# RMM System — Remote Monitoring & Management

A production-ready Remote Monitoring & Management system for IT infrastructure.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌───────────┐
│  Next.js UI  │◄───►│  Express API  │◄───►│ PostgreSQL│
│  (Port 3000) │     │  (Port 4000)  │     │  (5432)   │
└─────────────┘     └──────┬───────┘     └───────────┘
                           │
                    ┌──────┴───────┐
                    │  WebSocket   │
                    │  (Socket.IO) │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         ┌─────────┐ ┌─────────┐ ┌─────────┐
         │ Agent 1  │ │ Agent 2  │ │ Agent N  │
         │ (Windows)│ │ (Windows)│ │ (Windows)│
         └─────────┘ └─────────┘ └─────────┘
```

## Quick Start (Local Development)

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local dev)
- Python 3.10+ (for the agent)

### 1. Clone & Configure

```bash
git clone <your-repo-url> rmm-system
cd rmm-system
cp .env.example .env
# Edit .env with your values (especially POSTGRES_PASSWORD and JWT_SECRET)
```

### 2. Start with Docker Compose

```bash
docker compose up -d
```

### 3. Seed the Admin User

```bash
docker exec rmm-backend node src/config/seed.js
```

Default credentials: `admin` / `admin123` — **change immediately after first login**.

### 4. Access the Dashboard

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:4000
- **Health Check:** http://localhost:4000/health

---

## Coolify Deployment

### Step 1: Create a New Project in Coolify
1. Log into Coolify dashboard
2. Create a new project (e.g., "RMM System")

### Step 2: Add PostgreSQL Service
1. In the project, add a new **Service** → **PostgreSQL**
2. Set the database name, user, and password
3. Note the internal connection string

### Step 3: Deploy Backend
1. Add a new **Resource** → **Docker** from the Git repository
2. Set build context to `./backend`
3. Set Dockerfile path to `./backend/Dockerfile`
4. Configure environment variables:
   - `DATABASE_URL=postgresql://user:pass@postgres-service:5432/rmm`
   - `JWT_SECRET=<random-64-char-string>`
   - `CORS_ORIGIN=https://your-frontend-domain.com`
   - `PORT=4000`
5. Set the exposed port to `4000`
6. Assign a domain (e.g., `api.your-domain.com`)

### Step 4: Deploy Frontend
1. Add another **Resource** → **Docker** from the same repo
2. Set build context to `./frontend`
3. Set Dockerfile path to `./frontend/Dockerfile`
4. Set build arguments:
   - `NEXT_PUBLIC_API_URL=https://api.your-domain.com`
   - `NEXT_PUBLIC_WS_URL=wss://api.your-domain.com`
5. Set the exposed port to `3000`
6. Assign a domain (e.g., `rmm.your-domain.com`)

### Step 5: SSL
Coolify automatically provisions SSL certificates via Let's Encrypt for assigned domains.

### Step 6: Seed Admin
```bash
# SSH into your Coolify server
docker exec <backend-container-name> node src/config/seed.js
```

---

## Agent Installation (Windows)

### Option A: Automated Install (Recommended)

1. In the RMM dashboard, go to **Add Device** and register a new device
2. Copy the generated API key
3. Open PowerShell as Administrator on the target Windows machine:

```powershell
.\install.ps1 -ApiUrl "https://api.your-domain.com" -ApiKey "rmm_your_key_here" -Interval 15
```

### Option B: Manual Install

1. Copy the `agent/` folder to the target machine
2. Install Python 3.10+ and add to PATH
3. Install dependencies: `pip install -r requirements.txt`
4. Copy `config.ini.example` to `config.ini` and fill in values
5. Run: `python rmm_agent.py`

---

## API Reference

### Authentication
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/login` | POST | None | Login with username/password |
| `/api/auth/register` | POST | JWT (Admin) | Register new user |
| `/api/auth/me` | GET | JWT | Get current user |

### Devices
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/devices` | GET | JWT | List all devices (with filters) |
| `/api/devices/:id` | GET | JWT | Get single device |
| `/api/devices/register` | POST | JWT (Admin) | Register new device |
| `/api/devices/:id` | PUT | JWT (Admin) | Update device |
| `/api/devices/:id` | DELETE | JWT (Admin) | Delete device |
| `/api/devices/:id/regenerate-key` | POST | JWT (Admin) | Regenerate API key |

### Metrics
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/metrics` | POST | API Key | Ingest metrics from agent |
| `/api/metrics/:deviceId` | GET | JWT | Get device metrics history |
| `/api/metrics/:deviceId/latest` | GET | JWT | Get latest metric |

### Alerts
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/alerts` | GET | JWT | List alerts (with filters) |
| `/api/alerts/stats` | GET | JWT | Alert summary counts |
| `/api/alerts/:id/acknowledge` | PUT | JWT | Acknowledge alert |
| `/api/alerts/:id/resolve` | PUT | JWT | Resolve alert |

---

## Project Structure

```
rmm-system/
├── docker-compose.yml          # Compose for all services
├── .env.example                # Environment variables template
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Express entry point
│       ├── config/
│       │   ├── database.js     # PostgreSQL pool + schema
│       │   └── seed.js         # Admin user seeder
│       ├── middleware/
│       │   ├── auth.js         # JWT + API key auth
│       │   └── rateLimiter.js  # Rate limiting
│       ├── routes/
│       │   ├── auth.js         # Auth endpoints
│       │   ├── devices.js      # Device CRUD
│       │   ├── metrics.js      # Metrics ingestion + query
│       │   └── alerts.js       # Alert management
│       ├── services/
│       │   ├── alertEngine.js  # Threshold evaluation + offline check
│       │   ├── emailService.js # SMTP email alerts
│       │   └── websocket.js    # Socket.IO server
│       └── utils/
│           └── logger.js       # Winston logger
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   └── src/
│       ├── app/
│       │   ├── layout.js
│       │   ├── page.js                    # Redirect
│       │   ├── login/page.js              # Login form
│       │   ├── dashboard/page.js          # Main dashboard
│       │   ├── dashboard/[deviceId]/page.js # Device detail
│       │   └── alerts/page.js             # Alert management
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   ├── DeviceCard.jsx
│       │   ├── MetricsChart.jsx
│       │   ├── StatusBadge.jsx
│       │   └── AlertBanner.jsx
│       ├── hooks/
│       │   └── useWebSocket.js
│       └── lib/
│           └── api.js          # API client
└── agent/
    ├── rmm_agent.py            # Python agent script
    ├── requirements.txt
    ├── config.ini.example
    └── install.ps1             # Windows installer
```

---

## Security Measures

- **JWT authentication** for dashboard users with 24h expiry
- **API key authentication** for device agents (unique per device)
- **Rate limiting** on all endpoints (stricter on auth, generous on metrics)
- **Helmet.js** for security headers
- **CORS** restricted to frontend origin
- **HTTPS** enforced via Coolify reverse proxy + Let's Encrypt
- **bcrypt** (cost factor 12) for password hashing
- **Parameterized queries** — no SQL injection risk
- **Non-root Docker containers** for both services

---

## Suggested Improvements

Based on real-world RMM tools (ConnectWise, Datto, NinjaRMM):

1. **Remote Command Execution** — Run PowerShell commands on agents with approval workflow
2. **Software Inventory** — Track installed software and versions
3. **Patch Management** — Detect pending Windows updates, schedule installations
4. **File Transfer** — Upload/download files to/from managed devices
5. **Remote Desktop** — WebRTC-based remote screen access
6. **Slack/Teams/WhatsApp Alerts** — Webhook integrations for alert channels
7. **Multi-Tenant Support** — Organization-level data isolation
8. **Audit Logging** — Track all admin actions
9. **Custom Scripts Library** — Store and execute scripts across device groups
10. **Agent Auto-Update** — Self-updating agent binary
11. **Metrics Retention Policies** — Auto-archive/delete old metrics (TimescaleDB)
12. **Device Groups & Tags** — Organize devices with flexible tagging
13. **SLA Monitoring** — Track uptime SLA compliance per device
14. **API Rate Limiting per Key** — Per-device rate limits
15. **Linux/macOS Agents** — Cross-platform agent support
