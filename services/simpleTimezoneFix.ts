// Simple timezone fix that actually works
// This addresses the one-day-behind issue directly

export class SimpleTimezoneFix {
  private static readonly CLINIC_TIMEZONE = 'America/Tegucigalpa';
  
  /**
   * Convert database date to local display - SIMPLE VERSION
   * Handles both ISO timestamps and date-only strings (YYYY-MM-DD)
   */
  static toLocalDate(dateString: string | Date): string {
    if (!dateString) return '';
    
    try {
      // Check if it's a date-only string (YYYY-MM-DD format)
      const isDateOnly = typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
      
      if (isDateOnly) {
        // For date-only strings, return as-is
        return dateString;
      }
      
      // For timestamps, convert from UTC to clinic timezone (UTC-6)
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      const utcTime = date.getTime();
      const clinicOffset = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
      const clinicDate = new Date(utcTime - clinicOffset);
      
      const year = clinicDate.getUTCFullYear();
      const month = String(clinicDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(clinicDate.getUTCDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      return typeof dateString === 'string' ? dateString : '';
    }
  }
  
  /**
   * Format date for display in Spanish - SIMPLE VERSION
   * Handles both ISO timestamps and date-only strings (YYYY-MM-DD)
   */
  static formatDisplayDate(dateString: string | Date): string {
    if (!dateString) return 'No especificada';

    try {
      // Check if it's a date-only string (YYYY-MM-DD format)
      const isDateOnly = typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString);

      let day: number, month: number, year: number;

      if (isDateOnly) {
        // For date-only strings, parse directly without timezone conversion
        const parts = dateString.split('-');
        year = parseInt(parts[0]);
        month = parseInt(parts[1]) - 1;
        day = parseInt(parts[2]);
      } else {
        // For timestamps, check if it's a date-only timestamp (midnight UTC)
        const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
        const isMidnightUTC = date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0;

        if (isMidnightUTC) {
          // Treat as date-only to avoid timezone shifting the date
          day = date.getUTCDate();
          month = date.getUTCMonth();
          year = date.getUTCFullYear();
        } else {
          // For actual timestamps with time, convert from UTC to clinic timezone (UTC-6)
          const utcTime = date.getTime();
          const clinicOffset = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
          const clinicDate = new Date(utcTime - clinicOffset);

          day = clinicDate.getUTCDate();
          month = clinicDate.getUTCMonth();
          year = clinicDate.getUTCFullYear();
        }
      }

      const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

      return `${day} de ${monthNames[month]} ${year}`;
    } catch (error) {
      return 'No especificada';
    }
  }
  
  /**
   * Format date for "Edad al momento de consulta" display (DD/MM/YYYY format)
   * Handles both ISO timestamps and date-only strings (YYYY-MM-DD)
   */
  static formatDateForConsultationAge(dateString: string | Date): string {
    if (!dateString) return '';
    
    try {
      // Check if it's a date-only string (YYYY-MM-DD format)
      const isDateOnly = typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
      
      let day: string, month: string, year: number;
      
      if (isDateOnly) {
        // For date-only strings, parse directly
        const parts = dateString.split('-');
        year = parseInt(parts[0]);
        month = parts[1];
        day = parts[2];
      } else {
        // For timestamps, convert from UTC to clinic timezone (UTC-6)
        const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
        const utcTime = date.getTime();
        const clinicOffset = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
        const clinicDate = new Date(utcTime - clinicOffset);
        
        // Format as DD/MM/YYYY
        day = String(clinicDate.getUTCDate()).padStart(2, '0');
        month = String(clinicDate.getUTCMonth() + 1).padStart(2, '0');
        year = clinicDate.getUTCFullYear();
      }
      
      return `${day}/${month}/${year}`;
    } catch (error) {
      return typeof dateString === 'string' ? dateString : '';
    }
  }
  
  /**
   * Calculate age correctly - Uses UTC methods
   */
  static calculateAge(birthDateString: string): number {
    if (!birthDateString) return 0;
    
    try {
      const birthDate = new Date(birthDateString);
      const today = new Date();
      
      // Use UTC components to avoid local timezone offset issues
      const birthYear = birthDate.getUTCFullYear();
      const todayYear = today.getUTCFullYear();
      const birthMonth = birthDate.getUTCMonth();
      const todayMonth = today.getUTCMonth();
      const birthDay = birthDate.getUTCDate();
      const todayDay = today.getUTCDate();
      
      let age = todayYear - birthYear;
      const monthDiff = todayMonth - birthMonth;
      
      if (monthDiff < 0 || (monthDiff === 0 && todayDay < birthDay)) {
        age--;
      }
      
      return age;
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * Extract date string (YYYY-MM-DD) from a local Date object
   * This properly handles the local date without UTC conversion issues
   */
  static toDateString(date: Date): string {
    if (!date) return '';
    
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      
      return `${year}-${month}-${day}`;
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Format time for display - SIMPLE VERSION
   * Converts UTC timestamps to clinic's local timezone (America/Tegucigalpa UTC-6)
   */
  static formatTime(dateString: string | Date): string {
    if (!dateString) return '';
    
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      
      // Check if it's a date-only string (YYYY-MM-DD format) - no time component
      if (typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return '';
      }
      
      // Check if it's a midnight UTC timestamp (likely a date-only stored as timestamp)
      if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
        return '';
      }
      
      // Get UTC time and subtract 6 hours to convert to America/Tegucigalpa (UTC-6)
      const utcHours = date.getUTCHours();
      const utcMinutes = date.getUTCMinutes();
      
      // Convert UTC to clinic timezone (UTC-6)
      let localHours = utcHours - 6;
      const minutes = utcMinutes;
      
      // Handle day wraparound
      if (localHours < 0) {
        localHours += 24;
      }
      
      const ampm = localHours >= 12 ? 'PM' : 'AM';
      const hours12 = localHours % 12;
      const hours = hours12 ? hours12 : 12; // the hour '0' should be '12'
      
      const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
      
      return `${hours}:${formattedMinutes} ${ampm}`;
    } catch (error) {
      return '';
    }
  }
  
  /**
   * Calculate age at a specific date (for "Edad al momento de consulta")
   * Uses UTC methods to avoid timezone issues
   */
  static calculateAgeAtDate(birthDateString: string, consultationDateString: string): number {
    if (!birthDateString || !consultationDateString) return 0;
    
    try {
      const birthDate = new Date(birthDateString);
      const consultationDate = new Date(consultationDateString);
      
      // Use UTC components to avoid local timezone offset issues
      const birthYear = birthDate.getUTCFullYear();
      const consultYear = consultationDate.getUTCFullYear();
      const birthMonth = birthDate.getUTCMonth();
      const consultMonth = consultationDate.getUTCMonth();
      const birthDay = birthDate.getUTCDate();
      const consultDay = consultationDate.getUTCDate();
      
      let age = consultYear - birthYear;
      const monthDiff = consultMonth - birthMonth;
      
      if (monthDiff < 0 || (monthDiff === 0 && consultDay < birthDay)) {
        age--;
      }
      
      return age;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get local timezone offset as ±HH:mm (e.g. -06:00 for America/Tegucigalpa)
   */
  static getOffsetString(): string {
    const offset = -new Date().getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const absHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const absMins = String(Math.abs(offset) % 60).padStart(2, '0');
    return `${sign}${absHours}:${absMins}`;
  }

  /**
   * Convert a local datetime string (no timezone) to full ISO with offset
   * for correct storage in Supabase timestamptz columns.
   * Input: "2026-07-19T10:00"  →  Output: "2026-07-19T10:00:00-06:00"
   */
  static toTimezoneAwareISO(localStr: string): string {
    if (!localStr) return '';
    try {
      return `${localStr}:00${SimpleTimezoneFix.getOffsetString()}`;
    } catch {
      return localStr;
    }
  }
}
