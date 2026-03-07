# PharmAI — Deployment Plan

## Architecture Overview

```
                    ┌──────────────────┐
                    │   GitHub Actions  │
                    │   (CI/CD)         │
                    └────────┬─────────┘
                             │ Build & Push
                             ▼
                    ┌──────────────────┐
                    │  Azure Container  │
                    │  Registry (ACR)   │
                    └────────┬─────────┘
                             │ Pull Images
              ┌──────────────┴──────────────┐
              ▼                              ▼
   ┌─────────────────┐          ┌─────────────────────┐
   │  Azure App Svc   │          │  Azure App Svc       │
   │  (Frontend)       │ ◄─────► │  (Backend)            │
   │  Next.js :3000    │          │  FastAPI :8000        │
   └─────────────────┘          └──────────┬────────────┘
                                           │
                    ┌──────────────────────┬┴────────────────┐
                    ▼                      ▼                  ▼
          ┌──────────────┐    ┌─────────────────┐   ┌──────────────┐
          │ Neon Postgres │    │ Azure Blob       │   │ NVIDIA NIM   │
          │ + pgvector    │    │ Storage           │   │ API (Cloud)  │
          └──────────────┘    └─────────────────┘   └──────────────┘
```

---

## 1. Prerequisites

Before starting, ensure you have:

