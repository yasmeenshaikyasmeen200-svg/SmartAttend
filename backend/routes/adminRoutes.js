
const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const authMiddleware = require('../middleware/authMiddleware');
const signToken = require('../utils/jwt');

// ---------- ROLE CONSTANTS ----------
// Keep these IDs consistent across ALL route files
const ROLES = {
  SMARTATTEND_ADMIN: 'smartattend_admin',
  COLLEGE_ADMIN: 'college_admin',
  FACULTY: 'faculty',
  STUDENT: 'student'
};

// Simple email format check
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =====================================================
// REGISTER SMARTATTEND ADMIN
// =====================================================
router.post('/register', async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    // --- validate types ---
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
        message: 'Name, email and password are required.'
      });
    }

    // --- validate email format ---
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address.'
      });
    }

    // --- validate password ---
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must contain at least 8 characters.'
      });
    }

    const cleanName = full_name.trim();
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO smartattend_admins
       (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING admin_id, full_name, email, created_at`,
      [cleanName, cleanEmail, passwordHash]
    );

    return res.status(201).json({
      success: true,
      message: 'SmartAttend Admin registered successfully!',
      admin: result.rows[0]
    });

  } catch (error) {
    console.error('Admin registration error:', error);

    // Postgres unique violation
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered.'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Admin registration failed.'
    });
  }
});

// =====================================================
// SMARTATTEND ADMIN LOGIN
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
        message: 'Email and password are required.'
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT admin_id, full_name, email, password_hash
       FROM smartattend_admins
       WHERE LOWER(email) = $1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const admin = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    // Sign token with EXPLICIT role name
    const token = signToken({
      admin_id: admin.admin_id,
      email: admin.email,
      role: ROLES.SMARTATTEND_ADMIN
    });

    return res.json({
      success: true,
      message: 'Admin login successful!',
      token,
      token_type: 'Bearer',
      expires_in: '7d',
      admin: {
        admin_id: admin.admin_id,
        full_name: admin.full_name,
        email: admin.email
      }
    });

  } catch (error) {
    console.error('Admin login error:', error);

    return res.status(500).json({
      success: false,
      message: 'Login failed.'
    });
  }
});

// =====================================================
// PROTECTED SMARTATTEND ADMIN DASHBOARD
// =====================================================
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    // req.user comes from the updated authMiddleware
    if (
      req.user.role !== ROLES.SMARTATTEND_ADMIN ||
      !req.user.admin_id
    ) {
      return res.status(403).json({
        success: false,
        message: 'Only SmartAttend Admin can access this dashboard.'
      });
    }

    const result = await pool.query(
      `SELECT admin_id, full_name, email, created_at
       FROM smartattend_admins
       WHERE admin_id = $1`,
      [req.user.admin_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin account not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Welcome to SmartAttend Admin Dashboard!',
      admin: result.rows[0]
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);

    return res.status(500).json({
      success: false,
      message: 'Could not load admin dashboard.'
    });
  }
});

module.exports = router;