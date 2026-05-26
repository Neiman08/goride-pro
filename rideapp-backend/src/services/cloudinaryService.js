const cloudinary = require('cloudinary').v2;
const logger = require('../utils/logger');

// ── Configure Cloudinary ──────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ── Folder structure ──────────────────────────────────────────────────────
const FOLDERS = {
  avatar:       'goride/avatars',
  license:      'goride/drivers/licenses',
  insurance:    'goride/drivers/insurance',
  registration: 'goride/drivers/registration',
  selfie:       'goride/drivers/selfies',
  vehicle:      'goride/vehicles',
};

/**
 * Upload a file buffer to Cloudinary.
 * Documents (license, insurance, etc.) are uploaded as private.
 * Avatars and vehicle photos are public.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - One of FOLDERS keys
 * @param {string} publicId - Optional specific public_id
 * @param {object} opts - Extra Cloudinary options
 * @returns {{ url, publicId, secureUrl }}
 */
async function uploadFile(buffer, folder, publicId = null, opts = {}) {
  const isPrivate = ['license', 'insurance', 'registration', 'selfie'].includes(folder);

  return new Promise((resolve, reject) => {
    const uploadOptions = {
      folder: FOLDERS[folder] || `goride/${folder}`,
      resource_type: 'auto',
      type: isPrivate ? 'private' : 'upload', // private = requires signed URL
      access_mode: isPrivate ? 'authenticated' : 'public',
      ...opts,
    };

    if (publicId) uploadOptions.public_id = publicId;

    const stream = cloudinary.uploader.upload_stream(uploadOptions, (err, result) => {
      if (err) {
        logger.error('Cloudinary upload error:', err);
        return reject(err);
      }
      resolve({
        url:       result.secure_url,
        publicId:  result.public_id,
        secureUrl: result.secure_url,
        format:    result.format,
        bytes:     result.bytes,
      });
    });

    stream.end(buffer);
  });
}

/**
 * Generate a signed URL for private documents (expires in 1 hour).
 * Use this when admin or the driver needs to view their docs.
 */
function getSignedUrl(publicId, expiresInSeconds = 3600) {
  return cloudinary.utils.private_download_url(publicId, 'jpg', {
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    attachment: false,
  });
}

/**
 * Delete a file from Cloudinary.
 */
async function deleteFile(publicId, resourceType = 'image') {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    logger.info(`Cloudinary: deleted ${publicId}`);
  } catch (err) {
    logger.error('Cloudinary delete error:', err);
  }
}

/**
 * Upload from base64 data URL (used from frontend camera captures).
 */
async function uploadBase64(dataUrl, folder, publicId = null) {
  return new Promise((resolve, reject) => {
    const isPrivate = ['license', 'insurance', 'registration', 'selfie'].includes(folder);
    cloudinary.uploader.upload(dataUrl, {
      folder: FOLDERS[folder] || `goride/${folder}`,
      type: isPrivate ? 'private' : 'upload',
      access_mode: isPrivate ? 'authenticated' : 'public',
      public_id: publicId || undefined,
    }, (err, result) => {
      if (err) return reject(err);
      resolve({ url: result.secure_url, publicId: result.public_id });
    });
  });
}

module.exports = { uploadFile, uploadBase64, getSignedUrl, deleteFile, FOLDERS };
