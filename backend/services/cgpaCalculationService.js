import pool from '../config/db.js';

/**
 * CGPA Calculation Service
 * Calculates Semester GPA (SGPA) and Cumulative GPA (CGPA)
 * Formula: SGPA/CGPA = Sum(Grade Points × Credits) / Total Credits
 */
class CGPACalculationService {
  /**
   * Calculate SGPA for a student in a specific semester
   * @param {UUID} studentId - Student ID
   * @param {Number} semester - Semester number (1-8)
   * @param {Number} academicYear - Academic year (e.g., 2024)
   * @returns {Object} SGPA data
   */
  async calculateSGPA(studentId, semester, academicYear) {
    const client = await pool.connect();

    try {
      console.log(`\n=== CALCULATING SGPA ===`);
      console.log(`Student: ${studentId}, Semester: ${semester}, Year: ${academicYear}`);

      // Get all courses for this student in this semester
      const coursesQuery = `
        SELECT
          c.id AS course_id,
          c.code,
          c.name,
          c.credits,
          sfg.final_total,
          sfg.final_percentage,
          sfg.letter_grade,
          sfg.grade_points,
          sfg.is_passed
        FROM courses c
        JOIN students_courses sc ON c.id = sc.course_id
        LEFT JOIN student_final_grades sfg ON c.id = sfg.course_id AND sc.student_id = sfg.student_id
        WHERE sc.student_id = $1
          AND c.semester = $2
          AND c.year = $3
        ORDER BY c.code
      `;

      const coursesResult = await client.query(coursesQuery, [studentId, semester, academicYear]);
      const courses = coursesResult.rows;

      if (courses.length === 0) {
        throw new Error(`No courses found for student in semester ${semester}, year ${academicYear}`);
      }

      console.log(`Found ${courses.length} courses for this semester`);

      let totalCreditsRegistered = 0;
      let totalCreditsEarned = 0;
      let totalGradePoints = 0;
      let coursesRegistered = 0;
      let coursesPassed = 0;
      let coursesFailed = 0;

      for (const course of courses) {
        const credits = parseInt(course.credits) || 3;
        coursesRegistered++;
        totalCreditsRegistered += credits;

        if (course.grade_points !== null && course.grade_points !== undefined) {
          const gradePoints = parseFloat(course.grade_points);
          const isPassed = course.is_passed === true;

          // Add to total grade points (even for failed courses for SGPA calculation)
          totalGradePoints += gradePoints * credits;

          // Only count credits as earned if course is passed
          if (isPassed) {
            totalCreditsEarned += credits;
            coursesPassed++;
            console.log(`  ${course.code}: ${course.letter_grade} (${gradePoints} GP) × ${credits} credits = ${(gradePoints * credits).toFixed(2)} [PASSED]`);
          } else {
            coursesFailed++;
            console.log(`  ${course.code}: ${course.letter_grade} (${gradePoints} GP) × ${credits} credits = ${(gradePoints * credits).toFixed(2)} [FAILED]`);
          }
        } else {
          console.log(`  ${course.code}: No grade available yet`);
        }
      }

      // Calculate SGPA
      // SGPA includes ALL courses (passed and failed) in the calculation
      // But credits earned only counts passed courses
      const sgpa = totalCreditsRegistered > 0
        ? totalGradePoints / totalCreditsRegistered
        : 0;

      console.log(`\nSemester Summary:`);
      console.log(`  Total Credits Registered: ${totalCreditsRegistered}`);
      console.log(`  Total Credits Earned: ${totalCreditsEarned}`);
      console.log(`  Total Grade Points: ${totalGradePoints.toFixed(2)}`);
      console.log(`  SGPA: ${sgpa.toFixed(2)}/10`);
      console.log(`  Courses: ${coursesPassed} passed, ${coursesFailed} failed`);

      // Determine semester status
      let semesterStatus = 'completed';
      if (coursesFailed > 0) {
        semesterStatus = 'detained'; // Has failed courses
      } else if (coursesPassed < coursesRegistered) {
        semesterStatus = 'in_progress'; // Some courses not graded yet
      }

      // Store in semester_results table
      const upsertQuery = `
        INSERT INTO semester_results (
          student_id, semester, academic_year,
          total_credits_registered, total_credits_earned,
          total_grade_points, sgpa,
          courses_registered, courses_passed, courses_failed,
          semester_status, result_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
        ON CONFLICT (student_id, semester, academic_year)
        DO UPDATE SET
          total_credits_registered = EXCLUDED.total_credits_registered,
          total_credits_earned = EXCLUDED.total_credits_earned,
          total_grade_points = EXCLUDED.total_grade_points,
          sgpa = EXCLUDED.sgpa,
          courses_registered = EXCLUDED.courses_registered,
          courses_passed = EXCLUDED.courses_passed,
          courses_failed = EXCLUDED.courses_failed,
          semester_status = EXCLUDED.semester_status,
          result_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await client.query(upsertQuery, [
        studentId,
        semester,
        academicYear,
        totalCreditsRegistered,
        totalCreditsEarned,
        totalGradePoints,
        sgpa,
        coursesRegistered,
        coursesPassed,
        coursesFailed,
        semesterStatus
      ]);

      console.log(`✅ SGPA calculated and stored successfully`);

      return result.rows[0];

    } catch (error) {
      console.error('Error in calculateSGPA:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate cumulative CGPA for a student across all semesters
   * @param {UUID} studentId - Student ID
   * @returns {Object} CGPA data
   */
  async calculateCGPA(studentId) {
    const client = await pool.connect();

    try {
      console.log(`\n=== CALCULATING CUMULATIVE CGPA ===`);
      console.log(`Student: ${studentId}`);

      // Get all semester results for this student
      const semesterQuery = `
        SELECT
          semester,
          academic_year,
          sgpa,
          total_credits_registered,
          total_credits_earned,
          total_grade_points,
          courses_passed,
          courses_failed,
          semester_status
        FROM semester_results
        WHERE student_id = $1
        ORDER BY semester ASC
      `;

      const semesterResult = await client.query(semesterQuery, [studentId]);
      const semesters = semesterResult.rows;

      if (semesters.length === 0) {
        console.log('No semester results found for student');
        return null;
      }

      console.log(`Found ${semesters.length} semester(s) of data`);

      let totalCreditsCompleted = 0;
      let totalGradePoints = 0;
      let totalCoursesCompleted = 0;
      let totalCoursesFailed = 0;
      let semestersCompleted = 0;
      let currentSemester = 1;

      const cgpaHistory = [];

      for (const sem of semesters) {
        const semesterNum = parseInt(sem.semester);
        const credits = parseInt(sem.total_credits_earned);
        const gradePoints = parseFloat(sem.total_grade_points) || 0;
        const sgpa = parseFloat(sem.sgpa) || 0;

        // Accumulate totals
        totalCreditsCompleted += credits;
        totalGradePoints += gradePoints;
        totalCoursesCompleted += parseInt(sem.courses_passed) || 0;
        totalCoursesFailed += parseInt(sem.courses_failed) || 0;

        if (sem.semester_status === 'completed') {
          semestersCompleted++;
        }

        currentSemester = Math.max(currentSemester, semesterNum);

        // Calculate cumulative CGPA up to this semester
        const cumulativeCGPA = totalCreditsCompleted > 0
          ? totalGradePoints / totalCreditsCompleted
          : 0;

        cgpaHistory.push({
          semester: semesterNum,
          academicYear: sem.academic_year,
          sgpa: parseFloat(sgpa.toFixed(2)),
          cgpa: parseFloat(cumulativeCGPA.toFixed(2)),
          creditsEarned: credits,
          status: sem.semester_status
        });

        console.log(`  Semester ${semesterNum}: SGPA=${sgpa.toFixed(2)}, Cumulative CGPA=${cumulativeCGPA.toFixed(2)}, Credits=${credits}`);
      }

      // Calculate final CGPA
      const cgpa = totalCreditsCompleted > 0
        ? totalGradePoints / totalCreditsCompleted
        : 0;

      console.log(`\nCumulative Summary:`);
      console.log(`  Total Credits Completed: ${totalCreditsCompleted}`);
      console.log(`  Total Grade Points: ${totalGradePoints.toFixed(2)}`);
      console.log(`  CGPA: ${cgpa.toFixed(2)}/10`);
      console.log(`  Semesters Completed: ${semestersCompleted}`);
      console.log(`  Current Semester: ${currentSemester}`);
      console.log(`  Total Courses: ${totalCoursesCompleted} passed, ${totalCoursesFailed} failed`);

      // Store in student_cgpa table
      const upsertQuery = `
        INSERT INTO student_cgpa (
          student_id,
          total_credits_completed, total_grade_points, cgpa,
          semesters_completed, current_semester,
          total_courses_completed, total_courses_failed,
          cgpa_history, last_calculated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        ON CONFLICT (student_id)
        DO UPDATE SET
          total_credits_completed = EXCLUDED.total_credits_completed,
          total_grade_points = EXCLUDED.total_grade_points,
          cgpa = EXCLUDED.cgpa,
          semesters_completed = EXCLUDED.semesters_completed,
          current_semester = EXCLUDED.current_semester,
          total_courses_completed = EXCLUDED.total_courses_completed,
          total_courses_failed = EXCLUDED.total_courses_failed,
          cgpa_history = EXCLUDED.cgpa_history,
          last_calculated_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await client.query(upsertQuery, [
        studentId,
        totalCreditsCompleted,
        totalGradePoints,
        cgpa,
        semestersCompleted,
        currentSemester,
        totalCoursesCompleted,
        totalCoursesFailed,
        JSON.stringify(cgpaHistory)
      ]);

      console.log(`✅ CGPA calculated and stored successfully`);

      return result.rows[0];

    } catch (error) {
      console.error('Error in calculateCGPA:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate SGPA from semester_subjects table (manually added subjects)
   * Used when subjects are added via SemesterSubjectManager, not students_courses
   */
  async calculateSGPAFromSubjects(studentId, semester) {
    const client = await pool.connect();
    try {
      console.log(`\n=== CALCULATING SGPA FROM SUBJECTS (sem ${semester}) ===`);

      const result = await client.query(`
        SELECT credits, grade_point, is_passed, academic_year
        FROM semester_subjects
        WHERE student_id = $1 AND semester = $2
      `, [studentId, semester]);

      const subjects = result.rows;
      if (subjects.length === 0) {
        throw new Error(`No subjects found in semester_subjects for semester ${semester}`);
      }

      let totalCreditsRegistered = 0;
      let totalCreditsEarned = 0;
      let totalGradePoints = 0;
      let coursesPassed = 0;
      let coursesFailed = 0;

      for (const sub of subjects) {
        const credits = parseInt(sub.credits) || 3;
        totalCreditsRegistered += credits;
        if (sub.grade_point !== null) {
          const gp = parseFloat(sub.grade_point);
          totalGradePoints += gp * credits;
          if (sub.is_passed) { totalCreditsEarned += credits; coursesPassed++; }
          else coursesFailed++;
        }
      }

      const sgpa = totalCreditsRegistered > 0 ? totalGradePoints / totalCreditsRegistered : 0;
      const academicYear = subjects[0].academic_year;
      const semesterStatus = coursesFailed > 0 ? 'detained'
        : coursesPassed < subjects.length ? 'in_progress' : 'completed';

      const upsertQuery = `
        INSERT INTO semester_results (
          student_id, semester, academic_year,
          total_credits_registered, total_credits_earned, total_grade_points, sgpa,
          courses_registered, courses_passed, courses_failed, semester_status, result_date
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP)
        ON CONFLICT (student_id, semester, academic_year) DO UPDATE SET
          total_credits_registered = EXCLUDED.total_credits_registered,
          total_credits_earned     = EXCLUDED.total_credits_earned,
          total_grade_points       = EXCLUDED.total_grade_points,
          sgpa                     = EXCLUDED.sgpa,
          courses_registered       = EXCLUDED.courses_registered,
          courses_passed           = EXCLUDED.courses_passed,
          courses_failed           = EXCLUDED.courses_failed,
          semester_status          = EXCLUDED.semester_status,
          result_date              = CURRENT_TIMESTAMP,
          updated_at               = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const res = await client.query(upsertQuery, [
        studentId, semester, academicYear,
        totalCreditsRegistered, totalCreditsEarned, totalGradePoints, sgpa,
        subjects.length, coursesPassed, coursesFailed, semesterStatus
      ]);

      console.log(`✅ SGPA from subjects: ${sgpa.toFixed(2)} for semester ${semester}`);
      return res.rows[0];
    } catch (error) {
      console.error('Error in calculateSGPAFromSubjects:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get CGPA data for a student
   * @param {UUID} studentId - Student ID
   * @returns {Object} CGPA data or null
   */
  async getStudentCGPA(studentId) {
    try {
      const query = `
        SELECT
          sc.*,
          u.usn,
          u.name AS student_name,
          u.department
        FROM student_cgpa sc
        JOIN users u ON sc.student_id = u.id
        WHERE sc.student_id = $1
      `;

      const result = await pool.query(query, [studentId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('Error in getStudentCGPA:', error);
      throw error;
    }
  }

  /**
   * Get SGPA for a specific semester
   * @param {UUID} studentId - Student ID
   * @param {Number} semester - Semester number
   * @returns {Object} SGPA data or null
   */
  async getSemesterSGPA(studentId, semester) {
    try {
      const query = `
        SELECT *
        FROM semester_results
        WHERE student_id = $1 AND semester = $2
        ORDER BY academic_year DESC
        LIMIT 1
      `;

      const result = await pool.query(query, [studentId, semester]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('Error in getSemesterSGPA:', error);
      throw error;
    }
  }

  /**
   * Calculate student's rank based on CGPA
   * @param {UUID} studentId - Student ID
   * @param {String} department - Department filter (optional)
   * @returns {Object} Rank data
   */
  async calculateRank(studentId, department = null) {
    try {
      let query = `
        SELECT
          student_id,
          cgpa,
          ROW_NUMBER() OVER (ORDER BY cgpa DESC, total_credits_completed DESC) as rank
        FROM student_cgpa sc
        JOIN users u ON sc.student_id = u.id
        WHERE cgpa > 0
      `;

      const params = [];

      if (department) {
        query += ' AND u.department = $1';
        params.push(department);
      }

      const allStudentsResult = await pool.query(query, params);
      const allStudents = allStudentsResult.rows;

      const studentRankData = allStudents.find(s => s.student_id === studentId);

      if (!studentRankData) {
        return null;
      }

      const totalStudents = allStudents.length;
      const rank = parseInt(studentRankData.rank);
      const percentile = totalStudents > 0
        ? ((totalStudents - rank + 1) / totalStudents) * 100
        : 0;

      return {
        rank,
        totalStudents,
        percentile: Math.round(percentile * 100) / 100,
        cgpa: parseFloat(studentRankData.cgpa)
      };

    } catch (error) {
      console.error('Error in calculateRank:', error);
      throw error;
    }
  }

  /**
   * Recalculate CGPA for all students (batch operation)
   * @returns {Object} Summary
   */
  async recalculateAllCGPA() {
    try {
      console.log(`\n=== RECALCULATING CGPA FOR ALL STUDENTS ===`);

      // Get all students who have semester results
      const studentsQuery = `
        SELECT DISTINCT student_id
        FROM semester_results
        ORDER BY student_id
      `;

      const studentsResult = await pool.query(studentsQuery);
      const students = studentsResult.rows;

      console.log(`Found ${students.length} students with semester results`);

      const results = {
        total: students.length,
        calculated: 0,
        failed: 0,
        errors: []
      };

      for (const student of students) {
        try {
          await this.calculateCGPA(student.student_id);
          results.calculated++;
        } catch (err) {
          console.error(`Failed for student ${student.student_id}:`, err.message);
          results.errors.push({
            studentId: student.student_id,
            error: err.message
          });
          results.failed++;
        }
      }

      console.log(`\n✅ CGPA RECALCULATION COMPLETE`);
      console.log(`   Calculated: ${results.calculated}, Failed: ${results.failed}`);

      return results;

    } catch (error) {
      console.error('Error in recalculateAllCGPA:', error);
      throw error;
    }
  }
}

export default new CGPACalculationService();
