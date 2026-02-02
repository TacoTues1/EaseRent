import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'
import Head from 'next/head'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'

export default function Compare() {
  const router = useRouter()
  const [properties, setProperties] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!router.isReady) return

    const { ids } = router.query
    if (ids) {
      fetchProperties(ids.split(','))
    } else {
      setLoading(false)
    }
  }, [router.isReady, router.query])

  async function fetchProperties(ids) {
    setLoading(true)
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .in('id', ids)
    
    if (data) {
      setProperties(data)
    }
    setLoading(false)
  }

  const removeProperty = (id) => {
    const updatedProperties = properties.filter(p => p.id !== id)
    setProperties(updatedProperties)
    
    const newIds = updatedProperties.map(p => p.id).join(',')
    if (newIds) {
      router.replace({ pathname: '/compare', query: { ids: newIds } }, undefined, { shallow: true })
    } else {
      router.push('/compare')
    }
  }

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <Navbar />
        <div className="flex-grow flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-gray-100 border-t-black"></div>
                <p className="text-gray-400 text-sm animate-pulse">Loading comparison...</p>
            </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-black font-sans flex flex-col selection:bg-black selection:text-white">
      <Head>
        <title>Compare Properties | EaseRent</title>
      </Head>

      <Navbar />

      <main className="flex-grow w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
            <div>
                <button 
                    onClick={() => router.back()} 
                    className="group inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-black mb-3 transition-colors cursor-pointer"
                >
                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center group-hover:border-black transition-colors shadow-sm">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </div>
                    Back to Listings
                </button>
                <h1 className="text-4xl font-extrabold tracking-tight text-gray-900">Compare Properties</h1>
                <p className="text-lg text-gray-500 mt-2">
                    {properties.length > 0 
                      ? `Analyzing features of ${properties.length} selected propert${properties.length === 1 ? 'y' : 'ies'}.`
                      : 'Select properties to begin comparison'
                    }
                </p>
            </div>
            
            {properties.length > 0 && (
                <button 
                    onClick={() => router.push('/compare')} 
                    className="text-sm font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-5 py-2.5 rounded-xl transition-colors cursor-pointer"
                >
                    Clear Comparison
                </button>
            )}
        </div>

        {properties.length === 0 ? (
          // Empty State
          <div className="bg-white rounded-[2rem] border border-dashed border-gray-200 p-16 text-center max-w-3xl mx-auto shadow-sm">
            <div className="bg-gray-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">No properties selected</h3>
            <p className="text-gray-500 mb-10 text-lg max-w-md mx-auto leading-relaxed">
              Go back to the listings and look for the <span className="font-bold text-black">Compare</span> button to add properties to this list.
            </p>
            <Link href="/properties" className="inline-flex items-center gap-2 px-10 py-4 bg-black text-white rounded-2xl font-bold hover:bg-gray-900 transition-all hover:scale-105 shadow-xl shadow-gray-200">
              Browse Properties
            </Link>
          </div>
        ) : (
          // Comparison Table Container
          <div className="relative isolate">
             {/* Decorative Background behind table */}
            <div className="absolute inset-0 bg-white shadow-xl shadow-gray-200/50 rounded-3xl -z-10 ring-1 ring-gray-100" />

            <div className="overflow-x-auto custom-scrollbar pb-2 rounded-3xl">
              <table className="w-full text-left border-collapse min-w-max">
                <thead>
                  <tr>
                    {/* Sticky Label Column Header */}
                    <th className="p-6 min-w-[240px] w-[240px] sticky left-0 z-30 bg-white border-b border-gray-100">
                        <div className="h-full flex flex-col justify-end pb-2">
                             <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Property Specs</span>
                        </div>
                        {/* Right Border Shadow for Stickiness */}
                        <div className="absolute inset-y-0 right-0 w-px bg-gray-100" />
                        <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-gray-50/20 to-transparent pointer-events-none" />
                    </th>
                    
                    {/* Property Cards Headers */}
                    {properties.map(property => (
                      <th key={property.id} className="p-6 min-w-[350px] w-[350px] border-b border-gray-100 align-bottom group bg-white">
                         <div className="relative">
                            {/* Remove Button */}
                            <button 
                                onClick={() => removeProperty(property.id)}
                                className="absolute -top-2 -right-2 z-20 bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 rounded-full p-2 transition-all shadow-md opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 duration-200"
                                title="Remove from comparison"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>

                            <div className="space-y-5">
                                {/* Image */}
                                <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden bg-gray-100 relative shadow-sm group-hover:shadow-lg transition-all duration-300">
                                    {property.images && property.images[0] ? (
                                        <img 
                                            src={property.images[0]} 
                                            alt={property.title}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-400 bg-gray-100">
                                            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        </div>
                                    )}
                                    {/* Status Badge */}
                                    <div className="absolute top-3 left-3">
                                        <span className={`px-3 py-1.5 text-xs font-bold rounded-lg uppercase tracking-wide shadow-sm backdrop-blur-md ${
                                            property.status === 'For Rent' 
                                            ? 'bg-white/95 text-black' 
                                            : 'bg-black/80 text-white'
                                        }`}>
                                            {property.status || 'Available'}
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Title & Price */}
                                <div className="space-y-2">
                                    <h3 className="font-bold text-xl leading-snug line-clamp-2 min-h-[3.5rem] group-hover:text-blue-600 transition-colors">
                                        <Link href={`/properties/${property.id}`}>
                                            {property.title}
                                        </Link>
                                    </h3>
                                    <p className="text-2xl font-black text-black tracking-tight">
                                        ₱{property.price?.toLocaleString()}
                                        <span className="text-base font-medium text-gray-500 ml-1">
                                            {property.status === 'For Rent' ? '/mo' : ''}
                                        </span>
                                    </p>
                                </div>
                            </div>
                         </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50">
                  {/* Reusable Row Component logic inline */}
                  {[
                      { label: 'Location', key: 'location', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' },
                      { label: 'Type', key: 'type', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
                      { label: 'Bedrooms', key: 'bedrooms', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
                      { label: 'Bathrooms', key: 'bathrooms', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
                      { label: 'Floor Area', key: 'sqm', icon: 'M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4' }
                  ].map((row, idx) => (
                    <tr key={row.key} className={idx % 2 === 0 ? "bg-gray-50/30" : "bg-white"}>
                        <td className={`p-6 text-sm font-semibold text-gray-500 sticky left-0 z-10 border-r border-gray-100/50 backdrop-blur-md ${idx % 2 === 0 ? "bg-gray-50/90" : "bg-white/90"}`}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-gray-100 text-gray-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={row.icon} /></svg>
                                </div>
                                {row.label}
                            </div>
                        </td>
                        {properties.map(property => (
                            <td key={property.id} className="p-6 text-base text-gray-900 font-medium">
                                {row.key === 'location' && (
                                    <span className="block max-w-[250px] leading-relaxed text-gray-600">{property.address}, {property.city}</span>
                                )}
                                {row.key === 'type' && <span className="capitalize px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-bold">{property.type}</span>}
                                {row.key === 'bedrooms' && <span>{property.bedrooms || 0} Beds</span>}
                                {row.key === 'bathrooms' && <span>{property.bathrooms || 0} Baths</span>}
                                {row.key === 'sqm' && <span>{property.sqm ? `${property.sqm} sqm` : 'N/A'}</span>}
                            </td>
                        ))}
                    </tr>
                  ))}

                  {/* Amenities - Specific Layout */}
                  <tr className="bg-gray-50/30">
                    <td className="p-6 text-sm font-semibold text-gray-500 sticky left-0 z-10 border-r border-gray-100/50 bg-gray-50/90 backdrop-blur-md align-top">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-gray-100 text-gray-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                            </div>
                            Amenities
                        </div>
                    </td>
                    {properties.map(property => (
                      <td key={property.id} className="p-6 align-top">
                        {property.amenities && property.amenities.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {property.amenities.map((amenity, index) => (
                              <span key={index} className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold shadow-sm">
                                {amenity}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm italic flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            No amenities listed
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>

                  {/* Action Footer Row */}
                  <tr className="bg-white">
                    <td className="p-6 sticky left-0 z-10 bg-white border-r border-gray-100"></td>
                    {properties.map(property => (
                      <td key={property.id} className="p-6 align-bottom">
                        <Link 
                            href={`/properties/${property.id}`}
                            className="flex items-center justify-center gap-2 w-full bg-black text-white py-4 rounded-xl font-bold text-sm hover:bg-gray-800 transition-all hover:scale-[1.02] shadow-lg active:scale-95"
                        >
                            View Full Details
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                        </Link>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  )
}