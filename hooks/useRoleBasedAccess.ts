'use client';

import { useUser } from '@clerk/nextjs';

export interface RolePermissions {
  canViewDashboard: boolean;
  canViewPatients: boolean;
  canCreatePatients: boolean;
  canViewPatientPreview: boolean;
  canViewOdontogram: boolean;
  canViewTreatments: boolean;
  canViewCompletedTreatments: boolean;
  canViewConsentimientos: boolean;
  canViewMenuNavegacion: boolean;
  canManageDoctores: boolean;
  // Tech support specific permissions
  canViewTickets: boolean;
  canManageTickets: boolean;
  canViewSystemLogs: boolean;
  canAccessAllUserData: boolean;
  canManageSystemSettings: boolean;
  // User management permissions
  canViewUsers: boolean;
  canManageUsers: boolean;
  canCreateUser: boolean;
  canEditUser: boolean;
  canDeleteUser: boolean;
}

const rolePermissions: Record<string, RolePermissions> = {
  tech_support: {
    // Superuser permissions - above admin
    canViewDashboard: true,
    canViewPatients: true,
    canCreatePatients: true,
    canViewPatientPreview: true,
    canViewOdontogram: true,
    canViewTreatments: true,
    canViewCompletedTreatments: true,
    canViewConsentimientos: true,
    canViewMenuNavegacion: true,
    canManageDoctores: true,
    // Tech support specific permissions
    canViewTickets: true,
    canManageTickets: true,
    canViewSystemLogs: true,
    canAccessAllUserData: true,
    canManageSystemSettings: true,
    // User management permissions
    canViewUsers: true,
    canManageUsers: true,
    canCreateUser: true,
    canEditUser: true,
    canDeleteUser: true,
  },
  admin: {
    // Admin permissions - clinic paperwork and reporting
    canViewDashboard: true,
    canViewPatients: true,
    canCreatePatients: true,
    canViewPatientPreview: true,
    canViewOdontogram: true,
    canViewTreatments: true,
    canViewCompletedTreatments: true,
    canViewConsentimientos: true,
    canViewMenuNavegacion: true,
    canManageDoctores: true, // Admin can manage doctors
    // User management removed - now tech support only
    canManageUsers: false,
    // Tech support permissions (limited for admin)
    canViewTickets: false,
    canManageTickets: false,
    canViewSystemLogs: false,
    canAccessAllUserData: false,
    canManageSystemSettings: false,
    // User management permissions (disabled for admin)
    canViewUsers: false,
    canCreateUser: false,
    canEditUser: false,
    canDeleteUser: false,
  },
  doctor: {
    canViewDashboard: true,
    canViewPatients: true,
    canCreatePatients: true,
    canViewPatientPreview: true,
    canViewOdontogram: true,
    canViewTreatments: true,
    canViewCompletedTreatments: true,
    canViewConsentimientos: true,
    canViewMenuNavegacion: true,
    canManageDoctores: true,
    canManageUsers: false,
    // Tech support permissions (disabled for doctor)
    canViewTickets: false,
    canManageTickets: false,
    canViewSystemLogs: false,
    canAccessAllUserData: false,
    canManageSystemSettings: false,
    // User management permissions (disabled for doctor)
    canViewUsers: false,
    canCreateUser: false,
    canEditUser: false,
    canDeleteUser: false,
  },
  staff: {
    canViewDashboard: false, // Hide dashboard from staff
    canViewPatients: true,
    canCreatePatients: true, // Allow staff to create patients for basic data entry
    canViewPatientPreview: true,
    canViewOdontogram: true, // Allow staff to view dental charts (read-only)
    canViewTreatments: false,
    canViewCompletedTreatments: true,
    canViewConsentimientos: true, // Allow staff to manage consent forms
    canViewMenuNavegacion: true,
    canManageDoctores: true,
    canManageUsers: false,
    // Tech support permissions (disabled for staff)
    canViewTickets: false,
    canManageTickets: false,
    canViewSystemLogs: false,
    canAccessAllUserData: false,
    canManageSystemSettings: false,
    // User management permissions (disabled for staff)
    canViewUsers: false,
    canCreateUser: false,
    canEditUser: false,
    canDeleteUser: false,
  },
};

