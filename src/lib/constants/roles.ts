export const Roles = {
  ADMIN: "ADMIN",
  BM: "BM",
  WM: "WM",
  INV: "INV",
} as const;

export type RoleCode = typeof Roles[keyof typeof Roles];