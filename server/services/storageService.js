/**
 * Storage Service Abstraction
 *
 * Provides a unified interface for file storage that can work with different backends:
 * - Local disk storage (current implementation)
 * - Cloud storage (S3, Cloudinary, etc.) - to be implemented
 *
 * The storage backend is configurable via STORAGE_TYPE environment variable:
 * - 'local' (default): Uses local disk storage
 * - 's3': Amazon S3 (requires AWS SDK and credentials)
 * - 'cloudinary': Cloudinary (requires cloudinary library and credentials)
 *
 * For now, only 'local' is implemented. To add cloud storage:
 * 1. Install required packages (aws-sdk, cloudinary, etc.)
 * 2. Implement the storage adapter methods
 * 3. Add the adapter to the getStorageAdapter function
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Configuration
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';
const LOCAL_UPLOADS_DIR = path.join(__dirname, '..', 'public',
  process.env.UPLOADS_DIR || 'uploads');

// Ensure local uploads directory exists
fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });

/**
 * Local Disk Storage Adapter
 *
 * Stores files on the local filesystem and serves them as static assets.
 */
class LocalStorageAdapter {
  constructor() {
    this.uploadsDir = LOCAL_UPLOADS_DIR;
    this.baseUrl = '/uploads';
  }

  /**
   * Generate a unique filename for an uploaded file
   * @param {Object} file - Multer file object
   * @returns {string} - Filename for storage
   */
  generateFilename(file) {
    const ext = path.extname(file.originalname) || '.jpg';
    // Sanitize filename to prevent path traversal attempts
    const sanitizedExt = ext.replace(/[^a-zA-Z0-9.]/g, '');
    return `user-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${sanitizedExt || '.jpg'}`;
  }

  /**
   * Save a file to local storage
   * @param {Object} file - Multer file object
   * @param {string} filename - Generated filename
   * @returns {Promise<Object>} - Storage result with url and path
   */
  async saveFile(file, filename) {
    return new Promise((resolve, reject) => {
      const filePath = path.join(this.uploadsDir, filename);
      const writeStream = fs.createWriteStream(filePath);

      writeStream.on('error', (err) => reject(err));
      writeStream.on('finish', () => resolve({
        url: `${this.baseUrl}/${filename}`,
        path: filePath,
        filename: filename
      }));

      writeStream.end(file.buffer);
    });
  }

  /**
   * Delete a file from local storage
   * @param {string} filename - Filename to delete
   * @returns {Promise<boolean>} - True if deleted, false if not found
   */
  async deleteFile(filename) {
    const filePath = path.join(this.uploadsDir, filename);
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        return false; // File not found
      }
      throw err;
    }
  }

  /**
   * Get file URL
   * @param {string} filename - Filename
   * @returns {string} - Public URL for the file
   */
  getFileUrl(filename) {
    return `${this.baseUrl}/${filename}`;
  }
}

/**
 * Get storage adapter based on configuration
 * @returns {Object} - Storage adapter instance
 */
function getStorageAdapter() {
  switch (STORAGE_TYPE) {
    case 'local':
      return new LocalStorageAdapter();
    case 's3':
      // TODO: Implement S3 storage adapter
      // return new S3StorageAdapter();
      throw new Error('S3 storage adapter not yet implemented');
    case 'cloudinary':
      // TODO: Implement Cloudinary storage adapter
      // return new CloudinaryStorageAdapter();
      throw new Error('Cloudinary storage adapter not yet implemented');
    default:
      throw new Error(`Unsupported storage type: ${STORAGE_TYPE}`);
  }
}

// Initialize storage adapter
const storageAdapter = getStorageAdapter();

module.exports = {
  storageAdapter,
  STORAGE_TYPE,
  LOCAL_UPLOADS_DIR
};