export function useRoleBasedAccess() {
  const { user, isLoaded } = useUser();
  
  // Ensure fresh data for each render - no caching issues
  if (!isLoaded || !user) {
    return {
      userRole: 'staff',
      permissions: rolePermissions.staff,
      hasPermission: () => false,
    };
  }
  
  // Use the same metadata source as middleware
  const userRole = user?.publicMetadata?.role as string || 'staff';
  
  const permissions = rolePermissions[userRole] || rolePermissions.staff;
  
  return {
    userRole,
    permissions,
    hasPermission: (permission: keyof RolePermissions) => permissions[permission],
  };
}

export function canAccessRoute(userRole: string, pathname: string): boolean {
  // Tech support has access to everything - no restrictions
  if (userRole === 'tech_support') {
    return true;
  }
  
  // Admin has access to everything except tech support and user management routes
  if (userRole === 'admin') {
    // Block admin from accessing tech support specific routes
    if (pathname.startsWith('/tech-support') || 
        pathname.startsWith('/tickets') || 
        pathname.startsWith('/system-logs') || 
        pathname.startsWith('/system-settings')) {
      return false;
    }
    // Allow admin to access everything else (including their own pages)
    return true;
  }

  // Doctor has limited access - only clinical functions
  if (userRole === 'doctor') {
    // Block doctors from user management
    if (pathname.startsWith('/doctores') || 
        pathname.startsWith('/admin/users') ||
        pathname.startsWith('/tech-support/users')) {
      return false;
    }
  }

  // Staff has very limited access - daily tasks only
  if (userRole === 'staff') {
    // Block staff from admin and tech support routes
    if (pathname.startsWith('/admin/') || 
        pathname.startsWith('/tech-support/') ||
        pathname.startsWith('/tickets') ||
        pathname.startsWith('/system-logs') ||
        pathname.startsWith('/system-settings')) {
      return false;
    }
    // Block staff from user management
    if (pathname.startsWith('/doctores') || 
        pathname.startsWith('/admin/users') ||
        pathname.startsWith('/tech-support/users')) {
      return false;
    }
    // Block staff from sensitive clinical functions
    if (pathname.startsWith('/xray-viewer') ||
        pathname === '/tratamientos' || // Block only main treatments page, not completed
        pathname === '/reports' || 
        pathname === '/reportes') { // Block staff from reports (both English and Spanish)
      return false;
    }
    // Staff can access odontogram for viewing dental charts (read-only)
    // Note: odontogram will be view-only for staff users
    // Staff can access dashboard (view-only)
    // Note: Dashboard will show limited information for staff users
    // if (pathname === '/dashboard') {
    //   return false;
    // }
  }

  const permissions = rolePermissions[userRole] || rolePermissions.staff;
  
  // Map routes to permissions
  const routePermissionMap: Record<string, keyof RolePermissions> = {
    '/dashboard': 'canViewDashboard',
    '/pacientes': 'canViewPatients',
    '/patient-form': 'canCreatePatients',
    '/patient-preview': 'canViewPatientPreview',
    '/odontogram': 'canViewOdontogram',
    '/tratamientos': 'canViewTreatments',
    '/tratamientos-completados': 'canViewCompletedTreatments',
    '/consentimientos': 'canViewConsentimientos',
    '/menu-navegacion': 'canViewMenuNavegacion',
    '/doctores': 'canManageDoctores',
    '/patient-follow-up': 'canViewCompletedTreatments',
    '/patient-follow-up-status': 'canViewCompletedTreatments',
    '/reports': 'canViewDashboard', // Reports use dashboard permission
    '/reportes': 'canViewDashboard', // Spanish reports route also uses dashboard permission
    '/admin': 'canManageUsers',
    '/admin/users': 'canManageUsers',
    '/tech-support/users': 'canManageUsers',
    // Tech support routes
    '/tickets': 'canViewTickets',
    '/tech-support': 'canViewTickets',
    '/system-logs': 'canViewSystemLogs',
    '/system-settings': 'canManageSystemSettings',
  };

  // Check exact match first
  if (routePermissionMap[pathname]) {
    return permissions[routePermissionMap[pathname]];
  }

  // Check prefix matches
  for (const [route, permission] of Object.entries(routePermissionMap)) {
    if (pathname.startsWith(route + '/')) {
      return permissions[permission];
    }
  }

  return false;
}
