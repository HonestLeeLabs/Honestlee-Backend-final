const fs = require('fs');

// Function to convert string boolean to number
function convertBooleanString(value) {
    if (typeof value === 'string') {
        if (value.toUpperCase() === 'TRUE') return 1;
        if (value.toUpperCase() === 'FALSE') return 0;
    }
    return value; // Return as-is if not a string or not TRUE/FALSE
}

// Read the GeoJSON file
const geojsonData = JSON.parse(fs.readFileSync('mobile_places_dhera.geojson', 'utf8'));

// Convert features to venue documents
const venues = geojsonData.features.map(feature => {
    const properties = { ...feature.properties };
    
    // List of fields that should be converted from string boolean to number
    const booleanFields = [
        'Open_Late', 'Breakfast_offered', 'Brunch_offered', 'Dinner_offered', 
        'Alcohol_served', 'Pub_Wifi', 'Power_backup', 'Has_TV_Display', 
        'Takes_bookings', 'Outdoor_seating', 'Offers_water_refills', 
        'Day_pass_club', 'Hotel_pool_access'
    ];
    
    // Convert boolean string fields to numbers
    booleanFields.forEach(field => {
        if (properties[field] !== undefined) {
            properties[field] = convertBooleanString(properties[field]);
        }
    });
    
    // Combine properties with geometry
    return {
        ...properties,
        geometry: feature.geometry
    };
});

// Write the converted data
fs.writeFileSync('venues1_for_import.json', JSON.stringify(venues, null, 2));

console.log(`Converted ${venues.length} venues1 for import`);
console.log('Boolean string fields converted to numbers (TRUE=1, FALSE=0)');
console.log('File saved as: venues1_for_import.json');
