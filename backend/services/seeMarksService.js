import pool from '../config/db.js';

/**
 * SEE Marks Service
 * Handles Semester End Examination marks upload, validation, and management
 */
class SEEMarksService {
  /**
   * Upload SEE marks for multiple students in a course
   * @param {UUID} courseId - Course ID
   * @param {Array} marksData - Array of {usn, see_marks}
   * @param {UUID} uploadedBy - Teacher ID who uploaded
   * @returns {Object} Summary of upload operation
   */
  async uploadSEEMarks(courseId, marksData, uploadedBy) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const results = {
        total: marksData.length,
        uploaded: 0,
        updated: 0,
        failed: 0,
        errors: []
      };

      console.log(`\n=== UPLOADING SEE MARKS FOR COURSE ${courseId} ===`);
      console.log(`Total entries: ${marksData.length}`);

      // Verify course exists
      const courseCheck = await client.query(
        'SELECT id, code, name FROM courses WHERE id = $1',
        [courseId]
      );

      if (courseCheck.rows.length === 0) {
        throw new Error(`Course not found: ${courseId}`);
      }

      console.log(`Course: ${courseCheck.rows[0].code} - ${courseCheck.rows[0].name}`);

      for (const entry of marksData) {
        try {
          const { usn, see_marks, see_grade } = entry;

          // Validate data
          if (!usn || see_marks === null || see_marks === undefined) {
            results.errors.push({
              usn: usn || 'UNKNOWN',
              error: 'Missing USN or SEE marks'
            });
            results.failed++;
            continue;
          }

          // Validate marks range
          const marks = parseFloat(see_marks);
          if (isNaN(marks) || marks < 0 || marks > 100) {
            results.errors.push({
              usn,
              error: `Invalid SEE marks: ${see_marks} (must be 0-100)`
            });
            results.failed++;
            continue;
          }

          // Normalize grade (uppercase, trim) — null if not provided
          const grade = see_grade ? see_grade.toString().trim().toUpperCase() : null;

          // Find student by USN
          const studentQuery = await client.query(
            'SELECT id, name FROM users WHERE UPPER(usn) = UPPER($1) AND role = $2',
            [usn, 'student']
          );

          if (studentQuery.rows.length === 0) {
            results.errors.push({
              usn,
              error: 'Student not found'
            });
            results.failed++;
            continue;
          }

          const studentId = studentQuery.rows[0].id;
          const studentName = studentQuery.rows[0].name;

          // Auto-enroll student if not already in students_courses
          await client.query(
            `INSERT INTO students_courses (student_id, course_id)
             VALUES ($1, $2)
             ON CONFLICT (student_id, course_id) DO NOTHING`,
            [studentId, courseId]
          );

          // Insert or update SEE marks (including grade)
          const upsertQuery = `
            INSERT INTO see_marks (
              student_id, course_id, see_marks_obtained, see_grade, uploaded_by, upload_date
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (student_id, course_id)
            DO UPDATE SET
              see_marks_obtained = EXCLUDED.see_marks_obtained,
              see_grade          = EXCLUDED.see_grade,
              uploaded_by        = EXCLUDED.uploaded_by,
              upload_date        = CURRENT_TIMESTAMP,
              updated_at         = CURRENT_TIMESTAMP
            RETURNING (xmax = 0) AS inserted
          `;

          const result = await client.query(upsertQuery, [
            studentId,
            courseId,
            marks,
            grade,
            uploadedBy
          ]);

          if (result.rows[0].inserted) {
            results.uploaded++;
            console.log(`  ✓ Uploaded SEE marks for ${usn} (${studentName}): ${marks}/100 grade=${grade || '-'}`);
          } else {
            results.updated++;
            console.log(`  ↻ Updated SEE marks for ${usn} (${studentName}): ${marks}/100 grade=${grade || '-'}`);
          }

        } catch (err) {
          console.error(`Error processing ${entry.usn || 'UNKNOWN'}:`, err.message);
          results.errors.push({
            usn: entry.usn || 'UNKNOWN',
            error: err.message
          });
          results.failed++;
        }
      }

      await client.query('COMMIT');

      console.log(`\n✅ SEE MARKS UPLOAD COMPLETE`);
      console.log(`   Uploaded: ${results.uploaded}, Updated: ${results.updated}, Failed: ${results.failed}`);

      return results;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error in uploadSEEMarks:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all SEE marks for a course
   * @param {UUID} courseId - Course ID
   * @returns {Array} Array of student SEE marks
   */
  async getSEEMarksByCourse(courseId) {
    try {
      const query = `
        SELECT
          sm.id,
          sm.student_id,
          u.usn,
          u.name AS student_name,
          sm.see_marks_obtained,
          sm.see_max_marks,
          sm.upload_date,
          sm.remarks,
          uploader.name AS uploaded_by_name
        FROM see_marks sm
        JOIN users u ON sm.student_id = u.id
        LEFT JOIN users uploader ON sm.uploaded_by = uploader.id
        WHERE sm.course_id = $1
        ORDER BY u.usn ASC
      `;

      const result = await pool.query(query, [courseId]);

      console.log(`Retrieved ${result.rows.length} SEE marks for course ${courseId}`);

      return result.rows;

    } catch (error) {
      console.error('Error in getSEEMarksByCourse:', error);
      throw error;
    }
  }

