// src/firebase.js
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: "AIzaSyBnknzdXs8_IKFOm57JwidmwOiac_Awd2E",
  authDomain: "check-score-7b858.firebaseapp.com",
  projectId: "check-score-7b858",
  storageBucket: "check-score-7b858.firebasestorage.app",
  messagingSenderId: "371859659233",
  appId: "1:371859659233:web:3a0f1a5acb6d631913daa0",
  measurementId: "G-6SEJ4TTEYY"
};
const app = initializeApp(firebaseConfig)
const auth = getAuth(app)

export { auth }
