'use client';

import React, { useState, useEffect } from 'react';
import { CalendarInviteesService } from '../../services/calendarInviteesService';
import { UserAvatar, RoleBadge } from './UserComponents';

interface User {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role?: string;
}

interface UserSelectProps {
  selectedUsers: User[];
  onUsersChange: (users: User[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const UserSelect: React.FC<UserSelectProps> = ({ 
  selectedUsers, 
  onUsersChange, 
  placeholder = "Seleccionar usuarios...",
  disabled = false 
}) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const allUsers = await CalendarInviteesService.getAllUsers();
      setUsers(allUsers);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchQuery.toLowerCase();
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    const email = (user.email || '').toLowerCase();
    const role = (user.role || '').toLowerCase();
    
    return fullName.includes(searchLower) || email.includes(searchLower) || role.includes(searchLower);
  });

  const handleUserSelect = (user: User) => {
    if (!selectedUsers.find(selected => selected.id === user.id)) {
      onUsersChange([...selectedUsers, user]);
    }
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleRemoveUser = (userId: string) => {
    onUsersChange(selectedUsers.filter(user => user.id !== userId));
  };

  const getDisplayName = (user: User) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user.email || 'Usuario sin nombre';
  };

  const getInitials = (user: User) => {
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    if (user.first_name) {
      return user.first_name[0].toUpperCase();
    }
    if (user.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  const getRoleColor = (role?: string) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
      case 'doctor':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'staff':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
        <span className="text-sm text-gray-500 dark:text-gray-400">Cargando usuarios...</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected Users */}
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedUsers.map((user, index) => (
          <div
            key={`selected-${user.id || user.email || `index-${index}`}`}
            className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-sm"
          >
            <div className="flex items-center space-x-2">
              <UserAvatar user={user} size="sm" />
              <span className="text-gray-800 dark:text-gray-200">
                {getDisplayName(user)}
              </span>
              {user.role && <RoleBadge role={user.role} />}
            </div>
            <button
              type="button"
              onClick={() => handleRemoveUser(user.id)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              disabled={disabled}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled || loading}
          className="w-full px-3 py-2 text-left border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {selectedUsers.length === 0 ? (
            <span className="text-gray-500 dark:text-gray-400">{placeholder}</span>
          ) : (
            <span className="text-gray-900 dark:text-gray-100">
              {selectedUsers.length} usuario(s) seleccionado(s)
            </span>
          )}
          <svg
            className={`absolute right-3 top-2.5 h-5 w-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-hidden">
            {/* Search Input */}
            <div className="p-2 border-b border-gray-200 dark:border-gray-600">
              <input
                type="text"
                placeholder="Buscar usuarios..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-gray-100"
                autoFocus
              />
            </div>

            {/* User List */}
            <div className="max-h-48 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <div className="p-3 text-center text-gray-500 dark:text-gray-400">
                  No se encontraron usuarios
                </div>
              ) : (
                filteredUsers.map((user, index) => {
                  const isSelected = selectedUsers.find(selected => selected.id === user.id);
                  return (
                    <button
                      key={`dropdown-${user.id || user.email || `index-${index}`}`}
                      type="button"
                      onClick={() => handleUserSelect(user)}
                      disabled={!!isSelected}
                      className={`w-full px-3 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 ${
                        isSelected ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <UserAvatar user={user} size="sm" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {getDisplayName(user)}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {user.email}
                        </div>
                      </div>
                      {user.role && <RoleBadge role={user.role} />}
                      {isSelected && (
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
