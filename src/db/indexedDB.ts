import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending-create' | 'pending-update' | 'pending-delete';
  mysqlId?: number | null;
  routeId?: number | null;
  sellerId?: number | null;
  initialBalance?: number | null;
  initialBalanceDate?: string | null;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  cost: number;
  unit: string;
  stock: number;
  brand: string;
  mysqlId?: number | null;
  updatedAt: string;
  syncStatus?: 'synced' | 'pending-create' | 'pending-update' | 'pending-delete';
  truckStock?: number | null;
  truckStockLoaded?: number | null;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: 'driver' | 'admin' | 'supervisor';
  phone: string;
  mysqlId?: number | null;
  isActive: boolean;
  updatedAt: string;
  syncStatus?: 'synced' | 'pending-create' | 'pending-update' | 'pending-delete';
}

export interface Truck {
  id: string;
  name: string;
  ecoNumber: string;
  mysqlId?: number | null;
  updatedAt: string;
  syncStatus?: 'synced' | 'pending-create' | 'pending-update' | 'pending-delete';
  status?: 'bodega' | 'transito' | 'taller';
  activeDriver?: string | null;
  activeRoute?: string | null;
  inventory?: { [productId: string]: number } | null;
  salesToday?: number | null;
}

export interface Payment {
  id: string;
  clientId: string;
  clientName: string;
  amount: number;
  date: string;
  paymentMethod: 'cash' | 'card' | 'transfer';
  status: 'pending' | 'completed';
  notes: string;
  createdAt: string;
  syncStatus: 'synced' | 'pending-create' | 'pending-delete';
  discount?: number;
  subtotal?: number;
  driverName?: string | null;
  truckPlates?: string | null;
  routeId?: string | null;
}

export interface TruckCut {
  id: string;
  driverName: string;
  truckPlates: string;
  routeId: string;
  date: string;
  totalSales: number;
  totalCash: number;
  totalCard: number;
  totalTransfer: number;
  totalDiscounts: number;
  inventoryDiff: string;
  closedAt: string;
  syncStatus: 'synced' | 'pending-create';
}

export interface SyncItem {
  id?: number;
  collection: 'clients' | 'payments' | 'products' | 'users' | 'trucks' | 'truckCuts';
  action: 'create' | 'update' | 'delete';
  documentId: string;
  payload: any;
  timestamp: number;
}

interface VentasForaneasDB extends DBSchema {
  clients: {
    key: string;
    value: Client;
  };
  payments: {
    key: string;
    value: Payment;
  };
  products: {
    key: string;
    value: Product;
  };
  users: {
    key: string;
    value: User;
  };
  trucks: {
    key: string;
    value: Truck;
  };
  truckCuts: {
    key: string;
    value: TruckCut;
  };
  syncQueue: {
    key: number;
    value: SyncItem;
  };
}

const DB_NAME = 'ventas-foraneas-db';
const DB_VERSION = 4;

