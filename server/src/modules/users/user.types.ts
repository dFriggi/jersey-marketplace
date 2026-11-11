export const USER_ROLES = ["USER", "MEDIATOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];

// user como resto do sistema enxerga
export interface User {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  createdAt: Date;
}
