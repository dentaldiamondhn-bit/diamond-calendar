import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidad — Diamond Calendar',
}

const SECTIONS = [
  {
    title: '1. Responsable del tratamiento',
    body: [
      'Clínica Dental Diamond, con domicilio en Bo. Guamilito 6ta calle entre 9 y 10 avenida, Plaza INSOLH local A3, San Pedro Sula, Honduras C.A. Correo de contacto: dentaldiamondhn@gmail.com.',
      'Esta Política de Privacidad explica qué datos recopilamos a través de Diamond Calendar, por qué los usamos, dónde se almacenan y qué derechos tiene usted.',
    ],
  },
  {
    title: '2. Datos que recopilamos',
    body: [
      'Para el funcionamiento de la aplicación recopilamos la siguiente información:',
      '• Datos de cuenta e identidad: nombre, correo electrónico, número de teléfono y credenciales de acceso. La autenticación se gestiona a través de nuestro proveedor, Clerk.',
      '• Datos de citas y agenda: fechas, horarios, motivo de la consulta y cualquier otra información de programación que usted o el personal autorizado registre.',
      '• Datos clínicos: información relacionada con su tratamiento y su historial dentro de la clínica, que se registra únicamente con fines asistenciales.',
      '• Información técnica: preferencias de dispositivo y suscripciones a notificaciones (correo, WhatsApp y notificaciones push), con el fin de enviarle recordatorios de sus citas.',
    ],
  },
  {
    title: '3. ¿Cómo utilizamos sus datos?',
    body: [
      '• Gestionar su agenda de citas y el historial clínico.',
      '• Enviarle recordatorios y notificaciones sobre sus citas.',
      '• Comunicarnos con usted respecto a su atención.',
      '• Mejorar la seguridad y el funcionamiento del servicio.',
    ],
  },
  {
    title: '4. Almacenamiento y seguridad',
    body: [
      'Sus datos se almacenan en proveedores de nube de terceros utilizados por la clínica (Supabase, Clerk y Firebase). Aplicamos medidas técnicas y organizativas razonables para proteger su información, incluyendo cifrado en tránsito y controles de acceso.',
    ],
  },
  {
    title: '5. Compartir información',
    body: [
      'No vendemos sus datos personales. Solo compartimos información con proveedores de servicios que nos ayudan a operar la aplicación (autenticación, base de datos, notificaciones) y cuando sea necesario para cumplir obligaciones legales o proteger nuestros derechos.',
    ],
  },
  {
    title: '6. Retención y sus derechos',
    body: [
      'Conservamos sus datos únicamente el tiempo necesario para prestar el servicio y cumplir con las obligaciones legales aplicables.',
      'Usted tiene derecho a acceder, rectificar y solicitar la eliminación de sus datos personales. Para ejercer estos derechos, contáctenos en dentaldiamondhn@gmail.com.',
    ],
  },
  {
    title: '7. Cambios a esta política',
    body: [
      'Podemos actualizar esta política cuando sea necesario. La fecha de la última actualización aparecerá al inicio de este documento.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-gray-800 text-gray-300 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-10">
          <Link href="/sign-in" className="text-teal-400 text-sm hover:text-teal-300 transition-colors">
            ← Volver</Link>
          <h1 className="text-3xl font-bold text-white mt-4">Política de Privacidad</h1>
          <p className="text-gray-400 text-sm mt-2">Diamond Calendar — Clínica Dental Diamond · Última actualización: 14 de septiembre de 2026</p>
        </header>

        <div className="space-y-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-xl font-semibold text-teal-400 mb-3">{s.title}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="leading-relaxed mb-3">{p}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-6 border-t border-white/10 text-sm text-gray-500 flex gap-6">
          <Link href="/terms" className="hover:text-teal-400 transition-colors">Términos de Servicio</Link>
          <Link href="/sign-in" className="hover:text-teal-400 transition-colors">Iniciar sesión</Link>
        </footer>
      </div>
    </main>
  )
}