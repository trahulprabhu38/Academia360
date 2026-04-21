import pool from '../config/db.js';

/**
 * Semester Progression Service
 * Aggregates and formats semester progression data for visualization
 * Provides comprehensive view of student's academic journey across all 8 semesters
 */
class SemesterProgressionService {
  /**
   * Get complete semester progression for a student
   * Returns comprehensive data structure for visualization
   * @param {UUID} studentId - Student ID
   * @returns {Object} Complete progression data
   */
  async getStudentProgression(studentId) {
    try {
      console.log(`\n=== FETCHING STUDENT PROGRESSION ===`);
      console.log(`Student ID: ${studentId}`);

      // Get student details
      const studentQuery = await pool.query(
        'SELECT id, usn, name, email, department, role FROM users WHERE id = $1',
        [studentId]
      );

      if (studentQuery.rows.length === 0) {
        throw new Error('Student not found');
      }

      const student = studentQuery.rows[0];
      console.log(`Student: ${student.usn} - ${student.name}`);

      // Get pre-computed CGPA (if available)
      const cgpaQuery = await pool.query(
        'SELECT * FROM student_cgpa WHERE student_id = $1',
        [studentId]
      );
      const cgpaData = cgpaQuery.rows[0] || { cgpa: 0, total_credits_completed: 0, current_semester: 1, cgpa_history: [] };

      // Get pre-computed semester results
      const semesterQuery = await pool.query(`
        SELECT semester, academic_year, sgpa, total_credits_registered, total_credits_earned,
               courses_registered, courses_passed, courses_failed, semester_status, result_date
        FROM semester_results
        WHERE student_id = $1
        ORDER BY semester ASC
      `, [studentId]);
      const semesterResults = semesterQuery.rows;

      // Source 1: enrolled via students_courses — one row per semester (max year for display)
      const enrolledQuery = await pool.query(`
        SELECT c.semester, MAX(c.year) as year
        FROM students_courses sc
        JOIN courses c ON sc.course_id = c.id
        WHERE sc.student_id = $1
        GROUP BY c.semester
        ORDER BY c.semester ASC
      `, [studentId]);

      // Source 2: manually added via semester_subjects
      const subjectSemQuery = await pool.query(`
        SELECT semester, MAX(academic_year) as year
        FROM semester_subjects
        WHERE student_id = $1
        GROUP BY semester
        ORDER BY semester ASC
      `, [studentId]);

      // Merge both sources into a map: semester → year (for display label only)
      const enrolledMap = new Map();
      for (const row of enrolledQuery.rows) {
        enrolledMap.set(parseInt(row.semester), row.year);
      }
      for (const row of subjectSemQuery.rows) {
        const sem = parseInt(row.semester);
        if (!enrolledMap.has(sem)) {
          enrolledMap.set(sem, row.year);
        }
      }

      console.log(`Enrolled (courses): ${enrolledQuery.rows.length} sem(s), Enrolled (subjects): ${subjectSemQuery.rows.length} sem(s)`);

      // Build semesters array (1-8)
      const semesters = [];
      let cumulativeGP = 0;
      let cumulativeCredits = 0;
      const inlineCGPAHistory = [];

      for (let semNum = 1; semNum <= 8; semNum++) {
        const semesterResult = semesterResults.find(s => parseInt(s.semester) === semNum);
        const enrolledYear = enrolledMap.get(semNum);

        if (semesterResult) {
          // Always fetch ALL courses without year filter — stale semester_results may have
          // been computed when fewer courses were enrolled, so year-scoped query drops new ones
          let courses = await this.getSemesterCourses(studentId, semNum, null);
          if (courses.length === 0) courses = await this.getSemesterSubjectData(studentId, semNum);

          // Recompute counts from the actual loaded courses (not stale semester_results counts)
          const gradedCourses = courses.filter(c => c.gradePoints !== null);
          const passedCourses = courses.filter(c => c.passed);
          const failedCourses = courses.filter(c => c.gradePoints !== null && !c.passed);
          const totalCredits  = courses.reduce((s, c) => s + (c.credits || 0), 0);
          const earnedCredits = passedCourses.reduce((s, c) => s + (c.credits || 0), 0);

          // Recompute SGPA inline from all graded courses so new enrollments are reflected
          let sgpa = parseFloat(semesterResult.sgpa) || 0;
          if (gradedCourses.length > 0) {
            const gpSum = gradedCourses.reduce((s, c) => s + c.gradePoints * (c.credits || 3), 0);
            const crSum = gradedCourses.reduce((s, c) => s + (c.credits || 3), 0);
            sgpa = crSum > 0 ? parseFloat((gpSum / crSum).toFixed(2)) : sgpa;
          }

          // Status: detained > completed > in_progress
          const allGraded = courses.length > 0 && courses.every(c => c.gradePoints !== null);
          let status = semesterResult.semester_status || 'in_progress';
          if (failedCourses.length > 0) status = 'detained';
          else if (allGraded && passedCourses.length === courses.length && courses.length > 0) status = 'completed';
          else if (courses.length > 0) status = 'in_progress';

          cumulativeGP += sgpa * earnedCredits;
          cumulativeCredits += earnedCredits;
          inlineCGPAHistory.push({
            semester: semNum,
            academicYear: semesterResult.academic_year,
            sgpa: parseFloat(sgpa.toFixed(2)),
            cgpa: parseFloat((cumulativeCredits > 0 ? cumulativeGP / cumulativeCredits : 0).toFixed(2)),
            creditsEarned: earnedCredits,
            status
          });

          semesters.push({
            semester: semNum,
            year: semesterResult.academic_year,
            sgpa,
            credits: totalCredits,
            creditsEarned: earnedCredits,
            status,
            coursesRegistered: courses.length,
            coursesPassed: passedCourses.length,
            coursesFailed: failedCourses.length,
            resultDate: semesterResult.result_date,
            courses
          });

        } else if (enrolledYear !== undefined) {
          // Enrolled but SGPA not persisted yet — fetch ALL courses for this semester
          // without year filter (year mismatch between courses would silently drop rows)
          let courses = await this.getSemesterCourses(studentId, semNum, null);
          if (courses.length === 0) {
            courses = await this.getSemesterSubjectData(studentId, semNum);
          }
          // Derive display year from the courses themselves (most recent)
          const courseYear = courses.length > 0
            ? Math.max(...courses.map(c => parseInt(c.year) || 0)) || enrolledYear
            : enrolledYear;

          // Compute inline SGPA from courses with grade points
          const gradedCourses = courses.filter(c => c.gradePoints !== null);
          let inlineSGPA = null;
          if (gradedCourses.length > 0) {
            const gpSum = gradedCourses.reduce((s, c) => s + c.gradePoints * (c.credits || 3), 0);
            const crSum = gradedCourses.reduce((s, c) => s + (c.credits || 3), 0);
            inlineSGPA = crSum > 0 ? parseFloat((gpSum / crSum).toFixed(2)) : null;
          }

          const totalCredits = courses.reduce((s, c) => s + (c.credits || 0), 0);
          const passed = courses.filter(c => c.passed);
          const failed = courses.filter(c => c.gradePoints !== null && !c.passed);
          const allGraded = courses.length > 0 && courses.every(c => c.gradePoints !== null);
          const creditsEarned = passed.reduce((s, c) => s + (c.credits || 0), 0);

          // Determine status
          let status = 'in_progress';
          if (failed.length > 0) status = 'detained';
          else if (allGraded && passed.length === courses.length && courses.length > 0) status = 'completed';

          // Accumulate for inline CGPA history (use inline SGPA)
          if (inlineSGPA !== null) {
            cumulativeGP += inlineSGPA * creditsEarned;
            cumulativeCredits += creditsEarned;
            inlineCGPAHistory.push({
              semester: semNum,
              academicYear: courseYear,
              sgpa: inlineSGPA,
              cgpa: parseFloat((cumulativeCredits > 0 ? cumulativeGP / cumulativeCredits : 0).toFixed(2)),
              creditsEarned,
              status
            });
          }

          semesters.push({
            semester: semNum,
            year: courseYear,
            sgpa: inlineSGPA,
            credits: totalCredits,
            creditsEarned,
            status,
            coursesRegistered: courses.length,
            coursesPassed: passed.length,
            coursesFailed: failed.length,
            resultDate: null,
            courses
          });

        } else {
          semesters.push({
            semester: semNum,
            year: null,
            sgpa: null,
            credits: 0,
            creditsEarned: 0,
            status: 'not_started',
            coursesRegistered: 0,
            coursesPassed: 0,
            coursesFailed: 0,
            resultDate: null,
            courses: []
          });
        }
      }

      // Compute final inline CGPA and use if DB value is absent
      const inlineCGPA = cumulativeCredits > 0 ? cumulativeGP / cumulativeCredits : 0;
      const finalCGPA = parseFloat(cgpaData.cgpa) > 0 ? parseFloat(cgpaData.cgpa) : inlineCGPA;

      // Use inline cgpaHistory if DB history is empty
      let cgpaHistory = [];
      try {
        if (cgpaData.cgpa_history) {
          cgpaHistory = typeof cgpaData.cgpa_history === 'string'
            ? JSON.parse(cgpaData.cgpa_history)
            : cgpaData.cgpa_history;
        }
      } catch { cgpaHistory = []; }
      if (cgpaHistory.length === 0) cgpaHistory = inlineCGPAHistory;

      // Derive max semester from all enrollment sources
      const maxEnrolledSem = enrolledMap.size > 0 ? Math.max(...enrolledMap.keys()) : 1;
      const activeSems = semesters.filter(s => s.status !== 'not_started');
      const semestersCompleted = activeSems.filter(s => s.status === 'completed').length;
      const totalCoursesCompleted = activeSems.reduce((s, sem) => s + sem.coursesPassed, 0);
      const totalCoursesFailed = activeSems.reduce((s, sem) => s + sem.coursesFailed, 0);
      const totalCredits = activeSems.reduce((s, sem) => s + sem.creditsEarned, 0);

      const progressionData = {
        student: {
          id: student.id,
          usn: student.usn,
          name: student.name,
          email: student.email,
          department: student.department
        },
        currentSemester: parseInt(cgpaData.current_semester) || maxEnrolledSem,
        cgpa: parseFloat(finalCGPA.toFixed(2)) || 0,
        totalCredits: parseInt(cgpaData.total_credits_completed) || totalCredits,
        semestersCompleted: parseInt(cgpaData.semesters_completed) || semestersCompleted,
        totalCoursesCompleted: parseInt(cgpaData.total_courses_completed) || totalCoursesCompleted,
        totalCoursesFailed: parseInt(cgpaData.total_courses_failed) || totalCoursesFailed,
        semesters,
        cgpaHistory
      };

      console.log(`✅ Progression fetched: currentSem=${progressionData.currentSemester}, CGPA=${progressionData.cgpa.toFixed(2)}`);
      return progressionData;

    } catch (error) {
      console.error('Error in getStudentProgression:', error);
      throw error;
    }
  }

