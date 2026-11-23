const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

// ---------- ROLE CONSTANTS ----------
const ROLES = {
  SMARTATTEND_ADMIN: 'smartattend_admin',
  COLLEGE_ADMIN: 'college_admin',
  FACULTY: 'faculty',
  STUDENT: 'student'
};

// ---------- MIDDLEWARE ----------
const isCollegeAdmin = (req, res, next) => {
  if (req.user.role !== ROLES.COLLEGE_ADMIN || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only College Admin can view this report.'
    });
  }
  next();
};

const isFaculty = (req, res, next) => {
  if (req.user.role !== ROLES.FACULTY || !req.user.faculty_id || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only Faculty can view this report.'
    });
  }
  next();
};

const isStudent = (req, res, next) => {
  if (req.user.role !== ROLES.STUDENT || !req.user.student_id || !req.user.college_id) {
    return res.status(403).json({
      success: false,
      message: 'Only Students can view this report.'
    });
  }
  next();
};

// =====================================================
// COLLEGE ADMIN: DAILY ATTENDANCE REPORT
// Fixes: split absent vs pending based on session status
// =====================================================
router.get('/daily', authMiddleware, isCollegeAdmin, async (req, res) => {
  try {
    const { date, status } = req.query;

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format.'
      });
    }

    if (status && !['active', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be active or completed.'
      });
    }

    const statusFilter = status ? `AND a.status = $3` : '';
    const params = [req.user.college_id, date];
    if (status) params.push(status);

    const result = await pool.query(
      `SELECT
         a.session_id,
         a.subject_name,
         a.session_date,
         a.start_time,
         a.status,
         f.full_name AS faculty_name,
         c.classroom_name,
         COUNT(DISTINCT s.student_id)::int AS total_students,

         COUNT(DISTINCT ar.student_id)
           FILTER (WHERE ar.attendance_status = 'present')::int
           AS present_students,

         -- absent only when session is COMPLETED
         CASE
           WHEN a.status = 'completed' THEN (
             COUNT(DISTINCT s.student_id)
             - COUNT(DISTINCT ar.student_id)
                 FILTER (WHERE ar.attendance_status = 'present')
           )::int
           ELSE 0
         END AS absent_students,

         -- pending only when session is ACTIVE
         CASE
           WHEN a.status = 'active' THEN (
             COUNT(DISTINCT s.student_id)
             - COUNT(DISTINCT ar.student_id)
                 FILTER (WHERE ar.attendance_status = 'present')
           )::int
           ELSE 0
         END AS pending_students,

         ROUND(
           100.0 *
           COUNT(DISTINCT ar.student_id)
             FILTER (WHERE ar.attendance_status = 'present')
           / NULLIF(COUNT(DISTINCT s.student_id), 0),
           2
         ) AS attendance_percentage

       FROM attendance_sessions a
       LEFT JOIN faculty f ON f.faculty_id = a.faculty_id
       LEFT JOIN classrooms c ON c.classroom_id = a.classroom_id
       LEFT JOIN students s
         ON s.course_id = a.course_id
        AND s.college_id = a.college_id
       LEFT JOIN attendance_records ar
         ON ar.session_id = a.session_id
        AND ar.student_id = s.student_id
       WHERE a.college_id = $1
         AND a.session_date = COALESCE($2::date, CURRENT_DATE)
         ${statusFilter}
       GROUP BY
         a.session_id, a.subject_name, a.session_date,
         a.start_time, a.status, f.full_name, c.classroom_name
       ORDER BY a.start_time DESC`,
      params
    );

    return res.json({
      success: true,
      date: date || 'today',
      status_filter: status || 'all',
      count: result.rowCount,
      reports: result.rows
    });

  } catch (error) {
    console.error('Daily report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while generating daily report.'
    });
  }
});

