# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Site Monitor is a serverless AWS infrastructure for monitoring website uptime with Slack alerting. It consists of a static dashboard, a REST API, and a scheduled checker Lambda.

## Commands

```makefile
make deploy    # Deploy infrastructure: terraform init + apply
make destroy   # Tear down infrastructure
```

Terraform state is stored locally in `terraform/terraform.tfstate`. Lambda deployment packages are built automatically by Terraform from `lambda/checker/` and `lambda/api/` directories into `terraform/.builds/`.

## Architecture

### Data Flow
```
Dashboard (S3) → API Gateway (HTTP API) → Lambda API → DynamoDB (sites, beats)
EventBridge (rate 1 min) → Lambda Checker → DynamoDB + Slack webhook
```

### Key Files
- [dashboard/index.html](dashboard/index.html) — Static frontend (vanilla JS, no build step). Replace `__API_URL__` placeholder during deployment.
- [lambda/api/handler.mjs](lambda/api/handler.mjs) — REST API: `GET /sites`, `GET /sites/{id}/beats`, `POST /sites`, `PATCH /sites/{id}`, `DELETE /sites/{id}`, `POST /auth`
- [lambda/checker/handler.mjs](lambda/checker/handler.mjs) — Health checker: scans sites, performs HTTP checks, writes beats, updates status, sends Slack alerts

### DynamoDB Tables
- **sites**: Monitor configuration (`site_id`, `name`, `url`, `status`, `paused`, `check_interval_minutes`, `consecutive_ok`, `consecutive_fail`)
- **beats**: Heartbeat records (`site_id` PK, `timestamp` SK, `ok`, `status_code`, `latency_ms`, TTL 7 days)

### Checker Behavior
- EventBridge triggers every minute
- Performs 3 rounds of HTTP checks at 20s intervals within a single invocation
- Status transitions require 2 consecutive failures (DOWN) or 2 consecutive successes (UP)
- Slack notification only on status state change

### Dashboard Behavior
- Auto-refreshes every 30 seconds
- Fetches `GET /sites` + `GET /sites/{id}/beats` for each site
- Admin token required for write operations (stored in `localStorage`)

## Infrastructure (Terraform)

- Region: `ap-northeast-1` (configured in `terraform/variables.tf`)
- Modules: `storage` (DynamoDB), `compute` (Lambda), `api` (API Gateway), `dashboard` (S3)
- API Gateway uses HTTP API (not REST) with `$default` catch-all route
- Lambda timeout: checker=65s, api=10s
- Required variables: `project_name`, `slack_webhook_url`, `admin_token` (see `main.tfvars.example`) - file is gitignored, copy to `main.tfvars` before use