  async getSemesterSubjectData(studentId, semester) {
    try {
      const result = await pool.query(`
        SELECT id as course_id, subject_code as code, subject_name as name,
               credits, letter_grade, grade_point, is_passed, academic_year
        FROM semester_subjects
        WHERE student_id = $1 AND semester = $2
        ORDER BY subject_code ASC
      `, [studentId, semester]);

      return result.rows.map(row => ({
        courseId: row.course_id,
        code: row.code || '—',
        name: row.name,
        credits: parseInt(row.credits) || 3,
        cieMarks: null,
        seeMarks: null,
        finalMarks: null,
        percentage: null,
        grade: row.letter_grade || null,
        gradePoints: row.grade_point !== null ? parseFloat(row.grade_point) : null,
        passed: row.is_passed === true,
        source: 'manual'
      }));
    } catch (err) {
      console.error('getSemesterSubjectData error:', err);
      return [];
    }
  }

  /**
   * Get courses for a specific semester
   * @param {UUID} studentId - Student ID
   * @param {Number} semester - Semester number
   * @param {Number} academicYear - Academic year
   * @returns {Array} Array of course data
   */
  async getSemesterCourses(studentId, semester, academicYear = null) {
    try {
      // When academicYear is provided we scope to that year (used when semester_results
      // already has a row so we know the exact academic year).
      // When null we return ALL courses for that semester number regardless of year —
      // this prevents year-mismatch from silently dropping enrolled courses.
      const query = academicYear
        ? `SELECT c.id AS course_id, c.code, c.name, c.credits, c.year,
                  sfg.cie_total, sfg.see_total, sfg.final_total, sfg.final_percentage,
                  sfg.letter_grade, sfg.grade_points, sfg.is_passed
           FROM courses c
           JOIN students_courses sc ON c.id = sc.course_id
           LEFT JOIN student_final_grades sfg
                  ON c.id = sfg.course_id AND sc.student_id = sfg.student_id
           WHERE sc.student_id = $1 AND c.semester = $2 AND c.year = $3
           ORDER BY c.code ASC`
        : `SELECT c.id AS course_id, c.code, c.name, c.credits, c.year,
                  sfg.cie_total, sfg.see_total, sfg.final_total, sfg.final_percentage,
                  sfg.letter_grade, sfg.grade_points, sfg.is_passed
           FROM courses c
           JOIN students_courses sc ON c.id = sc.course_id
           LEFT JOIN student_final_grades sfg
                  ON c.id = sfg.course_id AND sc.student_id = sfg.student_id
           WHERE sc.student_id = $1 AND c.semester = $2
           ORDER BY c.code ASC`;

      const params = academicYear ? [studentId, semester, academicYear] : [studentId, semester];
      const result = await pool.query(query, params);

      return result.rows.map(row => ({
        courseId: row.course_id,
        code: row.code,
        name: row.name,
        credits: parseInt(row.credits) || 3,
        year: row.year,
        cieMarks: row.cie_total   != null ? parseFloat(row.cie_total)   : null,
        seeMarks: row.see_total   != null ? parseFloat(row.see_total)   : null,
        finalMarks: row.final_total != null ? parseFloat(row.final_total) : null,
        percentage: row.final_percentage != null ? parseFloat(row.final_percentage) : null,
        grade: row.letter_grade || null,
        gradePoints: row.grade_points != null ? parseFloat(row.grade_points) : null,
        passed: row.is_passed === true
      }));

    } catch (error) {
      console.error('Error in getSemesterCourses:', error);
      throw error;
    }
  }

