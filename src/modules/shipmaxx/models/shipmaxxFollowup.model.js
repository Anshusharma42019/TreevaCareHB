import mongoose from 'mongoose';

const shipmaxxFollowupSchema = new mongoose.Schema({
  order_id: { type: String, required: true, index: true },
  followup_number: { type: Number, required: true },
  staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  status: { type: String, default: 'scheduled', index: true },
  scheduled_date: { type: Date, required: true },
  followup_date: { type: Date },
  next_followup_date: { type: Date },
  completed: { type: Boolean, default: false },
  completed_at: Date,
  notes: { type: String, default: '' },
  note: String,
  relief_percentage: { type: Number, default: null },
  type: { type: String, enum: ['automatic', 'manual'], default: 'automatic' },
  auto_message_sent: { type: Boolean, default: false }
}, { timestamps: true });

shipmaxxFollowupSchema.index({ order_id: 1, followup_number: 1 }, { unique: true });
shipmaxxFollowupSchema.index({ order_id: 1, completed: 1 });
shipmaxxFollowupSchema.index({ staff: 1, completed: 1, scheduled_date: 1 });
shipmaxxFollowupSchema.index({ completed: 1, scheduled_date: 1 });
shipmaxxFollowupSchema.index({ order_id: 1, relief_percentage: 1 });

export const ShipmaxxFollowup = mongoose.model('ShipmaxxFollowup', shipmaxxFollowupSchema);
