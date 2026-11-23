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

const CODE_REGEX = /^[A-Z0-9_-]{2,20}$/;

// ---------- MIDDLEWARE: college-admin-only ----------
const isCollegeAdmin = (req, res, next) => {
  if (req.user.role !== ROLES.COLLEGE_ADMIN || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only College Admins can manage departments.'
    });
  }
  next();
};

// ---------- VALIDATOR ----------
function validateDepartmentBody(body) {
  const { department_name, department_code } = body;

  if (typeof department_name !== 'string' || !department_name.trim()) {
    return { error: 'department_name is required.' };
  }

  if (typeof department_code !== 'string' || !department_code.trim()) {
    return { error: 'department_code is required.' };
  }

  const cleanCode = department_code.trim().toUpperCase();
  if (!CODE_REGEX.test(cleanCode)) {
    return { error: 'department_code must be 2-20 chars: uppercase letters, digits, _ or -.' };
  }

  return {
    data: {
      department_name: department_name.trim(),
      department_code: cleanCode
    }
  };
}

// =====================================================
// ADD DEPARTMENT
// =====================================================
router.post('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const check = validateDepartmentBody(req.body);
    if (check.error) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const d = check.data;

    const result = await pool.query(
      `INSERT INTO departments
       (college_id, department_name, department_code)
       VALUES ($1, $2, $3)
       RETURNING department_id, college_id, department_name,
                 department_code, created_at`,
      [req.user.college_id, d.department_name, d.department_code]
    );

    return res.status(201).json({
      success: true,
      message: 'Department added successfully!',
      department: result.rows[0]
    });

  } catch (error) {
    console.error('Add department error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Department code already exists in your college.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error adding department.'
    });
  }
});

// =====================================================
// GET ALL DEPARTMENTS OF LOGGED-IN COLLEGE
// =====================================================
router.get('/', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT department_id, college_id, department_name,
              department_code, created_at
       FROM departments
       WHERE college_id = $1
       ORDER BY department_id`,
      [req.user.college_id]
    );

    return res.json({
      success: true,
      total: result.rows.length,
      departments: result.rows
    });

  } catch (error) {
    console.error('List departments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching departments.'
    });
  }
});

// =====================================================
// GET ONE DEPARTMENT
// =====================================================
router.get('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid department ID.' });
    }

    const result = await pool.query(
      `SELECT department_id, college_id, department_name,
              department_code, created_at
       FROM departments
       WHERE department_id = $1 AND college_id = $2`,
      [id, req.user.college_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Department not found in your college.'
      });
    }

    return res.json({ success: true, department: result.rows[0] });

  } catch (error) {
    console.error('Get department error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching department.'
    });
  }
});

// =====================================================
// UPDATE DEPARTMENT
// =====================================================
router.put('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid department ID.' });
    }

    const check = validateDepartmentBody(req.body);
    if (check.error) {
      return res.status(400).json({ success: false, message: check.error });
    }

    const d = check.data;

    const result = await pool.query(
      `UPDATE departments
       SET department_name = $1,
           department_code = $2,
           updated_at      = CURRENT_TIMESTAMP
       WHERE department_id = $3 AND college_id = $4
       RETURNING department_id, college_id, department_name,
                 department_code, updated_at`,
      [d.department_name, d.department_code, id, req.user.college_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Department not found in your college.'
      });
    }

    return res.json({
      success: true,
      message: 'Department updated successfully!',
      department: result.rows[0]
    });

  } catch (error) {
    console.error('Update department error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Department code already exists in your college.'
      });
    }

    if (error.code === '42703') {
      return res.status(500).json({
        success: false,
        message: 'DB schema missing column. Does departments have updated_at?'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error updating department.'
    });
  }
});

// =====================================================
// DELETE DEPARTMENT
// =====================================================
router.delete('/:id', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ success: false, message: 'Invalid department ID.' });
    }

    const result = await pool.query(
      `DELETE FROM departments
       WHERE department_id = $1 AND college_id = $2
       RETURNING department_id, department_name, department_code`,
      [id, req.user.college_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Department not found in your college.'
      });
    }

    return res.json({
      success: true,
      message: 'Department deleted successfully!',
      department: result.rows[0]
    });

  } catch (error) {
    console.error('Delete department error:', error);

    if (error.code === '23503') {
      return res.status(409).json({
        success: false,
        message: 'Cannot delete: courses, faculty, students, or timetables reference this department.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Error deleting department.'
    });
  }
});

module.exports = router;