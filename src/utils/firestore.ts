import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  increment,
  where,
  serverTimestamp,
  Timestamp,
  deleteField,
} from "firebase/firestore";
import { db } from "./firebase";
import { getOperatingDay } from "./appHelpers";


export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function getMexicoISOString(): string {
  try {
    return new Date().toLocaleString("sv-SE", { timeZone: "America/Mexico_City" }).replace(" ", "T");
  } catch (e) {
    return getMexicoISOString();
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  
  if (errInfo.error.includes("Missing or insufficient permissions") || errInfo.error.includes("Could not reach Cloud Firestore backend")) {
    console.warn("Skipping crash for permission or connectivity error. Operating in offline/graceful mode.");
    return;
  }
  
  throw new Error(JSON.stringify(errInfo));
}

export function cleanUndefined(obj: any): any {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }
  if (typeof obj === "object") {
    if (obj.constructor && obj.constructor.name !== "Object") {
      return obj;
    }
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        clean[key] = cleanUndefined(val);
      }
    }
    return clean;
  }
  return obj;
}

export function generateUUID(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "uid-" + Date.now() + "-" + Math.floor(Math.random() * 10000000);
}

export async function runWrite(promise: Promise<any>): Promise<any> {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  if (!isOnline) {
    // Si estamos sin conexión, no bloqueamos la UI esperando la promesa de red.
    // El caché local de Firestore absorbe la escritura instantáneamente y la sincroniza en segundo plano.
    promise.catch((err) =>
      console.warn("Firestore queued offline background write:", err),
    );
    return;
  }
  try {
    // Aumentamos el tiempo de espera a un límite saludable de 15 segundos o dejamos que la promesa fluya,
    // pero para evitar falsos negativos que rompan el flujo de la aplicación en la UI, si hay un timeout,
    // lo registramos en consola y permitimos que la app continúe confiando en la sincronización asíncrona de Firestore.
    return await Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database write timeout (15s)")), 15000),
      ),
    ]);
  } catch (err) {
    console.warn(
      "Firestore write sync delay or error, relying on Firestore background synchronization engine:",
      err,
    );
    // Para que la UI no se rompa ni lance alertas falsas de error por retraso de red,
    // permitimos que continúe con el éxito asíncrono si el error es de timeout.
    if (err instanceof Error && err.message.includes("timeout")) {
      return; // Se asume que el motor en segundo plano de Firestore resolverá la escritura
    }
    throw err;
  }
}

export function getCurrentTenantId(): string {
  try {
    // 1. Try URL parameters first
    if (typeof window !== "undefined" && window.location) {
      const params = new URLSearchParams(window.location.search);
      const tenantParam = params.get("tenant") || params.get("sucursal") || params.get("company") || params.get("id");
      if (tenantParam) {
        const clean = tenantParam.trim().toLowerCase();
        if (clean.startsWith("tenant-")) return clean;
        if (clean === "xoxo") return "tenant-1";
        if (clean === "plaxa bella" || clean.includes("bella")) return "tenant-2";
        if (clean === "plaxa tecno" || clean === "tecno") return "tenant-3";
        if (clean === "plaza tecno2" || clean === "tecno2") return "tenant-4";
        if (clean === "macro plaza" || clean.includes("macro")) return "tenant-5";
        if (clean === "universidad") return "tenant-6";
        if (clean === "santa maria" || clean.includes("maria") || clean.includes("santa")) return "tenant-7";
        if (clean === "san sebastian" || clean.includes("sebastian")) return "tenant-8";
        if (clean === "mbravo" || clean.includes("bravo")) return "tenant-9";
        if (clean === "pinosuarez" || clean.includes("suarez") || clean.includes("pino")) return "tenant-10";
        if (clean === "etnias") return "tenant-11";
        if (clean === "viguera") return "tenant-12";
        if (clean === "tlacolula") return "tenant-13";
        if (clean === "huayapam") return "tenant-14";
      }
    }
    
    // 2. Try pos_selected_tenant in localStorage
    const cached = localStorage.getItem("pos_selected_tenant");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.id) {
        return parsed.id;
      }
    }

    // 3. Try pos_current_user in localStorage
    const cachedUser = localStorage.getItem("pos_current_user");
    if (cachedUser) {
      const parsedUser = JSON.parse(cachedUser);
      if (parsedUser && parsedUser.id) {
        const parts = parsedUser.id.split("-");
        if (parts[0] === "tenant" && parts[1]) {
          return `${parts[0]}-${parts[1]}`;
        }
      }
    }
  } catch {}
  return "tenant-7"; // Operational production tenant default
}

export function filterByTenantId(items: any[], tenantId: string): any[] {
  return items.filter((item) => {
    const itemTenantId = item.tenantId || "tenant-1";
    return itemTenantId === tenantId;
  });
}

export function filterByTenant(items: any[]): any[] {
  const currentId = getCurrentTenantId();
  return items.filter((item) => {
    const itemTenantId = item.tenantId || "tenant-1";
    return itemTenantId === currentId;
  });
}

export function injectTenant(item: any): any {
  if (!item || typeof item !== "object") return item;
  return {
    ...item,
    tenantId: item.tenantId || getCurrentTenantId(),
  };
}

export function subscribeToProducts(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "products"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const products = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((p: any) => !p.isBackup && !p.id.startsWith("bk_"));
      // Sort in client to avoid index requirements
      products.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
      callback(products);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "products");
    }
  );
}

export function subscribeToTables(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "tables"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const tables = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      // Sort in client
      tables.sort((a: any, b: any) => (a.label || "").localeCompare(b.label || ""));
      callback(tables);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "tables");
    }
  );
}

export async function fetchTablesFromFirebase(tenantId: string): Promise<any[]> {
  try {
    const q = query(
      collection(db, "tables"),
      where("tenantId", "==", tenantId)
    );
    const snapshot = await getDocs(q);
    const tables = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    tables.sort((a: any, b: any) => (a.label || "").localeCompare(b.label || ""));
    return tables;
  } catch (error) {
    console.warn("Error in fetchTablesFromFirebase:", error);
    return [];
  }
}

export function subscribeToHistory(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "history"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const history = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      // Sort in client (descending by timestamp)
      history.sort((a: any, b: any) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      callback(history);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "history");
    }
  );
}

export function subscribeToUsers(
  callback: (data: any[]) => void,
  onError?: (error: any) => void,
) {
  const q = query(collection(db, "users"));
  return onSnapshot(
    q,
    (snapshot) => {
      const users = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      callback(users); // users are filtered or customized inside App.tsx
    },
    (error) => {
      console.error("Firestore subscribeToUsers error:", error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, "users");
    },
  );
}

export function subscribeToInventory(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "inventory"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const inv = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      callback(inv);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "inventory");
    }
  );
}

export function subscribeToPurchases(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "purchases"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const p = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      callback(p);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "purchases");
    }
  );
}

export async function addPurchaseToFirebase(purchaseData: any) {
  const purchaseRef = doc(collection(db, "purchases"));
  const batch = writeBatch(db);
  const now = getMexicoISOString();

  const purchase = injectTenant({
    ...purchaseData,
    id: purchaseRef.id,
    uid: purchaseRef.id,
    timestamp: now,
    updatedAt: now,
  });

  batch.set(purchaseRef, purchase);

  // Update inventory stock based on purchase items
  if (purchaseData.items) {
    for (const item of purchaseData.items) {
      const invRef = doc(db, "inventory", item.inventoryItemId);
      batch.update(invRef, {
        stock: increment(item.qty),
        updatedAt: now,
      });

      // Registrar movimiento de inventario automatizado para compra 📦
      const mRef = doc(collection(db, "inventory_movements"));
      batch.set(
        mRef,
        injectTenant({
          id: mRef.id,
          uid: mRef.id,
          timestamp: now,
          updatedAt: now,
          inventoryItemId: item.inventoryItemId,
          type: "compra",
          qty: item.qty,
          concept: `Compra registrada de proveedor: ${purchaseData.supplier || "General"}`,
          executedBy: "Sistema",
        }),
      );
    }
  }

  await runWrite(batch.commit());
}

export async function updatePurchaseStatusInFirebase(
  purchaseId: string,
  isPaid: boolean,
) {
  const ref = doc(db, "purchases", purchaseId);
  await runWrite(
    updateDoc(ref, { isPaid, updatedAt: getMexicoISOString() }),
  );
}

export async function addProductToFirebase(product: any) {
  if (!product.id) {
    product.id = `prod_${Date.now()}`;
  }
  const ref = doc(db, "products", product.id);
  const data = injectTenant({
    ...product,
    uid: product.id,
    updatedAt: getMexicoISOString(),
  });
  await runWrite(setDoc(ref, cleanUndefined(data)));
}

export async function updateProductInFirebase(productId: string, data: any) {
  const ref = doc(db, "products", productId);
  await runWrite(
    updateDoc(ref, cleanUndefined({ ...data, updatedAt: getMexicoISOString() })),
  );
}

export async function deleteProductFromFirebase(productId: string) {
  const ref = doc(db, "products", productId);
  await runWrite(deleteDoc(ref));
}

export async function deleteAllProductsFromFirebase(tenantId: string, sucursal: string, products: any[]) {
  try {
    // Create a backup first
    await createMenuBackup(
      tenantId,
      sucursal || "Sucursal",
      `Respaldo automático antes de borrar - ${new Date().toLocaleString()}`,
      products
    );
  } catch (error) {
    console.error("Error creating backup before deletion:", error);
    throw new Error("No se pudo generar el respaldo de seguridad.");
  }

  try {
    const q = query(collection(db, "products"));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let deletedCount = 0;
    snapshot.docs.forEach((d) => {
      const data = d.data();
      const itemTenantId = data.tenantId || "tenant-1";
      console.log(`Checking product ${d.id}, tenantId: ${itemTenantId}, expected: ${tenantId}`);
      if (itemTenantId === tenantId) {
        batch.delete(d.ref);
        deletedCount++;
      }
    });
    console.log(`Products to delete: ${deletedCount}`);
    if (deletedCount > 0) {
      await runWrite(batch.commit());
    }
  } catch (error) {
    console.error("Error deleting products from Firebase:", error);
    throw new Error("No se pudo completar la eliminación de productos en Firebase.");
  }
}

export async function addInventoryItemToFirebase(item: any) {
  if (!item.id) item.id = `inv_${Date.now()}`;
  const ref = doc(db, "inventory", item.id);
  const data = injectTenant({
    ...item,
    uid: item.id,
    updatedAt: getMexicoISOString(),
  });
  await runWrite(setDoc(ref, data));
}

export async function updateInventoryItemInFirebase(itemId: string, data: any) {
  const ref = doc(db, "inventory", itemId);
  await runWrite(
    updateDoc(ref, { ...data, updatedAt: getMexicoISOString() }),
  );
}

export async function deleteInventoryItemFromFirebase(itemId: string) {
  const ref = doc(db, "inventory", itemId);
  await runWrite(deleteDoc(ref));
}

