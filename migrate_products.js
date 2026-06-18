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
  console.log('Connecting to MySQL (67.217.247.155) database: ventas_moviles...');
  const connection = await mysql.createConnection({
    host: '67.217.247.155',
    user: 'chk',
    password: 'checo2100',
    database: 'ventas_moviles'
  });

  try {
    // 1. Fetch all products
    console.log('Fetching products from MySQL prods table...');
    const [rows] = await connection.query('SELECT * FROM prods WHERE ACTIVO = 1');
    console.log(`Found ${rows.length} active products in MySQL.`);

    // 2. Clear existing products in Firestore
    console.log('Fetching existing products from Firestore to delete them...');
    const productsSnapshot = await getDocs(collection(db, 'products'));
    console.log(`Found ${productsSnapshot.size} products in Firestore. Deleting...`);
    
    let deleteCount = 0;
    for (const docSnap of productsSnapshot.docs) {
      await deleteDoc(doc(db, 'products', docSnap.id));
      deleteCount++;
      if (deleteCount % 20 === 0) {
        console.log(`Deleted ${deleteCount}/${productsSnapshot.size} products...`);
      }
    }
    console.log('Firestore products collection cleared.');

    // 3. Migrate products to Firestore
    console.log('Starting migration...');
    let migrateCount = 0;
    for (const row of rows) {
      const productData = {
        sku: row.ARTICULO ? String(row.ARTICULO).trim() : '',
        name: row.DESCRIP ? String(row.DESCRIP).trim() : `Producto #${row.ID}`,
        price: row.PRECIO1 !== null ? Number(row.PRECIO1) : 0,
        cost: row.COSTO_U !== null ? Number(row.COSTO_U) : 0,
        unit: row.UNIDAD ? String(row.UNIDAD).trim() : 'PZA',
        stock: row.EXISTENCIA !== null ? Number(row.EXISTENCIA) : 0,
        brand: row.DEPARTAMENTO ? String(row.DEPARTAMENTO).trim() : '',
        mysqlId: row.ID,
        updatedAt: new Date().toISOString()
      };

      const docId = `mysql_${row.ID}`;
      await setDoc(doc(db, 'products', docId), productData);
      migrateCount++;

      if (migrateCount % 20 === 0 || migrateCount === rows.length) {
        console.log(`Migrated ${migrateCount}/${rows.length} products...`);
      }
    }
    console.log(`\nProduct migration completed successfully! Total migrated: ${migrateCount}`);

  } catch (err) {
    console.error('Error migrating products:', err);
  } finally {
    await connection.end();
    console.log('MySQL connection closed.');
  }
}

main();
