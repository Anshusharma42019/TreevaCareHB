import express from 'express';
import auth from '../../middleware/auth.js';
import Prescription from './prescription.model.js';

const router = express.Router();

// GET /api/prescriptions/get-by-target?targetId=...&leadId=...&taskId=...
router.get('/get-by-target', auth('admin', 'manager', 'sales', 'support', 'logistics', 'doctor', 'staff'), async (req, res) => {
  try {
    const { targetId, leadId, taskId, appointmentId } = req.query;
    const matchCriteria = [];
    if (targetId) matchCriteria.push({ targetId: String(targetId) });
    if (leadId) matchCriteria.push({ lead: leadId });
    if (taskId) matchCriteria.push({ task: taskId });
    if (appointmentId) matchCriteria.push({ appointment: appointmentId });
    if (targetId && targetId.length === 24) matchCriteria.push({ _id: targetId });

    if (matchCriteria.length === 0) {
      return res.status(400).json({ status: 400, message: 'Missing targetId or leadId parameter' });
    }

    const prescription = await Prescription.findOne({ $or: matchCriteria }).sort({ updatedAt: -1 }).lean();
    res.json({ status: 200, data: prescription || null });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

// POST /api/prescriptions/save
router.post('/save', auth('admin', 'manager', 'sales', 'support', 'logistics', 'doctor', 'staff'), async (req, res) => {
  try {
    const { targetId, leadId, taskId, appointmentId, verificationId, readyToShipmentId, prescribedMedicines, ...otherFields } = req.body;

    const query = [];
    if (targetId) query.push({ targetId: String(targetId) });
    if (leadId) query.push({ lead: leadId });
    if (taskId) query.push({ task: taskId });
    if (appointmentId) query.push({ appointment: appointmentId });

    let existing = null;
    if (query.length > 0) {
      existing = await Prescription.findOne({ $or: query });
    }

    const payload = {
      ...otherFields,
      prescribedMedicines: Array.isArray(prescribedMedicines) ? prescribedMedicines : [],
      createdBy: req.user?._id,
    };
    if (targetId) payload.targetId = String(targetId);
    if (leadId) payload.lead = leadId;
    if (taskId) payload.task = taskId;
    if (appointmentId) payload.appointment = appointmentId;
    if (verificationId) payload.verification = verificationId;
    if (readyToShipmentId) payload.readyToShipment = readyToShipmentId;

    let savedPrescription;
    if (existing) {
      savedPrescription = await Prescription.findByIdAndUpdate(existing._id, payload, { new: true });
    } else {
      savedPrescription = await Prescription.create(payload);
    }

    res.json({ status: 200, data: savedPrescription, message: 'Prescription saved successfully in dedicated database collection' });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
