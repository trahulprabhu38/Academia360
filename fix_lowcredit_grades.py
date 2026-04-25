#!/usr/bin/env python3
"""
Direct DB fix for low-credit (≤2 credit) courses.
1. Overwrites see_marks from Excel files (source of truth)
2. Applies ×2 formula: final = min(raw × 2, 100)
3. Upserts student_final_grades
4. Recalculates semester_results (SGPA) for affected semesters
5. Recalculates student_cgpa for affected students
"""
import sys, os
import psycopg2
import openpyxl

DB = dict(host="127.0.0.1", port=5432, dbname="edu", user="admin", password="password")

CNLAB_XLSX = "/Users/trahulprabhu38/Desktop/Academia360/cn-lab.xlsx"
ES_XLSX    = "/Users/trahulprabhu38/Desktop/Academia360/environment-sse.xlsx"

GRADE_TABLE = [
    (91, "A+", 10), (81, "A", 9), (71, "B+", 8), (61, "B", 7),
    (51, "C+", 6),  (41, "C", 5), (40, "D", 4),  (35, "E", 0),
]

def assign_grade(pct):
    for threshold, g, gp in GRADE_TABLE:
        if pct >= threshold:
            return g, gp
    return "F", 0

def read_xlsx(path):
    wb = openpyxl.load_workbook(path)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    # skip header row
    return {str(r[0]).strip().upper(): float(r[1]) for r in rows[1:] if r[0] and r[1] is not None}

