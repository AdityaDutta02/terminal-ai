import { Zap } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-slate-200 py-8 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 bg-[#0A0A0A] rounded-md flex items-center justify-center">
          <Zap className="w-3 h-3 text-white" />
        </div>
        <span className="text-[13px] font-semibold text-slate-400">Terminal AI</span>
      </div>
      <div className="flex items-center gap-6">
        <a href="/pricing" className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
          Pricing
        </a>
        <a href="/developers" className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
          Developers
        </a>
        <a href="/terms" className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
          Terms
        </a>
        <a href="/privacy" className="text-[13px] text-slate-400 hover:text-slate-600 transition-colors">
          Privacy
        </a>
      </div>
    </footer>
  )
}
