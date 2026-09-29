import type { AnalysisOutput } from '../../src/core/schemas'

/** A well-formed analysis citing facts f_spx (6.550 pts, +1,2%) and f_selic (15,00%). */
export function goodAnalysis(): AnalysisOutput {
  const idea = (title: string) => ({
    title,
    hook: 'Por que o custo do dinheiro muda o preço de tudo o que você tem',
    angle: 'Mostrar como a taxa de desconto conecta a decisão de juros ao valuation de ativos longos e ao crédito das famílias.',
    fact_ids: ['f_selic'],
    cluster_ids: ['c_fed'],
  })
  return {
    what_matters: [
      { headline: 'Fed mantém juros e o mercado lê cautela', why_it_matters: 'A pausa prolonga o diferencial de juros e sustenta o dólar, o que pesa sobre ativos de risco emergentes.', fact_ids: [], cluster_ids: ['c_fed'] },
      { headline: 'S&P 500 sobe 1,2%', why_it_matters: 'O índice fechou em 6.550 pontos, puxado por tecnologia, sinal de apetite por duration longa.', fact_ids: ['f_spx'], cluster_ids: [] },
    ],
    macro_watch: { BR: [{ text: 'Selic segue em 15,00% ao ano, com juro real elevado.', fact_ids: ['f_selic'], cluster_ids: [] }], US: [], CN: [], EU: [] },
    insights: [
      { title: 'Juro alto por mais tempo', what_happened: 'O Fed manteve a taxa e o Copom mantém a Selic em 15,00%.', why_it_happened: 'Inflação de serviços resistente nos dois países mantém os bancos centrais cautelosos.', what_it_changes: 'Minha leitura é que ativos de duration longa continuam sensíveis a qualquer surpresa de inflação.', fact_ids: ['f_selic'], cluster_ids: ['c_fed'] },
    ],
    uhnw_lens: [{ text: 'Com juro real alto, a conversa sobre liquidez e custo de oportunidade de ativos ilíquidos fica mais fácil.', fact_ids: [], cluster_ids: [] }],
    content_lab: { story: idea('O preço do tempo'), carousel: idea('Juro real e patrimônio'), reel: idea('A taxa de desconto em 60 segundos'), take: idea('Paciência também é posição'), exceptional: null },
  }
}
