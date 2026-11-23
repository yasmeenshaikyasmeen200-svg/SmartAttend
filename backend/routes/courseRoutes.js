const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

// ---------- ROLE CONSTANTS (must match all other route files) ----------
const ROLES = {
  SMARTATTEND_ADMIN: 'smartattend_admin',
  COLLEGE_ADMIN: 'college_admin',
  FACULTY: 'faculty',
  STUDENT: 'student'
};

const COURSE_CODE_REGEX = /^[A-Z0-9_-]{2,20}$/;

// ---------- MIDDLEWARE: college-admin-only ----------
const isCollegeAdmin = (req, res, next) => {
  if (req.user.role !== ROLES.COLLEGE_ADMIN || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only College Admins can manage courses.'
    });
  }
  next();
};

// ---------- VALIDATOR ----------
function validateCourseBody(body) {
  const { course_name, course_code, duration_years } = body;

  if (typeof course_name !== 'string' || !course_name.trim()) {
    return { error: 'course_name is required.' };
  }

  if (typeof course_code !== 'string' || !course_code.trim()) {
    return { error: 'course_code is required.' };
  }

  const cleanCode = course_code.trim().toUpperCase();
  if (!COURSE_CODE_REGEX.test(cleanCode)) {
    return { error: 'course_code must be 2-20 chars: uppercase letters, digits, _ or -.' };
  }

  if (!Number.isInteger(duration_years) || duration_years < 1 || duration_years > 10) {
    return { error: 'duration_years must be an integer between 1 and 10.' };
  }

  return {
    data: {
      course_name: course_name.trim(),
      course_code: cleanCode,
      duration_years
    }
  };
}

// =====================================================
// ADD COURSE
// =====================================================
router.post('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const { department_id } = req.body;

    const deptIdNum = parseInt(department_id, 10);
    if (!Number.isInteger(deptIdNum) || deptIdNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid department_id.'
      });
    }

    const check = validateCourseBody(req.body);
    if (check.error) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const d = check.data;

    // Verify department belongs to this college
    const department = await pool.query(
      `SELECT department_id FROM departments
       WHERE department_id = $1 AND college_id = $2`,
      [deptIdNum, req.user.college_id]
    );

    if (department.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Department not found in your college.'
      });
    }

    const result = await pool.query(
      `INSERT INTO courses
       (department_id, course_name, course_code, duration_years)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [deptIdNum, d.course_name, d.course_code, d.duration_years]
    );

    return res.status(201).json({
      success: true,
      message: 'Course added successfully!',
      course: result.rows[0]
    });

  } catch (error) {
    console.error('Add course error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Course code already exists in this department.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error adding course.'
    });
  }
});

// =====================================================
// VIEW COURSES  (?department_id= optional filter)
// =====================================================
router.get('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const { department_id } = req.query;
    const params = [req.user.college_id];
    let where = `WHERE d.college_id = $1`;

    if (department_id) {
      const depId = parseInt(department_id, 10);
      if (!Number.isInteger(depId) || depId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid department_id filter.'
        });
      }
      params.push(depId);
      where += ` AND c.department_id = $2`;
    }

    const result = await pool.query(
      `SELECT c.*, d.department_name
       FROM courses c
       JOIN departments d ON c.department_id = d.department_id
       ${where}
       ORDER BY c.course_id`,
      params
    );

    return res.json({
      success: true,
      total: result.rows.length,
      courses: result.rows
    });

  } catch (error) {
    console.error('List courses error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching courses.'
    });
  }
});

// =====================================================
// VIEW ONE COURSE
// =====================================================
router.get('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    const result = await pool.query(
      `SELECT c.*, d.department_name
       FROM courses c
       JOIN departments d ON c.department_id = d.department_id
       WHERE c.course_id = $1 AND d.college_id = $2`,
      [id, req.user.college_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Course not found in your college.'
      });
    }

    return res.json({ success: true, course: result.rows[0] });

  } catch (error) {
    console.error('Get course error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching course.'
    });
  }
});

// =====================================================
// UPDATE COURSE
// =====================================================
router.put('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    const check = validateCourseBody(req.body);
    if (check.error) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const d = check.data;

    const result = await pool.query(
      `UPDATE courses c
       SET course_name     = $1,
           course_code     = $2,
           duration_years  = $3
       FROM departments dep
       WHERE c.course_id     = $4
         AND c.department_id = dep.department_id
         AND dep.college_id  = $5
       RETURNING c.course_id, c.department_id, c.course_name,
                 c.course_code, c.duration_years,
                 dep.department_name`,
      [d.course_name, d.course_code, d.duration_years, id, req.user.college_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found in your college.'
      });
    }

    return res.json({
      success: true,
      message: 'Course updated successfully!',
      course: result.rows[0]
    });

  } catch (error) {
    console.error('Update course error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Course code already exists in this department.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error updating course.'
    });
  }
});

// =====================================================
// DELETE COURSE
// =====================================================
router.delete('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid course ID.' });
    }

    const result = await pool.query(
      `DELETE FROM courses c
       USING departments d
       WHERE c.course_id     = $1
         AND c.department_id = d.department_id
         AND d.college_id    = $2
       RETURNING c.*`,
      [id, req.user.college_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Course not found in your college.'
      });
    }

    return res.json({
      success: true,
      message: 'Course deleted successfully!'
    });

  } catch (error) {
    console.error('Delete course error:', error);

    if (error.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete: students, timetables, or sessions reference this course.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error deleting course.'
    });
  }
});

module.exports = router;