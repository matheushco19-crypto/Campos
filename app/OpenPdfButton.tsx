'use client'

export default function OpenPdfButton() {
  return <button className="text-btn" type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-pdf-import'))}>Importar PDF →</button>
}