export async function addPedidoToPrinter(tenantId: string, orderData: any) {
  try {
    const now = getMexicoISOString();
    console.log(`🖨️ Sending pedido to printer queue for tenant: ${tenantId}`, orderData);
    const pedidosRef = collection(db, "tenants", tenantId, "pedidos");
    const docRef = doc(pedidosRef);
    const payload = {
      ...orderData,
      id: docRef.id,
      impreso: false,
      timestamp: now,
      createdAt: now,
      tenantId: tenantId
    };
    await setDoc(docRef, payload);
    console.log(`✅ Pedido queued successfully: ${docRef.id}`);
    return docRef.id;
  } catch (err) {
    console.warn("❌ Error syncing with local printer collection:", err);
    return null;
  }
}

export function deduplicateComandas(comandas: any[]): any[] {
  if (!Array.isArray(comandas) || comandas.length <= 1) return comandas || [];

  const result: any[] = [];
  for (const comanda of comandas) {
    if (!comanda) continue;

    const isDuplicate = result.some((existing) => {
      if (!existing) return false;

      // 1. Exact match by UID or numeric folio
      if (existing.uid && comanda.uid && existing.uid === comanda.uid) return true;
      if (existing.folio && comanda.folio && Number(existing.folio) === Number(comanda.folio)) return true;

      // 2. Match by created within 45s + identical active items (with matching folioInterno OR both without folioInterno)
      const f1 = String(existing.folioInterno || "").trim().toLowerCase();
      const f2 = String(comanda.folioInterno || "").trim().toLowerCase();
      if (f1 === f2) {
        const time1 = new Date(existing.timestamp || "").getTime();
        const time2 = new Date(comanda.timestamp || "").getTime();
        if (!isNaN(time1) && !isNaN(time2) && Math.abs(time1 - time2) < 45000) {
          const items1 = (existing.items || []).filter((i: any) => !i.isCancelled);
          const items2 = (comanda.items || []).filter((i: any) => !i.isCancelled);
          if (items1.length > 0 && items1.length === items2.length) {
            const matchAll = items1.every((i1: any, idx: number) => {
              const i2 = items2[idx];
              if (!i2) return false;
              const name1 = (i1.product?.name || i1.nombre || "").trim().toLowerCase();
              const name2 = (i2.product?.name || i2.nombre || "").trim().toLowerCase();
              return name1 === name2 && Number(i1.quantity) === Number(i2.quantity);
            });
            if (matchAll) return true;
          }
        }
      }
      return false;
    });

    if (!isDuplicate) {
      result.push(comanda);
    }
  }
  return result;
}

export async function addComandaToFirebase(
  tableId: string,
  items: any[],
  notes: string,
  createdBy: any,
  tableInfo: any,
  folioInterno?: string,
) {
  const folio = Date.now();
  const currentTenant = tableInfo.tenantId || getCurrentTenantId();
  const now = getMexicoISOString();

  const existingTableFolio = tableInfo?.folioInterno || (tableInfo?.comandas || []).find((c: any) => c.folioInterno)?.folioInterno;
  const finalFolioInterno = folioInterno || existingTableFolio || null;

  const newComanda = cleanUndefined({
    uid: "comanda-" + folio + "-" + Math.floor(Math.random() * 1000000),
    folio,
    folioInterno: finalFolioInterno,
    timestamp: now,
    updatedAt: now,
    items: items.map((i) => ({ ...i, isCancelled: false })),
    generalNotes: notes,
    createdBy: createdBy || null,
  });

  // Update the table to include this new comanda securely by checking live document first
  const tableRef = doc(db, "tables", tableId);
  let liveComandas = tableInfo.comandas || [];
  try {
    const snapDoc = await getDoc(tableRef);
    if (snapDoc.exists()) {
      const liveData = snapDoc.data();
      if (liveData && Array.isArray(liveData.comandas) && liveData.comandas.length > 0) {
        const comandasMap = new Map<number, any>();
        liveComandas.forEach((c: any) => comandasMap.set(c.folio, c));
        liveData.comandas.forEach((c: any) => comandasMap.set(c.folio, c));
        liveComandas = Array.from(comandasMap.values());
      }
    }
  } catch (err) {
    console.warn("Could not read live table doc before adding comanda:", err);
  }

  const mergedComandas = deduplicateComandas([...liveComandas, newComanda]);

  const tableDataToSave = cleanUndefined({
    id: tableId,
    label: tableInfo?.label || "1",
    zone: tableInfo?.zone || "Salón Principal",
    tenantId: currentTenant,
    status: "occupied",
    comandas: mergedComandas,
    folioInterno: finalFolioInterno,
    updatedAt: getMexicoISOString(),
  });

  await runWrite(
    setDoc(tableRef, tableDataToSave, { merge: true }),
  );

  if (folioInterno) {
    try {
      const tenantRef = doc(db, "tenants", currentTenant);
      await runWrite(updateDoc(tenantRef, { lastInternalFolio: folioInterno }));
    } catch (err) {
      console.warn("No se pudo actualizar lastInternalFolio en tenant doc:", err);
    }
  }

  return folio;
}

export async function cancelComandaItemInFirebase(
  tableId: string,
  tableInfo: any,
  folio: number,
  productId: string,
  plate: number,
  reason: string,
  user: any,
) {
  const tableRef = doc(db, "tables", tableId);
  const now = getMexicoISOString();

  const newComandas = tableInfo.comandas.map((c: any) => {
    if (c.folio === folio) {
      return {
        ...c,
        updatedAt: now,
        items: c.items.map((item: any) => {
          if (
            item.product.id === productId &&
            item.plate === plate &&
            !item.isCancelled
          ) {
            return {
              ...item,
              isCancelled: true,
              cancellationReason: reason,
              cancelledBy: user,
            };
          }
          return item;
        }),
      };
    }
    return c;
  });

  const hasActiveItems = newComandas.some((c: any) => 
    c.items && c.items.some((item: any) => !item.isCancelled)
  );

  if (!hasActiveItems) {
    await runWrite(
      updateDoc(tableRef, {
        status: "available",
        comandas: [],
        waiterId: null,
        folioInterno: deleteField(),
        updatedAt: now,
      }),
    );
  } else {
    await runWrite(
      updateDoc(tableRef, {
        comandas: cleanUndefined(newComandas),
        updatedAt: now,
      }),
    );
  }
}

export async function cancelEntireComandaInFirebase(
  tableId: string,
  tableInfo: any,
  folio: number,
  reason: string,
  user: any,
) {
  const tableRef = doc(db, "tables", tableId);
  const now = getMexicoISOString();

  const newComandas = (tableInfo.comandas || []).map((c: any) => {
    if (c.folio === folio) {
      return {
        ...c,
        isPendingCancellation: false,
        pendingCancellationReason: null,
        updatedAt: now,
        items: (c.items || []).map((item: any) => ({
          ...item,
          isCancelled: true,
          isPendingCancellation: false,
          cancellationReason: reason,
          cancelledBy: user,
        })),
      };
    }
    return c;
  });

  const hasActiveItems = newComandas.some((c: any) => 
    c.items && c.items.some((item: any) => !item.isCancelled)
  );

  if (!hasActiveItems) {
    await runWrite(
      updateDoc(tableRef, {
        status: "available",
        comandas: [],
        waiterId: null,
        folioInterno: deleteField(),
        updatedAt: now,
      }),
    );
  } else {
    await runWrite(
      updateDoc(tableRef, {
        comandas: cleanUndefined(newComandas),
        updatedAt: now,
      }),
    );
  }
}

export async function cancelClosedAccountInFirebase(
  accountId: string,
  reason: string,
  user: any,
) {
  const accountRef = doc(db, "history", accountId);
  await runWrite(
    updateDoc(accountRef, {
      status: "cancelled",
      cancellationReason: reason,
      cancelledBy: cleanUndefined(user),
      isPendingCancellation: false,
      pendingCancellationReason: null,
      updatedAt: getMexicoISOString(),
    })
  );
}

export async function confirmPaymentInFirebase(
  accountId: string,
  paymentData: {
    isPaid: boolean;
    tip: number;
    discount: number;
    total: number;
    paymentMethod: string;
    cardLastFour?: string;
    cardType?: string;
    requiresInvoice?: boolean;
    invoicePhone?: string;
  }
) {
  console.log("Firestore: Updating account:", accountId, "with data:", paymentData);
  const accountRef = doc(db, "history", accountId);
  await runWrite(
    updateDoc(accountRef, {
      ...paymentData,
      updatedAt: getMexicoISOString(),
    })
  );
  console.log("Firestore: Update successful.");
}

export async function updateInvoiceRequirementInFirebase(
  accountId: string,
  requiresInvoice: boolean,
  invoicePhone?: string
) {
  const accountRef = doc(db, "history", accountId);
  await runWrite(
    updateDoc(accountRef, {
      requiresInvoice,
      invoicePhone: invoicePhone || "",
      updatedAt: getMexicoISOString(),
    })
  );
}

export async function updateClosedAccountDeliveryStatusInFirebase(
  accountId: string,
  deliveryStatus: "en_camino" | "entregado" | "no_entregado",
  isPaid?: boolean
) {
  const accountRef = doc(db, "history", accountId);
  const payload: any = {
    deliveryStatus,
    updatedAt: getMexicoISOString(),
  };
  if (typeof isPaid === "boolean") {
    payload.isPaid = isPaid;
  }
  await runWrite(
    updateDoc(accountRef, payload)
  );
}

export async function moveItemsBetweenTablesInFirebase(
  sourceTableId: string,
  sourceComandas: any[],
  targetTableId: string,
  targetComandas: any[],
  targetStatus: string
) {
  const batch = writeBatch(db);
  
  const hasActiveItems = sourceComandas.some((c: any) => 
    c.items && c.items.some((item: any) => !item.isCancelled)
  );

  const sourceRef = doc(db, "tables", sourceTableId);
  if (!hasActiveItems) {
    batch.update(sourceRef, {
      status: "available",
      comandas: [],
      waiterId: null,
      folioInterno: deleteField(),
      updatedAt: getMexicoISOString(),
    });
  } else {
    batch.update(sourceRef, {
      comandas: cleanUndefined(sourceComandas),
      updatedAt: getMexicoISOString(),
    });
  }

  const targetRef = doc(db, "tables", targetTableId);
  const targetFolio = targetComandas.find((c: any) => c.folioInterno)?.folioInterno || null;
  batch.update(targetRef, {
    status: targetStatus,
    comandas: cleanUndefined(targetComandas),
    folioInterno: targetFolio || deleteField(),
    updatedAt: getMexicoISOString(),
  });

  await runWrite(batch.commit());
}

export async function transferEntireTableInFirebase(
  sourceTableId: string,
  targetTableId: string,
  targetComandas: any[],
  targetStatus: string = "occupied"
) {
  const batch = writeBatch(db);

  const sourceRef = doc(db, "tables", sourceTableId);
  batch.update(sourceRef, {
    status: "available",
    comandas: [],
    waiterId: null,
    folioInterno: deleteField(),
    updatedAt: getMexicoISOString(),
  });

  const targetRef = doc(db, "tables", targetTableId);
  const targetFolio = targetComandas.find((c: any) => c.folioInterno)?.folioInterno || null;
  batch.update(targetRef, {
    status: targetStatus,
    comandas: cleanUndefined(targetComandas),
    folioInterno: targetFolio || deleteField(),
    updatedAt: getMexicoISOString(),
  });

  await runWrite(batch.commit());
}

