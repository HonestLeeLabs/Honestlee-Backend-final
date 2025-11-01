// ===== FILE: scripts/cleanupInvalidRosters.js =====
// Run this once to clean up all invalid roster entries
// Usage: node scripts/cleanupInvalidRosters.js

require('dotenv').config();
const mongoose = require('mongoose');

// Simple schema definition
const VenueRosterSchema = new mongoose.Schema({
  staffUserId: mongoose.Schema.Types.ObjectId,
  venueId: mongoose.Schema.Types.ObjectId,
  role: String,
  status: String
}, { timestamps: true });

const VenueRoster = mongoose.model('VenueRoster', VenueRosterSchema);

async function cleanupInvalidRosters() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ Connected to database');

    // Find all invalid roster entries
    const invalidEntries = await VenueRoster.find({
      $or: [
        { venueId: { $exists: false } },
        { venueId: null },
        { venueId: { $type: 'string' } } // Also clean up any string venueIds
      ]
    });

    console.log(`\n🔍 Found ${invalidEntries.length} invalid roster entries`);

    if (invalidEntries.length === 0) {
      console.log('✅ No cleanup needed!');
      process.exit(0);
    }

    // Group by userId to show who's affected
    const byUser = {};
    invalidEntries.forEach(entry => {
      const userId = entry.staffUserId.toString();
      if (!byUser[userId]) {
        byUser[userId] = [];
      }
      byUser[userId].push(entry);
    });

    console.log('\n📊 Breakdown by user:');
    Object.keys(byUser).forEach(userId => {
      console.log(`   User ${userId}: ${byUser[userId].length} invalid entries`);
    });

    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\n⚠️  Delete all these invalid entries? (yes/no): ', async (answer) => {
      if (answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y') {
        // Delete invalid entries
        const result = await VenueRoster.deleteMany({
          $or: [
            { venueId: { $exists: false } },
            { venueId: null },
            { venueId: { $type: 'string' } }
          ]
        });

        console.log(`\n✅ Deleted ${result.deletedCount} invalid roster entries`);
        
        // Show remaining valid entries
        const remaining = await VenueRoster.countDocuments({
          venueId: { $exists: true, $ne: null, $type: 'objectId' }
        });
        
        console.log(`✅ ${remaining} valid roster entries remain`);
      } else {
        console.log('\n❌ Cleanup cancelled');
      }
      
      readline.close();
      await mongoose.connection.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

cleanupInvalidRosters();