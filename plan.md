# Academia360 — CO/PO/PSO Attainment: End-to-End Implementation Plan

> Document basis: *Attainment file process-6-4-2026.docx*  
> Scope: Everything except CO-generator (untouched).  
> Architecture, infrastructure, and UI shell stay as-is; only computation logic and new feature modules are added.

---

## 1. Understanding the Current State

### 1.1 What already exists

| Area | File | Status |
|------|------|--------|
| Theory mark upload (CIE1/2/3, AAT, Quiz) | `backend/services/combinedCOAttainment.js` | Partial – uses wrong formula |
| SEE marks table + upload | `backend/routes/seeMarks.js`, `migrations/001…sql` | Table exists, upload works |
| CO attainment snapshot | `attainmentCalculator.js → calculateFinalCOAttainment` | Wrong weightages (70/20/10 instead of doc's 90×(60/40)/10) |
| PO attainment | `attainmentCalculator.js → calculatePOAttainment` | Wrong formula (weighted avg, not the normalized sum-of-mapped-COs approach from doc) |
| CO-PO mapping table | `co_po_mapping` (DB) | Raw strengths only — no derived mapping levels based on marks % |
| CES (Course Exit Survey) | Hardcoded `cesPercent = 0` | Not implemented |
| PSO attainment | Absent | Not implemented |
| Lab CO attainment | `combinedCOAttainment.js` partial | Not integrated into final calculation |
| Attainment level (1–3) conversion | Absent | Not implemented for CO or PO |

### 1.2 What the document mandates (key numbers)

| Parameter | Document value |
|-----------|---------------|
| Attainment threshold (marks to qualify) | **65%** of max marks per question |
| CIE weightage in final CO attainment | **60%** |
| SEE weightage in final CO attainment | **40%** |
| Direct attainment share | **90%** |
| CES (indirect) share | **10%** |
| Attainment level thresholds (target = 60%) | ≥80% → L3, 60–79% → L2, <60% → L1 |
| CO-PO mapping level from marks % | 0<x≤10 → 1, 10<x≤20 → 2, x>20 → 3 |
| PO attainment formula | Σ(CO_att × mapping_level) / Σ(mapping_levels for that PO) |
| CES scale conversion | Weighted avg (1–5) → normalize to (1–3) |
| PO attainment → level scale | Map percentage to 1–3 range |
| Final PO attainment | 70–80% direct + 20–30% indirect (surveys) |

---

## 2. Course Type Classification

The system must know the **type** of each course before calculating attainment:

| Course Type | Theory | Lab | Applies |
|-------------|--------|-----|---------|
| `STANDALONE_THEORY` | Yes | No | Pure theory course |
| `STANDALONE_LAB` | No | Yes | Pure lab course |
| `IPCC` | Yes | Yes | Integrated Practice Course with CIE+Lab |

This classification is used to decide which attainment sheets to use.  
**Action**: Add `course_type` field to the `courses` table.

---

## 3. The Five Calculation Steps (from Document)

### Step 1 – Theory CIA CO Attainment (per question, per CO)

For each question in CIA-1, CIA-2, CIA-3, AAT, Quiz:

```
A = Students who attempted the question (exclude AB, NA, blank)
B = Sum of marks of students who scored ≥ 65% of max marks for that question
CO_attainment_q = ((B / A) / max_marks_q) × 100
```

Then for each CO, the CIA CO attainment is the **average** of all question-level attainments for that CO across all CIAs.

### Step 2 – Lab CO Attainment

For each rubric column in the lab sheet (CIE + Lab Test), grouped by CO:
```
CO_lab_attainment = SUMIF(CO = x, attainment_values) / COUNTIFS(CO = x, values ≠ 0)
```
Lab attainment feeds directly into CIE for IPCC/Standalone Lab courses.

### Step 3 – SEE CO Attainment

Same per-question formula as CIA but applied to SEE question paper.  
SEE is already stored in `see_marks` table — the SEE CO attainment needs question-wise co-mapping for the end-exam paper.

### Step 4 – CES (Course Exit Survey) — Indirect Attainment

5-point Likert scale, one question per CO:

```
Weighted_avg = Σ(response_count_i × i) / total_responses     [i = 1..5]
CES_attainment_1to3 = (((weighted_avg - 1) / 4) × 2) + 1
```

### Step 5 – Final CO Attainment

```
CIE_CO = average(Theory_CIA_CO, Lab_CO)      # weighted average if both present
Direct_CO = 0.60 × CIE_CO + 0.40 × SEE_CO
Final_CO = 0.90 × Direct_CO + 0.10 × CES_CO
```

### Step 6 – CO-PO-PSO Mapping Level Derivation

For each (CO, PO) pair:
```
marks_pct = (CO marks distribution %) for that CO in the assessment
IF raw_mapping_strength >= 1:
    IF 0 < marks_pct ≤ 10  → mapping_level = 1
    IF 10 < marks_pct ≤ 20 → mapping_level = 2
    IF marks_pct > 20      → mapping_level = 3
ELSE:
    mapping_level = 0 (not mapped)
```

### Step 7 – PO/PSO Attainment

```
PO_x_attainment = Σ(CO_i_final_att × PO_x_mapping_level_for_CO_i) / Σ(PO_x_mapping_levels)
```

Convert to 1–3 scale using the same attainment level table as CO.

### Step 8 – Final Attainment Level Classification

| Target | Attainment % | Level |
|--------|-------------|-------|
| 60% | ≥ 80% | Level 3 |
| 60% | 60–79% | Level 2 |
| 60% | < 60% | Level 1 |

---

## 4. New Database Tables Required

### 4.1 `course_type_config`
```sql
course_id       UUID FK courses
course_type     VARCHAR(20) -- 'STANDALONE_THEORY' | 'STANDALONE_LAB' | 'IPCC'
attainment_threshold DECIMAL(5,2) DEFAULT 65.0
cie_weightage   DECIMAL(5,2) DEFAULT 60.0
see_weightage   DECIMAL(5,2) DEFAULT 40.0
direct_weightage DECIMAL(5,2) DEFAULT 90.0
ces_weightage   DECIMAL(5,2) DEFAULT 10.0
target_attainment DECIMAL(5,2) DEFAULT 60.0
```

### 4.2 `course_exit_survey_questions`
```sql
id              UUID PK
course_id       UUID FK courses
co_id           UUID FK course_outcomes
co_number       INT
question_text   TEXT
question_order  INT
created_at      TIMESTAMP
```

### 4.3 `course_exit_survey_responses`
```sql
id              UUID PK
course_id       UUID FK courses
student_id      UUID FK users
co_id           UUID FK course_outcomes
co_number       INT
rating          INT CHECK(rating BETWEEN 1 AND 5)
submitted_at    TIMESTAMP
UNIQUE(course_id, student_id, co_id)
```

### 4.4 `ces_attainment`
```sql
id              UUID PK
course_id       UUID FK courses
co_id           UUID FK course_outcomes
co_number       INT
response_count  INT
rating_5_count  INT
rating_4_count  INT
rating_3_count  INT
rating_2_count  INT
rating_1_count  INT
weighted_avg    DECIMAL(5,3)       -- 1–5 scale
ces_attainment  DECIMAL(5,3)       -- normalized to 1–3 scale
calculated_at   TIMESTAMP
UNIQUE(course_id, co_id)
```

### 4.5 `see_question_co_mapping`
```sql
id              UUID PK
course_id       UUID FK courses
question_label  VARCHAR(100)  -- e.g. 'Q1a', 'Q2b'
co_number       INT
max_marks       DECIMAL(7,2)
```

### 4.6 `see_question_scores`
```sql
id              UUID PK
student_id      UUID FK users
course_id       UUID FK courses
question_label  VARCHAR(100)
co_number       INT
marks_obtained  DECIMAL(7,2)
max_marks       DECIMAL(7,2)
UNIQUE(student_id, course_id, question_label)
```

### 4.7 `co_attainment_final`
```sql
id                  UUID PK
course_id           UUID FK courses
co_id               UUID FK course_outcomes
co_number           INT
theory_cia_attainment DECIMAL(7,4)
lab_cia_attainment  DECIMAL(7,4)
cie_attainment      DECIMAL(7,4)
see_attainment      DECIMAL(7,4)
ces_attainment      DECIMAL(7,4)
direct_attainment   DECIMAL(7,4)  -- 0.6*CIE + 0.4*SEE
final_attainment    DECIMAL(7,4)  -- 0.9*direct + 0.1*CES
attainment_level    INT           -- 1, 2, or 3
calculated_at       TIMESTAMP
UNIQUE(course_id, co_id)
```

### 4.8 `co_po_mapping_derived`  *(derived mapping levels)*
```sql
id                  UUID PK
course_id           UUID FK courses
co_id               UUID FK course_outcomes
po_id               UUID FK program_outcomes
raw_mapping_strength INT        -- from co_po_mapping
marks_pct           DECIMAL(7,4) -- % of marks for this CO
derived_level       INT          -- 0, 1, 2, or 3
```

### 4.9 `pso_outcomes`
```sql
id              UUID PK
pso_number      INT UNIQUE
description     TEXT
category        VARCHAR(100)
```

### 4.10 `co_pso_mapping`
```sql
id                  UUID PK
co_id               UUID FK course_outcomes
pso_id              UUID FK pso_outcomes
correlation_level   INT CHECK(1..3)
UNIQUE(co_id, pso_id)
```

### 4.11 `po_attainment_final`
```sql
id                  UUID PK
course_id           UUID FK courses
po_id               UUID FK program_outcomes
direct_attainment   DECIMAL(7,4)
indirect_attainment DECIMAL(7,4)  -- from surveys (placeholder initially)
final_attainment    DECIMAL(7,4)
attainment_level    INT            -- 1, 2, or 3
attainment_pct_1to3 DECIMAL(5,3)
calculated_at       TIMESTAMP
UNIQUE(course_id, po_id)
```

### 4.12 `pso_attainment`
```sql
id                  UUID PK
course_id           UUID FK courses
pso_id              UUID FK pso_outcomes
direct_attainment   DECIMAL(7,4)
final_attainment    DECIMAL(7,4)
attainment_level    INT
calculated_at       TIMESTAMP
UNIQUE(course_id, pso_id)
```

---

## 5. Backend Implementation Plan

### Phase A — Database Migration
**File**: `backend/migrations/002_attainment_v2.sql`

1. Add `course_type` column to `courses` (VARCHAR, default `STANDALONE_THEORY`)
2. Create all new tables listed in Section 4 (4.1–4.12)
3. Seed `pso_outcomes` (PSO1–PSO3 for AIML)
4. Add `marks_pct` column to `question_co_mappings`

---

### Phase B — Fix Theory CIA CO Attainment Formula
**File**: `backend/services/combinedCOAttainment.js`

**Current (wrong)**:
```js
attainmentPercent = (studentsAboveThreshold / totalAttempts) * 100
```

**Correct per document**:
```js
// Per question:
A = students_attempted (excluding AB/NA/blank)
B = sum_of_marks WHERE student_score >= 0.65 * question_max_marks
CO_attainment_q = ((B / A) / max_marks_q) * 100

// Per CO (average across all questions for that CO):
CO_cia_attainment = avg(CO_attainment_q1, CO_attainment_q2, ...)
```

This changes `calculateCombinedCOAttainment()` entirely. The vertical analysis table needs to be updated to store `B` (sum of marks ≥ 65%) not just student counts.

---

### Phase C — Lab CO Attainment Service
**File**: `backend/services/labCOAttainmentService.js` *(new)*

```
For each lab rubric column (CIE or Lab Test), grouped by CO:
  attainment_col = ((sum_marks_col ≥ 65%) / attempts_col / max_marks_col) * 100
CO_lab_attainment = avg(attainment for all columns mapped to that CO)
```

Store results in `co_attainment_final.lab_cia_attainment`.

---

### Phase D — SEE CO Attainment Service
**File**: `backend/services/seeCOAttainmentService.js` *(new)*

1. Add endpoint: `POST /api/see/course/:courseId/question-mapping` — teacher maps SEE questions to COs, stores in `see_question_co_mapping`
2. Add endpoint: `POST /api/see/course/:courseId/question-scores` — upload question-wise SEE marks (CSV), stores in `see_question_scores`
3. Calculation:
```
For each SEE question mapped to CO_x:
  A = students attempted
  B = sum marks WHERE score >= 0.65 * q_max
  SEE_CO_attainment_q = ((B / A) / q_max) * 100
SEE_CO_x = avg of all questions for CO_x
```

---

### Phase E — Course Exit Survey (CES) Backend
**File**: `backend/services/cesService.js` *(new)*  
**Routes**: `backend/routes/ces.js` *(new)*

**Endpoints**:
- `POST /api/ces/course/:courseId/questions` — teacher creates survey questions (one per CO)
- `POST /api/ces/course/:courseId/respond` — student submits 1–5 rating per CO question
- `GET /api/ces/course/:courseId/attainment` — compute and return CES attainment per CO

**CES Attainment formula**:
```js
weighted_avg = (count5*5 + count4*4 + count3*3 + count2*2 + count1*1) / total_responses
ces_1to3 = ((weighted_avg - 1) / 4) * 2 + 1
```

Store in `ces_attainment`.

---

### Phase F — Final CO Attainment Calculator (Rewrite)
**File**: `backend/services/finalCOAttainmentService.js` *(new, replaces relevant part of attainmentCalculator.js)*

```js
// For each CO:
cie_co = course_type === 'IPCC'
  ? avg(theory_cia_co, lab_cia_co)
  : (course_type === 'STANDALONE_LAB' ? lab_cia_co : theory_cia_co)

direct_co = (0.60 * cie_co) + (0.40 * see_co)
final_co  = (0.90 * direct_co) + (0.10 * ces_co)

// Attainment level (target = 60%):
if (final_co >= 80) level = 3
else if (final_co >= 60) level = 2
else level = 1
```

Write to `co_attainment_final`.

---

### Phase G — CO-PO-PSO Mapping Level Derivation
**File**: `backend/services/mappingDerivedService.js` *(new)*

```js
// marks_pct for CO_x = (total max marks for CO_x across all assessments / total course max marks) * 100
// For each (CO, PO) pair:
if (raw_mapping >= 1) {
  if (marks_pct > 0 && marks_pct <= 10)  derived_level = 1
  if (marks_pct > 10 && marks_pct <= 20) derived_level = 2
  if (marks_pct > 20)                    derived_level = 3
} else derived_level = 0
```

Write to `co_po_mapping_derived` and equivalent for PSO.

---

### Phase H — Final PO Attainment Calculator (Rewrite)
**File**: `backend/services/poAttainmentService.js` *(new, replaces relevant part of attainmentCalculator.js)*

```js
// Using DERIVED mapping levels (not raw strengths):
PO_x = Σ(CO_i_final_att × derived_level_CO_i_PO_x) / Σ(derived_level_CO_i_PO_x)

// Convert to level:
if (PO_x >= 80) po_level = 3
else if (PO_x >= 60) po_level = 2
else po_level = 1

// PO attainment on 1–3 scale:
po_1to3 = ((PO_x / 100) * 2) + 1   -- approximate
```

Write to `po_attainment_final`.

---

### Phase I — PSO Attainment Calculator
**File**: `backend/services/psoAttainmentService.js` *(new)*

Same formula as PO using `co_pso_mapping` and derived PSO mapping levels.  
Write to `pso_attainment`.

---

### Phase J — Updated Attainment Routes
**File**: `backend/routes/attainment.js` (update)

New/updated endpoints:

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/attainment/course/:id/recalculate` | Full pipeline: CIA → Lab → SEE → CES → CO → PO → PSO |
| `GET` | `/api/attainment/course/:id/co-final` | CO final attainment with breakdown |
| `GET` | `/api/attainment/course/:id/po-final` | PO final attainment |
| `GET` | `/api/attainment/course/:id/pso` | PSO attainment |
| `GET` | `/api/attainment/course/:id/co-po-pso-matrix` | Full attainment table (like doc's final table) |
| `POST` | `/api/ces/course/:id/questions` | Create CES questions |
| `POST` | `/api/ces/course/:id/respond` | Student submits survey |
| `GET` | `/api/ces/course/:id/attainment` | CES attainment per CO |
| `POST` | `/api/see/course/:id/question-mapping` | Map SEE questions to COs |
| `GET` | `/api/attainment/course/:id/attainment-level` | CO/PO attainment levels (1/2/3) |

---

## 6. Frontend Implementation Plan

### 6.1 Course Exit Survey — Student View
**File**: `edu-frontend/src/pages/student/CourseExitSurvey.jsx` *(new)*

- Shows Likert scale (1–5 stars or radio) per CO question
- One-time submission guard (submit once per course)
- Available only after teacher activates survey for the course

### 6.2 CES Management — Teacher View
**File**: `edu-frontend/src/pages/teacher/CourseExitSurveyAdmin.jsx` *(new)*

- Create/edit CES questions (prefilled with CO statements)
- Toggle survey open/closed
- View response counts and attainment preview

### 6.3 SEE CO Mapping — Teacher View
**File**: `edu-frontend/src/pages/teacher/SEEQuestionMapping.jsx` *(new)*

- Map SEE question labels (Q1a, Q1b, Q2a…) to COs and enter max marks
- Upload question-wise SEE CSV

### 6.4 CO Attainment Dashboard (Update existing)
**File**: `edu-frontend/src/pages/teacher/COAttainment.jsx` (update)

Add columns to existing table:
- Theory CIA Attainment
- Lab CIA Attainment
- CIE Attainment (combined)
- SEE Attainment
- CES Attainment
- Direct Attainment (60% CIE + 40% SEE)
- **Final Attainment** (90% direct + 10% CES)
- **Attainment Level** (1 / 2 / 3)
- Status (Achieved / Not Achieved vs target)

### 6.5 PO Attainment View (Update existing)
**File**: `edu-frontend/src/pages/teacher/POAttainment.jsx` (update)

- Show derived mapping levels (1/2/3) not raw strengths
- Show PO attainment % and level (1–3)
- Show which COs contribute and their weights

### 6.6 PSO Attainment View (New)
**File**: `edu-frontend/src/pages/teacher/PSOAttainment.jsx` *(new)*

- PSO1, PSO2, PSO3 attainment table
- CO → PSO contribution breakdown
- Level (1/2/3) and status vs target

### 6.7 CO-PO-PSO Summary Matrix (New)
**File**: `edu-frontend/src/pages/teacher/AttainmentMatrix.jsx` *(new)*

Final table matching the document's output:
```
          PO1  PO2  PO3  ... PO11  PSO1  PSO2  PSO3
CO1        2    1    3   ...   -     2     -     1
CO2        -    2    1   ...   3     -     1     2
...
CO Att.   68.8 61.8 57.2 ...
PO Att.%  67.3 62.3 68.3 ...
PO Level   2    2    2   ...
```

### 6.8 Course Config Panel (Update existing)
**File**: `edu-frontend/src/pages/teacher/CourseSettings.jsx` (update)

Add fields:
- Course Type: `STANDALONE_THEORY` / `STANDALONE_LAB` / `IPCC`
- Attainment threshold (default 65%)
- Target attainment (default 60%)
- CIE/SEE/CES weightages (defaults: 60/40 for direct; 90/10 for direct/indirect)

---

## 7. Full Computation Pipeline (Orchestration)

```
recalculate(courseId)
│
├── 1. combinedCOAttainment.calculateCombinedCOAttainment(courseId)
│       → Theory CIA CO attainment per CO (corrected formula)
│
├── 2. labCOAttainmentService.calculate(courseId)          [if IPCC or STANDALONE_LAB]
│       → Lab CO attainment per CO
│
├── 3. seeCOAttainmentService.calculate(courseId)
│       → SEE CO attainment per CO (question-wise)
│
├── 4. cesService.calculateCESAttainment(courseId)
│       → CES CO attainment per CO (1–3 scale)
│
├── 5. finalCOAttainmentService.calculate(courseId)
│       → CIE = avg(Theory, Lab) [if IPCC]
│       → Direct = 0.6*CIE + 0.4*SEE
│       → Final = 0.9*Direct + 0.1*CES
│       → Level = 1/2/3
│       → Write to co_attainment_final
│
├── 6. mappingDerivedService.deriveMapping(courseId)
│       → marks_pct per CO
│       → derived_level for each (CO, PO) and (CO, PSO)
│       → Write to co_po_mapping_derived
│
├── 7. poAttainmentService.calculate(courseId)
│       → PO attainment % using derived levels
│       → PO level 1/2/3
│       → Write to po_attainment_final
│
└── 8. psoAttainmentService.calculate(courseId)
        → PSO attainment % using derived levels
        → PSO level 1/2/3
        → Write to pso_attainment
```

---

## 8. Implementation Order (Sequence)

| Step | Task | Depends On |
|------|------|-----------|
| 1 | DB Migration: `002_attainment_v2.sql` | Nothing |
| 2 | Fix Theory CIA formula in `combinedCOAttainment.js` | Step 1 |
| 3 | New: `labCOAttainmentService.js` | Step 1 |
| 4 | New: `seeCOAttainmentService.js` + SEE question mapping API | Step 1 |
| 5 | New: CES backend (`cesService.js`, `routes/ces.js`) | Step 1 |
| 6 | New: `finalCOAttainmentService.js` | Steps 2–5 |
| 7 | New: `mappingDerivedService.js` | Step 1 |
| 8 | New: `poAttainmentService.js` | Steps 6, 7 |
| 9 | New: `psoAttainmentService.js` | Steps 6, 7 |
| 10 | Update orchestration in `attainment.js` route | Steps 6–9 |
| 11 | Frontend: `CourseExitSurvey.jsx` (student) | Step 5 |
| 12 | Frontend: `CourseExitSurveyAdmin.jsx` (teacher) | Step 5 |
| 13 | Frontend: `SEEQuestionMapping.jsx` (teacher) | Step 4 |
| 14 | Frontend: Update `COAttainment.jsx` | Step 10 |
| 15 | Frontend: Update `POAttainment.jsx` | Step 8 |
| 16 | Frontend: New `PSOAttainment.jsx` | Step 9 |
| 17 | Frontend: New `AttainmentMatrix.jsx` | Steps 14–16 |
| 18 | Frontend: Update Course Settings with type + weightages | Step 1 |

---

## 9. Key Business Rules to Enforce

1. **Students with AB (Absent) or NA (Not Applicable) are excluded from the denominator** for CO attainment calculation — they do not count as "not achieved".
2. **65% is the standard threshold** for qualification; it is configurable per course.
3. **CES is only considered if at least 1 response exists** for a CO; if no responses, CES component is excluded from the final formula (treat it as if `ces_weightage = 0`).
4. **SEE CO attainment requires question-wise mapping**; if no mapping exists, SEE attainment falls back to the overall SEE % for that CO (proportional to marks).
5. **Lab attainment only applies** for IPCC and STANDALONE_LAB courses.
6. **Attainment level thresholds** (1/2/3) depend on the configured target (default 60%) — the target itself is not used in the formula but is used for comparison and status.
7. **CO-PO mapping level is derived from marks %**, not just entered by the teacher — the teacher enters raw strength (1–3), but the system derives the final mapping level using marks distribution.
8. **POs are indexed 1–11** from August 2025 (Even Sem 2024–25 onwards); the DB seeds PO1–PO12. The display layer should respect the course's academic year to show 11 or 12 POs.

---

## 10. What NOT to Change

- `CO-generator` folder — completely untouched.
- `docker-compose.yml` container topology — no new services.
- `recommendation-service` — untouched.
- `res_system_streamlit` — untouched.
- `upload-service` — untouched.
- Auth, routing shell, layouts, login/register flows — untouched.
- Existing marksheet CSV upload and `question_vertical_analysis` pipeline — only fix the formula inside it.

---

## 11. Glossary

| Term | Meaning |
|------|---------|
| CIA | Continuous Internal Assessment (CIE1, CIE2, CIE3) |
| CIE | Continuous Internal Evaluation (includes CIA + AAT + Quiz) |
| SEE | Semester End Examination |
| CES | Course Exit Survey (indirect assessment by students) |
| AAT | Assignment / Activity Test |
| CO | Course Outcome |
| PO | Program Outcome (PO1–PO11/12) |
| PSO | Program Specific Outcome (PSO1–PSO3 for AIML) |
| OBE | Outcome-Based Education |
| NBA | National Board of Accreditation |
| ATR | Action Taken Report |
| IPCC | Integrated Practice Course (has both theory + lab components) |
| Attainment Level | 1 (Low), 2 (Medium), 3 (High) on NBA's 3-point scale |
