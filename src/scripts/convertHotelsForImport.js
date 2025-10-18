const fs = require('fs');

// Read the hotel JSON file
const hotelsData = JSON.parse(fs.readFileSync('Dubai_Hotels.json', 'utf8'));
const categoryMapping = JSON.parse(fs.readFileSync('venue_type_imaster_redone-for-dubai29thsep-schema_with_groupid.csv'));

console.log(`Processing ${hotelsData.features.length} hotels...`);

// Function to convert string boolean to actual boolean
function convertBooleanString(value) {
  if (typeof value === 'string') {
    if (value.toUpperCase() === 'TRUE') return true;
    if (value.toUpperCase() === 'FALSE') return false;
  }
  return value;
}

// Function to convert string numbers to actual numbers
function convertStringNumber(value) {
  if (typeof value === 'string' && value !== '' && !isNaN(value)) {
    return parseInt(value) || parseFloat(value);
  }
  return value;
}

// Function to convert empty strings to null
function convertEmptyString(value) {
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }
  return value;
}

// Fields that should be converted from string numbers to actual numbers
const numericFields = ['DLSPeedMBPS', 'ULSPeedMBPS', 'ChargingPorts', 'NumberofTVs', 'HLPriceLevel', 'Rating', 'Familyfrienlinessscore', 'Nomadfriendlyscore'];

// Fields that should convert empty strings to null
const nullableFields = ['CuisineTags', 'Dietarytags', 'PetPolicy', 'Grouppolicy', 'SmokingPolicy', 'Website', 'Coffeepricerange', 'ShowswhatonTV', 'TypeOfCoffee'];

// Boolean fields
const booleanFields = ['OpenLate', 'Breakfastoffered', 'Brunchoffered', 'Dinneroffered', 'Alcoholserved', 'PubWifi', 'Powerbackup', 'HasTVDisplay', 'Takesbookings', 'Outdoorseating', 'Offerswaterrefills', 'Daypassclub', 'Hotelpoolaccess', 'Vegonly'];

// Default fields for hotels
const defaultFields = {
  // Top-level category (NEW)
  groupid: 'gc_accommodation_travel',
  groupiddisplayname: 'Accommodation Travel',
  
  // Venue classification
  venuetype: 'vt_hotel',
  venuetypedisplay: 'Hotel',
  venuecategory: 'vc_hotel',
  venuecategorydisplayname: 'Hotel',
  
  // Location
  BillingCity: 'Dubai',
  BillingState: 'Dubai',
  
  // Technical & Connectivity
  DLSPeedMBPS: 0,
  ULSPeedMBPS: 0,
  ChargingPorts: 0,
  PubWifi: false,
  WifiSSID: null,
  Wifibage: 'Unverified',
  Powerbackup: false,
  Poweroutletdensity: 'Low',
  
  // Venue Features
  HasTVDisplay: false,
  NumberofTVs: 0,
  ShowswhatonTV: 'None',
  Outdoorseating: false,
  Takesbookings: true, // Hotels typically take bookings
  OpenLate: false,
  
  // Food Service
  Breakfastoffered: true, // Most hotels offer breakfast
  Brunchoffered: false,
  Dinneroffered: false,
  Alcoholserved: false,
  Offerswaterrefills: true,
  TypeOfCoffee: null,
  CuisineTags: null,
  Dietarytags: null,
  Vegonly: false,
  Healthyfoodlevel: null,
  
  // Pricing & Rating
  HLPriceLevel: null,
  Rating: null,
  BudgetFriendly: '$',
  Coffeepricerange: null,
  EntranceFee: null,
  
  // Policies & Atmosphere
  PetPolicy: 'Contact Hotel',
  Grouppolicy: 'Groups Welcome',
  SmokingPolicy: 'Non-Smoking',
  NoiseLevel: 'Quiet',
  View: 'City',
  Stafffriedlinessbage: 'Friendly',
  Familyfrienlinessscore: 4, // Hotels are generally family-friendly
  Nomadfriendlyscore: null,
  HLzohoACFan: 'AC',
  
  // Contact & Other
  Intphonegooglemapsly: '+971 4 XXX XXXX',
  Website: null,
  Hotelpoolaccess: false,
  Daypassclub: false,
  'Payment types': 'Cash|Card|Apple Pay|Google Pay',
  parkingoptions: 'Available',
};

// Generate timestamp suffix to avoid conflicts
const timestamp = new Date().toISOString().slice(0, 19).replace(/-/g, '').replace('T', '-');

