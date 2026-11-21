/**
 * Birthday message templates (Phase 5 — promo-ready outreach).
 *
 * Centralized builder so the promo toggle in EventDetailDrawer can attach an
 * optional birthday offer to the WhatsApp greeting without touching the cron
 * or DOB projection logic.
 */

export interface BirthdayPromoConfig {
  code: string;
  type: 'discount' | 'voucher' | 'service';
  value: string; // e.g. '15% en Limpieza Dental' | 'Limpieza dental gratis'
  validityDays: number;
  enabledByDefault: boolean;
}

/** Default (disabled) birthday promotion. Flip `enabledByDefault: true` to
 *  pre-check the toggle in the drawer. Staff can still uncheck it per-send. */
export const ACTIVE_BIRTHDAY_PROMO: BirthdayPromoConfig = {
  code: 'CUMPLE-DIAMOND',
  type: 'discount',
  value: '15% en Limpieza Dental',
  validityDays: 15,
  enabledByDefault: false,
};

const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function expirationDateEsHN(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getDate()} de ${MONTHS_LONG[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Build the WhatsApp birthday message in Spanish (es-HN).
 *
 *  Base greeting:
 *    ¡Feliz cumpleaños! 🎂 En Clínica Dental Diamond nos importa tu salud
 *    y tu sonrisa. ¡Que tengas un día maravilloso!
 *
 *  When includePromo is true, appends:
 *    🎁 Regalo de cumpleaños: {value} (código: {code})
 *    Válido hasta: {expirationDate}
 */
export function buildBirthdayWhatsAppMessage({
  patientName,
  includePromo = false,
  promoConfig = ACTIVE_BIRTHDAY_PROMO,
}: {
  patientName: string;
  includePromo?: boolean;
  promoConfig?: BirthdayPromoConfig;
}): string {
  const lines: string[] = [
    `¡Feliz cumpleaños! 🎂 En Clínica Dental Diamond nos importa tu salud y tu sonrisa. ¡Que tengas un día maravilloso, ${patientName}!`,
  ];

  if (includePromo && promoConfig) {
    const expires = expirationDateEsHN(promoConfig.validityDays);
    lines.push(
      '',
      '🎁 Regalo de cumpleaños:',
      `  ${promoConfig.value} (código: ${promoConfig.code})`,
      `  Válido hasta: ${expires}`,
    );
  }

  return lines.join('\n');
}

/** Extract the promotion fields to send in POST /api/birthday-wishes when
 *  the promo toggle is enabled. Returns null when the toggle is off. */
export function promoPayload(promoConfig: BirthdayPromoConfig, enabled: boolean) {
  if (!enabled) return null;
  return {
    promotion_code: promoConfig.code,
    promotion_type: promoConfig.type,
    promotion_value: promoConfig.value,
  };
}
