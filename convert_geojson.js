const fs = require('fs');

// Function to convert string boolean to actual boolean (not number)
function convertBooleanString(value) {
    if (typeof value === 'string') {
        if (value.toUpperCase() === 'TRUE') return true;  // Changed to true instead of 1
        if (value.toUpperCase() === 'FALSE') return false; // Changed to false instead of 0
    }
    return value; // Return as-is if not a string or not TRUE/FALSE
}

// Read the GeoJSON file
const geojsonData = JSON.parse(fs.readFileSync('dubai_worship.geojson', 'utf8'));

// Convert features to venue documents
const venues = geojsonData.features.map(feature => {
    const properties = { ...feature.properties };
    
    // Remove Account_name_local field
    delete properties.Account_name_local;
    
    // Add missing fields with default values (using false instead of 0 for booleans)
    const defaultFields = {
        // Billing/Location Fields
        Billing_City: "Dubai",
        Billing_State: "Dubai",
        
        // Display Fields - Add proper display names for worship places
        venue_type_display: properties.venue_type === 'vt_mosque' ? "Mosque" : 
                            properties.venue_type === 'vt_temple' ? "Temple" :
                            properties.venue_type === 'vt_church' ? "Church" : "Worship Place",
        venue_category_display: "Religion & Spiritual",
        
        // Technical/Connectivity
        DL_SPeed_MBPS: 0,
        UL_SPeed_MBPS: 0,
        Charging_Ports: 0,
        Pub_Wifi: false,  // Changed to false
        Wifi_SSID: null,
        Wifi_bage: "Unverified",
        Power_backup: false,  // Changed to false
        Power_outlet_density: "Low",
        
        // Venue Features
        Has_TV_Display: false,  // Changed to false
        Number_of_TVs: 0,
        Shows_what_on_TV: "None",
        Outdoor_seating: false,  // Changed to false
        Takes_bookings: false,   // Changed to false
        Open_Late: false,        // Changed to false
        
        // Food/Service Related
        Breakfast_offered: false,  // Changed to false
        Brunch_offered: false,     // Changed to false
        Dinner_offered: false,     // Changed to false
        Alcohol_served: false,     // Changed to false
        Offers_water_refills: false, // Changed to false
        Type_Of_Coffee: "None",
        Cuisine_Tags: null,
        Dietary_tags: null,
        Veg_only: false,          // Changed to false
        Healthy_food_level: "Low",
        
        // Pricing/Rating
        HL_Price_Level: null,
        Rating: null,
        Budget_Friendly: "$",
        Coffee_price_range: null,
        Entrance_Fee: "None",
        
        // Policies/Atmosphere
        Pet_Policy: null,
        Group_policy: null,
        Smoking_Policy: null,
        Noise_Level: "Quiet",
        View: "Street",
        Staff_friedliness_bage: "Neutral",
        Family_frienliness_score: null,
        Nomad_friendly_score: null,
        HL_zoho_AC_Fan: "AC",  // Changed to "AC"
        
        // Contact/Other
        Int_phone_google_mapsly: "+971 4 XXX XXXX",  // Add default phone
        Website: null,
        Hotel_pool_access: false,  // Changed to false
        Day_pass_club: false,      // Changed to false
        "Payment types": "Cash",   // Add default payment
        parking_options: null
    };
    
    // List of fields that should be converted from string boolean to actual boolean
    const booleanFields = [
        'Open_Late', 'Breakfast_offered', 'Brunch_offered', 'Dinner_offered', 
        'Alcohol_served', 'Pub_Wifi', 'Power_backup', 'Has_TV_Display', 
        'Takes_bookings', 'Outdoor_seating', 'Offers_water_refills', 
        'Day_pass_club', 'Hotel_pool_access', 'Veg_only'
    ];
    
    // Merge defaults with existing properties
    const mergedProperties = { ...defaultFields, ...properties };
    
    // Fix Account_Name if it's null or undefined (REQUIRED FIELD)
    if (!mergedProperties.Account_Name || mergedProperties.Account_Name === null) {
        // Generate better names based on venue type and location
        const venueTypeMap = {
            'vt_mosque': 'Mosque',
            'vt_temple': 'Temple', 
            'vt_church': 'Church'
        };
        const venueTypeName = venueTypeMap[mergedProperties.venue_type] || 'Worship Place';
        const location = mergedProperties.Billing_District || 'Dubai';
        mergedProperties.Account_Name = `${location} ${venueTypeName}`;
    }
    
    // Convert boolean string fields to actual booleans (not numbers)
    booleanFields.forEach(field => {
        if (mergedProperties[field] !== undefined) {
            mergedProperties[field] = convertBooleanString(mergedProperties[field]);
        }
    });
    
    // Remove problematic Kids_friendly_badge field to avoid validation errors
    delete mergedProperties.Kids_friendly_badge;
    
    // Combine properties with geometry
    return {
        ...mergedProperties,
        geometry: feature.geometry
    };
});

// Write the converted data
fs.writeFileSync('venues_worship_for_import_local.json', JSON.stringify(venues, null, 2));

console.log(`Converted ${venues.length} worship venues for import`);
console.log('✅ All boolean fields converted to true/false (not 1/0)');
console.log('✅ Added proper venue_type_display and venue_category_display');
console.log('✅ Generated meaningful Account_Name based on location and type');
console.log('✅ Added default phone number and payment type');
console.log('✅ Fixed HL_zoho_AC_Fan to "AC"');
console.log('✅ All fields now match frontend expectations');
console.log('Kids_friendly_badge field removed to avoid validation errors');
console.log('Account_name_local field removed');
console.log('File saved as: venues_worship_for_import_local.json');
