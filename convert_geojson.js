const fs = require('fs');

// Read the GeoJSON file
const geojsonData = JSON.parse(fs.readFileSync('HonestLee-40-bars-pubs-beach-clubs.geojson', 'utf8'));

// Convert features to venue documents
const venues = geojsonData.features.map(feature => {
    // Combine properties with geometry
    return {
        ...feature.properties,
        geometry: feature.geometry
    };
});

// Write the converted data
fs.writeFileSync('venues_for_import.json', JSON.stringify(venues, null, 2));

console.log(`Converted ${venues.length} venues for import`);
console.log('File saved as: venues_for_import.json');
