import { query } from '../config/db.js';

import { find,findMany } from '../config/mongodb.js'; 

// recentActivity = await find(
//   'teacher_activity_log',
//   { teacher_id: teacherId },
//   { sort: { timestamp: -1 }, limit: 5 }
// );

/**
 * Create a new course (Teacher only)
 */


// export const createCourse = async (req, res) => {
//   try {
//     const teacherId = req.user.id;
//     const { code, name, description, semester, year, credits } = req.body;

//     if (!code || !name || !semester || !year) {
//       return res.status(400).json({
//         success: false,
//         message: 'Code, name, semester, and year are required'
//       });
//     }

//     // Check if course code already exists
//     const existing = await query('SELECT id FROM courses WHERE code = $1', [code]);
//     if (existing.rows.length > 0) {
//       return res.status(409).json({
//         success: false,
//         message: 'Course code already exists'
//       });
//     }

//     const result = await query(
//       `INSERT INTO courses (code, name, description, semester, year, credits, teacher_id)
//        VALUES ($1, $2, $3, $4, $5, $6, $7)
//        RETURNING *`,
//       [code, name, description, semester, year, credits || 3, teacherId]
//     );

//     res.status(201).json({
//       success: true,
//       message: 'Course created successfully',
//       data: result.rows[0]
//     });
//   } catch (error) {
//     console.error('Create course error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to create course',
//       error: error.message
//     });
//   }
// };

export const createCourse = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    const userRole = req.user?.role;

    // Only teachers may create courses
    if (userRole !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Only teachers can create courses' });
    }

    // ensure teacher exists in users table
    const teacherCheck = await query('SELECT id FROM users WHERE id = $1 AND role = $2', [teacherId, 'teacher']);
    if (teacherCheck.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Invalid or missing teacher account' });
    }

    const { code, name, description, semester, year, credits, course_type } = req.body;
    if (!code || !name || !semester || !year) {
      return res.status(400).json({
        success: false,
        message: 'Code, name, semester, and year are required'
      });
    }

    const validTypes = ['STANDALONE_THEORY', 'STANDALONE_LAB', 'IPCC'];
    const courseType = validTypes.includes(course_type) ? course_type : 'STANDALONE_THEORY';

    // Check if course code already exists
    const existing = await query('SELECT id FROM courses WHERE code = $1', [code]);
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Course code already exists'
      });
    }

    const result = await query(
      `INSERT INTO courses (code, name, description, semester, year, credits, teacher_id, course_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [code, name, description || null, semester, year, credits || 3, teacherId, courseType]
    );

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create course',
      error: error.message
    });
  }
};
/**
 * Get all courses (with optional filters)
 */
export const getCourses = async (req, res) => {
  try {
    const { semester, year, teacherId } = req.query;
    const userRole = req.user.role;
    const userId = req.user.id;

    let queryText = `
      SELECT c.*, u.name as teacher_name
      FROM courses c
      LEFT JOIN users u ON c.teacher_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    // If student, only show enrolled courses
    if (userRole === 'student') {
      queryText += ` AND c.id IN (
        SELECT course_id FROM students_courses WHERE student_id = $${paramCount}
      )`;
      params.push(userId);
      paramCount++;
    }

    // If teacher and no teacherId specified, show only their courses
    if (userRole === 'teacher' && !teacherId) {
      queryText += ` AND c.teacher_id = $${paramCount}`;
      params.push(userId);
      paramCount++;
    }

    if (semester) {
      queryText += ` AND c.semester = $${paramCount}`;
      params.push(semester);
      paramCount++;
    }

    if (year) {
      queryText += ` AND c.year = $${paramCount}`;
      params.push(year);
      paramCount++;
    }

    if (teacherId) {
      queryText += ` AND c.teacher_id = $${paramCount}`;
      params.push(teacherId);
      paramCount++;
    }

    queryText += ' ORDER BY c.year DESC, c.semester DESC, c.code';

    const result = await query(queryText, params);

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get courses',
      error: error.message
    });
  }
};

/**
 * Get single course by ID
 */
