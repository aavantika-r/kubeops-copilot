# KubeOps Copilot

## AI-Powered Kubernetes Troubleshooting Platform

KubeOps Copilot is an AI-powered platform designed to help DevOps and Kubernetes users detect unhealthy Pods, collect Kubernetes information, analyze the root cause of failures, and receive recommended solutions.

The platform uses a Large Language Model (LLM) to analyze Kubernetes Pod information and provide troubleshooting guidance.

---

## 🚀 Features

### 1. Kubernetes Cluster Monitoring

KubeOps Copilot connects to a Kubernetes cluster and retrieves Pod information such as:

- Pod name
- Namespace
- Pod status
- Container status
- Container image

---

### 2. AI Pod Root Cause Analysis

When a Pod becomes unhealthy, KubeOps Copilot collects relevant Kubernetes information including:

- Pod details
- Container status
- Kubernetes events
- Pod logs

This information is sent to the LLM for analysis.

The AI provides:

- Root Cause
- Why it happened
- Impact
- Severity
- Recommended Solution

---

### 3. AI Auto-Fix Recommendation

For supported problems, KubeOps Copilot identifies a safe remediation proposal.

The interface shows:

- Problem detected
- Current image
- Proposed image
- Current image pull policy
- Proposed image pull policy
- Recommended action

The user can review the proposed change before applying it.

---

### 4. Auto-Fix

After reviewing the proposed remediation, the user can apply the fix directly to the Kubernetes Deployment.

KubeOps Copilot then:

1. Applies the proposed change
2. Performs a Kubernetes rollout
3. Waits for the rollout to complete
4. Checks the Deployment status
5. Reports the result

---

### 5. Kubernetes Cluster Connection

The current development environment uses:

- Docker Desktop Kubernetes

The platform connects to the cluster using the Kubernetes Python client and `kubectl`.

---

### 6. Authentication UI

The frontend currently contains:

- Register page
- Login page
- Cluster connection page
- Dashboard

Real database-backed authentication will be added in a future phase.

---

# 🏗️ Architecture

```text
                    KubeOps Copilot
                           │
                           ▼
                  React Frontend
                           │
                           ▼
                   FastAPI Backend
                           │
                           ▼
                 Kubernetes Cluster
                           │
                    ┌──────┴──────┐
                    │             │
                  Pods          Events
                    │             │
                    └──────┬──────┘
                           │
                           ▼
                    Data Collection
                           │
                           ▼
                        Groq LLM
                           │
                           ▼
                  Root Cause Analysis
                           │
                 ┌─────────┴─────────┐
                 │                   │
             Solution             Severity
                 │                   │
                 └─────────┬─────────┘
                           │
                           ▼
                    Auto-Fix Proposal
                           │
                           ▼
                    User Review
                           │
                           ▼
                     Apply Fix
                           │
                           ▼
                    Kubernetes

                    🧩 Project Structure
kubeops-copilot/
│
├── backend/
│   ├── app.py
│   ├── kubernetes_client.py
│   ├── main.py
│   ├── test_kubernetes.py
│   │
│   └── pod_analyzer/
│       ├── init.py
│       ├── kubeops_analyzer.py
│       └── pod_analyzer.py
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Cluster.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Login.jsx
│   │   │   └── Register.jsx
│   │   │
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── vite.config.js
│
├── test-app/
│   ├── Dockerfile
│   ├── app.py
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── pod_analyzer/
│   └── templates/
│
├── .gitignore
└── README.md

🛠️ Technology Stack
Frontend
React.js
Vite
JavaScript
CSS
Backend
Python
FastAPI
Kubernetes Python Client
kubectl
AI
Groq API
Large Language Model (LLM)
Kubernetes
Kubernetes
Docker Desktop Kubernetes
Deployments
ReplicaSets
Pods
Services
Test Application
Python
Flask
Docker
PostgreSQL / Supabase

🔄 How KubeOps Copilot Works
1. Kubernetes Cluster
        ↓
2. Pod Status Detection
        ↓
3. Unhealthy Pod Selected
        ↓
4. Logs + Events + Pod Details Collected
        ↓
5. Information Sent to LLM
        ↓
6. AI Root Cause Analysis
        ↓
7. Recommended Solution
        ↓
8. Auto-Fix Proposal
        ↓
9. User Reviews Fix
        ↓
10. Fix Applied to Kubernetes
        ↓
11. Deployment Rollout
        ↓
12. Pod Health Verified
🧪 Test Application

A MiniShop application is used as the test workload for Kubernetes troubleshooting.

The application is containerized using Docker and deployed into Kubernetes.

KubeOps Copilot can intentionally introduce controlled failures in the test environment and analyze the resulting Kubernetes problems.

