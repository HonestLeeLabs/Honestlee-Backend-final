import { Request, Response } from 'express';
import VenueCache from '../models/VenueCache'; // Add this import
import venueSyncService from '../services/venueSyncService';

/**
 * Handle Zoho CRM webhooks
 */
export const handleZohoWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔔 Zoho webhook received:', JSON.stringify(req.body, null, 2));

    const { module, operation, data } = req.body;

    // Verify it's an Accounts (venue) webhook
    if (module !== 'Accounts') {
      console.log(`ℹ️ Ignoring webhook for module: ${module}`);
      res.status(200).json({ message: 'Webhook ignored - not Accounts module' });
      return;
    }

    // Process based on operation type
    switch (operation) {
      case 'insert':
      case 'update':
        console.log(`🔄 Processing ${operation} for venue: ${data.id}`);
        
        // Sync the specific venue
        await venueSyncService.syncVenueById(data.id);
        
        console.log(`✅ Venue ${operation} processed successfully`);
        break;

      case 'delete':
        console.log(`🗑️ Processing delete for venue: ${data.id}`);
        
        // Mark as deleted in cache (don't actually delete for audit trail)
        await VenueCache.findOneAndUpdate(
          { zoho_id: data.id },
          { 
            sync_status: 'error', // Use error status to indicate deleted
            'timestamps.synced_at': new Date()
          }
        );
        
        console.log(`✅ Venue deletion processed successfully`);
        break;

      default:
        console.log(`⚠️ Unknown webhook operation: ${operation}`);
    }

    // Send success response
    res.status(200).json({
      success: true,
      message: `Webhook processed successfully`,
      operation: operation,
      venue_id: data.id
    });

  } catch (error: any) {
    console.error('❌ Webhook processing failed:', error);
    
    // Still return 200 to prevent Zoho from retrying
    res.status(200).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
};

/**
 * Manual sync trigger endpoint
 */
export const triggerFullSync = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔄 Manual full sync triggered');
    
    const result = await venueSyncService.syncAllVenues();
    
    res.json({
      success: true,
      message: 'Full sync completed',
      stats: result
    });

  } catch (error: any) {
    console.error('❌ Manual full sync failed:', error);
    res.status(500).json({
      success: false,
      message: 'Full sync failed',
      error: error.message
    });
  }
};

/**
 * Manual delta sync trigger endpoint  
 */
export const triggerDeltaSync = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🔄 Manual delta sync triggered');
    
    const result = await venueSyncService.deltaSyncVenues();
    
    res.json({
      success: true,
      message: 'Delta sync completed',
      stats: result
    });

  } catch (error: any) {
    console.error('❌ Manual delta sync failed:', error);
    res.status(500).json({
      success: false,
      message: 'Delta sync failed', 
      error: error.message
    });
  }
};

/**
 * Get cache statistics
 */
export const getCacheStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await venueSyncService.getCacheStats();
    
    res.json({
      success: true,
      message: 'Cache statistics retrieved',
      stats: stats
    });

  } catch (error: any) {
    console.error('❌ Error getting cache stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache stats',
      error: error.message
    });
  }
};
