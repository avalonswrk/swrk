import { InvSlot, PlacedBuilding } from '../types';

export interface SaveState {
  seed: number; x: number; y: number; z: number; hp: number; hunger: number; timeOfDay: number;
  inventory: InvSlot[]; destroyedUids: string[]; buildings: Omit<PlacedBuilding, 'mesh' | 'light'>[];
}

export class SaveManager {
  private static DB_NAME = 'ChronosSurvivalDB';
  private static STORE_NAME = 'world_saves';

  private static openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(this.STORE_NAME)) req.result.createObjectStore(this.STORE_NAME); };
      req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
    });
  }

  public static async saveWorld(state: SaveState): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite'); tx.objectStore(this.STORE_NAME).put(state, 'primary_save');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }

  public static async loadWorld(): Promise<SaveState | null> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readonly'); const req = tx.objectStore(this.STORE_NAME).get('primary_save');
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
    });
  }

  public static async clearSave(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE_NAME, 'readwrite'); tx.objectStore(this.STORE_NAME).delete('primary_save');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  }
}
