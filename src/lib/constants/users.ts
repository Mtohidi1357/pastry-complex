export const Users = {
  ADMIN: "ADMIN",
  INVENTORY: "INVENTORY",
  INVENTORY2: "INVENTORY2",
  MANAGER: "MANAGER",
  MANAGER2: "MANAGER2",
  WORKSHOP: "WORKSHOP"
} as const;

export type UserName = typeof Users[keyof typeof Users];