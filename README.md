# Global Tech CRM

A modern, full-stack business management platform for managing sales, operations, HR, projects, and client relationships — built with React, Express, and MongoDB.

**Live:** `https://crm.tgailab.site`

---

## Tech Stack

| Layer     | Technology                                                  |
| --------- | ----------------------------------------------------------- |
| Frontend  | React 19, TypeScript, TanStack Router, Tailwind CSS 4, Vite 8 |
| UI        | Radix UI, shadcn/ui, Lucide Icons, Recharts                |
| Backend   | Express.js, Node.js 22                                      |
| Database  | MongoDB Atlas                                               |
| Auth      | JWT (bcryptjs)                                              |
| Email     | Nodemailer (Gmail SMTP)                                     |
| Jobs      | node-cron (9 scheduled jobs)                                |
| Deploy    | Docker, Nginx, Let's Encrypt SSL                            |

---

## Modules

| #  | Module         | Route                | Description                                              |
| -- | -------------- | -------------------- | -------------------------------------------------------- |
| 1  | Dashboard      | `/dashboard`         | KPI cards, revenue, deals, tasks, activity feed          |
| 2  | Strategy       | `/strategy`          | OKRs, roadmap timeline, risk register                    |
| 3  | CRM            | `/crm`               | Contact database, pipeline kanban (Lead → Won/Lost)      |
| 4  | Sales          | `/sales`             | Deal pipeline, revenue charts, leaderboard               |
| 5  | Accounts       | `/accounts`          | Client accounts with detail pages, contacts, deal history|
| 6  | Marketing      | `/marketing`         | Campaign tracker, budget/reach/conversion analytics      |
| 7  | Meeting        | `/meeting`           | Calendar view, add/edit with attendees and video link     |
| 8  | Demos          | `/demos`             | Scheduled product demos list                             |
| 9  | Agreements     | `/agreements`        | Contract tracker (Draft/Sent/Signed/Expired)             |
| 10 | Project        | `/project`           | Project list, kanban per project, progress tracking      |
| 11 | Reports        | `/reports`           | Daily/weekly/monthly reports with PDF + email delivery   |
| 12 | Log Work       | `/log-work`          | Daily time logging per employee per project              |
| 13 | Execution      | `/execution`         | Task tracker with assignee, priority, due date           |
| 14 | After Sales    | `/after-sales`       | Support tickets, SLA countdown, satisfaction rating      |
| 15 | Operations     | `/operations`        | Process/workflow tracker, operations health dashboard    |
| 16 | Portfolio      | `/portfolio`         | Showcase of completed projects/case studies              |
| 17 | Documents      | `/documents`         | File repository with folders, upload/download, preview   |
| 18 | HR             | `/hr`                | Employee directory, attendance, onboarding checklists    |
| 19 | Teams          | `/teams`             | Team org chart, department groups, workload indicators   |
| 20 | Training       | `/training`          | Learning modules, progress bars, certifications          |

---

## Database Collections

| Collection            | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `employees`           | Staff records (role, department, salary, leave) |
| `accounts`            | Client organizations                           |
| `contacts`            | Individual customer contacts                   |
| `deals`               | Sales opportunities and pipeline               |
| `projects`            | Active projects with budget, progress, team    |
| `tasks`               | Project work items                             |
| `milestones`          | Project phases and deadlines                   |
| `deliverables`        | Tangible project outputs                       |
| `documents`           | Uploaded files                                 |
| `work_logs`           | Daily time entries                             |
| `meetings`            | Meeting records                                |
| `agreements`          | Contracts and agreements                       |
| `tickets`             | Support requests with SLA tracking             |
| `quotes`              | Project cost estimates and pricing             |
| `campaigns`           | Marketing campaigns                            |
| `goals`               | OKRs and objectives                            |
| `company_goals`       | Organization-level targets                     |
| `company_strategy`    | Vision and mission statements                  |
| `processes`           | Business workflows                             |
| `costs`               | Expense records                                |
| `budgets`             | Budget allocations per category                |
| `cost_snapshots`      | Monthly cost summaries (auto-generated)        |
| `trainings`           | Training courses and modules                   |
| `org_settings`        | Organization parameters                        |
| `report_subscriptions`| Report email distribution rules                |
| `report_history`      | Sent reports audit trail                       |
| `pm_commits`          | Git commit history (via PM Connect)            |
| `pm_daily_log`        | Daily developer activity (via PM Connect)      |

---

## Scheduled Jobs

| Job                  | Schedule                | What it does                                |
| -------------------- | ----------------------- | ------------------------------------------- |
| Daily Report         | 5:30 PM weekdays        | Sends daily work summary to subscribers     |
| Weekly Report        | 9 AM Monday             | Weekly performance summary                  |
| Monthly Report       | 9 AM 1st of month       | Monthly report with PDF attachment           |
| Cost Snapshot        | 1 AM 1st of month       | Records monthly cost metrics                |
| Budget Alerts        | 8 AM daily              | Alerts when costs exceed budget threshold   |
| Cost Lifecycle       | 2 AM daily              | Marks expired recurring costs as "Ended"    |
| Missing Log Digest   | 5 PM weekdays           | Emails about employees missing work logs    |
| Stale Quotes         | 3 AM daily              | Flags quotes older than 7 days              |
| Live Link Check      | 4 AM & 4 PM daily       | Checks project live URLs, updates status    |

---

## PM Connect (IDE Integration)

The backend exposes `/api/pmconnect/*` endpoints that let IDE extensions and git hooks automatically log developer activity:

