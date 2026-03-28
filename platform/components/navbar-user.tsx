'use client'

import { useSignOut } from '@/hooks/use-sign-out'
import { CreditsPill } from '@/components/ui/credits-pill'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Settings, LayoutDashboard, ShieldCheck, ChevronDown, Code2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface NavbarUserProps {
  name: string
  email: string
  credits: number
  role: string
}

function NavMenuLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <DropdownMenuItem asChild>
      <a href={href} className="cursor-pointer">
        <Icon className="mr-2 h-4 w-4" />
        {label}
      </a>
    </DropdownMenuItem>
  )
}
export function NavbarUser({ name, email, credits, role }: NavbarUserProps) {
  const signOut = useSignOut()
  const isCreator = role === 'creator' || role === 'admin'
  return (
    <div className="flex items-center gap-2">
      <CreditsPill credits={credits} />
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none transition-colors">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
            {name.charAt(0).toUpperCase()}
          </span>
          <span className="hidden max-w-[120px] truncate sm:inline">{name}</span>
          <ChevronDown className="h-3 w-3 text-gray-400" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <p className="truncate text-sm font-medium text-gray-900">{name}</p>
            <p className="truncate text-xs text-gray-500">{email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <NavMenuLink href="/account" icon={Settings} label="Account & Credits" />
          <NavMenuLink href="/developers" icon={Code2} label="Developer API" />
          {isCreator && <NavMenuLink href="/creator" icon={LayoutDashboard} label="Creator Dashboard" />}
          {role === 'admin' && <NavMenuLink href="/admin" icon={ShieldCheck} label="Admin Panel" />}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={signOut} className="cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
