export const USER_ROLES = ["USER", "MEDIATOR"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const INITIAL_REPUTATION = 100;

// user como resto do sistema enxerga
export interface User {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  reputationScore: number;
  createdAt: Date;
}