export const initDB = async (): Promise<IDBPDatabase<VentasForaneasDB>> => {
  return openDB<VentasForaneasDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('payments')) {
        db.createObjectStore('payments', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('trucks')) {
        db.createObjectStore('trucks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('truckCuts')) {
        db.createObjectStore('truckCuts', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
};

// --- Helper CRUD methods for Clients ---
export const getLocalClients = async (): Promise<Client[]> => {
  const db = await initDB();
  const all = await db.getAll('clients');
  // Filter out any locally deleted clients that haven't synced deletion yet
  return all.filter(c => c.syncStatus !== 'pending-delete');
};

export const saveLocalClient = async (client: Client): Promise<void> => {
  const db = await initDB();
  await db.put('clients', client);
};

export const deleteLocalClient = async (id: string): Promise<void> => {
  const db = await initDB();
  const client = await db.get('clients', id);
  if (client) {
    if (client.syncStatus === 'pending-create') {
      // If it hasn't even been synced to the server yet, we can just delete it completely
      await db.delete('clients', id);
    } else {
      // Mark it for deletion so the sync service knows to delete it from Firestore later
      client.syncStatus = 'pending-delete';
      await db.put('clients', client);
    }
  }
};

// --- Helper CRUD methods for Payments ---
export const getLocalPayments = async (): Promise<Payment[]> => {
  const db = await initDB();
  const all = await db.getAll('payments');
  return all.filter(p => p.syncStatus !== 'pending-delete');
};

export const saveLocalPayment = async (payment: Payment): Promise<void> => {
  const db = await initDB();
  await db.put('payments', payment);
};

export const deleteLocalPayment = async (id: string): Promise<void> => {
  const db = await initDB();
  const payment = await db.get('payments', id);
  if (payment) {
    if (payment.syncStatus === 'pending-create') {
      await db.delete('payments', id);
    } else {
      payment.syncStatus = 'pending-delete';
      await db.put('payments', payment);
    }
  }
};

// --- Sync Queue helpers ---
export const addToSyncQueue = async (item: SyncItem): Promise<void> => {
  const db = await initDB();
  await db.add('syncQueue', item);
};

export const getSyncQueue = async (): Promise<SyncItem[]> => {
  const db = await initDB();
  return db.getAll('syncQueue');
};

export const removeFromSyncQueue = async (id: number): Promise<void> => {
  const db = await initDB();
  await db.delete('syncQueue', id);
};

export const clearSyncQueue = async (): Promise<void> => {
  const db = await initDB();
  await db.clear('syncQueue');
};

// --- Helper methods for Products ---
export const getLocalProducts = async (): Promise<Product[]> => {
  const db = await initDB();
  const all = await db.getAll('products');
  return all.filter(p => p.syncStatus !== 'pending-delete');
};

export const saveLocalProduct = async (product: Product): Promise<void> => {
  const db = await initDB();
  await db.put('products', product);
};

export const deleteLocalProduct = async (id: string): Promise<void> => {
  const db = await initDB();
  const product = await db.get('products', id);
  if (product) {
    if (product.syncStatus === 'pending-create') {
      await db.delete('products', id);
    } else {
      product.syncStatus = 'pending-delete';
      await db.put('products', product);
    }
  }
};


// --- Helper methods for Users ---
export const getLocalUsers = async (): Promise<User[]> => {
  const db = await initDB();
  const all = await db.getAll('users');
  return all.filter(u => u.syncStatus !== 'pending-delete');
};

export const saveLocalUser = async (user: User): Promise<void> => {
  const db = await initDB();
  await db.put('users', user);
};

export const deleteLocalUser = async (id: string): Promise<void> => {
  const db = await initDB();
  const user = await db.get('users', id);
  if (user) {
    if (user.syncStatus === 'pending-create') {
      await db.delete('users', id);
    } else {
      user.syncStatus = 'pending-delete';
      await db.put('users', user);
    }
  }
};

// --- Helper methods for Trucks ---
export const getLocalTrucks = async (): Promise<Truck[]> => {
  const db = await initDB();
  const all = await db.getAll('trucks');
  return all.filter(t => t.syncStatus !== 'pending-delete');
};

export const saveLocalTruck = async (truck: Truck): Promise<void> => {
  const db = await initDB();
  await db.put('trucks', truck);
};

export const deleteLocalTruck = async (id: string): Promise<void> => {
  const db = await initDB();
  const truck = await db.get('trucks', id);
  if (truck) {
    if (truck.syncStatus === 'pending-create') {
      await db.delete('trucks', id);
    } else {
      truck.syncStatus = 'pending-delete';
      await db.put('trucks', truck);
    }
  }
};

// --- Helper methods for Truck Cuts ---
export const getLocalTruckCuts = async (): Promise<TruckCut[]> => {
  const db = await initDB();
  return db.getAll('truckCuts');
};

export const saveLocalTruckCut = async (cut: TruckCut): Promise<void> => {
  const db = await initDB();
  await db.put('truckCuts', cut);
};

