'use client';

import { useUser } from '@clerk/nextjs';

export type UserRole = 'admin' | 'doctor' | 'staff' | 'tech_support';

export function useUserRole() {
  const { user, isLoaded } = useUser();
  
  // Ensure fresh data for each render - no caching issues
  if (!isLoaded || !user) {
    return {
      userRole: undefined,
      userId: undefined,
      isLoaded,
      isAdmin: false,
      isDoctor: false,
      isStaff: false,
      isTechSupport: false,
      hasRole: false,
    };
  }
  
  // Get role from user object public metadata
  const userRole = user?.publicMetadata?.role as UserRole | undefined;
  
  return {
    userRole,
    userId: user?.id,
    isLoaded,
    isAdmin: userRole === 'admin',
    isDoctor: userRole === 'doctor',
    isStaff: userRole === 'staff',
    isTechSupport: userRole === 'tech_support',
    hasRole: !!userRole,
  };
}

// Permission checking functions
export const permissions = {
  canAccessPayments: (role: UserRole | undefined) => role === 'admin',
  canAccessBudgets: (role: UserRole | undefined) => role === 'admin',
  canAccessReports: (role: UserRole | undefined) => role === 'admin',
  canAccessSettings: (role: UserRole | undefined) => role === 'admin',
  canAccessPatientRecords: (role: UserRole | undefined) => ['admin', 'doctor'].includes(role || ''),
  canManageTreatments: (role: UserRole | undefined) => ['admin', 'doctor', 'staff'].includes(role || ''),
  canManagePatients: (role: UserRole | undefined) => ['admin', 'doctor', 'staff'].includes(role || ''),
  // Tech support permissions
  canAccessUserManagement: (role: UserRole | undefined) => role === 'tech_support',
  canAccessSystemSettings: (role: UserRole | undefined) => role === 'tech_support',
  canAccessTechSupport: (role: UserRole | undefined) => role === 'tech_support',
};