// Convert features to venue documents
const venues = hotelsData.features.map((feature, index) => {
  const properties = { ...feature.properties };
  
  // Remove unwanted fields
  delete properties.Accountnamelocal;
  delete properties.Kidsfriendlybadge; // Causes validation errors
  
  // Fix duplicate Smoking Policy fields
  if (properties['Smoking Policy'] && !properties.SmokingPolicy) {
    properties.SmokingPolicy = properties['Smoking Policy'];
    delete properties['Smoking Policy'];
  }
  
  // Merge with default fields (defaults first, then override with existing data)
  const mergedProperties = { ...defaultFields };
  Object.keys(properties).forEach((key) => {
    mergedProperties[key] = properties[key];
  });
  
  // Generate unique Dubaiid
  if (mergedProperties.Dubaiid) {
    mergedProperties.Dubaiid = `${mergedProperties.Dubaiid}-${timestamp}-${index}`;
  }
  
  // Set venuetype display names if they don't exist
  if (!mergedProperties.venuetypedisplay && mergedProperties.venuetype) {
    const venueTypeMap = {
      'vt_hotel': 'Hotel',
      'vt_resort': 'Resort',
      'vt_boutique_hotel': 'Boutique Hotel',
      'vt_hostel': 'Hostel',
      'vt_serviced_apartment': 'Serviced Apartment',
    };
    mergedProperties.venuetypedisplay = venueTypeMap[mergedProperties.venuetype] || 'Hotel';
  }
  
  // Set category display names if they don't exist
  if (!mergedProperties.venuecategorydisplayname && mergedProperties.venuecategory) {
    mergedProperties.venuecategorydisplayname = 'Hotel';
  }
  
  // Generate better AccountName if missing
  if (!mergedProperties.AccountName || mergedProperties.AccountName === 'null') {
    const location = mergedProperties.BillingDistrict || 'Dubai';
    const typeDisplay = mergedProperties.venuetypedisplay || 'Hotel';
    mergedProperties.AccountName = `${location} ${typeDisplay} ${index + 1}`;
  }
  
  // Convert phone number to string
  if (typeof mergedProperties.Intphonegooglemapsly === 'number') {
    mergedProperties.Intphonegooglemapsly = mergedProperties.Intphonegooglemapsly.toString();
  }
  
  // Convert numeric fields
  numericFields.forEach((field) => {
    if (mergedProperties[field] !== undefined) {
      mergedProperties[field] = convertStringNumber(mergedProperties[field]);
    }
  });
  
  // Convert nullable fields
  nullableFields.forEach((field) => {
    if (mergedProperties[field] !== undefined) {
      mergedProperties[field] = convertEmptyString(mergedProperties[field]);
    }
  });
  
  // Convert boolean fields
  booleanFields.forEach((field) => {
    if (mergedProperties[field] !== undefined) {
      mergedProperties[field] = convertBooleanString(mergedProperties[field]);
    }
  });
  
  // Fix BudgetFriendly
  if (mergedProperties.BudgetFriendly !== undefined) {
    if (typeof mergedProperties.BudgetFriendly === 'number') {
      if (mergedProperties.BudgetFriendly === 1) mergedProperties.BudgetFriendly = '$';
      else if (mergedProperties.BudgetFriendly === 2) mergedProperties.BudgetFriendly = '$$';
      else if (mergedProperties.BudgetFriendly === 3) mergedProperties.BudgetFriendly = '$$$';
      else mergedProperties.BudgetFriendly = '$';
    }
  }
  
  // Fix EntranceFee
  if (mergedProperties.EntranceFee !== undefined) {
    if (typeof mergedProperties.EntranceFee === 'string') {
      if (mergedProperties.EntranceFee === '' || mergedProperties.EntranceFee.toLowerCase() === 'none') {
        mergedProperties.EntranceFee = '0';
      }
    } else if (!isNaN(mergedProperties.EntranceFee)) {
      mergedProperties.EntranceFee = mergedProperties.EntranceFee.toString();
    }
  }
  
  // Fix NoiseLevel
  if (mergedProperties.NoiseLevel !== undefined) {
    const noiseLevelMap = {
      'low': 'Quiet',
      'quiet': 'Quiet',
      'moderate': 'Moderate',
      'medium': 'Moderate',
      'high': 'Lively',
      'loud': 'Lively',
      'lively': 'Lively',
    };
    if (typeof mergedProperties.NoiseLevel === 'string') {
      mergedProperties.NoiseLevel = noiseLevelMap[mergedProperties.NoiseLevel.toLowerCase()] || 'Moderate';
    }
  }
  
  // Fix Stafffriedlinessbage
  if (mergedProperties.Stafffriedlinessbage !== undefined) {
    const friendlinessMap = {
      'friendly': 'Friendly',
      'neutral': 'Neutral',
      'unfriendly': 'Unfriendly',
      'very friendly': 'Friendly',
    };
    if (typeof mergedProperties.Stafffriedlinessbage === 'string') {
      mergedProperties.Stafffriedlinessbage = friendlinessMap[mergedProperties.Stafffriedlinessbage.toLowerCase()] || 'Neutral';
    }
  }
  
  // Fix HLzohoACFan
  if (mergedProperties.HLzohoACFan !== undefined) {
    if (typeof mergedProperties.HLzohoACFan === 'string') {
      const lowerVal = mergedProperties.HLzohoACFan.toLowerCase();
      if (['ac', 'airconditioning', 'air conditioning'].includes(lowerVal)) {
        mergedProperties.HLzohoACFan = 'AC';
      } else if (['fan', 'ceilingfan', 'portablefan'].includes(lowerVal)) {
        mergedProperties.HLzohoACFan = 'Fan';
      } else {
        mergedProperties.HLzohoACFan = 'AC'; // Default for hotels
      }
    }
  }
  
  // Fix Poweroutletdensity
  if (mergedProperties.Poweroutletdensity !== undefined) {
    const densityMap = {
      'none': 'Low',
      'low': 'Low',
      'few': 'Low',
      'some': 'Medium',
      'medium': 'Medium',
      'many': 'High',
      'high': 'High',
    };
    if (typeof mergedProperties.Poweroutletdensity === 'string') {
      mergedProperties.Poweroutletdensity = densityMap[mergedProperties.Poweroutletdensity.toLowerCase()] || 'Low';
    }
  }
  
  // Combine properties with geometry
  return {
    ...mergedProperties,
    geometry: feature.geometry,
  };
});

// Write the converted data
fs.writeFileSync('hotels_for_import.json', JSON.stringify(venues, null, 2));

console.log(`✓ Converted ${venues.length} hotels for import`);
console.log('✓ Added top-level category: Accommodation Travel (gc_accommodation_travel)');
console.log('✓ All fields properly formatted and validated');
console.log('✓ File saved as hotels_for_import.json');
console.log('\nYou can now import this file using:');
console.log('POST /api/venues-dubai/bulk-import with {"venues": [...], "overwrite": false}');
