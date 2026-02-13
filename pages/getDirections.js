// pages/getDirections.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function GetDirections() {
  const router = useRouter();
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const userMarker = useRef(null);
  const userArrow = useRef(null);
  const destMarker = useRef(null);
  const routeLines = useRef([]);
  const isInitializing = useRef(false);
  const watchId = useRef(null);

  // Throttle ref to prevent API spamming during navigation
  const lastRouteUpdate = useRef(0);

  // Data State
  const [fromAddress, setFromAddress] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [userLocation, setUserLocation] = useState(null);
  const [destLocation, setDestLocation] = useState(null);
  const [isRouting, setIsRouting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [isPanelHidden, setIsPanelHidden] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  // Autocomplete State
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeout = useRef(null);

  // Routes Data State
  const [routesData, setRoutesData] = useState({
    driving: [],
    bike: [],
    foot: []
  });
  const [selectedMode, setSelectedMode] = useState('driving');

  // Selected route index for each mode (0 = primary, 1 = alternate)
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  // Store the active route coordinates for navigation
  const activeRouteCoords = useRef([]);

  const formatDuration = (seconds) => {
    if (!seconds) return '--';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins} min`;
  };

  const formatDistance = (meters) => {
    if (!meters && meters !== 0) return '--';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mapInstance.current || isInitializing.current) return;

    isInitializing.current = true;

    import('leaflet').then((L) => {
      if (!mapRef.current || mapInstance.current || mapRef.current._leaflet_id) {
        isInitializing.current = false;
        return;
      }
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      });

      // CartoDB Voyager Tiles (Premium Look)
      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false
      }).setView([10.3157, 123.8854], 13);

      L.control.zoom({ position: 'topright' }).addTo(map);

      // Add Attribution manually in a nicer way or use standard
      L.control.attribution({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(map);

      mapInstance.current = map;
      isInitializing.current = false;
    }).catch(err => {
      console.error("Failed to load Leaflet", err);
      isInitializing.current = false;
    });
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      isInitializing.current = false;
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, []);

  // 2. Handle URL Params
  useEffect(() => {
    if (router.isReady) {
      const { to, lat, lng, auto } = router.query;
      if (to) setToAddress(to);

      const checkMapReady = setInterval(() => {
        if (mapInstance.current) {
          clearInterval(checkMapReady);
          import('leaflet').then((L) => {
            if (lat && lng) {
              const dLat = parseFloat(lat);
              const dLng = parseFloat(lng);
              setDestLocation({ lat: dLat, lng: dLng });
              addDestinationMarker(dLat, dLng, L);
              // Auto locate if destination is present
              handleShowMyLocation();
            } else if (to) {
              geocodeAddress(to, L).then(() => {
                // Auto locate after geocoding
                handleShowMyLocation();
              });
            } else if (auto === 'true') {
              handleShowMyLocation();
            }
          });
        }
      }, 100);
      return () => clearInterval(checkMapReady);
    }
  }, [router.isReady, router.query]);

  // --- Auto-Route Trigger ---
  // This useEffect ensures that once both userLocation and destLocation are set,
  // the route calculation is triggered automatically.
  useEffect(() => {
    if (userLocation && destLocation && mapInstance.current) {
      // Only calculate if we haven't already (or if forced by some other logic)
      // But here we just want to ensure the initial line is drawn upon loading both points.
      // We check if routes are empty to avoid re-fetching on every small update unless explicitly navigating
      if (routesData.driving.length === 0 && !isRouting) {
        import('leaflet').then(L => {
          calculateAllRoutes(userLocation, destLocation, L);
        });
      }
    }
  }, [userLocation, destLocation]);

  // --- Markers & Geocoding ---
  const addDestinationMarker = (lat, lng, L) => {
    if (!mapInstance.current) return;
    if (destMarker.current) destMarker.current.remove();

    // Custom Red Pin Marker
    const redIcon = L.divIcon({
      className: 'bg-transparent',
      html: `
        <div class="relative w-12 h-12">
            <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-8 flex items-center justify-center">
                 <div class="w-3 h-1 bg-black/20 blur-[2px] rounded-full absolute bottom-0.5"></div>
                 <svg class="w-8 h-8 text-rose-600 filter drop-shadow-md z-10" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    <circle cx="12" cy="9" r="2.5" class="text-white" fill="currentColor" />
                 </svg>
            </div>
        </div>
      `,
      iconSize: [, 48],
      iconAnchor: [24, 46], // Tip of pin
      popupAnchor: [0, -25]
    });

    const marker = L.marker([lat, lng], { icon: redIcon }).addTo(mapInstance.current).bindPopup("<b>Property Location</b>").openPopup();
    destMarker.current = marker;
    mapInstance.current.setView([lat, lng], 15);
  };

  const geocodeAddress = async (address, L) => {
    setStatusMsg('Locating property...');
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setDestLocation({ lat, lng });
        addDestinationMarker(lat, lng, L);
        setStatusMsg('');
        return true;
      } else {
        setStatusMsg('Location not found.');
        return false;
      }
    } catch (err) {
      setStatusMsg('Error locating property.');
      return false;
    }
  };

  // --- Route Drawing Helper ---
  const drawRoutes = useCallback((routes, LInstance, mode, selectedIdx = 0) => {
    if (!mapInstance.current || !routes || routes.length === 0) return;

    // Clear existing route lines
    routeLines.current.forEach(line => {
      if (line && line.remove) line.remove();
    });
    routeLines.current = [];

    let mainColor = '#111827'; // Default Slate-900
    if (mode === 'bike') mainColor = '#7c3aed'; // Violet
    if (mode === 'foot') mainColor = '#059669'; // Emerald

    // Draw all routes, with non-selected ones first (behind)
    routes.forEach((route, index) => {
      if (index === selectedIdx) return; // Skip selected, draw it last

      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      const polyline = LInstance.polyline(coords, {
        color: '#94a3b8',
        weight: 5,
        opacity: 0.4,
        lineJoin: 'round',
        className: 'route-alternate cursor-pointer hover:opacity-70 transition-opacity'
      }).addTo(mapInstance.current);

      // Make alternate routes clickable to select them
      polyline.on('click', () => {
        setSelectedRouteIndex(index);
        drawRoutes(routes, LInstance, mode, index);
      });

      routeLines.current.push(polyline);
    });

    // Draw selected route last (on top)
    const selectedRoute = routes[selectedIdx];
    if (selectedRoute) {
      const selectedCoords = selectedRoute.geometry.coordinates.map(c => [c[1], c[0]]);

      // Store active route coordinates for navigation
      activeRouteCoords.current = selectedCoords;

      // Outer glow for visibility (optional)
      const glow = LInstance.polyline(selectedCoords, {
        color: '#ffffff',
        weight: 9,
        opacity: 0.8,
        lineJoin: 'round'
      }).addTo(mapInstance.current);
      routeLines.current.push(glow);

      const selectedPolyline = LInstance.polyline(selectedCoords, {
        color: mainColor,
        weight: 6,
        opacity: 1.0,
        lineJoin: 'round',
        className: 'route-selected'
      }).addTo(mapInstance.current);

      routeLines.current.push(selectedPolyline);

      // Only fit bounds if we are NOT navigating
      if (!isNavigating) {
        mapInstance.current.fitBounds(selectedPolyline.getBounds(), {
          paddingTopLeft: [50, 50],
          paddingBottomRight: [50, 350]
        });
      }
    }
  }, [isNavigating]);

  // --- Route Calculation ---
  const fetchRouteData = async (profile, start, end) => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/${profile}/${start.lng},${start.lat};${end.lng},${end.lat}?alternatives=true&overview=full&geometries=geojson&steps=true`
      );
      const data = await response.json();
      if (data.code === 'Ok' && data.routes.length > 0) return data.routes;
      return [];
    } catch (error) { return []; }
  };

  // Wrapped in useCallback to use in useEffect
  const calculateAllRoutes = useCallback(async (start, end, L, preserveMode = false) => {
    if (!start || !end) return;

    // Don't show "Calculating" toast if we are just updating the line live
    if (!preserveMode) {
      setIsRouting(true);
      setStatusMsg('Calculating routes...');
    }

    const [drivingRoutes, bikeRoutes, footRoutes] = await Promise.all([
      fetchRouteData('driving', start, end),
      fetchRouteData('bike', start, end),
      fetchRouteData('foot', start, end)
    ]);

    setRoutesData({ driving: drivingRoutes, bike: bikeRoutes, foot: footRoutes });

    if (!preserveMode) {
      setIsRouting(false);
      setStatusMsg('');
      // Reset to first route when calculating fresh routes
      setSelectedRouteIndex(0);
    }

    // Determine mode: if preserving, keep current. If new calculation, pick best available.
    let modeToUse = selectedMode;
    if (!preserveMode) {
      modeToUse = drivingRoutes.length > 0 ? 'driving' : bikeRoutes.length > 0 ? 'bike' : 'foot';
      setSelectedMode(modeToUse);
    }

    // Get the current route index (preserve during navigation)
    const routeIdx = preserveMode ? selectedRouteIndex : 0;

    // Draw based on the determined mode
    if (modeToUse === 'driving' && drivingRoutes.length > 0) drawRoutes(drivingRoutes, L, 'driving', routeIdx);
    else if (modeToUse === 'bike' && bikeRoutes.length > 0) drawRoutes(bikeRoutes, L, 'bike', routeIdx);
    else if (modeToUse === 'foot' && footRoutes.length > 0) drawRoutes(footRoutes, L, 'foot', routeIdx);
  }, [selectedMode, isNavigating, selectedRouteIndex, drawRoutes]);

  // --- Real-time Route Updater ---
  useEffect(() => {
    // Only update if we are actively navigating, have locations, and the map is ready
    if (isNavigating && userLocation && destLocation && mapInstance.current) {
      const now = Date.now();
      // Throttle updates to every 4 seconds to reduce API calls
      if (now - lastRouteUpdate.current > 4000) {
        lastRouteUpdate.current = now;
        import('leaflet').then(L => {
          // Redraw with current location to get updated geometry if needed
          calculateAllRoutes(userLocation, destLocation, L, true);
        });
      }
    }
  }, [userLocation, isNavigating, destLocation, selectedMode, calculateAllRoutes]);

  const handleAddressChange = (e) => {
    const value = e.target.value;
    setFromAddress(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (value.length > 2) {
      searchTimeout.current = setTimeout(async () => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(value)}&limit=5&addressdetails=1`);
          const data = await res.json();
          setSuggestions(data);
          setShowSuggestions(true);
        } catch (error) { console.error("Autocomplete Error:", error); }
      }, 250);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (suggestion) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    setFromAddress(suggestion.display_name);
    setShowSuggestions(false);
    setUserLocation({ lat, lng });
    if (mapInstance.current) {
      import('leaflet').then((L) => {
        updateUserMarker(lat, lng, L);
        if (destLocation) {
          calculateAllRoutes({ lat, lng }, destLocation, L);
        } else {
          mapInstance.current.setView([lat, lng], 15);
        }
      });
    }
  };

  const updateUserMarker = (lat, lng, L, heading = null) => {
    if (userMarker.current) userMarker.current.remove();
    if (userArrow.current) userArrow.current.remove();

    // Calculate bearing to destination for direction
    let bearingDeg = 0;
    if (destLocation) {
      bearingDeg = calculateBearing(lat, lng, destLocation.lat, destLocation.lng);
    }
    // Use device heading if available
    if (heading !== null && !isNaN(heading)) {
      bearingDeg = heading;
    }

    // Create a sleek navigation marker
    const navigationIcon = L.divIcon({
      className: 'bg-transparent',
      html: `
        <div class="relative w-16 h-16 flex items-center justify-center">
          <div class="absolute w-12 h-12 bg-blue-500/30 rounded-full animate-ping"></div>
          <div class="absolute w-5 h-5 bg-blue-600 border-[3px] border-white rounded-full shadow-lg z-20"></div>
          <div class="absolute w-full h-full flex items-center justify-center transition-transform duration-300 ease-linear z-10" style="transform: rotate(${bearingDeg}deg);">
            <div class="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[20px] border-b-blue-600/90 -mt-8"></div>
          </div>
        </div>
      `,
      iconSize: [64, 64],
      iconAnchor: [32, 32]
    });

    const marker = L.marker([lat, lng], { icon: navigationIcon, zIndexOffset: 1000 }).addTo(mapInstance.current);
    userMarker.current = marker;
  };

  // Calculate bearing between two points
  const calculateBearing = (lat1, lng1, lat2, lng2) => {
    const toRad = (deg) => deg * Math.PI / 180;
    const toDeg = (rad) => rad * 180 / Math.PI;
    const dLng = toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  };

  // --- User Location & Navigation Logic ---

  const handleShowMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported.");
      return;
    }
    setStatusMsg('Locating...');
    setShowSuggestions(false);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        setFromAddress("My Location");
        setStatusMsg('');

        if (mapInstance.current) {
          import('leaflet').then((L) => {
            updateUserMarker(lat, lng, L);
            // We rely on the useEffect([userLocation, destLocation]) to trigger the route
            // so we don't need to explicity call calculateAllRoutes here, avoiding potential closure concurrency issues.
            if (!destLocation) {
              mapInstance.current.setView([lat, lng], 15);
            }
          });
        }
      },
      (error) => {
        setStatusMsg('Location access denied.');
      }
    );
  };

  // Helper to offset user position to bottom of screen so they see more road ahead
  const getOffsetCenter = (lat, lng, offsetY = 0.0008) => {
    // Offset north so user appears in lower part of screen
    return [lat + offsetY, lng];
  };

  const toggleNavigation = () => {
    if (isNavigating) {
      // Stop Tracking
      setIsNavigating(false);
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      setStatusMsg('Navigation Stopped');

      // Zoom out to see full route
      recenterMap();
    } else {
      // Start Tracking
      if (!userLocation) {
        alert("We need your location first. Locating you now...");
        handleShowMyLocation();
        return;
      }

      if (!navigator.geolocation) return alert("Geolocation not supported");

      setIsNavigating(true);
      setStatusMsg('Live Navigation Active');
      setIsPanelHidden(true); // Auto hide panel for better view

      // Zoom in close with user at bottom of screen
      if (mapInstance.current && userLocation) {
        const offsetCenter = getOffsetCenter(userLocation.lat, userLocation.lng);
        mapInstance.current.setView(offsetCenter, 18, { animate: true });
      }

      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const heading = position.coords.heading;
          setUserLocation({ lat, lng });

          if (mapInstance.current) {
            import('leaflet').then((L) => {
              updateUserMarker(lat, lng, L, heading);
              // Position user at bottom of screen so they see road ahead
              const offsetCenter = getOffsetCenter(lat, lng);
              mapInstance.current.setView(offsetCenter, 18, { animate: true, duration: 0.3 });
            });
          }
        },
        (err) => console.error(err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    }
  };

  // New Helper: Recenter Map
  const recenterMap = () => {
    if (!mapInstance.current) return;
    import('leaflet').then(L => {
      if (isNavigating && userLocation) {
        const offsetCenter = getOffsetCenter(userLocation.lat, userLocation.lng);
        mapInstance.current.setView(offsetCenter, 18, { animate: true });
      } else if (userLocation && destLocation) {
        const bounds = L.latLngBounds([userLocation.lat, userLocation.lng], [destLocation.lat, destLocation.lng]);
        mapInstance.current.fitBounds(bounds, { padding: [50, 50] });
      } else if (userLocation) {
        mapInstance.current.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
      }
    });
  };

  const handleModeClick = (mode) => {
    setSelectedMode(mode);
    setSelectedRouteIndex(0); // Reset to first route when changing mode
    import('leaflet').then(L => {
      if (routesData[mode] && routesData[mode].length > 0) {
        drawRoutes(routesData[mode], L, mode, 0);
      }
    });
  };

  const handleRouteSelect = (index) => {
    setSelectedRouteIndex(index);
    import('leaflet').then(L => {
      if (routesData[selectedMode] && routesData[selectedMode].length > 0) {
        drawRoutes(routesData[selectedMode], L, selectedMode, index);
      }
    });
  };

  // Get current active route stats
  const activeRoute = routesData[selectedMode]?.[selectedRouteIndex];

  return (
    <>
      <Head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      </Head>

      <div className="relative h-screen w-full bg-gray-100 overflow-hidden font-sans">

        {/* MAP LAYER */}
        <div id="map" ref={mapRef} className="absolute inset-0 z-0 outline-none" />

        {/* TOP BAR */}
        <div className="absolute top-0 left-0 right-0 p-4 z-[500] flex justify-between items-start pointer-events-none">
          {/* Back Button */}
          <button onClick={() => router.back()} className="pointer-events-auto bg-white/90 backdrop-blur-md text-gray-800 px-4 py-2.5 rounded-2xl shadow-lg border border-white/50 font-bold text-sm flex items-center gap-2 hover:bg-white hover:scale-105 transition-all cursor-pointer">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back
          </button>

          {/* Navigation Status Indicator - Top Center (Only when active) */}
          {isNavigating && (
            <div className="pointer-events-auto bg-blue-600/90 backdrop-blur-md text-white px-5 py-2 rounded-full shadow-xl animate-pulse flex items-center gap-2 border border-blue-400/50">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider">Navigating</span>
            </div>
          )}
        </div>

        {/* RE-CENTER BUTTON (FAB) */}
        <div className={`absolute right-4 z-[400] transition-all duration-300 ${isPanelHidden ? 'bottom-20' : 'bottom-[28rem] md:bottom-[600px] lg:bottom-4'}`}>
          <button
            onClick={recenterMap}
            className="bg-white p-3 rounded-full shadow-xl text-gray-700 hover:text-blue-600 hover:bg-gray-50 transition-colors cursor-pointer border border-gray-100"
            title="Recenter Map"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          </button>
        </div>

        {/* FLOATING BOTTOM PANEL */}
        <div className={`absolute left-0 right-0 mx-auto w-full md:w-[480px] z-[1000] transition-all duration-500 ease-in-out ${isPanelHidden ? 'translate-y-[calc(100%-60px)]' : 'translate-y-0'} bottom-0 md:bottom-6 px-0 md:px-4`}>

          {/* Mobile Toggle Handle */}
          <div
            onClick={() => setIsPanelHidden(!isPanelHidden)}
            className="md:hidden w-full h-8 flex justify-center items-center cursor-pointer bg-transparent"
          >
            <div className="w-12 h-1.5 bg-gray-300 rounded-full shadow-sm"></div>
          </div>

          {/* Toggle Button (Desktop) */}
          <button
            onClick={() => setIsPanelHidden(!isPanelHidden)}
            className="hidden md:flex absolute -top-4 left-1/2 transform -translate-x-1/2 bg-white shadow-lg rounded-full p-1.5 border border-gray-100 hover:bg-gray-50 transition-all cursor-pointer z-10 w-8 h-8 items-center justify-center"
          >
            <svg className={`w-4 h-4 text-gray-600 transition-transform duration-300 ${isPanelHidden ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Panel Content */}
          <div className={`bg-white/95 backdrop-blur-xl shadow-2xl rounded-t-3xl md:rounded-3xl border border-white/20 overflow-hidden`}>

            {/* Steps View */}
            {showSteps && activeRoute ? (
              <div className="flex flex-col max-h-[70vh] md:max-h-[500px]">
                <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white/50">
                  <h3 className="font-bold text-lg text-gray-800">Route Instructions</h3>
                  <button onClick={() => setShowSteps(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-500">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="overflow-y-auto p-2 space-y-2">
                  {activeRoute.legs?.[0]?.steps?.map((step, idx) => (
                    <div key={idx} className="flex gap-4 p-3 hover:bg-blue-50/50 rounded-xl transition-colors border-b border-gray-50 last:border-0 items-start">
                      <div className="mt-1 min-w-[24px]">
                        <span className="flex items-center justify-center w-6 h-6 bg-blue-100 text-blue-600 rounded-full text-xs font-bold">{idx + 1}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800 leading-snug" dangerouslySetInnerHTML={{ __html: step.maneuver.type === 'arrive' ? 'Arrive at destination' : (step.name || step.maneuver.instruction || 'Continue') }}></p>
                        <p className="text-xs text-gray-500 mt-1">{formatDistance(step.distance)}</p>
                      </div>
                    </div>
                  ))}
                  {!activeRoute.legs?.[0]?.steps && (
                    <div className="p-8 text-center text-gray-400">No text instructions available for this route.</div>
                  )}
                </div>
              </div>
            ) : (
              /* Main View */
              <div className="p-5 flex flex-col gap-5">

                {/* INPUTS ROW */}
                <div className="flex flex-col relative bg-gray-50/80 rounded-2xl border border-gray-100 p-1">
                  {/* From */}
                  <div className="flex items-center px-3 py-2">
                    <div className="w-8 flex justify-center"><div className="w-3 h-3 bg-blue-500 rounded-full shadow-sm ring-2 ring-blue-100"></div></div>
                    <input className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder-gray-400 py-1" placeholder="Your Location" value={fromAddress} onChange={handleAddressChange} onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }} />
                    <button onClick={handleShowMyLocation} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer" title="Locate Me">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="relative h-[1px] bg-gray-200 mx-10"></div>

                  {/* To */}
                  <div className="flex items-center px-3 py-2">
                    <div className="w-8 flex justify-center"><div className="w-3 h-3 bg-rose-500 rounded-full shadow-sm ring-2 ring-rose-100"></div></div>
                    <input className="flex-1 bg-transparent text-sm font-semibold outline-none text-gray-800 py-1" placeholder="Destination" value={toAddress || "Property Location"} readOnly />
                  </div>

                  {/* Autocomplete Dropdown */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-12 left-0 right-0 bg-white rounded-xl shadow-2xl border border-gray-100 z-[2000] overflow-hidden max-h-60 overflow-y-auto mx-1">
                      {suggestions.map((item, index) => (
                        <div key={index} onClick={() => selectSuggestion(item)} className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 flex items-start gap-3">
                          <svg className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          <span className="text-sm text-gray-700 leading-snug">{item.display_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ACTION CARD */}
                {activeRoute ? (
                  <div className="flex flex-col gap-4">
                    {/* Stats Row */}
                    <div className="flex items-end justify-between px-2">
                      <div>
                        <p className="text-3xl font-black text-gray-900 tracking-tight">{formatDuration(activeRoute.duration)}</p>
                        <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                          <span>{formatDistance(activeRoute.distance)}</span>
                          <span>•</span>
                          <span className="text-green-600">Fastest route</span>
                        </div>
                      </div>
                      <button onClick={() => setShowSteps(true)} className="text-sm font-bold text-blue-600 hover:text-blue-700 underline underline-offset-4 cursor-pointer">
                        View Steps
                      </button>
                    </div>

                    {/* Controls Grid */}
                    <div className="grid grid-cols-4 gap-2">
                      {/* Mode Selectors */}
                      {[
                        { id: 'driving', label: 'Car', icon: <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z" /> },
                        { id: 'bike', label: 'Bike', icon: <path d="M15.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM5 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5zm5.8-10l2.4-2.4.8.8c1.3 1.3 3 2.1 5.1 2.1V9c-1.5 0-2.7-.6-3.6-1.5l-1.9-1.9c-.5-.4-1-.6-1.6-.6s-1.1.2-1.4.6L7.8 8.4c-.4.4-.6.9-.6 1.4 0 .6.2 1.1.6 1.4L11 14v5h2v-6.2l-2.2-2.3zM19 12c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8.5c-1.9 0-3.5-1.6-3.5-3.5s1.6-3.5 3.5-3.5 3.5 1.6 3.5 3.5-1.6 3.5-3.5 3.5z" /> },
                        { id: 'foot', label: 'Walk', icon: <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7" /> }
                      ].map((mode) => {
                        const duration = routesData[mode.id]?.[0]?.duration;
                        return (
                          <button
                            key={mode.id}
                            onClick={() => handleModeClick(mode.id)}
                            className={`group relative flex flex-col items-center justify-center p-2 rounded-2xl transition-all cursor-pointer overflow-hidden ${selectedMode === mode.id ? 'bg-gray-900 text-white shadow-lg scale-100' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:scale-105'}`}
                          >
                            <svg className="w-5 h-5 mb-0.5 z-10" fill="currentColor" viewBox="0 0 24 24">{mode.icon}</svg>
                            <span className="text-[10px] font-bold uppercase z-10 leading-none mb-0.5">{mode.label}</span>
                            <span className={`text-[10px] font-bold z-10 ${selectedMode === mode.id ? 'text-gray-300' : 'text-blue-600'}`}>
                              {duration ? formatDuration(duration) : '--'}
                            </span>
                            {routesData[mode.id]?.length > 1 && (
                              <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full z-10 ${selectedMode === mode.id ? 'bg-blue-400' : 'bg-blue-500'}`}></span>
                            )}
                          </button>
                        )
                      })}

                      {/* START BUTTON - BIG */}
                      <button
                        onClick={toggleNavigation}
                        className={`relative flex flex-col items-center justify-center p-2 rounded-2xl transition-all cursor-pointer shadow-lg overflow-hidden ${isNavigating ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                      >
                        {isNavigating ? (
                          <>
                            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            <span className="text-[10px] font-bold uppercase">Exit</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-6 h-6 mb-1" fill="currentColor" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" /></svg>
                            <span className="text-[10px] font-bold uppercase">Start</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Alternate Routes Select (if any) */}
                    {routesData[selectedMode] && routesData[selectedMode].length > 1 && !isNavigating && (
                      <div className="flex gap-2 mt-1 overflow-x-auto pb-1 scrollbar-hide">
                        {routesData[selectedMode].map((route, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleRouteSelect(idx)}
                            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${selectedRouteIndex === idx ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                          >
                            {idx === 0 ? 'Fastest' : `Route ${idx + 1}`} • {formatDuration(route.duration)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 flex flex-col items-center justify-center">
                    {statusMsg ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-3 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
                        <p className="text-sm font-medium text-gray-500 animate-pulse">{statusMsg}</p>
                      </div>
                    ) : (
                      <button onClick={handleShowMyLocation} className="flex flex-col items-center gap-2 group cursor-pointer">
                        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center group-hover:bg-blue-100 group-hover:scale-110 transition-all">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <span className="text-sm font-bold text-gray-400 group-hover:text-blue-500 transition-colors">Tap to start navigation</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}