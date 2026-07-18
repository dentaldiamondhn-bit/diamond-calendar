// Reusable user display components extracted from tech-support users page

export const getRoleBadgeColor = (role: string) => {
  switch (role) {
    case 'admin':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-red-200 dark:border-red-700';
    case 'doctor':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-700';
    case 'staff':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-700';
    case 'tech_support':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-700';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 border-gray-200 dark:border-gray-700';
  }
};

export const getRoleText = (role: string) => {
  switch (role) {
    case 'admin': return 'Administrador';
    case 'doctor': return 'Doctor';
    case 'staff': return 'Personal';
    case 'tech_support': return 'Soporte Técnico';
    default: return 'Desconocido';
  }
};

interface UserAvatarProps {
  user: {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    role?: string;
    profileImageUrl?: string;
  };
  size?: 'sm' | 'md' | 'lg';
}

export function UserAvatar({ user, size = 'md' }: UserAvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12'
  };

  // Use profileImageUrl from API or fallback to UI Avatars
  const profileImageUrl = user.profileImageUrl;

  return (
    <img
      className={`${sizeClasses[size]} rounded-full`}
      src={profileImageUrl || `https://ui-avatars.com/api/?name=${user.first_name}+${user.last_name}&background=random&size=${size === 'sm' ? 32 : size === 'md' ? 40 : 48}`}
      alt={`${user.first_name} ${user.last_name}`}
      onError={(e) => {
        // Fallback to UI Avatars if image fails
        e.currentTarget.src = `https://ui-avatars.com/api/?name=${user.first_name}+${user.last_name}&background=random&size=${size === 'sm' ? 32 : size === 'md' ? 40 : 48}`;
      }}
    />
  );
}

interface RoleBadgeProps {
  role: string;
}

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleBadgeColor(role)}`}>
      <i className={`fas ${
        role === 'admin' ? 'fa-crown' :
        role === 'doctor' ? 'fa-user-md' : 'fa-user-tie'
      } mr-1`}></i>
      {getRoleText(role)}
    </span>
  );
}
