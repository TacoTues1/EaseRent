import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

const ACTIVE_OCCUPANCY_STATUSES = new Set(['active', 'pending_end'])
const SCHEDULED_END_REQUEST_STATUSES = new Set(['approved', 'pending', 'cancel_pending'])

function parseOccupancyDate(value) {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    date.setHours(0, 0, 0, 0)
    return date
}

function getOccupancyAvailabilityDate(occupancy) {
    if (!occupancy || !ACTIVE_OCCUPANCY_STATUSES.has(occupancy.status)) return null

    const dateCandidates = []
    if (occupancy.end_request_date && SCHEDULED_END_REQUEST_STATUSES.has(occupancy.end_request_status)) {
        dateCandidates.push(occupancy.end_request_date)
    }
    if (occupancy.contract_end_date) dateCandidates.push(occupancy.contract_end_date)
    if (occupancy.end_date) dateCandidates.push(occupancy.end_date)

    return dateCandidates
        .map((value) => ({ value, date: parseOccupancyDate(value) }))
        .filter((item) => item.date)
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0]?.value || null
}

async function loadUpcomingAvailability(properties = []) {
    const occupiedPropertyIds = Array.from(new Set(
        properties
            .filter((property) => property?.status === 'occupied')
            .map((property) => property.id)
            .filter(Boolean)
    ))

    if (occupiedPropertyIds.length === 0) return {}

    const { data, error } = await supabase
        .from('tenant_occupancies')
        .select('property_id, end_request_date, end_request_status, status')
        .in('property_id', occupiedPropertyIds)
        .in('status', Array.from(ACTIVE_OCCUPANCY_STATUSES))

    if (error) {
        console.error('Search availability error:', error)
        return {}
    }

    const availability = {}
    ;(data || []).forEach((occupancy) => {
        const upcomingDate = getOccupancyAvailabilityDate(occupancy)
        const parsedDate = parseOccupancyDate(upcomingDate)
        if (!occupancy.property_id || !parsedDate) return

        const currentDate = parseOccupancyDate(availability[occupancy.property_id])
        if (!currentDate || parsedDate < currentDate) {
            availability[occupancy.property_id] = upcomingDate
        }
    })

    return availability
}

/**
 * Elastic-like search API for properties.
 * 
 * Features:
 * - Multi-field search across title, description, address, city, amenities
 * - Fuzzy matching with Levenshtein distance tolerance
 * - Token-based search (splits query into words, matches any)
 * - Relevance scoring and ranking
 * - Result highlighting
 * - Prefix matching for instant/typeahead search
 */

// Simple Levenshtein distance
function levenshtein(a, b) {
    const matrix = []
    const aLen = a.length
    const bLen = b.length

    if (aLen === 0) return bLen
    if (bLen === 0) return aLen

    for (let i = 0; i <= bLen; i++) matrix[i] = [i]
    for (let j = 0; j <= aLen; j++) matrix[0][j] = j

    for (let i = 1; i <= bLen; i++) {
        for (let j = 1; j <= aLen; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1]
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    matrix[i][j - 1] + 1,     // insertion
                    matrix[i - 1][j] + 1      // deletion
                )
            }
        }
    }
    return matrix[bLen][aLen]
}

// Check if a word fuzzy-matches a target word
function fuzzyMatch(query, target, maxDistance = 2) {
    const q = query.toLowerCase()
    const t = target.toLowerCase()

    // Exact match
    if (t === q) return { match: true, score: 100, type: 'exact' }

    // Prefix match (important for typeahead)
    if (t.startsWith(q)) return { match: true, score: 90, type: 'prefix' }

    // Contains match
    if (t.includes(q)) return { match: true, score: 80, type: 'contains' }

    // Query is contained in the word  
    if (q.includes(t)) return { match: true, score: 60, type: 'reverse_contains' }

    // Fuzzy match using Levenshtein distance
    // Dynamically adjust max distance based on word length
    const dynamicMax = q.length <= 3 ? 1 : q.length <= 5 ? 2 : maxDistance
    const distance = levenshtein(q, t)
    if (distance <= dynamicMax) {
        const score = Math.max(10, 70 - (distance * 20))
        return { match: true, score, type: 'fuzzy', distance }
    }

    return { match: false, score: 0, type: 'none' }
}

