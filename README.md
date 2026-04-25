# Academia360

**Academia360** is a full-stack Outcome-Based Education (OBE) platform designed for engineering colleges to manage student grades, track academic progression, and compute CO/PO attainment metrics required for NBA accreditation. It combines a teacher-facing portal with a set of AI-powered microservices for automated course outcome generation, personalized learning recommendations, and resource discovery.

---

## Overview

Traditional mark-entry and result-processing workflows in engineering colleges are manual, error-prone, and disconnected from accreditation requirements. Academia360 replaces that with a unified system where teachers upload marks once and the platform automatically:

- Applies VTU grading rules (CIE + SEE, ×2 formula for lab/activity courses)
- Computes SGPA and CGPA for every student across all semesters
- Maps student performance to Course Outcomes (COs) and Program Outcomes (POs)
- Calculates attainment levels for NBA/NAAC reports
- Suggests learning resources to students based on their performance gaps

---

## Key Features

### Teacher Portal
- **Mark Upload** — Upload CIE (Internal), SEE (End-Semester), lab, and activity marks via Excel/CSV
- **Grade Calculation** — Automatic VTU-compliant grade computation (CIE/50 + SEE/50 = 100) with special handling for 1–2 credit courses
- **Student Progression** — 8-semester timeline view showing SGPA, CGPA, earned credits, and course-wise grades per student
- **CO/PO Attainment Dashboard** — Visualises attainment levels across all mapped course outcomes and program outcomes
- **SEE Question Mapping** — Map SEE question marks to specific COs for fine-grained attainment tracking
- **Course Exit Survey (CES)** — Collect and analyse student feedback on CO achievement
- **Student Analysis** — Per-student drill-down showing CIE component breakdown (assignments, quizzes, AAT, lab records)

### Student Portal
- View personal grades, CGPA history, and semester-wise progression
- Access personalised learning resource recommendations
- Complete Course Exit Surveys
- DBMS-specific resource recommender with study plan generation

### AI Microservices
| Service | Description |
|---|---|
| **CO Generator** | Fine-tuned LLM (Qwen / GPT-Neo with LoRA) backed by a Neo4j knowledge graph to auto-generate Course Outcomes from a course syllabus |
| **Recommendation Service** | Hybrid collaborative-filtering + content-based ML model that recommends learning resources based on a student's performance gaps |
| **DBMS Recommender** | FastAPI service providing topic-aware resource recommendations specifically for Database Management courses |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Recharts, Framer Motion, MUI, Lucide React |
| Backend API | Node.js 20, Express, JWT Auth, Winston logging |
| Primary Database | PostgreSQL 16 |
| Analytics Store | MongoDB 7 |
| Vector Store | ChromaDB (for RAG/semantic search) |
| Knowledge Graph | Neo4j 5 (CO Generator) |
| Upload Service | FastAPI (Python) — parses XLSX/CSV and writes to PostgreSQL |
| CO Generator | FastAPI + fine-tuned Qwen/GPT-Neo (LoRA) + Neo4j |
| Recommendation | FastAPI + scikit-learn collaborative filtering |
| Containerisation | Docker + Docker Compose |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Frontend :5173                      │
└──────────────┬──────────────────────────────┬────────────────────┘
               │                              │
       REST / JWT                    REST (microservices)
               │                              │
   ┌───────────▼──────────┐       ┌──────────▼──────────────────┐
   │  Node.js Backend     │       │  Python Microservices        │
   │  Express API  :8080  │       │  Upload Service       :8001  │
   │                      │       │  CO Generator         :8002  │
   │  ┌────────────────┐  │       │  Recommendation Svc   :8003  │
   │  │  PostgreSQL    │  │       │  DBMS Recommender     :8004  │
   │  │  (grades,      │  │       └──────────────────────────────┘
   │  │   users, COs)  │  │
   │  └────────────────┘  │       ┌──────────────────────────────┐
   │  ┌────────────────┐  │       │  Databases                   │
   │  │  MongoDB       │  │       │  PostgreSQL           :5432  │
   │  │  (analytics)   │  │       │  MongoDB              :27018 │
   │  └────────────────┘  │       │  ChromaDB             :8000  │
   └──────────────────────┘       │  Neo4j                :7474  │
                                  └──────────────────────────────┘
```

---

## Getting Started

### Prerequisites
- Docker and Docker Compose
- 8 GB RAM recommended (Neo4j + LLM services are memory-intensive)

### Run with Docker Compose

```bash
git clone https://github.com/trahulprabhu38/Academia360.git
cd Academia360
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080/api |
| Upload Service | http://localhost:8001 |
| CO Generator | http://localhost:8002 |
| Recommendation Service | http://localhost:8003 |
| DBMS Recommender | http://localhost:8004 |
| Neo4j Browser | http://localhost:7474 |

### Default Credentials
The database is seeded with an admin teacher account. Register new teacher/student accounts through the signup page.

---

## Grading System

Academia360 implements VTU (Visvesvaraya Technological University) grading rules:

| Course Type | Formula |
|---|---|
| Theory / IPCC (≥3 credits) | `Final = CIE/50 + (SEE_obtained / SEE_max) × 50` |
| Activity / Lab with CIE (2 credits) | `Final = CIE/50 + SEE_obtained/50` |
| Pure Lab / Activity (1–2 credits, no CIE) | `Final = min(raw_mark × 2, 100)` |

Letter grades follow the 10-point scale: **A+ (10), A (9), B+ (8), B (7), C+ (6), C (5), D (4), E (0), F (0)**.

---

## Project Structure

```
Academia360/
├── backend/               # Node.js/Express REST API
│   ├── routes/            # API route handlers
│   ├── services/          # Business logic (grades, CGPA, attainment)
│   ├── middleware/        # Auth, logging
│   └── migrations/        # PostgreSQL schema
├── edu-frontend/          # React + Vite frontend
│   └── src/
│       ├── pages/teacher/ # Teacher portal pages
│       └── pages/student/ # Student portal pages
├── upload-service/        # FastAPI XLSX/CSV ingestion service
├── CO-generator/          # LLM-based CO generation + Neo4j
├── recommendation-service/# Collaborative filtering recommender
├── res_system_streamlit/  # DBMS resource recommender
├── data/                  # Docker volume mounts (DB data)
└── docker-compose.yml
```

---

## Author

**T Rahul Prabhu**  
Department of Artificial Intelligence and Machine Learning  
Dayananda Sagar College of Engineering, Bengaluru

---

## License

MIT
