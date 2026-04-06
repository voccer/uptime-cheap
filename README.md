# Uptime Cheap Site Monitor

A serverless, low-cost website uptime monitoring system built on AWS. Get Slack alerts when your sites go down, view status history on a simple dashboard — all for **under $5/month**.

## Why This?

Most uptime monitoring solutions require either:
- **Expensive third-party SaaS** (~$15-50/month for 10+ sites)
- **Always-on VM** with UptimeKuma or similar (~$7-25/month for a VPS)

This project runs entirely on AWS serverless primitives — Lambda, DynamoDB, EventBridge — so you **pay only for what you use**:

| Component | Monthly Estimate |
|---|---|
| Lambda (checker, ~1 req/min) | ~$0.00 |
| Lambda (API, negligible) | ~$0.00 |
| DynamoDB (2 tables, on-demand) | ~$0.50-2.00 |
| API Gateway (HTTP API, free tier) | ~$0.00 |
| S3 (dashboard, <1MB) | ~$0.00 |
| EventBridge (free tier: 1M events/mo) | ~$0.00 |
| **Total** | **~$0.50-2.00/month** |

## Features

- **Multi-round health checks** — 3 checks at 20s intervals per invocation
- **Smart state transitions** — requires 2 consecutive failures to go DOWN, 2 successes to go UP
- **Per-site Slack alerts** — optional custom webhook per site, or global webhook
- **Status history** — stores last 90 beats per site (TTL-based auto-cleanup)
- **Dashboard** — static SPA, auto-refreshes every 30 seconds
- **REST API** — add/edit/delete sites programmatically
- **Free-tier friendly** — fits within AWS Free Tier for new accounts

## Architecture

```
 ┌─────────────────────────────────────────────────────────┐
 │                      AWS Region                         │
 │                                                         │
 │  EventBridge (rate: 1 min) ──► Lambda (checker)       │
 │                                        │                │
 │                    ┌─────────────────┼────────────────┤
 │                    ▼                                 ▼
 │            DynamoDB (sites)              DynamoDB (beats)
 │                    │                                 │
 │                    └──────────┬──────────────────────┘
 │                               │                       │
 │                    API Gateway (HTTP API)             │
 │                               │                       │
 └───────────────────────────────┼───────────────────────┘
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
           S3 (Dashboard)                 Slack
```

### Components

| Component | AWS Service | Purpose |
|---|---|---|
| Checker | Lambda (Node.js 22) | Runs health checks on schedule |
| API | Lambda + API Gateway | REST API for site management |
| Storage | DynamoDB (2 tables) | sites config + beats history |
| Scheduler | EventBridge | Triggers checker every minute |
| Dashboard | S3 (static website) | Vue-free vanilla JS SPA |

## Prerequisites

- **AWS Account** with appropriate IAM permissions
- **Terraform** >= 1.5
- **AWS CLI** configured (`aws configure`)
- **Slack webhook URL** (optional, for alerts)

## Installation

### 1. Install Terraform

**macOS:**
```bash
brew install terraform
```

**Linux (apt):**
```bash
sudo apt-get update && sudo apt-get install -y terraform
```

**Linux (download binary):**
```bash
curl -fsSL https://releases.hashicorp.com/terraform/1.10.0/terraform_1.10.0_linux_amd64.zip -o terraform.zip
unzip terraform.zip && sudo mv terraform /usr/local/bin/
rm terraform.zip
```

Verify:
```bash
terraform version
```

### 2. Clone & Configure

```bash
git clone https://github.com/your-org/pionero-services.git
cd pionero-services/terraform
```

Copy and edit the variables file:
```bash
cp main.tfvars main.tfvars.local
```

Edit `main.tfvars.local` with your values:
```hcl
project_name      = "my-monitor"
slack_webhook_url = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
admin_token       = "your-secure-random-token-here"
aws_region        = "ap-northeast-1"  # or your preferred region
beats_ttl_seconds = 604800            # 7 days
```

### 3. Deploy

```bash
make deploy
```

Or manually:
```bash
terraform init
terraform apply -var-file="main.tfvars.local"
```

## Usage

### Dashboard

After deployment, the dashboard URL will be shown in terraform output:
```
dashboard_url = "http://my-monitor-dashboard.s3-website.ap-northeast-1.amazonaws.com"
```

Open it in your browser. Enter the `admin_token` to access write operations (add/edit/delete sites).

### API Reference

All endpoints are at the API Gateway URL shown in terraform output (`api_endpoint`).

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/sites` | None | List all sites |
| `GET` | `/sites/{id}/beats` | None | Get beat history for a site |
| `POST` | `/sites` | Bearer token | Add a new site |
| `PATCH` | `/sites/{id}` | Bearer token | Update a site |
| `DELETE` | `/sites/{id}` | Bearer token | Delete a site |
| `POST` | `/auth` | None | Validate admin token |

**Add a site:**
```bash
curl -X POST https://your-api-id.execute-api.region.amazonaws.com/sites \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Blog",
    "url": "https://myblog.com",
    "check_interval_minutes": 5,
    "order_no": 1
  }'
```

**Per-site Slack webhook (optional):**
Add `"slack_webhook": "https://hooks.slack.com/services/..."` to override the global webhook for a specific site.

## Cost Comparison

| Aspect | Pionero (This) | UptimeKuma on VPS |
|---|---|---|
| **Infrastructure cost** | ~$0.50-2.00/mo | ~$7-25/mo (t2.micro or similar) |
| **Setup complexity** | Terraform only | VM + Docker + UptimeKuma install |
| **Maintenance** | None (serverless) | OS updates, UptimeKuma updates |
| **Scaling** | Automatic | Manual (resize VM) |
| **High availability** | Built-in (AWS managed) | Need multi-AZ setup |
| **Data retention** | Configurable (TTL) | Limited by disk |
| **Cold start** | None | ~5-30s (if monitoring not running) |
| **Uptime guarantee** | AWS Lambda SLA | Depends on VPS provider |

### Break-even

At ~$5/month VPS cost for UptimeKuma, this solution pays for itself in the first month vs a $7-25/mo VPS. At scale (50+ monitors), the difference becomes significant.

## Cleanup

```bash
make destroy
```

Or:
```bash
terraform destroy -var-file="main.tfvars.local"
```

## File Structure

```
pionero-services/
├── dashboard/
│   └── index.html          # Static dashboard (vanilla JS)
├── lambda/
│   ├── api/handler.mjs     # REST API Lambda
│   └── checker/handler.mjs # Health checker Lambda
├── terraform/
│   ├── main.tf             # Root module
│   ├── main.tfvars         # Variable defaults
│   ├── variables.tf        # Variable definitions
│   ├── outputs.tf          # Output definitions
│   └── modules/
│       ├── storage/        # DynamoDB tables
│       ├── compute/         # Lambda + EventBridge
│       ├── api/             # API Gateway
│       └── dashboard/       # S3 static hosting
└── Makefile
```

## License

MIT
