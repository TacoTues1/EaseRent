import '../styles/globals.css'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import NotificationToast from '../components/NotificationToast'
import LocationPermissionNotice from '../components/LocationPermissionNotice'
import Meta from '../components/Meta'
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { GoeyToaster } from 'goey-toast'
import 'goey-toast/styles.css'
import { useRouter } from 'next/router'

function MyApp({ Component, pageProps }) {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [session, setSession] = useState(null)
  const [homeNavbarLoading, setHomeNavbarLoading] = useState(false)

  const publicPaths = new Set([
    '/',
    '/about',
    '/about-abalay',
    '/contact',
    '/team',
    '/terms',
    '/privacy',
    '/delete-account',
    '/flowchart',
    '/gantt',
    '/getDirections',
    '/login',
    '/register',
    '/register-landlord',
    '/forgotPassword',
    '/updatePassword',
    '/compare',
    '/help-center',
    '/landlords/landlordlist',
    '/landlords/landlordprofile',
    '/properties/allProperties',
    '/properties/[id]'
  ])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data?.session || null)
      setAuthReady(true)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null)
      setAuthReady(true)
    })

    return () => {
      mounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (session) return
    if (publicPaths.has(router.pathname)) return
    router.replace('/')
  }, [authReady, session, router.pathname])

  useEffect(() => {
    if (router.pathname !== '/') {
      setHomeNavbarLoading(false)
    }
  }, [router.pathname])

  const hideNavbarPaths = ['/login', '/register', '/register-landlord', '/forgotPassword', '/updatePassword', '/getDirections', '/assign-tenant', '/properties/new', '/help-center']

  return (
    <>
      <Meta />

      {!hideNavbarPaths.includes(router.pathname) && (
        <Navbar isHomeLoading={router.pathname === '/' && !session && homeNavbarLoading} />
      )}
      <LocationPermissionNotice />
      <NotificationToast />
      <GoeyToaster position="top-right" richColors />
      <Component
        {...pageProps}
        supabase={supabase}
        setHomeNavbarLoading={setHomeNavbarLoading}
      />
      <Analytics />
      <SpeedInsights />
    </>
  )
}

export default MyApp