- [ ] **Azure account** with an active subscription
- [ ] **GitHub repository** with the source code pushed
- [ ] **Neon account** at [neon.tech](https://neon.tech) (free tier works)
- [ ] **NVIDIA NIM API key** from [build.nvidia.com](https://build.nvidia.com)
- [ ] **Azure CLI** installed locally (`az --version`)
- [ ] **Docker** installed locally (for testing builds)

---

## 2. Azure Resources Setup

### 2.1 Resource Group

```bash
az group create --name rg-phramai --location westeurope
```

### 2.2 Azure Container Registry (ACR)

```bash
az acr create --resource-group rg-phramai --name phramai --sku Basic
az acr login --name phramai
```

### 2.3 Azure Storage Account (for Blob Storage)

```bash
az storage account create \
  --name pharmaistorage \
  --resource-group rg-phramai \
  --location westeurope \
  --sku Standard_LRS

# Create the container for documents
az storage container create \
  --name documents \
  --account-name pharmaistorage

# Get the connection string (save this for later)
az storage account show-connection-string \
  --name pharmaistorage \
  --resource-group rg-phramai \
  --query connectionString -o tsv
```

### 2.4 Azure App Service Plan

```bash
az appservice plan create \
  --name plan-phramai \
  --resource-group rg-phramai \
  --sku B1 \
  --is-linux
```

### 2.5 Backend App Service

```bash
az webapp create \
  --resource-group rg-phramai \
  --plan plan-phramai \
  --name phramai-backend \
  --deployment-container-image-name phramai.azurecr.io/phramai-backend:latest

# Grant ACR pull access
az webapp identity assign --name phramai-backend --resource-group rg-phramai
PRINCIPAL_ID=$(az webapp identity show --name phramai-backend --resource-group rg-phramai --query principalId -o tsv)
ACR_ID=$(az acr show --name phramai --query id -o tsv)
az role assignment create --assignee $PRINCIPAL_ID --role AcrPull --scope $ACR_ID
```

### 2.6 Frontend App Service

```bash
az webapp create \
  --resource-group rg-phramai \
  --plan plan-phramai \
  --name phramai-frontend \
  --deployment-container-image-name phramai.azurecr.io/phramai-frontend:latest

# Grant ACR pull access
az webapp identity assign --name phramai-frontend --resource-group rg-phramai
PRINCIPAL_ID=$(az webapp identity show --name phramai-frontend --resource-group rg-phramai --query principalId -o tsv)
az role assignment create --assignee $PRINCIPAL_ID --role AcrPull --scope $ACR_ID
```

---

## 3. Neon Database Setup

1. Create a project at [console.neon.tech](https://console.neon.tech)
2. Enable the **pgvector** extension:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
   *(The backend also runs this on startup automatically)*
3. Copy the connection string — format:
   ```
   postgresql+asyncpg://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
   ```

---

## 4. Environment Variables

### 4.1 Backend (Azure App Service → Configuration)

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@ep-xxx.neon.tech/dbname?sslmode=require` | Neon connection string |
| `NVIDIA_API_KEY` | `nvapi-...` | From NVIDIA NIM |
| `AZURE_STORAGE_CONNECTION_STRING` | `DefaultEndpointsProtocol=https;AccountName=pharmaistorage;...` | From step 2.3 |
| `AZURE_STORAGE_CONTAINER` | `documents` | Default works |
| `ALLOWED_ORIGINS` | `["https://phramai-frontend.azurewebsites.net"]` | Frontend URL |
| `WEBSITES_PORT` | `8000` | Tells Azure which port the container listens on |

```bash
az webapp config appsettings set --name phramai-backend --resource-group rg-phramai --settings \
  DATABASE_URL="postgresql+asyncpg://..." \
  NVIDIA_API_KEY="nvapi-..." \
  AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;..." \
  AZURE_STORAGE_CONTAINER="documents" \
  ALLOWED_ORIGINS='["https://phramai-frontend.azurewebsites.net"]' \
  WEBSITES_PORT=8000
```

### 4.2 Frontend (Azure App Service → Configuration)

| Variable | Value | Notes |
|----------|-------|-------|
| `FASTAPI_URL` | `https://phramai-backend.azurewebsites.net` | Server-side proxy (runtime) |
| `WEBSITES_PORT` | `3000` | Container port |

> **Note:** `NEXT_PUBLIC_FASTAPI_URL` is a **build-time** variable — set it as a build arg in the CI/CD pipeline, NOT in App Service config.

```bash
az webapp config appsettings set --name phramai-frontend --resource-group rg-phramai --settings \
  FASTAPI_URL="https://phramai-backend.azurewebsites.net" \
  WEBSITES_PORT=3000
```

---

## 5. GitHub Actions CI/CD

### 5.1 GitHub Secrets

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `AZURE_ACR_LOGIN_SERVER` | `phramai.azurecr.io` |
| `AZURE_ACR_USERNAME` | ACR admin username or service principal |
| `AZURE_ACR_PASSWORD` | ACR admin password or service principal secret |
| `AZURE_WEBAPP_PUBLISH_PROFILE_BACKEND` | Download from Azure Portal → Backend App Service → Deployment Center |
| `AZURE_WEBAPP_PUBLISH_PROFILE_FRONTEND` | Download from Azure Portal → Frontend App Service → Deployment Center |
| `BACKEND_URL` | `https://phramai-backend.azurewebsites.net` |

### 5.2 Workflow File

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [main]

env:
  ACR_LOGIN_SERVER: ${{ secrets.AZURE_ACR_LOGIN_SERVER }}

jobs:
  build-and-deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to ACR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.ACR_LOGIN_SERVER }}
          username: ${{ secrets.AZURE_ACR_USERNAME }}
          password: ${{ secrets.AZURE_ACR_PASSWORD }}

      - name: Build and push backend image
        run: |
          docker build \
            --platform linux/amd64 \
            -t ${{ env.ACR_LOGIN_SERVER }}/phramai-backend:${{ github.sha }} \
            -t ${{ env.ACR_LOGIN_SERVER }}/phramai-backend:latest \
            ./backend
          docker push ${{ env.ACR_LOGIN_SERVER }}/phramai-backend --all-tags

      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v3
        with:
          app-name: phramai-backend
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE_BACKEND }}
          images: ${{ env.ACR_LOGIN_SERVER }}/phramai-backend:${{ github.sha }}

  build-and-deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Log in to ACR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.ACR_LOGIN_SERVER }}
          username: ${{ secrets.AZURE_ACR_USERNAME }}
          password: ${{ secrets.AZURE_ACR_PASSWORD }}

      - name: Build and push frontend image
        run: |
          docker build \
            --platform linux/amd64 \
            --build-arg NEXT_PUBLIC_FASTAPI_URL=${{ secrets.BACKEND_URL }} \
            -t ${{ env.ACR_LOGIN_SERVER }}/phramai-frontend:${{ github.sha }} \
            -t ${{ env.ACR_LOGIN_SERVER }}/phramai-frontend:latest \
            ./frontend
          docker push ${{ env.ACR_LOGIN_SERVER }}/phramai-frontend --all-tags

      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v3
        with:
          app-name: phramai-frontend
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE_FRONTEND }}
          images: ${{ env.ACR_LOGIN_SERVER }}/phramai-frontend:${{ github.sha }}
