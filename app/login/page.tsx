import { login } from './actions'

const messages: Record<string, string> = {
  credentials: 'E-mail ou senha não conferem com uma conta ativa.',
  unauthorized: 'Sua conta autenticou, mas não possui permissão administrativa.',
  missing: 'Informe seu e-mail e sua senha.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const message = params.error ? messages[params.error] : undefined

  return (
    <main className="page">
      <section className="card">
        <div className="logo">Campos Wealth OS</div>
        <p className="subtitle">Acesso administrativo</p>
        {message && <div role="alert" className="form-message error">{message}</div>}
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
      </section>
    </main>
  )
}