export async function checkoutTableInFirebase(
  tableId: string,
  tableInfo: any,
  checkoutData: any,
) {
  // Safety check: prevent checkout if no comandas and not a cancellation
  if (checkoutData.status !== "cancelled" && (!tableInfo.comandas || tableInfo.comandas.length === 0)) {
    console.warn("Prevented $0.00 checkout on empty table:", tableId);
    return; // Silently ignore or could throw error
  }

  const historyRef = doc(collection(db, "history"));
  const closedId = historyRef.id;
  const currentTenant = tableInfo.tenantId || getCurrentTenantId();
  const now = getMexicoISOString();

  const closedAccount = injectTenant(
    cleanUndefined({
      ...checkoutData,
      id: closedId,
      uid: closedId,
      timestamp: now,
      updatedAt: now,
      comandas: tableInfo.comandas || [],
      zone: tableInfo.zone || null,
      deliveryClientName: tableInfo.zone === "Servicio a Domicilio" ? (tableInfo.deliveryClientName || null) : null,
      deliveryClientPhone: tableInfo.zone === "Servicio a Domicilio" ? (tableInfo.deliveryClientPhone || null) : null,
      deliveryAddress: tableInfo.zone === "Servicio a Domicilio" ? (tableInfo.deliveryAddress || null) : null,
      deliveryNotes: tableInfo.zone === "Servicio a Domicilio" ? (tableInfo.deliveryNotes || null) : null,
      deliveryStatus: tableInfo.zone === "Servicio a Domicilio" ? (tableInfo.deliveryStatus || "en_camino") : null,
    }),
  );



  const batch = writeBatch(db);
  batch.set(historyRef, closedAccount);

  const tableRef = doc(db, "tables", tableId);
  batch.update(tableRef, {
    status: "available",
    waiterId: null,
    comandas: [],
    folioInterno: deleteField(),
    updatedAt: now,
    deliveryClientName: null,
    deliveryClientPhone: null,
    deliveryAddress: null,
    deliveryNotes: null,
    deliveryStatus: null,
  });

  // Calculate inventory deductions
  const deductions: Record<string, { qty: number; productsSold: string }> = {};
  for (const comanda of tableInfo.comandas || []) {
    for (const item of comanda.items || []) {
      if (item.isCancelled) continue;
      // if product has recipe
      if (item.product?.recipe) {
        for (const ing of item.product.recipe) {
          const key = ing.inventoryItemId;
          if (!deductions[key]) {
            deductions[key] = { qty: 0, productsSold: "" };
          }
          deductions[key].qty += ing.quantity * item.quantity;
          const pName = item.product.name;
          deductions[key].productsSold = deductions[key].productsSold
            ? `${deductions[key].productsSold}, ${item.quantity}x ${pName}`
            : `${item.quantity}x ${pName}`;
        }
      }
    }
  }

  // To update stock and record movements
  for (const invId of Object.keys(deductions)) {
    const invRef = doc(db, "inventory", invId);
    batch.update(invRef, {
      stock: increment(-deductions[invId].qty),
      updatedAt: now,
    });

    // Record automatic discount movement
    const mRef = doc(collection(db, "inventory_movements"));
    batch.set(
      mRef,
      injectTenant({
        id: mRef.id,
        uid: mRef.id,
        timestamp: now,
        updatedAt: now,
        inventoryItemId: invId,
        type: "venta",
        qty: -deductions[invId].qty,
        concept: `Descuento automático por platillos: ${deductions[invId].productsSold}`,
        executedBy: checkoutData.checkedOutBy?.name || "Cajero",
      }),
    );
  }

  await runWrite(batch.commit());
}

export async function releaseTableInFirebase(tableId: string) {
  const tableRef = doc(db, "tables", tableId);
  await runWrite(
    updateDoc(tableRef, {
      status: "available",
      comandas: [],
      waiterId: null,
      folioInterno: deleteField(),
      updatedAt: getMexicoISOString(),
    })
  );
}

export async function syncLocalDataToFirebase(
  products: any[],
  tables: any[],
  history: any[],
) {
  // Basic single migration, assuming empty db
  const batch = writeBatch(db);

  products.forEach((p) => {
    batch.set(doc(db, "products", p.id), p);
  });

  tables.forEach((t) => {
    batch.set(doc(db, "tables", t.id), {
      ...t,
      comandas: t.comandas.map((c: any) => ({
        ...c,
        timestamp:
          c.timestamp instanceof Date ? c.timestamp.toISOString() : c.timestamp,
      })),
    });
  });

  history.forEach((h) => {
    batch.set(doc(db, "history", h.id), {
      ...h,
      timestamp:
        h.timestamp instanceof Date ? h.timestamp.toISOString() : h.timestamp,
    });
  });

  // Default users
  const seedUsers = [
    {
      id: "m1",
      name: "Mesero 1",
      role: "mesero",
      pin: "1111",
      avatar: "fa-solid fa-bell-concierge",
    },
    {
      id: "m2",
      name: "Mesero 2",
      role: "mesero",
      pin: "2222",
      avatar: "fa-solid fa-bell-concierge",
    },
    {
      id: "m3",
      name: "Mesero 3",
      role: "mesero",
      pin: "3333",
      avatar: "fa-solid fa-bell-concierge",
    },
    {
      id: "c1",
      name: "Cajero 1",
      role: "cajero",
      pin: "4444",
      avatar: "fa-solid fa-cash-register",
    },
    {
      id: "a1",
      name: "Admin 1",
      role: "admin",
      pin: "6666",
      avatar: "fa-solid fa-user-tie",
    },
  ];
  seedUsers.forEach((u) => batch.set(doc(db, "users", u.id), u));

  await batch.commit();
}

export async function bulkAddProductsToFirebase(
  products: any[],
  reset: boolean = false,
  tenantId?: string,
) {
  const batch = writeBatch(db);
  const currentTenant = tenantId || getCurrentTenantId();

  if (reset) {
    // ONLY delete products for the CURRENT active tenant!
    const q = query(
      collection(db, "products"),
      where("tenantId", "==", currentTenant),
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach((d) => {
      batch.delete(d.ref);
    });
  }

  products.forEach((p) => {
    // Generate a tenant-prefixed ID to guarantee no document overwrite or crosstalk between firms ⚡
    const rawId =
      p.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const id = rawId.startsWith(`prod_${currentTenant}_`)
      ? rawId
      : `prod_${currentTenant}_${rawId}`;
    const ref = doc(db, "products", id);

    // Inject the tenant and create clean payload
    const data = injectTenant({
      ...p,
      id,
      uid: id,
      updatedAt: getMexicoISOString(),
    });
    batch.set(ref, data);
  });

  await batch.commit();
}

export async function migrateAvatarsInFirebase() {
  const q = query(collection(db, "users"));
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  let updated = false;

  snapshot.docs.forEach((d) => {
    const data = d.data();
    if (data.avatar && !data.avatar.includes("fa-")) {
      let faIcon = "fa-solid fa-user";
      if (data.role === "admin") faIcon = "fa-solid fa-user-tie";
      else if (data.role === "cajero") faIcon = "fa-solid fa-cash-register";
      else if (data.role === "mesero") faIcon = "fa-solid fa-bell-concierge";

      batch.update(d.ref, {
        avatar: faIcon,
      });
      updated = true;
    }
  });

  if (updated) {
    await batch.commit();
  }
}

export async function resetAllSystemsInFirebase(tenantId?: string) {
  const currentTenant = tenantId || getCurrentTenantId();

  // Collections that are isolated by tenantId
  const tenantCollections = [
    "products",
    "history",
    "cash_movements",
    "expenses",
    "inventory",
    "purchases",
  ];

  for (const coll of tenantCollections) {
    const q = query(
      collection(db, coll),
      where("tenantId", "==", currentTenant),
    );
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  // Also clear tables for current tenant
  const qTables = query(
    collection(db, "tables"),
    where("tenantId", "==", currentTenant),
  );
  const snapshotTables = await getDocs(qTables);
  const tablesBatch = writeBatch(db);
  snapshotTables.docs.forEach((d) => tablesBatch.delete(d.ref));
  await tablesBatch.commit();

  // Seed default products with injectTenant
  const defaultProducts = [
    {
      id: "e1",
      name: "Guacamole con Totopos",
      price: 65,
      category: "food",
      subcategory: "Entradas",
      destination: "kitchen",
    },
    {
      id: "e2",
      name: "Queso Fundido",
      price: 85,
      category: "food",
      subcategory: "Entradas",
      destination: "kitchen",
    },
    {
      id: "t1",
      name: "Taco al Pastor",
      price: 15,
      category: "food",
      subcategory: "Tacos",
      destination: "kitchen",
    },
    {
      id: "t2",
      name: "Taco de Bistec",
      price: 18,
      category: "food",
      subcategory: "Tacos",
      destination: "kitchen",
    },
    {
      id: "c1",
      name: "Café Americano",
      price: 25,
      category: "drinks",
      subcategory: "Café",
      destination: "bar",
    },
    {
      id: "ce1",
      name: "Cerveza Corona",
      price: 45,
      category: "drinks",
      subcategory: "Cerveza",
      destination: "bar",
    },
    {
      id: "s1",
      name: "Flan Napolitano",
      price: 35,
      category: "desserts",
      subcategory: "Postres",
      destination: "bar",
    },
  ];

  // Seed default tables for current tenant (We have initializeDefaultTablesForTenant)
  await initializeDefaultTablesForTenant(currentTenant);

  // Seed default products with prefix and tenant injection!
  const seedBatch = writeBatch(db);
  defaultProducts.forEach((p) => {
    const id = `prod_${currentTenant}_${p.id}`;
    const ref = doc(db, "products", id);
    seedBatch.set(
      ref,
      injectTenant({
        ...p,
        id,
        uid: id,
        updatedAt: getMexicoISOString(),
      }),
    );
  });

  // Seed default users
  const defaultUsers = [
    {
      id: "m1",
      name: "Mesero 1",
      role: "mesero",
      pin: "1111",
      avatar: "fa-solid fa-bell-concierge",
    },
    {
      id: "m2",
      name: "Mesero 2",
      role: "mesero",
      pin: "2222",
      avatar: "fa-solid fa-bell-concierge",
    },
    {
      id: "m3",
      name: "Mesero 3",
      role: "mesero",
      pin: "3333",
      avatar: "fa-solid fa-bell-concierge",
    },
    {
      id: "c1",
      name: "Cajero 1",
      role: "cajero",
      pin: "4444",
      avatar: "fa-solid fa-cash-register",
    },
    {
      id: "c2",
      name: "Cajero 2",
      role: "cajero",
      pin: "5555",
      avatar: "fa-solid fa-cash-register",
    },
    {
      id: "a1",
      name: "Admin 1",
      role: "admin",
      pin: "6666",
      avatar: "fa-solid fa-user-tie",
    },
    {
      id: "a2",
      name: "Admin 2",
      role: "admin",
      pin: "7777",
      avatar: "fa-solid fa-user-tie",
    },
    {
      id: "a3",
      name: "Admin 3",
      role: "admin",
      pin: "8888",
      avatar: "fa-solid fa-user-tie",
    },
  ];
  defaultUsers.forEach((u) => {
    seedBatch.set(doc(db, "users", u.id), u);
  });

  await seedBatch.commit();
}

export async function resetSalesInFirebase() {
  const currentTenant = getCurrentTenantId();

  // 1. Delete history items for current tenant
  const qHistory = query(
    collection(db, "history"),
    where("tenantId", "==", currentTenant),
  );
  const snapshotHistory = await getDocs(qHistory);
  const batchHistory = writeBatch(db);
  snapshotHistory.docs.forEach((d) => batchHistory.delete(d.ref));
  await batchHistory.commit();

  // 2. Reset tables to 'available' and clear comandas for the current tenant only
  const qTables = query(
    collection(db, "tables"),
    where("tenantId", "==", currentTenant),
  );
  const snapshotTables = await getDocs(qTables);
  const tablesBatch = writeBatch(db);
  snapshotTables.docs.forEach((d) => {
    tablesBatch.update(d.ref, {
      status: "available",
      waiterId: null,
      comandas: [],
    });
  });
  await tablesBatch.commit();

  // 3. Clear all transaction and cash/expense collections for current tenant
  const extraCollectionsToReset = [
    "cash_movements",
    "expenses",
    "purchases",
    "inventory_movements",
    "arqueos",
  ];

  for (const collName of extraCollectionsToReset) {
    try {
      const qColl = query(
        collection(db, collName),
        where("tenantId", "==", currentTenant),
      );
      const snapshotColl = await getDocs(qColl);
      if (!snapshotColl.empty) {
        const batchColl = writeBatch(db);
        snapshotColl.docs.forEach((d) => batchColl.delete(d.ref));
        await batchColl.commit();
      }
    } catch (e) {
      console.warn(`Error resetting collection ${collName} in Firestore:`, e);
    }
  }
}

export async function deleteHistoryItemFromFirebase(id: string) {
  const ref = doc(db, "history", id);
  await runWrite(deleteDoc(ref));
}

export function subscribeToCashMovements(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "cash_movements"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const movements = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Sort in client
      movements.sort((a: any, b: any) => {
        const timeA = a.date ? new Date(a.date).getTime() : 0;
        const timeB = b.date ? new Date(b.date).getTime() : 0;
        return timeB - timeA;
      });
      callback(movements);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "cash_movements");
    }
  );
}

