'use client';

import React from 'react';
import { useUser, UserButton } from '@clerk/nextjs';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { HistoricalModeProvider } from '@/contexts/HistoricalModeContext';
import { BellNotificationProvider } from '@/contexts/BellNotificationContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { TutorialProvider } from '@/contexts/TutorialContext';
import { PushAutoSubscribe } from '@/components/notifications/PushAutoSubscribe';
import { NotificationListenerWrapper } from '@/components/notifications/NotificationListenerWrapper';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded: userLoaded } = useUser();

  return (
    <TutorialProvider>
      <ThemeProvider>
        <HistoricalModeProvider>
          <NotificationProvider>
            <BellNotificationProvider>
              <PushAutoSubscribe />
              <NotificationListenerWrapper>
                {userLoaded && user ? (
                  <div className="flex h-screen bg-gray-100">
                    <div className="flex-1 flex flex-col">
                      <header className="bg-white shadow-sm border-b border-gray-200 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <h1 className="text-xl font-bold text-gray-900">
                              Diamond Calendar
                            </h1>
                          </div>
                          <div className="flex items-center space-x-3">
                            <div className="hidden sm:block text-right">
                              <p className="text-sm font-semibold text-gray-900">
                                {user?.firstName || 'Usuario'} {user?.lastName || ''}
                              </p>
                              <p className="text-xs text-gray-500">
                                {user?.emailAddresses?.[0]?.emailAddress || ''}
                              </p>
                            </div>
                            <UserButton
                              appearance={{
                                elements: {
                                  avatarBox: "w-8 h-8 lg:w-10 lg:h-10 shadow-md",
                                }
                              }}
                            />
                          </div>
                        </div>
                      </header>
                      <main className="flex-1 overflow-auto">
                        {children}
                      </main>
                    </div>
                  </div>
                ) : (
                  children
                )}
              </NotificationListenerWrapper>
            </BellNotificationProvider>
          </NotificationProvider>
        </HistoricalModeProvider>
      </ThemeProvider>
    </TutorialProvider>
  );
}
