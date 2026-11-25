import express from 'express';
import auth from '../../middleware/auth.js';
import Prescription from './prescription.model.js';

const router = express.Router();

// GET /api/prescriptions/get-by-target?targetId=...&leadId=...&taskId=...&kitNumber=...
router.get('/get-by-target', auth('admin', 'manager', 'sales', 'support', 'logistics', 'doctor', 'staff'), async (req, res) => {
  try {
    const { targetId, leadId, taskId, appointmentId, phone, kitNumber } = req.query;
    const matchCriteria = [];
    if (targetId) matchCriteria.push({ targetId: String(targetId) });
    if (leadId) matchCriteria.push({ lead: leadId });
    if (taskId) matchCriteria.push({ task: taskId });
    if (appointmentId) matchCriteria.push({ appointment: appointmentId });
    if (targetId && targetId.length === 24) matchCriteria.push({ _id: targetId });
    if (phone) {
      const cleanPhone = String(phone).replace(/\D/g, '').slice(-10);
      if (cleanPhone) matchCriteria.push({ phone: new RegExp(cleanPhone, 'i') });
    }

    if (matchCriteria.length === 0) {
      return res.status(400).json({ status: 400, message: 'Missing targetId or leadId parameter' });
    }

    const rawPrescriptions = await Prescription.find({ $or: matchCriteria }).sort({ kitNumber: 1, createdAt: 1 }).lean();

    if (!rawPrescriptions || rawPrescriptions.length === 0) {
      return res.json({ status: 200, data: null, allKits: [], totalKits: 0 });
    }

    const allPrescriptions = rawPrescriptions.map((p, idx) => {
      const kNum = Number(p.kitNumber) || (idx === 0 ? 1 : idx + 1);
      return {
        ...p,
        kitNumber: kNum,
        kitName: p.kitName || `Kit ${kNum}`,
      };
    });

    let selectedPrescription = null;
    // 1. If targetId matches a specific prescription (e.g. order 470410 -> Kit 2)
    if (targetId) {
      selectedPrescription = allPrescriptions.find((p) => String(p.targetId) === String(targetId));
    }

    // 2. If kitNumber is requested
    if (!selectedPrescription && kitNumber) {
      const kNum = Number(kitNumber);
      selectedPrescription = allPrescriptions.find((p) => p.kitNumber === kNum);
    }

    // 3. Fallback: default to latest kit
    if (!selectedPrescription) {
      selectedPrescription = allPrescriptions[allPrescriptions.length - 1];
    }

    res.json({
      status: 200,
      data: selectedPrescription,
      allKits: allPrescriptions,
      totalKits: allPrescriptions.length,
    });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

// POST /api/prescriptions/save
router.post('/save', auth('admin', 'manager', 'sales', 'support', 'logistics', 'doctor', 'staff'), async (req, res) => {
  try {
    const {
      targetId,
      leadId,
      taskId,
      appointmentId,
      verificationId,
      readyToShipmentId,
      orderId,
      kitNumber: rawKitNumber,
      kitName: rawKitName,
      prescriptionDocId,
      prescribedMedicines,
      ...otherFields
    } = req.body;

    const kitNumber = Number(rawKitNumber) || 1;
    const kitName = rawKitName || `Kit ${kitNumber}`;

    let existing = null;

    // 1. If explicit prescription mongo ID provided, update that exact document
    if (prescriptionDocId && /^[0-9a-fA-F]{24}$/.test(prescriptionDocId)) {
      existing = await Prescription.findById(prescriptionDocId);
    }

    // 2. Otherwise search for matching prescription for this specific kitNumber
    if (!existing) {
      const criteria = [];
      if (targetId) criteria.push({ targetId: String(targetId) });
      if (leadId) criteria.push({ lead: leadId });
      if (taskId) criteria.push({ task: taskId });
      if (appointmentId) criteria.push({ appointment: appointmentId });
      if (otherFields.phone) {
        const cleanPhone = String(otherFields.phone).replace(/\D/g, '').slice(-10);
        if (cleanPhone) criteria.push({ phone: new RegExp(cleanPhone, 'i') });
      }

      if (criteria.length > 0) {
        const kitFilter = kitNumber === 1
          ? { $or: [{ kitNumber: 1 }, { kitNumber: { $exists: false } }, { kitNumber: null }] }
          : { kitNumber: kitNumber };

        existing = await Prescription.findOne({
          $and: [
            { $or: criteria },
            kitFilter,
          ],
        });
      }
    }

    const payload = {
      ...otherFields,
      kitNumber,
      kitName,
      prescribedMedicines: Array.isArray(prescribedMedicines) ? prescribedMedicines : [],
      createdBy: req.user?._id,
    };
    if (targetId) payload.targetId = String(targetId);
    if (leadId) payload.lead = leadId;
    if (taskId) payload.task = taskId;
    if (appointmentId) payload.appointment = appointmentId;
    if (verificationId) payload.verification = verificationId;
    if (readyToShipmentId) payload.readyToShipment = readyToShipmentId;
    if (orderId) payload.orderId = String(orderId);

    let savedPrescription;
    if (existing) {
      savedPrescription = await Prescription.findByIdAndUpdate(existing._id, payload, { returnDocument: 'after' });
    } else {
      savedPrescription = await Prescription.create(payload);
    }

    // Fetch all kits for this patient to return in response
    const searchMatch = [];
    if (savedPrescription.targetId) searchMatch.push({ targetId: savedPrescription.targetId });
    if (savedPrescription.lead) searchMatch.push({ lead: savedPrescription.lead });
    if (savedPrescription.phone) {
      const cleanPhone = String(savedPrescription.phone).replace(/\D/g, '').slice(-10);
      if (cleanPhone) searchMatch.push({ phone: new RegExp(cleanPhone, 'i') });
    }

    const allKits = searchMatch.length > 0
      ? await Prescription.find({ $or: searchMatch }).sort({ kitNumber: 1, createdAt: 1 }).lean()
      : [savedPrescription.toObject()];

    res.json({
      status: 200,
      data: savedPrescription,
      allKits,
      totalKits: allKits.length,
      message: `Kit ${kitNumber} Prescription saved successfully in dedicated database collection`,
    });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

// DELETE /api/prescriptions/:id (Admin only permanent deletion)
router.delete('/:id', auth('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(id);
    const filterConditions = [];
    if (isMongoId) {
      filterConditions.push({ _id: id }, { lead: id }, { appointment: id }, { task: id }, { verification: id }, { readyToShipment: id });
    }
    filterConditions.push({ targetId: String(id) });

    const result = await Prescription.deleteMany({ $or: filterConditions });
    res.json({ status: 200, message: 'Prescription permanently deleted from database', deletedCount: result.deletedCount });
  } catch (e) {
    res.status(500).json({ status: 500, message: e.message });
  }
});

export default router;
