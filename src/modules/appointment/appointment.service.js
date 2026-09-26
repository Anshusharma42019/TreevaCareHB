import Appointment from './appointment.model.js';
import ApiError from '../../utils/ApiError.js';
import httpStatus from 'http-status';

export const getDoctorAvailability = async (date, timeSlot) => {
  const start = new Date(date + 'T00:00:00.000Z');
  const end = new Date(date + 'T23:59:59.999Z');
  const [h, m] = timeSlot.split(':').map(Number);
  const slotMinutes = h * 60 + m;
  const dayAppts = await Appointment.find({
    isDeleted: false,
    appointmentDate: { $gte: start, $lte: end },
    status: { $nin: ['cancelled', 'no_show'] },
  }).select('doctorName timeSlot').lean();
  const booked = dayAppts
    .filter(a => {
      const [ah, am] = a.timeSlot.split(':').map(Number);
      return Math.abs((ah * 60 + am) - slotMinutes) < 10;
    })
    .map(a => a.doctorName);
  return [...new Set(booked)];
};

export const getDoctorBookedSlots = async (date, doctorName) => {
  const start = new Date(date + 'T00:00:00.000Z');
  const end = new Date(date + 'T23:59:59.999Z');
  const appts = await Appointment.find({
    isDeleted: false,
    doctorName,
    appointmentDate: { $gte: start, $lte: end },
    status: { $nin: ['cancelled', 'no_show'] },
  }).select('timeSlot').lean();
  return appts.map(a => a.timeSlot);
};

const sanitizeDept = (dept, problemText = '') => {
  if (!dept || typeof dept !== 'string' || !dept.trim()) {
    return undefined;
  }
  const lower = dept.trim().toLowerCase();
  if (['male', 'ortho', 'skin'].includes(lower)) return lower;
  if (lower.includes('male') || lower.includes('sperm') || lower.includes('erect')) return 'male';
  if (lower.includes('ortho') || lower.includes('joint') || lower.includes('spine') || lower.includes('knee')) return 'ortho';
  if (lower.includes('skin') || lower.includes('acne') || lower.includes('derma')) return 'skin';
  return undefined;
};

export const createAppointment = async (body, userId) => {
  const payload = { ...body, createdBy: userId };
  payload.department = sanitizeDept(payload.department, payload.problem);
  if (!payload.department) delete payload.department;
  return Appointment.create(payload);
};

export const getAppointments = async (query) => {
  const { page = 1, limit = 20, search, dateFrom, dateTo, status, excludeStatus, doctorName, department, userDepartments } = query;
  const filter = { isDeleted: false };

  if (status) filter.status = status;
  if (excludeStatus) {
    const excluded = excludeStatus.split(',').map(s => s.trim());
    filter.status = { $nin: excluded };
  }
  if (doctorName) filter.doctorName = new RegExp(doctorName, 'i');
  
  if (userDepartments && userDepartments.length > 0) {
    filter.department = { $in: [...userDepartments, null] }; // include null for old records without department
  }
  
  if (department) filter.department = department;

  if (dateFrom || dateTo) {
    filter.appointmentDate = {};
    if (dateFrom) filter.appointmentDate.$gte = new Date(dateFrom + 'T00:00:00.000Z');
    if (dateTo) filter.appointmentDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }
  if (search) {
    const q = new RegExp(search, 'i');
    filter.$or = [{ patientName: q }, { phone: q }, { doctorName: q }];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [appointments, total] = await Promise.all([
    Appointment.find(filter)
      .sort({ appointmentDate: 1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('createdBy', 'name')
      .populate('lead', 'name phone status gender occupation maritalStatus age weight problemDuration prescribedMedicines')
      .lean(),
    Appointment.countDocuments(filter),
  ]);

  return { appointments, total, totalPages: Math.ceil(total / Number(limit)) };
};

export const getAppointmentById = async (id) => {
  const appt = await Appointment.findOne({ _id: id, isDeleted: false })
    .populate('createdBy', 'name')
    .populate('lead', 'name phone status gender occupation maritalStatus age weight problemDuration prescribedMedicines')
    .lean();
  if (!appt) throw new ApiError(httpStatus.NOT_FOUND, 'Appointment not found');
  return appt;
};

export const updateAppointment = async (id, body) => {
  const payload = { ...body };
  if (payload.department !== undefined) {
    const cleanDept = sanitizeDept(payload.department, payload.problem);
    if (cleanDept) {
      payload.department = cleanDept;
    } else {
      payload.$unset = { ...(payload.$unset || {}), department: 1 };
      delete payload.department;
    }
  }
  const appt = await Appointment.findOneAndUpdate(
    { _id: id, isDeleted: false },
    payload,
    { returnDocument: 'after', runValidators: true }
  ).lean();
  if (!appt) throw new ApiError(httpStatus.NOT_FOUND, 'Appointment not found');
  return appt;
};

export const deleteAppointment = async (id) => {
  const appt = await Appointment.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { isDeleted: true },
    { returnDocument: 'after' }
  );
  if (!appt) throw new ApiError(httpStatus.NOT_FOUND, 'Appointment not found');
};

export const addFieldNote = async (id, text, addedBy) => {
  const appt = await Appointment.findOneAndUpdate(
    { _id: id, isDeleted: false },
    { $push: { fieldNotes: { text, addedBy, addedAt: new Date() } } },
    { returnDocument: 'after', runValidators: false }
  ).lean();
  if (!appt) throw new ApiError(httpStatus.NOT_FOUND, 'Appointment not found');
  return appt;
};
