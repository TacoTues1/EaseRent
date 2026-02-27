import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-black text-gray-400 py-3 border-t border-gray-900 mt-10">
      <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center sm:justify-start gap-6 lg:gap-8 text-[15px] font-medium">
          {/* Logo Name on Left */}
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity sm:mr-2">
            <span className="text-[24px] text-white tracking-normal leading-none" style={{ fontFamily: '"Pacifico", cursive', marginTop: '-2px' }}>Abalay</span>
          </Link>

          <span>© 2026 Abalay</span>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
        </div>
      </div>
    </footer>
  )
}