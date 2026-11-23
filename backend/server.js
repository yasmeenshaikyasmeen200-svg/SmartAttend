require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db');

const collegeRoutes       = require('./routes/collegeRoutes');
const adminRoutes         = require('./routes/adminRoutes');
const collegeAdminRoutes  = require('./routes/collegeAdminRoutes');
const departmentRoutes    = require('./routes/departmentRoutes');
const courseRoutes        = require('./routes/courseRoutes');
const classroomRoutes     = require('./routes/classroomRoutes');
const facultyRoutes       = require('./routes/facultyRoutes');
const studentRoutes       = require('./routes/studentRoutes');
const timetableRoutes     = require('./routes/timetableRoutes');
const attendanceRoutes    = require('./routes/attendanceRoutes');
const notificationRoutes  = require('./routes/notificationRoutes');
const reportRoutes        = require('./routes/reportRoutes');

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// ---------- GLOBAL MIDDLEWARE ----------
app.use(cors({
  origin: '*',                                        // Expo Go / React Native don't send Origin
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());     // must be BEFORE routes
app.use(express.urlencoded({ extended: true }));

// ---------- HEALTH / DEV TESTS ----------
app.get('/', (req, res) => {
  res.send('Welcome to SmartAttend Backend!');
});

app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'SmartAttend API is working!' });
});

app.get('/api/db-test', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      success: true,
      message: 'SmartAttend database connected!',
      time: result.rows[0].now
    });
  } catch (error) {
    console.error('DB test error:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed'
    });
  }
});

// ---------- ROUTES ----------
app.use('/api/colleges',      collegeRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/college-admins', collegeAdminRoutes);
app.use('/api/departments',   departmentRoutes);
app.use('/api/courses',       courseRoutes);
app.use('/api/classrooms',    classroomRoutes);
app.use('/api/faculty',       facultyRoutes);
app.use('/api/students',      studentRoutes);
app.use('/api/timetables',    timetableRoutes);
app.use('/api/attendance',    attendanceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports',       reportRoutes);

// ---------- 404 (must come AFTER all routes) ----------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`
  });
});

// ---------- GLOBAL ERROR HANDLER (must be LAST) ----------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error.'
  });
});

// ---------- OPTIONAL: ROUTE DEBUG (only when DEBUG_ROUTES=true) ----------
if (process.env.DEBUG_ROUTES === 'true') {
  const show = (name, router) => {
    const paths = router.stack
      .filter((layer) => layer.route)
      .map((layer) =>
        `${Object.keys(layer.route.methods).join(',').toUpperCase()} ${layer.route.path}`
      );
    console.log(`\n[${name}]`);
    paths.forEach((p) => console.log(`  ${p}`));
  };

  show('adminRoutes',        adminRoutes);
  show('collegeRoutes',      collegeRoutes);
  show('collegeAdminRoutes', collegeAdminRoutes);
  show('departmentRoutes',   departmentRoutes);
  show('courseRoutes',       courseRoutes);
  show('classroomRoutes',    classroomRoutes);
  show('facultyRoutes',      facultyRoutes);
  show('studentRoutes',      studentRoutes);
  show('timetableRoutes',    timetableRoutes);
  show('attendanceRoutes',   attendanceRoutes);
  show('notificationRoutes', notificationRoutes);
  show('reportRoutes',       reportRoutes);
}

// ---------- START ----------
// ⚠️ 0.0.0.0 is REQUIRED so your phone can reach this server on the LAN
app.listen(PORT, '0.0.0.0', () => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let lanIp = 'YOUR-PC-IP';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIp = net.address;
        break;
      }
    }
    if (lanIp !== 'YOUR-PC-IP') break;
  }

  console.log(`✅ SmartAttend server running on port ${PORT}`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${lanIp}:${PORT}   ← use this in Expo Go`);
});