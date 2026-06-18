import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBMHlGSg_3BubOrOasqVVujGzZ-iqZceVQ",
  authDomain: "ventas-foraneas.firebaseapp.com",
  projectId: "ventas-foraneas",
  storageBucket: "ventas-foraneas.firebasestorage.app",
  messagingSenderId: "1097391142464",
  appId: "1:1097391142464:web:a9ca554715dd0ae83a11a5",
  measurementId: "G-0CQWD9QLTH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
export const db = getFirestore(app);

export default app;
