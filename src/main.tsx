import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './main.css'
import TemplateSelector from "@/TemplateSelector.tsx";

const options = ['var1', 'var2', 'var3']

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <TemplateSelector defaultValue={'test-${var1}'} options={options} size={10} placeholder={"Test"} />
    <input/>
  </StrictMode>,
)
