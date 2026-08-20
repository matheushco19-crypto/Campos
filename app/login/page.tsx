import Link from 'next/link'
import { login } from './actions'

const errors: Record<string, string> = {
  credentials: 'E-mail ou senha incorretos. Confira seus dados e tente novamente.',
  unauthorized: 'Sua conta não está habilitada para acessar a plataforma.',
  missing: 'Informe seu e-mail e sua senha.',
}

const messages: Record<string, string> = {
  'password-updated': 'Senha alterada com sucesso. Você já pode entrar com a nova senha.',
  'confirmed': 'E-mail confirmado com sucesso. Agora você pode entrar.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams
  const error = params.error ? errors[params.error] : undefined
  const message = params.message ? messages[params.message] : undefined

  return (
    <main className="page">
      <section className="card">
        <div className="logo">Campos Wealth OS</div>
        <p className="subtitle">Entre para acessar sua conta</p>

        {error && <div role="alert" className="form-message error">{error}</div>}
        {message && <div role="status" className="form-message success">{message}</div>}

        <form action={login}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input className="input" id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button className="button" type="submit">Entrar</button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link className="text-btn" href="/esqueci-senha">Esqueci minha senha</Link>
        </div>
      </section>
    </main>
  )
}
