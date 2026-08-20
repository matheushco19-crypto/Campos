import Link from 'next/link'
import { requestPasswordReset } from '../login/actions'

const errors: Record<string, string> = {
  missing: 'Informe seu e-mail.',
  request: 'Não foi possível solicitar a recuperação agora. Tente novamente em instantes.',
}

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string }> }) {
  const params = await searchParams
  const error = params.error ? errors[params.error] : undefined
  const sent = params.sent === '1'

  return (
    <main className="page">
      <section className="card">
        <div className="logo">Campos Wealth OS</div>
        <p className="subtitle">Recuperação de senha</p>

        {error && <div role="alert" className="form-message error">{error}</div>}
        {sent && (
          <div role="status" className="form-message success">
            Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha.
          </div>
        )}

        {!sent && (
          <form action={requestPasswordReset}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <button className="button" type="submit">Enviar link de recuperação</button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link className="text-btn" href="/login">Voltar para o login</Link>
        </div>
      </section>
    </main>
  )
}