export const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT c.*, u.name as teacher_name, u.email as teacher_email
       FROM courses c
       LEFT JOIN users u ON c.teacher_id = u.id
       WHERE c.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Get course outcomes
    const cosResult = await query(
      'SELECT * FROM course_outcomes WHERE course_id = $1 ORDER BY co_number',
      [id]
    );

    // Get enrolled students count
    const enrollmentResult = await query(
      'SELECT COUNT(*) as student_count FROM students_courses WHERE course_id = $1',
      [id]
    );

    const course = result.rows[0];
    course.course_outcomes = cosResult.rows;
    course.enrolled_students = parseInt(enrollmentResult.rows[0].student_count);

    res.json({
      success: true,
      data: course
    });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get course',
      error: error.message
    });
  }
};

/**
 * Update course (Teacher only - own courses)
 */
export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;
    const { name, description, semester, year, credits, course_type } = req.body;

    // Check if course exists and belongs to teacher
    const courseCheck = await query(
      'SELECT id FROM courses WHERE id = $1 AND teacher_id = $2',
      [id, teacherId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or access denied'
      });
    }

    const validTypes = ['STANDALONE_THEORY', 'STANDALONE_LAB', 'IPCC'];
    const courseType = validTypes.includes(course_type) ? course_type : null;

    const result = await query(
      `UPDATE courses
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           semester = COALESCE($3, semester),
           year = COALESCE($4, year),
           credits = COALESCE($5, credits),
           course_type = COALESCE($6, course_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [name, description, semester, year, credits, courseType, id]
    );

    res.json({
      success: true,
      message: 'Course updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update course',
      error: error.message
    });
  }
};

/**
 * Delete course (Teacher only - own courses)
 */
export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;

    const result = await query(
      'DELETE FROM courses WHERE id = $1 AND teacher_id = $2 RETURNING id',
      [id, teacherId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or access denied'
      });
    }

    res.json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete course',
      error: error.message
    });
  }
};

/**
 * Enroll students in a course (Teacher only)
 */
export const enrollStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentIds } = req.body; // Array of student IDs
    const teacherId = req.user.id;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Student IDs array is required'
      });
    }

    // Verify course belongs to teacher
    const courseCheck = await query(
      'SELECT id FROM courses WHERE id = $1 AND teacher_id = $2',
      [id, teacherId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or access denied'
      });
    }

    // Enroll students
    const enrolled = [];
    const errors = [];

    for (const studentId of studentIds) {
      try {
        await query(
          'INSERT INTO students_courses (student_id, course_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [studentId, id]
        );
        enrolled.push(studentId);
      } catch (error) {
        errors.push({ studentId, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Enrolled ${enrolled.length} students`,
      data: {
        enrolled: enrolled.length,
        errors: errors.length,
        errorDetails: errors
      }
    });
  } catch (error) {
    console.error('Enroll students error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to enroll students',
      error: error.message
    });
  }
};

/**
 * Get enrolled students for a course
 */