  /**
   * Get detailed semester information
   * @param {UUID} studentId - Student ID
   * @param {Number} semester - Semester number
   * @returns {Object} Detailed semester data
   */
  async getSemesterDetails(studentId, semester) {
    try {
      // Get semester result
      const semesterQuery = await pool.query(`
        SELECT *
        FROM semester_results
        WHERE student_id = $1 AND semester = $2
        ORDER BY academic_year DESC
        LIMIT 1
      `, [studentId, semester]);

      if (semesterQuery.rows.length === 0) {
        return null;
      }

      const semesterResult = semesterQuery.rows[0];

      // Get courses for this semester
      const courses = await this.getSemesterCourses(
        studentId,
        semester,
        semesterResult.academic_year
      );

      return {
        semester: parseInt(semesterResult.semester),
        academicYear: semesterResult.academic_year,
        sgpa: parseFloat(semesterResult.sgpa) || 0,
        totalCredits: parseInt(semesterResult.total_credits_registered) || 0,
        creditsEarned: parseInt(semesterResult.total_credits_earned) || 0,
        status: semesterResult.semester_status,
        coursesRegistered: parseInt(semesterResult.courses_registered) || 0,
        coursesPassed: parseInt(semesterResult.courses_passed) || 0,
        coursesFailed: parseInt(semesterResult.courses_failed) || 0,
        resultDate: semesterResult.result_date,
        courses
      };

    } catch (error) {
      console.error('Error in getSemesterDetails:', error);
      throw error;
    }
  }

