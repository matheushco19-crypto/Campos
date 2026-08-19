import { login } from './actions'

export default function LoginPage() {
  return (
    <main className="page">
      <section className="card">
        <div className="logo">Campos Wealth OS</div>
        <p className="subtitle">Acesso administrativo</p>
        <form action={login}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input className="input" id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input className="input" id="password" name="password" type="password" required />
          </div>
          <button className="button" type="submit">Entrar</button>
        </form>
      </section>
    </main>
  )
}
