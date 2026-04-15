-- ==================================================================================
-- Academia360 — Complete Unified Schema
-- Single idempotent migration.  Run once on a fresh database or re-run safely.
-- ==================================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ──────────────────────────────────────────────────────────────────────────────
-- UTILITY FUNCTION
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ──────────────────────────────────────────────────────────────────────────────
-- USERS
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role        VARCHAR(20)  NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    name        VARCHAR(255) NOT NULL,
    usn         VARCHAR(50)  UNIQUE,
    department  VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_usn   ON users(usn);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- COURSES
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS courses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code        VARCHAR(50)  UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    semester    INT  CHECK (semester BETWEEN 1 AND 8),
    year        INT  CHECK (year >= 2020),
    credits     INT  DEFAULT 3 CHECK (credits BETWEEN 1 AND 6),
    department  VARCHAR(100),
    teacher_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Course type for attainment (NBA/OBE)
    course_type VARCHAR(20) DEFAULT 'STANDALONE_THEORY'
                  CHECK (course_type IN ('STANDALONE_THEORY', 'STANDALONE_LAB', 'IPCC')),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courses_teacher      ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_semester_year ON courses(semester, year);

DROP TRIGGER IF EXISTS update_courses_updated_at ON courses;
CREATE TRIGGER update_courses_updated_at
BEFORE UPDATE ON courses
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- PROGRAM OUTCOMES  (PO1–PO12, NBA standard)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS program_outcomes (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number   INT  UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category    VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO program_outcomes (po_number, description, category) VALUES
(1,  'Engineering knowledge',                   'technical'),
(2,  'Problem analysis',                         'technical'),
(3,  'Design/development of solutions',          'technical'),
(4,  'Conduct investigations',                   'technical'),
(5,  'Modern tool usage',                        'technical'),
(6,  'Engineer and society',                     'professional'),
(7,  'Environment and sustainability',           'professional'),
(8,  'Ethics',                                   'professional'),
(9,  'Individual and team work',                 'communication'),
(10, 'Communication',                            'communication'),
(11, 'Project management and finance',           'professional'),
(12, 'Life-long learning',                       'professional')
ON CONFLICT (po_number) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- PROGRAM SPECIFIC OUTCOMES  (PSO1–PSO3, AIML specialization)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pso_outcomes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pso_number  INT  UNIQUE NOT NULL,
    description TEXT NOT NULL,
    category    VARCHAR(100) DEFAULT 'specialization',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO pso_outcomes (pso_number, description, category) VALUES
(1, 'Apply knowledge of Artificial Intelligence and Machine Learning techniques to solve real-world problems', 'specialization'),
(2, 'Design and implement intelligent systems using ML algorithms, data analysis, and AI frameworks',          'specialization'),
(3, 'Demonstrate proficiency in programming, tools, and technologies specific to AI/ML domain',               'specialization')
ON CONFLICT (pso_number) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- COURSE OUTCOMES
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_outcomes (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id      UUID REFERENCES courses(id) ON DELETE CASCADE,
    co_number      INT  NOT NULL,
    description    TEXT NOT NULL,
    bloom_level    VARCHAR(50),
    module_number  INT,
    is_ai_generated BOOLEAN DEFAULT FALSE,
    approved       BOOLEAN DEFAULT FALSE,
    approved_by    UUID REFERENCES users(id),
    approved_at    TIMESTAMP,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_number)
);

CREATE INDEX IF NOT EXISTS idx_course_outcomes_course ON course_outcomes(course_id);

