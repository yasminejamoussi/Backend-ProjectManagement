const passport = require('passport');
const Auth0Strategy = require('passport-auth0');
const session = require('express-session');

// Remplace ces valeurs par les données de ton application Auth0
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;
const AUTH0_CALLBACK_URL = process.env.AUTH0_CALLBACK_URL;

passport.use(new Auth0Strategy({
  domain: AUTH0_DOMAIN,
  clientID: AUTH0_CLIENT_ID,
  clientSecret: AUTH0_CLIENT_SECRET,
  callbackURL: AUTH0_CALLBACK_URL
},
function(accessToken, refreshToken, extraParams, profile, done) {
  // On peut ici enregistrer l'utilisateur dans la base de données si nécessaire
  return done(null, profile);  // profile contient les informations de l'utilisateur
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

module.exports = passport;
