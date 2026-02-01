import { Canvas } from '../types';

// File System Access API types
interface FileSystemHandle {
    kind: 'file' | 'directory';
    name: string;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
    kind: 'directory';
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    values(): AsyncIterableIterator<FileSystemHandle>;
}

interface FileSystemFileHandle extends FileSystemHandle {
    kind: 'file';
    getFile(): Promise<File>;
    createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
    write(data: string | BufferSource | Blob): Promise<void>;
    close(): Promise<void>;
}

// Extend Window interface for File System Access API
declare global {
    interface Window {
        showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }
}

// IndexedDB configuration for storing directory handle
const DB_NAME = 'chat-tree-fs';
const DB_VERSION = 1;
const STORE_NAME = 'directory-handles';
const HANDLE_KEY = 'root-directory';

// Directory structure constants
const DATA_FOLDER = 'chat-tree-data'; // Changed from .chat-tree to visible folder
const METADATA_FILE = 'metadata.json';

/**
 * File System Service
 * Uses File System Access API to save/load canvas data to local disk
 * 
 * Directory structure:
 * <user-selected-directory>/
 * └── chat-tree-data/
 *     ├── metadata.json
 *     └── canvas-xxx.json (all canvas files in root)
 */
class FileSystemService {
    private directoryHandle: FileSystemDirectoryHandle | null = null;
    private db: IDBDatabase | null = null;

    /**
     * Check if File System Access API is supported
     */
    isSupported(): boolean {
        return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
    }

    /**
     * Initialize IndexedDB for storing directory handle
     */
    private async initDB(): Promise<IDBDatabase> {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    /**
     * Save directory handle to IndexedDB
     */
    private async saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(handle, HANDLE_KEY);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Load directory handle from IndexedDB
     */
    private async loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(HANDLE_KEY);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Request user to select a directory for storage
     * Returns true if permission granted, false otherwise
     */
    async requestDirectoryAccess(): Promise<boolean> {
        if (!this.isSupported()) {
            console.error('File System Access API is not supported in this browser');
            return false;
        }

        try {
            // @ts-ignore - TypeScript doesn't have types for File System Access API
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite',
                startIn: 'documents'
            });

            // Verify we have write permission
            const permission = await this.verifyPermission(handle);
            if (!permission) {
                return false;
            }

            this.directoryHandle = handle;
            await this.saveDirectoryHandle(handle);

            // Initialize directory structure
            await this.initializeDirectoryStructure();

            return true;
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                // User cancelled the picker
                console.log('User cancelled directory selection');
            } else {
                console.error('Error requesting directory access:', error);
            }
            return false;
        }
    }

    /**
     * Verify we have read/write permission for the directory
     */
    private async verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
        const options = { mode: 'readwrite' as const };

        // Check if we already have permission
        // @ts-ignore
        if ((await handle.queryPermission(options)) === 'granted') {
            return true;
        }

        // Request permission
        // @ts-ignore
        if ((await handle.requestPermission(options)) === 'granted') {
            return true;
        }

        return false;
    }

    /**
     * Initialize directory structure (chat-tree-data/)
     */
    private async initializeDirectoryStructure(): Promise<void> {
        if (!this.directoryHandle) return;

        // Create chat-tree-data folder
        await this.directoryHandle.getDirectoryHandle(DATA_FOLDER, { create: true });
    }

    /**
     * Check if we have directory access
     */
    async hasDirectoryAccess(): Promise<boolean> {
        if (this.directoryHandle) {
            return await this.verifyPermission(this.directoryHandle);
        }

        // Try to restore from IndexedDB
        const savedHandle = await this.loadDirectoryHandle();
        if (savedHandle) {
            const hasPermission = await this.verifyPermission(savedHandle);
            if (hasPermission) {
                this.directoryHandle = savedHandle;
                return true;
            }
        }

        return false;
    }

    /**
     * Get the current directory path (for display purposes)
     */
    getDirectoryPath(): string | null {
        return this.directoryHandle?.name || null;
    }

    /**
     * Save a canvas to the file system
     */
    async saveCanvas(canvas: Canvas): Promise<void> {
        if (!this.directoryHandle) {
            throw new Error('No directory access. Please select a directory first.');
        }

        const dataDir = await this.directoryHandle.getDirectoryHandle(DATA_FOLDER);

        // Create/overwrite canvas file
        const fileName = `${canvas.id}.json`;
        const fileHandle = await dataDir.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();

        // Write canvas data
        const data = JSON.stringify(canvas, null, 2);
        await writable.write(data);
        await writable.close();
    }

    /**
     * Save metadata (active canvas ID, etc.)
     */
    async saveMetadata(data: { activeCanvasId: string }): Promise<void> {
        if (!this.directoryHandle) {
            throw new Error('No directory access. Please select a directory first.');
        }

        const dataDir = await this.directoryHandle.getDirectoryHandle(DATA_FOLDER);
        const fileHandle = await dataDir.getFileHandle(METADATA_FILE, { create: true });
        const writable = await fileHandle.createWritable();

        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
    }

    /**
     * Load all canvases from the file system
     */
    async loadAllCanvases(): Promise<{ canvases: Canvas[], activeCanvasId: string | null }> {
        if (!this.directoryHandle) {
            throw new Error('No directory access. Please select a directory first.');
        }

        try {
            const dataDir = await this.directoryHandle.getDirectoryHandle(DATA_FOLDER);
            const canvases: Canvas[] = [];

            // Iterate through all files in data directory
            // @ts-ignore
            for await (const entry of dataDir.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json') && entry.name !== METADATA_FILE) {
                    const fileHandle = entry as FileSystemFileHandle;
                    const file = await fileHandle.getFile();
                    const text = await file.text();

                    try {
                        const canvas = JSON.parse(text) as Canvas;
                        canvases.push(canvas);
                    } catch (error) {
                        console.error(`Failed to parse canvas file ${entry.name}:`, error);
                    }
                }
            }

            // Load metadata
            let activeCanvasId: string | null = null;
            try {
                const metadataHandle = await dataDir.getFileHandle(METADATA_FILE);
                const metadataFile = await metadataHandle.getFile();
                const metadataText = await metadataFile.text();
                const metadata = JSON.parse(metadataText);
                activeCanvasId = metadata.activeCanvasId;
            } catch (error) {
                // Metadata file doesn't exist or is invalid, that's okay
                console.log('No metadata file found, using default');
            }

            return { canvases, activeCanvasId };
        } catch (error) {
            console.error('Failed to load canvases:', error);
            return { canvases: [], activeCanvasId: null };
        }
    }

    /**
     * Delete a canvas from the file system
     */
    async deleteCanvas(canvasId: string): Promise<void> {
        if (!this.directoryHandle) {
            throw new Error('No directory access. Please select a directory first.');
        }

        const dataDir = await this.directoryHandle.getDirectoryHandle(DATA_FOLDER);
        const fileName = `${canvasId}.json`;
        // @ts-ignore
        await dataDir.removeEntry(fileName);
    }

    /**
     * Clear directory handle (for logout/switching directories)
     */
    async clearDirectoryAccess(): Promise<void> {
        this.directoryHandle = null;

        const db = await this.initDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(HANDLE_KEY);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// Export singleton instance
export const fileSystemService = new FileSystemService();