```

Both jobs run **in parallel** for faster deployments.

---

## 6. Rate Limiting

All API endpoints are protected per IP address. Exceeded limits return HTTP 429.

| Endpoint Type | Limit | Examples |
|---------------|-------|---------|
| Read operations | 120/min | Document listing, retrieval, PDF serving, metrics |
| Write operations | 60/min | Session CRUD, document create/update/delete |
| File uploads | 20/min | PDF uploads |
| AI operations | 30/min | RAG query, streaming, ingestion, similarity search |

---

## 7. Error Handling & Resilience

AI-dependent services (NVIDIA NIM API) implement automatic retry with exponential backoff:

| Operation | Retries | Wait Strategy |
|-----------|---------|---------------|
| Document retrieval (embeddings) | 3 attempts | 1s → 2s → 4s (exponential) |
| LLM generation | 3 attempts | 1s → 2s → 4s (exponential) |

Retried on: `TimeoutError`, `ConnectionError`, `RuntimeError`.

---

## 8. Security Checklist

- [x] All secrets in GitHub Secrets (never in code)
- [x] Environment variables injected at runtime via Azure App Service
- [x] ACR access secured with managed identity (AcrPull role)
- [x] Database connections use SSL (`?sslmode=require`)
- [x] CORS restricted to production frontend domain
- [x] Rate limiting on all endpoints (per IP)
- [x] Non-root container user (`appuser`)
- [x] Path traversal protection on file endpoints
- [x] PDF validation (magic bytes + extension + size limit)
- [x] Azure Blob Storage for persistent document storage

---

## 9. URLs (Post-Deployment)

| Service | URL |
|---------|-----|
| Frontend | `https://phramai-frontend.azurewebsites.net` |
| Backend API | `https://phramai-backend.azurewebsites.net/api` |
| API Docs (Swagger) | `https://phramai-backend.azurewebsites.net/docs` |
| Health Check | `https://phramai-backend.azurewebsites.net/health` |

---

## 10. Estimated Cost

| Resource | Tier | Est. Monthly Cost |
|----------|------|-------------------|
| App Service Plan (B1, shared for both apps) | Basic | ~$13 |
| Neon PostgreSQL | Free / Pro | $0–$19 |
| Azure Storage (Blob) | Standard LRS | ~$1 (< 10 GB) |
| Azure Container Registry | Basic | ~$5 |
| NVIDIA NIM API | Usage-based | Varies |
| **Total** | | **~$19–$38/month** |

---

## 11. Deployment Verification

After deploying, verify everything works:

```bash
# 1. Backend health check
curl https://phramai-backend.azurewebsites.net/health
# Expected: {"status":"ok","version":"1.0.0"}

# 2. API docs accessible
curl -s -o /dev/null -w "%{http_code}" https://phramai-backend.azurewebsites.net/docs
# Expected: 200

# 3. Frontend loads
curl -s -o /dev/null -w "%{http_code}" https://phramai-frontend.azurewebsites.net
# Expected: 200

# 4. CORS headers present
curl -s -I -H "Origin: https://phramai-frontend.azurewebsites.net" \
  https://phramai-backend.azurewebsites.net/health | grep -i access-control
# Expected: access-control-allow-origin: https://phramai-frontend.azurewebsites.net

# 5. Rate limiting active
curl -s -I https://phramai-backend.azurewebsites.net/health | grep -i x-ratelimit
# Expected: x-ratelimit-limit, x-ratelimit-remaining headers
```

---

## Appendix: Complete Environment Variables Reference

> All variables are defined in `.env.example` at the project root. Copy it to `.env` for local dev.

### Backend Variables

