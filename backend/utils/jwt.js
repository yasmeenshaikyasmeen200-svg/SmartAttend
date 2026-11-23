const jwt = require('jsonwebtoken');

/**
 * Sign a JWT with the app's secret.
 * Payload must include at minimum: { role, ...roleIdFields }
 * Example: { role: 'student', student_id: 7, college_id: 2, email: '...' }
 */
const signToken = (payload) => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    console.error('❌ JWT_SECRET is missing from environment variables.');
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.sign(payload, secret, {
    expiresIn: '7d',       // matches expires_in in API responses
  });
};

module.exports = signToken;
