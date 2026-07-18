'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface HistoricalModeContextType {
  // Current state
  isHistoricalMode: boolean;
  bypassHistoricalMode: boolean;
  currentPatient: string | null;
  loading: boolean;
  
  // Actions
  toggleHistoricalMode: () => void;
  setBypassHistoricalMode: (value: boolean) => void;
  setCurrentPatient: (patientId: string) => void;
  
  // Enhanced methods
  loadPatientSettings: (patientId: string) => Promise<void>;
  savePatientSettings: (patientId: string, bypass: boolean) => Promise<void>;
  getEffectiveMode: () => 'historical' | 'active' | 'bypassed';
}

const HistoricalModeContext = createContext<HistoricalModeContextType | undefined>(undefined);

export function HistoricalModeProvider({ children }: { children: ReactNode }) {
  const [isHistoricalMode, setIsHistoricalMode] = useState(false);
  const [bypassHistoricalMode, setBypassHistoricalMode] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleHistoricalMode = () => {
    setIsHistoricalMode(prev => !prev);
  };

  // Load patient-specific settings
  const loadPatientSettings = async (patientId: string) => {
    if (!patientId) return;
    
    setLoading(true);
    try {
      const { supabase } = await import('../lib/supabase');
      
      const { data, error } = await supabase
        .from('historical_mode_settings')
        .select('bypass_historical_mode')
        .eq('patient_id', patientId)
        .eq('clerk_user_id', 'system-migration-placeholder') // Match the placeholder
        .maybeSingle(); // Use maybeSingle instead of single to avoid 406
      
      if (error) {
        console.error('Error loading patient settings:', error);
        // Don't throw error for 406, just use default value
        if (error.code !== 'PGRST116') { // Not found error
          console.warn('Using default bypass setting due to error:', error.message);
        }
      }
      
      const bypassValue = data?.bypass_historical_mode ?? false;
      // Only update if value actually changed to prevent infinite loops
      setBypassHistoricalMode(prev => {
        if (prev !== bypassValue) {
          setCurrentPatient(patientId);
          return bypassValue;
        }
        return prev;
      });
    } catch (error) {
      console.error('Unexpected error loading patient settings:', error);
      setBypassHistoricalMode(false);
    } finally {
      setLoading(false);
    }
  };

  // Save patient-specific settings (global across all users)
  const savePatientSettings = async (patientId: string, bypass: boolean) => {
    if (!patientId) return;
    
    setLoading(true);
    try {
      const { supabase } = await import('../lib/supabase');
      
      // Use UPSERT to handle both insert and update in one atomic operation
      console.log('Attempting to save patient setting:', { patientId, bypass });
      
      const { error } = await supabase
        .from('historical_mode_settings')
        .upsert({
          patient_id: patientId,
          clerk_user_id: 'system-migration-placeholder', // Consistent placeholder
          bypass_historical_mode: bypass,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'patient_id,clerk_user_id' // Specify the unique constraint columns
        });
      
      console.log('Upsert result:', { error, patientId });
      
      if (error) {
        console.error('Error saving patient setting:', error);
        
        // If it's still a duplicate key error, try to clean up and retry
        if (error.code === '23505') {
          console.log('Duplicate key detected, attempting cleanup...');
          
          // Delete any existing duplicates and retry
          const { error: deleteError } = await supabase
            .from('historical_mode_settings')
            .delete()
            .eq('patient_id', patientId)
            .eq('clerk_user_id', 'system-migration-placeholder');
          
          if (deleteError) {
            console.error('Error cleaning up duplicates:', deleteError);
            throw deleteError;
          }
          
          // Retry the upsert after cleanup
          const { error: retryError } = await supabase
            .from('historical_mode_settings')
            .upsert({
              patient_id: patientId,
              clerk_user_id: 'system-migration-placeholder',
              bypass_historical_mode: bypass,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'patient_id,clerk_user_id'
            });
          
          if (retryError) {
            console.error('Error on retry:', retryError);
            throw retryError;
          }
        } else {
          throw error;
        }
      }
      
      // Only update if value actually changed to prevent infinite loops
      setBypassHistoricalMode(prev => {
        if (prev !== bypass) {
          return bypass;
        }
        return prev;
      });
    } catch (error) {
      console.error('Unexpected error saving patient settings:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // Get effective mode for current patient
  const getEffectiveMode = (): 'historical' | 'active' | 'bypassed' => {
    if (!currentPatient) return 'active';
    if (!isHistoricalMode) return 'active';
    return bypassHistoricalMode ? 'bypassed' : 'historical';
  };

  return (
    <HistoricalModeContext.Provider value={{ 
      isHistoricalMode, 
      toggleHistoricalMode, 
      bypassHistoricalMode, 
      setBypassHistoricalMode, 
      setCurrentPatient, 
      currentPatient,
      loading,
      loadPatientSettings,
      savePatientSettings,
      getEffectiveMode
    }}>
      {children}
    </HistoricalModeContext.Provider>
  );
}

export function useHistoricalMode() {
  const context = useContext(HistoricalModeContext);
  if (context === undefined) {
    throw new Error('useHistoricalMode must be used within a HistoricalModeProvider');
  }
  return context;
}
