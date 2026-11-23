
const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const signToken = require('../utils/jwt');
const authMiddleware = require('../middleware/authMiddleware');

// ---------- ROLE CONSTANTS (must match all other route files) ----------
const ROLES = {
  SMARTATTEND_ADMIN: 'smartattend_admin',
  COLLEGE_ADMIN: 'college_admin',
  FACULTY: 'faculty',
  STUDENT: 'student'
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =====================================================
// COLLEGE ADMIN REGISTRATION
// =====================================================
router.post('/register', async (req, res) => {
  try {
    const { college_id, full_name, email, password } = req.body;

    // --- type checks ---
    if (
      typeof full_name !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !full_name.trim() ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required details.'
      });
    }

    // --- college_id must be a positive integer ---
    const collegeIdNum = parseInt(college_id, 10);
    if (!Number.isInteger(collegeIdNum) || collegeIdNum <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid college ID.'
      });
    }

    // --- email format ---
    const cleanName  = full_name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    // --- password length ---
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least 8 characters.'
      });
    }

    // --- college must exist AND be approved ---
    const college = await pool.query(
      `SELECT college_id, approval_status
       FROM colleges
       WHERE college_id = $1`,
      [collegeIdNum]
    );

    if (college.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'College not found.'
      });
    }

    if (college.rows[0].approval_status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'College must be approved before registration.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO college_admins
       (college_id, full_name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING college_admin_id, college_id,
                 full_name, email, created_at`,
      [collegeIdNum, cleanName, cleanEmail, passwordHash]
    );

    return res.status(201).json({
      success: true,
      message: 'College Admin registered successfully!',
      admin: result.rows[0]
    });

  } catch (error) {
    console.error('College Admin registration error:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'Email is already registered.'
      });
    }

    if (error.code === '42703') {
      return res.status(500).json({
        success: false,
        message: 'DB schema missing column. Check college_admins table (created_at?).'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Server error during registration.'
    });
  }
});

// =====================================================
// COLLEGE ADMIN LOGIN
// =====================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please enter email and password.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT ca.college_admin_id, ca.college_id,
              ca.full_name, ca.email, ca.password_hash,
              c.approval_status
       FROM college_admins ca
       JOIN colleges c ON c.college_id = ca.college_id
       WHERE LOWER(ca.email) = $1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const admin = result.rows[0];

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    if (admin.approval_status !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your college is not currently approved.'
      });
    }

    const token = signToken({
      college_admin_id: admin.college_admin_id,
      college_id: admin.college_id,
      email: admin.email,
      role: ROLES.COLLEGE_ADMIN
    });

    return res.json({
      success: true,
      message: 'College Admin login successful!',
      token,
      token_type: 'Bearer',
      expires_in: '7d',
      admin: {
        college_admin_id: admin.college_admin_id,
        college_id: admin.college_id,
        full_name: admin.full_name,
        email: admin.email
      }
    });

  } catch (error) {
    console.error('College Admin login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during login.'
    });
  }
});

// =====================================================
// PROTECTED COLLEGE ADMIN DASHBOARD
// =====================================================
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    if (
      req.user.role !== ROLES.COLLEGE_ADMIN ||
      !req.user.college_admin_id ||
      !req.user.college_id
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only College Admins can access this dashboard.'
      });
    }

    const result = await pool.query(
      `SELECT ca.college_admin_id, ca.college_id,
              ca.full_name, ca.email, ca.created_at,
              c.college_name, c.approval_status
       FROM college_admins ca
       JOIN colleges c ON c.college_id = ca.college_id
       WHERE ca.college_admin_id = $1
         AND ca.college_id = $2`,
      [req.user.college_admin_id, req.user.college_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'College Admin account not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Welcome to College Admin Dashboard!',
      admin: result.rows[0]
    });

  } catch (error) {
    console.error('College Admin dashboard error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not load college admin dashboard.'
    });
  }
});

module.exports = router;