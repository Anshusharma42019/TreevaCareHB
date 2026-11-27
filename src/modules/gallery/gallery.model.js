import mongoose from 'mongoose';

const galleryReportSchema = new mongoose.Schema(
  {
    patientName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    cleanPhone: {
      type: String,
      trim: true,
      index: true,
    },
    orderId: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
      index: true,
    },
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    reportTitle: {
      type: String,
      required: true,
      trim: true,
    },
    reportType: {
      type: String,
      enum: [
        'blood_test',
        'urine_test',
        'semen_analysis',
        'mri_scan',
        'x_ray',
        'ultrasound',
        'skin_report',
        'prescription',
        'discharge_summary',
        'other',
      ],
      default: 'other',
    },
    department: {
      type: String,
      enum: ['male', 'ortho', 'skin', 'general'],
      default: 'general',
    },
    reportDate: {
      type: Date,
      default: Date.now,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      enum: ['image', 'pdf', 'document'],
      default: 'image',
    },
    fileName: {
      type: String,
      default: 'report_document',
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    cloudinaryPublicId: {
      type: String,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Pre-save hook to extract clean 10-digit phone
galleryReportSchema.pre('save', function () {
  if (this.phone) {
    const digits = String(this.phone).replace(/\D/g, '');
    this.cleanPhone = digits.length >= 10 ? digits.slice(-10) : digits;
  }
  if (this.orderId) {
    this.orderId = this.orderId.trim().toUpperCase();
  }
});

// Compound indexes for high performance search & filtering
galleryReportSchema.index({ isDeleted: 1, cleanPhone: 1, createdAt: -1 });
galleryReportSchema.index({ isDeleted: 1, orderId: 1, createdAt: -1 });
galleryReportSchema.index({ isDeleted: 1, department: 1, createdAt: -1 });
galleryReportSchema.index({ isDeleted: 1, reportType: 1, createdAt: -1 });
galleryReportSchema.index({
  patientName: 'text',
  phone: 'text',
  orderId: 'text',
  reportTitle: 'text',
  notes: 'text',
});

const GalleryReport = mongoose.model('GalleryReport', galleryReportSchema);
export default GalleryReport;
