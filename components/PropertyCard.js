import { useRouter } from 'next/router'

export default function PropertyCard({ 
  property, 
  images, 
  currentIndex = 0, 
  isSelectedForCompare = false, 
  isFavorite = false, 
  stats = { favorite_count: 0, avg_rating: 0, review_count: 0 },
  onToggleFavorite,
  onToggleCompare,
  onPrevImage,
  onNextImage,
  showCompare = true
}) {
  const router = useRouter()

  return (
    <div 
      className={`group bg-white rounded-2xl shadow-sm border overflow-hidden cursor-pointer flex flex-col transition-all duration-300 hover:shadow-lg ${isSelectedForCompare ? 'ring-2 ring-black border-black' : 'border-gray-100'}`}
      onClick={() => router.push(`/properties/${property.id}`)}
    >
      {/* Image Slider - Top */}
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        <img 
          src={images[currentIndex] || 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&h=600&fit=crop'} 
          alt={property.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        
        {/* Top Right Icons - Favorite & Compare */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Favorite Heart Button */}
          <button 
            onClick={onToggleFavorite}
            className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all cursor-pointer ${
              isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:bg-white hover:text-red-500'
            }`}
            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </button>

          {/* Compare Checkbox */}
          {showCompare && (
            <label className="flex items-center gap-2 cursor-pointer group/check">
              <input 
                type="checkbox" 
                className="hidden"
                checked={isSelectedForCompare}
                onChange={onToggleCompare}
              />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md shadow-sm transition-all ${isSelectedForCompare ? 'bg-black text-white' : 'bg-white/90 text-gray-400 hover:bg-white'}`}>
                {isSelectedForCompare ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                )}
              </div>
            </label>
          )}
        </div>

        {/* Navigation Arrows */}
        {images.length > 1 && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <button
              onClick={(e) => { e.stopPropagation(); onPrevImage?.(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-7 h-7 flex items-center justify-center rounded-full shadow-md cursor-pointer hover:bg-white"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onNextImage?.(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-sm text-black w-7 h-7 flex items-center justify-center rounded-full shadow-md cursor-pointer hover:bg-white"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        )}
        
        {/* Image Indicators */}
        {images.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 z-10">
            {images.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 rounded-full transition-all duration-300 shadow-sm ${
                  idx === currentIndex ? 'w-4 bg-white' : 'w-1 bg-white/60'
                }`}
              />
            ))}
          </div>
        )}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>

        {/* Status Badge & Guest Favorite Badge */}
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
          <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-md shadow-sm backdrop-blur-md ${
            property.status === 'available'
              ? 'bg-white text-black' 
              : 'bg-black/80 text-white'
          }`}>
            {property.status === 'available' ? 'Available' : property.status === 'occupied' ? 'Occupied' : 'Not Available'}
          </span>
          {stats.favorite_count >= 3 && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md shadow-sm backdrop-blur-md bg-gradient-to-r from-pink-500 to-red-500 text-white flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              Guest Favorite
            </span>
          )}
        </div>

        {/* Price Overlay */}
        <div className="absolute bottom-3 left-3 z-10 text-white">
          <p className="text-lg font-bold drop-shadow-md">₱{Number(property.price).toLocaleString()}</p>
          <p className="text-[9px] opacity-90 font-medium uppercase tracking-wider">per month</p>
        </div>
      </div>
      
      {/* Property Info - Bottom */}
      <div className="p-4">
        <div className="mb-2">
          <div className="flex justify-between items-start mb-0.5">
            <h3 className="text-base font-bold text-gray-900 line-clamp-1">{property.title}</h3>
            {/* Rating Display */}
            {stats.review_count > 0 && (
              <div className="flex items-center gap-1 text-xs shrink-0">
                <svg className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <span className="font-bold text-gray-900">{Number(stats.avg_rating).toFixed(1)}</span>
                <span className="text-gray-400">({stats.review_count})</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 text-gray-500 text-xs">
            <span className="truncate">{property.city}, Philippines</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3 text-gray-600 text-xs">
          <span className="flex items-center gap-1 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            {property.bedrooms}
          </span>
          <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
          <span className="flex items-center gap-1 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>
            {property.bathrooms}
          </span>
          <span className="w-0.5 h-0.5 bg-gray-300 rounded-full"></span>
          <span className="flex items-center gap-1 font-medium">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
            {property.area_sqft || 0} sqm
          </span>
        </div>
      </div>
    </div>
  )
}
