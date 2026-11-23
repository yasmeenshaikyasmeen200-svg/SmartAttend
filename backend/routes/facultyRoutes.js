const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const authMiddleware = require('../middleware/authMiddleware');
const signToken = require('../utils/jwt');

const ROLES = { COLLEGE_ADMIN: 'college_admin', FACULTY: 'faculty' };

const isCollegeAdmin = (req, res, next) => {
  if (req.user.role !== ROLES.COLLEGE_ADMIN || !req.user.college_id) {
    return res.status(403).json({ success: false, message: 'Only College Admins can do this.' });
  }
  next();
};

// =====================================================
// REGISTER FACULTY
// =====================================================
router.post('/register', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const { full_name, email, password, department_id, designation } = req.body;

    if (!full_name || !email || !password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Name, email, and password (min 8 chars) required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate a random 5-digit verification code
    const verificationCode = Math.floor(10000 + Math.random() * 90000).toString();

    const result = await pool.query(
      `INSERT INTO faculty (college_id, department_id, full_name, email, password_hash, designation, verification_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING faculty_id, full_name, email, verification_code`,
      [req.user.college_id, department_id || null, full_name.trim(), cleanEmail, passwordHash, designation || null, verificationCode]
    );

    return res.status(201).json({
      success: true,
      message: 'Faculty registered! Give them their 5-digit code.',
      faculty: result.rows[0] // This contains the verification_code!
    });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Email already exists.' });
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// =====================================================
// FACULTY LOGIN (Device Lock + 5-Digit Code)
// =====================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password, device_id, verification_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT f.*, c.approval_status FROM faculty f
       JOIN colleges c ON c.college_id = f.college_id
       WHERE LOWER(f.email) = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const faculty = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, faculty.password_hash);
    if (!passwordMatch) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    if (faculty.approval_status !== 'approved') return res.status(403).json({ success: false, message: 'College not approved.' });

    // DEVICE LOCK CHECK
    if (faculty.device_id && faculty.device_id !== device_id) {
      return res.status(403).json({ success: false, message: 'Account locked to another phone. Contact Admin.' });
    }

    // 5-DIGIT CODE CHECK
    if (!verification_code) {
      return res.status(400).json({ success: false, message: 'REQUIRE_2FA' }); // Trigger UI prompt
    }

    if (verification_code !== faculty.verification_code) {
      return res.status(401).json({ success: false, message: 'Invalid 5-digit code.' });
    }

    // SUCCESS: Lock device if new
    if (!faculty.device_id) {
      await pool.query(`UPDATE faculty SET device_id = $1 WHERE faculty_id = $2`, [device_id, faculty.faculty_id]);
    }

    const token = signToken({ faculty_id: faculty.faculty_id, college_id: faculty.college_id, email: faculty.email, role: ROLES.FACULTY });

    return res.json({ success: true, message: 'Login successful!', token, faculty: { faculty_id: faculty.faculty_id, full_name: faculty.full_name } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// =====================================================
// FACULTY DASHBOARD
// =====================================================
router.get('/dashboard', authMiddleware, async (req, res) => {
  if (req.user.role !== ROLES.FACULTY) return res.status(403).json({ success: false, message: 'Faculty only.' });
  const result = await pool.query(`SELECT faculty_id, full_name, email FROM faculty WHERE faculty_id = $1`, [req.user.faculty_id]);
  return res.json({ success: true, faculty: result.rows[0] });
});

module.exports = router;