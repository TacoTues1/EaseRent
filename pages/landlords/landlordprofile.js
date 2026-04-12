import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import Navbar from '../../components/Navbar'
import Footer from '@/components/Footer'

export default function LandlordProfile() {
  const router = useRouter()
  const { id } = router.query
  const [landlord, setLandlord] = useState(null)
  const [properties, setProperties] = useState([])
  const [landlordReviewStats, setLandlordReviewStats] = useState({ avg: 0, count: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadLandlordProfile()
    }
  }, [id])

  async function loadLandlordProfile() {
    setLoading(true)
    
    // Get landlord details
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()
      
    if (profileData) {
      setLandlord(profileData)

      const { data: ratingRows } = await supabase
        .from('landlord_ratings')
        .select('rating')
        .eq('landlord_id', id)

      const ratingCount = (ratingRows || []).length
      const ratingAvg = ratingCount > 0
        ? (ratingRows.reduce((sum, row) => sum + Number(row.rating || 0), 0) / ratingCount)
        : 0
      setLandlordReviewStats({ avg: ratingAvg, count: ratingCount })
      
      // Get landlord properties
      const { data: propsData } = await supabase
        .from('properties')
        .select('*')
        .eq('landlord', id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
      
      if (propsData) setProperties(propsData)
    }
    
    setLoading(false)
  }

  // Format joined date helper
  const getJoinedDetailedText = (dateString) => {
    if (!dateString) return 'Unknown'
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now - date)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    const diffMonths = Math.floor(diffDays / 30)
    const diffYears = Math.floor(diffMonths / 12)

    if (diffYears > 0) {
      const remainingMonths = diffMonths % 12
      if (remainingMonths > 0) return `${diffYears} year${diffYears > 1 ? 's' : ''}, ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`
      return `${diffYears} year${diffYears > 1 ? 's' : ''}`
    }
    if (diffMonths > 0) return `${diffMonths} month${diffMonths > 1 ? 's' : ''}`
    return 'Less than a month'
  }

  const formatJoinedYear = (dateString) => {
    if (!dateString) return ''
    return new Date(dateString).getFullYear()
  }

  if (loading) {
    return (
      <>
        <Head>
          <title>Loading Profile... | Abalay</title>
        </Head>
        <Navbar />
        <div className="min-h-[calc(100vh-64px)] bg-[#FDFDFD] font-sans py-12 px-4">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 items-start">
            
            {/* Skeleton Profile Details */}
            <div className="w-full md:w-[320px] shrink-0 bg-white rounded-2xl border border-gray-100 p-8 flex flex-col items-center shadow-sm skeleton-shimmer">
              <div className="w-32 h-32 rounded-full bg-gray-200 mb-6"></div>
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-3"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-6"></div>
              <div className="w-full h-[1px] bg-gray-100 mb-6"></div>
              <div className="w-full space-y-4">
                <div className="h-12 bg-gray-50 rounded-xl w-full"></div>
                <div className="h-12 bg-gray-50 rounded-xl w-full"></div>
              </div>
            </div>

            {/* Skeleton Properties Section */}
            <div className="flex-1 w-full">
              <div className="flex items-center justify-between mb-8">
                <div className="h-8 bg-gray-200 rounded w-1/3 skeleton-shimmer"></div>
                <div className="h-8 bg-gray-200 rounded w-32 skeleton-shimmer"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm skeleton-shimmer">
                    <div className="h-[200px] bg-gray-200 w-full"></div>
                    <div className="p-5">
                      <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
                      <div className="h-4 bg-gray-100 rounded w-1/2 mb-6"></div>
                      <div className="h-10 bg-gray-50 rounded-lg w-full mt-auto"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
        <Footer />
      </>
    )
  }

  if (!landlord || landlord.role !== 'landlord') {
    return (
      <>
        <Head><title>Not Found | Abalay</title></Head>
        <Navbar />
        <div className="min-h-[calc(100vh-64px)] bg-[#FDFDFD] flex flex-col items-center justify-center p-4">
          <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm text-center max-w-sm w-full">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Landlord not found</h1>
            <p className="text-gray-500 mb-6 text-sm">The profile you are looking for does not exist or has been removed.</p>
            <Link href="/landlords/landlordlist" className="inline-flex items-center justify-center gap-2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors w-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
              View the community
            </Link>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Head>
        <title>{landlord.first_name}'s Profile | Abalay</title>
      </Head>
      <Navbar />
      <div className="min-h-[calc(100vh-64px)] bg-[#FDFDFD] font-sans py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-8 items-start">
          
          {/* Left Side: Profile Details */}
          <div className="w-full md:w-[320px] shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-gray-50 to-gray-100/50"></div>
            
            <div className="relative w-32 h-32 rounded-full overflow-hidden bg-white mx-auto mb-5 border-4 border-white shadow-sm flex-shrink-0">
              {landlord.avatar_url ? (
                <img src={landlord.avatar_url} alt={landlord.first_name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-50 flex items-center justify-center text-gray-400">
                  <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                </div>
              )}
            </div>
            
            <div className="relative text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900 mb-2">
                {landlord.first_name} {landlord.last_name || ''}
              </h1>
              
              <div className="flex items-center justify-center gap-1.5 mb-4">
                <svg className="w-4 h-4 text-gray-900 fill-gray-900" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
                <span className="text-sm font-semibold text-gray-900">{landlordReviewStats.avg.toFixed(1)}</span>
                <span className="text-sm text-gray-500">({landlordReviewStats.count} reviews)</span>
              </div>
            </div>

            <div className="w-full border-t border-gray-100 pt-6 mt-2 flex flex-col gap-4">
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50/50">
                <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-sm text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <div>
                  <span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Time on Abalay</span>
                  <span className="block text-sm font-semibold text-gray-900">{getJoinedDetailedText(landlord.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50/50">
                <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center shrink-0 shadow-sm text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                </div>
                <div>
                  <span className="block text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-0.5">Active Listings</span>
                  <span className="block text-sm font-semibold text-gray-900">{properties.length} {properties.length === 1 ? 'property' : 'properties'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Properties Section */}
          <div className="flex-1 w-full md:pl-2">
            <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Listings by {landlord.first_name}</h2>
              <Link href="/landlords/landlordlist" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                View all hosts
              </Link>
            </div>
            
            {properties.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center h-64 flex flex-col items-center justify-center shadow-sm">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 border border-gray-100 text-gray-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-1">No active listings</h3>
                <p className="text-gray-500 text-sm">This landlord doesn't have any public properties currently.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {properties.map(p => (
                  <Link key={p.id} href={`/properties/${p.id}`} className="block h-full">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col h-full overflow-hidden">
                      <div className="relative h-[200px] w-full bg-gray-50 overflow-hidden">
                        <img 
                          src={p.images?.[0] || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop'} 
                          alt={p.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-3 left-3 px-2.5 py-1 bg-white/95 backdrop-blur-sm shadow-sm rounded-md text-[11px] font-bold uppercase tracking-wider text-gray-900">
                          {p.status === 'available' ? 'Available' : 'Occupied'}
                        </div>
                      </div>
                      <div className="p-5 flex-1 flex flex-col">
                        <div className="flex justify-between items-start mb-1.5 gap-3">
                          <h3 className="text-[15px] font-semibold text-gray-900 line-clamp-1">{p.title}</h3>
                          <p className="text-[15px] font-bold text-gray-900 shrink-0">₱{Number(p.price).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-500 text-[13px] mb-5 line-clamp-1">
                          <svg className="w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                          <span>{p.address ? `${p.address}, ` : ''}{p.city}</span>
                        </div>
                        
                        <div className="mt-auto flex items-center justify-between pt-4 border-t border-gray-50 text-[13px] font-medium text-gray-600">
                          <div className="flex items-center gap-1.5">
                             <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                             {p.bedrooms || 1} Bed
                          </div>
                          <div className="flex items-center gap-1.5">
                             <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                             {p.bathrooms || 1} Bath
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
      <Footer />
    </>
  )
}
