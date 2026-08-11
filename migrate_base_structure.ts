import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, collection, getDocs, doc, setDoc } from "firebase/firestore";

// Configuración de origen (cocinet-app - Solo lectura)
const sourceConfig = {
  apiKey: "AIzaSyA-pj8EA8Pl7CVM9P-L4lOLhzxadQVQujI",
  authDomain: "cocinet-app.firebaseapp.com",
  projectId: "cocinet-app",
  storageBucket: "cocinet-app.firebasestorage.app",
  messagingSenderId: "315374858436",
  appId: "1:315374858436:web:c432699c575403bfe91991"
};

// Configuración de destino (ventas-foraneas - Escritura)
const targetConfig = {
  apiKey: "AIzaSyBMHlGSg_3BubOrOasqVVujGzZ-iqZceVQ",
  authDomain: "ventas-foraneas.firebaseapp.com",
  projectId: "ventas-foraneas",
  storageBucket: "ventas-foraneas.firebasestorage.app",
  messagingSenderId: "1097391142464",
  appId: "1:1097391142464:web:a9ca554715dd0ae83a11a5"
};

// Inicializar apps independientes
const sourceApp = initializeApp(sourceConfig, "source_app");
const targetApp = initializeApp(targetConfig, "target_app");

const sourceDb = initializeFirestore(sourceApp, { experimentalForceLongPolling: true });
const targetDb = initializeFirestore(targetApp, { experimentalForceLongPolling: true });

// Colecciones BASE a copiar (SOLO ESTRUCTURA Y CATÁLOGOS)
const BASE_COLLECTIONS = ["tenants", "users", "products", "suppliers", "customers"];

async function migrateBaseStructure() {
  console.log("🚀 Iniciando migración de estructura base de 'cocinet-app' a 'ventas-foraneas'...");
  console.log("⚠️ EXCLUIDOS EXPLICITAMENTE: ventas (history), cortes (arqueos), movimientos de caja, gastos e inventario transaccional.\n");

  for (const colName of BASE_COLLECTIONS) {
    console.log(`📦 Procesando colección '${colName}'...`);
    try {
      const snap = await getDocs(collection(sourceDb, colName));
      console.log(`   Encontrados ${snap.docs.length} documentos en '${colName}'.`);

      let count = 0;
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        await setDoc(doc(targetDb, colName, docSnap.id), data);
        count++;
      }
      console.log(`   ✅ Copiados ${count} documentos exitosamente a 'ventas-foraneas'.\n`);
    } catch (err: any) {
      console.error(`   ❌ Error al migrar colección '${colName}':`, err.message || err);
    }
  }

  console.log("🎉 Migración de estructura base completada con éxito.");
}

migrateBaseStructure().catch(console.error);
