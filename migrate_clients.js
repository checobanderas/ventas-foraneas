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
  console.log('Connecting to MySQL (67.217.247.155) database: calvario...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
    database: 'calvario'
  });

  try {
    // 1. Inspect schema of calvario.clientes
    console.log('Describing table clientes...');
    const [columns] = await connection.query('DESCRIBE clientes');
    console.log('Table columns:', columns.map(c => `${c.Field} (${c.Type})`));

    // 2. Fetch all clients from calvario
    console.log('Fetching clients from MySQL...');
    const [rows] = await connection.query('SELECT * FROM clientes');
    console.log(`Found ${rows.length} clients in MySQL.`);

    // 3. Clear existing clients in Firestore
    console.log('Fetching existing clients from Firestore to delete them...');
    const clientsSnapshot = await getDocs(collection(db, 'clients'));
    console.log(`Found ${clientsSnapshot.size} clients in Firestore. Deleting...`);
    
    let deleteCount = 0;
    for (const docSnap of clientsSnapshot.docs) {
      await deleteDoc(doc(db, 'clients', docSnap.id));
      deleteCount++;
      if (deleteCount % 20 === 0) {
        console.log(`Deleted ${deleteCount}/${clientsSnapshot.size} clients...`);
      }
    }
    console.log('Firestore clients collection cleared.');

    // 4. Migrate clients to Firestore
    console.log('Starting migration...');
    let migrateCount = 0;
    for (const row of rows) {
      // Find name: columns might be NOMBRE or nombre or case-insensitive
      const nameVal = row.NOMBRE || row.nombre || `Cliente #${row.ID || row.id}`;
      const phoneVal = row.TELEFONO || row.telefono || '';
      const emailVal = row.correo || row.CORREO || row.email || row.EMAIL || '';
      
      // Address columns
      const calleVal = row.calle || row.CALLE || '';
      const coloniaVal = row.colonia || row.COLONIA || '';
      const poblacionVal = row.poblacion || row.POBLACION || '';

      const addressParts = [calleVal, coloniaVal, poblacionVal]
        .map(s => s ? String(s).trim() : '')
        .filter(s => s !== '' && s !== '.');
      
      const address = addressParts.join(', ') || 'Sin Dirección Registrada';

      const mysqlId = row.ID !== undefined ? row.ID : row.id;
      const routeId = row.ID_RUTA !== undefined ? row.ID_RUTA : row.id_ruta;
      const sellerId = row.ID_VENDEDOR !== undefined ? row.ID_VENDEDOR : row.id_vendedor;

      const clientData = {
        name: String(nameVal).trim(),
        email: String(emailVal).trim(),
        phone: String(phoneVal).trim(),
        address: address,
        latitude: null,
        longitude: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        mysqlId: mysqlId !== undefined ? Number(mysqlId) : null,
        routeId: routeId !== undefined ? Number(routeId) : null,
        sellerId: sellerId !== undefined ? Number(sellerId) : null
      };

      const docId = `mysql_${mysqlId}`;
      await setDoc(doc(db, 'clients', docId), clientData);
      migrateCount++;

      if (migrateCount % 50 === 0 || migrateCount === rows.length) {
        console.log(`Migrated ${migrateCount}/${rows.length} clients...`);
      }
    }
    console.log(`\nMigration completed successfully! Total migrated: ${migrateCount}`);

  } catch (err) {
    console.error('Error in migration:', err);
  } finally {
    await connection.end();
    console.log('MySQL connection closed.');
  }
}

main();
