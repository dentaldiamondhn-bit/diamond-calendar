'use client'

import { useState, useEffect } from 'react'
import { SignIn, useUser } from '@clerk/nextjs'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Shield, Scan, CalendarDays, BarChart3, Sparkles } from 'lucide-react'

export default function SignInPage() {
  const [isLoaded, setIsLoaded] = useState(false)
  const { user, isLoaded: userLoaded } = useUser()
  const router = useRouter()

  const getRedirectUrl = () => {
    if (!userLoaded || !user) return '/dashboard'
    const role = (user.publicMetadata?.role as string) ?? ''
    if (role === 'tech_support') return '/tech-support/dashboard'
    return '/dashboard'
  }

  useEffect(() => {
    if (userLoaded && user) {
      router.push(getRedirectUrl())
    }
    setIsLoaded(true)
  }, [userLoaded, user, router])

  const trustItems = [
    { Icon: Shield, label: 'HIPAA Compliant' },
    { Icon: Scan, label: 'Datos Encriptados' },
    { Icon: CalendarDays, label: 'Citas en Línea' },
    { Icon: BarChart3, label: 'Analíticas Avanzadas' },
  ]

  return (
    <div className="flex min-h-screen bg-gray-800">
      {/* Left Panel — Brand */}
      <div className="hidden lg:flex w-1/2 relative items-center justify-center p-8 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-950/40 via-gray-800 to-gray-800" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '128px 128px',
        }} />

        <div className="relative z-10 flex flex-col items-center text-center max-w-md w-full">
          <div className="mb-6 relative">
            <div className="absolute inset-0 bg-teal-500/20 rounded-full blur-3xl animate-pulse" />
            <Image
              src="/Logo.svg"
              alt="Diamond Calendar"
              width={120}
              height={120}
              className="relative drop-shadow-[0_8px_24px_rgba(18,181,162,0.25)]"
              priority
            />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold tracking-widest uppercase backdrop-blur-sm mb-4">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            <span>Clínica Dental Diamond</span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-2 bg-gradient-to-br from-white to-teal-100 bg-clip-text text-transparent">
            Diamond Calendar
          </h1>
          <p className="text-teal-400 font-medium mb-3">
            Sonríe con confianza, vive con excelencia.
          </p>
          <p className="text-gray-400 text-sm leading-relaxed max-w-sm mb-8">
            Sistema integral de gestión clínica diseñado para ofrecer atención dental de clase mundial con tecnología de vanguardia.
          </p>

          <div className="flex flex-wrap justify-center gap-2.5 mb-8">
            {trustItems.map(({ Icon, label }) => (
              <div
                key={label}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-gray-400 text-xs font-medium backdrop-blur-sm"
              >
                <Icon className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <blockquote className="text-gray-500 text-sm italic leading-relaxed border-l-2 border-teal-500/25 pl-4 max-w-xs">
            &ldquo;La excelencia no es un acto, es un h&aacute;bito.&rdquo;
            <cite className="block mt-1.5 text-teal-400 text-xs not-italic font-semibold">
              &mdash; Dr. Diamond
            </cite>
          </blockquote>

          <p className="text-gray-600 text-xs mt-6">
            &copy; {new Date().getFullYear()} Clinica Dental Diamond. Todos los derechos reservados.
          </p>
        </div>
      </div>

      {/* Right Panel — Sign-In */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-900/50 relative overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-8">
            <Image
              src="/Logo.svg"
              alt="Diamond Calendar"
              width={64}
              height={64}
              className="mx-auto mb-3 drop-shadow-lg"
              priority
            />
            <h2 className="text-xl font-bold bg-gradient-to-br from-white to-teal-100 bg-clip-text text-transparent">
              Diamond Calendar
            </h2>
            <p className="text-teal-400 text-sm font-medium">Excellence in Dental Care</p>
          </div>

          {isLoaded && userLoaded && !user && (
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-2xl p-6 backdrop-blur-md shadow-[0_24px_64px_rgba(0,0,0,0.35)]">
              <div className="text-center mb-5">
                <h3 className="text-lg font-bold text-gray-100">Bienvenido de vuelta</h3>
                <p className="text-gray-500 text-sm">Inicie sesión para acceder a su Calendario</p>
              </div>

              <SignIn
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    card: 'shadow-none bg-transparent w-full',
                    headerTitle: 'sr-only',
                    headerSubtitle: 'sr-only',
                    socialButtonsBlockButton:
                      'bg-white/[0.03] border border-white/[0.08] text-gray-300 rounded-xl text-sm font-medium py-2.5 px-4 h-auto min-h-[44px] hover:bg-teal-500/10 hover:border-teal-500/25 hover:-translate-y-0.5 transition-all',
                    formFieldLabel: 'text-gray-400 text-sm font-medium mb-1.5',
                    formFieldInput:
                      'bg-white/[0.03] border border-white/[0.08] rounded-xl text-gray-100 text-base py-3 px-4 min-h-[48px] transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 focus:bg-teal-500/[0.03]',
                    formButtonPrimary:
                      'bg-gradient-to-br from-teal-700 to-teal-600 text-white font-semibold rounded-xl py-3.5 px-4 min-h-[48px] w-full transition-all shadow-lg shadow-teal-900/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-teal-900/40 hover:brightness-110',
                    formButtonSecondary:
                      'bg-transparent border border-white/[0.1] text-gray-300 rounded-xl text-sm transition-all hover:border-teal-500/30 hover:bg-teal-500/[0.04]',
                    footerActionLink: 'text-teal-400 font-medium text-sm hover:text-teal-300 transition-colors',
                    identityPreviewEditButton: 'text-teal-400 font-medium text-sm hover:text-teal-300 transition-colors',
                    formFieldAction: 'text-teal-400 font-medium text-sm hover:text-teal-300 transition-colors',
                    otpCodeFieldInput:
                      'bg-white/[0.03] border border-white/[0.08] rounded-xl text-gray-100 text-center transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15',
                    dividerLine: 'bg-white/[0.06]',
                    dividerText: 'text-gray-500 text-xs',
                    form: 'w-full',
                    footer: 'mt-5',
                    alertText: 'text-gray-300',
                    alertError: 'text-red-400',
                    alertWarning: 'text-amber-400',
                  },
                  layout: {
                    socialButtonsPlacement: 'top',
                    showOptionalFields: true,
                  },
                }}
                routing="path"
                path="/sign-in"
                fallbackRedirectUrl="/dashboard"
              />
            </div>
          )}

          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 mt-6">
            {[
              { label: 'Política de Privacidad', href: '#' },
              { label: 'Términos de Servicio', href: '#' },
              { label: 'Soporte', href: '#' },
            ].map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-gray-500 text-xs hover:text-teal-400 transition-colors relative after:absolute after:bottom-0 after:left-0 after:h-px after:bg-teal-500 after:w-0 hover:after:w-full after:transition-all"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <p className="lg:hidden text-center text-gray-600 text-xs mt-4">
            &copy; {new Date().getFullYear()} Diamond Calendar
          </p>
        </div>
      </div>
    </div>
  )
}