export async function addCashMovementToFirebase(movement: any) {
  const ref = doc(collection(db, "cash_movements"));
  const now = getMexicoISOString();
  await runWrite(
    setDoc(
      ref,
      injectTenant({
        ...movement,
        id: ref.id,
        uid: ref.id,
        date: now,
        updatedAt: now,
      }),
    ),
  );
}

export function subscribeToSuppliers(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "suppliers"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const suppliers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(suppliers);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "suppliers");
    }
  );
}

export async function addSupplierToFirebase(supplier: any) {
  const ref = doc(collection(db, "suppliers"));
  await runWrite(
    setDoc(
      ref,
      injectTenant({
        ...supplier,
        id: ref.id,
        uid: ref.id,
        createdAt: getMexicoISOString(),
        updatedAt: getMexicoISOString(),
      }),
    ),
  );
}

export async function updateSupplierInFirebase(id: string, supplier: any) {
  const ref = doc(db, "suppliers", id);
  await runWrite(
    updateDoc(ref, { ...supplier, updatedAt: getMexicoISOString() }),
  );
}

export async function deleteSupplierFromFirebase(id: string) {
  const ref = doc(db, "suppliers", id);
  await runWrite(deleteDoc(ref));
}

export function subscribeToCustomers(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "customers"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const customers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      callback(customers);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "customers");
    }
  );
}

export async function addCustomerToFirebase(customer: any) {
  const ref = doc(collection(db, "customers"));
  await runWrite(
    setDoc(
      ref,
      injectTenant({
        ...customer,
        id: ref.id,
        uid: ref.id,
        visits: customer.visits !== undefined ? customer.visits : 0,
        addresses: customer.addresses || [],
        createdAt: getMexicoISOString(),
        updatedAt: getMexicoISOString(),
      }),
    ),
  );
  return ref.id;
}

export async function updateCustomerInFirebase(id: string, customer: any) {
  const ref = doc(db, "customers", id);
  await runWrite(
    updateDoc(ref, { 
      ...customer, 
      addresses: customer.addresses || [],
      updatedAt: getMexicoISOString() 
    }),
  );
}

export async function deleteCustomerFromFirebase(id: string) {
  const ref = doc(db, "customers", id);
  await runWrite(deleteDoc(ref));
}

export async function updateTableDeliveryInfoInFirebase(
  tableId: string,
  deliveryInfo: {
    deliveryClientName: string | null;
    deliveryClientPhone: string | null;
    deliveryAddress: string | null;
    deliveryNotes?: string | null;
  } | null
) {
  const tableRef = doc(db, "tables", tableId);
  await runWrite(
    updateDoc(tableRef, {
      deliveryClientName: deliveryInfo?.deliveryClientName || null,
      deliveryClientPhone: deliveryInfo?.deliveryClientPhone || null,
      deliveryAddress: deliveryInfo?.deliveryAddress || null,
      deliveryNotes: deliveryInfo?.deliveryNotes || null,
      updatedAt: getMexicoISOString(),
    })
  );
}

export function subscribeToInventoryMovements(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "inventory_movements"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const movements = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Sort in client
      movements.sort((a: any, b: any) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      callback(movements);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "inventory_movements");
    }
  );
}

export async function addInventoryMovementToFirebase(movement: any) {
  const ref = doc(collection(db, "inventory_movements"));
  const batch = writeBatch(db);

  const mov = injectTenant({
    ...movement,
    id: ref.id,
    uid: ref.id,
    timestamp: getMexicoISOString(),
    updatedAt: getMexicoISOString(),
  });

  batch.set(ref, mov);

  // Update original stock
  const invRef = doc(db, "inventory", movement.inventoryItemId);
  batch.update(invRef, {
    stock: increment(movement.qty),
    updatedAt: getMexicoISOString(),
  });

  await runWrite(batch.commit());
}

export function subscribeToArqueos(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "arqueos"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const arqueos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      // Sort in client
      arqueos.sort((a: any, b: any) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      callback(arqueos);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "arqueos");
    }
  );
}

export async function addArqueoToFirebase(arqueo: any) {
  const ref = doc(collection(db, "arqueos"));
  const now = getMexicoISOString();
  await runWrite(
    setDoc(
      ref,
      injectTenant({
        ...arqueo,
        id: ref.id,
        uid: ref.id,
        timestamp: now,
        updatedAt: now,
      }),
    ),
  );
}

export function subscribeToPrinterQueue(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "tenants", tenantId, "pedidos")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const pedidos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      // Sort in memory by timestamp descending
      pedidos.sort((a: any, b: any) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      callback(pedidos);
    },
    (error) => {
      console.warn("Firestore subscribeToPrinterQueue error:", error);
    }
  );
}

export async function deletePedidoFromPrinter(tenantId: string, pedidoId: string) {
  const ref = doc(db, "tenants", tenantId, "pedidos", pedidoId);
  await runWrite(deleteDoc(ref));
}

export async function updatePedidoInFirebase(tenantId: string, pedidoId: string, data: any) {
  const ref = doc(db, "tenants", tenantId, "pedidos", pedidoId);
  await runWrite(updateDoc(ref, data));
}

function parseDocDateForDeletion(val: any): string {
  if (!val) return "";
  try {
    if (typeof val === "string") return val.split("T")[0];
    if (typeof val === "number") return new Date(val).toISOString().split("T")[0];
    if (typeof val === "object" && typeof val.toDate === "function") {
      return val.toDate().toISOString().split("T")[0];
    }
  } catch (e) {
    console.error("Error parsing doc date:", e);
  }
  return "";
}

export async function deleteCurrentCorteInFirebase(tenantId: string) {
  if (!tenantId) return;
  const today = getMexicoISOString().split("T")[0];
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = yesterdayDate.toISOString().split("T")[0];

  let opsCount = 0;
  let batch = writeBatch(db);

  const commitBatchIfNeeded = async (force = false) => {
    opsCount++;
    if (opsCount >= 350 || (force && opsCount > 0)) {
      await batch.commit();
      batch = writeBatch(db);
      opsCount = 0;
    }
  };

  const isRecentDate = (dStr: string) => {
    if (!dStr) return false;
    return dStr === today || dStr === yesterday;
  };

  // 1. Reset all tables for this tenant
  try {
    const tablesRef = collection(db, "tables");
    const qTables = query(tablesRef, where("tenantId", "==", tenantId));
    const tablesSnap = await getDocs(qTables);
    for (const docSnap of tablesSnap.docs) {
      batch.update(docSnap.ref, {
        status: "available",
        comandas: [],
        waiterId: null,
        activeAccount: null,
        accountClosed: false,
        accountPrinted: false,
        updatedAt: getMexicoISOString()
      });
      await commitBatchIfNeeded();
    }
  } catch (e) {
    console.warn("Could not reset tables:", e);
  }

  // 2. Clear printer queue for this tenant
  try {
    const pedidosRef = collection(db, "tenants", tenantId, "pedidos");
    const pedidosSnap = await getDocs(pedidosRef);
    for (const docSnap of pedidosSnap.docs) {
      batch.delete(docSnap.ref);
      await commitBatchIfNeeded();
    }
  } catch (e) {
    console.warn("Could not clear pedidos:", e);
  }

  // 3. Clear recent history for this tenant
  try {
    const historyRef = collection(db, "history");
    const qHistory = query(historyRef, where("tenantId", "==", tenantId));
    const historySnap = await getDocs(qHistory);
    for (const docSnap of historySnap.docs) {
      const data = docSnap.data();
      const date = parseDocDateForDeletion(data.timestamp || data.closedAt || data.date || data.createdAt);
      if (!date || isRecentDate(date)) {
        batch.delete(docSnap.ref);
        await commitBatchIfNeeded();
      }
    }
  } catch (e) {
    console.warn("Could not clear history:", e);
  }

  // 4. Clear recent cash movements for this tenant
  try {
    const movementsRef = collection(db, "cash_movements");
    const qMovements = query(movementsRef, where("tenantId", "==", tenantId));
    const movementsSnap = await getDocs(qMovements);
    for (const docSnap of movementsSnap.docs) {
      const data = docSnap.data();
      const date = parseDocDateForDeletion(data.timestamp || data.date || data.createdAt);
      if (!date || isRecentDate(date)) {
        batch.delete(docSnap.ref);
        await commitBatchIfNeeded();
      }
    }
  } catch (e) {
    console.warn("Could not clear cash movements:", e);
  }

  // 5. Clear recent expenses for this tenant
  try {
    const expRef = collection(db, "expenses");
    const qExp = query(expRef, where("tenantId", "==", tenantId));
    const expSnap = await getDocs(qExp);
    for (const docSnap of expSnap.docs) {
      const data = docSnap.data();
      const date = parseDocDateForDeletion(data.timestamp || data.date || data.createdAt);
      if (!date || isRecentDate(date)) {
        batch.delete(docSnap.ref);
        await commitBatchIfNeeded();
      }
    }
  } catch (e) {
    console.warn("Could not clear expenses:", e);
  }

  // 6. Clear recent arqueos for this tenant
  try {
    const arqRef = collection(db, "arqueos");
    const qArq = query(arqRef, where("tenantId", "==", tenantId));
    const arqSnap = await getDocs(qArq);
    for (const docSnap of arqSnap.docs) {
      const data = docSnap.data();
      const date = parseDocDateForDeletion(data.timestamp || data.date || data.createdAt);
      if (!date || isRecentDate(date)) {
        batch.delete(docSnap.ref);
        await commitBatchIfNeeded();
      }
    }
  } catch (e) {
    console.warn("Could not clear arqueos:", e);
  }

  // 7. Delete all open / recent cashier sessions for this tenant
  try {
    const sessionRef = collection(db, "cashier_sessions_v2");
    const qSession = query(sessionRef, where("tenantId", "==", tenantId));
    const sessionSnap = await getDocs(qSession);
    for (const docSnap of sessionSnap.docs) {
      const data = docSnap.data();
      const date = parseDocDateForDeletion(data.openedAt || data.timestamp || data.date);
      if (data.status === "open" || isRecentDate(date) || docSnap.id.includes(tenantId)) {
        batch.delete(docSnap.ref);
        await commitBatchIfNeeded();
      }
    }
  } catch (e) {
    console.warn("Could not clear cashier sessions:", e);
  }

  // Commit remaining writes
  await commitBatchIfNeeded(true);
}

