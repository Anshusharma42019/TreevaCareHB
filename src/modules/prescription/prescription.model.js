import mongoose from 'mongoose';

const prescriptionSchema = new mongoose.Schema(
  {
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    verification: { type: mongoose.Schema.Types.ObjectId, ref: 'Verification', default: null },
    readyToShipment: { type: mongoose.Schema.Types.ObjectId, ref: 'ReadyToShipment', default: null },
    targetId: { type: String, index: true },
    orderId: { type: String, default: null },
    kitNumber: { type: Number, default: 1, min: 1, index: true },
    kitName: { type: String, default: 'Kit 1' },
    patientName: { type: String },
    phone: { type: String },
    age: { type: Number },
    weight: { type: Number },
    gender: { type: String },
    maritalStatus: { type: String },
    occupation: { type: String },
    problemDuration: { type: String },
    problem: { type: String },
    doctorName: { type: String },
    doctorDegree: { type: String },
    department: { type: String },
    prescribedMedicines: [
      {
        id: { type: mongoose.Schema.Types.Mixed },
        name: { type: String },
        qty: { type: Number, default: 1 },
        dosage: { type: String },
        frequency: { type: String },
        timing: { type: String },
        duration: { type: String },
      },
    ],
    complaints: [{ type: String }],
    notes: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

prescriptionSchema.index({ lead: 1, createdAt: -1 });
prescriptionSchema.index({ targetId: 1, createdAt: -1 });
prescriptionSchema.index({ phone: 1 });
prescriptionSchema.index({ orderId: 1 });
prescriptionSchema.index({ phone: 1, kitNumber: 1 });
prescriptionSchema.index({ lead: 1, kitNumber: 1 });
prescriptionSchema.index({ targetId: 1, kitNumber: 1 });

export const Prescription = mongoose.model('Prescription', prescriptionSchema);
export default Prescription;
