const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const authMiddleware = require('../middleware/authMiddleware');
const signToken = require('../utils/jwt');

const ROLES = { COLLEGE_ADMIN: 'college_admin', STUDENT: 'student' };

const isCollegeAdmin = (req, res, next) => {
  if (req.user.role !== ROLES.COLLEGE_ADMIN || !req.user.college_id) {
    return res.status(403).json({ success: false, message: 'Only College Admins can do this.' });
  }
  next();
};

// =====================================================
// REGISTER STUDENT
// =====================================================
router.post('/register', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const { department_id, course_id, full_name, roll_number, email, password, admission_year } = req.body;

    if (!full_name || !email || !password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'All fields required. Password min 8 chars.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate a random 5-digit verification code
    const verificationCode = Math.floor(10000 + Math.random() * 90000).toString();

    const result = await pool.query(
      `INSERT INTO students (college_id, department_id, course_id, full_name, roll_number, email, password_hash, admission_year, verification_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING student_id, full_name, email, verification_code`,
      [req.user.college_id, department_id, course_id, full_name.trim(), roll_number, cleanEmail, passwordHash, admission_year || null, verificationCode]
    );

    return res.status(201).json({
      success: true,
      message: 'Student registered! Give them their 5-digit code.',
      student: result.rows[0] // Contains verification_code!
    });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: 'Roll number or email already exists.' });
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// =====================================================
// STUDENT LOGIN (Device Lock + 5-Digit Code)
// =====================================================
router.post('/login', async (req, res) => {
  try {
    const { email, password, device_id, verification_code } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required.' });
    }

    const cleanEmail = email.trim().toLowerCase();

    const result = await pool.query(
      `SELECT s.*, c.approval_status FROM students s
       JOIN colleges c ON c.college_id = s.college_id
       WHERE LOWER(s.email) = $1 LIMIT 1`,
      [cleanEmail]
    );

    if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    const student = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, student.password_hash);
    if (!passwordMatch) return res.status(401).json({ success: false, message: 'Invalid email or password.' });

    if (student.approval_status !== 'approved') return res.status(403).json({ success: false, message: 'College not approved.' });

    // DEVICE LOCK CHECK
    if (student.device_id && student.device_id !== device_id) {
      return res.status(403).json({ success: false, message: 'Account locked to another phone. Contact Admin.' });
    }

    // 5-DIGIT CODE CHECK
    if (!verification_code) {
      return res.status(400).json({ success: false, message: 'REQUIRE_2FA' }); // Trigger UI prompt
    }

    if (verification_code !== student.verification_code) {
      return res.status(401).json({ success: false, message: 'Invalid 5-digit code.' });
    }

    // SUCCESS: Lock device if new
    if (!student.device_id) {
      await pool.query(`UPDATE students SET device_id = $1 WHERE student_id = $2`, [device_id, student.student_id]);
    }

    const token = signToken({ student_id: student.student_id, college_id: student.college_id, email: student.email, role: ROLES.STUDENT });

    return res.json({ success: true, message: 'Login successful!', token, student: { student_id: student.student_id, full_name: student.full_name } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// =====================================================
// STUDENT DASHBOARD
// =====================================================
router.get('/dashboard', authMiddleware, async (req, res) => {
  if (req.user.role !== ROLES.STUDENT) return res.status(403).json({ success: false, message: 'Students only.' });
  const result = await pool.query(`SELECT student_id, full_name, email FROM students WHERE student_id = $1`, [req.user.student_id]);
  return res.json({ success: true, student: result.rows[0] });
});

module.exports = router;