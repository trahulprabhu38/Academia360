# OBE CO/PO Attainment System - Monorepo

## Overview

A full-stack Outcome-Based Education (OBE) analytics suite for large-scale academic institutions. The system provides powerful CO/PO attainment analysis, AI-powered outcome generation (CO Generator), robust resource recommendation (RecSys, DBMS Recommender), bulk data uploads, and detailed analytics dashboards for students and faculty.

- **Frontend:** React (Vite)
- **Backend/API:** Node.js (Express)
- **Recommendation & Data Services:** Python (FastAPI, Streamlit)
- **AI CO Generator:** Python (FastAPI, Neo4j, ChromaDB)
- **Databases:** PostgreSQL, MongoDB, ChromaDB (vector), Neo4j (graph)
- **Orchestration:** Docker Compose

---

## System Architecture

Below is a system-level view of all services in the stack and how they interact. See the `docker-compose.yml` for more config details.

```mermaid
graph TD
  subgraph Frontend
    FE[React (edu-frontend)]
  end

  subgraph API Backend
    BE[Node.js Backend]<--->PG[(Postgres)]
    BE<--->MG[(MongoDB)]
    BE<-->UPLOAD[Upload Service (CSV/XLSX to Postgres)]
    BE<.->COGEN[CO Generator]
    BE<.->RECSYS[Recommendation Service]
    BE<.->DBMSRC[DBMS Recommender]
  end
  subgraph AI Services
    COGEN[CO Generator]<-->NEO4J[(Neo4j)]
    COGEN<-->CHROMA[(ChromaDB)]
  end
  subgraph Analytics/Reco
    RECSYS[Recommendation Service]<-.->BE
    DBMSRC[DBMS Recommender Service]<-.->BE
  end
  FE<-.->BE
  FE<-.->COGEN
  FE<-.->RECSYS
  FE<-.->DBMSRC

  Upload((Uploads/Temp))
  BE<.->Upload

  classDef service fill:#cce,stroke:#111,stroke-width:1.5px;
  classDef db fill:#eee,stroke:#444,stroke-width:1.5px;
  class BE,COGEN,RECSYS,DBMSRC,UPLOAD service;
  class PG,MG,CHROMA,NEO4J db;
```

### Key Flows
- **Data & Auth Management:** Handled by Node.js backend, which syncs across SQL (Postgres) and NoSQL (MongoDB).
- **CO Generation:** AI-powered service reading course docs, building semantic/graph index, and outputting 6 tailored COs with validation/explainability per run.
- **Reco:** Python recommendations for per-student analytics, resources, and study plans, including hybrid collaborative/content-based methods.
- **Bulk Uploads:** Dedicated service for large mark and course import.
- **Persistent Storage:** All DB data is stored in project-level `data/` and `backend/uploads/` host volumes.

---

## Docker Compose & Storage

### Services
Summarized from `docker-compose.yml`:
- **mongodb**    - Main NoSQL OBE data
- **postgres**   - SQL for marksheets, CO/PO, etc.
- **chromadb**   - Embeddings/vector store (CO Generator)
- **neo4j**      - Course graph storage (CO Generator)
- **backend**    - Node.js API & logic
- **frontend**   - Vite React SPA
- **upload-service** - FastAPI CSV/XLSX import to Postgres
- **co-generator**   - FastAPI 5-stage AI pipeline (see CO-generator/README)
- **recommendation-service** - FastAPI student resource reco
- **dbms-recommender**      - FastAPI/Streamlit DBMS-specific reco

### Storage & Volumes
- `/data/mongodb-data` ↔️ MongoDB
- `/data/pg-data`      ↔️ PostgreSQL
- `/data/chroma-data`  ↔️ ChromaDB
- `/data/neo4j-data`, `/data/neo4j-logs`, `/data/neo4j-import` ↔️ Neo4j
- `/backend/uploads`   ↔️ User-uploaded files
- `/recommendation-service/data` ↔️ Learning resource & student data
- `/res_system_streamlit/data`   ↔️ Same
- `/CO-generator/data`           ↔️ Syllabus, embeddings, outputs

---

## Quick Start

```bash
# Start everything
docker-compose up -d

# Check API health:
curl http://localhost:8080/health    # Backend
curl http://localhost:8001/health    # Upload Service
curl http://localhost:8002/health    # CO Generator
curl http://localhost:8003/health    # Recommendation
curl http://localhost:8004/health    # DBMS Recommender
open http://localhost:5173           # Frontend SPA
open http://localhost:7474           # Neo4j Browser
```

---

## Main API Endpoints (selected)

- **Backend:** `/api/*`
  - `/api/auth/*`       - Auth, JWT, profile
  - `/api/courses`      - List, create courses
  - `/api/upload/assessment` - Marksheet upload
  - `/api/ai-cos`       - AI CO generation
  - `/api/attainment`   - Course/PO attainment analytics
  - `/api/co-mapping`   - CO/PO map
  - `/api/detailed-calculations` - Custom analytics

- **CO Generator:** `/generate-cos`, `/sessions`, `/knowledge-graph`, `/health` (see `CO-generator/README.md`)
- **Reco Services:** `/api/recommendations/*`, `/api/resources/*`, `/api/feedback/*`, `/api/analytics/*`
- **DBMS Recommender:** `/api/recommendations`, `/api/feedback`, `/api/study-plan`, `/api/analytics/*`

---

## Directory Layout

```
/edu-frontend            # React SPA
/backend                 # Node.js API & logic
/CO-generator            # CO Generator microservice (see its README)
/recommendation-service  # Python FastAPI (student resources)
/res_system_streamlit    # DBMS/Streamlit recommender
/upload-service          # FastAPI CSV/XLSX import
/data                    # DB volumes (persistence)
/uploads                 # Raw uploaded files
```

---

## Contributing & Support
- See each subproject's README for dev instructions.
- PRs welcome! MIT licensed.
- For bugs/issues: open a GitHub issue. For architecture: see Mermaid diagram and docker-compose.yml.

---



 docker exec -i postgre psql -U admin -d edu < backend/migrations/001_initial_schema.sql      