// Search a property against all query tokens and compute relevance
function scoreProperty(property, tokens) {
    let totalScore = 0
    const highlights = {}
    const matchedFields = new Set()

    // Fields to search with their weight multipliers
    const searchFields = [
        { key: 'title', value: property.title, weight: 5 },
        { key: 'city', value: property.city, weight: 4 },
        { key: 'address', value: property.address, weight: 3 },
        { key: 'description', value: property.description, weight: 1 },
        { key: 'property_type', value: property.property_type, weight: 2 },
        { key: 'building', value: property.building_no, weight: 3 },
        { key: 'street', value: property.street, weight: 3 },
    ]

    // Search amenities too
    if (property.amenities && Array.isArray(property.amenities)) {
        searchFields.push({
            key: 'amenities',
            value: property.amenities.join(' '),
            weight: 2
        })
    }

    for (const token of tokens) {
        let bestFieldScore = 0
        let bestField = null

        for (const field of searchFields) {
            if (!field.value) continue
            const fieldValue = String(field.value)

            // Check each word within the field value
            const fieldWords = fieldValue.split(/[\s,.\-\/]+/).filter(w => w.length > 0)

            for (const word of fieldWords) {
                const result = fuzzyMatch(token, word)
                if (result.match) {
                    const weightedScore = result.score * field.weight
                    if (weightedScore > bestFieldScore) {
                        bestFieldScore = weightedScore
                        bestField = field.key
                    }
                }
            }

            // Also check the whole field value as a phrase
            const phraseResult = fuzzyMatch(token, fieldValue)
            if (phraseResult.match) {
                const weightedScore = phraseResult.score * field.weight * 1.2 // bonus for phrase match
                if (weightedScore > bestFieldScore) {
                    bestFieldScore = weightedScore
                    bestField = field.key
                }
            }
        }

        if (bestField) {
            totalScore += bestFieldScore
            matchedFields.add(bestField)

            // Build highlight info
            if (!highlights[bestField]) {
                highlights[bestField] = []
            }
            highlights[bestField].push(token)
        }
    }

    // Bonus: matching in multiple fields
    if (matchedFields.size > 1) {
        totalScore *= 1 + (matchedFields.size * 0.15)
    }

    // Bonus: matching all tokens
    const matchedTokenCount = Object.values(highlights).flat().length
    if (matchedTokenCount === tokens.length && tokens.length > 1) {
        totalScore *= 1.5
    }

    // Status bonus: available properties rank higher
    if (property.status === 'available') {
        totalScore *= 1.1
    }

    return {
        score: Math.round(totalScore),
        highlights,
        matchedFields: Array.from(matchedFields)
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { q, limit = 8, minScore = 10 } = req.query

    if (!q || !q.trim()) {
        return res.status(400).json({ error: 'Query parameter "q" is required' })
    }

    try {
        const query = q.trim()

        // Tokenize the query into individual search terms
        const tokens = query
            .toLowerCase()
            .split(/[\s,.\-\/]+/)
            .filter(t => t.length > 0)

        if (tokens.length === 0) {
            return res.status(200).json({ results: [], total: 0, query })
        }

        // First, try to get results via Supabase ilike for the broad set
        // Build an OR filter for each token across key fields
        const orConditions = tokens.map(token =>
            `title.ilike.%${token}%,city.ilike.%${token}%,address.ilike.%${token}%`
        ).join(',')

        const { data: ilikeResults, error: ilikeError } = await supabase
            .from('properties')
            .select('*')
            .eq('is_deleted', false)
            .or(orConditions)
            .limit(50) // Fetch broad set for re-ranking

        // Also do a broader fetch for fuzzy matching (tokens that might not ilike-match)
        // This catches typos the DB can't
        const { data: allProperties, error: allError } = await supabase
            .from('properties')
            .select('*')
            .eq('is_deleted', false)
            .limit(200) // Reasonable limit for fuzzy scoring

        if (ilikeError || allError) {
            console.error('Search error:', ilikeError || allError)
            return res.status(500).json({ error: 'Search failed' })
        }

        // Merge results (deduplicate by id)
        const seenIds = new Set()
        const candidates = []

        const addCandidate = (item) => {
            if (!seenIds.has(item.id)) {
                seenIds.add(item.id)
                candidates.push(item)
            }
        }

        // ilike results first (these are likely matches)
        if (ilikeResults) ilikeResults.forEach(addCandidate)
        // Then broader set for fuzzy
        if (allProperties) allProperties.forEach(addCandidate)

        const upcomingAvailability = await loadUpcomingAvailability(candidates)

        // Score each candidate
        const scoredResults = candidates.map(property => {
            const { score, highlights, matchedFields } = scoreProperty(property, tokens)
            return {
                ...property,
                upcoming_available_date: upcomingAvailability[property.id] || null,
                _score: score,
                _highlights: highlights,
                _matchedFields: matchedFields
            }
        })

        // Filter by minimum score and sort by relevance
        const filtered = scoredResults
            .filter(r => r._score >= parseInt(minScore))
            .sort((a, b) => b._score - a._score)
            .slice(0, parseInt(limit))

        return res.status(200).json({
            results: filtered,
            total: filtered.length,
            query,
            tokens
        })
    } catch (error) {
        console.error('Elastic search error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
