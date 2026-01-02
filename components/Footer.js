import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-black text-white py-6 mt-auto">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          {/* Logo & Copyright */}
          <div className="flex items-center gap-2">
            <span className="text-lg font-black tracking-tighter">EaseRent</span>
          </div>
          
          <p className="text-gray-400 text-xs flex items-center gap-2">
            © 2026 EaseRent, Inc. · <Link href="/terms" className="hover:text-white transition-colors">Privacy</Link> · <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </p>
        </div>
      </div>
    </footer>
  )
}