export const getEnrolledStudents = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT u.id, u.name, u.email, u.usn, u.department, sc.enrollment_date, sc.status
       FROM users u
       JOIN students_courses sc ON u.id = sc.student_id
       WHERE sc.course_id = $1 AND u.role = 'student'
       ORDER BY u.usn`,
      [id]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get enrolled students error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get enrolled students',
      error: error.message
    });
  }
};


export const getTeacherDashboard = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: teacher ID missing'
      });
    }

    // === Fetch aggregate stats from Postgres ===
    const [courses, students, assessments] = await Promise.all([
      query('SELECT COUNT(*) FROM courses WHERE teacher_id = $1', [teacherId]),
      query(`
        SELECT COUNT(DISTINCT sc.student_id)
        FROM students_courses sc
        JOIN courses c ON sc.course_id = c.id
        WHERE c.teacher_id = $1
      `, [teacherId]),
      query(`
        SELECT COUNT(a.*)
        FROM assessments a
        JOIN courses c ON a.course_id = c.id
        WHERE c.teacher_id = $1
      `, [teacherId])
    ]);

    // === Recent activity from MongoDB (if any) ===
    let recentActivity = [];
    try {
      recentActivity = await findMany(
        'teacher_activity_log',
        { teacher_id: teacherId },
        { sort: { timestamp: -1 }, limit: 5 }
      );
    } catch (mongoErr) {
      console.warn('⚠️ Mongo fetch failed (non-critical):', mongoErr.message);
    }

    res.json({
      success: true,
      data: {
        totalCourses: parseInt(courses.rows[0]?.count || 0, 10),
        totalStudents: parseInt(students.rows[0]?.count || 0, 10),
        totalAssessments: parseInt(assessments.rows[0]?.count || 0, 10),
        avgPerformance: 0, // Placeholder until analytics integrated
        recentActivity
      }
    });
  } catch (error) {
    console.error('❌ Teacher dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load teacher dashboard',
      error: error.message
    });
  }
};

/**
 * Get comprehensive analytics for a specific course (Teacher)
 */
export const getCourseAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const teacherId = req.user.id;

    // Verify course belongs to teacher
    const courseCheck = await query(
      'SELECT id, name, code FROM courses WHERE id = $1 AND teacher_id = $2',
      [id, teacherId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or access denied'
      });
    }

    // Get CO attainment data
    const coAttainment = await query(
      `SELECT co.co_number, co.description,
              AVG(ca.attainment_percentage) as avg_attainment,
              MAX(ca.calculated_at) as last_calculated
       FROM course_outcomes co
       LEFT JOIN co_attainment ca ON co.id = ca.co_id
       WHERE co.course_id = $1
       GROUP BY co.id, co.co_number, co.description
       ORDER BY co.co_number`,
      [id]
    );

    // Get PO attainment data
    const poAttainment = await query(
      `SELECT po.po_number, po.description, pa.attainment_level
       FROM program_outcomes po
       LEFT JOIN po_attainment pa ON po.id = pa.po_id AND pa.course_id = $1
       ORDER BY po.po_number`,
      [id]
    );

    // Get student performance distribution
    const performanceDistribution = await query(
      `SELECT
         CASE
           WHEN avg_percentage >= 90 THEN '90-100'
           WHEN avg_percentage >= 80 THEN '80-89'
           WHEN avg_percentage >= 70 THEN '70-79'
           WHEN avg_percentage >= 60 THEN '60-69'
           WHEN avg_percentage >= 50 THEN '50-59'
           ELSE 'Below 50'
         END as grade_range,
         COUNT(*) as student_count
       FROM (
         SELECT ss.student_id,
                AVG(CASE WHEN q.max_marks > 0
                    THEN (ss.marks_obtained / q.max_marks) * 100
                    ELSE 0 END) as avg_percentage
         FROM student_scores ss
         JOIN questions q ON ss.question_id = q.id
         JOIN assessments a ON q.assessment_id = a.id
         WHERE a.course_id = $1
         GROUP BY ss.student_id
       ) as student_averages
       GROUP BY grade_range
       ORDER BY grade_range DESC`,
      [id]
    );

    // Get assessment-wise performance trend
    const assessmentTrend = await query(
      `SELECT a.name, a.assessment_date, a.type,
              AVG(CASE WHEN q.max_marks > 0
                  THEN (ss.marks_obtained / q.max_marks) * 100
                  ELSE 0 END) as avg_percentage
       FROM assessments a
       LEFT JOIN questions q ON a.id = q.assessment_id
       LEFT JOIN student_scores ss ON q.id = ss.question_id
       WHERE a.course_id = $1
       GROUP BY a.id, a.name, a.assessment_date, a.type
       ORDER BY a.assessment_date`,
      [id]
    );

    res.json({
      success: true,
      data: {
        course: courseCheck.rows[0],
        coAttainment: coAttainment.rows,
        poAttainment: poAttainment.rows,
        performanceDistribution: performanceDistribution.rows,
        assessmentTrend: assessmentTrend.rows
      }
    });
  } catch (error) {
    console.error('Get course analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get course analytics',
      error: error.message
    });
  }
};

/**
 * Get recent student enrollments for teacher's courses
 */
export const getTeacherEnrollments = async (req, res) => {
  try {
    const teacherId = req.user?.id;
    if (!teacherId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: teacher ID missing'
      });
    }

    // Get recent enrollments from teacher's courses
    const enrollments = await query(
      `SELECT
         sc.enrollment_date,
         sc.status,
         u.id as student_id,
         u.name as student_name,
         u.email as student_email,
         u.usn,
         u.department,
         c.id as course_id,
         c.code as course_code,
         c.name as course_name,
         c.semester
       FROM students_courses sc
       JOIN users u ON sc.student_id = u.id
       JOIN courses c ON sc.course_id = c.id
       WHERE c.teacher_id = $1
       ORDER BY sc.enrollment_date DESC
       LIMIT 10`,
      [teacherId]
    );

    res.json({
      success: true,
      count: enrollments.rows.length,
      data: enrollments.rows
    });
  } catch (error) {
    console.error('Get teacher enrollments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get enrollments',
      error: error.message
    });
  }
};

/**
 * Create or get course for CO Generator
 * This endpoint checks if a course exists by code, creates it if not, and returns the course
 */
export const createOrGetCourse = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { course_code, course_name, semester, year, department } = req.body;

    if (!course_code || !course_name) {
      return res.status(400).json({
        success: false,
        message: 'Course code and name are required'
      });
    }

    // Check if course already exists by code
    const existing = await query(
      'SELECT * FROM courses WHERE code = $1',
      [course_code]
    );

    if (existing.rows.length > 0) {
      // Course exists, return it
      const course = existing.rows[0];

      // Optionally update teacher_id if not set
      if (!course.teacher_id) {
        await query(
          'UPDATE courses SET teacher_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [teacherId, course.id]
        );
        course.teacher_id = teacherId;
      }

      return res.json({
        success: true,
        message: 'Course already exists',
        data: course,
        created: false
      });
    }

    // Course doesn't exist, create it
    const result = await query(
      `INSERT INTO courses (code, name, semester, year, department, teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        course_code,
        course_name,
        semester || 1,
        year || new Date().getFullYear(),
        department || 'General',
        teacherId
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: result.rows[0],
      created: true
    });
  } catch (error) {
    console.error('Create or get course error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create or get course',
      error: error.message
    });
  }
};