| Variable | Required | Default | Where Set | Description |
|----------|----------|---------|-----------|-------------|
| `DATABASE_URL` | **Yes** | `postgresql+asyncpg://postgres:postgres@localhost:5432/app_db` | `.env` / Azure Config | Async PostgreSQL connection string (must support pgvector) |
| `NVIDIA_API_KEY` | **Yes** | `""` | `.env` / Azure Config / GitHub Secrets | NVIDIA NIM API key for LLM + embeddings |
| `AZURE_STORAGE_CONNECTION_STRING` | **Production** | `""` | Azure Config / GitHub Secrets | Azure Blob Storage connection string. Empty = local filesystem fallback |
| `AZURE_STORAGE_CONTAINER` | No | `documents` | Azure Config | Blob container name for uploaded PDFs |
| `ALLOWED_ORIGINS` | No | `["http://localhost:5173", "http://localhost:3000", "https://phramai-frontend.azurewebsites.net"]` | `.env` / Azure Config | JSON array of CORS-allowed origins |
| `APP_NAME` | No | `FastAPI App` | `.env` | Display name in API docs |
| `APP_VERSION` | No | `1.0.0` | `.env` | Shown in health check response |
| `DEBUG` | No | `False` | `.env` | Enables SQLAlchemy query echo |
| `API_PREFIX` | No | `/api` | `.env` | URL prefix for all API routes |
| `UPLOAD_DIR` | No | `uploads` | `.env` | Local filesystem upload directory (dev fallback) |
| `LLM_MODEL` | No | `meta/llama-3.3-70b-instruct` | `.env` | NVIDIA NIM LLM model name |
| `NVIDIA_EMBEDDING_MODEL` | No | `nvidia/nv-embedqa-e5-v5` | `.env` | NVIDIA NIM embedding model (1024-dim) |
| `WEBSITES_PORT` | **Production** | — | Azure Config | Tells Azure App Service which port the container listens on (`8000`) |

### Frontend Variables

| Variable | Required | Default | Where Set | Type | Description |
|----------|----------|---------|-----------|------|-------------|
| `NEXT_PUBLIC_FASTAPI_URL` | **Yes** | `http://localhost:8000` | Docker build arg / CI | **Build-time** | Backend URL for browser-side API calls. Baked into client JS at build. |
| `FASTAPI_URL` | **Production** | `http://localhost:8000` | Azure Config | **Runtime** | Backend URL for server-side route handlers (SSE proxy). |
| `WEBSITES_PORT` | **Production** | — | Azure Config | **Runtime** | Tells Azure which port the container listens on (`3000`) |

### GitHub Actions Secrets

| Secret | Description |
|--------|-------------|
| `AZURE_ACR_LOGIN_SERVER` | ACR login server (e.g. `phramai.azurecr.io`) |
| `AZURE_ACR_USERNAME` | ACR admin username or service principal client ID |
| `AZURE_ACR_PASSWORD` | ACR admin password or service principal secret |
| `AZURE_WEBAPP_PUBLISH_PROFILE_BACKEND` | Backend App Service publish profile XML |
| `AZURE_WEBAPP_PUBLISH_PROFILE_FRONTEND` | Frontend App Service publish profile XML |
| `BACKEND_URL` | Public backend URL (e.g. `https://phramai-backend.azurewebsites.net`) |

### Example `.env` Files

**Local development** (`.env` in project root):
```env
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/app_db
NVIDIA_API_KEY=nvapi-your-key-here
ALLOWED_ORIGINS=["http://localhost:3000","http://localhost:5173"]
NEXT_PUBLIC_FASTAPI_URL=http://localhost:8000
```

**Production** (Azure App Service — Backend):
```env
DATABASE_URL=postgresql+asyncpg://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
NVIDIA_API_KEY=nvapi-your-key-here
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=pharmaistorage;AccountKey=...;EndpointSuffix=core.windows.net
AZURE_STORAGE_CONTAINER=documents
ALLOWED_ORIGINS=["https://phramai-frontend.azurewebsites.net"]
WEBSITES_PORT=8000
```

**Production** (Azure App Service — Frontend):
```env
FASTAPI_URL=https://phramai-backend.azurewebsites.net
WEBSITES_PORT=3000
```

> `NEXT_PUBLIC_FASTAPI_URL` is **not** set in Azure Config — it's passed as a Docker build arg in the CI/CD pipeline:
> ```
> --build-arg NEXT_PUBLIC_FASTAPI_URL=https://phramai-backend.azurewebsites.net
> ```
