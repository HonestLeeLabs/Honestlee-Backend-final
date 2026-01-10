// src/controllers/roleController.ts
// ===== ROLE MANAGEMENT CONTROLLER =====

import { Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import { Role } from '../models/User';

// Role descriptions for UI display
const ROLE_DESCRIPTIONS: Record<Role, { description: string; permissions: string[]; level: number }> = {
    [Role.ADMIN]: {
        description: 'Full system access with all administrative privileges',
        permissions: [
            'Manage all users and roles',
            'Manage all venues',
            'Access all reports and analytics',
            'Configure system settings',
            'Manage agents and assignments'
        ],
        level: 100
    },
    [Role.MANAGER]: {
        description: 'Manage venues, staff, and view reports',
        permissions: [
            'Manage assigned venues',
            'Manage staff members',
            'View venue analytics',
            'Approve offers and events',
            'Handle customer escalations'
        ],
        level: 80
    },
    [Role.OWNER]: {
        description: 'Venue owner with access to their venue dashboard',
        permissions: [
            'View own venue dashboard',
            'Manage venue details',
            'View venue analytics',
            'Manage venue offers',
            'Respond to reviews'
        ],
        level: 70
    },
    [Role.AGENT]: {
        description: 'Field agent for venue onboarding and verification',
        permissions: [
            'Onboard new venues',
            'Verify venue information',
            'Take venue photos',
            'Conduct WiFi speed tests',
            'Update venue status'
        ],
        level: 50
    },
    [Role.STAFF]: {
        description: 'Venue staff member with limited venue access',
        permissions: [
            'View venue information',
            'Handle check-ins',
            'Scan QR codes',
            'View daily reports'
        ],
        level: 30
    },
    [Role.CONSUMER]: {
        description: 'Regular app user',
        permissions: [
            'Browse venues',
            'Write reviews',
            'Redeem offers',
            'Connect to WiFi'
        ],
        level: 10
    }
};

/**
 * GET /api/admin/roles
 * Returns all available roles with descriptions and permissions
 * Only accessible by ADMIN
 */
export const getAvailableRoles = async (req: AuthRequest, res: Response) => {
    try {
        // Ensure only ADMIN can fetch roles
        if (!req.user || req.user.role !== 'ADMIN') {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: Only ADMIN can access role information'
            });
        }

        const roles = Object.values(Role).map(role => ({
            value: role,
            label: role.charAt(0) + role.slice(1).toLowerCase(),
            ...ROLE_DESCRIPTIONS[role]
        }));

        // Sort by level descending (highest privilege first)
        roles.sort((a, b) => b.level - a.level);

        return res.json({
            success: true,
            data: {
                roles,
                totalRoles: roles.length
            }
        });
    } catch (error: any) {
        console.error('❌ Error fetching roles:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch roles',
            error: error.message
        });
    }
};

/**
 * Get role hierarchy level for comparison
 * Higher number = more privileges
 */
export const getRoleLevel = (role: Role): number => {
    return ROLE_DESCRIPTIONS[role]?.level || 0;
};

/**
 * Check if a role can manage another role
 * A role can only manage roles with lower privilege level
 */
export const canManageRole = (managerRole: Role, targetRole: Role): boolean => {
    return getRoleLevel(managerRole) > getRoleLevel(targetRole);
};
