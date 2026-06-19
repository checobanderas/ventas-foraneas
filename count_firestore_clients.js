import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBMHlGSg_3BubOrOasqVVujGzZ-iqZceVQ",
  authDomain: "ventas-foraneas.firebaseapp.com",
  projectId: "ventas-foraneas",
  storageBucket: "ventas-foraneas.firebasestorage.app",
  messagingSenderId: "1097391142464",
  appId: "1:1097391142464:web:a9ca554715dd0ae83a11a5",
  measurementId: "G-0CQWD9QLTH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  console.log('Fetching clients from Firestore...');
  const clientsSnapshot = await getDocs(collection(db, 'clients'));
  console.log(`\n=============================`);
  console.log(`Total clients in Firestore: ${clientsSnapshot.size}`);
  console.log(`=============================`);
}

main().catch(console.error);
