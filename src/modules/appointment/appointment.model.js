import mongoose from 'mongoose';
import { detectDepartmentFromText } from '../../utils/departmentKeywords.js';

const appointmentSchema = new mongoose.Schema(
  {
    patientName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    doctorName: { type: String, required: true, trim: true },
    appointmentDate: { type: Date, required: true },
    timeSlot: { type: String },
    department: {
      type: String,
      enum: ['male', 'ortho', 'skin', null, ''],
      set: function(val) {
        if (!val || typeof val !== 'string' || !val.trim()) return undefined;
        const lower = val.trim().toLowerCase();
        if (['male', 'ortho', 'skin'].includes(lower)) return lower;
        if (lower.includes('male') || lower.includes('sperm') || lower.includes('erect')) return 'male';
        if (lower.includes('ortho') || lower.includes('joint') || lower.includes('spine') || lower.includes('knee')) return 'ortho';
        if (lower.includes('skin') || lower.includes('acne') || lower.includes('derma')) return 'skin';
        return undefined;
      }
    },
    type: {
      type: String,
      enum: ['consultation', 'follow_up', 'panchakarma', 'ayurveda', 'other'],
      default: 'consultation',
    },
    status: {
      type: String,
      enum: ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'],
      default: 'scheduled',
    },
    patientType: {
      type: String,
      enum: ['new', 'old'],
      default: 'new',
    },
    problem: { type: String, trim: true },
    address: { type: String, trim: true },
    houseNo: { type: String, trim: true },
    cityVillage: { type: String, trim: true },
    postOffice: { type: String, trim: true },
    landmark: { type: String, trim: true },
    district: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    medicineDeliveryDate: { type: Date },
    notes: { type: String, trim: true },
    fieldNotes: [{
      text: { type: String, trim: true },
      addedBy: { type: String },
      addedAt: { type: Date, default: Date.now },
    }],
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

appointmentSchema.pre('validate', function () {
  if (!this.department && this.problem) {
    const detected = detectDepartmentFromText(this.problem);
    if (detected) this.department = detected;
  }
  if (this.department === '') {
    this.department = undefined;
  }
});

appointmentSchema.index({ appointmentDate: 1, status: 1 });
appointmentSchema.index({ phone: 1 });

export const Appointment = mongoose.model('Appointment', appointmentSchema);
export default Appointment;
