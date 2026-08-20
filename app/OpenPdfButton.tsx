'use client'
import {useEffect} from 'react'
export default function OpenPdfButton(){
 useEffect(()=>{const go=()=>{if(location.hash==='#clientes')location.href='/clientes'};window.addEventListener('hashchange',go);go();return()=>window.removeEventListener('hashchange',go)},[])
 return <button className="text-btn" type="button" onClick={()=>window.dispatchEvent(new CustomEvent('open-pdf-import'))}>Importar PDF →</button>
}
