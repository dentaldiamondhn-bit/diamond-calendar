// Enhanced formatting utilities for Honduran ID and phone numbers

// Honduran ID format: XXXX-XXXX-XXXXX (4-4-5 digits)
export const formatHonduranID = (value: string): string => {
  // Remove all non-digits
  const cleaned = value.replace(/\D/g, '');
  
  // Limit to 13 digits (4-4-5 format)
  const limited = cleaned.substring(0, 13);
  
  // Apply format: XXXX-XXXX-XXXXX
  if (limited.length <= 4) {
    return limited;
  } else if (limited.length <= 8) {
    return `${limited.slice(0, 4)}-${limited.slice(4)}`;
  } else {
    return `${limited.slice(0, 4)}-${limited.slice(4, 8)}-${limited.slice(8, 13)}`;
  }
};

// Validate Honduran ID format
export const validateHonduranID = (value: string): boolean => {
  const cleaned = value.replace(/\D/g, '');
  return cleaned.length === 13 && /^\d{13}$/.test(cleaned);
};

// Phone number formatting by country
export const phoneFormats = {
  '504': { // Honduras
    format: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.substring(0, 8); // 8 digits for Honduras
      if (limited.length <= 4) {
        return limited;
      }
      return `${limited.slice(0, 4)}-${limited.slice(4)}`;
    },
    validate: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      return cleaned.length === 8 && /^\d{8}$/.test(cleaned);
    },
    placeholder: 'XXXX-XXXX',
    display: '+(504) XXXX-XXXX'
  },
  '1': { // USA/Canada
    format: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.substring(0, 10); // 10 digits for USA
      if (limited.length <= 3) {
        return limited;
      } else if (limited.length <= 6) {
        return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
      } else {
        return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6, 10)}`;
      }
    },
    validate: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      return cleaned.length === 10 && /^\d{10}$/.test(cleaned);
    },
    placeholder: '(XXX) XXX-XXXX',
    display: '+1 (XXX) XXX-XXXX'
  },
  '52': { // Mexico
    format: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.substring(0, 10); // 10 digits for Mexico
      if (limited.length <= 3) {
        return limited;
      } else if (limited.length <= 6) {
        return `${limited.slice(0, 3)}-${limited.slice(3)}`;
      } else {
        return `${limited.slice(0, 3)}-${limited.slice(3, 6)}-${limited.slice(6, 10)}`;
      }
    },
    validate: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      return cleaned.length === 10 && /^\d{10}$/.test(cleaned);
    },
    placeholder: 'XXX-XXX-XXXX',
    display: '+52 XXX-XXX-XXXX'
  },
  '502': { // Guatemala
    format: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.substring(0, 8); // 8 digits for Guatemala
      if (limited.length <= 4) {
        return limited;
      }
      return `${limited.slice(0, 4)}-${limited.slice(4)}`;
    },
    validate: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      return cleaned.length === 8 && /^\d{8}$/.test(cleaned);
    },
    placeholder: 'XXXX-XXXX',
    display: '+(502) XXXX-XXXX'
  },
  '503': { // El Salvador
    format: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.substring(0, 8); // 8 digits for El Salvador
      if (limited.length <= 4) {
        return limited;
      }
      return `${limited.slice(0, 4)}-${limited.slice(4)}`;
    },
    validate: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      return cleaned.length === 8 && /^\d{8}$/.test(cleaned);
    },
    placeholder: 'XXXX-XXXX',
    display: '+(503) XXXX-XXXX'
  },
  '506': { // Costa Rica
    format: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.substring(0, 8); // 8 digits for Costa Rica
      if (limited.length <= 4) {
        return limited;
      }
      return `${limited.slice(0, 4)}-${limited.slice(4)}`;
    },
    validate: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      return cleaned.length === 8 && /^\d{8}$/.test(cleaned);
    },
    placeholder: 'XXXX-XXXX',
    display: '+(506) XXXX-XXXX'
  },
  '505': { // Nicaragua
    format: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.substring(0, 8); // 8 digits for Nicaragua
      if (limited.length <= 4) {
        return limited;
      }
      return `${limited.slice(0, 4)}-${limited.slice(4)}`;
    },
    validate: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      return cleaned.length === 8 && /^\d{8}$/.test(cleaned);
    },
    placeholder: 'XXXX-XXXX',
    display: '+(505) XXXX-XXXX'
  },
  '507': { // Panama
    format: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      const limited = cleaned.substring(0, 8); // 8 digits for Panama
      if (limited.length <= 4) {
        return limited;
      }
      return `${limited.slice(0, 4)}-${limited.slice(4)}`;
    },
    validate: (value: string) => {
      const cleaned = value.replace(/\D/g, '');
      return cleaned.length === 8 && /^\d{8}$/.test(cleaned);
    },
    placeholder: 'XXXX-XXXX',
    display: '+(507) XXXX-XXXX'
  }
};

// Get phone format for a specific country
export const getPhoneFormat = (countryCode: string) => {
  return phoneFormats[countryCode] || phoneFormats['504']; // Default to Honduras
};

// Format phone number based on country code
export const formatPhoneNumber = (value: string, countryCode: string): string => {
  const format = getPhoneFormat(countryCode);
  return format.format(value);
};

// Validate phone number based on country code
export const validatePhoneNumber = (value: string, countryCode: string): boolean => {
  const format = getPhoneFormat(countryCode);
  return format.validate(value);
};

// Get placeholder for phone input based on country
export const getPhonePlaceholder = (countryCode: string): string => {
  const format = getPhoneFormat(countryCode);
  return format.placeholder;
};

// Get display format for phone number
export const getPhoneDisplayFormat = (countryCode: string): string => {
  const format = getPhoneFormat(countryCode);
  return format.display;
};
