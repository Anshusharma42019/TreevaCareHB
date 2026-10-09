import mongoose from 'mongoose';

const ndrNoteSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone_number: { type: String, required: true },
  reason: { type: String, required: true },
  awb_number: { type: String, required: true },
  price: { type: Number, default: null },
  source: { type: String, default: 'shipmaxx' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

export const NdrNote = mongoose.models.NdrNote || mongoose.model('NdrNote', ndrNoteSchema);
export default NdrNote;
