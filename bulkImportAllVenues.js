// bulkImportAllVenues.js - COMPLETE with Services
const fs = require('fs');
const path = require('path');

console.log('🔄 Starting COMPLETE venue import transformation...\n');
console.log('═'.repeat(60));

// Category to Group mapping
const CATEGORY_TO_GROUP = {
  'vc_street_vendor': 'gc_food_drink',
  'vc_restaurant': 'gc_food_drink',
  'vc_cafe': 'gc_food_drink',
  'vc_bar': 'gc_food_drink',
  'vc_coffee_shop': 'gc_food_drink',
  'vc_beach_club': 'gc_nightlife_entertainment',
  'vc_nightclub': 'gc_nightlife_entertainment',
  'vc_hotel': 'gc_accommodation_travel',
  'vc_hostel': 'gc_accommodation_travel',
  'vc_homestay': 'gc_accommodation_travel',
  'vc_gym': 'gc_fitness_wellness',
  'vc_yoga_studio': 'gc_fitness_wellness',
  'vc_daily_services': 'gc_services',
  'vc_mosque': 'gc_religion_spiritual',
  'vc_temple': 'gc_religion_spiritual',
  'vc_church': 'gc_religion_spiritual',
  'vc_place_of_worship': 'gc_religion_spiritual',
  'vc_religion_spiritual': 'gc_religion_spiritual',
};

const GROUP_DISPLAY_NAMES = {
  'gc_food_drink': 'Food Drink',
  'gc_nightlife_entertainment': 'Nightlife Entertainment',
  'gc_accommodation_travel': 'Accommodation Travel',
  'gc_fitness_wellness': 'Fitness Wellness',
  'gc_services': 'Services',
  'gc_religion_spiritual': 'Religion Spiritual',
};

// ⭐ Generate fallback name based on venue type and location
function generateFallbackName(props) {
  const venueType = props.venue_type_display || props.venuetypedisplay || 'Venue';
  const district = props.Billing_District || props.BillingDistrict || props.Billing_City || props.BillingCity || 'Dubai';
  const id = props.Dubai_id || props.dubai_id || props.Dubaiid || '';
  
  // Extract number from ID for uniqueness
  const idNum = id.match(/\d+$/)?.[0] || Math.floor(Math.random() * 1000);
  
  return `${district} ${venueType} #${idNum}`;
}

// Transform GeoJSON feature to venue format
function transformGeoJSONFeature(feature) {
  const props = feature.properties;
  const coords = feature.geometry.coordinates;
  
  // Helper to convert boolean strings
  const toBool = (val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    if (typeof val === 'string') {
      const lower = val.toLowerCase();
      return lower === 'true' || lower === '1' || lower === 'yes';
    }
    return false;
  };
  
  // ⭐ CRITICAL: Generate AccountName with fallback
  const accountName = props.Account_Name || props.account_name || props.AccountName || generateFallbackName(props);
  
  return {
    // IDs
    Dubaiid: props.Dubai_id || props.dubai_id,
    Dubai_id: props.Dubai_id || props.dubai_id,
    AccountName: accountName,
    Account_Name: accountName,
    
    // Categorization
    venuetype: props.venue_type,
    venuetypedisplay: props.venue_type_display,
    venuecategory: props.venue_category,
    venuecategorydisplayname: props.venue_category_display,
    venue_type: props.venue_type,
    venue_type_display: props.venue_type_display,
    venue_category: props.venue_category,
    venue_category_display: props.venue_category_display,
    
    // Geometry
    geometry: {
      type: 'Point',
      coordinates: [parseFloat(coords[0]), parseFloat(coords[1])]
    },
    LatitudeMapslytextsingleLine: parseFloat(coords[1]),
    LongitudeMapslytextsingleLine: parseFloat(coords[0]),
    Latitude_Mapsly_text_singleLine: parseFloat(coords[1]),
    Longitude_Mapsly_text_singleLine: parseFloat(coords[0]),
    
    // Location
    BillingCity: props.Billing_City || 'Dubai',
    Billing_City: props.Billing_City || 'Dubai',
    BillingDistrict: props.Billing_District,
    Billing_District: props.Billing_District,
    BillingStreet: props.Billing_Street,
    Billing_Street: props.Billing_Street,
    BillingState: props.Billing_State || 'Dubai',
    Billing_State: props.Billing_State || 'Dubai',
    
    // Ratings & Pricing
    Rating: parseFloat(props.Rating) || 0,
    BudgetFriendly: props.Budget_Friendly || '$$',
    Budget_Friendly: props.Budget_Friendly || '$$',
    
    // Spread all other properties
    ...props,
    
    // Convert boolean fields
    Pub_Wifi: toBool(props.Pub_Wifi),
    PubWifi: toBool(props.Pub_Wifi),
    Has_TV_Display: toBool(props.Has_TV_Display),
    Open_Late: toBool(props.Open_Late),
    Alcohol_served: toBool(props.Alcohol_served),
  };
}

// Transform already-formatted import file
function transformImportFile(venues) {
  return venues.map(venue => {
    // ⭐ Generate fallback name if missing
    const accountName = venue.AccountName || venue.Account_Name || generateFallbackName(venue);
    
    return {
      ...venue,
      Dubaiid: venue.Dubaiid || venue.Dubai_id,
      Dubai_id: venue.Dubaiid || venue.Dubai_id,
      AccountName: accountName,
      Account_Name: accountName,
      geometry: venue.geometry || {
        type: 'Point',
        coordinates: [
          parseFloat(venue.Longitude_Mapsly_text_singleLine || venue.LongitudeMapslytextsingleLine),
          parseFloat(venue.Latitude_Mapsly_text_singleLine || venue.LatitudeMapslytextsingleLine)
        ]
      },
      Rating: parseFloat(venue.Rating) || 0,
      BudgetFriendly: venue.BudgetFriendly || venue.Budget_Friendly || '$$',
    };
  });
}

