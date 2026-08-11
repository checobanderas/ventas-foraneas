import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  setLogLevel
} from "firebase/firestore";

// Silenciar warnings/errores de conexión internos de Firebase en consola
try {
  setLogLevel("silent");
} catch (e) {
  console.warn("Failed to set log level to silent:", e);
}

// Configuración por defecto del sistema
const defaultFirebaseConfig = {
  apiKey: "AIzaSyBMHlGSg_3BubOrOasqVVujGzZ-iqZceVQ",
  authDomain: "ventas-foraneas.firebaseapp.com",
  projectId: "ventas-foraneas",
  storageBucket: "ventas-foraneas.firebasestorage.app",
  messagingSenderId: "1097391142464",
  appId: "1:1097391142464:web:a9ca554715dd0ae83a11a5",
  measurementId: "G-0CQWD9QLTH"
};

const defaultDbId = "";

// Intentar cargar configuración personalizada desde localStorage en el navegador
let activeConfig = defaultFirebaseConfig;
let activeDbId = defaultDbId;
let isCustomActive = false;

if (typeof window !== "undefined") {
  try {
    const savedConfig = localStorage.getItem("custom_firebase_config");
    const savedDbId = localStorage.getItem("custom_firebase_db_id");
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      if (parsed && parsed.projectId && parsed.apiKey) {
        activeConfig = parsed;
        isCustomActive = true;
        console.log("🔥 Utilizando configuración de Firebase cargada desde localStorage:", parsed.projectId);
      }
    }
    if (savedDbId !== null) {
      activeDbId = savedDbId;
      console.log("🔥 Utilizando Firestore Database ID cargado desde localStorage:", activeDbId || "(default)");
    }
  } catch (e) {
    console.warn("No se pudo leer la configuración de Firebase de localStorage:", e);
  }
}

// Inicializar la app correspondiente. Usamos un nombre específico si no es la configuración por defecto para evitar colisiones.
let app;
const appName = isCustomActive ? "custom_app" : "[DEFAULT]";

if (appName === "[DEFAULT]") {
  app = getApps().length === 0 ? initializeApp(activeConfig) : getApp();
} else {
  // Inicializamos una app secundaria para la configuración personalizada
  const existingApps = getApps();
  const customApp = existingApps.find(a => a.name === appName);
  app = customApp || initializeApp(activeConfig, appName);
}

let firestoreDb;

const cleanDbId = (activeDbId === "(default)" || activeDbId === "default" || !activeDbId) ? undefined : activeDbId;

try {
  // Inicializamos Firestore con long-polling y caché persistente multitestaña (IndexedDB) con tamaño ilimitado (CACHE_SIZE_UNLIMITED)
  // Esto previene el error QuotaExceededError y permite que la aplicación opere de forma 100% offline.
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: CACHE_SIZE_UNLIMITED
    })
  }, cleanDbId);
} catch (error: any) {
  console.warn("Firestore failed configuration with persistence cache. Retrying with long polling only:", error);
  try {
    // Si la persistencia falla (ej: IndexedDB bloqueado en iframe sandbox), inicializamos solo con long-polling
    firestoreDb = initializeFirestore(app, {
      experimentalForceLongPolling: true
    }, cleanDbId);
  } catch (innerError: any) {
    console.warn("Firestore initializeFirestore failed twice. Using getFirestore as final resort:", innerError);
    firestoreDb = getFirestore(app, cleanDbId);
  }
}

export const db = firestoreDb;

