# Card Size Adjustment Guide - All Properties Section

## Location
File: `pages/dashboard.js`
Section: "All Properties" (around line 922-1100)

---

## How to Adjust Card Sizes

### 1. **Grid Columns** (How many cards per row)
**Line ~922-924:**
```jsx
<div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 ...">
```

**To change:**
- `grid-cols-3` = 3 cards on mobile
- `sm:grid-cols-3` = 3 cards on small screens
- `md:grid-cols-4` = 4 cards on medium screens
- `lg:grid-cols-4` = 4 cards on large screens
- `xl:grid-cols-5` = 5 cards on extra large screens

**Examples:**
- For 2 cards on mobile: `grid-cols-2`
- For 4 cards on mobile: `grid-cols-4`
- For 6 cards on desktop: `xl:grid-cols-6`

---

### 2. **Gap Between Cards** (Spacing)
**Line ~922-924:**
```jsx
gap-2 sm:gap-3 md:gap-4 lg:gap-6
```

**Gap sizes:**
- `gap-2` = 0.5rem (8px) - Mobile
- `gap-3` = 0.75rem (12px) - Small screens
- `gap-4` = 1rem (16px) - Medium screens
- `gap-6` = 1.5rem (24px) - Large screens

**To change:**
- Smaller gaps: `gap-1 sm:gap-2` (4px, 8px)
- Larger gaps: `gap-4 sm:gap-6 md:gap-8` (16px, 24px, 32px)

---

### 3. **Card Image Aspect Ratio** (Image height)
**Line ~980:**
```jsx
<div className="relative aspect-[3/2] sm:aspect-[4/3] overflow-hidden bg-gray-100">
```

**Current:**
- `aspect-[3/2]` = 3:2 ratio (mobile) - shorter images
- `sm:aspect-[4/3]` = 4:3 ratio (desktop) - taller images

**Options:**
- `aspect-square` = 1:1 (square images)
- `aspect-[16/9]` = 16:9 (widescreen, shorter)
- `aspect-[4/3]` = 4:3 (standard, taller)
- `aspect-[3/2]` = 3:2 (medium height)

**To make cards shorter:** Use smaller second number (e.g., `aspect-[16/9]`)
**To make cards taller:** Use larger second number (e.g., `aspect-[4/5]`)

---

### 4. **Card Padding** (Content spacing inside card)
**Line ~1087:**
```jsx
<div className="p-2 sm:p-3">
```

**Current:**
- `p-2` = 0.5rem (8px) padding on mobile
- `sm:p-3` = 0.75rem (12px) padding on desktop

**To change:**
- Smaller padding: `p-1 sm:p-2` (4px, 8px)
- Larger padding: `p-3 sm:p-4 md:p-6` (12px, 16px, 24px)

---

### 5. **Card Minimum Height**
**Line ~922-924:**
```jsx
min-h-[400px]
```

**To change:**
- Shorter cards: `min-h-[300px]` or `min-h-[250px]`
- Taller cards: `min-h-[500px]` or `min-h-[600px]`
- Remove minimum: Delete `min-h-[400px]` entirely

---

### 6. **Font Sizes** (Text inside cards)

**Title (Line ~1090):**
```jsx
<h3 className="text-xs sm:text-sm font-bold ...">
```
- `text-xs` = 0.75rem (12px) - Mobile
- `sm:text-sm` = 0.875rem (14px) - Desktop
- To make larger: `text-sm sm:text-base` (14px, 16px)

**Price (Line ~1081):**
```jsx
<p className="text-sm sm:text-base font-bold ...">
```
- `text-sm` = 0.875rem (14px) - Mobile
- `sm:text-base` = 1rem (16px) - Desktop
- To make larger: `text-base sm:text-lg` (16px, 18px)

**Details (Line ~1100):**
```jsx
<span className="text-[10px] sm:text-xs ...">
```
- `text-[10px]` = 10px - Mobile
- `sm:text-xs` = 0.75rem (12px) - Desktop
- To make larger: `text-xs sm:text-sm` (12px, 14px)

---

### 7. **Icon Sizes** (Buttons and icons)

**Favorite/Compare buttons (Line ~993):**
```jsx
className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8"
```
- Mobile: 24px (w-6 h-6)
- Desktop: 32px (w-8 h-8)
- To change: Adjust `w-6 h-6` to `w-5 h-5` (smaller) or `w-10 h-10` (larger)

---

## Quick Reference

| Element | Current Mobile | Current Desktop | Location |
|---------|---------------|-----------------|----------|
| Cards per row | 3 | 5 | Line 923 |
| Gap between cards | 8px | 24px | Line 923 |
| Image ratio | 3:2 | 4:3 | Line 980 |
| Card padding | 8px | 12px | Line 1087 |
| Min height | 400px | 400px | Line 923 |
| Title font | 12px | 14px | Line 1090 |
| Price font | 14px | 16px | Line 1081 |

---

## Example: Make Cards Smaller

To make cards more compact:
1. **Increase columns:** `grid-cols-4` (4 cards on mobile)
2. **Reduce gaps:** `gap-1 sm:gap-2` (4px, 8px)
3. **Shorter images:** `aspect-[16/9]` (widescreen)
4. **Less padding:** `p-1 sm:p-2` (4px, 8px)
5. **Smaller fonts:** `text-[10px] sm:text-xs`

---

## Example: Make Cards Larger

To make cards bigger:
1. **Decrease columns:** `grid-cols-2` (2 cards on mobile)
2. **Increase gaps:** `gap-4 sm:gap-6` (16px, 24px)
3. **Taller images:** `aspect-[4/3]` or `aspect-square`
4. **More padding:** `p-3 sm:p-4` (12px, 16px)
5. **Larger fonts:** `text-sm sm:text-base`