export async function deleteAllTenantHistoryInFirebase(tenantId: string) {
  // This is a powerful action, we'll do it in chunks if necessary, but for now filtered by tenant
  const collectionsToDelete = [
    "history", 
    "cashier_sessions_v2", 
    "arqueos", 
    "cash_movements", 
    "inventory_movements",
    "expenses"
  ];

  for (const collName of collectionsToDelete) {
    const q = query(collection(db, collName), where("tenantId", "==", tenantId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  }

  // Also reset current active state
  await deleteCurrentCorteInFirebase(tenantId);
}

export function subscribeToTenants(callback: (data: any[]) => void) {
  const q = query(collection(db, "tenants"), orderBy("name"));
  return onSnapshot(
    q,
    (snapshot) => {
      const tenants = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      callback(tenants);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "tenants");
    }
  );
}

export async function addTenantToFirebase(tenantData: any) {
  const ref = doc(db, "tenants", tenantData.id);
  await runWrite(
    setDoc(
      ref,
      cleanUndefined({
        ...tenantData,
        updatedAt: getMexicoISOString(),
      }),
      { merge: true }
    ),
  );
}

export async function deleteTenantFromFirebase(id: string) {
  const ref = doc(db, "tenants", id);
  await runWrite(deleteDoc(ref));
}

export async function getCompanyConfig(
  tenantId: string,
) {
  const docRef = doc(db, "settings", `companyConfig_${tenantId}`);
  try {
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      return null;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Missing or insufficient permissions")) {
      console.warn(`Permission denied for settings/companyConfig_${tenantId}`);
      return null;
    } else {
      console.error("Firestore getCompanyConfig error:", error);
      return null;
    }
  }
}

export async function saveCompanyConfigInFirebase(
  tenantId: string,
  config: any,
) {
  const docRef = doc(db, "settings", `companyConfig_${tenantId}`);
  await runWrite(
    setDoc(
      docRef,
      {
        ...config,
        updatedAt: getMexicoISOString(),
      },
      { merge: true }
    ),
  );
}

export function subscribeToCompanyConfig(
  tenantId: string,
  callback: (data: any) => void,
) {
  const docRef = doc(db, "settings", `companyConfig_${tenantId}`);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      } else {
        callback(null);
      }
    },
    (error) => {
      console.error("Firestore subscribeToCompanyConfig error:", error);
      handleFirestoreError(error, OperationType.GET, `settings/companyConfig_${tenantId}`);
    }
  );
}

export function subscribeToCashierSessions(
  tenantId: string,
  callback: (data: any[]) => void,
  onError?: (error: any) => void,
) {
  const q = query(
    collection(db, "cashier_sessions_v2"),
    where("tenantId", "==", tenantId),
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const sessions = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Sort in client
      sessions.sort((a: any, b: any) => {
        const timeA = a.openedAt ? new Date(a.openedAt).getTime() : 0;
        const timeB = b.openedAt ? new Date(b.openedAt).getTime() : 0;
        return timeB - timeA;
      });
      callback(sessions);
    },
    (error) => {
      console.error("Firestore subscribeToCashierSessions error:", error);
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, "cashier_sessions_v2");
    },
  );
}

export async function addCashierSessionToFirebase(data: any) {
  const dataWithTenant = injectTenant(
    cleanUndefined({ ...data, updatedAt: getMexicoISOString() }),
  );
  return runWrite(
    setDoc(
      doc(collection(db, "cashier_sessions_v2"), data.id || Date.now().toString()),
      dataWithTenant,
      { merge: true }
    ),
  );
}

export async function updateCashierSessionInFirebase(id: string, data: any) {
  const ref = doc(db, "cashier_sessions_v2", id);
  const dataWithTenant = injectTenant(
    cleanUndefined({ ...data, updatedAt: getMexicoISOString() })
  );
  return runWrite(
    setDoc(
      ref,
      dataWithTenant,
      { merge: true }
    ),
  );
}

export async function deleteCashierSessionFromFirebase(id: string) {
  const ref = doc(db, "cashier_sessions_v2", id);
  return runWrite(deleteDoc(ref));
}

