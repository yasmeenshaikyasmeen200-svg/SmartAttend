
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

// ---------- ROLE CONSTANTS (must match adminRoutes.js) ----------
const ROLES = {
  SMARTATTEND_ADMIN: 'smartattend_admin',
  COLLEGE_ADMIN: 'college_admin',
  FACULTY: 'faculty',
  STUDENT: 'student'
};

// ---------- HELPER: distance in meters between 2 lat/lon points ----------
// Uses Haversine formula (accurate enough for campus-scale distances)
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (d) => (d * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- MIDDLEWARE: role guards ----------
const isFaculty = (req, res, next) => {
  if (req.user.role !== ROLES.FACULTY || !req.user.faculty_id) {
    return res.status(403).json({
      success: false,
      message: 'Only faculty can perform this action.'
    });
  }
  next();
};

const isStudent = (req, res, next) => {
  if (req.user.role !== ROLES.STUDENT || !req.user.student_id) {
    return res.status(403).json({
      success: false,
      message: 'Only students can perform this action.'
    });
  }
  next();
};

// =====================================================
// 1. FACULTY STARTS AN ATTENDANCE SESSION
// =====================================================
router.post('/sessions/start', authMiddleware, isFaculty, async (req, res) => {
  try {
    const { timetable_id } = req.body;

    if (!timetable_id) {
      return res.status(400).json({
        success: false,
        message: 'Timetable ID is required.'
      });
    }

    // Verify the timetable belongs to this faculty AND college
    const timetable = await pool.query(
      `SELECT * FROM timetables
       WHERE timetable_id = $1
         AND faculty_id = $2
         AND college_id = $3`,
      [timetable_id, req.user.faculty_id, req.user.college_id]
    );

    if (!timetable.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Timetable not found or not assigned to this faculty.'
      });
    }

    const t = timetable.rows[0];

    const result = await pool.query(
      `INSERT INTO attendance_sessions
       (college_id, faculty_id, course_id, classroom_id, subject_name)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        req.user.college_id,
        req.user.faculty_id,
        t.course_id,
        t.classroom_id,
        t.subject_name
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Attendance session started successfully!',
      session: result.rows[0]
    });

  } catch (error) {
    console.error('Start session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not start attendance session.'
    });
  }
});

// =====================================================
// 2. FACULTY VIEWS THEIR SESSIONS
// =====================================================
router.get('/sessions/my', authMiddleware, isFaculty, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM attendance_sessions
       WHERE faculty_id = $1 AND college_id = $2
       ORDER BY session_id DESC`,
      [req.user.faculty_id, req.user.college_id]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      sessions: result.rows
    });

  } catch (error) {
    console.error('List sessions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch attendance sessions.'
    });
  }
});

// =====================================================
// 3. STUDENT VIEWS ACTIVE SESSIONS FOR THEIR COURSE
// =====================================================
router.get('/sessions/active', authMiddleware, isStudent, async (req, res) => {
  try {
    // Get the student's course_id and college_id safely from DB
    const me = await pool.query(
      `SELECT course_id, college_id FROM students WHERE student_id = $1`,
      [req.user.student_id]
    );

    if (!me.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Student not found.'
      });
    }

    const { course_id, college_id } = me.rows[0];

    const result = await pool.query(
      `SELECT a.session_id, a.subject_name, a.session_date,
              a.start_time, a.status,
              f.full_name AS faculty_name,
              c.classroom_name
       FROM attendance_sessions a
       JOIN classrooms c ON c.classroom_id = a.classroom_id
       JOIN faculty f    ON f.faculty_id    = a.faculty_id
       WHERE a.college_id = $1
         AND a.course_id  = $2
         AND a.status     = 'active'
       ORDER BY a.start_time DESC`,
      [college_id, course_id]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      sessions: result.rows
    });

  } catch (error) {
    console.error('Active sessions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch active sessions.'
    });
  }
});

// =====================================================
// 4. STUDENT SUBMITS GPS + BIOMETRIC CLAIM
//    - GPS is verified SERVER-SIDE (real check)
//    - Biometric is CLAIMED by the app (cannot be verified by server)
//    - Final authority = faculty confirmation (route 6)
// ============================================// =====================================================
// 4. STUDENT SUBMITS GPS + BIOMETRIC CLAIM
// =====================================================
router.post('/sessions/:id/verify', authMiddleware, isStudent, async (req, res) => {
  try {
    const { latitude, longitude, biometric_claimed } = req.body;

    // Validate input
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      typeof biometric_claimed !== 'boolean'
    ) {
      return res.status(400).json({
        success: false,
        message: 'latitude, longitude, and biometric_claimed are required.'
      });
    }

    // Fetch the session + classroom GPS
    const session = await pool.query(
      `SELECT a.session_id, a.college_id, a.course_id,
              c.latitude   AS room_lat,
              c.longitude  AS room_lon,
              c.radius_meters
       FROM attendance_sessions a
       JOIN classrooms c
         ON c.classroom_id = a.classroom_id
       WHERE a.session_id = $1
         AND a.college_id = $2
         AND a.status     = 'active'`,
      [req.params.id, req.user.college_id]
    );

    if (!session.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Active session not found.'
      });
    }

    const s = session.rows[0];

    // Server-side distance check (Haversine formula)
    const R = 6371000; 
    const dLat = (Number(s.room_lat) - latitude) * Math.PI / 180;
    const dLon = (Number(s.room_lon) - longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(latitude * Math.PI / 180) * Math.cos(Number(s.room_lat) * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c;

    const radius = s.radius_meters || 50;
    const gps_verified = distance <= radius;

    // Upsert attendance record
    const result = await pool.query(
      `INSERT INTO attendance_records
       (session_id, student_id, attendance_status,
        gps_verified, biometric_claimed, biometric_verified,
        distance_meters, faculty_confirmed)
       VALUES ($1, $2, 'absent', $3, $4, false, $5, false)
       ON CONFLICT (session_id, student_id)
       DO UPDATE SET
         gps_verified      = EXCLUDED.gps_verified,
         biometric_claimed = EXCLUDED.biometric_claimed,
         biometric_verified= false,
         distance_meters   = EXCLUDED.distance_meters,
         faculty_confirmed = false,
         attendance_status = 'absent',
         marked_at         = NULL
       RETURNING *`,
      [
        req.params.id,
        req.user.student_id,
        gps_verified,
        biometric_claimed,
        distance
      ]
    );

    return res.json({
      success: true,
      message: gps_verified
        ? 'GPS verified. Biometric claim recorded. Waiting for faculty confirmation.'
        : `GPS check failed. You are ${Math.round(distance)} m away (max ${radius} m).`,
      gps_verified,
      distance_meters: Math.round(distance),
      attendance: result.rows[0]
    });

  } catch (error) {
    console.error('Verify error:', error); // 👈 THIS WILL PRINT IN YOUR TERMINAL
    return res.status(500).json({
      success: false,
      message: 'Could not submit attendance verification.'
    });
  }
});
 

