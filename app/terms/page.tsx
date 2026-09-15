import Link from 'next/link'

export const metadata = {
  title: 'Términos de Servicio — Diamond Calendar',
}

const SECTIONS = [
  {
    title: '1. Aceptación',
    body: [
      'Al acceder o utilizar Diamond Calendar (\"la Aplicación\"), usted acepta estos Términos de Servicio. Si no está de acuerdo, no utilice la Aplicación.',
    ],
  },
  {
    title: '2. Descripción del servicio',
    body: [
      'Diamond Calendar es una herramienta digital de gestión de agenda, citas y recordatorios para pacientes de Clínica Dental Diamond. La Aplicación no sustituye la atención médica ni el criterio profesional del equipo odontológico.',
    ],
  },
  {
    title: '3. Cuentas y acceso',
    body: [
      'Su acceso está vinculado a una cuenta personal (gestionada a través de Clerk). Usted es responsable de mantener la confidencialidad de sus credenciales y de notificar a la clínica ante accesos no autorizados.',
    ],
  },
  {
    title: '4. Uso aceptable',
    body: [
      'Usted se compromete a utilizar la Aplicación únicamente con fines relacionados con su atención. Queda prohibido interferir con su funcionamiento, suplantar identidad, o recopilar datos de otros usuarios sin autorización.',
    ],
  },
  {
    title: '5. Información clínica',
    body: [
      'Cualquier información clínica o médica registrada en la Aplicación corresponde a la práctica profesional de Clínica Dental Diamond. La Aplicación solo almacena y transmite dicha información de forma segura; no genera diagnósticos ni recomendaciones.',
    ],
  },
  {
    title: '6. Propiedad intelectual',
    body: [
      'Todo el contenido, diseño y código de la Aplicación son propiedad de Clínica Dental Diamond o sus licenciantes. Se prohíbe su reproducción sin autorización.',
    ],
  },
  {
    title: '7. Limitación de responsabilidad',
    body: [
      'La Aplicación se proporciona \"tal cual\" y sin garantías de disponibilidad continua. Clínica Dental Diamond no será responsable por daños indirectos, pérdida de datos derivada de fallos de servicios de terceros, o errores en la información registrada por los usuarios.',
    ],
  },
  {
    title: '8. Cambios en los términos',
    body: [
      'Estos términos pueden actualizarse sin previo aviso. El uso continuado de la Aplicación tras un cambio implica su aceptación.',
    ],
  },
  {
    title: '9. Legislación aplicable',
    body: [
      'Estos términos se rigen por las leyes de la República de Honduras. Cualquier controversia será sometida a los tribunales competentes de San Pedro Sula, Honduras.',
    ],
  },
]

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-gray-800 text-gray-300 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        <header className="mb-10">
          <Link href="/sign-in" className="text-teal-400 text-sm hover:text-teal-300 transition-colors">
            ← Volver</Link>
          <h1 className="text-3xl font-bold text-white mt-4">Términos de Servicio</h1>
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
          <Link href="/privacy" className="hover:text-teal-400 transition-colors">Política de Privacidad</Link>
          <Link href="/sign-in" className="hover:text-teal-400 transition-colors">Iniciar sesión</Link>
        </footer>
      </div>
    </main>
  )
}