// =====================================================
// FACULTY: REPORT FOR THEIR OWN CLASSES
// Fixes: split absent/pending based on status, optional date filter
// =====================================================
router.get('/faculty', authMiddleware, isFaculty, async (req, res) => {
  try {
    const { date, status } = req.query;

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: 'Date must be in YYYY-MM-DD format.'
      });
    }

    if (status && !['active', 'completed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be active or completed.'
      });
    }

    const conditions = [`a.faculty_id = $1`, `a.college_id = $2`];
    const params = [req.user.faculty_id, req.user.college_id];

    if (date) {
      params.push(date);
      conditions.push(`a.session_date = $${params.length}::date`);
    }
    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }

    const result = await pool.query(
      `SELECT
         a.session_id,
         a.subject_name,
         a.session_date,
         a.start_time,
         a.status,
         c.classroom_name,
         COUNT(DISTINCT s.student_id)::int AS total_students,

         COUNT(DISTINCT ar.student_id)
           FILTER (WHERE ar.attendance_status = 'present')::int
           AS present_students,

         CASE
           WHEN a.status = 'completed' THEN (
             COUNT(DISTINCT s.student_id)
             - COUNT(DISTINCT ar.student_id)
                 FILTER (WHERE ar.attendance_status = 'present')
           )::int
           ELSE 0
         END AS absent_students,

         CASE
           WHEN a.status = 'active' THEN (
             COUNT(DISTINCT s.student_id)
             - COUNT(DISTINCT ar.student_id)
                 FILTER (WHERE ar.attendance_status = 'present')
           )::int
           ELSE 0
         END AS pending_students,

         ROUND(
           100.0 *
           COUNT(DISTINCT ar.student_id)
             FILTER (WHERE ar.attendance_status = 'present')
           / NULLIF(COUNT(DISTINCT s.student_id), 0),
           2
         ) AS attendance_percentage

       FROM attendance_sessions a
       LEFT JOIN classrooms c ON c.classroom_id = a.classroom_id
       LEFT JOIN students s
         ON s.course_id = a.course_id
        AND s.college_id = a.college_id
       LEFT JOIN attendance_records ar
         ON ar.session_id = a.session_id
        AND ar.student_id = s.student_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY
         a.session_id, a.subject_name, a.session_date,
         a.start_time, a.status, c.classroom_name
       ORDER BY a.session_date DESC, a.session_id DESC`,
      params
    );

    return res.json({
      success: true,
      count: result.rowCount,
      reports: result.rows
    });

  } catch (error) {
    console.error('Faculty report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while generating faculty report.'
    });
  }
});

// =====================================================
// STUDENT: PERSONAL ATTENDANCE BY SUBJECT + OVERALL
// =====================================================
router.get('/student', authMiddleware, isStudent, async (req, res) => {
  try {
    // Subject-wise breakdown
    const bySubject = await pool.query(
      `SELECT
         a.subject_name,
         COUNT(a.session_id)::int AS total_sessions,
         COUNT(ar.attendance_record_id)
           FILTER (WHERE ar.attendance_status = 'present')::int
           AS present_sessions,
         (
           COUNT(a.session_id)
           - COUNT(ar.attendance_record_id)
               FILTER (WHERE ar.attendance_status = 'present')
         )::int AS absent_sessions,
         ROUND(
           100.0 *
           COUNT(ar.attendance_record_id)
             FILTER (WHERE ar.attendance_status = 'present')
           / NULLIF(COUNT(a.session_id), 0),
           2
         ) AS attendance_percentage
       FROM students s
       JOIN attendance_sessions a
         ON a.course_id = s.course_id
        AND a.college_id = s.college_id
       LEFT JOIN attendance_records ar
         ON ar.session_id = a.session_id
        AND ar.student_id = s.student_id
       WHERE s.student_id = $1
         AND s.college_id = $2
         AND a.status = 'completed'
       GROUP BY a.subject_name
       ORDER BY a.subject_name`,
      [req.user.student_id, req.user.college_id]
    );

    // Overall aggregate
    const overall = await pool.query(
      `SELECT
         COUNT(a.session_id)::int AS total_sessions,
         COUNT(ar.attendance_record_id)
           FILTER (WHERE ar.attendance_status = 'present')::int
           AS present_sessions,
         (
           COUNT(a.session_id)
           - COUNT(ar.attendance_record_id)
               FILTER (WHERE ar.attendance_status = 'present')
         )::int AS absent_sessions,
         ROUND(
           100.0 *
           COUNT(ar.attendance_record_id)
             FILTER (WHERE ar.attendance_status = 'present')
           / NULLIF(COUNT(a.session_id), 0),
           2
         ) AS attendance_percentage
       FROM students s
       JOIN attendance_sessions a
         ON a.course_id = s.course_id
        AND a.college_id = s.college_id
       LEFT JOIN attendance_records ar
         ON ar.session_id = a.session_id
        AND ar.student_id = s.student_id
       WHERE s.student_id = $1
         AND s.college_id = $2
         AND a.status = 'completed'`,
      [req.user.student_id, req.user.college_id]
    );

    return res.json({
      success: true,
      subject_count: bySubject.rowCount,
      overall: overall.rows[0] || {
        total_sessions: 0,
        present_sessions: 0,
        absent_sessions: 0,
        attendance_percentage: null
      },
      subjects: bySubject.rows
    });

  } catch (error) {
    console.error('Student report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error while generating student report.'
    });
  }
});

module.exports = router;
