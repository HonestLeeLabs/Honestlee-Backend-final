// ===== FILE: src/controllers/venueOwnerController.ts =====
// Controller for managing venue owner assignments

import { Response } from 'express';
import mongoose from 'mongoose';
import User, { Role } from '../models/User';
import { getVenueModel } from '../models/Venue';
import { AuthRequest } from '../middlewares/authMiddleware';
import { RegionRequest } from '../middlewares/regionMiddleware';
import { dbManager } from '../config/database';

// Combined request type
type CombinedRequest = AuthRequest & RegionRequest;

/**
 * GET /api/admin/owners
 * Get list of users who can be venue owners (existing OWNER role + search all users)
 */
export const getOwners = async (req: CombinedRequest, res: Response) => {
    try {
        const { search = '', page = 1, limit = 20, includeAll = 'true' } = req.query;

        const numericPage = parseInt(page.toString(), 10);
        const numericLimit = parseInt(limit.toString(), 10);

        // Build query
        const query: any = {};

        // If includeAll is false, only show existing OWNER role users
        if (includeAll !== 'true') {
            query.role = Role.OWNER;
        }

        // Search by name, email, or phone
        if (search && typeof search === 'string' && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            query.$or = [
                { name: searchRegex },
                { email: searchRegex },
                { phone: searchRegex }
            ];
        }

        const users = await User.find(query)
            .select('_id name email phone role createdAt')
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit)
            .sort({ role: 1, name: 1 }); // OWNER first, then alphabetically

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            data: users,
            pagination: {
                page: numericPage,
                limit: numericLimit,
                total,
                totalPages: Math.ceil(total / numericLimit)
            }
        });
    } catch (error: any) {
        console.error('Error fetching owners:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch owners',
            error: error.message
        });
    }
};

/**
 * GET /api/admin/venues/:venueId/owner
 * Get owner details for a specific venue
 */
export const getVenueOwner = async (req: CombinedRequest, res: Response) => {
    try {
        const { venueId } = req.params;
        const region = req.region || 'ae';

        // Connect to regional database
        await dbManager.connectRegion(region);
        const Venue = getVenueModel(region);

        if (!mongoose.Types.ObjectId.isValid(venueId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid venue ID'
            });
        }

        const venue = await Venue.findById(venueId)
            .select('_id AccountName ownerId')
            .populate('ownerId', '_id name email phone role');

        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        res.json({
            success: true,
            data: {
                venueId: venue._id,
                venueName: venue.AccountName,
                owner: venue.ownerId || null
            }
        });
    } catch (error: any) {
        console.error('Error fetching venue owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch venue owner',
            error: error.message
        });
    }
};

/**
 * POST /api/admin/venues/:venueId/owner
 * Assign an existing user as venue owner
 * Body: { userId: string, updateUserRole?: boolean }
 */
export const assignOwner = async (req: CombinedRequest, res: Response) => {
    try {
        const { venueId } = req.params;
        const { userId, updateUserRole = true } = req.body;
        const region = req.region || 'ae';

        // Connect to regional database
        await dbManager.connectRegion(region);
        const Venue = getVenueModel(region);

        // Validate IDs
        if (!mongoose.Types.ObjectId.isValid(venueId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid venue ID'
            });
        }

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Valid user ID is required'
            });
        }

        // Find venue
        const venue = await Venue.findById(venueId);
        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        // Find user
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update venue with owner (use type assertion for ObjectId compatibility)
        (venue as any).ownerId = new mongoose.Types.ObjectId(userId);
        await venue.save();

        // Optionally update user role to OWNER
        if (updateUserRole && user.role !== Role.OWNER && user.role !== Role.ADMIN) {
            user.role = Role.OWNER;
            await user.save();
        }

        // Fetch updated venue with populated owner
        const updatedVenue = await Venue.findById(venueId)
            .select('_id AccountName ownerId')
            .populate('ownerId', '_id name email phone role');

        res.json({
            success: true,
            message: 'Owner assigned successfully',
            data: {
                venueId: updatedVenue?._id,
                venueName: updatedVenue?.AccountName,
                owner: updatedVenue?.ownerId
            }
        });
    } catch (error: any) {
        console.error('Error assigning owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to assign owner',
            error: error.message
        });
    }
};

/**
 * POST /api/admin/venues/:venueId/owner/create
 * Create a new user with OWNER role and assign to venue
 * Body: { name: string, email?: string, phone?: string }
 */
