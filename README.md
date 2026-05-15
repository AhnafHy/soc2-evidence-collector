# SOC 2 Evidence Collector

A SOC 2 compliance automation tool with a live React dashboard. Lambda functions automatically collect evidence from your AWS account, map each finding to a specific SOC 2 Trust Service Criteria control, and store everything in DynamoDB. The React frontend displays a compliance dashboard showing pass/fail/warn status per control with drill-down evidence views. The entire stack deploys automatically via a GitHub Actions CI/CD pipeline on every push, Terraform provisions all backend infrastructure, then the pipeline builds and deploys the React app to S3.
> **Note on CloudFront:** This project was originally designed to use **AWS CloudFront** as a CDN layer in front of the S3 static website, providing HTTPS, global edge caching, and cache invalidation on every CI/CD deployment. However, new AWS accounts require manual verification before CloudFront distributions can be created. While awaiting approval, the React frontend is served directly from S3 static website hosting over HTTP. Once CloudFront access is granted, re-enabling it requires only uncommenting the CloudFront resource block in `terraform/main.tf` and adding a cache invalidation step to the GitHub Actions workflow — all other infrastructure remains unchanged.

---

## Live Demo

**[View Live Dashboard →](http://soc2-evidence-collector-frontend-c8c748ca.s3-website.us-east-2.amazonaws.com/)**
> **Note:** Evidence collection covers AWS-native controls (IAM, CloudTrail, S3, CloudWatch). A production SOC 2 tool would extend this to third-party services (GitHub branch protection, Slack audit logs, GSuite) via their respective APIs, the Lambda collector is designed as a modular pipeline where additional evidence sources can be added without changing the storage or dashboard layer.

---

## What It Does

- **Automated evidence collection** — Lambda connects to AWS IAM, CloudTrail, S3, and CloudWatch APIs and collects real compliance evidence on a daily schedule
- **SOC 2 control mapping** — each piece of evidence is mapped to a specific Trust Service Criteria control (CC6.1, CC6.2, CC7.1, CC7.2, C1.1, etc.)
- **Compliance scoring** — calculates an overall compliance score and per-control pass/fail/warn status
- **React dashboard** — live compliance score, control breakdown by status, drill-down evidence detail per control
- **REST API** — Lambda-backed API Gateway endpoints serving dashboard, controls, and evidence data
- **CI/CD pipeline** — GitHub Actions deploys backend via Terraform and frontend via S3 sync on every push to master

---

## Architecture

```
Developer pushes to GitHub
        │
        ▼
GitHub Actions CI/CD Pipeline
        │
        ├── Job 1: Deploy Backend
        │   ├── terraform init (S3 remote state)
        │   ├── terraform apply
        │   └── outputs: api_url, frontend_bucket
        │
        └── Job 2: Deploy Frontend
            ├── npm install
            ├── npm run build (injects api_url)
            └── aws s3 sync → S3 bucket

                    ┌─────────────────────────────────────────┐
                    │                  AWS                    │
                    │                                         │
  Browser ─────────► S3 Static Website (React App)           │
                    │         │                               │
                    │         │ API calls                     │
                    │         ▼                               │
                    │  API Gateway (REST)                     │
                    │         │                               │
                    │         ▼                               │
                    │  Lambda — evidence_api                  │
                    │         │                               │
                    │         ▼                               │
                    │  DynamoDB (evidence table)              │
                    │                                         │
                    │  EventBridge (rate: 1 day)              │
                    │         │                               │
                    │         ▼                               │
                    │  Lambda — evidence_collector            │
                    │  ├── IAM API (password policy, MFA)    │
                    │  ├── CloudTrail API (audit logging)     │
                    │  ├── S3 API (encryption, public access) │
                    │  └── CloudWatch API (alarms)            │
                    │                                         │
                    │  Terraform State → S3 Backend           │
                    │  CloudWatch Alarm → API error rate      │
                    └─────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Recharts |
| API | AWS API Gateway (REST) |
| Compute | AWS Lambda (Python 3.11) |
| Database | AWS DynamoDB (PAY_PER_REQUEST) |
| Hosting | AWS S3 (static website) |
| Scheduling | AWS EventBridge (daily) |
| Observability | AWS CloudWatch Alarms |
| Infrastructure as Code | Terraform (S3 remote state) |
| CI/CD | GitHub Actions |

---

## Project Structure

```
soc2-evidence-collector/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD — Terraform backend + React frontend deploy
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx   # Compliance score + control summary cards
│   │   │   ├── Controls.jsx    # All SOC 2 controls with pass/fail/warn status
│   │   │   └── ControlDetail.jsx # Evidence drill-down per control
│   │   ├── App.jsx             # Router + navbar + collect evidence trigger
│   │   ├── main.jsx            # React Query provider setup
│   │   └── index.css           # Tailwind directives
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── .env.production         # VITE_API_URL injected by CI/CD at build time
├── lambda/
│   ├── evidence_collector.py   # Collects evidence from AWS APIs, stores in DynamoDB
│   └── evidence_api.py         # REST API handler for dashboard, controls, evidence
├── terraform/
│   ├── main.tf                 # All AWS resources + S3 remote backend
│   ├── variables.tf            # Region, project name, schedule
│   └── outputs.tf              # API URL, frontend bucket, S3 website URL
├── scripts/
│   └── seed_demo_data.py
├── .gitignore
└── README.md
```

---

## SOC 2 Controls Monitored

| Control ID | Control Name | Evidence Collected |
|---|---|---|
| CC6.1 | Logical and Physical Access Controls | Root MFA status, S3 public access |
| CC6.2 | Authentication and Authorization | IAM password policy strength |
| CC6.3 | Role-Based Access Control | IAM roles inventory |
| CC7.1 | System Monitoring | CloudWatch alarms configured |
| CC7.2 | Audit Logging | CloudTrail active trails |
| C1.1 | Data Encryption at Rest | S3 bucket encryption status |

---

## API Reference

### GET /dashboard
Returns latest collection summary with compliance score.
```json
{
  "latest_collection": {
    "collection_id": "20260510120000",
    "collected_at": "2026-05-10T12:00:00+00:00",
    "total_evidence": 7,
    "controls_pass": 3,
    "controls_fail": 2,
    "controls_warn": 1,
    "compliance_score": 50.0
  },
  "total_collections": 3
}
```

### GET /controls
Returns all monitored controls with current status and evidence count.

### GET /controls/{control_id}
Returns all evidence items for a specific control.

### POST /collect
Triggers an asynchronous evidence collection run.

---

## How to Deploy

### Prerequisites
- AWS account with CLI configured
- Terraform installed
- Node.js 20+ installed

### Steps

**1. Create Terraform state bucket**
```bash
aws s3 mb s3://soc2-tfstate-ahnaf--region us-east-2
```

**2. Update backend bucket name in terraform/main.tf**
```hcl
terraform {
  backend "s3" {
    bucket = "soc2-tfstate-ahnaf"
    key    = "soc2/terraform.tfstate"
    region = "us-east-2"
  }
}
```

**3. Create GitHub repo and add secrets**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

**4. Initialize Terraform locally**
```bash
cd terraform
terraform init
cd ..
```

**5. Push to GitHub — CI/CD handles the rest**
```bash
git add .
git commit -m "Initial commit"
git branch -M master
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin master
```

**6. Trigger first evidence collection**

Go to AWS Console → Lambda → `soc2-evidence-collector-collector` → Test → run with `{}`.

**7. Get your live URL**
```bash
cd terraform
terraform output frontend_url
```

---

## Screenshots

**Compliance Dashboard — live score with control breakdown:**

<img width="1164" height="488" alt="Compliance Dashboard" src="https://github.com/user-attachments/assets/050cf0f2-5679-4ecf-9ed6-6b382b121aae" />

**Trust Service Criteria — all controls with pass/fail/warn status:**

<img width="1163" height="768" alt="Trust Service Criteria" src="https://github.com/user-attachments/assets/0f0d0bcc-69b8-4a15-af55-7db3df714518" />

**Control Detail — evidence drill-down with resource and details:**

<img width="1134" height="282" alt="C1" src="https://github.com/user-attachments/assets/2f7e5f1c-43b6-4255-81b2-9f39d02195dc" />
<img width="1138" height="276" alt="C2" src="https://github.com/user-attachments/assets/0aaa9e23-5cf8-41c3-810f-61d501d315ea" />
<img width="1138" height="283" alt="C3" src="https://github.com/user-attachments/assets/19dd8c2f-dc33-4aed-9187-816f1913d2f1" />
<img width="1129" height="273" alt="C4" src="https://github.com/user-attachments/assets/36939cbf-9185-42d3-9d84-8631d55e4e7c" />
<img width="1138" height="439" alt="C5" src="https://github.com/user-attachments/assets/58e3f005-039a-415d-b09e-e36df9737c66" />
<img width="1133" height="275" alt="C6" src="https://github.com/user-attachments/assets/5adc7048-eb76-459b-8076-a100ae43eaad" />

**GitHub Actions CI/CD — both jobs green:**

<img width="720" height="239" alt="CICD pipeline" src="https://github.com/user-attachments/assets/6b675d6d-84d6-4b52-b48d-6b509e369d0c" />


---

## Key Concepts Demonstrated

- **CI/CD pipeline** — two-job GitHub Actions workflow: Terraform backend deploy feeds API URL into React frontend build via job outputs
- **Infrastructure as code** — all AWS resources provisioned and reproducible via Terraform with S3 remote state shared between local and CI/CD environments
- **CORS** — API Lambda returns correct CORS headers on every response including OPTIONS preflight requests
- **Serverless architecture** — Lambda + API Gateway + DynamoDB with no servers to manage
- **React Query** — client-side data fetching with automatic 30-second polling, retry logic, and loading states
- **Event-driven collection** — EventBridge triggers daily Lambda runs without any manual intervention
- **Compliance automation** — programmatic evidence collection replacing manual audit preparation workflows