  /**
   * Get progression summary for all students in a course
   * Used by teachers to see class performance
   * @param {UUID} courseId - Course ID
   * @returns {Array} Array of student progression summaries
   */
  async getCourseStudentsProgression(courseId) {
    try {
      console.log(`\n=== FETCHING COURSE STUDENTS PROGRESSION ===`);
      console.log(`Course ID: ${courseId}`);

      // Get course details
      const courseQuery = await pool.query(
        'SELECT code, name, semester, year FROM courses WHERE id = $1',
        [courseId]
      );

      if (courseQuery.rows.length === 0) {
        throw new Error('Course not found');
      }

      const course = courseQuery.rows[0];

      // Get all students enrolled in this course
      const studentsQuery = `
        SELECT
          u.id,
          u.usn,
          u.name,
          u.department,
          sc.cgpa,
          sc.current_semester,
          sfg.final_percentage,
          sfg.letter_grade,
          sfg.grade_points
        FROM users u
        JOIN students_courses sco ON u.id = sco.student_id
        LEFT JOIN student_cgpa sc ON u.id = sc.student_id
        LEFT JOIN student_final_grades sfg ON u.id = sfg.student_id AND sco.course_id = sfg.course_id
        WHERE sco.course_id = $1 AND u.role = 'student'
        ORDER BY u.usn ASC
      `;

      const studentsResult = await pool.query(studentsQuery, [courseId]);
      const students = studentsResult.rows;

      console.log(`Found ${students.length} students in course ${course.code}`);

      const progressionSummaries = students.map(student => ({
        studentId: student.id,
        usn: student.usn,
        name: student.name,
        department: student.department,
        cgpa: parseFloat(student.cgpa) || 0,
        currentSemester: parseInt(student.current_semester) || 1,
        coursePerformance: {
          percentage: parseFloat(student.final_percentage) || null,
          grade: student.letter_grade || null,
          gradePoints: parseFloat(student.grade_points) || null
        }
      }));

      return {
        course: {
          id: courseId,
          code: course.code,
          name: course.name,
          semester: course.semester,
          year: course.year
        },
        totalStudents: students.length,
        students: progressionSummaries
      };

    } catch (error) {
      console.error('Error in getCourseStudentsProgression:', error);
      throw error;
    }
  }

