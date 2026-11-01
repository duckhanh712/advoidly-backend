export enum UserRole {
  USER = 'USER',
  MODERATOR = 'MODERATOR',
  ADMIN = 'ADMIN',
}

/** Roles allowed to perform moderation actions. */
export const MODERATION_ROLES: readonly UserRole[] = [UserRole.MODERATOR, UserRole.ADMIN];
