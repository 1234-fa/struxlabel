const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();

const referrelcodeGenerate = ()=>{
  let chars ='ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
  let refcode ='';
  for(let i=0;i<10;i++){
    refcode += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return refcode;
}

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
}, 
async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('Google profile:', profile);
        let user = await User.findOne({ googleId: profile.id });
        
        if (user) {
            console.log('Existing user found:', user);
            return done(null, user);
        } else {
            user = new User({
                name: profile.displayName,
                email: profile.emails && profile.emails.length > 0 ? profile.emails[0].value : "",
                googleId: profile.id,
                phone: null ,
                referralCode: referrelcodeGenerate()
            });
            console.log('Creating new user:', user);
            await user.save();
            console.log('User saved successfully');
            return done(null, user);
        }
    } catch (error) {
        console.error('Google auth error:', error);
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
  console.log('🔄 SERIALIZING USER:', user._id);
  done(null, user._id); 
});

passport.deserializeUser(async (id, done) => {
  try {
    console.log('🔍 DESERIALIZING USER ID:', id);
    const user = await User.findById(id);
    if (!user) {
      console.log('❌ USER NOT FOUND during deserialization');
      return done(null, false);
    }
    console.log('✅ USER FOUND during deserialization:', user.name);
    done(null, user);
  } catch (error) {
    console.error('💥 DESERIALIZATION ERROR:', error);
    done(error, null);
  }
});

module.exports = passport;