export const createAndAssignOwner = async (req: CombinedRequest, res: Response) => {
    try {
        const { venueId } = req.params;
        const { name, email, phone } = req.body;
        const region = req.region || 'ae';

        console.log(`🔍 createAndAssignOwner called for venueId: ${venueId}, region: ${region}`);

        // Connect to regional database
        await dbManager.connectRegion(region);
        const Venue = getVenueModel(region);

        // Validate venue ID
        if (!mongoose.Types.ObjectId.isValid(venueId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid venue ID'
            });
        }

        // Validate required fields
        if (!name || (!email && !phone)) {
            return res.status(400).json({
                success: false,
                message: 'Name and either email or phone are required'
            });
        }

        // Find venue
        const venue = await Venue.findById(venueId);
        if (!venue) {
            console.log(`❌ Venue not found: ${venueId} in region ${region}`);
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        console.log(`✅ Found venue: ${venue.AccountName}`);

        // Check if user already exists with same email or phone
        if (email) {
            const existingByEmail = await User.findOne({ email: email.toLowerCase() });
            if (existingByEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'A user with this email already exists. Use the assign existing user option instead.',
                    existingUser: {
                        _id: existingByEmail._id,
                        name: existingByEmail.name,
                        email: existingByEmail.email
                    }
                });
            }
        }

        if (phone) {
            const existingByPhone = await User.findOne({ phone });
            if (existingByPhone) {
                return res.status(400).json({
                    success: false,
                    message: 'A user with this phone already exists. Use the assign existing user option instead.',
                    existingUser: {
                        _id: existingByPhone._id,
                        name: existingByPhone.name,
                        phone: existingByPhone.phone
                    }
                });
            }
        }

        // Create new user with OWNER role
        const newUser = new User({
            name,
            email: email ? email.toLowerCase() : undefined,
            phone,
            role: Role.OWNER,
            region: venue.region || region
        });

        await newUser.save();
        console.log(`✅ Created new user: ${newUser.name} (${newUser._id})`);

        // Assign to venue (use type assertion for ObjectId compatibility)
        (venue as any).ownerId = newUser._id;
        await venue.save();

        // Fetch updated venue with populated owner
        const updatedVenue = await Venue.findById(venueId)
            .select('_id AccountName ownerId')
            .populate('ownerId', '_id name email phone role');

        res.status(201).json({
            success: true,
            message: 'Owner created and assigned successfully',
            data: {
                venueId: updatedVenue?._id,
                venueName: updatedVenue?.AccountName,
                owner: updatedVenue?.ownerId
            }
        });
    } catch (error: any) {
        console.error('Error creating and assigning owner:', error);

        // Handle duplicate key errors
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'User with this email or phone already exists',
                error: 'Duplicate key error'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create and assign owner',
            error: error.message
        });
    }
};

/**
 * DELETE /api/admin/venues/:venueId/owner
 * Remove owner assignment from venue
 */
export const removeOwner = async (req: CombinedRequest, res: Response) => {
    try {
        const { venueId } = req.params;
        const region = req.region || 'ae';

        // Connect to regional database
        await dbManager.connectRegion(region);
        const Venue = getVenueModel(region);

        if (!mongoose.Types.ObjectId.isValid(venueId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid venue ID'
            });
        }

        const venue = await Venue.findById(venueId);
        if (!venue) {
            return res.status(404).json({
                success: false,
                message: 'Venue not found'
            });
        }

        if (!venue.ownerId) {
            return res.status(400).json({
                success: false,
                message: 'This venue has no owner assigned'
            });
        }

        // Remove owner assignment
        venue.ownerId = undefined;
        await venue.save();

        res.json({
            success: true,
            message: 'Owner removed successfully',
            data: {
                venueId: venue._id,
                venueName: venue.AccountName,
                owner: null
            }
        });
    } catch (error: any) {
        console.error('Error removing owner:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove owner',
            error: error.message
        });
    }
};

/**
 * GET /api/admin/venues/with-owners
 * Get all venues with their owner information populated
 */
export const getVenuesWithOwners = async (req: CombinedRequest, res: Response) => {
    try {
        const { page = 1, limit = 50, hasOwner } = req.query;
        const region = req.region || 'ae';

        // Connect to regional database
        await dbManager.connectRegion(region);
        const Venue = getVenueModel(region);

        const numericPage = parseInt(page.toString(), 10);
        const numericLimit = parseInt(limit.toString(), 10);

        // Build query
        const query: any = {};

        if (hasOwner === 'true') {
            query.ownerId = { $exists: true, $ne: null };
        } else if (hasOwner === 'false') {
            query.$or = [
                { ownerId: { $exists: false } },
                { ownerId: null }
            ];
        }

        const venues = await Venue.find(query)
            .select('_id globalId AccountName BillingCity venuecategory ownerId isActive')
            .populate('ownerId', '_id name email phone role')
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit)
            .sort({ AccountName: 1 });

        const total = await Venue.countDocuments(query);

        res.json({
            success: true,
            data: venues,
            pagination: {
                page: numericPage,
                limit: numericLimit,
                total,
                totalPages: Math.ceil(total / numericLimit)
            }
        });
    } catch (error: any) {
        console.error('Error fetching venues with owners:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch venues with owners',
            error: error.message
        });
    }
};
