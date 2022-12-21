export class VectorDatabase {
    private db: IDBDatabase;
  
    constructor() {
      const request = indexedDB.open("vectors", 1);
  
      request.onupgradeneeded = () => {
        this.db = request.result;
        this.db.createObjectStore("vectors", { keyPath: "key" });
      };
  
      request.onsuccess = () => {
        this.db = request.result;
      };
    }
  
    async addVector(key: string, vector: Float32Array): Promise<void> {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["vectors"], "readwrite");
        const objectStore = transaction.objectStore("vectors");
        const request = objectStore.put({ key, vector });
  
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }
  
    async updateVector(key: string, vector: Float32Array): Promise<void> {
      return this.addVector(key, vector);
    }
  
    async removeVector(key: string): Promise<void> {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["vectors"], "readwrite");
        const objectStore = transaction.objectStore("vectors");
        const request = objectStore.delete(key);
  
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    async readVector(key: string): Promise<Float32Array> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vectors"]);
            const objectStore = transaction.objectStore("vectors");
            const request = objectStore.get(key);
            
            request.onsuccess = () => resolve(request.result.vector);
            request.onerror = () => reject(request.error);
        });
    }
  
    async hasKey(key: string): Promise<boolean> {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["vectors"]);
        const objectStore = transaction.objectStore("vectors");
        const request = objectStore.get(key);
  
        request.onsuccess = () => resolve(request.result !== undefined);
        request.onerror = () => reject(request.error);
      });
    }
    
    // get all the keys in the database as an array
    // without errors
    async getAllKeys(): Promise<IDBValidKey[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vectors"]);
            const objectStore = transaction.objectStore("vectors");
            const request = objectStore.getAllKeys();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

  
    async search(vector: Float32Array, limit: number): Promise<{ key: string; distance: number }[]> {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["vectors"]);
        const objectStore = transaction.objectStore("vectors");
        const cursorRequest = objectStore.openCursor();
        const results: { key: string; distance: number }[] = [];
        console.log("searching")
        cursorRequest.onsuccess = (event) => {
            //@ts-ignore
          const cursor: IDBCursorWithValue = event.target.result;
          if (cursor) {
            const { key, vector: v } = cursor.value;
            const distance = this.cosineDistance(vector, v);
            if (results.length < limit) {
              results.push({ key, distance });
            } else {
              // Check if this distance is smaller than the largest distance in the results
              const maxDistance = Math.max(...results.map((r) => r.distance));
              if (distance < maxDistance) {
                // Replace the result with the largest distance with this one
                const index = results.findIndex((r) =>
                r.distance === maxDistance);
                results[index] = { key, distance };
              }
            }
            cursor.continue();
          } else {
            // Sort the results by distance in ascending order
            results.sort((a, b) => a.distance - b.distance);
            resolve(results);
          }
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });
    }
  
    private cosineDistance(v1: Float32Array, v2: Float32Array): number {
      let dotProduct = 0;
      let v1Norm = 0;
      let v2Norm = 0;
  
      for (let i = 0; i < v1.length; i++) {
        dotProduct += v1[i] * v2[i];
        v1Norm += v1[i] ** 2;
        v2Norm += v2[i] ** 2;
      }
  
      v1Norm = Math.sqrt(v1Norm);
      v2Norm = Math.sqrt(v2Norm);
  
      return 1 - dotProduct / (v1Norm * v2Norm);
    }
  }
    

export class KeyValueDatabase {
    private db: IDBDatabase;
  
    constructor() {
      const request = window.indexedDB.open("keyValueDatabase", 1);
  
      request.onupgradeneeded = (event: any) => {
        this.db = event.target.result;
        this.db.createObjectStore("keyValueStore", { keyPath: "key" });
      };
  
      request.onsuccess = (event: any) => {
        this.db = event.target.result;
      };
    }

    async set(key: string, value: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["keyValueStore"], "readwrite");
            const objectStore = transaction.objectStore("keyValueStore");
            const request = objectStore.put({ key, value });
  
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async get(key: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["keyValueStore"]);
            const objectStore = transaction.objectStore("keyValueStore");
            const request = objectStore.get(key);
            
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    }
    
    async delete(key: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["keyValueStore"], "readwrite");
            const objectStore = transaction.objectStore("keyValueStore");
            const request = objectStore.delete(key);
  
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}