  /**
   * Get semester-wise statistics for a department
   * @param {Number} semester - Semester number
   * @param {String} department - Department name
   * @returns {Object} Aggregate statistics
   */
  async getSemesterStatistics(semester, department) {
    try {
      const query = `
        SELECT
          COUNT(*) as total_students,
          AVG(sr.sgpa) as avg_sgpa,
          MAX(sr.sgpa) as max_sgpa,
          MIN(sr.sgpa) as min_sgpa,
          SUM(sr.courses_passed) as total_courses_passed,
          SUM(sr.courses_failed) as total_courses_failed,
          AVG(sr.total_credits_earned) as avg_credits_earned
        FROM semester_results sr
        JOIN users u ON sr.student_id = u.id
        WHERE sr.semester = $1
          AND u.department = $2
          AND sr.semester_status = 'completed'
      `;

      const result = await pool.query(query, [semester, department]);
      const stats = result.rows[0];

      // Get grade distribution for this semester
      const gradeDistQuery = `
        SELECT
          sfg.letter_grade,
          COUNT(*) as count
        FROM student_final_grades sfg
        JOIN courses c ON sfg.course_id = c.id
        JOIN users u ON sfg.student_id = u.id
        WHERE c.semester = $1
          AND u.department = $2
        GROUP BY sfg.letter_grade
        ORDER BY
          CASE sfg.letter_grade
            WHEN 'A+' THEN 1 WHEN 'A' THEN 2 WHEN 'B+' THEN 3
            WHEN 'B' THEN 4 WHEN 'C+' THEN 5 WHEN 'C' THEN 6
            WHEN 'D' THEN 7 WHEN 'E' THEN 8 WHEN 'F' THEN 9
          END
      `;

      const gradeDistResult = await pool.query(gradeDistQuery, [semester, department]);

      const totalStudents = parseInt(stats.total_students) || 0;
      const passCount = totalStudents > 0
        ? totalStudents - (parseInt(stats.total_courses_failed) || 0)
        : 0;
      const passPercentage = totalStudents > 0
        ? (passCount / totalStudents) * 100
        : 0;

      return {
        semester,
        department,
        totalStudents,
        avgSGPA: parseFloat(stats.avg_sgpa) || 0,
        maxSGPA: parseFloat(stats.max_sgpa) || 0,
        minSGPA: parseFloat(stats.min_sgpa) || 0,
        totalCoursesPassed: parseInt(stats.total_courses_passed) || 0,
        totalCoursesFailed: parseInt(stats.total_courses_failed) || 0,
        avgCreditsEarned: parseFloat(stats.avg_credits_earned) || 0,
        passPercentage: Math.round(passPercentage * 100) / 100,
        gradeDistribution: gradeDistResult.rows
      };

    } catch (error) {
      console.error('Error in getSemesterStatistics:', error);
      throw error;
    }
  }

  /**
   * Get top performers by CGPA
   * @param {String} department - Department name (optional)
   * @param {Number} limit - Number of top students to return
   * @returns {Array} Top performers
   */
  async getTopPerformers(department = null, limit = 10) {
    try {
      let query = `
        SELECT
          u.id,
          u.usn,
          u.name,
          u.department,
          sc.cgpa,
          sc.current_semester,
          sc.total_credits_completed,
          sc.semesters_completed
        FROM student_cgpa sc
        JOIN users u ON sc.student_id = u.id
        WHERE sc.cgpa > 0
      `;

      const params = [];

      if (department) {
        query += ' AND u.department = $1';
        params.push(department);
      }

      query += ` ORDER BY sc.cgpa DESC, sc.total_credits_completed DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await pool.query(query, params);

      return result.rows.map((row, index) => ({
        rank: index + 1,
        studentId: row.id,
        usn: row.usn,
        name: row.name,
        department: row.department,
        cgpa: parseFloat(row.cgpa),
        currentSemester: parseInt(row.current_semester),
        totalCredits: parseInt(row.total_credits_completed),
        semestersCompleted: parseInt(row.semesters_completed)
      }));

    } catch (error) {
      console.error('Error in getTopPerformers:', error);
      throw error;
    }
  }
}

export default new SemesterProgressionService();
