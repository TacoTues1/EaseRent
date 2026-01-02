import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabaseClient'
import Link from 'next/link'

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

  // Helper to check if amenity exists
  const hasAmenity = (property, amenity) => {
    return property.amenities && property.amenities.includes(amenity)
  }

  // Common amenities to compare
  const allAmenities = ['Wifi', 'Pool', 'Gym', 'Parking', 'Air conditioning', 'Pet friendly', 'Security', 'Balcony']

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200 border-t-black"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-black">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-black font-bold text-sm uppercase tracking-wide transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Back to Listings
                </Link>
                <h1 className="text-xl font-black uppercase tracking-tight">Compare Properties</h1>
                <div className="w-24"></div> {/* Spacer for centering */}
            </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 overflow-x-auto">
            {properties.length === 0 ? (
                <div className="text-center py-20">
                    <p className="text-gray-500 mb-4">No properties selected to compare.</p>
                    <Link href="/" className="text-black font-bold underline">Go back to select properties</Link>
                </div>
            ) : (
                <div className="min-w-[800px]">
                    <table className="w-full text-left border-collapse">
                        <tbody>
                            {/* Images Row */}
                            <tr>
                                <td className="p-4 w-48 bg-gray-50 align-top pt-20 font-bold text-gray-400 text-xs uppercase tracking-wider">Property</td>
                                {properties.map(property => (
                                    <td key={property.id} className="p-4 w-80 align-bottom">
                                        <div className="relative aspect-[4/3] rounded-xl overflow-hidden shadow-lg border border-gray-100 mb-4 group cursor-pointer" onClick={() => router.push(`/properties/${property.id}`)}>
                                            <img 
                                                src={property.images?.[0] || '/placeholder.jpg'} 
                                                alt={property.title}
                                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors"></div>
                                        </div>
                                        <h3 className="text-lg font-bold leading-tight mb-1">{property.title}</h3>
                                        <p className="text-xs text-gray-500">{property.address}, {property.city}</p>
                                    </td>
                                ))}
                            </tr>

                            {/* Price Row */}
                            <tr className="border-t border-gray-200 hover:bg-white transition-colors">
                                <td className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Price</td>
                                {properties.map(property => (
                                    <td key={property.id} className="p-4">
                                        <span className="text-2xl font-black block">₱{Number(property.price).toLocaleString()}</span>
                                        <span className="text-xs text-gray-500 font-medium">per month</span>
                                    </td>
                                ))}
                            </tr>

                            {/* Specs Row */}
                            <tr className="border-t border-gray-200 bg-white">
                                <td className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Specs</td>
                                {properties.map(property => (
                                    <td key={property.id} className="p-4">
                                        <div className="flex gap-4 text-sm font-medium">
                                            <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg min-w-[60px]">
                                                <span className="font-bold text-lg">{property.bedrooms}</span>
                                                <span className="text-[10px] text-gray-500 uppercase">Beds</span>
                                            </div>
                                            <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg min-w-[60px]">
                                                <span className="font-bold text-lg">{property.bathrooms}</span>
                                                <span className="text-[10px] text-gray-500 uppercase">Baths</span>
                                            </div>
                                            <div className="flex flex-col items-center p-2 bg-gray-50 rounded-lg min-w-[60px]">
                                                <span className="font-bold text-lg">{property.area_sqft}</span>
                                                <span className="text-[10px] text-gray-500 uppercase">Sqm</span>
                                            </div>
                                        </div>
                                    </td>
                                ))}
                            </tr>

                             {/* Status Row */}
                             <tr className="border-t border-gray-200 hover:bg-white transition-colors">
                                <td className="p-4 font-bold text-xs uppercase tracking-wider text-gray-500">Availability</td>
                                {properties.map(property => (
                                    <td key={property.id} className="p-4">
                                         <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${
                                            property.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                         }`}>
                                            {property.status}
                                         </span>
                                    </td>
                                ))}
                            </tr>

                            {/* Amenities Header */}
                            <tr className="bg-gray-100">
                                <td colSpan={properties.length + 1} className="p-2 px-4 text-xs font-bold uppercase tracking-wider text-gray-500 mt-4">
                                    Amenities
                                </td>
                            </tr>

                            {/* Dynamic Amenities Rows */}
                            {allAmenities.map((amenity, idx) => (
                                <tr key={amenity} className={`border-b border-gray-100 hover:bg-white transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                    <td className="p-4 text-sm font-medium text-gray-600">{amenity}</td>
                                    {properties.map(property => (
                                        <td key={property.id} className="p-4">
                                            {hasAmenity(property, amenity) ? (
                                                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                            ) : (
                                                <span className="w-4 h-0.5 bg-gray-300 block ml-1"></span>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            
                             {/* Action Buttons */}
                             <tr className="bg-white">
                                <td className="p-4"></td>
                                {properties.map(property => (
                                    <td key={property.id} className="p-4 pt-8">
                                        <button 
                                            onClick={() => router.push(`/properties/${property.id}`)}
                                            className="w-full bg-black text-white py-3 rounded-xl font-bold text-sm hover:bg-gray-800 shadow-md transition-all cursor-pointer"
                                        >
                                            View Details
                                        </button>
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    </div>
  )
}