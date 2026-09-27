
const admin = require("firebase-admin");
const serviceAccount = require("../menumoney-60681-firebase-adminsdk-fbsvc-ac3790c9e5.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;

