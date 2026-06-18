import mysql from 'mysql2/promise';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';

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
  console.log('Connecting to MySQL calvario database...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
    database: 'calvario'
  });

  try {
    // 1. Fetch users (usuarios)
    console.log('Fetching users (usuarios) from MySQL...');
    const [userRows] = await connection.query('SELECT * FROM usuarios');
    console.log(`Found ${userRows.length} users in MySQL.`);

    // 2. Fetch trucks (camionetas)
    console.log('Fetching trucks (camionetas) from MySQL...');
    const [truckRows] = await connection.query('SELECT * FROM camionetas');
    console.log(`Found ${truckRows.length} trucks in MySQL.`);

    // 3. Clear existing users in Firestore
    console.log('Clearing users in Firestore...');
    const usersSnapshot = await getDocs(collection(db, 'users'));
    for (const docSnap of usersSnapshot.docs) {
      await deleteDoc(doc(db, 'users', docSnap.id));
    }
    console.log('Firestore users collection cleared.');

    // 4. Clear existing trucks in Firestore
    console.log('Clearing trucks in Firestore...');
    const trucksSnapshot = await getDocs(collection(db, 'trucks'));
    for (const docSnap of trucksSnapshot.docs) {
      await deleteDoc(doc(db, 'trucks', docSnap.id));
    }
    console.log('Firestore trucks collection cleared.');

    // 5. Migrate users to Firestore
    console.log('Migrating users to Firestore...');
    for (const row of userRows) {
      const role = row.PUESTO === 'Vendedor' ? 'driver' : (row.PUESTO === 'Supervisor' ? 'supervisor' : 'admin');
      const userData = {
        name: row.NOMBRE ? String(row.NOMBRE).trim() : '',
        username: row.USUARIO ? String(row.USUARIO).trim() : '',
        role: role,
        phone: row.TELEFONO ? String(row.TELEFONO).trim() : '',
        mysqlId: row.ID,
        isActive: row.ACTIVO === 1,
        updatedAt: new Date().toISOString()
      };

      const docId = `mysql_${row.ID}`;
      await setDoc(doc(db, 'users', docId), userData);
    }
    console.log('Users migration completed.');

    // 6. Migrate trucks to Firestore
    console.log('Migrating trucks to Firestore...');
    for (const row of truckRows) {
      const truckData = {
        name: row.CAMIONETA ? String(row.CAMIONETA).trim() : '',
        ecoNumber: row.NUMEROECONOMICO ? String(row.NUMEROECONOMICO).trim() : '',
        mysqlId: row.ID,
        updatedAt: new Date().toISOString()
      };

      const docId = `mysql_${row.ID}`;
      await setDoc(doc(db, 'trucks', docId), truckData);
    }
    console.log('Trucks migration completed.');
    console.log('\nMigration run finished successfully!');

  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    await connection.end();
  }
}

main();
