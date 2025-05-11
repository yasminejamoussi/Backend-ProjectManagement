const { google } = require('googleapis');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Set the redirect URI dynamically based on the environment
const REDIRECT_URI = process.env.NODE_ENV === 'production'
  ? 'https://backend-projectmanagement-ip1e.onrender.com/api/auth/google'
  : 'http://localhost:4000/api/auth/google';

exports.oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  REDIRECT_URI
);