// Add groupid to venues
function addGroupIds(venues) {
  return venues.map(venue => {
    const category = venue.venue_category || venue.venuecategory;
    const groupid = CATEGORY_TO_GROUP[category] || 'gc_food_drink';
    
    return {
      ...venue,
      groupid: groupid,
      groupiddisplayname: GROUP_DISPLAY_NAMES[groupid],
    };
  });
}

// Process a single file
function processFile(filename, type = 'geojson') {
  try {
    if (!fs.existsSync(filename)) {
      console.log(`⚠️  Skipping ${filename} (not found)`);
      return [];
    }
    
    const data = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    
    if (type === 'geojson') {
      if (!data.features) {
        console.log(`⚠️  Invalid GeoJSON: ${filename}`);
        return [];
      }
      return data.features.map(transformGeoJSONFeature);
    } else if (type === 'import') {
      return transformImportFile(data);
    } else if (type === 'array') {
      return transformImportFile(data);
    }
    
    return [];
  } catch (error) {
    console.error(`❌ Error processing ${filename}:`, error.message);
    return [];
  }
}

try {
  let allVenues = [];
  const fileStats = {};
  
  // Define all files to process
  const files = [
    // GeoJSON files
    { name: 'full_dubai_mjbr_cafes.geojson', type: 'geojson', label: 'Dubai Marina Cafes' },
    { name: 'full_dubai_places.geojson', type: 'geojson', label: 'Dubai Places' },
    { name: 'gyms_yoga.geojson', type: 'geojson', label: 'Gyms & Yoga Studios' },
    { name: 'HonestLee-40-bars-pubs-beach-clubs.geojson', type: 'geojson', label: 'Bars, Pubs & Beach Clubs' },
    { name: 'A_Karama_Mobile.geojson', type: 'geojson', label: 'Karama Mobile Vendors' },
    { name: 'dubai_resturants.geo.json', type: 'geojson', label: 'Dubai Restaurants' },
    { name: 'mobile_places_dhera.geojson', type: 'geojson', label: 'Dhera Mobile Places' },
    { name: 'dubai_worship.geojson', type: 'geojson', label: 'Worship Places' },
    
    // JSON import files (already formatted)
    { name: 'venues_cafes_for_import_local.json', type: 'import', label: 'Cafes Import' },
    { name: 'venues_gyms_yoga_for_import_local.json', type: 'import', label: 'Gyms/Yoga Import' },
    { name: 'venues_dubai_places_for_import_local.json', type: 'import', label: 'Dubai Places Import' },
    { name: 'venues_karama_for_import.json', type: 'import', label: 'Karama Import' },
    { name: 'venues_for_import.json', type: 'import', label: 'General Venues Import' },
    { name: 'venues_worship_for_import_local.json', type: 'import', label: 'Worship Import' },
    { name: 'hotels_for_import.json', type: 'array', label: 'Hotels' },
    { name: 'Dubai_Hotels.json', type: 'array', label: 'Hotels (Backup)' },
    { name: 'Dubai_Daily_Services_78.json', type: 'array', label: 'Daily Services (78 venues)' }, // ⭐ NEW
  ];
  
  console.log(`📦 Processing ${files.length} files...\n`);
  
  // Process each file
  files.forEach(file => {
    console.log(`📁 ${file.label}...`);
    const venues = processFile(file.name, file.type);
    if (venues.length > 0) {
      fileStats[file.label] = venues.length;
      allVenues = allVenues.concat(venues);
      console.log(`   ✅ ${venues.length} venues`);
    } else {
      console.log(`   ⚠️  No venues found`);
    }
  });
  
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 Total venues loaded: ${allVenues.length}`);
  
  // Remove duplicates based on Dubaiid
  const uniqueVenues = [];
  const seenIds = new Set();
  
  allVenues.forEach(venue => {
    const id = venue.Dubaiid || venue.Dubai_id;
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      uniqueVenues.push(venue);
    }
  });
  
  console.log(`🔍 After deduplication: ${uniqueVenues.length} unique venues`);
  console.log(`❌ Removed ${allVenues.length - uniqueVenues.length} duplicates`);
  
  // Add groupid to all venues
  console.log('\n🏷️  Adding group categorization...');
  const finalVenues = addGroupIds(uniqueVenues);
  
  // Group count statistics
  const groupStats = {};
  finalVenues.forEach(venue => {
    const group = venue.groupiddisplayname || 'Unknown';
    groupStats[group] = (groupStats[group] || 0) + 1;
  });
  
  console.log('\n📊 Venues by Group:');
  Object.keys(groupStats).sort().forEach(group => {
    console.log(`   ${group}: ${groupStats[group]} venues`);
  });
  
  // Create API import format
  const apiImportData = {
    venues: finalVenues,
    overwrite: false
  };
  
  fs.writeFileSync('./ALL_VENUES_COMPLETE_IMPORT.json', JSON.stringify(apiImportData, null, 2));
  
  console.log('\n' + '═'.repeat(60));
  console.log('✅ SUCCESS! Import file created');
  console.log(`📁 Output: ALL_VENUES_COMPLETE_IMPORT.json`);
  console.log(`📊 Total unique venues: ${finalVenues.length}`);
  console.log('\n🚀 Ready to import via Postman:');
  console.log('   POST http://localhost:4000/api/venues-dubai/bulk-import');
  console.log('   Body: (paste content from ALL_VENUES_COMPLETE_IMPORT.json)');
  console.log('═'.repeat(60));
  
} catch (error) {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
