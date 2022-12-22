export class VectorDatabase {
    private db: IDBDatabase;
    id: string;
  
    constructor(id: string) {
      this.id = id
      const request = indexedDB.open(this.id, 1);
  
      request.onupgradeneeded = () => {
        this.db = request.result;
        this.db.createObjectStore("vectorDatabase", { keyPath: "key" });
      };
  
      request.onsuccess = () => {
        this.db = request.result;
      };
    }
  
    async addVector(key: string, vector: Float32Array): Promise<void> {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["vectorDatabase"], "readwrite");
        const objectStore = transaction.objectStore("vectorDatabase");
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
        const transaction = this.db.transaction(["vectorDatabase"], "readwrite");
        const objectStore = transaction.objectStore("vectorDatabase");
        const request = objectStore.delete(key);
  
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    }

    async readVector(key: string): Promise<Float32Array> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vectorDatabase"]);
            const objectStore = transaction.objectStore("vectorDatabase");
            const request = objectStore.get(key);
            
            request.onsuccess = () => resolve(request.result.vector);
            request.onerror = () => reject(request.error);
        });
    }
  
    async hasKey(key: string): Promise<boolean> {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["vectorDatabase"]);
        const objectStore = transaction.objectStore("vectorDatabase");
        const request = objectStore.get(key);
  
        request.onsuccess = () => resolve(request.result !== undefined);
        request.onerror = () => reject(request.error);
      });
    }
    
    // get all the keys in the database as an array
    // without errors
    async getAllKeys(): Promise<IDBValidKey[]> {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(["vectorDatabase"]);
            const objectStore = transaction.objectStore("vectorDatabase");
            const request = objectStore.getAllKeys();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // This is the search function
    async search(vector: Float32Array, limit: number): Promise<{ key: string; similarity: number }[]> {
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(["vectorDatabase"]);
        const objectStore = transaction.objectStore("vectorDatabase");
        const cursorRequest = objectStore.openCursor();
        const results: { key: string; similarity: number }[] = [];
        // console.log("searching")
        cursorRequest.onsuccess = (event) => {
            //@ts-ignore
          const cursor: IDBCursorWithValue = event.target.result;
          if (cursor) {
            const { key, vector: v } = cursor.value;
            const similarity = this.cosineSimilarity(vector, v);
            if (results.length < limit) {
              results.push({ key, similarity });
            } else {
              // Check if this similarity is larger than the smallest similarity in the results
              const minSimilarity = Math.min(...results.map((r) => r.similarity));
              if (similarity > minSimilarity) {
                // Replace the result with the smallest similarity with this one
                const index = results.findIndex((r) =>
                r.similarity === minSimilarity);
                results[index] = { key, similarity };
              }
            }
            cursor.continue();
          } else {
            // Sort the results by similarity in descending order
            results.sort((a, b) => b.similarity - a.similarity);
            resolve(results);
          }
        };
        cursorRequest.onerror = () => reject(cursorRequest.error);
      });
    }

    // This is the cosine similarity function
    cosineSimilarity(v1: Float32Array, v2: Float32Array): number {
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

      return dotProduct / (v1Norm * v2Norm);
    }

   

  }

export class KeyValueDatabase {
    private db: IDBDatabase;
    id: string;
  
    constructor(id: string) {
      this.id = id;
      const request = window.indexedDB.open(this.id, 1);
  
      request.onupgradeneeded = (event: any) => {
        this.db = event.target.result;
        this.db.createObjectStore("keyValueStore", { keyPath: "key" });
      };
  
      request.onsuccess = (event: any) => {
        this.db = event.target.result;
      };
    }

    async set(key: string, value: string | number | boolean | object): Promise<void> {
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
