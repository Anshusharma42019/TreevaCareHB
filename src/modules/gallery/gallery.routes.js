import express from 'express';
import multer from 'multer';
import auth from '../../middleware/auth.js';
import ApiError from '../../utils/ApiError.js';
import * as galleryController from './gallery.controller.js';

const router = express.Router();

// Multer memory storage supporting all image formats (JPG, JPEG, PNG, WEBP, GIF, BMP, HEIC, TIFF), PDFs, and Documents (up to 25MB)
const storage = multer.memoryStorage();
const fileFilter = (req, file, cb) => {
  const ext = (file.originalname || '').toLowerCase();
  const isImageExt = /\.(jpg|jpeg|png|webp|gif|bmp|tiff|heic|heif|svg)$/i.test(ext);
  const isPdfExt = /\.pdf$/i.test(ext);
  const isDocExt = /\.(doc|docx|txt|rtf|csv)$/i.test(ext);

  const isImageMime = file.mimetype && file.mimetype.startsWith('image/');
  const isPdfMime = file.mimetype === 'application/pdf';
  const isDocMime = file.mimetype && (
    file.mimetype.includes('word') ||
    file.mimetype.includes('document') ||
    file.mimetype.includes('pdf') ||
    file.mimetype.includes('text')
  );

  if (isImageExt || isPdfExt || isDocExt || isImageMime || isPdfMime || isDocMime) {
    return cb(null, true);
  }
  cb(new ApiError(400, 'Only image files (JPG, PNG, WEBP, HEIC, etc.) and PDF/document files are allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max limit
});

const allowedRoles = ['admin', 'manager', 'sales', 'doctor', 'support', 'logistics', 'staff'];

// Middleware to permit cross-origin iframe viewing and file downloading
const allowIframeStream = (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  next();
};

router
  .route('/')
  .post(auth(...allowedRoles), upload.single('file'), galleryController.createReport)
  .get(auth(...allowedRoles), galleryController.getReports);

router.get('/lookup', auth(...allowedRoles), galleryController.lookupCustomer);
router.get('/view/:id', allowIframeStream, galleryController.viewReportFile);
router.get('/download/:id', allowIframeStream, galleryController.downloadReportFile);

router
  .route('/:id')
  .get(auth(...allowedRoles), galleryController.getReportById)
  .patch(auth(...allowedRoles), galleryController.updateReport)
  .delete(auth(...allowedRoles), galleryController.deleteReport);

export default router;
