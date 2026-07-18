'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CalendarView, CalendarEventWithPatient } from '../../types/calendar';
import { CalendarTaskWithPatient } from '../../types/calendarTasks';
import calendarRealtimeService, { CalendarRealtimeNotification } from '../../services/calendarRealtimeService';
import { CalendarService } from '../../services/calendarService';
import { CalendarTaskService } from '../../services/calendarTaskService';
import { CapacitorNotificationService } from '../../services/capacitorNotificationService';
import { useBellNotifications } from '../../contexts/BellNotificationContext';
import { EventModal } from './EventModal';
import { TaskModal } from './TaskModal';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, parseISO, getHours, getMinutes } from 'date-fns';
import { es } from 'date-fns/locale';
import { SimpleTimezoneFix } from '../../services/simpleTimezoneFix';

interface CalendarProps {
  userId: string;
  userRole?: string;
}

export const Calendar: React.FC<CalendarProps> = ({ userId, userRole }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<CalendarView['type']>('month');
  const [events, setEvents] = useState<CalendarEventWithPatient[]>([]);
  const [tasks, setTasks] = useState<CalendarTaskWithPatient[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventWithPatient | null>(null);
  const [selectedTask, setSelectedTask] = useState<CalendarTaskWithPatient | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [notifications, setNotifications] = useState<CalendarRealtimeNotification[]>([]);
  const [showAgenda, setShowAgenda] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<CalendarEventWithPatient | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<Date | null>(null);
  const [quickAddType, setQuickAddType] = useState<'event' | 'task' | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Bell notification hook for Android tray notifications
  const { addNotification: addBellNotification } = useBellNotifications();

  // Helper function to format date for display with timezone fix
  const formatEventDate = (dateString: string): Date => {
    try {
      const utcDate = new Date(dateString);
      // Convert UTC to local time using timezone fix
      return new Date(utcDate.getTime() + utcDate.getTimezoneOffset() * 60000);
    } catch (error) {
      console.error('Error formatting event date:', error);
      return new Date(dateString);
    }
  };

  useEffect(() => {
    loadEvents();
    loadTasks();
  }, [currentDate, view]);

  // Real-time updates and notifications
  useEffect(() => {
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Subscribe to real-time notifications
    const unsubscribeNotifications = calendarRealtimeService.onNotification(async (notification: CalendarRealtimeNotification) => {
      console.log('🔔 CALENDAR NOTIFICATION RECEIVED:', {
        notification,
        currentUserId: userId,
        notificationUserId: notification.userId,
        shouldShow: notification.userId === userId
      });
      
      // Show notification for ALL users (remove filtering to debug)
      // Add notification to state
      setNotifications(prev => [...prev.slice(-4), notification]); // Keep max 5 notifications
      
      // Show browser notification with better permission handling
      if (Notification.permission === 'granted') {
        const notificationOptions: NotificationOptions = {
          body: notification.message,
          icon: '/Logo.svg', // Use proper logo
          badge: '/Logo.svg', // Use proper logo for badge
          tag: notification.type,
          requireInteraction: true, // Require interaction for calendar notifications
          silent: false
        };

        // Add timestamp for events/tasks
        if (notification.data.start_date || notification.data.due_date) {
          const eventDate = notification.data.start_date || notification.data.due_date;
          if (eventDate) {
            (notificationOptions as any).timestamp = new Date(eventDate).getTime();
          }
        }

        // Create browser notification
        try {
          const browserNotification = new Notification(notification.title, notificationOptions);
          
          // Auto-close notification after 8 seconds
          setTimeout(() => {
            browserNotification.close();
          }, 8000);
          
          console.log('✅ Browser notification created for invitee:', {
            title: notification.title,
            body: notification.message,
            userId: notification.userId
          });
        } catch (error) {
          console.error('❌ Error creating browser notification:', error);
        }

        // Also trigger Capacitor notification for mobile devices (non-blocking)
        try {
          const capacitorService = CapacitorNotificationService.getInstance();
          capacitorService.sendLocalNotification({
            id: `calendar-${notification.type}-${Date.now()}`,
            title: notification.title,
            body: notification.message,
            icon: '/Logo.svg',
            tag: notification.type,
            data: {
              type: notification.type,
              userId: notification.userId,
              eventId: notification.data.item_id,
              timestamp: notification.timestamp
            }
          }).catch(error => {
            console.error('❌ Error creating Capacitor notification:', error);
          });
          console.log('📱 Capacitor notification sent for invitee:', {
            title: notification.title,
            body: notification.message,
            userId: notification.userId
          });
        } catch (error) {
          console.error('❌ Error creating Capacitor notification:', error);
        }

        // Also add to Bell notification system for Android tray notifications
        try {
          await addBellNotification({
            type: 'calendar_event',
            title: notification.title,
            message: notification.message,
            metadata: {
              userId: notification.userId,
              eventId: notification.data.item_id,
              eventTitle: notification.data.title || notification.title,
              eventTime: notification.data.start_date ? new Date(notification.data.start_date) : undefined
            }
          });
          console.log('🔔 Bell notification added for invitee:', {
            title: notification.title,
            userId: notification.userId
          });
        } catch (error) {
          console.error('❌ Error adding Bell notification:', error);
        }
      } else if (Notification.permission === 'default') {
        // Request permission if not yet granted
        Notification.requestPermission().then(permission => {
          if (permission === 'granted') {
            console.log('🔔 Notification permission granted for invitee notifications');
            // Retry notification creation
            setTimeout(() => {
              const retryOptions: NotificationOptions = {
                body: notification.message,
                icon: '/Logo.svg',
                badge: '/Logo.svg',
                tag: notification.type,
                requireInteraction: true,
                silent: false
              };
              new Notification(notification.title, retryOptions);
            }, 500);
          }
        });
      } else {
        console.warn('⚠️ Notification permission denied for invitee notifications');
      }

      // Auto-remove notification after 8 seconds
      setTimeout(() => {
        setNotifications(prev => prev.slice(1));
      }, 8000);

      // Always reload data to ensure instant updates
      if (notification.type.includes('event')) {
        console.log('🔄 Refreshing events due to event notification:', notification.type);
        loadEvents();
      } else if (notification.type.includes('task')) {
        console.log('🔄 Refreshing tasks due to task notification:', notification.type);
        loadTasks();
      } else if (notification.type === 'invitee_added') {
        console.log('🔄 Refreshing events due to invitee notification');
        loadEvents(); // Refresh events when invitee is added
        // Also force a more aggressive refresh after a short delay
        setTimeout(() => {
          console.log('🔄 Force refreshing events again for invitee');
          loadEvents();
        }, 1000);
      }
    });

    // Subscribe to event updates for instant refresh
    const unsubscribeEventUpdates = calendarRealtimeService.onEventUpdate((update) => {
      // Always refresh to ensure instant updates
      console.log('📅 Calendar event update received:', {
        table: update.table,
        type: update.type,
        recordId: update.record?.id,
        userId: userId
      });
      
      if (update.table === 'calendar_events') {
        // Refresh events for any calendar_events update
        console.log('🔄 Refreshing events due to calendar_events update');
        loadEvents();
      } else if (update.table === 'calendar_tasks') {
        // Refresh tasks for any calendar_tasks update
        console.log('🔄 Refreshing tasks due to calendar_tasks update');
        loadTasks();
      }
      
      // Also refresh if this might be an invitee-related update
      if (update.record?.id && (update.type === 'UPDATE' || update.type === 'INSERT')) {
        console.log('🔄 Potential invitee update, refreshing events');
        loadEvents();
      }
    });

    return () => {
      unsubscribeNotifications();
      unsubscribeEventUpdates();
    };
  }, [userId]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      switch (view) {
        case 'month':
          startDate = startOfMonth(currentDate);
          endDate = endOfMonth(currentDate);
          break;
        case 'week':
          startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
          endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
          break;
        case 'day':
          startDate = new Date(currentDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(currentDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          startDate = startOfMonth(currentDate);
          endDate = endOfMonth(currentDate);
      }

      const eventsData = await CalendarService.getEventsByDateRange(
        startDate.toISOString(),
        endDate.toISOString(),
        userId
      );
      setEvents(eventsData);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      let startDate: Date;
      let endDate: Date;

      switch (view) {
        case 'month':
          startDate = startOfMonth(currentDate);
          endDate = endOfMonth(currentDate);
          break;
        case 'week':
          startDate = startOfWeek(currentDate, { weekStartsOn: 1 });
          endDate = endOfWeek(currentDate, { weekStartsOn: 1 });
          break;
        case 'day':
          startDate = new Date(currentDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(currentDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        default:
          startDate = startOfMonth(currentDate);
          endDate = endOfMonth(currentDate);
      }

      const tasksData = await CalendarTaskService.getTasksByDateRange(
        startDate.toISOString(),
        endDate.toISOString(),
        userId
      );
      setTasks(tasksData);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEventClick = (event: CalendarEventWithPatient) => {
    setSelectedEvent(event);
    setShowEventModal(true);
  };

  const handleTaskClick = (task: CalendarTaskWithPatient) => {
    setSelectedTask(task);
    setShowTaskModal(true);
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setSelectedEvent(null);
    setSelectedTask(null);
    setShowEventModal(true);
  };

  const handleEventSave = (eventType: 'created' | 'updated' = 'created', eventData?: any) => {
    loadEvents();
    setSelectedEvent(null);
  };

  const handleTaskSave = (taskType: 'created' | 'updated' = 'created', taskData?: any) => {
    loadTasks();
    setSelectedTask(null);
  };

  const navigatePrevious = () => {
    switch (view) {
      case 'month':
        setCurrentDate(subMonths(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(addDays(currentDate, -7));
        break;
      case 'day':
        setCurrentDate(addDays(currentDate, -1));
        break;
    }
  };

  const navigateNext = () => {
    switch (view) {
      case 'month':
        setCurrentDate(addMonths(currentDate, 1));
        break;
      case 'week':
        setCurrentDate(addDays(currentDate, 7));
        break;
      case 'day':
        setCurrentDate(addDays(currentDate, 1));
        break;
    }
  };

  const getEventsForDate = (date: Date) => {
    return events.filter(event => {
      const eventStart = formatEventDate(event.start_date);
      const eventEnd = formatEventDate(event.end_date);
      return isSameDay(date, eventStart) || isSameDay(date, eventEnd) || 
             (date > eventStart && date < eventEnd);
    });
  };

  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => {
      if (!task.due_date) return false;
      const taskDue = formatEventDate(task.due_date);
      return isSameDay(date, taskDue);
    });
  };

  const getEventTypeColor = (eventType: string, alpha: number = 1) => {
    const colors: Record<string, string> = {
      appointment: `rgba(59, 130, 246, ${alpha})`,
      consultation: `rgba(16, 185, 129, ${alpha})`,
      surgery: `rgba(244, 63, 94, ${alpha})`,
      follow_up: `rgba(245, 158, 11, ${alpha})`,
      reminder: `rgba(139, 92, 246, ${alpha})`,
      other: `rgba(107, 114, 128, ${alpha})`,
    };
    return colors[eventType] || colors.other;
  };

  const getTaskCategoryColor = (category: string, alpha: number = 1) => {
    const colors: Record<string, string> = {
      admin: `rgba(99, 102, 241, ${alpha})`,
      clinical: `rgba(20, 184, 166, ${alpha})`,
      follow_up: `rgba(249, 115, 22, ${alpha})`,
      documentation: `rgba(236, 72, 153, ${alpha})`,
      other: `rgba(107, 114, 128, ${alpha})`,
    };
    return colors[category] || colors.other;
  };

  const getEventTypeLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      appointment: 'Cita',
      consultation: 'Consulta',
      surgery: 'Cirugía',
      follow_up: 'Seguimiento',
      reminder: 'Recordatorio',
      other: 'Otro',
    };
    return labels[eventType] || labels.other;
  };

  const getPriorityIndicator = (priority: string) => {
    switch (priority) {
      case 'high':
        return { color: '#ef4444', label: 'Alta' };
      case 'medium':
        return { color: '#f59e0b', label: 'Media' };
      case 'low':
        return { color: '#10b981', label: 'Baja' };
      default:
        return { color: '#6b7280', label: 'Normal' };
    }
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days = [];
    let day = startDate;

    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }

    const weekDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const shortWeekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    return (
      <div className="flex flex-col h-full">
        {/* Google Calendar Style Header */}
        <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
          {shortWeekDays.map((day, index) => (
            <div key={day} className="py-3 text-center text-sm font-medium text-gray-500 dark:text-gray-400">
              {day}
            </div>
          ))}
        </div>
        
        {/* Calendar Grid */}
        <div className="flex-1 grid grid-cols-7 auto-rows-fr">
          {days.map((date, index) => {
            const dayEvents = getEventsForDate(date);
            const dayTasks = getTasksForDate(date);
            const isCurrentMonth = isSameMonth(date, currentDate);
            const isToday = isSameDay(date, new Date());

            return (
              <div
                key={index}
                className={`min-h-[100px] sm:min-h-[120px] border-b border-r border-gray-200 dark:border-gray-700 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                  !isCurrentMonth ? 'bg-gray-50 dark:bg-gray-900/30' : 'bg-white dark:bg-gray-900'
                } ${isToday ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}`}
                onClick={() => handleDateClick(date)}
              >
                <div className="p-2">
                  <div className={`inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full ${
                    isToday 
                      ? 'bg-blue-500 text-white' 
                      : isCurrentMonth 
                        ? 'text-gray-700 dark:text-gray-300' 
                        : 'text-gray-400 dark:text-gray-600'
                  }`}>
                    {format(date, 'd')}
                  </div>
                  
                  {/* Events */}
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 3).map((event, eventIndex) => (
                      <div
                        key={`event-${eventIndex}`}
                        className="group flex items-center gap-1 px-2 py-1 rounded text-xs text-white cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: getEventTypeColor(event.event_type) }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEventClick(event);
                        }}
                      >
                        <div 
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0" 
                          style={{ backgroundColor: getPriorityIndicator(event.priority).color }}
                        />
                        <span className="truncate font-medium">{event.title}</span>
                      </div>
                    ))}
                    {dayTasks.slice(0, 2).map((task, taskIndex) => (
                      <div
                        key={`task-${taskIndex}`}
                        className="group flex items-center gap-1 px-2 py-1 rounded text-xs text-white cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: getTaskCategoryColor(task.category) }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTaskClick(task);
                        }}
                      >
                        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                        <span className="truncate font-medium">{task.title}</span>
                      </div>
                    ))}
                    {(dayEvents.length + dayTasks.length) > 4 && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 px-2 py-0.5 font-medium">
                        +{dayEvents.length + dayTasks.length - 4} más
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const days = [];
    
    for (let i = 0; i < 7; i++) {
      days.push(addDays(weekStart, i));
    }

    const hours = [];
    for (let hour = 0; hour < 24; hour++) {
      hours.push(hour);
    }

    const weekDays = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Header Row */}
        <div className="grid grid-cols-8 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="p-3 text-xs font-medium text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700"></div>
          {days.map((date, index) => (
            <div key={index} className="p-3 text-center border-l border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                {weekDays[index].substring(0, 3)}
              </div>
              <div className={`text-xl font-semibold mt-1 ${
                isSameDay(date, new Date()) 
                  ? 'w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto' 
                  : 'text-gray-900 dark:text-white'
              }`}>
                {format(date, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Time Grid */}
        <div className="flex-1 overflow-y-auto">
          {hours.map(hour => (
            <div key={hour} className="grid grid-cols-8 min-h-[60px]">
              <div className="p-2 text-xs text-gray-500 dark:text-gray-400 border-r border-b border-gray-200 dark:border-gray-700 text-right pr-3">
                {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
              </div>
              {days.map((date, dayIndex) => {
                const dayEvents = getEventsForDate(date).filter(event => {
                  const eventHour = formatEventDate(event.start_date).getHours();
                  return eventHour === hour;
                });
                const dayTasks = getTasksForDate(date).filter(task => {
                  if (!task.due_date) return false;
                  const taskHour = new Date(task.due_date).getHours();
                  return taskHour === hour;
                });

                return (
                  <div
                    key={dayIndex}
                    className="border-l border-b border-r border-gray-200 dark:border-gray-700 min-h-[60px] cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    onClick={() => {
                      const clickDate = new Date(date);
                      clickDate.setHours(hour, 0, 0, 0);
                      handleDateClick(clickDate);
                    }}
                  >
                    {dayEvents.map((event, eventIndex) => (
                      <div
                        key={`event-${eventIndex}`}
                        className="mx-1 my-0.5 px-2 py-1 rounded text-xs text-white cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: getEventTypeColor(event.event_type) }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEventClick(event);
                        }}
                      >
                        <div className="font-semibold truncate">{event.title}</div>
                      </div>
                    ))}
                    {dayTasks.map((task, taskIndex) => (
                      <div
                        key={`task-${taskIndex}`}
                        className="mx-1 my-0.5 px-2 py-1 rounded text-xs text-white cursor-pointer hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: getTaskCategoryColor(task.category) }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTaskClick(task);
                        }}
                      >
                        <div className="font-semibold flex items-center gap-1">
                          {task.status === 'completed' && (
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          <span className="truncate">{task.title}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dayEvents = getEventsForDate(currentDate);
    const dayTasks = getTasksForDate(currentDate);
    const hours = [];
    for (let hour = 0; hour < 24; hour++) {
      hours.push(hour);
    }

    return (
      <div className="flex flex-col h-full">
        {/* Day Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-4">
            <div className={`text-4xl font-light ${isSameDay(currentDate, new Date()) ? 'text-blue-500' : 'text-gray-900 dark:text-white'}`}>
              {format(currentDate, 'd')}
            </div>
            <div>
              <div className="text-lg font-semibold text-gray-900 dark:text-white">
                {format(currentDate, 'EEEE', { locale: es }).charAt(0).toUpperCase() + format(currentDate, 'EEEE', { locale: es }).slice(1)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {dayEvents.length} evento{dayEvents.length !== 1 ? 's' : ''} • {dayTasks.length} tarea{dayTasks.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Time Slots */}
        <div className="flex-1 overflow-y-auto">
          {hours.map(hour => {
            const hourEvents = dayEvents.filter(event => {
              const eventHour = formatEventDate(event.start_date).getHours();
              return eventHour === hour;
            });
            const hourTasks = dayTasks.filter(task => {
              if (!task.due_date) return false;
              const taskHour = new Date(task.due_date).getHours();
              return taskHour === hour;
            });

            return (
              <div key={hour} className="flex min-h-[80px] border-b border-gray-100 dark:border-gray-800">
                <div className="w-20 flex-shrink-0 p-3 text-sm text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">
                  {format(new Date().setHours(hour, 0, 0, 0), 'h a')}
                </div>
                <div className="flex-1 p-2 flex flex-col gap-2">
                  {hourEvents.map((event, eventIndex) => (
                    <div
                      key={`event-${eventIndex}`}
                      className="flex items-start gap-3 p-3 rounded-lg text-white cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                      style={{ backgroundColor: getEventTypeColor(event.event_type) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event);
                      }}
                    >
                      <div className="flex-1">
                        <div className="font-semibold">{event.title}</div>
                        <div className="text-sm opacity-90 mt-1">
                          {format(formatEventDate(event.start_date), 'h:mm a')} - {format(formatEventDate(event.end_date), 'h:mm a')}
                        </div>
                        {event.patient && (
                          <div className="text-sm opacity-90 mt-1 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                            </svg>
                            {event.patient.nombre_completo}
                          </div>
                        )}
                      </div>
                      <div 
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" 
                        style={{ backgroundColor: getPriorityIndicator(event.priority).color }}
                        title={getPriorityIndicator(event.priority).label}
                      />
                    </div>
                  ))}
                  {hourTasks.map((task, taskIndex) => (
                    <div
                      key={`task-${taskIndex}`}
                      className="flex items-start gap-3 p-3 rounded-lg text-white cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                      style={{ backgroundColor: getTaskCategoryColor(task.category) }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleTaskClick(task);
                      }}
                    >
                      <div className="flex-1">
                        <div className="font-semibold flex items-center gap-2">
                          {task.status === 'completed' && (
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {task.title}
                        </div>
                        {task.patient && (
                          <div className="text-sm opacity-90 mt-1 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                            </svg>
                            {task.patient.nombre_completo}
                          </div>
                        )}
                      </div>
                      <div 
                        className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" 
                        style={{ backgroundColor: getPriorityIndicator(task.priority).color }}
                        title={getPriorityIndicator(task.priority).label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
        {/* Google Calendar Style Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border-b border-gray-200 dark:border-gray-700 gap-4">
          {/* Title & Navigation */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={navigatePrevious}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={navigateNext}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {view === 'day' 
                ? format(currentDate, 'MMMM yyyy', { locale: es }).charAt(0).toUpperCase() + format(currentDate, 'MMMM yyyy', { locale: es }).slice(1)
                : format(currentDate, 'MMMM yyyy', { locale: es }).charAt(0).toUpperCase() + format(currentDate, 'MMMM yyyy', { locale: es }).slice(1)
              }
            </h2>
            
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors text-sm font-medium"
            >
              Hoy
            </button>
          </div>

          {/* View Switcher */}
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              {(['month', 'week', 'day'] as const).map(viewType => (
                <button
                  key={viewType}
                  onClick={() => setView(viewType)}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    view === viewType
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {viewType === 'month' ? 'Mes' : viewType === 'week' ? 'Semana' : 'Día'}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => {
                setSelectedEvent(null);
                setSelectedDate(new Date());
                setShowEventModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Evento</span>
            </button>
            <button
              onClick={() => {
                setSelectedTask(null);
                setSelectedDate(new Date());
                setShowTaskModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="hidden sm:inline">Tarea</span>
            </button>
          </div>
        </div>

        {/* Calendar Content */}
        <div className="flex-1 overflow-hidden">
          {view === 'month' && renderMonthView()}
          {view === 'week' && renderWeekView()}
          {view === 'day' && renderDayView()}
        </div>
      </div>

      {/* Event Modal */}
      <EventModal
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false);
          setSelectedEvent(null);
          setSelectedDate(null);
        }}
        event={selectedEvent}
        onSave={(event) => {
          const eventType = selectedEvent ? 'updated' : 'created';
          handleEventSave(eventType, event);
        }}
        userId={userId}
      />

      {/* Task Modal */}
      <TaskModal
        isOpen={showTaskModal}
        onClose={() => {
          setShowTaskModal(false);
          setSelectedTask(null);
          setSelectedDate(null);
        }}
        task={selectedTask}
        onSave={(task) => {
          const taskType = selectedTask ? 'updated' : 'created';
          handleTaskSave(taskType, task);
        }}
        userId={userId}
      />

      {/* Real-time Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((notification, index) => (
          <div
            key={`${notification.timestamp}-${index}`}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg animate-pulse max-w-sm"
            role="alert"
          >
            <div className="font-semibold text-sm">{notification.title}</div>
            <div className="text-xs opacity-90">{notification.message}</div>
          </div>
        ))}
      </div>
    </>
  );
};
