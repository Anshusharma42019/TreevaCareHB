import mongoose from 'mongoose';
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import connectDB from '../config/database.js';

// Import all schemas and models
import { ShipmaxxOrder } from '../modules/shipmaxx/models/shipmaxxOrder.model.js';
import { ShipmaxxFollowup } from '../modules/shipmaxx/models/shipmaxxFollowup.model.js';
import Lead from '../modules/lead/lead.model.js';
import Verification from '../modules/verification/verification.model.js';
import Task from '../modules/task/task.model.js';
import {
  InterestedLead,
  NotInterestedLead,
  PendingOrder,
  OnHoldOrder,
  VerifiedOrder
} from '../modules/transition/statusModels.js';
import Cnp from '../modules/cnp/cnp.model.js';
import CallAgain from '../modules/callagain/callagain.model.js';
import Prescription from '../modules/prescription/prescription.model.js';
import Attendance from '../modules/attendance/attendance.model.js';
import User from '../modules/user/user.model.js';

const models = [
  { name: 'ShipmaxxOrder', model: ShipmaxxOrder },
  { name: 'ShipmaxxFollowup', model: ShipmaxxFollowup },
  { name: 'Lead', model: Lead },
  { name: 'Verification', model: Verification },
  { name: 'Task', model: Task },
  { name: 'InterestedLead', model: InterestedLead },
  { name: 'NotInterestedLead', model: NotInterestedLead },
  { name: 'PendingOrder', model: PendingOrder },
  { name: 'OnHoldOrder', model: OnHoldOrder },
  { name: 'VerifiedOrder', model: VerifiedOrder },
  { name: 'Cnp', model: Cnp },
  { name: 'CallAgain', model: CallAgain },
  { name: 'Prescription', model: Prescription },
  { name: 'Attendance', model: Attendance },
  { name: 'User', model: User },
];

async function run() {
  console.log('Connecting to MongoDB Atlas...');
  await connectDB();
  console.log('Connected! Building and syncing indexes across all collections...\n');

  for (const { name, model } of models) {
    try {
      console.log(`[${name}] Syncing indexes...`);
      await model.createIndexes();
      const indexes = await model.collection.indexes();
      console.log(`[${name}] ✅ OK (${indexes.length} indexes active):`);
      indexes.forEach(idx => console.log(`   - ${idx.name} (${JSON.stringify(idx.key)})`));
    } catch (err) {
      console.error(`[${name}] ❌ Error:`, err.message);
    }
  }

  console.log('\nAll collection indexes have been built and verified on MongoDB Atlas!');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('Index sync failed:', err);
  process.exit(1);
});
