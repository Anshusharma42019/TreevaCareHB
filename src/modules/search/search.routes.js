import express from 'express';
import mongoose from 'mongoose';
import auth from '../../middleware/auth.js';
import catchAsync from '../../utils/catchAsync.js';
import ApiResponse from '../../utils/ApiResponse.js';
import httpStatus from 'http-status';

import User from '../user/user.model.js';
import Lead from '../lead/lead.model.js';
import { Task } from '../task/task.model.js';
import Verification from '../verification/verification.model.js';
import ReadyToShipment from '../readytoshipment/readytoshipment.model.js';
import CallAgain from '../callagain/callagain.model.js';
import Cnp from '../cnp/cnp.model.js';
import Appointment from '../appointment/appointment.model.js';
import { Order as ShiprocketOrder } from '../shiprocket/models/order.model.js';
import { ShipmaxxOrder } from '../shipmaxx/models/shipmaxxOrder.model.js';
import {
  InterestedLead,
  NotInterestedLead,
  PendingOrder,
  OnHoldOrder,
  VerifiedOrder,
} from '../transition/statusModels.js';
// ── Commission chain ── imported lazily below to avoid circular dep issues

const getModel = (name) => {
  try { return mongoose.model(name); } catch(e) { return null; }
};

const router = express.Router();
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/', auth('admin', 'manager', 'sales', 'support', 'logistics', 'doctor', 'staff'), catchAsync(async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.json(new ApiResponse(httpStatus.OK, [], 'Search results'));
  }

  const queryStr = q.trim();
  const safeRegex = new RegExp(escapeRegex(queryStr), 'i');
  
  // Clean phone digits for phone search (e.g. "+91 89995 37057" -> "8999537057")
  const digitsOnly = queryStr.replace(/\D/g, '');
  const cleanPhone = digitsOnly.length >= 7 ? digitsOnly.slice(-10) : (digitsOnly.length >= 4 ? digitsOnly : null);

  let isValidObjectId = false;
  try {
    isValidObjectId = mongoose.Types.ObjectId.isValid(queryStr) && (String(new mongoose.Types.ObjectId(queryStr)) === queryStr);
  } catch (e) {}

  const limit = 25; 

  const baseMatch = { $or: [{ name: safeRegex }, { phone: safeRegex }, { email: safeRegex }, { problem: safeRegex }] };
  if (cleanPhone) {
    baseMatch.$or.push({ phone: new RegExp(cleanPhone, 'i') });
  }
  if (isValidObjectId) baseMatch.$or.push({ _id: queryStr });

  const leadMatch = { isDeleted: false, ...baseMatch };
  
  const orderMatch = { $or: [{ billing_customer_name: safeRegex }, { billing_phone: safeRegex }, { order_id: safeRegex }, { awb_code: safeRegex }] };
  if (cleanPhone) {
    orderMatch.$or.push({ billing_phone: new RegExp(cleanPhone, 'i') });
  }

  // Safe query executor helper to prevent single collection errors from breaking entire search
  const safeQuery = async (promise, fallback = []) => {
    try {
      return await promise;
    } catch (err) {
      console.error('[Search Query Warning]:', err.message);
      return fallback;
    }
  };

  try {
    const [leadPhones, orderPhones, maxxPhones, srDelivered, smDelivered, interested, notInterested, callAgainPhones, cnpPhones] = await Promise.all([
      safeQuery(Lead.find(baseMatch).select('phone').limit(30).lean()),
      safeQuery(ShiprocketOrder.find(orderMatch).select('billing_phone').limit(30).lean()),
      safeQuery(ShipmaxxOrder.find(orderMatch).select('billing_phone').limit(30).lean()),
      safeQuery((getModel('ShiprocketDeliveredOrder') || ShiprocketOrder).find(orderMatch).select('billing_phone').limit(30).lean()),
      safeQuery((getModel('ShipmaxxDeliveredOrder') || ShipmaxxOrder).find(orderMatch).select('billing_phone').limit(30).lean()),
      safeQuery(InterestedLead.find(baseMatch).select('phone').limit(30).lean()),
      safeQuery(NotInterestedLead.find(baseMatch).select('phone').limit(30).lean()),
      safeQuery(CallAgain.find({ isDeleted: false, ...baseMatch }).select('phone').limit(30).lean()),
      safeQuery(Cnp.find({ isDeleted: false, ...baseMatch }).select('phone').limit(30).lean()),
    ]);
    const phoneSet = new Set();
    const addPhone = (p) => { 
      if (p) {
        const d = p.replace(/\D/g, '');
        if (d) phoneSet.add(d.length >= 10 ? d.slice(-10) : d);
      }
    };
    leadPhones.forEach(l => addPhone(l.phone));
    orderPhones.forEach(o => addPhone(o.billing_phone));
    maxxPhones.forEach(o => addPhone(o.billing_phone));
    srDelivered.forEach(o => addPhone(o.billing_phone));
    smDelivered.forEach(o => addPhone(o.billing_phone));
    interested.forEach(l => addPhone(l.phone));
    notInterested.forEach(l => addPhone(l.phone));
    callAgainPhones.forEach(c => addPhone(c.phone));
    cnpPhones.forEach(c => addPhone(c.phone));
    
    const expandedPhones = Array.from(phoneSet).filter(Boolean);
    if (expandedPhones.length > 0 && expandedPhones.length <= 20) {
      expandedPhones.forEach(p => {
        const reg = new RegExp(p, 'i');
        leadMatch.$or.push({ phone: reg });
        orderMatch.$or.push({ billing_phone: reg });
      });
    }
  } catch (err) {}

  // Get matching lead IDs (including transitioned/archived leads) using baseMatch for linked collection lookups
  const matchedLeadsForSubqueries = await safeQuery(Lead.find(baseMatch).select('_id').limit(50).lean());
  const matchedLeadIds = matchedLeadsForSubqueries.map(l => l._id);
  
  const [
    leads, 
    tasks, 
    verifications, 
    rtsRecords, 
    callAgains, 
    cnps,
    appointments,
    shiprocketOrders,
    shiprocketDelivered,
    shiprocketInTransit,
    shiprocketRto,
    shipmaxxOrders,
    shipmaxxDelivered,
    shipmaxxInTransit,
    shipmaxxRto,
    interestedLeads,
    notInterestedLeads,
    pendingOrders,
    onHoldOrders,
    verifiedOrders
  ] = await Promise.all([
    safeQuery(Lead.find(leadMatch).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(Task.find({ isDeleted: false, $or: [{ title: safeRegex }, { phone: safeRegex }, { lead: { $in: matchedLeadIds } }, ...(cleanPhone ? [{ phone: new RegExp(cleanPhone, 'i') }] : [])] }).populate('assignedTo', 'name').populate({ path: 'lead', select: 'name phone problem department address cityVillage state pincode', strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(Verification.find({ isDeleted: false, $or: [{ title: safeRegex }, { phone: safeRegex }, { lead: { $in: matchedLeadIds } }, ...(cleanPhone ? [{ phone: new RegExp(cleanPhone, 'i') }] : [])] }).populate('assignedTo', 'name').populate({ path: 'lead', select: 'name phone problem department address cityVillage state pincode', strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(ReadyToShipment.find({ isDeleted: false, $or: [{ title: safeRegex }, { phone: safeRegex }, { lead: { $in: matchedLeadIds } }, ...(cleanPhone ? [{ phone: new RegExp(cleanPhone, 'i') }] : [])] }).populate({ path: 'lead', select: 'name phone problem department address cityVillage state pincode', strictPopulate: false }).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(CallAgain.find({ isDeleted: false, $or: [{ lead: { $in: matchedLeadIds } }, { phone: safeRegex }, ...(cleanPhone ? [{ phone: new RegExp(cleanPhone, 'i') }] : [])] }).populate({ path: 'lead', select: 'name phone problem department address cityVillage state pincode', strictPopulate: false }).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(Cnp.find({ isDeleted: false, $or: [{ lead: { $in: matchedLeadIds } }, { phone: safeRegex }, ...(cleanPhone ? [{ phone: new RegExp(cleanPhone, 'i') }] : [])] }).populate({ path: 'lead', select: 'name phone problem department address cityVillage state pincode', strictPopulate: false }).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(Appointment.find({ isDeleted: false, $or: [{ patientName: safeRegex }, { phone: safeRegex }, ...(cleanPhone ? [{ phone: new RegExp(cleanPhone, 'i') }] : [])] }).populate('createdBy', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    
    safeQuery(ShiprocketOrder.find(orderMatch).populate({ path: 'lead_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).populate({ path: 'verification_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery((getModel('ShiprocketDeliveredOrder') || ShiprocketOrder).find(orderMatch).populate({ path: 'lead_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).populate({ path: 'verification_staff_id', select: 'name', strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery((getModel('ShiprocketInTransitOrder') || ShiprocketOrder).find(orderMatch).populate({ path: 'lead_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery((getModel('ShiprocketRtoOrder') || ShiprocketOrder).find(orderMatch).populate({ path: 'lead_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    
    safeQuery(ShipmaxxOrder.find(orderMatch).populate({ path: 'lead_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).populate({ path: 'verified_by', select: 'name', strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery((getModel('ShipmaxxDeliveredOrder') || ShipmaxxOrder).find(orderMatch).populate({ path: 'lead_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).populate({ path: 'verification_staff_id', select: 'name', strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery((getModel('ShipmaxxInTransitOrder') || ShipmaxxOrder).find(orderMatch).populate({ path: 'lead_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery((getModel('ShipmaxxRtoOrder') || ShipmaxxOrder).find(orderMatch).populate({ path: 'lead_id', populate: { path: 'assignedTo', select: 'name' }, strictPopulate: false }).sort({ updatedAt: -1 }).limit(limit).lean()),
    
    safeQuery(InterestedLead.find(leadMatch).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(NotInterestedLead.find(leadMatch).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(PendingOrder.find(leadMatch).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(OnHoldOrder.find(leadMatch).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
    safeQuery(VerifiedOrder.find(leadMatch).populate('assignedTo', 'name').sort({ updatedAt: -1 }).limit(limit).lean()),
  ]);

  const allResults = [];
  
  const addResult = (record, type, module, phone, customerName, status, linkTemplate, assignedTo, note, leadIdVal) => {
    if (!record || !record._id) return;
    
    const finalPhone = phone || (record.lead ? record.lead.phone : '') || record.billing_phone || '';
    const finalName = customerName || (record.lead ? record.lead.name : '') || record.billing_customer_name || 'Unknown';
    
    let problem = record.problem || (record.lead && record.lead.problem) || '';
    let department = record.department || (record.lead && record.lead.department) || '';
    
    let address = record.address || (record.lead && record.lead.address) || record.billing_address || '';
    let city = record.cityVillage || (record.lead && record.lead.cityVillage) || record.billing_city || '';
    let state = record.state || (record.lead && record.lead.state) || record.billing_state || '';
    let pincode = record.pincode || (record.lead && record.lead.pincode) || record.billing_pincode || '';
    
    let awb_code = record.awb_code || '';
    let courier_name = record.courier_name || '';
    let payment_method = record.payment_method || '';
    let sub_total = record.sub_total || '';

    // Determine lead_id explicitly for chain & integrity verification
    const leadId = leadIdVal || record.lead_id?._id?.toString() || record.lead_id?.toString() || (record.lead ? (record.lead._id?.toString() || record.lead.toString()) : (type === 'lead' ? record._id.toString() : null));
    
    allResults.push({
      _id: record._id.toString(),
      lead_id: leadId,
      type,
      module,
      phone: finalPhone,
      customerName: finalName,
      status: status || 'Unknown',
      createdAt: record.createdAt || new Date(),
      updatedAt: record.updatedAt || record.createdAt || new Date(),
      assignedTo: assignedTo || null,
      note: note || '',
      link: linkTemplate.replace(':id', record._id.toString()),
      problem,
      department,
      address,
      city,
      state,
      pincode,
      awb_code,
      courier_name,
      payment_method,
      sub_total,
      kit_number: record.kit_number || 1
    });
  };

  leads.forEach(l => {
    let module = 'Leads';
    let link = `/leads?openId=${l._id}`;
    if (['interested', 'closed_lost', 'on_hold'].includes(l.status)) {
      module = 'Action Required';
      link = `/pipeline?openId=${l._id}`;
    }
    const latestNote = l.notes && l.notes.length > 0 ? l.notes[l.notes.length - 1].text : (l.note || '');
    addResult(l, 'lead', module, l.phone, l.name, l.status, link, l.assignedTo?.name, latestNote, l._id.toString());
  });

  tasks.forEach(t => {
    const latestNote = t.notes && t.notes.length > 0 ? t.notes[t.notes.length - 1].text : (t.description || '');
    let moduleName = 'Tasks';
    let link = `/tasks?openId=${t._id}`;
    
    if (['ready_to_shipment', 'dispatch', 'dispatched'].includes(t.status)) {
      moduleName = 'Ready To Shipment';
      link = `/ready-to-shipment?openId=${t._id}`;
    } else if (t.status === 'verification') {
      moduleName = 'Verification';
      link = `/verification?openId=${t._id}`;
    } else if (['cancelled', 'cancel_call', 'cnp', 'on_hold', 'closed_lost', 'interested'].includes(t.status)) {
      moduleName = 'Action Required';
      link = `/pipeline?openId=${t.lead?._id || t._id}`;
    }

    addResult(t, 'task', moduleName, t.phone, t.lead?.name || t.title, t.status, link, t.assignedTo?.name, latestNote, t.lead?._id?.toString() || t.lead?.toString());
  });

  verifications.forEach(v => {
    const latestNote = v.notes && v.notes.length > 0 ? v.notes[v.notes.length - 1].text : (v.description || '');
    addResult(v, 'verification', 'Verification', v.lead?.phone, v.lead?.name || v.title, v.status, `/verification?openId=${v._id}`, v.assignedTo?.name, latestNote, v.lead?._id?.toString() || v.lead?.toString());
  });

  rtsRecords.forEach(r => {
    const latestNote = r.notes && r.notes.length > 0 ? r.notes[r.notes.length - 1].text : (r.description || '');
    addResult(r, 'rts', 'Ready to Shipment', r.lead?.phone, r.lead?.name || r.title, r.sentToShiprocket ? 'Sent to Shiprocket' : 'Pending', `/ready-to-shipment?openId=${r._id}`, r.assignedTo?.name, latestNote, r.lead?._id?.toString() || r.lead?.toString());
  });

  callAgains.forEach(c => {
    const latestNote = c.notes && c.notes.length > 0 ? c.notes[c.notes.length - 1].text : '';
    addResult(c, 'callagain', 'Call Again', c.lead?.phone, c.lead?.name, 'CALL AGAIN', `/pipeline?openId=${c.lead?._id}&filter=call_again`, c.assignedTo?.name, latestNote, c.lead?._id?.toString() || c.lead?.toString());
  });

  cnps.forEach(c => {
    const latestNote = c.notes && c.notes.length > 0 ? c.notes[c.notes.length - 1].text : '';
    addResult(c, 'cnp', 'CNP', c.lead?.phone, c.lead?.name, 'CNP', `/pipeline?openId=${c.lead?._id}&filter=cnp`, c.assignedTo?.name, latestNote, c.lead?._id?.toString() || c.lead?.toString());
  });

  appointments.forEach(a => {
    const latestNote = a.notes || '';
    addResult(a, 'appointment', 'Appointments', a.phone, a.patientName, a.status, `/appointments?openId=${a._id}`, a.createdBy?.name, latestNote);
  });

  interestedLeads.forEach(l => {
    const latestNote = l.notes && l.notes.length > 0 ? l.notes[l.notes.length - 1].text : (l.note || '');
    addResult(l, 'lead', 'Interested Leads', l.phone, l.name, 'Interested', `/pipeline?openId=${l._id}`, l.assignedTo?.name, latestNote, l._id.toString());
  });

  notInterestedLeads.forEach(l => {
    const latestNote = l.notes && l.notes.length > 0 ? l.notes[l.notes.length - 1].text : (l.rejectionReason || '');
    addResult(l, 'lead', 'Not Interested', l.phone, l.name, 'Not Interested', `/pipeline?openId=${l._id}`, l.assignedTo?.name, latestNote, l._id.toString());
  });

  pendingOrders.forEach(o => {
    const latestNote = o.notes && o.notes.length > 0 ? o.notes[o.notes.length - 1].text : (o.pendingReason || '');
    addResult(o, 'order', 'Pending Orders', o.phone, o.name, 'Pending', `/verification?openId=${o._id}`, o.assignedTo?.name, latestNote, o._id.toString());
  });

  onHoldOrders.forEach(o => {
    const latestNote = o.notes && o.notes.length > 0 ? o.notes[o.notes.length - 1].text : (o.onHoldReason || '');
    addResult(o, 'order', 'On Hold', o.phone, o.name, 'On Hold', `/pipeline?openId=${o._id}&filter=on_hold`, o.assignedTo?.name, latestNote, o._id.toString());
  });

  verifiedOrders.forEach(o => {
    const latestNote = o.notes && o.notes.length > 0 ? o.notes[o.notes.length - 1].text : (o.note || '');
    addResult(o, 'order', 'Verified Orders', o.phone, o.name, 'Verified', `/ready-to-shipment?openId=${o._id}`, o.assignedTo?.name, latestNote, o._id.toString());
  });

  const processedOrders = new Set();
  const processShiprocket = (ordersArr) => {
    ordersArr.forEach(o => {
      const uniqueKey = o.order_id || o.awb_code || o._id.toString();
      if (processedOrders.has(uniqueKey)) return;
      processedOrders.add(uniqueKey);
      const latestNote = o.notes || '';
      
      let moduleName = 'Shiprocket';
      let link = `/shiprocket/orders?openId=${o._id}`;
      
      if (o.status === 'DELIVERED') {
         moduleName = 'Follow Up';
         link = `/follow-up?openId=${o._id}`;
      }
      
      addResult(o, 'order', moduleName, o.billing_phone, o.billing_customer_name, o.status, link, o.verification_id?.assignedTo?.name || o.verification_staff_id?.name || o.lead_id?.assignedTo?.name, latestNote, o.lead_id?._id?.toString() || o.lead_id?.toString());
    });
  };
  processShiprocket(shiprocketOrders);
  processShiprocket(shiprocketDelivered);
  processShiprocket(shiprocketInTransit);
  processShiprocket(shiprocketRto);

  const processedMaxxOrders = new Set();
  const processShipmaxx = (ordersArr) => {
    ordersArr.forEach(o => {
      const uniqueKey = o.order_id || o.awb_code || o._id.toString();
      if (processedMaxxOrders.has(uniqueKey)) return;
      processedMaxxOrders.add(uniqueKey);
      const latestNote = o.notes || '';
      
      let moduleName = 'ShipMaxx';
      let link = `/shipmaxx?openId=${o._id}`;
      
      if (o.status === 'DELIVERED') {
         moduleName = 'ShipMaxx Follow Up';
         link = `/shipmaxx/followup?openId=${o._id}`;
      }
      
      addResult(o, 'shipmaxx', moduleName, o.billing_phone, o.billing_customer_name, o.status, link, o.verification_staff_id?.name || o.verified_by?.name || o.lead_id?.assignedTo?.name, latestNote, o.lead_id?._id?.toString() || o.lead_id?.toString());
    });
  };
  processShipmaxx(shipmaxxOrders);
  processShipmaxx(shipmaxxDelivered);
  processShipmaxx(shipmaxxInTransit);
  processShipmaxx(shipmaxxRto);

  const grouped = {};
  allResults.forEach(r => {
    const key = r.phone ? r.phone.replace(/\D/g, '') : r._id;
    if (!key) return;
    if (!grouped[key]) {
      grouped[key] = { 
        phone: r.phone, 
        customerName: r.customerName,
        problem: '',
        department: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        records: [] 
      };
    }
    
    if (r.problem && !grouped[key].problem) grouped[key].problem = r.problem;
    if (r.department && !grouped[key].department) grouped[key].department = r.department;
    if (r.address && !grouped[key].address) grouped[key].address = r.address;
    if (r.city && !grouped[key].city) grouped[key].city = r.city;
    if (r.state && !grouped[key].state) grouped[key].state = r.state;
    if (r.pincode && !grouped[key].pincode) grouped[key].pincode = r.pincode;

    if (!grouped[key].records.find(rec => rec._id === r._id && rec.module === r.module)) {
       grouped[key].records.push(r);
    }
    if (r.customerName && r.customerName !== 'Unknown' && grouped[key].customerName === 'Unknown') {
      grouped[key].customerName = r.customerName;
    }
  });
  Object.values(grouped).forEach(group => {
    const orderRecords = group.records.filter(r => ['order', 'shipmaxx'].includes(r.type));
    orderRecords.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    orderRecords.forEach((order, index) => {
      order.kit_number = index + 1;
    });
  });

  const finalResults = Object.values(grouped).map(group => {
    group.records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const latestStatus = group.records[0];
    const history = group.records;

    const validProblems = history.filter(r => r.problem && r.problem.trim().length > 0);
    let bestProblem = '';
    const nonInterakt = validProblems.find(r => !r.problem.includes('[Interakt Message]') && !r.problem.includes('Clicked Ad:'));
    if (nonInterakt) {
        bestProblem = nonInterakt.problem;
    } else if (validProblems.length > 0) {
        bestProblem = validProblems[0].problem;
    }

    const recentDept = history.find(r => r.department);
    const recentLocation = history.find(r => r.address || r.city || r.state || r.pincode);

    latestStatus.problem = latestStatus.problem || bestProblem || group.problem;
    latestStatus.department = latestStatus.department || (recentDept ? recentDept.department : group.department);
    
    if (!latestStatus.address && !latestStatus.city) {
      if (recentLocation) {
        latestStatus.address = recentLocation.address || '';
        latestStatus.city = recentLocation.city || '';
        latestStatus.state = recentLocation.state || '';
        latestStatus.pincode = recentLocation.pincode || '';
      } else {
        latestStatus.address = group.address;
        latestStatus.city = group.city;
        latestStatus.state = group.state;
        latestStatus.pincode = group.pincode;
      }
    }

    const recentAssigned = history.find(r => r.assignedTo);
    latestStatus.assignedTo = latestStatus.assignedTo || (recentAssigned ? recentAssigned.assignedTo : null);

    return {
      customerName: group.customerName,
      phone: group.phone,
      latestStatus,
      history,
    };
  });

  const cleanQ = queryStr.replace(/\D/g, '');
  finalResults.sort((a, b) => {
    const aExactPhone = a.phone && cleanQ && a.phone.includes(cleanQ) ? 1 : 0;
    const bExactPhone = b.phone && cleanQ && b.phone.includes(cleanQ) ? 1 : 0;
    if (aExactPhone !== bExactPhone) return bExactPhone - aExactPhone;
    
    return new Date(b.latestStatus.updatedAt) - new Date(a.latestStatus.updatedAt);
  });

  // ── Commission chain: attach full order chain + submitter details to each result group ──
  try {
    const OrderChainModule = await import('../commission/orderChain.model.js');
    const OrderChain = OrderChainModule.default;
    const CommissionRecordModule = await import('../commission/commissionRecord.model.js');
    const CommissionRecord = CommissionRecordModule.default;

    // Collect all lead IDs from the search result set
    const leadIdSet = new Set();
    for (const group of finalResults) {
      for (const rec of group.history || []) {
        if (rec.lead_id) leadIdSet.add(String(rec.lead_id));
      }
    }

    // Also search leads directly by phone to catch all linked leads
    const matchingLeadsByPhone = await safeQuery(Lead.find(baseMatch).select('_id phone').lean());
    for (const l of matchingLeadsByPhone) leadIdSet.add(String(l._id));

    // Also search chains by submitter name (salesperson search)
    try {
      const UserModule = await import('../user/user.model.js');
      const User = UserModule.default;
      const matchingUsers = await User.find({ name: safeRegex }).select('_id').lean();
      const matchingUserIds = matchingUsers.map(u => u._id);
      if (matchingUserIds.length > 0) {
        const chainsByUser = await OrderChain.find({ submitter_id: { $in: matchingUserIds } }).select('lead_id').lean();
        for (const c of chainsByUser) leadIdSet.add(String(c.lead_id));
      }
    } catch (uErr) {}

    const allLeadIds = Array.from(leadIdSet).filter(Boolean);

    if (allLeadIds.length > 0) {
      const validObjectIds = allLeadIds.map(id => { 
        try { return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null; } catch { return null; } 
      }).filter(Boolean);

      if (validObjectIds.length > 0) {
        const chainEntries = await safeQuery(
          OrderChain.find({ lead_id: { $in: validObjectIds } })
            .populate('submitter_id', 'name role')
            .populate({ path: 'order_id', select: 'order_id billing_customer_name sub_total status delivered_at awb_code', strictPopulate: false })
            .sort({ chain_seq: 1 })
            .lean()
        );

        const chainIds = chainEntries.map(e => e._id);
        const commRecords = chainIds.length > 0 ? await safeQuery(
          CommissionRecord.find({ chain_entry_id: { $in: chainIds } })
            .populate('staff_id', 'name role')
            .lean()
        ) : [];

        const chainMap = {};
        const commMap = {};
        for (const e of chainEntries) {
          const key = String(e.lead_id);
          if (!chainMap[key]) chainMap[key] = [];
          chainMap[key].push(e);
        }
        for (const c of commRecords) {
          const key = String(c.chain_entry_id);
          if (!commMap[key]) commMap[key] = [];
          commMap[key].push(c);
        }
        for (const entries of Object.values(chainMap)) {
          for (const entry of entries) {
            entry.commissions = commMap[String(entry._id)] || [];
          }
        }

        for (const group of finalResults) {
          const groupPhone = (group.phone || '').replace(/\D/g, '');
          const groupLeadIds = matchingLeadsByPhone
            .filter(l => (l.phone || '').replace(/\D/g, '').includes(groupPhone) || (groupPhone && groupPhone.includes((l.phone || '').replace(/\D/g, ''))))
            .map(l => String(l._id));

          // Include lead_ids found in group history
          (group.history || []).forEach(r => {
            if (r.lead_id && !groupLeadIds.includes(String(r.lead_id))) {
              groupLeadIds.push(String(r.lead_id));
            }
          });

          const groupChain = [];
          for (const lId of groupLeadIds) {
            if (chainMap[lId]) groupChain.push(...chainMap[lId]);
          }
          groupChain.sort((a, b) => a.chain_seq - b.chain_seq);
          group.order_chain = groupChain;
        }
      }
    }
  } catch (chainErr) {
    console.error('[Search] Commission chain enrichment failed:', chainErr.message);
  }

  res.json(new ApiResponse(httpStatus.OK, finalResults.slice(0, 20), 'Search results'));
}));

export default router;