  /**
   * Get SEE marks for a specific student in a course
   * @param {UUID} studentId - Student ID
   * @param {UUID} courseId - Course ID
   * @returns {Object} SEE marks data or null
   */
  async getSEEMarks(studentId, courseId) {
    try {
      const query = `
        SELECT
          sm.id,
          sm.student_id,
          sm.course_id,
          sm.see_marks_obtained,
          sm.see_max_marks,
          sm.upload_date,
          sm.remarks,
          uploader.name AS uploaded_by_name
        FROM see_marks sm
        LEFT JOIN users uploader ON sm.uploaded_by = uploader.id
        WHERE sm.student_id = $1 AND sm.course_id = $2
      `;

      const result = await pool.query(query, [studentId, courseId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];

    } catch (error) {
      console.error('Error in getSEEMarks:', error);
      throw error;
    }
  }

  /**
   * Update SEE marks for a student
   * @param {UUID} studentId - Student ID
   * @param {UUID} courseId - Course ID
   * @param {Number} seeMarks - SEE marks (0-100)
   * @param {UUID} updatedBy - User ID who updated
   * @returns {Object} Updated SEE marks data
   */
  async updateSEEMarks(studentId, courseId, seeMarks, updatedBy) {
    try {
      // Validate marks
      if (seeMarks < 0 || seeMarks > 100) {
        throw new Error('SEE marks must be between 0 and 100');
      }

      const query = `
        UPDATE see_marks
        SET
          see_marks_obtained = $1,
          uploaded_by = $2,
          upload_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE student_id = $3 AND course_id = $4
        RETURNING *
      `;

      const result = await pool.query(query, [seeMarks, updatedBy, studentId, courseId]);

      if (result.rows.length === 0) {
        throw new Error('SEE marks not found for this student-course combination');
      }

      console.log(`Updated SEE marks for student ${studentId} in course ${courseId}: ${seeMarks}/100`);

      return result.rows[0];

    } catch (error) {
      console.error('Error in updateSEEMarks:', error);
      throw error;
    }
  }

  /**
   * Delete SEE marks for a student
   * @param {UUID} studentId - Student ID
   * @param {UUID} courseId - Course ID
   * @returns {Boolean} Success status
   */
  async deleteSEEMarks(studentId, courseId) {
    try {
      const query = 'DELETE FROM see_marks WHERE student_id = $1 AND course_id = $2 RETURNING *';

      const result = await pool.query(query, [studentId, courseId]);

      if (result.rows.length === 0) {
        throw new Error('SEE marks not found');
      }

      console.log(`Deleted SEE marks for student ${studentId} in course ${courseId}`);

      return true;

    } catch (error) {
      console.error('Error in deleteSEEMarks:', error);
      throw error;
    }
  }

  /**
   * Get SEE marks status for a course (how many students have SEE marks uploaded)
   * @param {UUID} courseId - Course ID
   * @returns {Object} Status summary
   */
  async getSEEMarksStatus(courseId) {
    try {
      // Get total enrolled students
      const enrolledQuery = await pool.query(
        'SELECT COUNT(*) as total FROM students_courses WHERE course_id = $1',
        [courseId]
      );

      const totalEnrolled = parseInt(enrolledQuery.rows[0].total);

      // Get students with SEE marks
      const uploadedQuery = await pool.query(
        'SELECT COUNT(*) as total FROM see_marks WHERE course_id = $1',
        [courseId]
      );

      const totalUploaded = parseInt(uploadedQuery.rows[0].total);

      const pendingCount = totalEnrolled - totalUploaded;
      const completionPercentage = totalEnrolled > 0
        ? (totalUploaded / totalEnrolled) * 100
        : 0;

      return {
        totalEnrolled,
        totalUploaded,
        pendingCount,
        completionPercentage: Math.round(completionPercentage * 100) / 100
      };

    } catch (error) {
      console.error('Error in getSEEMarksStatus:', error);
      throw error;
    }
  }

  /**
   * Validate SEE marks data before upload
   * @param {Array} marksData - Array of {usn, see_marks}
   * @returns {Object} Validation results
   */
  validateSEEMarksData(marksData) {
    const validationResults = {
      valid: [],
      invalid: []
    };

    for (const entry of marksData) {
      const errors = [];

      // Check USN
      if (!entry.usn || entry.usn.trim() === '') {
        errors.push('USN is required');
      }

      // Check SEE marks
      if (entry.see_marks === null || entry.see_marks === undefined || entry.see_marks === '') {
        errors.push('SEE marks are required');
      } else {
        const marks = parseFloat(entry.see_marks);
        if (isNaN(marks)) {
          errors.push('SEE marks must be a number');
        } else if (marks < 0 || marks > 100) {
          errors.push('SEE marks must be between 0 and 100');
        }
      }

      // see_grade is optional — if provided, must be a known VTU grade code
      const VALID_GRADES = ['S', 'A', 'A+', 'B', 'B+', 'C', 'D', 'E', 'O', 'P', 'F'];
      if (entry.see_grade !== null && entry.see_grade !== undefined && entry.see_grade !== '') {
        const g = entry.see_grade.toString().trim().toUpperCase();
        if (!VALID_GRADES.includes(g)) {
          errors.push(`Invalid grade: ${entry.see_grade} (expected one of ${VALID_GRADES.join(', ')})`);
        }
      }

      if (errors.length === 0) {
        validationResults.valid.push(entry);
      } else {
        validationResults.invalid.push({
          ...entry,
          errors
        });
      }
    }

    return validationResults;
  }
}

export default new SEEMarksService();