| Endpoint              | Method | Description                                       |
| --------------------- | ------ | ------------------------------------------------- |
| `/auto-match`         | POST   | Matches git email/username to employee + project  |
| `/project-start`      | POST   | Records when a developer starts on a project      |
| `/commits`            | POST   | Logs git commits (SHA, message, files changed)    |
| `/heartbeat`          | POST   | Records active seconds and files from IDE         |
| `/my-rollups`         | GET    | Returns developer's activity across all projects  |
| `/tasks`              | GET    | Returns assigned tasks for a project              |

---

## Getting Started

### Prerequisites

- **Node.js** 22+
- **npm** 10+
- **MongoDB** (local or Atlas connection string)

### Local Development

```bash
# 1. Clone the repo
git clone https://github.com/timeglobaltech/global-tech-hub-main.git
cd global-tech-hub-main

# 2. Install dependencies (frontend + backend)
npm install
cd server && npm install && cd ..

# 3. Configure environment
cp server/.env.example server/.env
# Edit server/.env with your MongoDB URL and SMTP credentials

# 4. Run both frontend and backend
npm run dev        # Frontend → http://localhost:5173
npm run server     # Backend  → http://localhost:4000

# Or run both together (requires concurrently installed globally):
npm run dev:all
```

### Default Login

| Field    | Value               |
| -------- | ------------------- |
| Email    | `demo@globaltech.io`|
| Password | `demo1234`          |

---

## Environment Variables

Create `server/.env` (see `server/.env.example`):

```env
# MongoDB
MONGO_URL="mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/..."
MONGO_DB=global_tech_crm

# Auth
JWT_SECRET=your-64-byte-random-string
JWT_EXPIRES_IN=30d

# SMTP (Gmail)
SMTP_USER=your-email@gmail.com
SMTP_APP_PASSWORD=your-16-char-app-password
SMTP_FROM=your-email@gmail.com

# Server
PORT=4000
```

---

## Docker Deployment

The project includes a full Docker setup with Nginx reverse proxy and automatic SSL.

### Files

| File                 | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `Dockerfile`         | Multi-stage build (frontend + API + Nginx) |
| `docker-compose.yml` | Orchestrates API, Nginx, and Certbot       |
| `nginx/default.conf` | Nginx config with SSL + reverse proxy      |
| `nginx/init.conf`    | Temporary HTTP config for SSL setup        |
| `deploy.sh`          | One-command deployment script              |

### Deploy to VPS

```bash
# 1. SSH into your server
ssh root@your-server-ip

# 2. Clone the repo
git clone https://github.com/timeglobaltech/global-tech-hub-main.git /opt/global-tech-crm
cd /opt/global-tech-crm

# 3. Set up server/.env with your credentials

# 4. Deploy
chmod +x deploy.sh
bash deploy.sh
```

This will:
- Build the React frontend
- Start the Node.js API container
- Configure Nginx as a reverse proxy
- Obtain a Let's Encrypt SSL certificate
- Auto-renew SSL every 12 hours

### Architecture

```
Client → Nginx (port 80/443)
            ├── Static files (React SPA)
            └── /api/* → Node.js API (port 4000) → MongoDB Atlas
```

---

## Project Structure

```
global-tech-hub-main/
├── src/                        # Frontend (React + TypeScript)
│   ├── components/             # Reusable UI components
│   │   ├── ui/                 # shadcn/ui primitives
│   │   └── strategy/           # Strategy-specific components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities, API client, navigation config
│   ├── routes/                 # TanStack Router file-based routes
│   │   ├── _authenticated/     # Protected route pages
│   │   ├── auth.tsx            # Login page
│   │   └── index.tsx           # Landing page
│   ├── main.tsx                # App entry point
│   └── styles.css              # Global styles (Tailwind)
├── server/                     # Backend (Express.js)
│   ├── index.mjs               # Express server, routes, auth middleware
│   ├── db.mjs                  # MongoDB connection, CRUD helpers
│   ├── seed-data.mjs           # Initial seed data for all collections
│   ├── jobs.mjs                # Scheduled cron jobs
│   ├── mail.mjs                # Nodemailer email service
│   ├── pmconnect.mjs           # PM Connect IDE integration API
│   └── reports-lib.mjs         # Report generation logic
├── nginx/                      # Nginx configuration
├── Dockerfile                  # Multi-stage Docker build
├── docker-compose.yml          # Container orchestration
├── deploy.sh                   # Deployment script
├── vite.config.ts              # Vite + Tailwind + TanStack Router config
└── package.json                # Frontend dependencies and scripts
```

---

## API Endpoints

### Auth
| Method | Endpoint             | Description         |
| ------ | -------------------- | ------------------- |
| POST   | `/api/auth/register` | Create new account  |
| POST   | `/api/auth/login`    | Login, returns JWT  |
| GET    | `/api/auth/me`       | Get current user    |
| POST   | `/api/auth/logout`   | Logout              |

### CRUD (all collections)
| Method | Endpoint             | Description              |
| ------ | -------------------- | ------------------------ |
| GET    | `/api/:table`        | List all rows (sorted)   |
| GET    | `/api/:table/:id`    | Get single row           |
| POST   | `/api/:table`        | Create new row           |
| PUT    | `/api/:table/:id`    | Update row               |
| DELETE | `/api/:table/:id`    | Delete row               |

### Reports
| Method | Endpoint             | Description                         |
| ------ | -------------------- | ----------------------------------- |
| POST   | `/api/reports/send`  | Send report email with PDF attachment|

### Health
| Method | Endpoint       | Description           |
| ------ | -------------- | --------------------- |
| GET    | `/api/health`  | API health check      |

---

## Scripts

```bash
npm run dev          # Start Vite dev server (frontend)
npm run server       # Start Express API server (backend)
npm run dev:all      # Run both concurrently
npm run build        # Production build (frontend)
npm run preview      # Preview production build
npm run lint         # ESLint check
npm run format       # Prettier format
```

---

## License

Private — TimeGlobal Tech.
