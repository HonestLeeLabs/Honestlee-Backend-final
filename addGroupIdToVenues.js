const mongoose = require('mongoose');
require('dotenv').config();

// Get MongoDB connection string from environment or use default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/honestlee';

console.log('Connecting to:', MONGODB_URI);

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const venueSchema = new mongoose.Schema({}, { strict: false, collection: 'venuesDubai' });
const VenueDubai = mongoose.model('VenueDubai', venueSchema);

async function addGroupIds() {
  try {
    console.log('🔄 Starting migration to add groupid fields...\n');

    // Mapping of venue_category to group_id
    const categoryToGroupMapping = {
      // Accommodation & Travel
      'vc_hotel': { groupid: 'gc_accommodation_travel', groupiddisplayname: 'Accommodation Travel' },
      
      // Food & Drink
      'vc_cafe': { groupid: 'gc_food_drink', groupiddisplayname: 'Food Drink' },
      'vc_restaurant': { groupid: 'gc_food_drink', groupiddisplayname: 'Food Drink' },
      'vc_bar': { groupid: 'gc_food_drink', groupiddisplayname: 'Food Drink' },
      'vc_fast_food': { groupid: 'gc_food_drink', groupiddisplayname: 'Food Drink' },
      'vc_food_court': { groupid: 'gc_food_drink', groupiddisplayname: 'Food Drink' },
      'vc_street_vendor': { groupid: 'gc_food_drink', groupiddisplayname: 'Food Drink' },
      
      // Fitness & Wellness
      'vc_gym': { groupid: 'gc_fitness_wellness', groupiddisplayname: 'Fitness Wellness' },
      'vc_salon': { groupid: 'gc_fitness_wellness', groupiddisplayname: 'Fitness Wellness' },
      'vc_spa': { groupid: 'gc_fitness_wellness', groupiddisplayname: 'Fitness Wellness' },
      'vc_sports_complex': { groupid: 'gc_fitness_wellness', groupiddisplayname: 'Fitness Wellness' },
      'vc_yoga_studio': { groupid: 'gc_fitness_wellness', groupiddisplayname: 'Fitness Wellness' },
      
      // Nightlife & Entertainment
      'vc_beach_club': { groupid: 'gc_nightlife_entertainment', groupiddisplayname: 'Nightlife Entertainment' },
      'vc_nightclub': { groupid: 'gc_nightlife_entertainment', groupiddisplayname: 'Nightlife Entertainment' },
      
      // Outdoor Recreation
      'vc_outdoor_place': { groupid: 'gc_outdoor_recreation', groupiddisplayname: 'Outdoor Recreation' },
      
      // Medical Care
      'vc_clinic': { groupid: 'gc_medical_care', groupiddisplayname: 'Medical Care' },
      'vc_pharmacy': { groupid: 'gc_medical_care', groupiddisplayname: 'Medical Care' },
      
      // Grocery & Retail
      'vc_fresh_food_specialist': { groupid: 'gc_grocery_retail', groupiddisplayname: 'Grocery Retail' },
      'vc_retail_shop': { groupid: 'gc_grocery_retail', groupiddisplayname: 'Grocery Retail' },
      'vc_supermarket': { groupid: 'gc_grocery_retail', groupiddisplayname: 'Grocery Retail' },
      
      // Services
      'vc_daily_services': { groupid: 'gc_services', groupiddisplayname: 'Services' },
      
      // Transport & Mobility
      'vc_transport': { groupid: 'gc_transport_mobility', groupiddisplayname: 'Transport Mobility' },
      
      // Work & Learning
      'vc_cowork': { groupid: 'gc_work_learning', groupiddisplayname: 'Work Learning' },
      'vc_library': { groupid: 'gc_work_learning', groupiddisplayname: 'Work Learning' },
      
      // Religion & Spiritual
      'vc_religion_spiritual': { groupid: 'gc_religion_spiritual', groupiddisplayname: 'Religion Spiritual' },
      
      // Government & Utilities
      'vc_govt_utilities': { groupid: 'gc_govt_utilities', groupiddisplayname: 'Govt Utilities' },
    };

    // Find all venues without groupid
    const venuesWithoutGroupId = await VenueDubai.find({ 
      $or: [
        { groupid: { $exists: false } },
        { groupid: null },
        { groupid: '' }
      ]
    });

    console.log(`📊 Found ${venuesWithoutGroupId.length} venues without groupid\n`);

    // Group by category to show summary
    const categoryCount = {};
    venuesWithoutGroupId.forEach(venue => {
      const cat = venue.venue_category || venue.venuecategory;
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });

    console.log('Categories found:');
    Object.entries(categoryCount).forEach(([cat, count]) => {
      const mapped = categoryToGroupMapping[cat] ? '✅ Mapped' : '⚠️  Not mapped';
      console.log(`  ${cat}: ${count} venues ${mapped}`);
    });
    console.log('');

    let updated = 0;
    let skipped = 0;

    for (const venue of venuesWithoutGroupId) {
      const venueCategory = venue.venue_category || venue.venuecategory;
      
      if (venueCategory && categoryToGroupMapping[venueCategory]) {
        const groupInfo = categoryToGroupMapping[venueCategory];
        
        await VenueDubai.updateOne(
          { _id: venue._id },
          { 
            $set: { 
              groupid: groupInfo.groupid,
              groupiddisplayname: groupInfo.groupiddisplayname
            }
          }
        );
        
        updated++;
        if (updated <= 5) { // Only show first 5 to avoid spam
          console.log(`✅ Updated: ${venue.Account_Name || venue.AccountName} -> ${groupInfo.groupiddisplayname}`);
        }
      } else {
        skipped++;
        if (skipped <= 5) {
          console.log(`⚠️  Skipped: ${venue.Account_Name || venue.AccountName} (category: ${venueCategory || 'NONE'})`);
        }
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration completed!');
    console.log(`   ✅ Updated: ${updated} venues`);
    console.log(`   ⚠️  Skipped: ${skipped} venues`);
    console.log('='.repeat(60) + '\n');
    
    mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Wait for connection before running
mongoose.connection.once('open', () => {
  console.log('✅ Connected to MongoDB\n');
  addGroupIds();
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});
