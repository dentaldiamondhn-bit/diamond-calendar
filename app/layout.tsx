import { ClerkProvider } from '@clerk/nextjs'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Diamond Calendar',
  description: 'Dental clinic calendar management system',
  manifest: '/manifest.json',
  icons: {
    icon: '/Logo.svg',
    shortcut: '/Logo.svg',
    apple: '/Logo.svg',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: '#14b8a6',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <html lang="en">
        <head>
          <meta name="theme-color" content="#14b8a6" />
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="Diamond Link" />
          <meta name="format-detection" content="telephone=no" />
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="application-name" content="Diamond Link" />
          <link rel="manifest" href="/manifest.json" />
          <link 
            rel="stylesheet" 
            href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
            integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw=="
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
          />
          <link rel="icon" href="/Logo.svg" />
          <link rel="shortcut icon" href="/Logo.svg" />
          <link rel="apple-touch-icon" href="/Logo.svg" />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                // Show loading overlay immediately when page starts loading
                (function() {
                  var overlay = document.createElement('div');
                  overlay.id = 'loading-overlay';
                  overlay.innerHTML = '<img src="/Logo.svg" alt="Loading..." class="loading-logo" />';
                  document.documentElement.appendChild(overlay);
                  
                  // Preserve dark mode preference (don't force it)
                  function preserveThemeMode() {
                    if (document.body) {
                      // Check if dark mode was previously set in localStorage
                      const isDarkMode = localStorage.getItem('darkMode') === 'true' || 
                                       localStorage.getItem('theme') === 'dark' ||
                                       document.documentElement.classList.contains('dark');
                      
                      if (isDarkMode) {
                        document.body.classList.add('dark');
                        document.body.setAttribute('data-theme', 'dark');
                      }
                    } else {
                      // If body is not ready, wait for DOMContentLoaded
                      document.addEventListener('DOMContentLoaded', preserveThemeMode);
                    }
                  }
                  preserveThemeMode();
                  
                  // Hide overlay when page is fully loaded
                  window.addEventListener('load', function() {
                    setTimeout(function() {
                      overlay.style.opacity = '0';
                      overlay.style.transition = 'opacity 0.3s ease-out';
                      setTimeout(function() {
                        if (overlay.parentNode) {
                          overlay.parentNode.removeChild(overlay);
                        }
                      }, 300);
                    }, 100);
                  });
                  
                  // Show overlay when navigating away
                  window.addEventListener('beforeunload', function() {
                    overlay.style.display = 'flex';
                  });
                })();
              `,
            }}
          />
        </head>
        <body className={`${inter.className} bg-gray-800`} suppressHydrationWarning>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}