/**
 * Get teacher's courses for CO Generator (simplified)
 */
export const getTeacherCourses = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const result = await query(
      `SELECT id, code, name, semester, year, department, created_at
       FROM courses
       WHERE teacher_id = $1
       ORDER BY created_at DESC`,
      [teacherId]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get teacher courses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get courses',
      error: error.message
    });
  }
};

/**
 * Save course outcomes for a course
 * Replaces existing COs or creates new ones
 */
export const saveCourseOutcomes = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { course_outcomes } = req.body;
    const teacherId = req.user.id;

    if (!course_outcomes || !Array.isArray(course_outcomes)) {
      return res.status(400).json({
        success: false,
        message: 'course_outcomes array is required'
      });
    }

    // Verify course belongs to teacher
    const courseCheck = await query(
      'SELECT id FROM courses WHERE id = $1 AND teacher_id = $2',
      [courseId, teacherId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or access denied'
      });
    }

    // Delete existing COs for this course
    await query('DELETE FROM course_outcomes WHERE course_id = $1', [courseId]);

    // Insert new COs
    const insertPromises = course_outcomes.map((co, index) => {
      return query(
        `INSERT INTO course_outcomes (course_id, co_number, description, bloom_level)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [courseId, co.co_number || (index + 1), co.co_text || co.description, co.bloom_level || 'Apply']
      );
    });

    const results = await Promise.all(insertPromises);
    const savedCOs = results.map(r => r.rows[0]);

    res.json({
      success: true,
      message: `Saved ${savedCOs.length} course outcomes`,
      data: savedCOs
    });
  } catch (error) {
    console.error('Save course outcomes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save course outcomes',
      error: error.message
    });
  }
};

/**
 * Get course outcomes for a course
 */
export const getCourseOutcomes = async (req, res) => {
  try {
    const { courseId } = req.params;

    const result = await query(
      `SELECT * FROM course_outcomes
       WHERE course_id = $1
       ORDER BY co_number`,
      [courseId]
    );

    res.json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Get course outcomes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get course outcomes',
      error: error.message
    });
  }
};