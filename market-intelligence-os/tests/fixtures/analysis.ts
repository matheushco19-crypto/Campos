import type { AnalysisOutput } from '../../src/core/schemas'

/** A well-formed analysis citing facts f_spx (6.550 pts, +1,2%) and f_selic (15,00%). */
export function goodAnalysis(): AnalysisOutput {
  const idea = (title: string) => ({
    title,
    angle: 'Mostrar como a taxa de desconto conecta a decisão de juros ao valuation de ativos longos e ao crédito das famílias.',
    main_idea: 'Juro alto por mais tempo encarece o futuro: quanto mais distante o fluxo de caixa, maior o desconto.',
    fact_ids: ['f_selic'],
    cluster_ids: ['c_fed'],
  })
  return {
    lede: { text: 'Segundo a imprensa internacional, o Fed segurou os juros, e o S&P 500 subiu 1,2% mesmo assim.', fact_ids: ['f_spx'], cluster_ids: ['c_fed'] },
    what_matters: [
      { headline: 'Fed mantém juros e o mercado lê cautela', why_it_matters: 'Segundo a imprensa internacional, a pausa prolonga o diferencial de juros e sustenta o dólar, o que pesa sobre ativos de risco emergentes.', fact_ids: [], cluster_ids: ['c_fed'] },
      { headline: 'S&P 500 sobe 1,2%', why_it_matters: 'O índice fechou em 6.550 pontos, puxado por tecnologia, sinal de apetite por duration longa.', fact_ids: ['f_spx'], cluster_ids: [] },
      { headline: 'Selic parada, juro real alto', why_it_matters: 'Com a Selic em 15,00%, o custo de oportunidade de qualquer ativo ilíquido continua alto.', fact_ids: ['f_selic'], cluster_ids: [] },
      { headline: 'Crédito mais caro para empresas médias', why_it_matters: 'Juro alto por mais tempo pressiona quem depende de capital de giro e aumenta a seletividade dos bancos.', fact_ids: [], cluster_ids: [] },
      { headline: 'Dólar como termômetro do diferencial', why_it_matters: 'Enquanto a distância entre os juros daqui e de lá não muda, o câmbio tende a responder mais ao humor global.', fact_ids: [], cluster_ids: [] },
    ],
    macro_watch: { BR: [{ text: 'Selic segue em 15,00% ao ano, com juro real elevado.', fact_ids: ['f_selic'], cluster_ids: [] }], US: [], CN: [], EU: [] },
    insights: [
      {
        title: 'Juro alto por mais tempo',
        what_happened: 'O Fed manteve a taxa e o Copom mantém a Selic em 15,00%.',
        why_it_happened: 'Inflação de serviços resistente nos dois países mantém os bancos centrais cautelosos.',
        what_it_changes: 'Minha leitura é que ativos de duration longa continuam sensíveis a qualquer surpresa de inflação.',
        lenses: ['juros', 'duration'],
        fact_ids: ['f_selic'],
        cluster_ids: ['c_fed'],
      },
    ],
    uhnw_lens: [{ theme: 'liquidez', text: 'Com juro real alto, a conversa sobre liquidez e custo de oportunidade de ativos ilíquidos fica mais fácil.', fact_ids: [], cluster_ids: [] }],
    content_lab: {
      story: idea('O preço do tempo'),
      carousel: idea('Juro real e patrimônio'),
      reel: {
        ...idea('A taxa de desconto em 60 segundos'),
        hook: 'Por que o juro de hoje muda o preço do que você só recebe daqui a dez anos?',
        development: 'Todo ativo é uma promessa de fluxo de caixa no futuro. Para trazer esse fluxo a valor presente, o mercado usa o juro como desconto.',
        closing: 'Juro alto por mais tempo pesa mais em quem promete lucro distante.',
        cta: 'Salve para rever quando o Copom decidir.',
      },
      take: idea('Paciência também é posição'),
    },
  }
}
