export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      patients: {
        Row: {
          paciente_id: string
          nombre_completo: string
          numero_identidad: string | null
          telefono: string | null
          fecha_nacimiento: string | null
          created_at: string
        }
        Insert: {
          paciente_id?: string
          nombre_completo: string
          numero_identidad?: string | null
          telefono?: string | null
          fecha_nacimiento?: string | null
          created_at?: string
        }
        Update: {
          paciente_id?: string
          nombre_completo?: string
          numero_identidad?: string | null
          telefono?: string | null
          fecha_nacimiento?: string | null
          created_at?: string
        }
      }
      patient_birthday_wishes: {
        Row: {
          id: string
          patient_id: string
          wish_year: number
          wish_sent_at: string
          channel: string
          message_template: string
          promotion_code: string | null
          promotion_type: string | null
          promotion_value: string | null
          acknowledged: boolean
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          patient_id: string
          wish_year: number
          wish_sent_at?: string
          channel?: string
          message_template?: string
          promotion_code?: string | null
          promotion_type?: string | null
          promotion_value?: string | null
          acknowledged?: boolean
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          patient_id?: string
          wish_year?: number
          wish_sent_at?: string
          channel?: string
          message_template?: string
          promotion_code?: string | null
          promotion_type?: string | null
          promotion_value?: string | null
          acknowledged?: boolean
          created_by?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