// =====================================================
// 5. FACULTY VIEWS STUDENT VERIFICATION RECORDS FOR A SESSION
// =====================================================
router.get('/sessions/:id/records', authMiddleware, isFaculty, async (req, res) => {
  try {
    // Verify this session belongs to this faculty + college
    const session = await pool.query(
      `SELECT session_id FROM attendance_sessions
       WHERE session_id = $1
         AND faculty_id = $2
         AND college_id = $3`,
      [req.params.id, req.user.faculty_id, req.user.college_id]
    );

    if (!session.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Attendance session not found.'
      });
    }

    const result = await pool.query(
      `SELECT ar.*, s.full_name, s.roll_number, s.email
       FROM attendance_records ar
       JOIN students s ON s.student_id = ar.student_id
       WHERE ar.session_id = $1
       ORDER BY s.roll_number`,
      [req.params.id]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      records: result.rows
    });

  } catch (error) {
    console.error('Session records error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch attendance records.'
    });
  }
});

// =====================================================
// 6. FACULTY CONFIRMS STUDENT ATTENDANCE
//    Only valid if GPS was server-verified + biometric claimed + faculty agrees.
// =====================================================
router.put(
  '/sessions/:id/confirm/:studentId',
  authMiddleware,
  isFaculty,
  async (req, res) => {
    try {
      const studentId = parseInt(req.params.studentId, 10);
      if (Number.isNaN(studentId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid student ID.'
        });
      }

      // Verify this session belongs to this faculty + college + is active
      const session = await pool.query(
        `SELECT session_id FROM attendance_sessions
         WHERE session_id = $1
           AND faculty_id = $2
           AND college_id = $3
           AND status     = 'active'`,
        [req.params.id, req.user.faculty_id, req.user.college_id]
      );

      if (!session.rows.length) {
        return res.status(404).json({
          success: false,
          message: 'Active attendance session not found.'
        });
      }

      // Only confirm if server-side GPS passed
      // (Biometric is a claim; faculty is the final authority)
      const result = await pool.query(
        `UPDATE attendance_records
         SET faculty_confirmed   = true,
             biometric_verified  = biometric_claimed,  -- mark as verified once faculty approves
             attendance_status   = 'present',
             marked_at           = CURRENT_TIMESTAMP
         WHERE session_id = $1
           AND student_id = $2
           AND gps_verified = true
         RETURNING *`,
        [req.params.id, studentId]
      );

      if (!result.rows.length) {
        return res.status(400).json({
          success: false,
          message: 'Student record not found or GPS verification failed.'
        });
      }

      return res.json({
        success: true,
        message: 'Attendance confirmed successfully!',
        attendance: result.rows[0]
      });

    } catch (error) {
      console.error('Confirm attendance error:', error);
      return res.status(500).json({
        success: false,
        message: 'Could not confirm attendance.'
      });
    }
  }
);

// =====================================================
// 7. FACULTY ENDS AN ATTENDANCE SESSION
// =====================================================
router.put('/sessions/:id/end', authMiddleware, isFaculty, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE attendance_sessions
       SET status = 'completed',
           end_time = CURRENT_TIMESTAMP
       WHERE session_id = $1
         AND faculty_id = $2
         AND college_id = $3
         AND status     = 'active'
       RETURNING *`,
      [req.params.id, req.user.faculty_id, req.user.college_id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Active session not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Attendance session ended successfully!',
      session: result.rows[0]
    });

  } catch (error) {
    console.error('End session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not end attendance session.'
    });
  }
});

// =====================================================
// 8. STUDENT VIEWS THEIR OWN ATTENDANCE HISTORY
// =====================================================
router.get('/records/my', authMiddleware, isStudent, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ar.*, a.subject_name, a.session_date,
              a.start_time, a.status AS session_status
       FROM attendance_records ar
       JOIN attendance_sessions a ON a.session_id = ar.session_id
       WHERE ar.student_id = $1
         AND a.college_id  = $2
       ORDER BY ar.marked_at DESC NULLS LAST`,
      [req.user.student_id, req.user.college_id]
    );

    return res.json({
      success: true,
      count: result.rows.length,
      records: result.rows
    });

  } catch (error) {
    console.error('Student history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Could not fetch student attendance history.'
    });
  }
});

module.exports = router;