'use client'

import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useRouter } from 'next/navigation'

export function LaunchButton({ waitlistCount }: { waitlistCount: number }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleLaunch() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/launch', { method: 'POST' })
      const data = await res.json() as { launched?: boolean; error?: string; emailsSent?: number; creditsGranted?: number }
      if (data.launched) {
        router.refresh()
      } else {
        alert(`Launch failed: ${data.error ?? 'Unknown error'}`)
      }
    } catch {
      alert('Network error during launch')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          disabled={loading}
          className="bg-[#FF6B00] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-orange-500 transition-colors disabled:opacity-50"
        >
          {loading ? 'Launching…' : 'Launch Platform →'}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Launch Terminal AI?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-[#64748B]">
              <p>This will:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Email all {waitlistCount.toLocaleString()} waitlisted addresses</li>
                <li>Grant 10 credits to users already signed up</li>
                <li>Take the platform live immediately</li>
              </ul>
              <p className="font-medium text-[#0F172A] mt-3">This cannot be undone.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleLaunch}
            className="bg-[#FF6B00] hover:bg-orange-500 text-white"
          >
            Yes, Launch Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
