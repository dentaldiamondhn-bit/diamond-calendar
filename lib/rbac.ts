import { UserRole } from '@/types/ticket';

export const PERMISSIONS = {
  CLOSE_SYSTEM_TICKET: [UserRole.TECH_SUPPORT, UserRole.ADMIN],
  CLOSE_TICKET: [UserRole.ADMIN, UserRole.TECH_SUPPORT, UserRole.DOCTOR],
  CREATE_TICKET: [UserRole.STAFF, UserRole.DOCTOR, UserRole.ADMIN, UserRole.TECH_SUPPORT],
  ASSIGN_TASKS: [UserRole.DOCTOR, UserRole.ADMIN, UserRole.TECH_SUPPORT],
  DELETE_TICKET: [UserRole.ADMIN, UserRole.TECH_SUPPORT],
  VIEW_ALL_DEPARTMENTS: [UserRole.ADMIN, UserRole.TECH_SUPPORT, UserRole.DOCTOR],
  CREATE_PATIENT_CASE: [UserRole.DOCTOR, UserRole.ADMIN, UserRole.TECH_SUPPORT],
  VIEW_SYSTEM_LOGS: [UserRole.ADMIN, UserRole.TECH_SUPPORT],
  MANAGE_USERS: [UserRole.ADMIN],
  MANAGE_ROLES: [UserRole.ADMIN],
  ACCESS_TECH_SUPPORT: [UserRole.TECH_SUPPORT, UserRole.ADMIN],
  ACCESS_FINANCIAL_REPORTS: [UserRole.ADMIN],
  MODIFY_SYSTEM_SETTINGS: [UserRole.ADMIN],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function checkPermission(userRole: UserRole, permission: Permission): boolean {
  return PERMISSIONS[permission].includes(userRole as any);
}

export function requirePermission(userRole: UserRole, permission: Permission): void {
  if (!checkPermission(userRole, permission)) {
    throw new Error(`Access denied: ${permission} requires one of these roles: ${PERMISSIONS[permission].join(', ')}`);
  }
}

export function getPermissionsForRole(userRole: UserRole): Permission[] {
  return Object.keys(PERMISSIONS).filter(permission => 
    checkPermission(userRole, permission as Permission)
  ) as Permission[];
}
