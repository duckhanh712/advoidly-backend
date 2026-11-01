import { UserRole } from '../enums';

/** Claims carried by access tokens issued by auth-service. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: UserRole;
}

/** The authenticated principal attached to `request.user`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
}
