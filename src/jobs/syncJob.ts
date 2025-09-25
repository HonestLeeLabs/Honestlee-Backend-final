import cron from 'node-cron';
import venueSyncService from '../services/venueSyncService';

/**
 * Schedule automatic venue sync every 10 minutes
 */
export function startSyncJobs() {
  // Delta sync every 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    try {
      console.log('⏰ Scheduled delta sync starting...');
      await venueSyncService.deltaSyncVenues();
    } catch (error) {
      console.error('❌ Scheduled delta sync failed:', error);
    }
  });

  // Full sync every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    try {
      console.log('⏰ Scheduled full sync starting...');
      await venueSyncService.syncAllVenues();
    } catch (error) {
      console.error('❌ Scheduled full sync failed:', error);
    }
  });

  console.log('🕐 Sync jobs scheduled: Delta every 10min, Full every 6hrs');
}