export async function exportCashierSessionToTargetTenant({
  sourceSession,
  targetTenantId,
  sessionHistory = [],
  sessionMovements = [],
  sessionExpenses = [],
  sessionPurchases = [],
  existingSessions = [],
}: {
  sourceSession: any;
  targetTenantId: string;
  sessionHistory?: any[];
  sessionMovements?: any[];
  sessionExpenses?: any[];
  sessionPurchases?: any[];
  existingSessions?: any[];
}): Promise<{ targetSessionId: string; totalExportedItems: number }> {
  if (!sourceSession || !targetTenantId) {
    throw new Error("Parámetros de exportación inválidos (sesión de origen o inquilino destino faltante).");
  }

  const sourceTenantId = sourceSession.tenantId || "tenant-1";
  if (sourceTenantId === targetTenantId) {
    throw new Error("El inquilino de origen y de destino no pueden ser el mismo.");
  }

  // 1. Determine Target Session ID and date matching key
  let datePart = "";
  if (sourceSession.id && sourceSession.id.startsWith("day-")) {
    datePart = sourceSession.id.split("-").slice(-3).join("-");
  }
  if (!datePart || datePart.length !== 10 || !datePart.includes("-")) {
    const dateVal = sourceSession.closedAt || sourceSession.openedAt || getMexicoISOString();
    datePart = getOperatingDay(dateVal);
  }

  const targetSessionId = `day-${targetTenantId}-${datePart}`;

  // 2. Validate that destination is empty (no existing session for that day/slot in target tenant)
  const isOccupiedInLocal = existingSessions.some(
    (s: any) =>
      (s.tenantId || "tenant-1") === targetTenantId &&
      (s.id === targetSessionId ||
        s.id.endsWith(`-${datePart}`) ||
        (s.closedAt || s.openedAt || "").split("T")[0] === datePart)
  );

  if (isOccupiedInLocal) {
    throw new Error(
      `El inquilino de destino ya cuenta con un corte de caja registrado para esta fecha (${datePart}). Para evitar sobreescritura o duplicados contables, la operación ha sido cancelada.`
    );
  }

  // Query Firestore to verify destination in database
  try {
    const targetSessionRef = doc(db, "cashier_sessions_v2", targetSessionId);
    const docSnap = await getDoc(targetSessionRef);
    if (docSnap.exists()) {
      throw new Error(
        `El inquilino de destino ya cuenta con un registro de turno con ID (${targetSessionId}) en la base de datos. La exportación se canceló para evitar duplicados.`
      );
    }
  } catch (err: any) {
    if (err.message && err.message.includes("registrado")) {
      throw err;
    }
    // Ignore permissions/offline query errors and continue
  }

  // 3. Prepare Batch Writes to create exact copies in destination tenant
  let batch = writeBatch(db);
  let opCount = 0;

  const commitBatchIfNeeded = async () => {
    if (opCount >= 450) {
      await runWrite(batch.commit());
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  // A. Copy Session Header
  const targetSessionData = cleanUndefined({
    ...sourceSession,
    id: targetSessionId,
    tenantId: targetTenantId,
    exportedFromTenantId: sourceTenantId,
    exportedAt: getMexicoISOString(),
    updatedAt: getMexicoISOString(),
  });

  const sessionDocRef = doc(db, "cashier_sessions_v2", targetSessionId);
  batch.set(sessionDocRef, targetSessionData);
  opCount++;

  let totalItemsCopied = 0;

  // B. Copy Session History (Closed accounts / Sales)
  for (const item of sessionHistory) {
    const newId = `hist_${targetTenantId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const itemCopy = cleanUndefined({
      ...item,
      id: newId,
      originalHistoryId: item.id,
      tenantId: targetTenantId,
      sessionId: targetSessionId,
      exportedAt: getMexicoISOString(),
    });
    const itemRef = doc(db, "history", newId);
    batch.set(itemRef, itemCopy);
    opCount++;
    totalItemsCopied++;
    await commitBatchIfNeeded();
  }

  // C. Copy Cash Movements (Inflows / Outflows)
  for (const mov of sessionMovements) {
    const newId = `mov_${targetTenantId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const movCopy = cleanUndefined({
      ...mov,
      id: newId,
      originalMovementId: mov.id,
      tenantId: targetTenantId,
      sessionId: targetSessionId,
      exportedAt: getMexicoISOString(),
    });
    const movRef = doc(db, "cash_movements", newId);
    batch.set(movRef, movCopy);
    opCount++;
    totalItemsCopied++;
    await commitBatchIfNeeded();
  }

  // D. Copy Expenses
  for (const exp of sessionExpenses) {
    const newId = `exp_${targetTenantId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const expCopy = cleanUndefined({
      ...exp,
      id: newId,
      originalExpenseId: exp.id,
      tenantId: targetTenantId,
      sessionId: targetSessionId,
      exportedAt: getMexicoISOString(),
    });
    const expRef = doc(db, "expenses", newId);
    batch.set(expRef, expCopy);
    opCount++;
    totalItemsCopied++;
    await commitBatchIfNeeded();
  }

  // E. Copy Purchases
  for (const purch of sessionPurchases) {
    const newId = `pur_${targetTenantId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const purchCopy = cleanUndefined({
      ...purch,
      id: newId,
      originalPurchaseId: purch.id,
      tenantId: targetTenantId,
      sessionId: targetSessionId,
      exportedAt: getMexicoISOString(),
    });
    const purchRef = doc(db, "purchases", newId);
    batch.set(purchRef, purchCopy);
    opCount++;
    totalItemsCopied++;
    await commitBatchIfNeeded();
  }

  if (opCount > 0) {
    await runWrite(batch.commit());
  }

  return {
    targetSessionId,
    totalExportedItems: totalItemsCopied,
  };
}


export function subscribeToExpenses(
  tenantId: string,
  callback: (data: any[]) => void,
) {
  const q = query(
    collection(db, "expenses"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const expenses = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Sort in client
      expenses.sort((a: any, b: any) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      callback(expenses);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "expenses");
    }
  );
}

export async function addExpenseToFirebase(expense: any) {
  const ref = doc(collection(db, "expenses"));
  const uuid = generateUUID();
  const now = getMexicoISOString();
  await runWrite(
    setDoc(
      ref,
      injectTenant({
        ...expense,
        id: ref.id,
        uuid: uuid,
        createdAt: now,
        updatedAt: now,
      }),
    ),
  );
}

export async function updateExpenseInFirebase(id: string, expense: any) {
  const ref = doc(db, "expenses", id);
  await runWrite(
    updateDoc(ref, {
      ...expense,
      updatedAt: getMexicoISOString(),
    }),
  );
}

export async function deleteExpenseFromFirebase(id: string) {
  const ref = doc(db, "expenses", id);
  await runWrite(deleteDoc(ref));
}

export async function initializeDefaultTablesForTenant(tenantId: string) {
  if (!tenantId) return;
  const q = query(collection(db, "tables"), where("tenantId", "==", tenantId));
  const snapshot = await getDocs(q);

  const existingKeys = new Set<string>();
  const existingIds = new Set<string>();

  snapshot.docs.forEach((d) => {
    const data = d.data();
    existingIds.add(d.id);
    let zone = data.zone || "Salón Principal";
    if (zone === "A Domicilio") zone = "Servicio a Domicilio";
    let rawLabel = String(data.label || "").trim();
    let label = rawLabel.replace(/^mesa\s*/i, "").trim();
    if (label) {
      existingKeys.add(`${zone}::${label}`);
    }
  });

  const batch = writeBatch(db);
  let count = 0;

  // 1. Salón Principal (Tables 1 - 25)
  for (let i = 1; i <= 25; i++) {
    const labelStr = `${i}`;
    const key = `Salón Principal::${labelStr}`;
    const docId = `table-${tenantId}-salon-${i}`;
    if (!existingKeys.has(key) && !existingIds.has(docId)) {
      const ref = doc(db, "tables", docId);
      batch.set(ref, {
        id: docId,
        uid: docId,
        label: labelStr,
        shape: "local",
        status: "available",
        waiterId: null,
        comandas: [],
        zone: "Salón Principal",
        tenantId: tenantId,
        updatedAt: getMexicoISOString(),
      });
      count++;
    }
  }

  // 2. Para Llevar (Tables P1 - P5)
  for (let i = 1; i <= 5; i++) {
    const labelStr = `P${i}`;
    const key = `Para Llevar::${labelStr}`;
    const docId = `table-${tenantId}-takeout-${i}`;
    if (!existingKeys.has(key) && !existingIds.has(docId)) {
      const ref = doc(db, "tables", docId);
      batch.set(ref, {
        id: docId,
        uid: docId,
        label: labelStr,
        shape: "takeout",
        status: "available",
        waiterId: null,
        comandas: [],
        zone: "Para Llevar",
        tenantId: tenantId,
        updatedAt: getMexicoISOString(),
      });
      count++;
    }
  }

  // 3. Servicio a Domicilio (Tables D1 - D5)
  for (let i = 1; i <= 5; i++) {
    const labelStr = `D${i}`;
    const key1 = `Servicio a Domicilio::${labelStr}`;
    const key2 = `A Domicilio::${labelStr}`;
    const docId = `table-${tenantId}-delivery-${i}`;
    if (!existingKeys.has(key1) && !existingKeys.has(key2) && !existingIds.has(docId)) {
      const ref = doc(db, "tables", docId);
      batch.set(ref, {
        id: docId,
        uid: docId,
        label: labelStr,
        shape: "delivery",
        status: "available",
        waiterId: null,
        comandas: [],
        zone: "Servicio a Domicilio",
        tenantId: tenantId,
        updatedAt: getMexicoISOString(),
      });
      count++;
    }
  }

  if (count > 0) {
    await runWrite(batch.commit());
  }
}

export async function initializeDefaultProductsForTenant(tenantId: string) {
  const defaultProducts = [
    {
      id: "e1",
      name: "Guacamole con Totopos",
      price: 65,
      category: "food",
      subcategory: "Entradas",
      destination: "kitchen",
    },
    {
      id: "e2",
      name: "Queso Fundido",
      price: 85,
      category: "food",
      subcategory: "Entradas",
      destination: "kitchen",
    },
    {
      id: "t1",
      name: "Taco al Pastor",
      price: 15,
      category: "food",
      subcategory: "Tacos",
      destination: "kitchen",
    },
    {
      id: "t2",
      name: "Taco de Bistec",
      price: 18,
      category: "food",
      subcategory: "Tacos",
      destination: "kitchen",
    },
    {
      id: "c1",
      name: "Café Americano",
      price: 25,
      category: "drinks",
      subcategory: "Café",
      destination: "bar",
    },
    {
      id: "ce1",
      name: "Cerveza Corona",
      price: 45,
      category: "drinks",
      subcategory: "Cerveza",
      destination: "bar",
    },
    {
      id: "s1",
      name: "Flan Napolitano",
      price: 35,
      category: "desserts",
      subcategory: "Postres",
      destination: "bar",
    },
  ];

  const batch = writeBatch(db);
  defaultProducts.forEach((p) => {
    const id = `prod_${tenantId}_${p.id}`;
    const ref = doc(db, "products", id);
    batch.set(ref, {
      ...p,
      id,
      uid: id,
      tenantId: tenantId,
      updatedAt: getMexicoISOString(),
    });
  });

  await runWrite(batch.commit());
}

export interface DeviceRequest {
  id: string;
  deviceId: string;
  deviceName: string;
  role: string;
  status: "pending" | "approved" | "rejected";
  requestTime: string;
  approvedTime?: string;
  assignedTenantId?: string;
  pin?: string;
  scheduleStart?: string;
  scheduleEnd?: string;
}

export function subscribeToDeviceRequests(
  callback: (requests: DeviceRequest[]) => void
) {
  const q = query(collection(db, "device_requests"));
  return onSnapshot(
    q,
    (snapshot) => {
      const requests = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as DeviceRequest[];
      // Sort in client
      requests.sort((a, b) => {
        const timeA = a.requestTime ? new Date(a.requestTime).getTime() : 0;
        const timeB = b.requestTime ? new Date(b.requestTime).getTime() : 0;
        return timeB - timeA;
      });
      callback(requests);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "device_requests");
    }
  );
}

export async function addDeviceRequest(request: Partial<DeviceRequest>) {
  const ref = doc(db, "device_requests", request.deviceId!);
  await runWrite(
    setDoc(ref, cleanUndefined({
      ...request,
      status: "pending",
      requestTime: getMexicoISOString()
    }))
  );
}

export async function updateDeviceRequest(deviceId: string, updateData: Partial<DeviceRequest>) {
  const ref = doc(db, "device_requests", deviceId);
  await runWrite(updateDoc(ref, cleanUndefined({
    ...updateData,
    approvedTime: updateData.status === "approved" ? getMexicoISOString() : undefined
  })));
}

export async function deleteDeviceRequest(deviceId: string) {
  const ref = doc(db, "device_requests", deviceId);
  await runWrite(deleteDoc(ref));
}

export function subscribeToSingleDeviceRequest(
  deviceId: string,
  callback: (request: DeviceRequest | null) => void
) {
  const ref = doc(db, "device_requests", deviceId);
  return onSnapshot(
    ref,
    (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, ...docSnap.data() } as DeviceRequest);
      } else {
        callback(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `device_requests/${deviceId}`);
    }
  );
}

export async function deleteCashMovementFromFirebase(id: string) {
  const ref = doc(db, "cash_movements", id);
  await runWrite(deleteDoc(ref));
}

export async function deletePurchaseFromFirebase(id: string) {
  const ref = doc(db, "purchases", id);
  await runWrite(deleteDoc(ref));
}

export async function saveUserToFirebase(user: any) {
  const ref = doc(db, "users", user.id);
  await runWrite(setDoc(ref, user));
}

export async function deleteUserFromFirebase(userId: string) {
  const ref = doc(db, "users", userId);
  await runWrite(deleteDoc(ref));
}

export async function bulkAddUsersToFirebase(users: any[]) {
  const batch = writeBatch(db);
  users.forEach((u) => {
    batch.set(doc(db, "users", u.id), u);
  });
  await batch.commit();
}

export interface MenuBackup {
  id: string;
  tenantId: string;
  sucursal: string;
  timestamp: string;
  name: string;
  products: any[];
  createdAt: string;
  updatedAt: string;
}

export function subscribeToMenuBackups(
  tenantId: string,
  callback: (data: MenuBackup[]) => void,
) {
  const q = query(collection(db, "products"));
  return onSnapshot(
    q,
    (snapshot) => {
      const backups = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((p: any) => (p.isBackup || p.id.startsWith("bk_")) && p.tenantId === tenantId) as unknown as MenuBackup[];
      
      // Ordenar por timestamp descendente
      backups.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });
      
      callback(backups);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "products (backups)");
    }
  );
}

export async function fetchMenuBackupProducts(backup: MenuBackup | any): Promise<any[]> {
  if (!backup) return [];
  if (!backup.isChunked) {
    return backup.products || [];
  }
  try {
    const chunksSnap = await getDocs(collection(db, "products", backup.id, "chunks"));
    if (chunksSnap.docs.length === 0) return backup.products || [];
    const sortedDocs = chunksSnap.docs
      .map((d) => d.data())
      .sort((a: any, b: any) => a.idx - b.idx);
    const jsonStr = sortedDocs.map((d: any) => d.content).join("");
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Error al desensamblar productos del respaldo de menú:", err);
    return backup.products || [];
  }
}

