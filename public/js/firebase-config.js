// ============================================================
// Firebase config — this is the *client* web config, which is
// meant to be public (it's not a secret; Firebase security rules
// are what actually protect the data, not hiding this object).
// See FIREBASE.md for the read-only rules to set on the database
// before this goes properly live.
// ============================================================

window.EO_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcKYn-AsdgYNXQWImTP0pfe3-IT2RnjZw",
  authDomain: "ezra-ogombo.firebaseapp.com",
  databaseURL: "https://ezra-ogombo-default-rtdb.firebaseio.com",
  projectId: "ezra-ogombo",
  storageBucket: "ezra-ogombo.firebasestorage.app",
  messagingSenderId: "153893557522",
  appId: "1:153893557522:web:2515f9d685753833ea0fcb",
  measurementId: "G-E81GQMZYT6",
  // Google sign-in for sponsors: paste the "Web client ID" from Firebase Console -> Authentication -> Sign-in method -> Google
  // (Web SDK configuration). Leave empty and the Google button is simply hidden.
  googleClientId: "1056077992011-jkfom54rrtgamsgdcuom23au43undmg7.apps.googleusercontent.com",
};
