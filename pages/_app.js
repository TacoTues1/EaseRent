import '../styles/globals.css'
import { createContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Navbar from '../components/Navbar'
import Meta from '../components/Meta'
import { Analytics } from "@vercel/analytics/next"

function MyApp({ Component, pageProps }) {
  return (
    <>
      <Meta />
      <Navbar />
      <Component {...pageProps} supabase={supabase} />
      <Analytics />
    </>
  )
}

export default MyApp
