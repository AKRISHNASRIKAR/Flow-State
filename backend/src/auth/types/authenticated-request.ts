import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  sub: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
