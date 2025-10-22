import mongoose from 'mongoose';
import dotenv from 'dotenv';
import EventDubai from '../models/EventDubai';
import VenueDubai from '../models/VenueDubai';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Function to fix field names in event data
function fixEventFields(eventData: any): any {
  const fixed = { ...eventData };
  
  // Fix field names with spaces to underscores
  if (fixed['EventStarts At']) {
    fixed.EventStarts_At = fixed['EventStarts At'];
    delete fixed['EventStarts At'];
  }
  
  if (fixed['EventEnds At']) {
    fixed.EventEnds_At = fixed['EventEnds At'];
    delete fixed['EventEnds At'];
  }
  
  // Fix typo in age restriction field
  if (fixed['Event_Age_Agestriction']) {
    fixed.Event_Age_Restriction = fixed['Event_Age_Agestriction'];
    delete fixed['Event_Age_Agestriction'];
  }
  
  return fixed;
}

async function importEvents() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || '');
    console.log('✅ MongoDB connected');

    // Check if file exists
    const filePath = path.join(__dirname, '../data/events.json');
    console.log('📂 Looking for file at:', filePath);

    if (!fs.existsSync(filePath)) {
      console.error('❌ File not found at:', filePath);
      console.log('💡 Please create data/events.json in your project root');
      process.exit(1);
    }

    // Read events JSON file
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const eventsDataRaw = JSON.parse(fileContent);

    console.log(`📊 Found ${eventsDataRaw.length} events to import`);

    let imported = 0;
    let updated = 0;
    let errors = 0;

    for (let eventData of eventsDataRaw) {
      try {
        console.log(`\n🔍 Processing: ${eventData.Event_Name}`);
        
        // Fix field names (handle spaces and typos)
        eventData = fixEventFields(eventData);
        
        // Validate required fields
        if (!eventData.Dubai_event_id) {
          console.error(`   ❌ Missing Dubai_event_id`);
          errors++;
          continue;
        }
        
        if (!eventData.Account_Name) {
          console.error(`   ❌ Missing Account_Name`);
          errors++;
          continue;
        }
        
        // Validate required date fields
        if (!eventData.EventStarts_At || !eventData.EventEnds_At) {
          console.error(`   ❌ Missing required date fields!`);
          console.error(`      EventStarts_At: ${eventData.EventStarts_At}`);
          console.error(`      EventEnds_At: ${eventData.EventEnds_At}`);
          console.error(`   💡 Make sure your JSON has "EventStarts_At" (underscore, not space)`);
          errors++;
          continue;
        }
        
        // Verify venue exists - FIXED: Use AccountName (camelCase)
        const venue = await VenueDubai.findOne({ AccountName: eventData.Account_Name });
        
        if (!venue) {
          console.error(`   ❌ Venue not found: ${eventData.Account_Name}`);
          console.error(`   💡 Make sure the venue exists in the venuesDubai collection`);
          errors++;
          continue;
        }

        // FIXED: Use camelCase field names
        console.log(`   ✅ Venue found: ${venue.AccountName} (${venue.Dubaiid})`);

        // Set Dubai_id from venue - FIXED: Use Dubaiid
        eventData.Dubai_id = venue.Dubaiid;

        // Check if event already exists
        const existingEvent = await EventDubai.findOne({ Dubai_event_id: eventData.Dubai_event_id });

        if (existingEvent) {
          // Update existing event
          await EventDubai.findOneAndUpdate(
            { Dubai_event_id: eventData.Dubai_event_id },
            eventData,
            { new: true, runValidators: true }
          );
          updated++;
          console.log(`   🔄 Updated: ${eventData.Event_Name}`);
        } else {
          // Create new event
          await EventDubai.create(eventData);
          imported++;
          console.log(`   ✅ Created: ${eventData.Event_Name}`);
        }
        
        console.log(`   📅 Start: ${eventData.EventStarts_At}`);
        console.log(`   📅 End: ${eventData.EventEnds_At}`);
        
      } catch (error: any) {
        console.error(`   ❌ Error importing ${eventData.Dubai_event_id || 'unknown'}:`, error.message);
        if (error.errors) {
          Object.keys(error.errors).forEach(key => {
            console.error(`      - ${key}: ${error.errors[key].message}`);
          });
        }
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Import Summary:');
    console.log(`   ✅ Created: ${imported}`);
    console.log(`   🔄 Updated: ${updated}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log('='.repeat(60));

    // Verify import
    const totalEvents = await EventDubai.countDocuments();
    const upcomingEvents = await EventDubai.countDocuments({
      EventStarts_At: { $gte: new Date() }
    });
    
    console.log(`\n📈 Total events in database: ${totalEvents}`);
    console.log(`🎉 Upcoming events: ${upcomingEvents}`);
    
    // Show sample upcoming event
    const sampleEvent = await EventDubai.findOne({
      EventStarts_At: { $gte: new Date() }
    }).sort({ EventStarts_At: 1 });
    
    if (sampleEvent) {
      console.log(`\n📋 Next upcoming event:`);
      console.log(`   ${sampleEvent.Event_Name}`);
      console.log(`   at ${sampleEvent.Account_Name}`);
      console.log(`   ${sampleEvent.EventStarts_At}`);
    }

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Import failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

importEvents();