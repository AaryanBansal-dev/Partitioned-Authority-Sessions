/**
 * IndexedDB Key Storage
 * Stores non-extractable private keys in origin-isolated storage
 */

const DB_NAME = "pan-signing";
const DB_VERSION = 1;
const STORE_NAME = "keys";
const KEY_ID = "session-key";

let db: IDBDatabase | null = null;

/**
 * Open the IndexedDB database
 */
async function openDatabase(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open IndexedDB"));
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

/**
 * Store a CryptoKeyPair in IndexedDB
 */
export async function storeKeyPair(keyPair: CryptoKeyPair): Promise<void> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put({
      id: KEY_ID,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      createdAt: Date.now(),
    });

    request.onerror = () => {
      reject(new Error("Failed to store key pair"));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Retrieve the CryptoKeyPair from IndexedDB
 */
export async function getKeyPair(): Promise<CryptoKeyPair | null> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(KEY_ID);

    request.onerror = () => {
      reject(new Error("Failed to retrieve key pair"));
    };

    request.onsuccess = () => {
      if (request.result) {
        resolve({
          privateKey: request.result.privateKey,
          publicKey: request.result.publicKey,
        });
      } else {
        resolve(null);
      }
    };
  });
}

/**
 * Delete the stored key pair
 */
export async function deleteKeyPair(): Promise<void> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(KEY_ID);

    request.onerror = () => {
      reject(new Error("Failed to delete key pair"));
    };

    request.onsuccess = () => {
      resolve();
    };
  });
}

/**
 * Check if a key pair exists
 */
export async function hasKeyPair(): Promise<boolean> {
  const keyPair = await getKeyPair();
  return keyPair !== null;
}
