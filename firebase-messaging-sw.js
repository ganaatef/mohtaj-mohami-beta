// Firebase Cloud Messaging service worker for web builds.
// Deployment workflows replace the public Firebase config placeholders below.
// Keep this file at the web origin root; Firebase Messaging expects the default
// service worker at /firebase-messaging-sw.js when no custom registration is supplied.
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: '__FIREBASE_API_KEY__',
  authDomain: '__FIREBASE_AUTH_DOMAIN__',
  projectId: '__FIREBASE_PROJECT_ID__',
  storageBucket: '__FIREBASE_STORAGE_BUCKET__',
  messagingSenderId: '__FIREBASE_MESSAGING_SENDER_ID__',
  appId: '__FIREBASE_APP_ID__',
  measurementId: '__FIREBASE_MEASUREMENT_ID__',
});

firebase.messaging();