DROP TRIGGER IF EXISTS update_course_outcomes_updated_at ON course_outcomes;
CREATE TRIGGER update_course_outcomes_updated_at
BEFORE UPDATE ON course_outcomes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- CO–PO MAPPING  (raw teacher-entered correlation 1/2/3)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS co_po_mapping (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    co_id             UUID REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    po_id             UUID REFERENCES program_outcomes(id) ON DELETE CASCADE,
    correlation_level INT  CHECK (correlation_level BETWEEN 1 AND 3),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(co_id, po_id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- CO–PSO MAPPING  (raw teacher-entered correlation 1/2/3)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS co_pso_mapping (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    co_id             UUID NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
    pso_id            UUID NOT NULL REFERENCES pso_outcomes(id)    ON DELETE CASCADE,
    correlation_level INT  NOT NULL CHECK (correlation_level BETWEEN 1 AND 3),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(co_id, pso_id)
);

CREATE INDEX IF NOT EXISTS idx_co_pso_mapping_co  ON co_pso_mapping(co_id);
CREATE INDEX IF NOT EXISTS idx_co_pso_mapping_pso ON co_pso_mapping(pso_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- STUDENT ENROLLMENT
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS students_courses (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES users(id)   ON DELETE CASCADE,
    course_id  UUID REFERENCES courses(id) ON DELETE CASCADE,
    status     VARCHAR(20) DEFAULT 'active',
    UNIQUE(student_id, course_id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- ASSESSMENTS
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessments (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id        UUID REFERENCES courses(id) ON DELETE CASCADE,
    type             VARCHAR(50) NOT NULL,
    name             VARCHAR(255) NOT NULL,
    description      TEXT,
    assessment_date  DATE DEFAULT CURRENT_DATE,
    max_marks        NUMERIC(7,2) NOT NULL,
    weightage        NUMERIC(7,2) DEFAULT 1.0,
    is_cie_component BOOLEAN DEFAULT TRUE,
    is_see_component BOOLEAN DEFAULT FALSE,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, name)
);

CREATE INDEX IF NOT EXISTS idx_assessments_course ON assessments(course_id);
CREATE INDEX IF NOT EXISTS idx_assessments_type   ON assessments(type);

DROP TRIGGER IF EXISTS update_assessments_updated_at ON assessments;
CREATE TRIGGER update_assessments_updated_at
BEFORE UPDATE ON assessments
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- RAW MARKS COLUMNS
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS raw_marks_columns (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
    column_name   VARCHAR(100) NOT NULL,
    co_number     INT,
    max_marks     NUMERIC(7,2) NOT NULL DEFAULT 0,
    column_order  INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(assessment_id, column_name)
);

CREATE INDEX IF NOT EXISTS idx_raw_marks_columns_assessment ON raw_marks_columns(assessment_id);
CREATE INDEX IF NOT EXISTS idx_raw_marks_columns_co         ON raw_marks_columns(co_number);

-- ──────────────────────────────────────────────────────────────────────────────
-- STUDENT SCORES  (legacy per-assessment row)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_scores (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id     UUID REFERENCES users(id)       ON DELETE CASCADE,
    assessment_id  UUID REFERENCES assessments(id) ON DELETE CASCADE,
    column_name    VARCHAR(100),
    marks_obtained NUMERIC(7,2),
    co_number      INT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, assessment_id, column_name)
);

DROP TRIGGER IF EXISTS update_student_scores_updated_at ON student_scores;
CREATE TRIGGER update_student_scores_updated_at
BEFORE UPDATE ON student_scores
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- MARKSHEETS  (uploaded CSV/Excel files, each creates a dynamic table)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marksheets (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    assessment_name    VARCHAR(255) NOT NULL,
    file_name          VARCHAR(255) NOT NULL,
    table_name         VARCHAR(255),
    columns            JSONB DEFAULT '[]',
    row_count          INT  DEFAULT 0,
    file_hash          VARCHAR(64) UNIQUE,
    processed_at       TIMESTAMP,
    processing_status  VARCHAR(50) DEFAULT 'pending'
                         CHECK (processing_status IN ('pending','processing','completed','failed')),
    error_details      TEXT,
    warnings           JSONB DEFAULT '[]',
    uploaded_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE marksheets ADD COLUMN IF NOT EXISTS marksheet_category VARCHAR(20) DEFAULT 'THEORY';

CREATE INDEX IF NOT EXISTS idx_marksheets_course    ON marksheets(course_id);
CREATE INDEX IF NOT EXISTS idx_marksheets_file_hash ON marksheets(file_hash);
CREATE INDEX IF NOT EXISTS idx_marksheets_status    ON marksheets(processing_status);

DROP TRIGGER IF EXISTS update_marksheets_updated_at ON marksheets;
CREATE TRIGGER update_marksheets_updated_at
BEFORE UPDATE ON marksheets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- QUESTION → CO MAPPINGS  (two tables: old + new)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_co_mapping (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        UUID NOT NULL REFERENCES courses(id)     ON DELETE CASCADE,
    marksheet_id     UUID NOT NULL REFERENCES marksheets(id)  ON DELETE CASCADE,
    question_column  VARCHAR(100) NOT NULL,
    co_number        INT  NOT NULL,
    max_marks        NUMERIC(10,2) NOT NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(marksheet_id, question_column)
);

CREATE INDEX IF NOT EXISTS idx_question_co_mapping_course    ON question_co_mapping(course_id);
CREATE INDEX IF NOT EXISTS idx_question_co_mapping_marksheet ON question_co_mapping(marksheet_id);

CREATE TABLE IF NOT EXISTS question_co_mappings (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        UUID REFERENCES courses(id)    ON DELETE CASCADE,
    marksheet_id     UUID REFERENCES marksheets(id) ON DELETE CASCADE,
    question_column  VARCHAR(255),
    co_number        INT  CHECK (co_number BETWEEN 1 AND 10),
    co_id            UUID REFERENCES course_outcomes(id),
    max_marks        NUMERIC(10,2) DEFAULT 10.0,
    uploaded_by      UUID REFERENCES users(id),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(marksheet_id, question_column)
);

CREATE INDEX IF NOT EXISTS idx_co_mappings_course     ON question_co_mappings(course_id);
CREATE INDEX IF NOT EXISTS idx_co_mappings_marksheet  ON question_co_mappings(marksheet_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- ANALYSIS TABLES  (populated by the mark-upload pipeline)
-- ──────────────────────────────────────────────────────────────────────────────

-- Per-question stats across all students (vertical analysis)
CREATE TABLE IF NOT EXISTS question_vertical_analysis (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id                 UUID NOT NULL REFERENCES courses(id)    ON DELETE CASCADE,
    marksheet_id              UUID NOT NULL REFERENCES marksheets(id) ON DELETE CASCADE,
    question_column           VARCHAR(100) NOT NULL,
    co_number                 INT,
    max_marks                 NUMERIC(10,2) NOT NULL,
    attempts_count            INT NOT NULL,
    vertical_sum              NUMERIC(10,2) NOT NULL,
    vertical_avg              NUMERIC(10,2),
    threshold_60pct           NUMERIC(10,2) NOT NULL,
    students_above_threshold  INT NOT NULL,
    co_attainment_percent     NUMERIC(5,2),
    sum_marks_above_threshold NUMERIC(12,2) DEFAULT 0,
    threshold_pct             NUMERIC(5,2)  DEFAULT 65.0,
    calculated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(marksheet_id, question_column)
);

CREATE INDEX IF NOT EXISTS idx_question_vertical_co        ON question_vertical_analysis(co_number);
CREATE INDEX IF NOT EXISTS idx_question_vertical_course    ON question_vertical_analysis(course_id);
CREATE INDEX IF NOT EXISTS idx_question_vertical_marksheet ON question_vertical_analysis(marksheet_id);

-- Per-student totals per marksheet (horizontal analysis)
CREATE TABLE IF NOT EXISTS student_horizontal_analysis (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID NOT NULL REFERENCES courses(id)    ON DELETE CASCADE,
    marksheet_id        UUID NOT NULL REFERENCES marksheets(id) ON DELETE CASCADE,
    student_id          UUID NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
    usn                 VARCHAR(50),
    student_name        VARCHAR(255),
    total_marks_raw     NUMERIC(10,2) NOT NULL,
    max_marks_possible  NUMERIC(10,2) NOT NULL,
    percentage          NUMERIC(5,2),
    scaled_marks        NUMERIC(10,2),
    calculated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(marksheet_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_horizontal_course    ON student_horizontal_analysis(course_id);
CREATE INDEX IF NOT EXISTS idx_student_horizontal_marksheet ON student_horizontal_analysis(marksheet_id);
CREATE INDEX IF NOT EXISTS idx_student_horizontal_student   ON student_horizontal_analysis(student_id);

-- CO-level aggregate per marksheet
CREATE TABLE IF NOT EXISTS co_level_analysis (
    id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id                    UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    marksheet_id                 UUID NOT NULL REFERENCES marksheets(id)       ON DELETE CASCADE,
    co_id                        UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    co_number                    INT  NOT NULL,
    co_max_marks                 NUMERIC(10,2) NOT NULL,
    co_vertical_sum              NUMERIC(10,2) NOT NULL,
    co_attempts                  INT  NOT NULL,
    co_threshold_60pct           NUMERIC(10,2) NOT NULL,
    co_students_above_threshold  INT  NOT NULL,
    co_attainment_percent        NUMERIC(5,2),
    calculated_at                TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(marksheet_id, co_id)
);

CREATE INDEX IF NOT EXISTS idx_co_level_co        ON co_level_analysis(co_id);
CREATE INDEX IF NOT EXISTS idx_co_level_course    ON co_level_analysis(course_id);
CREATE INDEX IF NOT EXISTS idx_co_level_marksheet ON co_level_analysis(marksheet_id);

-- File-level summary (one row per marksheet)
CREATE TABLE IF NOT EXISTS file_level_summary (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID NOT NULL REFERENCES courses(id)    ON DELETE CASCADE,
    marksheet_id        UUID NOT NULL REFERENCES marksheets(id) ON DELETE CASCADE,
    assessment_name     VARCHAR(255) NOT NULL,
    assessment_type     VARCHAR(50),
    total_students      INT  NOT NULL,
    max_marks_possible  NUMERIC(10,2) NOT NULL,
    avg_marks           NUMERIC(10,2),
    avg_percentage      NUMERIC(5,2),
    original_max        NUMERIC(10,2),
    scaled_max          NUMERIC(10,2),
    scaling_factor      NUMERIC(5,4),
    calculated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(marksheet_id)
);

CREATE INDEX IF NOT EXISTS idx_file_summary_course ON file_level_summary(course_id);
CREATE INDEX IF NOT EXISTS idx_file_summary_type   ON file_level_summary(assessment_type);

-- CO mapping file tracking
CREATE TABLE IF NOT EXISTS co_mapping_files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID NOT NULL REFERENCES courses(id)    ON DELETE CASCADE,
    marksheet_id    UUID NOT NULL REFERENCES marksheets(id) ON DELETE CASCADE,
    file_name       VARCHAR(500) NOT NULL,
    file_hash       VARCHAR(64)  NOT NULL,
    mappings_count  INT DEFAULT 0,
    uploaded_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(marksheet_id)
);

-- ──────────────────────────────────────────────────────────────────────────────
-- LEGACY CO ATTAINMENT TABLES  (pre-v2 pipeline, kept for compatibility)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS co_attainment (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id                UUID REFERENCES courses(id),
    co_id                    UUID REFERENCES course_outcomes(id),
    assessment_id            UUID REFERENCES assessments(id),
    attainment_percentage    NUMERIC(5,2) NOT NULL
                               CHECK (attainment_percentage BETWEEN 0 AND 100),
    total_students           INT NOT NULL CHECK (total_students >= 0),
    students_above_threshold INT NOT NULL CHECK (students_above_threshold >= 0),
    threshold_percentage     NUMERIC(5,2) DEFAULT 60.0
                               CHECK (threshold_percentage BETWEEN 0 AND 100),
    obtained_marks           NUMERIC(12,2) DEFAULT 0,
    max_marks                NUMERIC(12,2) DEFAULT 0,
    calculated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_id, assessment_id)
);

CREATE INDEX IF NOT EXISTS idx_co_attainment_course ON co_attainment(course_id);
CREATE INDEX IF NOT EXISTS idx_co_attainment_co     ON co_attainment(co_id);

CREATE TABLE IF NOT EXISTS co_calculation_snapshot (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id           UUID NOT NULL REFERENCES courses(id)           ON DELETE CASCADE,
    co_id               UUID NOT NULL REFERENCES course_outcomes(id)   ON DELETE CASCADE,
    co_number           INT  NOT NULL,
    cie_percent         NUMERIC(5,2) DEFAULT 0,
    see_percent         NUMERIC(5,2) DEFAULT 0,
    ces_percent         NUMERIC(5,2) DEFAULT 0,
    final_percent       NUMERIC(5,2) NOT NULL CHECK (final_percent BETWEEN 0 AND 100),
    calculation_method  VARCHAR(50)  DEFAULT 'weighted_average',
    calculated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_co_snapshot_course     ON co_calculation_snapshot(course_id);
CREATE INDEX IF NOT EXISTS idx_co_snapshot_co         ON co_calculation_snapshot(co_id);
CREATE INDEX IF NOT EXISTS idx_co_snapshot_calculated ON co_calculation_snapshot(calculated_at DESC);

CREATE TABLE IF NOT EXISTS combined_co_attainment_calculated (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id                UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    co_id                    UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    co_number                INT  NOT NULL,
    total_max_marks          NUMERIC(10,2) NOT NULL,
    total_attempts           INT  NOT NULL,
    students_above_threshold INT  NOT NULL,
    attainment_percent       NUMERIC(5,2)  NOT NULL,
    threshold                NUMERIC(10,2) NOT NULL,
    calculated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_id)
);

CREATE TABLE IF NOT EXISTS po_attainment (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id            UUID REFERENCES courses(id),
    po_id                UUID REFERENCES program_outcomes(id),
    attainment_level     NUMERIC(5,2) NOT NULL CHECK (attainment_level BETWEEN 0 AND 3),
    po_percentage        NUMERIC(5,2)  CHECK (po_percentage BETWEEN 0 AND 100),
    calculation_method   VARCHAR(50)   DEFAULT 'combined',
    calculation_details  JSONB         DEFAULT '{}',
    calculated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, po_id)
);

CREATE INDEX IF NOT EXISTS idx_po_attainment_course ON po_attainment(course_id);
CREATE INDEX IF NOT EXISTS idx_po_attainment_po     ON po_attainment(po_id);

CREATE TABLE IF NOT EXISTS student_co_scores (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id     UUID NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    course_id      UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    assessment_id  UUID NOT NULL REFERENCES assessments(id)      ON DELETE CASCADE,
    co_id          UUID REFERENCES course_outcomes(id)           ON DELETE CASCADE,
    co_number      INT  NOT NULL,
    obtained_marks NUMERIC(9,2) NOT NULL CHECK (obtained_marks >= 0),
    max_marks      NUMERIC(9,2) NOT NULL CHECK (max_marks > 0),
    percentage     NUMERIC(5,2) NOT NULL CHECK (percentage BETWEEN 0 AND 100),
    calculated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, assessment_id, co_id)
);

CREATE INDEX IF NOT EXISTS idx_student_co_student    ON student_co_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_student_co_course     ON student_co_scores(course_id);
CREATE INDEX IF NOT EXISTS idx_student_co_assessment ON student_co_scores(assessment_id);
CREATE INDEX IF NOT EXISTS idx_student_co_co         ON student_co_scores(co_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- COURSE CONFIG  (legacy weightage config)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_config (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id            UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    assessment_weights   JSONB NOT NULL DEFAULT '{}',
    cie_weight           NUMERIC(4,2) DEFAULT 0.70,
    see_weight           NUMERIC(4,2) DEFAULT 0.20,
    ces_weight           NUMERIC(4,2) DEFAULT 0.10,
    attainment_threshold NUMERIC(5,2) DEFAULT 60.0
                           CHECK (attainment_threshold BETWEEN 0 AND 100),
    grade_boundaries     JSONB NOT NULL DEFAULT '{"S":90,"A":80,"B":70,"C":60,"D":50,"E":40,"F":0}',
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id),
    CHECK (cie_weight BETWEEN 0 AND 1),
    CHECK (see_weight BETWEEN 0 AND 1),
    CHECK (ces_weight BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS idx_course_config_course ON course_config(course_id);

DROP TRIGGER IF EXISTS update_course_config_updated_at ON course_config;
CREATE TRIGGER update_course_config_updated_at
BEFORE UPDATE ON course_config
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- STUDENT OVERALL SCORES
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_overall_scores (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id      UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    total_obtained NUMERIC(9,2) NOT NULL CHECK (total_obtained >= 0),
    total_max      NUMERIC(9,2) NOT NULL CHECK (total_max > 0),
    percentage     NUMERIC(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
    grade          VARCHAR(4),
    cie_obtained   NUMERIC(9,2) DEFAULT 0,
    cie_max        NUMERIC(9,2) DEFAULT 0,
    cie_percentage NUMERIC(5,2) DEFAULT 0,
    see_obtained   NUMERIC(9,2) DEFAULT 0,
    see_max        NUMERIC(9,2) DEFAULT 0,
    see_percentage NUMERIC(5,2) DEFAULT 0,
    calculated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_student_overall_student ON student_overall_scores(student_id);
CREATE INDEX IF NOT EXISTS idx_student_overall_course  ON student_overall_scores(course_id);
CREATE INDEX IF NOT EXISTS idx_student_overall_grade   ON student_overall_scores(grade);

-- ──────────────────────────────────────────────────────────────────────────────
-- FINAL CIE COMPOSITION
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS final_cie_composition (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id            UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id           UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    usn                  VARCHAR(50),
    student_name         VARCHAR(255),
    scaled_cie1          NUMERIC(10,2),
    scaled_cie2          NUMERIC(10,2),
    scaled_cie3          NUMERIC(10,2),
    avg_cie_scaled       NUMERIC(10,2),
    aat_marks            NUMERIC(10,2),
    quiz_marks           NUMERIC(10,2),
    final_cie_total      NUMERIC(10,2),
    final_cie_percentage NUMERIC(5,2),
    final_cie_max        NUMERIC(10,2) DEFAULT 50.00,
    calculated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_final_cie_course   ON final_cie_composition(course_id);
CREATE INDEX IF NOT EXISTS idx_final_cie_student  ON final_cie_composition(student_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- SEE MARKS
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS see_marks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id           UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    see_marks_obtained  NUMERIC(5,2) NOT NULL CHECK (see_marks_obtained BETWEEN 0 AND 100),
    see_max_marks       NUMERIC(5,2) DEFAULT 100.00 CHECK (see_max_marks > 0),
    uploaded_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    upload_date         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    remarks             TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    see_grade           VARCHAR(5) DEFAULT NULL,
    UNIQUE(student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_see_marks_student        ON see_marks(student_id);
CREATE INDEX IF NOT EXISTS idx_see_marks_course         ON see_marks(course_id);
CREATE INDEX IF NOT EXISTS idx_see_marks_student_course ON see_marks(student_id, course_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- STUDENT FINAL GRADES
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_final_grades (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id         UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id          UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    cie_total          NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (cie_total >= 0),
    cie_max            NUMERIC(7,2) DEFAULT 50.00,
    see_total          NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (see_total BETWEEN 0 AND 50),
    see_max            NUMERIC(7,2) DEFAULT 50.00,
    final_total        NUMERIC(7,2) NOT NULL CHECK (final_total BETWEEN 0 AND 100),
    final_max          NUMERIC(7,2) DEFAULT 100.00,
    final_percentage   NUMERIC(5,2) NOT NULL CHECK (final_percentage BETWEEN 0 AND 100),
    letter_grade       VARCHAR(4)   NOT NULL,
    grade_points       NUMERIC(3,1) NOT NULL CHECK (grade_points BETWEEN 0 AND 10),
    credits            INT NOT NULL CHECK (credits BETWEEN 1 AND 6),
    is_passed          BOOLEAN DEFAULT FALSE,
    calculated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    calculation_method VARCHAR(50) DEFAULT 'cie_see_combined',
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_final_grades_student        ON student_final_grades(student_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_course         ON student_final_grades(course_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_grade          ON student_final_grades(letter_grade);
CREATE INDEX IF NOT EXISTS idx_final_grades_student_course ON student_final_grades(student_id, course_id);
CREATE INDEX IF NOT EXISTS idx_final_grades_is_passed      ON student_final_grades(is_passed);

-- ──────────────────────────────────────────────────────────────────────────────
-- SEMESTER RESULTS + CGPA
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS semester_results (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    semester                 INT  NOT NULL CHECK (semester BETWEEN 1 AND 8),
    academic_year            INT  NOT NULL CHECK (academic_year >= 2020),
    total_credits_registered INT  NOT NULL DEFAULT 0,
    total_credits_earned     INT  NOT NULL DEFAULT 0,
    total_grade_points       NUMERIC(10,2) NOT NULL DEFAULT 0,
    sgpa                     NUMERIC(4,2)  NOT NULL DEFAULT 0 CHECK (sgpa BETWEEN 0 AND 10),
    courses_registered       INT  NOT NULL DEFAULT 0,
    courses_passed           INT  NOT NULL DEFAULT 0,
    courses_failed           INT  NOT NULL DEFAULT 0,
    semester_status          VARCHAR(20) DEFAULT 'in_progress'
                               CHECK (semester_status IN ('in_progress','completed','detained')),
    result_date              TIMESTAMP,
    remarks                  TEXT,
    created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, semester, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_semester_results_student     ON semester_results(student_id);
CREATE INDEX IF NOT EXISTS idx_semester_results_semester    ON semester_results(semester);
CREATE INDEX IF NOT EXISTS idx_semester_results_year        ON semester_results(academic_year);
CREATE INDEX IF NOT EXISTS idx_semester_results_student_sem ON semester_results(student_id, semester);
CREATE INDEX IF NOT EXISTS idx_semester_results_sgpa        ON semester_results(sgpa DESC);
CREATE INDEX IF NOT EXISTS idx_semester_results_status      ON semester_results(semester_status);

CREATE TABLE IF NOT EXISTS student_cgpa (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_credits_completed INT  NOT NULL DEFAULT 0,
    total_grade_points      NUMERIC(12,2) NOT NULL DEFAULT 0,
    cgpa                    NUMERIC(4,2)  NOT NULL DEFAULT 0 CHECK (cgpa BETWEEN 0 AND 10),
    semesters_completed     INT  NOT NULL DEFAULT 0,
    current_semester        INT  CHECK (current_semester BETWEEN 1 AND 8),
    total_courses_completed INT  NOT NULL DEFAULT 0,
    total_courses_failed    INT  NOT NULL DEFAULT 0,
    cgpa_history            JSONB DEFAULT '[]',
    last_calculated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id)
);

CREATE INDEX IF NOT EXISTS idx_student_cgpa_student          ON student_cgpa(student_id);
CREATE INDEX IF NOT EXISTS idx_student_cgpa_cgpa             ON student_cgpa(cgpa DESC);
CREATE INDEX IF NOT EXISTS idx_student_cgpa_current_semester ON student_cgpa(current_semester);

-- ──────────────────────────────────────────────────────────────────────────────
-- GRADE POINT MAPPING  (VTU 10-point scale)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grade_point_mapping (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    letter_grade   VARCHAR(4) UNIQUE NOT NULL,
    grade_points   NUMERIC(3,1) NOT NULL CHECK (grade_points BETWEEN 0 AND 10),
    min_percentage NUMERIC(5,2) NOT NULL,
    max_percentage NUMERIC(5,2) NOT NULL,
    description    TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_percentage_range CHECK (min_percentage < max_percentage)
);

CREATE INDEX IF NOT EXISTS idx_grade_mapping_range ON grade_point_mapping(min_percentage, max_percentage);

INSERT INTO grade_point_mapping (letter_grade, grade_points, min_percentage, max_percentage, description) VALUES
('A+', 10.0, 91.00, 100.00, 'Outstanding'),
('A',   9.0, 81.00,  90.99, 'Excellent'),
('B+',  8.0, 71.00,  80.99, 'Very Good'),
('B',   7.0, 61.00,  70.99, 'Good'),
('C+',  6.0, 51.00,  60.99, 'Above Average'),
('C',   5.0, 41.00,  50.99, 'Average'),
('D',   4.0, 40.00,  40.99, 'Pass'),
('E',   0.0, 35.00,  39.99, 'Fail - Reappear'),
('F',   0.0,  0.00,  34.99, 'Fail - Detained')
ON CONFLICT (letter_grade) DO NOTHING;

-- ──────────────────────────────────────────────────────────────────────────────
-- SEMESTER SUBJECTS  (student-entered subjects with VTU credit validation)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS semester_subjects (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    semester      INT  NOT NULL CHECK (semester BETWEEN 1 AND 8),
    academic_year INT  NOT NULL,
    subject_name  VARCHAR(255) NOT NULL,
    subject_code  VARCHAR(50)  NOT NULL,
    credits       INT  NOT NULL CHECK (credits BETWEEN 1 AND 4),
    grade_point   NUMERIC(4,2) CHECK (grade_point BETWEEN 0 AND 10),
    letter_grade  VARCHAR(2),
    is_passed     BOOLEAN DEFAULT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, semester, subject_code)
);

CREATE INDEX IF NOT EXISTS idx_semester_subjects_student_semester
    ON semester_subjects(student_id, semester);

CREATE OR REPLACE FUNCTION validate_semester_credits()
RETURNS TRIGGER AS $$
DECLARE total_credits INTEGER;
BEGIN
    SELECT COALESCE(SUM(credits), 0) INTO total_credits
    FROM semester_subjects
    WHERE student_id = NEW.student_id
      AND semester   = NEW.semester
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);
    total_credits := total_credits + NEW.credits;
    IF total_credits > 20 THEN
        RAISE EXCEPTION 'Total credits for semester % cannot exceed 20 (current %, adding %)',
            NEW.semester, total_credits - NEW.credits, NEW.credits;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_semester_credits ON semester_subjects;
CREATE TRIGGER check_semester_credits
BEFORE INSERT OR UPDATE ON semester_subjects
FOR EACH ROW EXECUTE FUNCTION validate_semester_credits();

-- ──────────────────────────────────────────────────────────────────────────────
-- COURSE FOLDERS, MATERIALS, MESSAGES
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS course_folders (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name             VARCHAR(255) NOT NULL,
    parent_folder_id UUID REFERENCES course_folders(id)  ON DELETE CASCADE,
    created_by       UUID NOT NULL REFERENCES users(id)  ON DELETE SET NULL,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_folder_name_per_parent UNIQUE(course_id, parent_folder_id, name)
);

CREATE INDEX IF NOT EXISTS idx_course_folders_course      ON course_folders(course_id);
CREATE INDEX IF NOT EXISTS idx_course_folders_parent      ON course_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_course_folders_created_by  ON course_folders(created_by);

DROP TRIGGER IF EXISTS update_course_folders_updated_at ON course_folders;
CREATE TRIGGER update_course_folders_updated_at
BEFORE UPDATE ON course_folders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS course_materials (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id     UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    folder_id     UUID          REFERENCES course_folders(id)   ON DELETE SET NULL,
    file_name     VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path     TEXT NOT NULL,
    file_size     BIGINT NOT NULL,
    file_type     VARCHAR(100),
    mime_type     VARCHAR(100),
    description   TEXT,
    uploaded_by   UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    upload_date   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_materials_course       ON course_materials(course_id);
CREATE INDEX IF NOT EXISTS idx_course_materials_folder       ON course_materials(folder_id);
CREATE INDEX IF NOT EXISTS idx_course_materials_uploaded_by  ON course_materials(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_course_materials_upload_date  ON course_materials(upload_date DESC);

DROP TRIGGER IF EXISTS update_course_materials_updated_at ON course_materials;
CREATE TRIGGER update_course_materials_updated_at
BEFORE UPDATE ON course_materials
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS course_messages (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id    UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    message      TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text'
                   CHECK (message_type IN ('text','file','system')),
    material_id  UUID REFERENCES course_materials(id) ON DELETE SET NULL,
    metadata     JSONB,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_course_messages_course       ON course_messages(course_id);
CREATE INDEX IF NOT EXISTS idx_course_messages_user         ON course_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_course_messages_created_at   ON course_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_messages_course_time  ON course_messages(course_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_course_messages_type         ON course_messages(message_type);

DROP TRIGGER IF EXISTS update_course_messages_updated_at ON course_messages;
CREATE TRIGGER update_course_messages_updated_at
BEFORE UPDATE ON course_messages
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ──────────────────────────────────────────────────────────────────────────────
-- AI CO GENERATION TABLES
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_co_generation_sessions (
    id                            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id                    VARCHAR(255) UNIQUE NOT NULL,
    course_id                     UUID REFERENCES courses(id)  ON DELETE CASCADE,
    teacher_id                    UUID REFERENCES users(id)    ON DELETE SET NULL,
    num_apply                     INT  NOT NULL DEFAULT 2,
    num_analyze                   INT  NOT NULL DEFAULT 2,
    use_chromadb                  BOOLEAN DEFAULT FALSE,
    file_names                    TEXT[],
    extracted_text_length         INT,
    files_processed               INT,
    document_processing_ms        NUMERIC(10,2),
    embedding_generation_ms       NUMERIC(10,2),
    graph_construction_ms         NUMERIC(10,2),
    vector_search_ms              NUMERIC(10,2),
    graph_traversal_ms            NUMERIC(10,2),
    llm_inference_ms              NUMERIC(10,2),
    refinement_ms                 NUMERIC(10,2),
    total_pipeline_ms             NUMERIC(10,2),
    average_quality_score         NUMERIC(4,3),
    average_vtu_compliance        NUMERIC(4,3),
    average_obe_alignment         NUMERIC(4,3),
    bloom_classification_accuracy NUMERIC(4,3),
    po_coverage                   NUMERIC(4,3),
    inference_latency_ms          NUMERIC(10,2),
    throughput_cos_per_sec        NUMERIC(10,2),
    cache_hit_rate                NUMERIC(4,3),
    model_type                    VARCHAR(255),
    status                        VARCHAR(50) DEFAULT 'completed'
                                    CHECK (status IN ('processing','completed','failed','partial')),
    error_message                 TEXT,
    created_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at                    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_sessions_course   ON ai_co_generation_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_teacher  ON ai_co_generation_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_created  ON ai_co_generation_sessions(created_at DESC);

DROP TRIGGER IF EXISTS update_ai_sessions_updated_at ON ai_co_generation_sessions;
CREATE TRIGGER update_ai_sessions_updated_at
BEFORE UPDATE ON ai_co_generation_sessions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS ai_co_feedback (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id    VARCHAR(255) NOT NULL,
    co_id         UUID REFERENCES course_outcomes(id) ON DELETE CASCADE,
    co_number     INT  NOT NULL,
    approved      BOOLEAN NOT NULL,
    feedback_text TEXT,
    edited_text   TEXT,
    user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_session ON ai_co_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_co      ON ai_co_feedback(co_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_user    ON ai_co_feedback(user_id);

CREATE TABLE IF NOT EXISTS ai_co_regeneration_history (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    co_id                   UUID REFERENCES course_outcomes(id) ON DELETE CASCADE,
    previous_text           TEXT NOT NULL,
    previous_quality_score  NUMERIC(4,3),
    feedback                TEXT,
    bloom_level             VARCHAR(50),
    new_text                TEXT NOT NULL,
    new_quality_score       NUMERIC(4,3),
    new_vtu_compliance      NUMERIC(4,3),
    new_obe_alignment       NUMERIC(4,3),
    new_bloom_accuracy      NUMERIC(4,3),
    regenerated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    regenerated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_regen_co   ON ai_co_regeneration_history(co_id);
CREATE INDEX IF NOT EXISTS idx_ai_regen_user ON ai_co_regeneration_history(regenerated_by);

-- ──────────────────────────────────────────────────────────────────────────────
-- NBA/OBE ATTAINMENT V2  (Course Exit Survey, SEE mapping, final CO/PO/PSO)
-- ──────────────────────────────────────────────────────────────────────────────

-- Attainment configuration per course
CREATE TABLE IF NOT EXISTS course_attainment_config (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id            UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    attainment_threshold DECIMAL(5,2) DEFAULT 65.0
                           CHECK (attainment_threshold BETWEEN 0 AND 100),
    cie_weightage        DECIMAL(5,2) DEFAULT 60.0,
    see_weightage        DECIMAL(5,2) DEFAULT 40.0,
    direct_weightage     DECIMAL(5,2) DEFAULT 90.0,
    ces_weightage        DECIMAL(5,2) DEFAULT 10.0,
    target_attainment       DECIMAL(5,2) DEFAULT 60.0,
    see_attainment_override DECIMAL(7,4) DEFAULT NULL,  -- if set, used as SEE for all COs (bypasses calculation)
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id)
);

ALTER TABLE course_attainment_config ADD COLUMN IF NOT EXISTS see_attainment_override DECIMAL(7,4) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_course_attainment_config ON course_attainment_config(course_id);

-- Allow multiple COs per question (multi-CO mapping support)
ALTER TABLE question_vertical_analysis DROP CONSTRAINT IF EXISTS question_vertical_analysis_marksheet_id_question_column_key;
ALTER TABLE question_vertical_analysis ADD CONSTRAINT IF NOT EXISTS qva_marksheet_question_co_unique UNIQUE (marksheet_id, question_column, co_number);

-- CES questions (one per CO per course)
CREATE TABLE IF NOT EXISTS ces_questions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id      UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    co_id          UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    co_number      INT  NOT NULL,
    question_text  TEXT NOT NULL,
    question_order INT  DEFAULT 1,
    is_active      BOOLEAN DEFAULT FALSE,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_id)
);

CREATE INDEX IF NOT EXISTS idx_ces_questions_course ON ces_questions(course_id);
CREATE INDEX IF NOT EXISTS idx_ces_questions_co     ON ces_questions(co_id);

-- CES student responses (1–5 Likert)
CREATE TABLE IF NOT EXISTS ces_responses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id    UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    student_id   UUID NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    co_id        UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    co_number    INT  NOT NULL,
    rating       INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, student_id, co_id)
);

CREATE INDEX IF NOT EXISTS idx_ces_responses_course  ON ces_responses(course_id);
CREATE INDEX IF NOT EXISTS idx_ces_responses_student ON ces_responses(student_id);
CREATE INDEX IF NOT EXISTS idx_ces_responses_co      ON ces_responses(co_id);

-- CES computed attainment per CO
CREATE TABLE IF NOT EXISTS ces_attainment (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id      UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    co_id          UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    co_number      INT  NOT NULL,
    response_count INT  DEFAULT 0,
    rating_5_count INT  DEFAULT 0,
    rating_4_count INT  DEFAULT 0,
    rating_3_count INT  DEFAULT 0,
    rating_2_count INT  DEFAULT 0,
    rating_1_count INT  DEFAULT 0,
    weighted_avg   DECIMAL(5,3),
    ces_attainment DECIMAL(5,3),
    calculated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_id)
);

CREATE INDEX IF NOT EXISTS idx_ces_attainment_course ON ces_attainment(course_id);

-- SEE question → CO mapping
CREATE TABLE IF NOT EXISTS see_question_co_mapping (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    question_label  VARCHAR(100) NOT NULL,
    co_number       INT  NOT NULL,
    max_marks       DECIMAL(7,2) NOT NULL DEFAULT 10.0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, question_label)
);

CREATE INDEX IF NOT EXISTS idx_see_q_co_map_course ON see_question_co_mapping(course_id);

-- SEE per-student per-question scores
CREATE TABLE IF NOT EXISTS see_question_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    question_label  VARCHAR(100) NOT NULL,
    co_number       INT  NOT NULL,
    marks_obtained  DECIMAL(7,2),
    max_marks       DECIMAL(7,2),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id, question_label)
);

CREATE INDEX IF NOT EXISTS idx_see_q_scores_course  ON see_question_scores(course_id);
CREATE INDEX IF NOT EXISTS idx_see_q_scores_student ON see_question_scores(student_id);

-- Derived CO-PO mapping levels (computed from marks distribution %)
CREATE TABLE IF NOT EXISTS co_po_mapping_derived (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id            UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    co_id                UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    po_id                UUID NOT NULL REFERENCES program_outcomes(id) ON DELETE CASCADE,
    raw_mapping_strength INT,
    marks_pct            DECIMAL(7,4),
    derived_level        INT  CHECK (derived_level BETWEEN 0 AND 3),
    calculated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_id, po_id)
);

CREATE INDEX IF NOT EXISTS idx_co_po_derived_course ON co_po_mapping_derived(course_id);

-- Derived CO-PSO mapping levels
CREATE TABLE IF NOT EXISTS co_pso_mapping_derived (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id            UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    co_id                UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    pso_id               UUID NOT NULL REFERENCES pso_outcomes(id)     ON DELETE CASCADE,
    raw_mapping_strength INT,
    marks_pct            DECIMAL(7,4),
    derived_level        INT  CHECK (derived_level BETWEEN 0 AND 3),
    calculated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_id, pso_id)
);

CREATE INDEX IF NOT EXISTS idx_co_pso_derived_course ON co_pso_mapping_derived(course_id);

-- Lab CIA CO attainment (intermediate)
CREATE TABLE IF NOT EXISTS lab_co_attainment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    co_id           UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    co_number       INT  NOT NULL,
    attainment_pct  DECIMAL(7,4),
    attempts_count  INT  DEFAULT 0,
    calculated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_co_attainment_course ON lab_co_attainment(course_id);

-- Final CO attainment (theory CIA + lab CIA + SEE + CES → final)
CREATE TABLE IF NOT EXISTS co_attainment_final (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id              UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    co_id                  UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    co_number              INT  NOT NULL,
    theory_cia_attainment  DECIMAL(7,4),
    lab_cia_attainment     DECIMAL(7,4),
    cie_attainment         DECIMAL(7,4),
    see_attainment         DECIMAL(7,4),
    ces_attainment         DECIMAL(7,4),
    direct_attainment      DECIMAL(7,4),
    final_attainment       DECIMAL(7,4),
    attainment_level       INT  CHECK (attainment_level BETWEEN 1 AND 3),
    is_attained            BOOLEAN,
    calculated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, co_id)
);

CREATE INDEX IF NOT EXISTS idx_co_attainment_final_course ON co_attainment_final(course_id);

-- Final PO attainment
CREATE TABLE IF NOT EXISTS po_attainment_final (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id           UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    po_id               UUID NOT NULL REFERENCES program_outcomes(id) ON DELETE CASCADE,
    direct_attainment   DECIMAL(7,4),
    indirect_attainment DECIMAL(7,4) DEFAULT 0,
    final_attainment    DECIMAL(7,4),
    attainment_level    INT  CHECK (attainment_level BETWEEN 1 AND 3),
    calculated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, po_id)
);

CREATE INDEX IF NOT EXISTS idx_po_attainment_final_course ON po_attainment_final(course_id);

-- PSO attainment
CREATE TABLE IF NOT EXISTS pso_attainment (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id         UUID NOT NULL REFERENCES courses(id)      ON DELETE CASCADE,
    pso_id            UUID NOT NULL REFERENCES pso_outcomes(id) ON DELETE CASCADE,
    direct_attainment DECIMAL(7,4),
    final_attainment  DECIMAL(7,4),
    attainment_level  INT  CHECK (attainment_level BETWEEN 1 AND 3),
    calculated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, pso_id)
);

CREATE INDEX IF NOT EXISTS idx_pso_attainment_course ON pso_attainment(course_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- PER-STUDENT ATTAINMENT  (CO / PO / PSO per individual student)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_co_attainment (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    student_id       UUID NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    co_id            UUID NOT NULL REFERENCES course_outcomes(id)  ON DELETE CASCADE,
    co_number        INT  NOT NULL,
    usn              VARCHAR(50),
    student_name     VARCHAR(255),
    theory_cia_pct   NUMERIC(6,2) DEFAULT 0,
    lab_cia_pct      NUMERIC(6,2) DEFAULT 0,
    cie_pct          NUMERIC(6,2) DEFAULT 0,
    see_pct          NUMERIC(6,2) DEFAULT 0,
    ces_pct          NUMERIC(6,2) DEFAULT 0,
    direct_pct       NUMERIC(6,2) DEFAULT 0,
    final_pct        NUMERIC(6,2) DEFAULT 0,
    attainment_level INT DEFAULT 1,
    is_attained      BOOLEAN DEFAULT FALSE,
    calculated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, student_id, co_id)
);

CREATE INDEX IF NOT EXISTS idx_student_co_att_course  ON student_co_attainment(course_id);
CREATE INDEX IF NOT EXISTS idx_student_co_att_student ON student_co_attainment(student_id);
CREATE INDEX IF NOT EXISTS idx_student_co_att_co      ON student_co_attainment(co_id);

CREATE TABLE IF NOT EXISTS student_po_attainment (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id         UUID NOT NULL REFERENCES courses(id)          ON DELETE CASCADE,
    student_id        UUID NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
    po_id             UUID NOT NULL REFERENCES program_outcomes(id) ON DELETE CASCADE,
    po_number         INT  NOT NULL,
    po_attainment_pct NUMERIC(6,2) DEFAULT 0,
    attainment_level  INT DEFAULT 1,
    calculated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, student_id, po_id)
);

CREATE INDEX IF NOT EXISTS idx_student_po_att_course  ON student_po_attainment(course_id);
CREATE INDEX IF NOT EXISTS idx_student_po_att_student ON student_po_attainment(student_id);

CREATE TABLE IF NOT EXISTS student_pso_attainment (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id          UUID NOT NULL REFERENCES courses(id)      ON DELETE CASCADE,
    student_id         UUID NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    pso_id             UUID NOT NULL REFERENCES pso_outcomes(id) ON DELETE CASCADE,
    pso_number         INT  NOT NULL,
    pso_attainment_pct NUMERIC(6,2) DEFAULT 0,
    attainment_level   INT DEFAULT 1,
    calculated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, student_id, pso_id)
);

CREATE INDEX IF NOT EXISTS idx_student_pso_att_course  ON student_pso_attainment(course_id);
CREATE INDEX IF NOT EXISTS idx_student_pso_att_student ON student_pso_attainment(student_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- DONE
-- ──────────────────────────────────────────────────────────────────────────────
SELECT 'Academia360 schema applied successfully — all tables ready.' AS status;
