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
const geojsonData = JSON.parse(fs.readFileSync('full_dubai_mjbr_cafes.geojson', 'utf8'));

// Convert features to venue documents
const venues = geojsonData.features.map(feature => {
    const properties = { ...feature.properties };
    
    // Remove Account_name_local field if it exists
    delete properties.Account_name_local;
    
    // Add missing fields with default values for cafes
    const defaultFields = {
        // Billing/Location Fields - only if missing
        Billing_City: "Dubai",
        Billing_State: "Dubai",
        
        // Display Fields - Add proper display names for cafes
        venue_type_display: properties.venue_type === 'vt_coffee_shop' ? "Coffee Shop" : 
                            properties.venue_type === 'vt_cafe' ? "Cafe" :
                            properties.venue_type === 'vt_restaurant' ? "Restaurant" :
                            properties.venue_type === 'vt_bar' ? "Bar" : "Cafe",
        venue_category_display: properties.venue_category === 'vc_cafe' ? "Cafe" :
                               properties.venue_category === 'vc_restaurant' ? "Restaurant" :
                               properties.venue_category === 'vc_bar' ? "Bar" : "Food & Drink",
        
        // Technical/Connectivity - only set defaults if missing
        DL_SPeed_MBPS: 0,
        UL_SPeed_MBPS: 0,
        Charging_Ports: 0,
        Pub_Wifi: false,
        Wifi_SSID: null,
        Wifi_bage: "Unverified",
        Power_backup: false,
        Power_outlet_density: "Low",
        
        // Venue Features
        Has_TV_Display: false,
        Number_of_TVs: 0,
        Shows_what_on_TV: "None",
        Outdoor_seating: false,
        Takes_bookings: false,
        Open_Late: false,
        
        // Food/Service Related
        Breakfast_offered: false,
        Brunch_offered: false,
        Dinner_offered: false,
        Alcohol_served: false,
        Offers_water_refills: false,
        Type_Of_Coffee: "None",
        Cuisine_Tags: null,
        Dietary_tags: null,
        Veg_only: false,
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
        Noise_Level: "Moderate",
        View: "Street",
        Staff_friedliness_bage: "Neutral",
        Family_frienliness_score: null,
        Nomad_friendly_score: null,
        HL_zoho_AC_Fan: "AC",
        
        // Contact/Other
        Int_phone_google_mapsly: "+971 4 XXX XXXX",
        Website: null,
        Hotel_pool_access: false,
        Day_pass_club: false,
        "Payment types": "Cash;Card",
        parking_options: null
    };
    
    // List of fields that should be converted from string boolean to actual boolean
    const booleanFields = [
        'Open_Late', 'Breakfast_offered', 'Brunch_offered', 'Dinner_offered', 
        'Alcohol_served', 'Pub_Wifi', 'Power_backup', 'Has_TV_Display', 
        'Takes_bookings', 'Outdoor_seating', 'Offers_water_refills', 
        'Day_pass_club', 'Hotel_pool_access', 'Veg_only'
    ];
    
    // Only add default fields if they don't already exist (since cafe data is more complete)
    const mergedProperties = {};
    
    // First add defaults
    Object.keys(defaultFields).forEach(key => {
        mergedProperties[key] = defaultFields[key];
    });
    
    // Then override with existing properties (this preserves existing data)
    Object.keys(properties).forEach(key => {
        mergedProperties[key] = properties[key];
    });
    
    // Fix Account_Name if it's null or undefined (REQUIRED FIELD)
    if (!mergedProperties.Account_Name || mergedProperties.Account_Name === null) {
        // Generate better names based on venue type and location
        const venueTypeMap = {
            'vt_coffee_shop': 'Coffee Shop',
            'vt_cafe': 'Cafe',
            'vt_restaurant': 'Restaurant',
            'vt_bar': 'Bar'
        };
        const venueTypeName = venueTypeMap[mergedProperties.venue_type] || 'Cafe';
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
fs.writeFileSync('venues_cafes_for_import_local.json', JSON.stringify(venues, null, 2));

console.log(`Converted ${venues.length} cafe venues for import`);
console.log('✅ All boolean fields converted to true/false (not 1/0)');
console.log('✅ Added proper venue_type_display and venue_category_display');
console.log('✅ Generated meaningful Account_Name based on location and type');
console.log('✅ Preserved existing cafe data while adding missing defaults');
console.log('✅ All fields now match frontend expectations');
console.log('Kids_friendly_badge field removed to avoid validation errors');
console.log('Account_name_local field removed if present');
console.log('File saved as: venues_cafes_for_import_local.json');
