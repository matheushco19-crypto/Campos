import Link from 'next/link'
import { updatePassword } from './actions'

const errors: Record<string, string> = {
  weak: 'A nova senha precisa ter pelo menos 8 caracteres.',
  mismatch: 'As senhas não conferem.',
  update: 'Não foi possível alterar a senha. Solicite um novo link de recuperação.',
}

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  const error = params.error ? errors[params.error] : undefined

  return (
    <main className="page">
      <section className="card">
        <div className="logo">Campos Wealth OS</div>
        <p className="subtitle">Crie uma nova senha</p>

        {error && <div role="alert" className="form-message error">{error}</div>}

        <form action={updatePassword}>
          <div className="field">
            <label htmlFor="password">Nova senha</label>
            <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="field">
            <label htmlFor="confirmation">Confirmar nova senha</label>
            <input className="input" id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <button className="button" type="submit">Salvar nova senha</button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Link className="text-btn" href="/login">Voltar para o login</Link>
        </div>
      </section>
    </main>
  )
}
