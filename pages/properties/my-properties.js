import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useRouter } from 'next/router'
import Footer from '../../components/Footer'
import AuthModal from '../../components/AuthModal'
import Lottie from "lottie-react"
import loadingAnimation from "../../assets/loading.json"

export default function MyProperties() {
    const router = useRouter()
    const [properties, setProperties] = useState([])
    const [loading, setLoading] = useState(true)
    const [session, setSession] = useState(null)
    const [profile, setProfile] = useState(null)

    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState('')
    const [filterStatus, setFilterStatus] = useState('all') // 'all', 'available', 'occupied'
    const [currentImageIndex, setCurrentImageIndex] = useState({})
    const [propertyStats, setPropertyStats] = useState({})

    // Helper functions for image slider
    const getPropertyImages = (property) => {
        if (property.images && Array.isArray(property.images) && property.images.length > 0) {
            return property.images
        }
        return ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop']
    }

    const nextImage = (propertyId, imagesLength) => {
        setCurrentImageIndex(prev => ({
            ...prev,
            [propertyId]: ((prev[propertyId] || 0) + 1) % imagesLength
        }))
    }

    const prevImage = (propertyId, imagesLength) => {
        setCurrentImageIndex(prev => ({
            ...prev,
            [propertyId]: ((prev[propertyId] || 0) - 1 + imagesLength) % imagesLength
        }))
    }

    useEffect(() => {
        supabase.auth.getSession().then(result => {
            if (result.data?.session) {
                setSession(result.data.session)
                loadProfile(result.data.session.user.id)
            } else {
                router.push('/')
            }
        })
    }, [])

    useEffect(() => {
        if (session) {
            loadProperties()
            loadPropertyStats()
        }
    }, [session, searchQuery, filterStatus]) // Reload when search or filter changes

    // Auto-slide images every 3 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentImageIndex(prev => {
                const nextIndices = { ...prev }
                properties.forEach(p => {
                    const imgs = getPropertyImages(p)
                    if (imgs.length > 1) {
                        const current = prev[p.id] || 0
                        nextIndices[p.id] = (current + 1) % imgs.length
                    }
                })
                return nextIndices
            })
        }, 3000)
        return () => clearInterval(interval)
    }, [properties])

    async function loadProfile(userId) {
        const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle()
        if (data) setProfile(data)
    }

    async function loadProperties() {
        if (!session) return

        setLoading(true)
        let query = supabase
            .from('properties')
            .select('*')
            .eq('is_deleted', false)
            .eq('landlord', session.user.id)
            .order('created_at', { ascending: false })

        if (searchQuery.trim()) {
            query = query.or(`title.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%,address.ilike.%${searchQuery}%`)
        }

        if (filterStatus !== 'all') {
            query = query.eq('status', filterStatus)
        }

        const { data, error } = await query
        if (error) {
            console.error('Error loading properties:', error)
        } else {
            setProperties(data || [])
        }
        setLoading(false)
    }

    async function loadPropertyStats() {
        const { data } = await supabase.from('property_stats').select('*')
        if (data) {
            const statsMap = {}
            data.forEach(stat => {
                statsMap[stat.property_id] = {
                    favorite_count: stat.favorite_count || 0,
                    avg_rating: stat.avg_rating || 0,
                    review_count: stat.review_count || 0
                }
            })
            setPropertyStats(statsMap)
        }
    }

    const handleDelete = async (e, propertyId) => {
        e.stopPropagation()
        if (!confirm("Are you sure you want to delete this property?")) return

        const { error } = await supabase.from('properties').update({ is_deleted: true }).eq('id', propertyId)
        if (error) {
            alert("Error deleting property")
        } else {
            loadProperties()
        }
    }

    return (
        <div className="min-h-screen bg-[#F3F4F5] font-sans text-black flex flex-col">
            <div className="max-w-6xl mx-auto w-full px-6 py-8 flex-1">

                {/* Header Section (Matching Schedule Page) */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-black tracking-tight">My Properties</h1>
                        <p className="text-sm text-gray-500 mt-1">Manage your uploaded properties</p>
                    </div>
                    <button
                        onClick={() => router.push('/properties/new')}
                        className="px-6 py-2 bg-black text-white text-sm font-bold rounded-full cursor-pointer hover:shadow-lg transition-shadow"
                    >
                        + Add Property
                    </button>
                </div>

                {/* Search & Filter Bar */}
                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <input
                            type="text"
                            placeholder="Search by title, city, or address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-black focus:border-transparent outline-none transition-all shadow-sm"
                        />
                        <svg className="absolute left-3.5 top-3.5 text-gray-400 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex p-1 bg-gray-100 rounded-xl self-start md:self-auto">
                        {['all', 'available', 'occupied'].map((status) => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 text-sm font-bold rounded-lg capitalize transition-all cursor-pointer ${filterStatus === status
                                    ? 'bg-white text-black shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {status}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Properties Grid */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Lottie
                            animationData={loadingAnimation}
                            loop={true}
                            className="w-48 h-48"
                        />
                        <p className="text-gray-500 font-medium mt-2">Loading properties...</p>
                    </div>
                ) : properties.length === 0 ? (
                    <div className="text-center py-20 bg-white border-2 border-dashed border-gray-100 rounded-3xl">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-300">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">No properties found</h3>
                        <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm">
                            {searchQuery || filterStatus !== 'all' ? "Try adjusting your search or filters." : "Start by adding your first property."}
                        </p>
                        <button
                            onClick={() => router.push('/properties/new')}
                            className="px-6 py-2.5 bg-black text-white text-sm font-bold rounded-xl hover:bg-gray-800 transition-all shadow-lg"
                        >
                            Add New Property
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-12">
                        {properties.map((property) => {
                            const images = getPropertyImages(property)
                            const currentIndex = currentImageIndex[property.id] || 0
                            const stats = propertyStats[property.id] || { favorite_count: 0, avg_rating: 0, review_count: 0 }
                            const isTenantsFavorite = stats.favorite_count >= 1

                            return (
                                <div
                                    key={property.id}
                                    className="group bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden cursor-pointer flex flex-col h-full hover:shadow-md transition-shadow"
                                    onClick={() => router.push(`/properties/${property.id}`)}
                                >
                                    {/* Image Slider */}
                                    <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
                                        <img
                                            src={images[currentIndex]}
                                            alt={property.title}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                        />

                                        {/* Status Badge */}
                                        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 items-start">
                                            <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-lg shadow-sm backdrop-blur-md ${property.status === 'available' ? 'bg-white text-black-700' :
                                                property.status === 'occupied' ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
                                                }`}>
                                                {property.status}
                                            </span>
                                            {isTenantsFavorite && (
                                                <span className="px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded-lg shadow-sm backdrop-blur-md bg-rose-500 text-white flex items-center gap-1">
                                                    <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                                                    {stats.favorite_count}
                                                </span>
                                            )}
                                        </div>

                                        {/* Edit/Delete Actions Overlay (Only visible on hover or if mobile) */}
                                        <div className="absolute top-3 right-3 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200" onClick={e => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); router.push(`/properties/edit/${property.id}`) }}
                                                className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center text-gray-700 hover:text-black hover:bg-white transition-colors cursor-pointer"
                                                title="Edit Property"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                            </button>
                                            <button
                                                onClick={(e) => handleDelete(e, property.id)}
                                                className="w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                                title="Delete Property"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>

                                        {/* Simple Overlay for Price */}
                                        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                                            <p className="text-white font-bold text-lg leading-none">₱{Number(property.price).toLocaleString()}</p>
                                            <p className="text-white/80 text-[10px] font-medium uppercase tracking-wider mt-0.5">per month</p>
                                        </div>

                                        {/* Image Arrows */}
                                        {/* {images.length > 1 && (
                                            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 hidden sm:block">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); prevImage(property.id, images.length); }}
                                                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-black w-6 h-6 flex items-center justify-center rounded-full shadow-sm"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); nextImage(property.id, images.length); }}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-black w-6 h-6 flex items-center justify-center rounded-full shadow-sm"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                </button>
                                            </div>
                                        )} */}

                                        {/* Image Dots */}
                                        {images.length > 1 && (
                                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                                                {images.map((_, idx) => (
                                                    <div
                                                        key={idx}
                                                        className={`h-1 rounded-full shadow-sm transition-all ${idx === currentIndex ? 'w-3 bg-white' : 'w-1 bg-white/60'}`}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Content Info */}
                                    <div className="p-4 flex-1 flex flex-col">
                                        <div className="mb-2">
                                            <h3 className="text-sm font-bold text-gray-900 truncate" title={property.title}>{property.title}</h3>
                                            <div className="flex items-center gap-1 text-gray-500">
                                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                <p className="text-xs truncate">{property.city}, {property.address}</p>
                                            </div>
                                        </div>

                                        {/* Ratings Row */}
                                        <div className="flex items-center gap-2 mb-3">
                                            <div className="flex items-center gap-0.5 bg-gray-50 px-1.5 py-0.5 rounded-md">
                                                <svg className="w-3 h-3 text-yellow-500 fill-yellow-500" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" /></svg>
                                                <span className="text-xs font-bold text-gray-900">{stats.avg_rating > 0 ? stats.avg_rating.toFixed(1) : 'New'}</span>
                                            </div>
                                            <span className="text-[10px] text-gray-400">({stats.review_count} reviews)</span>
                                        </div>

                                        {/* Amenities Icons */}
                                        <div className="flex items-center gap-3 mt-auto pt-3 border-t border-gray-50 text-gray-400">
                                            <div className="flex items-center gap-1" title={`${property.bedrooms} Bedrooms`}>
                                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 13c1.66 0 3-1.34 3-3S8.66 7 7 7s-3 1.34-3 3 1.34 3 3 3zm12-6h-8v7H3V5H1v15h2v-3h18v3h2v-9c0-2.21-1.79-4-4-4z" /></svg>
                                                <span className="text-xs font-medium text-gray-600">{property.bedrooms}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title={`${property.bathrooms} Bathrooms`}>
                                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M21 10H7V7c0-1.103.897-2 2-2s2 .897 2 2h2c0-2.206-1.794-4-4-4S5 4.794 5 7v3H3a1 1 0 0 0-1 1v2c0 2.606 1.674 4.823 4 5.65V22h2v-3h8v3h2v-3.35c2.326-.827 4-3.044 4-5.65v-2a1 1 0 0 0-1-1z" /></svg>
                                                <span className="text-xs font-medium text-gray-600">{property.bathrooms}</span>
                                            </div>
                                            <div className="flex items-center gap-1" title={`${property.area_sqft} sqm`}>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                                <span className="text-xs font-medium text-gray-600">{property.area_sqft} sqm</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <Footer />
        </div>
    )
}
