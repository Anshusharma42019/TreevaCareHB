import mongoose from 'mongoose';
import path from 'path';
import GalleryReport from './gallery.model.js';
import Lead from '../lead/lead.model.js';
import { ShipmaxxOrder } from '../shipmaxx/models/shipmaxxOrder.model.js';
import Verification from '../verification/verification.model.js';
import cloudinary from '../../config/cloudinary.js';
import streamifier from 'streamifier';
import ApiError from '../../utils/ApiError.js';
import httpStatus from 'http-status';

/**
 * Upload stream to Cloudinary supporting images, PDFs, and documents.
 * Ensures PDF and document files preserve their extension in the Cloudinary URL.
 */
export const uploadFileToCloudinary = (fileBuffer, originalname, mimetype) => {
  return new Promise((resolve, reject) => {
    const rawExt = path.extname(originalname || '').toLowerCase();
    const ext = rawExt || (mimetype === 'application/pdf' ? '.pdf' : '');
    const isPdf = mimetype === 'application/pdf' || ext === '.pdf';
    const isDoc = ext === '.doc' || ext === '.docx' || ext === '.txt';
    const isRaw = isPdf || isDoc;

    const baseName = path.basename(originalname || 'report', rawExt).replace(/[^a-zA-Z0-9_-]/g, '_');
    // Including extension in public_id ensures Cloudinary URL ends with .pdf / .docx
    const safePublicId = `${Date.now()}_${baseName.slice(0, 40)}${isRaw ? ext : ''}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'crm-triven/medical-reports',
        resource_type: isRaw ? 'raw' : 'auto',
        public_id: safePublicId,
        format: isPdf ? 'pdf' : undefined,
      },
      (error, result) => {
        if (error) {
          console.error('[Gallery Cloudinary Upload Error]:', error);
          return reject(new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to upload report to Cloudinary'));
        }
        resolve(result);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/**
 * Create a new Gallery Report.
 */
export const createReport = async (body, file, userId) => {
  let fileUrl = body.fileUrl;
  let fileType = body.fileType || 'image';
  let fileName = body.fileName || (file ? file.originalname : 'report_document');
  let fileSize = file ? file.size : 0;
  let cloudinaryPublicId = '';

  if (file) {
    const uploadResult = await uploadFileToCloudinary(file.buffer, file.originalname, file.mimetype);
    fileUrl = uploadResult.secure_url || uploadResult.url;
    cloudinaryPublicId = uploadResult.public_id || '';
    fileSize = uploadResult.bytes || file.size;

    const ext = (file.originalname || '').toLowerCase();
    if (file.mimetype === 'application/pdf' || ext.endsWith('.pdf')) {
      fileType = 'pdf';
    } else if (
      file.mimetype?.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp|gif|bmp|tiff|heic|heif|svg)$/i.test(ext)
    ) {
      fileType = 'image';
    } else {
      fileType = 'document';
    }
  }

  if (!fileUrl) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Report file or file URL is required');
  }

  const phoneDigits = String(body.phone || '').replace(/\D/g, '');
  const cleanPhone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : phoneDigits;
  const orderId = body.orderId ? String(body.orderId).trim().toUpperCase() : '';

  // Attempt to link lead automatically if not supplied
  let leadId = body.lead && mongoose.Types.ObjectId.isValid(body.lead) ? body.lead : null;
  if (!leadId && cleanPhone) {
    const matchedLead = await Lead.findOne({
      phone: new RegExp(cleanPhone + '$'),
      isDeleted: { $ne: true },
    })
      .select('_id')
      .lean();
    if (matchedLead) leadId = matchedLead._id;
  }

  const report = await GalleryReport.create({
    patientName: body.patientName?.trim() || 'Unknown Patient',
    phone: body.phone?.trim() || '',
    cleanPhone,
    orderId,
    lead: leadId,
    reportTitle: body.reportTitle?.trim() || 'Medical Report',
    reportType: body.reportType || 'other',
    department: body.department || 'general',
    reportDate: body.reportDate ? new Date(body.reportDate) : new Date(),
    fileUrl,
    fileType,
    fileName,
    fileSize,
    cloudinaryPublicId,
    notes: body.notes?.trim() || '',
    uploadedBy: userId,
  });

  return await GalleryReport.findById(report._id)
    .populate('uploadedBy', 'name employeeId role avatar')
    .populate('lead', 'name phone status department')
    .lean();
};

/**
 * Query Gallery Reports with flexible filters and high-performance search.
 */
export const queryReports = async (query = {}, user) => {
  const {
    search,
    phone,
    orderId,
    department,
    reportType,
    startDate,
    endDate,
    page = 1,
    limit = 24,
  } = query;

  const filter = { isDeleted: false };

  // Free-text or multi-target search
  if (search && search.trim()) {
    const rawSearch = search.trim();
    const digitsOnly = rawSearch.replace(/\D/g, '');
    const searchConditions = [];

    // If searching contains digits (phone or order number)
    if (digitsOnly.length >= 3) {
      searchConditions.push({ phone: { $regex: digitsOnly, $options: 'i' } });
      searchConditions.push({ cleanPhone: { $regex: digitsOnly, $options: 'i' } });
    }

    // Search by Order ID
    searchConditions.push({ orderId: { $regex: rawSearch.toUpperCase(), $options: 'i' } });

    // Search by Patient Name or Report Title
    searchConditions.push({ patientName: { $regex: rawSearch, $options: 'i' } });
    searchConditions.push({ reportTitle: { $regex: rawSearch, $options: 'i' } });
    searchConditions.push({ notes: { $regex: rawSearch, $options: 'i' } });

    filter.$or = searchConditions;
  }

  // Specific phone filter
  if (phone && phone.trim()) {
    const digits = phone.trim().replace(/\D/g, '');
    const clean = digits.length >= 10 ? digits.slice(-10) : digits;
    filter.$or = [
      { cleanPhone: { $regex: clean, $options: 'i' } },
      { phone: { $regex: digits, $options: 'i' } },
    ];
  }

  // Specific orderId filter
  if (orderId && orderId.trim()) {
    filter.orderId = { $regex: orderId.trim().toUpperCase(), $options: 'i' };
  }

  // Department filter
  if (department && department !== 'all') {
    filter.department = department;
  }

  // Report type filter
  if (reportType && reportType !== 'all') {
    filter.reportType = reportType;
  }

  // Date range filter
  if (startDate || endDate) {
    filter.reportDate = {};
    if (startDate) filter.reportDate.$gte = new Date(startDate);
    if (endDate) {
      const eDate = new Date(endDate);
      eDate.setHours(23, 59, 59, 999);
      filter.reportDate.$lte = eDate;
    }
  }

  // Department restriction for users assigned only to specific departments
  if (user && user.departments && user.departments.length > 0 && !['admin', 'manager'].includes(user.role)) {
    filter.department = { $in: [...user.departments, 'general'] };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 24));
  const skip = (pageNum - 1) * limitNum;

  const [reports, total] = await Promise.all([
    GalleryReport.find(filter)
      .populate('uploadedBy', 'name employeeId role avatar')
      .populate('lead', 'name phone status department')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    GalleryReport.countDocuments(filter),
  ]);

  return {
    reports,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    limit: limitNum,
  };
};

/**
 * Get a single report by ID.
 */
export const getReportById = async (id) => {
  const report = await GalleryReport.findOne({ _id: id, isDeleted: false })
    .populate('uploadedBy', 'name employeeId role avatar')
    .populate('lead', 'name phone status department address')
    .lean();

  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Report not found');
  }
  return report;
};

/**
 * Update report details.
 */
export const updateReport = async (id, updateBody) => {
  const report = await GalleryReport.findOne({ _id: id, isDeleted: false });
  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Report not found');
  }

  const allowedFields = [
    'patientName',
    'phone',
    'orderId',
    'reportTitle',
    'reportType',
    'department',
    'reportDate',
    'notes',
  ];

  allowedFields.forEach((field) => {
    if (updateBody[field] !== undefined) {
      report[field] = updateBody[field];
    }
  });

  await report.save();
  return await GalleryReport.findById(report._id)
    .populate('uploadedBy', 'name employeeId role avatar')
    .populate('lead', 'name phone status department')
    .lean();
};

/**
 * Soft delete a report.
 */
export const deleteReport = async (id) => {
  const report = await GalleryReport.findOne({ _id: id, isDeleted: false });
  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Report not found');
  }

  report.isDeleted = true;
  await report.save();
  return report;
};

/**
 * Lookup customer details by phone number or order ID from CRM data (Lead, Verification, ShipmaxxOrder).
 * Extremely useful when uploading a report so staff doesn't have to re-type details.
 */
export const lookupCustomer = async (term) => {
  if (!term || !term.trim()) return [];

  const rawTerm = term.trim();
  const digits = rawTerm.replace(/\D/g, '');
  const cleanPhone = digits.length >= 10 ? digits.slice(-10) : digits;

  const results = [];
  const seenKeys = new Set();

  // 1. Search Leads
  const leadMatch = [];
  if (cleanPhone.length >= 4) {
    leadMatch.push({ phone: { $regex: cleanPhone } });
  }
  leadMatch.push({ name: { $regex: rawTerm, $options: 'i' } });

  const leads = await Lead.find({ $or: leadMatch, isDeleted: { $ne: true } })
    .select('_id name phone department address cityVillage state pincode')
    .limit(5)
    .lean();

  for (const l of leads) {
    const key = `lead-${l.phone}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      results.push({
        source: 'lead',
        leadId: l._id,
        patientName: l.name,
        phone: l.phone,
        orderId: '',
        department: l.department || 'general',
        address: [l.address, l.cityVillage, l.state].filter(Boolean).join(', '),
      });
    }
  }

  // 2. Search Shipmaxx Orders by order_id, awb_code, or billing_phone
  const orderMatch = [];
  if (digits.length >= 4) {
    orderMatch.push({ billing_phone: { $regex: digits } });
  }
  orderMatch.push({ order_id: { $regex: rawTerm, $options: 'i' } });
  orderMatch.push({ awb_code: { $regex: rawTerm, $options: 'i' } });
  orderMatch.push({ billing_customer_name: { $regex: rawTerm, $options: 'i' } });

  const orders = await ShipmaxxOrder.find({ $or: orderMatch })
    .select('order_id awb_code billing_customer_name billing_phone shipping_city shipping_state')
    .limit(5)
    .lean();

  for (const o of orders) {
    const key = `order-${o.order_id || o.awb_code}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      results.push({
        source: 'shipmaxx',
        leadId: null,
        patientName: o.billing_customer_name || 'Customer',
        phone: o.billing_phone || '',
        orderId: o.order_id || o.awb_code || '',
        department: 'general',
        address: [o.shipping_city, o.shipping_state].filter(Boolean).join(', '),
      });
    }
  }

  return results.slice(0, 8);
};

/**
 * Stream report file for seamless inline viewing or download.
 * Uses authenticated Cloudinary private download to bypass restricted ACL delivery.
 */
export const getReportFileStream = async (id) => {
  const report = await GalleryReport.findOne({ _id: id, isDeleted: false }).lean();
  if (!report) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Report not found');
  }

  const fileUrl = report.fileUrl;
  let fileName = report.fileName || 'medical_report.pdf';
  const ext = path.extname(fileName || '').toLowerCase();
  
  let mimeType = 'application/pdf';
  if (report.fileType === 'pdf' || ext === '.pdf') mimeType = 'application/pdf';
  else if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.doc') mimeType = 'application/msword';
  else if (ext === '.docx') mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  else if (ext === '.txt') mimeType = 'text/plain';

  // If it's a Cloudinary URL, use private_download_url to fetch securely
  if (fileUrl && fileUrl.includes('cloudinary.com')) {
    let publicId = report.cloudinaryPublicId;
    if (!publicId) {
      const match = fileUrl.match(/\/upload\/(?:v\d+\/)?(.+)$/);
      if (match) publicId = match[1];
    }

    if (publicId) {
      const format = path.extname(publicId).replace('.', '') || (report.fileType === 'pdf' ? 'pdf' : '');
      const isRaw = report.fileType === 'pdf' || report.fileType === 'document' || fileUrl.includes('/raw/');
      const privateUrl = cloudinary.utils.private_download_url(publicId, format, {
        resource_type: isRaw ? 'raw' : 'auto',
        type: 'upload',
      });

      const upstream = await fetch(privateUrl);
      if (upstream.ok) {
        const arrayBuf = await upstream.arrayBuffer();
        return {
          buffer: Buffer.from(arrayBuf),
          mimeType,
          fileName,
        };
      }
    }
  }

  // Fallback: direct fetch from fileUrl
  const directUpstream = await fetch(fileUrl);
  if (!directUpstream.ok) {
    throw new ApiError(directUpstream.status, 'Unable to fetch file from storage');
  }
  const arrayBuf = await directUpstream.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuf),
    mimeType,
    fileName,
  };
};
