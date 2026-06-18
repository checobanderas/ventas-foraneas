import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, limit } from 'firebase/firestore';
import {
  initDB,
  addToSyncQueue,
  getSyncQueue,
  removeFromSyncQueue,
  saveLocalClient,
  saveLocalPayment,
  saveLocalProduct
} from './indexedDB';
import type { Client, Payment, Product } from './indexedDB';

type SyncCallback = (status: {
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  error: string | null;
}) => void;

class SyncService {
  private listeners: Set<SyncCallback> = new Set();
  private isSyncing = false;
  private lastSyncedAt: Date | null = null;
  private syncError: string | null = null;

  constructor() {
    // Listen to network changes
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.sync().catch(err => console.error("Auto-sync failed on reconnection:", err));
      });
    }
  }

  public addListener(callback: SyncCallback) {
    this.listeners.add(callback);
    callback({
      isSyncing: this.isSyncing,
      lastSyncedAt: this.lastSyncedAt,
      error: this.syncError
    });
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach(cb => cb({
      isSyncing: this.isSyncing,
      lastSyncedAt: this.lastSyncedAt,
      error: this.syncError
    }));
  }

  /**
   * Add client locally and schedule syncing.
   */
  public async addClient(clientData: Omit<Client, 'syncStatus' | 'createdAt' | 'updatedAt'>): Promise<void> {
    const now = new Date().toISOString();
    const client: Client = {
      ...clientData,
      createdAt: now,
      updatedAt: now,
      syncStatus: navigator.onLine ? 'synced' : 'pending-create'
    };

    // Save to local DB first
    await saveLocalClient(client);

    const { syncStatus, ...firebasePayload } = client;
    if (navigator.onLine) {
      try {
        const docRef = doc(db, 'clients', client.id);
        await setDoc(docRef, firebasePayload);
      } catch (err) {
        console.warn("Could not save to Firebase, queueing for later:", err);
        client.syncStatus = 'pending-create';
        await saveLocalClient(client);
        await addToSyncQueue({
          collection: 'clients',
          action: 'create',
          documentId: client.id,
          payload: firebasePayload,
          timestamp: Date.now()
        });
      }
    } else {
      await addToSyncQueue({
        collection: 'clients',
        action: 'create',
        documentId: client.id,
        payload: firebasePayload,
        timestamp: Date.now()
      });
    }
    this.notify();
  }

  /**
   * Update client locally and schedule syncing.
   */
  public async updateClient(clientData: Client): Promise<void> {
    const updatedClient: Client = {
      ...clientData,
      updatedAt: new Date().toISOString(),
      syncStatus: navigator.onLine ? 'synced' : 'pending-update'
    };

    await saveLocalClient(updatedClient);

    const { syncStatus, ...firebasePayload } = updatedClient;
    if (navigator.onLine) {
      try {
        const docRef = doc(db, 'clients', updatedClient.id);
        await setDoc(docRef, firebasePayload, { merge: true });
      } catch (err) {
        console.warn("Could not sync update to Firebase, queueing:", err);
        updatedClient.syncStatus = 'pending-update';
        await saveLocalClient(updatedClient);
        await addToSyncQueue({
          collection: 'clients',
          action: 'update',
          documentId: updatedClient.id,
          payload: firebasePayload,
          timestamp: Date.now()
        });
      }
    } else {
      await addToSyncQueue({
        collection: 'clients',
        action: 'update',
        documentId: updatedClient.id,
        payload: firebasePayload,
        timestamp: Date.now()
      });
    }
    this.notify();
  }

  /**
   * Delete client locally and schedule syncing.
   */
  public async deleteClient(id: string): Promise<void> {
    const ldb = await initDB();
    const client = await ldb.get('clients', id);

    if (!client) return;

    if (client.syncStatus === 'pending-create') {
      // Just delete from IndexedDB and remove from queue
      await ldb.delete('clients', id);
      const queue = await getSyncQueue();
      const queueItem = queue.find(q => q.collection === 'clients' && q.documentId === id);
      if (queueItem?.id) {
        await removeFromSyncQueue(queueItem.id);
      }
    } else {
      // Mark as pending-delete locally
      client.syncStatus = 'pending-delete';
      await ldb.put('clients', client);

      if (navigator.onLine) {
        try {
          await deleteDoc(doc(db, 'clients', id));
          await ldb.delete('clients', id); // Fully remove now
        } catch (err) {
          console.warn("Could not sync deletion to Firebase, queueing:", err);
          await addToSyncQueue({
            collection: 'clients',
            action: 'delete',
            documentId: id,
            payload: null,
            timestamp: Date.now()
          });
        }
      } else {
        await addToSyncQueue({
          collection: 'clients',
          action: 'delete',
          documentId: id,
          payload: null,
          timestamp: Date.now()
        });
      }
    }
    this.notify();
  }

  /**
   * Add payment locally and schedule syncing.
   */
  public async addPayment(paymentData: Omit<Payment, 'syncStatus' | 'createdAt'>): Promise<void> {
    const payment: Payment = {
      ...paymentData,
      createdAt: new Date().toISOString(),
      syncStatus: navigator.onLine ? 'synced' : 'pending-create'
    };

    await saveLocalPayment(payment);

    const { syncStatus, ...firebasePayload } = payment;
    if (navigator.onLine) {
      try {
        const docRef = doc(db, 'payments', payment.id);
        await setDoc(docRef, firebasePayload);
      } catch (err) {
        console.warn("Could not sync payment to Firebase, queueing:", err);
        payment.syncStatus = 'pending-create';
        await saveLocalPayment(payment);
        await addToSyncQueue({
          collection: 'payments',
          action: 'create',
          documentId: payment.id,
          payload: firebasePayload,
          timestamp: Date.now()
        });
      }
    } else {
      await addToSyncQueue({
        collection: 'payments',
        action: 'create',
        documentId: payment.id,
        payload: firebasePayload,
        timestamp: Date.now()
      });
    }
    this.notify();
  }

  /**
   * Delete payment locally and schedule syncing.
   */
  public async deletePayment(id: string): Promise<void> {
    const ldb = await initDB();
    const payment = await ldb.get('payments', id);

    if (!payment) return;

    if (payment.syncStatus === 'pending-create') {
      await ldb.delete('payments', id);
      const queue = await getSyncQueue();
      const queueItem = queue.find(q => q.collection === 'payments' && q.documentId === id);
      if (queueItem?.id) {
        await removeFromSyncQueue(queueItem.id);
      }
    } else {
      payment.syncStatus = 'pending-delete';
      await ldb.put('payments', payment);

      if (navigator.onLine) {
        try {
          await deleteDoc(doc(db, 'payments', id));
          await ldb.delete('payments', id);
        } catch (err) {
          console.warn("Could not sync payment deletion, queueing:", err);
          await addToSyncQueue({
            collection: 'payments',
            action: 'delete',
            documentId: id,
            payload: null,
            timestamp: Date.now()
          });
        }
      } else {
        await addToSyncQueue({
          collection: 'payments',
          action: 'delete',
          documentId: id,
          payload: null,
          timestamp: Date.now()
        });
      }
    }
    this.notify();
  }

  /**
   * Add product locally and schedule syncing.
   */
  public async addProduct(productData: Omit<Product, 'syncStatus' | 'updatedAt'>): Promise<void> {
    const now = new Date().toISOString();
    const product: Product = {
      ...productData,
      updatedAt: now,
      syncStatus: navigator.onLine ? 'synced' : 'pending-create'
    };

    await saveLocalProduct(product);

    const { syncStatus, ...firebasePayload } = product;
    if (navigator.onLine) {
      try {
        const docRef = doc(db, 'products', product.id);
        await setDoc(docRef, firebasePayload);
      } catch (err) {
        console.warn("Could not save product to Firebase, queueing:", err);
        product.syncStatus = 'pending-create';
        await saveLocalProduct(product);
        await addToSyncQueue({
          collection: 'products',
          action: 'create',
          documentId: product.id,
          payload: firebasePayload,
          timestamp: Date.now()
        });
      }
    } else {
      await addToSyncQueue({
        collection: 'products',
        action: 'create',
        documentId: product.id,
        payload: firebasePayload,
        timestamp: Date.now()
      });
    }
    this.notify();
  }

  /**
   * Update product locally and schedule syncing.
   */
  public async updateProduct(product: Product): Promise<void> {
    const updatedProduct: Product = {
      ...product,
      updatedAt: new Date().toISOString(),
      syncStatus: navigator.onLine ? 'synced' : 'pending-update'
    };

    await saveLocalProduct(updatedProduct);

    const { syncStatus, ...firebasePayload } = updatedProduct;
    if (navigator.onLine) {
      try {
        const docRef = doc(db, 'products', updatedProduct.id);
        await setDoc(docRef, firebasePayload, { merge: true });
      } catch (err) {
        console.warn("Could not sync product update to Firebase, queueing:", err);
        updatedProduct.syncStatus = 'pending-update';
        await saveLocalProduct(updatedProduct);
        await addToSyncQueue({
          collection: 'products',
          action: 'update',
          documentId: updatedProduct.id,
          payload: firebasePayload,
          timestamp: Date.now()
        });
      }
    } else {
      await addToSyncQueue({
        collection: 'products',
        action: 'update',
        documentId: updatedProduct.id,
        payload: firebasePayload,
        timestamp: Date.now()
      });
    }
    this.notify();
  }

  /**
   * Delete product locally and schedule syncing.
   */
  public async deleteProduct(id: string): Promise<void> {
    const ldb = await initDB();
    const product = await ldb.get('products', id);

    if (!product) return;

    if (product.syncStatus === 'pending-create') {
      await ldb.delete('products', id);
      const queue = await getSyncQueue();
      const queueItem = queue.find(q => q.collection === 'products' && q.documentId === id);
      if (queueItem?.id) {
        await removeFromSyncQueue(queueItem.id);
      }
    } else {
      product.syncStatus = 'pending-delete';
      await ldb.put('products', product);

      if (navigator.onLine) {
        try {
          await deleteDoc(doc(db, 'products', id));
          await ldb.delete('products', id);
        } catch (err) {
          console.warn("Could not sync product deletion, queueing:", err);
          await addToSyncQueue({
            collection: 'products',
            action: 'delete',
            documentId: id,
            payload: null,
            timestamp: Date.now()
          });
        }
      } else {
        await addToSyncQueue({
          collection: 'products',
          action: 'delete',
          documentId: id,
          payload: null,
          timestamp: Date.now()
        });
      }
    }
    this.notify();
  }

  /**
   * Replay offline queue to Firestore, then pull down updates.
   */
  public async sync(): Promise<void> {
    if (this.isSyncing) return;
    if (!navigator.onLine) {
      this.syncError = "No hay conexión a internet para sincronizar.";
      this.notify();
      return;
    }

    this.isSyncing = true;
    this.syncError = null;
    this.notify();

    try {
      const ldb = await initDB();
      const queue = await getSyncQueue();

      // Sort queue by timestamp to ensure chronological replay
      queue.sort((a, b) => a.timestamp - b.timestamp);

      // 1. Process Offline Queue
      for (const item of queue) {
        try {
          if (item.collection === 'clients') {
            if (item.action === 'create' || item.action === 'update') {
              await setDoc(doc(db, 'clients', item.documentId), item.payload, { merge: true });
            } else if (item.action === 'delete') {
              await deleteDoc(doc(db, 'clients', item.documentId));
              await ldb.delete('clients', item.documentId);
            }
          } else if (item.collection === 'payments') {
            if (item.action === 'create') {
              await setDoc(doc(db, 'payments', item.documentId), item.payload);
            } else if (item.action === 'delete') {
              await deleteDoc(doc(db, 'payments', item.documentId));
              await ldb.delete('payments', item.documentId);
            }
          } else if (item.collection === 'products') {
            if (item.action === 'create' || item.action === 'update') {
              await setDoc(doc(db, 'products', item.documentId), item.payload, { merge: true });
            } else if (item.action === 'delete') {
              await deleteDoc(doc(db, 'products', item.documentId));
              await ldb.delete('products', item.documentId);
            }
          }

          // Successfully processed, remove from queue
          if (item.id !== undefined) {
            await removeFromSyncQueue(item.id);
          }
        } catch (err) {
          console.error(`Failed to process sync queue item:`, item, err);
          // Keep it in queue and throw to stop syncing
          throw new Error(`Error procesando cola de sincronización para ${item.collection}`);
        }
      }

      // 2. Pull down fresh clients from Firestore (limit to 50)
      const clientsSnapshot = await getDocs(query(collection(db, 'clients'), limit(50)));
      const activeLocalClients = await ldb.getAll('clients');


      // Save pulled clients to local database
      for (const docSnap of clientsSnapshot.docs) {
        const remoteData = docSnap.data();
        const client: Client = {
          id: docSnap.id,
          name: remoteData.name,
          email: remoteData.email,
          phone: remoteData.phone,
          address: remoteData.address,
          latitude: remoteData.latitude,
          longitude: remoteData.longitude,
          createdAt: remoteData.createdAt,
          updatedAt: remoteData.updatedAt || remoteData.createdAt,
          syncStatus: 'synced',
          mysqlId: remoteData.mysqlId !== undefined ? remoteData.mysqlId : null,
          routeId: remoteData.routeId !== undefined ? remoteData.routeId : null,
          sellerId: remoteData.sellerId !== undefined ? remoteData.sellerId : null,
          initialBalance: remoteData.initialBalance !== undefined ? remoteData.initialBalance : null,
          initialBalanceDate: remoteData.initialBalanceDate !== undefined ? remoteData.initialBalanceDate : null
        };

        // If local client is marked as pending update or delete, skip overwriting it!
        const local = activeLocalClients.find(c => c.id === client.id);
        if (local && (local.syncStatus === 'pending-update' || local.syncStatus === 'pending-delete')) {
          continue;
        }
        await ldb.put('clients', client);
      }

      // 3. Pull down fresh payments from Firestore
      const paymentsSnapshot = await getDocs(collection(db, 'payments'));
      const activeLocalPayments = await ldb.getAll('payments');

      for (const docSnap of paymentsSnapshot.docs) {
        const remoteData = docSnap.data();
        const payment: Payment = {
          id: docSnap.id,
          clientId: remoteData.clientId,
          clientName: remoteData.clientName,
          amount: Number(remoteData.amount),
          date: remoteData.date,
          paymentMethod: remoteData.paymentMethod,
          status: remoteData.status,
          notes: remoteData.notes,
          createdAt: remoteData.createdAt,
          syncStatus: 'synced'
        };

        const local = activeLocalPayments.find(p => p.id === payment.id);
        if (local && (local.syncStatus === 'pending-delete')) {
          continue;
        }
        await ldb.put('payments', payment);
      }

      // 4. Pull down fresh products from Firestore
      try {
        const productsSnapshot = await getDocs(collection(db, 'products'));
        const activeLocalProducts = await ldb.getAll('products');
        for (const docSnap of productsSnapshot.docs) {
          const remoteData = docSnap.data();
          const product: Product = {
            id: docSnap.id,
            sku: remoteData.sku,
            name: remoteData.name,
            price: Number(remoteData.price),
            cost: Number(remoteData.cost),
            unit: remoteData.unit,
            stock: Number(remoteData.stock),
            brand: remoteData.brand,
            mysqlId: remoteData.mysqlId !== undefined ? remoteData.mysqlId : null,
            updatedAt: remoteData.updatedAt,
            syncStatus: 'synced'
          };

          const local = activeLocalProducts.find(p => p.id === product.id);
          if (local && (local.syncStatus === 'pending-update' || local.syncStatus === 'pending-delete')) {
            continue;
          }
          await ldb.put('products', product);
        }
      } catch (pErr) {
        console.warn("Could not sync products from Firestore:", pErr);
      }

      // 4. Update sync success metadata
      this.lastSyncedAt = new Date();
      this.syncError = null;
    } catch (err: any) {
      console.error("Sync process failed:", err);
      this.syncError = err.message || "Fallo la sincronización.";
    } finally {
      this.isSyncing = false;
      this.notify();
    }
  }
}

export const syncService = new SyncService();