def run():
    print("Reading Excel files...")
    cnlab_marks = read_xlsx(CNLAB_XLSX)
    es_marks    = read_xlsx(ES_XLSX)
    print(f"  CN Lab: {len(cnlab_marks)} students")
    print(f"  ES:     {len(es_marks)} students")

    conn = psycopg2.connect(**DB)
    conn.autocommit = False
    cur = conn.cursor()

    # ── Find course IDs ──────────────────────────────────────────────────────
    cur.execute("SELECT id, code, credits FROM courses WHERE code IN ('21AIL55','21ES57','21RM56')")
    courses = {row[1]: (row[0], int(row[2])) for row in cur.fetchall()}
    print(f"\nCourses found: {list(courses.keys())}")

    affected_students = set()

    for code, (xlsx_data, label) in [
        ("21AIL55", (cnlab_marks, "CN Lab")),
        ("21ES57",  (es_marks,    "Environmental Studies")),
    ]:
        if code not in courses:
            print(f"  WARNING: course {code} not found in DB, skipping")
            continue
        course_id, credits = courses[code]
        print(f"\n── {label} ({code}, {credits} cr, id={course_id}) ─────────────")

        for usn, raw_mark in xlsx_data.items():
            # Look up student
            cur.execute("SELECT id FROM users WHERE UPPER(usn)=UPPER(%s) AND role='student'", (usn,))
            row = cur.fetchone()
            if not row:
                continue
            student_id = row[0]

            raw = float(raw_mark)

            # ── 1. Upsert see_marks ────────────────────────────────────────
            cur.execute("""
                INSERT INTO students_courses (student_id, course_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (student_id, course_id))

            cur.execute("""
                INSERT INTO see_marks (student_id, course_id, see_marks_obtained, see_max_marks, upload_date)
                VALUES (%s, %s, %s, 100, NOW())
                ON CONFLICT (student_id, course_id) DO UPDATE SET
                    see_marks_obtained = EXCLUDED.see_marks_obtained,
                    see_max_marks      = 100,
                    upload_date        = NOW(),
                    updated_at         = NOW()
            """, (student_id, course_id, raw))

            # ── 2. Apply ×2 formula ────────────────────────────────────────
            final_pct = min(raw * 2, 100)
            grade, gp = assign_grade(final_pct)
            passed = grade not in ("E", "F")

            cur.execute("""
                INSERT INTO student_final_grades
                    (student_id, course_id,
                     cie_total, cie_max, see_total, see_max,
                     final_total, final_max, final_percentage,
                     letter_grade, grade_points, credits, is_passed, calculated_at)
                VALUES (%s,%s, NULL,NULL, %s,100, %s,100,%s, %s,%s,%s,%s, NOW())
                ON CONFLICT (student_id, course_id) DO UPDATE SET
                    cie_total=NULL, cie_max=NULL,
                    see_total=EXCLUDED.see_total, see_max=EXCLUDED.see_max,
                    final_total=EXCLUDED.final_total, final_max=EXCLUDED.final_max,
                    final_percentage=EXCLUDED.final_percentage,
                    letter_grade=EXCLUDED.letter_grade, grade_points=EXCLUDED.grade_points,
                    credits=EXCLUDED.credits, is_passed=EXCLUDED.is_passed,
                    calculated_at=NOW(), updated_at=NOW()
            """, (student_id, course_id, raw, final_pct, final_pct, grade, gp, credits, passed))

            affected_students.add(student_id)

        print(f"  Processed {len(xlsx_data)} students")

    conn.commit()
    print(f"\nGrades written for {len(affected_students)} unique students.")

    # ── 3. Recalculate SGPA for each affected student × semester ────────────
    print("\nRecalculating SGPA...")
    for student_id in affected_students:
        # Find all semesters this student has grades in
        cur.execute("""
            SELECT DISTINCT c.semester
            FROM student_final_grades sfg
            JOIN courses c ON sfg.course_id = c.id
            WHERE sfg.student_id = %s
        """, (student_id,))
        semesters = [r[0] for r in cur.fetchall()]

        for sem in semesters:
            # Get all courses for this student in this semester
            cur.execute("""
                SELECT c.credits, sfg.grade_points, sfg.is_passed, c.year
                FROM courses c
                JOIN students_courses sc ON c.id = sc.course_id
                LEFT JOIN student_final_grades sfg
                       ON c.id = sfg.course_id AND sc.student_id = sfg.student_id
                WHERE sc.student_id = %s AND c.semester = %s
            """, (student_id, sem))
            rows = cur.fetchall()
            if not rows:
                continue

            total_cr = 0; earned_cr = 0; gp_sum = 0
            passed_n = 0; failed_n = 0
            max_year = 0

            for cr, gp, is_passed, yr in rows:
                cr = int(cr) if cr else 3
                yr = int(yr) if yr else 0
                total_cr += cr
                max_year = max(max_year, yr)
                if gp is not None:
                    gp_sum += float(gp) * cr
                    if is_passed:
                        earned_cr += cr; passed_n += 1
                    else:
                        failed_n += 1

            if total_cr == 0:
                continue
            sgpa = round(gp_sum / total_cr, 2)
            status = "detained" if failed_n > 0 else ("completed" if passed_n == len(rows) else "in_progress")

            cur.execute("""
                INSERT INTO semester_results
                    (student_id, semester, academic_year,
                     total_credits_registered, total_credits_earned, total_grade_points, sgpa,
                     courses_registered, courses_passed, courses_failed, semester_status, result_date)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                ON CONFLICT (student_id, semester, academic_year) DO UPDATE SET
                    total_credits_registered=EXCLUDED.total_credits_registered,
                    total_credits_earned=EXCLUDED.total_credits_earned,
                    total_grade_points=EXCLUDED.total_grade_points,
                    sgpa=EXCLUDED.sgpa,
                    courses_registered=EXCLUDED.courses_registered,
                    courses_passed=EXCLUDED.courses_passed,
                    courses_failed=EXCLUDED.courses_failed,
                    semester_status=EXCLUDED.semester_status,
                    result_date=NOW(), updated_at=NOW()
            """, (student_id, sem, max_year,
                  total_cr, earned_cr, round(gp_sum, 4), sgpa,
                  len(rows), passed_n, failed_n, status))

    conn.commit()
    print("SGPA updated.")

    # ── 4. Recalculate CGPA for each affected student ───────────────────────
    print("Recalculating CGPA...")
    for student_id in affected_students:
        cur.execute("""
            SELECT semester, academic_year, sgpa, total_credits_earned,
                   total_grade_points, courses_passed, courses_failed, semester_status
            FROM semester_results
            WHERE student_id = %s
            ORDER BY semester ASC
        """, (student_id,))
        sems = cur.fetchall()
        if not sems:
            continue

        tot_cr = 0; tot_gp = 0; tot_passed = 0; tot_failed = 0
        sems_done = 0; cur_sem = 1
        history = []

        for sem, yr, sgpa_v, cr_earned, gp_total, passed_n, failed_n, status in sems:
            cr_earned = int(cr_earned) if cr_earned else 0
            gp_total  = float(gp_total) if gp_total else 0
            sgpa_v    = float(sgpa_v) if sgpa_v else 0
            tot_cr   += cr_earned
            tot_gp   += gp_total
            tot_passed += int(passed_n) if passed_n else 0
            tot_failed += int(failed_n) if failed_n else 0
            if status == "completed": sems_done += 1
            cur_sem = max(cur_sem, int(sem))
            cgpa_now = round(tot_gp / tot_cr, 2) if tot_cr > 0 else 0
            history.append({"semester": sem, "academicYear": yr, "sgpa": round(sgpa_v,2),
                             "cgpa": cgpa_now, "creditsEarned": cr_earned, "status": status})

        cgpa_final = round(tot_gp / tot_cr, 2) if tot_cr > 0 else 0

        import json
        cur.execute("""
            INSERT INTO student_cgpa
                (student_id, total_credits_completed, total_grade_points, cgpa,
                 semesters_completed, current_semester,
                 total_courses_completed, total_courses_failed,
                 cgpa_history, last_calculated_at)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
            ON CONFLICT (student_id) DO UPDATE SET
                total_credits_completed=EXCLUDED.total_credits_completed,
                total_grade_points=EXCLUDED.total_grade_points,
                cgpa=EXCLUDED.cgpa,
                semesters_completed=EXCLUDED.semesters_completed,
                current_semester=EXCLUDED.current_semester,
                total_courses_completed=EXCLUDED.total_courses_completed,
                total_courses_failed=EXCLUDED.total_courses_failed,
                cgpa_history=EXCLUDED.cgpa_history,
                last_calculated_at=NOW(), updated_at=NOW()
        """, (student_id, tot_cr, round(tot_gp,4), cgpa_final,
              sems_done, cur_sem, tot_passed, tot_failed, json.dumps(history)))

    conn.commit()
    print("CGPA updated.")

    # ── Summary for student 1DS21AI001 ──────────────────────────────────────
    cur.execute("""
        SELECT c.code, sfg.see_total, sfg.final_total, sfg.final_percentage,
               sfg.letter_grade, sfg.grade_points, sfg.is_passed
        FROM student_final_grades sfg
        JOIN courses c ON sfg.course_id = c.id
        JOIN users u ON sfg.student_id = u.id
        WHERE u.usn = '1DS21AI001' AND c.code IN ('21AIL55','21ES57')
        ORDER BY c.code
    """)
    rows = cur.fetchall()
    print("\n── Result for 1DS21AI001 ────────────────────────────────────────")
    print(f"{'Code':<10} {'SEE':>6} {'Final':>7} {'%':>6} {'Grade':>6} {'GP':>5} {'Pass':>5}")
    for r in rows:
        print(f"{r[0]:<10} {r[1]:>6.1f} {r[2]:>7.1f} {r[3]:>5.1f}% {r[4]:>6} {r[5]:>5.1f} {'✓' if r[6] else '✗':>5}")

    cur.close()
    conn.close()
    print("\nDone. Refresh the Student Progression page.")

if __name__ == "__main__":
    run()
