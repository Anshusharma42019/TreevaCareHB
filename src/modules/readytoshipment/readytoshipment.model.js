import mongoose from 'mongoose';

const readyToShipmentSchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true, unique: true },
    title: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    lead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead' },
    description: { type: String },
    cityVillageType: { type: String, enum: ['city', 'village'], default: 'city' },
    cityVillage: { type: String },
    houseNo: { type: String },
    postOffice: { type: String },
    district: { type: String },
    landmark: { type: String },
    pincode: { type: String },
    state: { type: String },
    problem: { type: String },
    age: { type: Number },
    weight: { type: Number },
    height: { type: Number },
    gender: { type: String },
    occupation: { type: String },
    maritalStatus: { type: String },
    otherProblems: { type: String },
    problemDuration: { type: String },
    price: { type: Number },
    reminderAt: { type: Date },
    notes: [{ text: String, createdAt: { type: Date, default: Date.now } }],
    department: {
      type: String,
      enum: ['male', 'ortho', 'skin'],
      default: null,
    },
    sentToShiprocket: { type: Boolean, default: false },
    prescribedMedicines: [
      {
        id: { type: mongoose.Schema.Types.Mixed },
        name: { type: String },
        dosage: { type: String },
        frequency: { type: String },
        timing: { type: String },
        duration: { type: String },
      },
    ],
  },
  { timestamps: true }
);

readyToShipmentSchema.index({ sentToShiprocket: 1, task: 1 });
readyToShipmentSchema.index({ createdAt: -1 });
readyToShipmentSchema.index({ sentToShiprocket: 1, createdAt: -1 });
readyToShipmentSchema.index({ sentToShiprocket: 1, state: 1, createdAt: -1 });
readyToShipmentSchema.index({ sentToShiprocket: 1, pincode: 1, createdAt: -1 });
readyToShipmentSchema.index({ department: 1, sentToShiprocket: 1, createdAt: -1 });
readyToShipmentSchema.index({ assignedTo: 1, sentToShiprocket: 1, createdAt: -1 });
readyToShipmentSchema.index({ assignedTo: 1, department: 1, sentToShiprocket: 1, createdAt: -1 });

export default mongoose.model('ReadyToShipment', readyToShipmentSchema);
