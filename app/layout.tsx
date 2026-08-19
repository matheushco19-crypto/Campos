import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Wealth OS',
  description: 'Plataforma de Wealth Management',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
