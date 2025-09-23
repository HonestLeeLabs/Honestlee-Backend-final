import express from 'express';
import { NextFunction, Request, Response } from 'express';
import {
  getUsers,
  getUserById,
  updateUserById,
  deleteUserById,
  createVenue,
  getVenues,
  getVenueById,
  updateVenueById,
  deleteVenueById,
} from '../controllers/adminController';
import { authenticate, AuthRequest } from '../middlewares/authMiddleware';
import { authorizeRoles } from '../middlewares/roleMiddleware';

const router = express.Router();

function withAuthRequest(
  handler: (req: AuthRequest, res: Response, next: NextFunction) => any
) {
  return (req: Request, res: Response, next: NextFunction) =>
    handler(req as AuthRequest, res, next);
}

router.use(withAuthRequest(authenticate));
router.use(withAuthRequest(authorizeRoles('ADMIN')));

router.get('/users', withAuthRequest(getUsers));
router.get('/users/:id', withAuthRequest(getUserById));
router.put('/users/:id', withAuthRequest(updateUserById));
router.delete('/users/:id', withAuthRequest(deleteUserById));

router.post('/venues', withAuthRequest(createVenue));
router.get('/venues', withAuthRequest(getVenues));
router.get('/venues/:id', withAuthRequest(getVenueById));
router.put('/venues/:id', withAuthRequest(updateVenueById));
router.delete('/venues/:id', withAuthRequest(deleteVenueById));

export default router;
