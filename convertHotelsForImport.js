const fs = require('fs');

// Read the hotel JSON file (direct array, not GeoJSON)
const hotelsData = JSON.parse(fs.readFileSync('Dubai_Hotels.json', 'utf8'));

console.log(`Processing ${hotelsData.length} hotels...`);

// Function to convert string boolean to actual boolean
function convertBooleanString(value) {
  if (typeof value === 'string') {
    if (value.toUpperCase() === 'TRUE') return 1;
    if (value.toUpperCase() === 'FALSE') return 0;
  }
  return value;
}

// Function to convert string numbers to actual numbers
function convertStringNumber(value) {
  if (typeof value === 'string' && value !== '' && !isNaN(value)) {
    const num = parseFloat(value);
    return Number.isInteger(num) ? parseInt(value) : num;
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
const numericFields = [
  'DL_SPeed_MBPS', 
  'UL_SPeed_MBPS', 
  'Charging_Ports', 
  'Number_of_TVs', 
  'HL_Price_Level', 
  'Rating', 
  'Family_frienliness_score', 
  'Nomad_friendly_score',
  'Latitude_Mapsly_text_singleLine',
  'Longitude_Mapsly_text_singleLine'
];

// Fields that should convert empty strings to null
const nullableFields = [
  'Cuisine_Tags', 
  'Dietary_tags', 
  'Pet_Policy', 
  'Group_policy', 
  'Smoking_Policy', 
  'Website', 
  'Coffee_price_range', 
  'Shows_what_on_TV', 
  'Type_Of_Coffee',
  'parking_options',
  'View',
  'HL_Opening_Hours_Text'
];

// Boolean fields (convert to 0 or 1)
const booleanFields = [
  'Open_Late', 
  'Breakfast_offered', 
  'Brunch_offered', 
  'Dinner_offered', 
  'Alcohol_served', 
  'Pub_Wifi', 
  'Power_backup', 
  'Has_TV_Display', 
  'Takes_bookings', 
  'Outdoor_seating', 
  'Offers_water_refills', 
  'Day_pass_club', 
  'Hotel_pool_access', 
  'Veg_only'
];

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
  
  // Technical & Connectivity (underscored names)
  DL_SPeed_MBPS: 0,
  UL_SPeed_MBPS: 0,
  Charging_Ports: 0,
  Pub_Wifi: 0,
  Wifi_SSID: null,
  Wifi_bage: 'Unverified',
  Power_backup: 0,
  Power_outlet_density: 'Low',
  
  // Venue Features
  Has_TV_Display: 0,
  Number_of_TVs: 0,
  Shows_what_on_TV: null,
  Outdoor_seating: 0,
  Takes_bookings: 1,
  Open_Late: 0,
  
  // Food Service
  Breakfast_offered: 1,
  Brunch_offered: 0,
  Dinner_offered: 0,
  Alcohol_served: 0,
  Offers_water_refills: 1,
  Type_Of_Coffee: null,
  Cuisine_Tags: null,
  Dietary_tags: null,
  Veg_only: 0,
  Healthy_food_level: null,
  
  // Pricing & Rating
  HL_Price_Level: null,
  Rating: null,
  Budget_Friendly: '$$',
  Coffee_price_range: null,
  Entrance_Fee: null,
  
  // Policies & Atmosphere
  Pet_Policy: 'Contact Hotel',
  Group_policy: 'Groups Welcome',
  Smoking_Policy: 'Non-Smoking',
  Noise_Level: 'Quiet',
  View: null,
  Staff_friedliness_bage: 'Friendly',
  Family_frienliness_score: 4,
  Nomad_friendly_score: null,
  HL_zoho_AC_Fan: 'AC',
  
  // Contact & Other
  Int_phone_google_mapsly: null,
  Website: null,
  Hotel_pool_access: 0,
  Day_pass_club: 0,
  'Payment types': 'Cash|Card|Apple Pay|Google Pay',
  parking_options: 'Available',
};

// Generate timestamp suffix to avoid conflicts
const timestamp = Date.now();

// Convert hotel objects to venue documents
const venues = hotelsData.map((hotel, index) => {
  // Start with a copy of the hotel data
  const properties = { ...hotel };
  
  // Remove unwanted fields
  delete properties.Account_name_local;
  delete properties.Kids_friendly_badge;
  
  // Merge with default fields
  const mergedProperties = { ...defaultFields };
  Object.keys(properties).forEach((key) => {
    if (properties[key] !== undefined && properties[key] !== null) {
      mergedProperties[key] = properties[key];
    }
  });
  
  // Generate unique Dubai_id
  if (!mergedProperties.Dubai_id || mergedProperties.Dubai_id === 'null') {
    mergedProperties.Dubai_id = `HOTEL-${timestamp}-${String(index).padStart(4, '0')}`;
  } else {
    mergedProperties.Dubai_id = `${mergedProperties.Dubai_id}-${timestamp}`;
  }
  
  // Generate better Account_Name if missing
  if (!mergedProperties.Account_Name || mergedProperties.Account_Name === 'null') {
    const location = mergedProperties.Billing_District || 'Dubai';
    const typeDisplay = mergedProperties.venue_type_display || 'Hotel';
    mergedProperties.Account_Name = `${location} ${typeDisplay} ${index + 1}`;
  }
  
  // Convert phone number to string
  if (typeof mergedProperties.Int_phone_google_mapsly === 'number') {
    mergedProperties.Int_phone_google_mapsly = `+971${mergedProperties.Int_phone_google_mapsly}`;
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
      const converted = convertBooleanString(mergedProperties[field]);
      mergedProperties[field] = converted === true ? 1 : (converted === false ? 0 : converted);
    }
  });
  
  // Fix Budget_Friendly
  if (mergedProperties.Budget_Friendly !== undefined) {
    if (typeof mergedProperties.Budget_Friendly === 'number') {
      if (mergedProperties.Budget_Friendly === 1) mergedProperties.Budget_Friendly = '$';
      else if (mergedProperties.Budget_Friendly === 2) mergedProperties.Budget_Friendly = '$$';
      else if (mergedProperties.Budget_Friendly === 3) mergedProperties.Budget_Friendly = '$$$';
      else mergedProperties.Budget_Friendly = '$$';
    } else if (typeof mergedProperties.Budget_Friendly === 'string') {
      if (!['$', '$$', '$$$'].includes(mergedProperties.Budget_Friendly)) {
        mergedProperties.Budget_Friendly = '$$';
      }
    }
  }
  
  // Fix Entrance_Fee
  if (mergedProperties.Entrance_Fee !== undefined) {
    if (typeof mergedProperties.Entrance_Fee === 'string') {
      if (mergedProperties.Entrance_Fee === '' || mergedProperties.Entrance_Fee.toLowerCase() === 'none') {
        mergedProperties.Entrance_Fee = 'Free';
      }
    } else if (!isNaN(mergedProperties.Entrance_Fee)) {
      mergedProperties.Entrance_Fee = mergedProperties.Entrance_Fee === 0 ? 'Free' : mergedProperties.Entrance_Fee.toString();
    }
  }
  
  // Fix Noise_Level
  if (mergedProperties.Noise_Level !== undefined) {
    const noiseLevelMap = {
      'low': 'Quiet',
      'quiet': 'Quiet',
      'moderate': 'Moderate',
      'medium': 'Moderate',
      'high': 'Lively',
      'loud': 'Lively',
      'lively': 'Lively',
    };
    if (typeof mergedProperties.Noise_Level === 'string') {
      mergedProperties.Noise_Level = noiseLevelMap[mergedProperties.Noise_Level.toLowerCase()] || 'Moderate';
    }
  }
  
  // Fix Staff_friedliness_bage
  if (mergedProperties.Staff_friedliness_bage !== undefined) {
    const friendlinessMap = {
      'friendly': 'Friendly',
      'neutral': 'Neutral',
      'very friendly': 'Very Friendly',
    };
    if (typeof mergedProperties.Staff_friedliness_bage === 'string') {
      mergedProperties.Staff_friedliness_bage = friendlinessMap[mergedProperties.Staff_friedliness_bage.toLowerCase()] || 'Friendly';
    }
  }
  
  // Fix HL_zoho_AC_Fan
  if (mergedProperties.HL_zoho_AC_Fan !== undefined) {
    if (typeof mergedProperties.HL_zoho_AC_Fan === 'string') {
      const lowerVal = mergedProperties.HL_zoho_AC_Fan.toLowerCase();
      if (['ac', 'airconditioning', 'air conditioning', 'a/c'].includes(lowerVal)) {
        mergedProperties.HL_zoho_AC_Fan = 'AC';
      } else if (['fan', 'ceiling fan', 'portable fan'].includes(lowerVal)) {
        mergedProperties.HL_zoho_AC_Fan = 'Fan';
      } else {
        mergedProperties.HL_zoho_AC_Fan = 'AC';
      }
    }
  }
  
  // Fix Power_outlet_density
  if (mergedProperties.Power_outlet_density !== undefined) {
    const densityMap = {
      'none': 'Low',
      'low': 'Low',
      'few': 'Low',
      'some': 'Medium',
      'medium': 'Medium',
      'many': 'High',
      'high': 'High',
    };
    if (typeof mergedProperties.Power_outlet_density === 'string') {
      mergedProperties.Power_outlet_density = densityMap[mergedProperties.Power_outlet_density.toLowerCase()] || 'Medium';
    }
  }
  
  // Fix Healthy_food_level
  if (mergedProperties.Healthy_food_level !== undefined) {
    const healthMap = {
      'low': 'Low',
      'medium': 'Medium',
      'high': 'High',
    };
    if (typeof mergedProperties.Healthy_food_level === 'string') {
      mergedProperties.Healthy_food_level = healthMap[mergedProperties.Healthy_food_level.toLowerCase()] || null;
    }
  }
  
  // Create geometry from coordinates
  let geometry;
  
  if (mergedProperties.Latitude_Mapsly_text_singleLine && mergedProperties.Longitude_Mapsly_text_singleLine) {
    const lat = convertStringNumber(mergedProperties.Latitude_Mapsly_text_singleLine);
    const lng = convertStringNumber(mergedProperties.Longitude_Mapsly_text_singleLine);
    
    geometry = {
      type: 'Point',
      coordinates: [lng, lat]
    };
  } else {
    console.warn(`Warning: Hotel ${index + 1} (${mergedProperties.Account_Name}) has no valid coordinates`);
    geometry = {
      type: 'Point',
      coordinates: [55.2708, 25.2048]
    };
  }
  
  return {
    ...mergedProperties,
    geometry: geometry,
  };
});

// Write the converted data
const outputData = {
  venues: venues,
  overwrite: false
};

fs.writeFileSync('hotels_for_import.json', JSON.stringify(outputData, null, 2));

console.log(`\n✓ Converted ${venues.length} hotels for import`);
console.log('✓ Added top-level category: Accommodation Travel (gc_accommodation_travel)');
console.log('✓ All fields properly formatted and validated');
console.log('✓ File saved as hotels_for_import.json');
console.log('\n=== Import Instructions ===');
console.log('You can now import this file using POST request to:');
console.log('  URL: http://localhost:4000/api/venues-dubai/bulk-import');
console.log('  Method: POST');
console.log('  Headers: Authorization: Bearer YOUR_ADMIN_TOKEN');
console.log('  Body: Contents of hotels_for_import.json');
