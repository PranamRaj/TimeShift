// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAyfmT7JTxWuDK3PRPd0fnzLPNWlgcKHvg",
  authDomain: "queueflow-422bc.firebaseapp.com",
  projectId: "queueflow-422bc",
  storageBucket: "queueflow-422bc.firebasestorage.app",
  messagingSenderId: "788356050681",
  appId: "1:788356050681:web:62416d09218e5e4e303c28"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();