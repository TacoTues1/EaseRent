import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-black text-gray-400 py-3 border-t border-gray-900 mt-10">
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 text-[13px] sm:text-[15px] font-medium">
          {/* Logo Name on Left */}
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <span className="text-[20px] sm:text-[24px] text-white tracking-normal leading-none" style={{ fontFamily: '"Pacifico", cursive', marginTop: '-2px' }}>Abalay</span>
          </Link>

          {/* Links on Right */}
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap justify-end">
            <span className="hidden sm:inline">© 2026 Abalay</span>
            <span className="sm:hidden">© 2026</span>
            <Link href="/team" className="hover:text-white transition-colors">Our Team</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