export async function createMenuBackup(
  tenantId: string,
  sucursal: string,
  name: string,
  products: any[]
) {
  const id = `bk_${tenantId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const ref = doc(db, "products", id);
  
  const jsonProducts = JSON.stringify(products);
  const sizeEstimate = jsonProducts.length;
  const isChunked = sizeEstimate > 750 * 1024; // > 750 KB

  const data: any = {
    id,
    tenantId,
    sucursal: sucursal || "Sucursal",
    timestamp: getMexicoISOString(),
    name: name || `Respaldo del ${new Date().toLocaleDateString()}`,
    products: isChunked ? [] : products,
    productsCount: products.length,
    isBackup: true,
    isChunked,
    sizeEstimate,
    createdAt: getMexicoISOString(),
    updatedAt: getMexicoISOString()
  };

  await runWrite(setDoc(ref, cleanUndefined(data)));

  if (isChunked) {
    const chunkSize = 750 * 1024;
    const totalChunks = Math.ceil(jsonProducts.length / chunkSize);
    for (let idx = 0; idx < totalChunks; idx++) {
      const chunkStr = jsonProducts.substring(idx * chunkSize, (idx + 1) * chunkSize);
      const chunkRef = doc(db, "products", id, "chunks", `chunk_${idx}`);
      await runWrite(setDoc(chunkRef, { idx, content: chunkStr }));
    }
    data.products = products;
  }

  return data as unknown as MenuBackup;
}

export async function deleteMenuBackupFromFirebase(id: string) {
  try {
    const chunksSnap = await getDocs(collection(db, "products", id, "chunks"));
    if (chunksSnap.docs.length > 0) {
      const batch = writeBatch(db);
      chunksSnap.docs.forEach((d) => batch.delete(d.ref));
      await runWrite(batch.commit());
    }
  } catch (err) {
    console.warn("Error borrando subcolección chunks de menú:", err);
  }
  const ref = doc(db, "products", id);
  await runWrite(deleteDoc(ref));
}

export async function restoreMenuBackupInFirebase(
  tenantId: string,
  backupProducts: any[] | any
) {
  let productsToRestore = backupProducts;
  if (!Array.isArray(backupProducts) || (backupProducts as any)?.isChunked) {
    productsToRestore = await fetchMenuBackupProducts(backupProducts);
  }

  const batch = writeBatch(db);
  
  // 1. Delete current products of this tenant (EXCLUDING any backup documents)
  const q = query(
    collection(db, "products"),
    where("tenantId", "==", tenantId)
  );
  const snapshot = await getDocs(q);
  snapshot.docs.forEach((d) => {
    const data = d.data();
    const isBackup = data.isBackup || d.id.startsWith("bk_");
    if (!isBackup) {
      batch.delete(d.ref);
    }
  });

  // 2. Restore backup products
  (productsToRestore || []).forEach((p: any) => {
    const rawId = p.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const id = rawId.startsWith(`prod_${tenantId}_`) ? rawId : `prod_${tenantId}_${rawId}`;
    const ref = doc(db, "products", id);
    batch.set(ref, {
      ...p,
      id,
      uid: id,
      tenantId,
      updatedAt: getMexicoISOString()
    });
  });

  await batch.commit();
}

export async function getAllProductsFromFirebase(): Promise<any[]> {
  const q = query(collection(db, "products"));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((p: any) => !p.isBackup && !p.id.startsWith("bk_"));
}

export async function getAllMenuBackupsFromFirebase(): Promise<any[]> {
  const q = query(collection(db, "products"));
  const snapshot = await getDocs(q);
  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .filter((p: any) => p.isBackup || p.id.startsWith("bk_"));
}

export async function migrateProductsTenant(productIds: string[], targetTenantId: string): Promise<void> {
  const batch = writeBatch(db);
  productIds.forEach((id) => {
    const ref = doc(db, "products", id);
    batch.update(ref, {
      tenantId: targetTenantId,
      updatedAt: getMexicoISOString()
    });
  });
  await batch.commit();
}

export async function migrateBackupsTenant(backupIds: string[], targetTenantId: string): Promise<void> {
  const batch = writeBatch(db);
  backupIds.forEach((id) => {
    const ref = doc(db, "menu_backups", id);
    batch.update(ref, {
      tenantId: targetTenantId,
      updatedAt: getMexicoISOString()
    });
  });
  await batch.commit();
}

export async function exportFullDatabaseJson(): Promise<any> {
  const collectionsToExport = [
    "products",
    "tables",
    "users",
    "arqueos",
    "cash_movements",
    "cashier_sessions_v2",
    "expenses",
    "history",
    "suppliers",
    "customers",
    "device_requests"
  ];
  
  const exportedData: Record<string, any[]> = {};
  
  for (const colName of collectionsToExport) {
    try {
      const snapshot = await getDocs(collection(db, colName));
      exportedData[colName] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (colErr) {
      console.warn(`Error exportando colección ${colName}:`, colErr);
      exportedData[colName] = [];
    }
  }
  
  return {
    exportedAt: getMexicoISOString(),
    projectId: db.app.options.projectId || "desconocido",
    databaseId: (db as any).databaseId || "(default)",
    collections: exportedData
  };
}

export async function importFullDatabaseJson(parsedJson: any, onProgress?: (msg: string) => void): Promise<number> {
  if (!parsedJson || !parsedJson.collections) {
    throw new Error("El archivo de respaldo seleccionado no tiene un formato válido de Cocinet.");
  }
  
  let writeCount = 0;
  const batchSize = 100;
  
  for (const [colName, docs] of Object.entries(parsedJson.collections)) {
    if (!Array.isArray(docs) || docs.length === 0) continue;
    
    if (onProgress) {
      onProgress(`Sincronizando ${docs.length} elementos de la colección "${colName}"...`);
    }
    
    for (let i = 0; i < docs.length; i += batchSize) {
      const chunk = docs.slice(i, i + batchSize);
      const batch = writeBatch(db);
      
      for (const docData of chunk) {
        const { id, ...cleanData } = docData;
        if (!id) continue;
        
        const docRef = doc(db, colName, id);
        batch.set(docRef, cleanUndefined(cleanData), { merge: true });
        writeCount++;
      }
      
      await batch.commit();
    }
  }
  
  return writeCount;
}

// --- CANCELLATION FUNCTIONS ---

export async function markAccountForCancellationInFirebase(accountId: string, reason: string) {
  const accountRef = doc(db, "history", accountId);
  await runWrite(
    updateDoc(accountRef, {
      isPendingCancellation: true,
      pendingCancellationReason: reason,
      updatedAt: getMexicoISOString(),
    })
  );
}

export async function authorizeAccountCancellationInFirebase(accountId: string, admin: any) {
  const accountRef = doc(db, "history", accountId);
  await runWrite(
    updateDoc(accountRef, {
      status: "cancelled",
      cancellationReason: "Autorizado", // Or merge with pending reason
      cancelledBy: cleanUndefined(admin),
      isPendingCancellation: false,
      updatedAt: getMexicoISOString(),
    })
  );
}

export async function revertAccountCancellationInFirebase(accountId: string) {
  const accountRef = doc(db, "history", accountId);
  await runWrite(
    updateDoc(accountRef, {
      isPendingCancellation: false,
      pendingCancellationReason: null,
      updatedAt: getMexicoISOString(),
    })
  );
}

export async function markComandaItemsForCancellationInFirebase(
  tableId: string,
  tableInfo: any,
  itemsToMark: { folio: number; productId: string; plate: number }[],
  reason: string,
  user: any
) {
  const tableRef = doc(db, "tables", tableId);
  const now = getMexicoISOString();

  const newComandas = (tableInfo.comandas || []).map((c: any) => {
    const matchedItemsFromThisFolio = itemsToMark.filter(it => it.folio === c.folio);
    if (matchedItemsFromThisFolio.length > 0) {
      return {
        ...c,
        updatedAt: now,
        items: (c.items || []).map((item: any) => {
          const isMatched = matchedItemsFromThisFolio.some(it => it.productId === item.product.id && it.plate === item.plate);
          if (isMatched && !item.isCancelled) {
            return {
              ...item,
              isPendingCancellation: true,
              pendingCancellationReason: reason,
            };
          }
          return item;
        }),
      };
    }
    return c;
  });

  await runWrite(
    updateDoc(tableRef, {
      comandas: cleanUndefined(newComandas),
      updatedAt: now,
    })
  );
}

export async function revertComandaItemsCancellationInFirebase(
  tableId: string,
  tableInfo: any,
  folio: number,
  productId: string,
  plate: number
) {
  const tableRef = doc(db, "tables", tableId);
  const now = getMexicoISOString();

  const newComandas = (tableInfo.comandas || []).map((c: any) => {
    if (c.folio === folio) {
      return {
        ...c,
        updatedAt: now,
        items: (c.items || []).map((item: any) => {
          if (item.product.id === productId && item.plate === plate) {
            return {
              ...item,
              isPendingCancellation: false,
              pendingCancellationReason: null,
            };
          }
          return item;
        }),
      };
    }
    return c;
  });

  await runWrite(
    updateDoc(tableRef, {
      comandas: cleanUndefined(newComandas),
      updatedAt: now,
    })
  );
}

export async function finalizeComandaItemsCancellationInFirebase(
  tableId: string,
  tableInfo: any,
  itemsToFinalize: { folio: number; productId: string; plate: number }[],
  admin: any
) {
  const tableRef = doc(db, "tables", tableId);
  const now = getMexicoISOString();

  const newComandas = (tableInfo.comandas || []).map((c: any) => {
    const matchedItemsFromThisFolio = itemsToFinalize.filter(it => it.folio === c.folio);
    if (matchedItemsFromThisFolio.length > 0) {
      return {
        ...c,
        updatedAt: now,
        items: (c.items || []).map((item: any) => {
          const isMatched = matchedItemsFromThisFolio.some(it => it.productId === item.product.id && it.plate === item.plate);
          if (isMatched && item.isPendingCancellation) {
            return {
              ...item,
              isCancelled: true,
              isPendingCancellation: false,
              cancellationReason: item.pendingCancellationReason || "Autorizado por Admin",
              cancelledBy: cleanUndefined(admin),
            };
          }
          return item;
        }),
      };
    }
    return c;
  });

  const hasActiveItems = newComandas.some((c: any) => 
    c.items && c.items.some((item: any) => !item.isCancelled)
  );

  if (!hasActiveItems) {
    await runWrite(
      updateDoc(tableRef, {
        status: "available",
        comandas: [],
        waiterId: null,
        updatedAt: now,
      }),
    );
  } else {
    await runWrite(
      updateDoc(tableRef, {
        comandas: cleanUndefined(newComandas),
        updatedAt: now,
      }),
    );
  }
}

export async function markEntireComandaForCancellationInFirebase(
  tableId: string,
  tableInfo: any,
  folio: number,
  reason: string
) {
  const tableRef = doc(db, "tables", tableId);
  const now = getMexicoISOString();

  const newComandas = (tableInfo.comandas || []).map((c: any) => {
    if (c.folio === folio) {
      return {
        ...c,
        isPendingCancellation: true,
        pendingCancellationReason: reason,
        updatedAt: now,
      };
    }
    return c;
  });

  await runWrite(
    updateDoc(tableRef, {
      comandas: cleanUndefined(newComandas),
      updatedAt: now,
    })
  );
}

export async function revertEntireComandaCancellationInFirebase(
  tableId: string,
  tableInfo: any,
  folio: number
) {
  const tableRef = doc(db, "tables", tableId);
  const now = getMexicoISOString();

  const newComandas = (tableInfo.comandas || []).map((c: any) => {
    if (c.folio === folio) {
      return {
        ...c,
        isPendingCancellation: false,
        pendingCancellationReason: null,
        updatedAt: now,
      };
    }
    return c;
  });

  await runWrite(
    updateDoc(tableRef, {
      comandas: cleanUndefined(newComandas),
      updatedAt: now,
    })
  );
}

export async function addNotificationToFirebase(notification: any) {
  const docId = notification.id || generateUUID();
  const ref = doc(db, "notifications", docId);
  await runWrite(
    setDoc(ref, cleanUndefined({
      ...notification,
      id: docId,
      createdAt: getMexicoISOString(),
    }))
  );
}

export function subscribeToNotifications(
  tenantId: string,
  callback: (notifications: any[]) => void
) {
  const q = query(
    collection(db, "notifications"),
    where("tenantId", "==", tenantId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const notifications = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      // Sort in client by createdAt descending (newest first)
      notifications.sort((a: any, b: any) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      callback(notifications);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "notifications");
    }
  );
}

export async function updateNotificationInFirebase(id: string, updateData: any) {
  const ref = doc(db, "notifications", id);
  await runWrite(
    updateDoc(ref, cleanUndefined(updateData))
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏢 COMPANIES CONFIG (Global visibility config synced to Firestore)
// ─────────────────────────────────────────────────────────────────────────────

export async function saveCompaniesConfigToFirebase(config: Record<string, any>): Promise<void> {
  const ref = doc(db, "settings", "companiesConfig_global");
  await runWrite(
    setDoc(ref, cleanUndefined({ config, updatedAt: getMexicoISOString() }))
  );
}

export function subscribeToCompaniesConfigFromFirebase(
  callback: (config: Record<string, any> | null) => void
) {
  const ref = doc(db, "settings", "companiesConfig_global");
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback(data?.config ?? null);
      } else {
        callback(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/companiesConfig_global");
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 📦 TENANT FULL BACKUP SNAPSHOTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exports all data filtered by a specific tenantId.
 * Collections that have a tenantId field are filtered, the rest are included fully.
 */
export async function exportTenantDataJson(
  tenantId: string,
  options?: { startDate?: string; endDate?: string }
): Promise<any> {
  const tenantFilteredCollections = [
    "products",
    "tables",
    "users",
    "history",
    "expenses",
    "suppliers",
    "customers",
    "cash_movements",
    "cashier_sessions_v2",
    "arqueos",
    "menu_backups",
    "inventory_movements",
    "inventory",
  ];

  const timeCollections = [
    "history",
    "expenses",
    "cash_movements",
    "inventory_movements",
    "arqueos",
    "cashier_sessions_v2",
  ];

  const exportedData: Record<string, any[]> = {};

  for (const colName of tenantFilteredCollections) {
    try {
      const q = query(collection(db, colName), where("tenantId", "==", tenantId));
      const snapshot = await getDocs(q);
      let docsList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

      if ((options?.startDate || options?.endDate) && timeCollections.includes(colName)) {
        docsList = docsList.filter((docItem: any) => {
          const dateVal = docItem.createdAt || docItem.timestamp || docItem.closedAt || docItem.openedAt || docItem.date;
          if (!dateVal) return true;
          const docDateStr = typeof dateVal === "string" ? dateVal.slice(0, 10) : new Date(dateVal).toISOString().slice(0, 10);
          if (options?.startDate && docDateStr < options.startDate) return false;
          if (options?.endDate && docDateStr > options.endDate) return false;
          return true;
        });
      }

      exportedData[colName] = docsList;
    } catch (colErr) {
      // Fallback: export all if where() fails (collection may not have tenantId field)
      try {
        const snapshot = await getDocs(collection(db, colName));
        let docsList = snapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((doc: any) => !doc.tenantId || doc.tenantId === tenantId);

        if ((options?.startDate || options?.endDate) && timeCollections.includes(colName)) {
          docsList = docsList.filter((docItem: any) => {
            const dateVal = docItem.createdAt || docItem.timestamp || docItem.closedAt || docItem.openedAt || docItem.date;
            if (!dateVal) return true;
            const docDateStr = typeof dateVal === "string" ? dateVal.slice(0, 10) : new Date(dateVal).toISOString().slice(0, 10);
            if (options?.startDate && docDateStr < options.startDate) return false;
            if (options?.endDate && docDateStr > options.endDate) return false;
            return true;
          });
        }

        exportedData[colName] = docsList;
      } catch (fallbackErr) {
        console.warn(`Error exportando colección ${colName}:`, fallbackErr);
        exportedData[colName] = [];
      }
    }
  }

  return {
    exportedAt: getMexicoISOString(),
    tenantId,
    version: "1.0",
    startDate: options?.startDate || null,
    endDate: options?.endDate || null,
    collections: exportedData,
  };
}

export interface TenantBackupSnapshot {
  id: string;
  tenantId: string;
  label: string;
  createdAt: string;
  note?: string;
  sizeEstimate?: number; // bytes approx
  totalDocs?: number;
  isChunked?: boolean;
  startDate?: string;
  endDate?: string;
  data?: any;
}

/**
 * Save a full tenant backup snapshot to Firestore.
 */
export async function saveTenantBackupSnapshot(
  tenantId: string,
  label: string,
  note: string,
  data: any
): Promise<string> {
  const snapshotId = `snap_${tenantId}_${Date.now()}`;
  const ref = doc(db, "tenant_backups", snapshotId);
  const jsonStr = JSON.stringify(data);
  const sizeEstimate = jsonStr.length;

  const totalDocs = data && data.collections
    ? Object.values(data.collections).reduce((acc: number, arr: any) => acc + (arr?.length || 0), 0)
    : 0;

  // 1. Write the metadata document first (without the "data" field)
  await runWrite(
    setDoc(ref, cleanUndefined({
      id: snapshotId,
      tenantId,
      label,
      note: note || "",
      createdAt: getMexicoISOString(),
      sizeEstimate,
      totalDocs,
      isChunked: true,
      startDate: data?.startDate || null,
      endDate: data?.endDate || null,
    }))
  );

  // 2. Fragment the JSON and write chunks to a subcollection "chunks"
  const chunkSize = 800 * 1024; // 800 KB
  const totalChunks = Math.ceil(jsonStr.length / chunkSize);
  
  for (let idx = 0; idx < totalChunks; idx++) {
    const chunkStr = jsonStr.substring(idx * chunkSize, (idx + 1) * chunkSize);
    const chunkRef = doc(db, "tenant_backups", snapshotId, "chunks", `chunk_${idx}`);
    await runWrite(setDoc(chunkRef, { idx, content: chunkStr }));
  }

  return snapshotId;
}

/**
 * Fetch and reassemble a full tenant backup snapshot JSON data from its chunks.
 */
export async function fetchTenantBackupSnapshotData(snapshotId: string): Promise<any> {
  const parentRef = doc(db, "tenant_backups", snapshotId);
  const parentSnap = await getDoc(parentRef);
  if (!parentSnap.exists()) {
    throw new Error("El respaldo no existe.");
  }
  const parentData = parentSnap.data();

  // Legacy fallback: if not chunked, data is stored directly in parent
  if (!parentData.isChunked && parentData.data) {
    return parentData.data;
  }

  // Load all chunks from subcollection, sort by index and assemble
  const chunksSnap = await getDocs(collection(db, "tenant_backups", snapshotId, "chunks"));
  const sortedDocs = chunksSnap.docs
    .map(d => d.data())
    .sort((a: any, b: any) => a.idx - b.idx);

  if (sortedDocs.length === 0) {
    throw new Error("No se encontraron fragmentos para este respaldo.");
  }

  const jsonStr = sortedDocs.map((d: any) => d.content).join("");
  return JSON.parse(jsonStr);
}

/**
 * Subscribe to all backup snapshots for a tenant (real-time).
 */
export function subscribeToTenantBackupSnapshots(
  tenantId: string,
  callback: (snapshots: TenantBackupSnapshot[]) => void
) {
  const q = query(
    collection(db, "tenant_backups"),
    where("tenantId", "==", tenantId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const snapshots = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as TenantBackupSnapshot[];
      callback(snapshots);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `tenant_backups/${tenantId}`);
    }
  );
}

/**
 * Delete a tenant backup snapshot and all its chunks.
 */
export async function deleteTenantBackupSnapshot(snapshotId: string): Promise<void> {
  // 1. Delete all chunk sub-documents
  try {
    const chunksSnap = await getDocs(collection(db, "tenant_backups", snapshotId, "chunks"));
    if (chunksSnap.docs.length > 0) {
      const batch = writeBatch(db);
      chunksSnap.docs.forEach((d) => batch.delete(d.ref));
      await runWrite(batch.commit());
    }
  } catch (err) {
    console.warn("Error deleting subcollection chunks for backup:", err);
  }

  // 2. Delete parent document
  const ref = doc(db, "tenant_backups", snapshotId);
  await runWrite(deleteDoc(ref));
}

/**
 * Restore a tenant backup snapshot into a target tenant.
 * All documents in the backup will have their tenantId replaced with targetTenantId.
 */
export async function restoreTenantBackupSnapshot(
  snapshot: TenantBackupSnapshot,
  targetTenantId: string,
  onProgress?: (msg: string) => void
): Promise<number> {
  let data = snapshot.data;
  if (!data) {
    if (onProgress) {
      onProgress("Descargando y ensamblando fragmentos del respaldo...");
    }
    data = await fetchTenantBackupSnapshotData(snapshot.id);
  }

  if (!data || !data.collections) {
    throw new Error("El respaldo no tiene un formato válido.");
  }

  let writeCount = 0;
  const batchSize = 100;

  for (const [colName, docs] of Object.entries(data.collections)) {
    if (!Array.isArray(docs) || docs.length === 0) continue;

    if (onProgress) {
      onProgress(`Restaurando ${docs.length} registros de "${colName}"...`);
    }

    for (let i = 0; i < (docs as any[]).length; i += batchSize) {
      const chunk = (docs as any[]).slice(i, i + batchSize);
      const batch = writeBatch(db);

      for (const docData of chunk) {
        const { id, ...cleanData } = docData;
        if (!id) continue;

        // Rewrite tenantId to target tenant
        const newId = targetTenantId !== snapshot.tenantId
          ? id.replace(snapshot.tenantId, targetTenantId)
          : id;

        const docRef = doc(db, colName, newId);
        batch.set(
          docRef,
          cleanUndefined({
            ...cleanData,
            tenantId: targetTenantId,
            updatedAt: getMexicoISOString(),
          }),
          { merge: false }
        );
        writeCount++;
      }

      await batch.commit();
    }
  }

  return writeCount;
}

// ─────────────────────────────────────────────────────────────────────────────
// 👑 CUSTOM OWNERS & PINS SYNCHRONIZATION
// ─────────────────────────────────────────────────────────────────────────────

export function subscribeToCustomOwnersFromFirebase(
  callback: (data: { owners: any[]; pins: Record<string, string>; supervisorPins: Record<string, string> } | null) => void
) {
  const ref = doc(db, "settings", "customOwners_global");
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        callback({
          owners: data?.owners ?? [],
          pins: data?.pins ?? {},
          supervisorPins: data?.supervisorPins ?? {}
        });
      } else {
        callback(null);
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, "settings/customOwners_global");
    }
  );
}

export async function saveCustomOwnersToFirebase(
  owners: any[],
  pins: Record<string, string>,
  supervisorPins?: Record<string, string>
) {
  const ref = doc(db, "settings", "customOwners_global");
  await runWrite(
    setDoc(ref, {
      owners,
      pins,
      supervisorPins: supervisorPins ?? {},
      updatedAt: getMexicoISOString()
    })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 📑 HISTORIAL DE CORTES 2 (FOLIO INTERNO DE CUENTAS & NIVELACIÓN)
// ─────────────────────────────────────────────────────────────────────────────

export interface CorteCuentasFolioRecord {
  id: string;
  tenantId: string;
  date: string;
  folioAnterior: number;
  folioFinal: number;
  montoObjetivo: number;
  montoFoliado: number;
  selectedAccountIds: string[];
  status: "draft" | "closed";
  createdAt: string;
  updatedAt: string;
}

export function subscribeToCorteFolioHistoryFromFirebase(
  tenantId: string,
  callback: (records: CorteCuentasFolioRecord[]) => void
) {
  const colRef = collection(db, "tenants", tenantId, "shift_closures_v2");
  return onSnapshot(
    colRef,
    (snap) => {
      const records: CorteCuentasFolioRecord[] = [];
      snap.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as CorteCuentasFolioRecord);
      });
      records.sort((a, b) => b.date.localeCompare(a.date));
      callback(records);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `tenants/${tenantId}/shift_closures_v2`);
    }
  );
}

export async function saveCorteFolioRecordToFirebase(
  tenantId: string,
  record: CorteCuentasFolioRecord
) {
  const docRef = doc(db, "tenants", tenantId, "shift_closures_v2", record.id);
  await runWrite(
    setDoc(docRef, {
      ...record,
      updatedAt: getMexicoISOString()
    }, { merge: true })
  );
}

