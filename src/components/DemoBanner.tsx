import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Detect demo mode from environment variable
const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

export function DemoBanner() {
  if (!IS_DEMO_MODE) return null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2 text-center text-sm font-medium flex items-center justify-center gap-2">
      <AlertTriangle className="w-4 h-4" />
      <span>
        Modo Demonstração - Dados fictícios. 
        <a href="https://licitaflow.com.br" className="underline ml-1 hover:text-amber-100">
          Acesse a versão completa
        </a>
      </span>
    </div>
  );
}
