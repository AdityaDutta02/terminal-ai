# Terminal AI Design System

## Colors

### Primary Palette
- **Background (warm cream):** `#f5f5f0`
- **Dark / Text primary:** `#1e1e1f`
- **Accent (orange):** `#FF6B00`
- **Accent hover:** `#E55D00`
- **Dark hover:** `#333333`
- **White:** `#ffffff`

### Text Colors
- **Primary:** `text-[#1e1e1f]`
- **Secondary:** `text-[#1e1e1f]/55` or `text-[#1e1e1f]/50`
- **Muted:** `text-slate-400`
- **On dark bg:** `text-white`, `text-white/40`, `text-white/50`, `text-white/80`
- **Accent text:** `text-orange-600`
- **Status live:** `text-emerald-600`
- **Status coming soon:** `text-violet-600`

### Surface Colors
- **Page background:** `bg-[#f5f5f0]`
- **Card:** `bg-white`
- **Dark section:** `bg-[#1e1e1f]`
- **Muted surface:** `bg-slate-50`, `bg-[#f5f5f0]`
- **Border light:** `border-slate-100`, `border-slate-200`
- **Border accent:** `border-[#FF6B00]`

## Typography

### Font Families
- **Display / Headings:** `font-display` (Instrument Serif) — used for all major headings
- **Body / UI:** `font-sans` (DM Sans) — default for all text
- **Code / Mono:** `font-mono` (JetBrains Mono) — credit counts, slugs, code

### Heading Sizes
- **Hero H1:** `text-[clamp(42px,7vw,72px)] leading-[1.08] tracking-[-0.03em] font-display`
- **Section H2:** `text-[clamp(28px,4vw,42px)] tracking-[-0.02em] font-display`
- **Large H2:** `text-[clamp(32px,5vw,50px)] tracking-[-0.02em] font-display`
- **Card title:** `text-[18px] font-medium tracking-[-0.01em]`
- **Page title (inner pages):** `text-[28px] font-extrabold tracking-tight`

### Body Text Sizes
- **Body:** `text-[14px]` or `text-[15px]`
- **Small / Caption:** `text-[12px]` or `text-[13px]`
- **Tiny:** `text-[11px]`
- **Label uppercase:** `text-[12px] font-semibold uppercase tracking-widest`

## Spacing

### Base Scale (8px grid)
- `px-6` (24px) — page content padding (inner pages)
- `px-8` (32px) — page content padding (landing)
- `py-5` (20px) — top bar padding
- `py-12` (48px) — footer padding
- `py-20` (80px) — section vertical padding
- `py-24` (96px) — large section padding
- `gap-6` (24px) — card grid gap
- `gap-8` (32px) — section element gap
- `mb-10` (40px) — section header margin

### Max Widths
- **Content (landing):** `max-w-[1400px]`
- **Content (inner):** `max-w-[1200px]`
- **Pricing:** `max-w-[960px]`
- **Text block:** `max-w-[900px]`, `max-w-md` (28rem)

## Border Radius

- **Cards:** `rounded-[24px]`
- **Buttons (pill):** `rounded-full`
- **Buttons (box):** `rounded-xl` (12px)
- **Inner elements:** `rounded-xl` (12px)
- **Small elements:** `rounded-lg` (8px)
- **Tags/badges:** `rounded-full`
- **Avatar/circle:** `rounded-full`

## Components

### Buttons

**Primary CTA (dark):**
```
bg-[#1e1e1f] text-white rounded-full px-7 py-3.5 text-[15px] font-medium
hover:bg-[#333] hover:shadow-lg hover:shadow-black/15
active:scale-[0.98] transition-all duration-200
```

**Accent CTA (orange):**
```
bg-[#FF6B00] text-white rounded-full py-3 text-[14px] font-semibold
hover:bg-[#E55D00] hover:shadow-lg hover:shadow-orange-200/50
transition-all duration-200
```

**Secondary (outline):**
```
border border-slate-200 text-slate-600 rounded-xl py-2 px-4 text-[14px]
hover:bg-slate-50 transition-colors
```

**Nav link:**
```
text-[14px] font-medium text-slate-600 hover:text-slate-900 transition-colors
```

### Cards

**App card (landing):**
```
w-[360px] rounded-[24px]
Image area: h-[280px] bg-gradient-to-br with 3D floating shapes
Title: text-[18px] font-medium
Description: text-[14px] text-[#1e1e1f]/50 line-clamp-2
Credits: text-[14px] font-medium text-[#1e1e1f]/70
```

**Settings card (inner pages):**
```
bg-white rounded-2xl border border-slate-200 shadow-sm p-6
```

**Pricing card:**
```
bg-white rounded-[24px] p-8
Recommended: border-2 border-[#FF6B00] with orange badge
Standard: border border-slate-200
```

### Badges/Tags

**Coming Soon badge (on card):**
```
bg-[#1e1e1f] rounded-full px-3 py-1.5
text-[12px] font-medium text-white
```

**Status Live:**
```
flex items-center gap-1.5
dot: w-1.5 h-1.5 rounded-full bg-emerald-500
text: text-[12px] font-medium text-emerald-600
```

**Recommended tag:**
```
bg-[#FF6B00] text-white text-[11px] font-semibold px-3 py-1 rounded-full
```

### Top Bar (Landing)
```
fixed top-0 z-[60] px-8 py-5
Wordmark: text-[22px] font-display text-[#1e1e1f]
Menu button: w-10 h-10 rounded-full bg-[#1e1e1f]
  hover: scale-110 shadow-lg shadow-black/20
  active: scale-95
```

### Navbar (Inner Pages)
```
sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-100
h-[60px] max-w-[1200px]
Logo: w-8 h-8 bg-[#0A0A0A] rounded-lg
Credits pill: bg-orange-50 border-orange-100 rounded-full
```

### Dropdown Menu
```
bg-white rounded-2xl border border-slate-100 shadow-2xl py-2
animation: menuIn 0.2s ease-out (translateY -8px + scale 0.95 → 0)
Item: px-4 py-2.5 text-[14px] hover:bg-slate-50
```

## Hero Gradient

```css
background: linear-gradient(145deg, #f8a4c8 0%, #f4845f 20%, #f7b267 40%, #f8a4c8 60%, #c9a7eb 80%, #f0e0d0 100%);
```

### Noise Grain Overlay
```css
.noise::before {
  content: '';
  position: absolute;
  inset: -50%;
  width: 200%;
  height: 200%;
  background-image: url("data:image/svg+xml,...feTurbulence fractalNoise 0.65...");
  opacity: 0.04;
  pointer-events: none;
  animation: grain 8s steps(10) infinite;
}
```

### Bottom Fade
```
bg-gradient-to-t from-[#f5f5f0] to-transparent h-[250px]
```

## Footer (Dark)
```
bg-[#1e1e1f] py-12 px-8
Wordmark: text-[18px] font-display text-white/80
Links: text-[13px] text-white/40 hover:text-white/70
```

## Animations

### Transitions
- **Default:** `transition-all duration-200`
- **Colors only:** `transition-colors`
- **Card shapes:** `transition-transform duration-700`
- **Opacity:** `transition-opacity duration-300`

### Hover Effects
- **Buttons:** `hover:shadow-lg active:scale-[0.98]`
- **Menu button:** `hover:scale-110 hover:shadow-lg active:scale-95`
- **Card badge appear:** `opacity-0 group-hover:opacity-100`

### Keyframes
- **grain** — noise texture shift (8s steps)
- **menuIn** — dropdown slide (0.2s translateY + scale + opacity)
- **spin45 / spinBack** — plus icon rotation

## App Card Gradient Palette (3D Placeholders)
```
Green:  from-green-400/80 to-emerald-600/90
Orange: from-orange-400/80 to-amber-600/90
Violet: from-violet-400/80 to-purple-600/90
Cyan:   from-cyan-400/80 to-teal-600/90
Pink:   from-pink-400/80 to-rose-600/90
Blue:   from-blue-400/80 to-indigo-600/90
```

Each card has 2-3 floating frosted glass shapes:
```
bg-white/20 backdrop-blur-sm rounded-3xl rotate-12
hover: rotate reduces (12 → 3 degrees)
```

## Inner Page Layout Pattern
```tsx
<div className="max-w-[1200px] mx-auto px-6 py-8">
  <div className="flex gap-8">
    <SidebarNav title="..." tabs={...} />
    <div className="flex-1 min-w-0">
      <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight">...</h1>
      {/* Content */}
    </div>
  </div>
</div>
```

## Form Elements
- **Input:** `h-[44px] px-4 rounded-xl border border-slate-200 text-[14px] text-slate-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100`
- **Label:** `text-[13px] font-medium text-slate-700 mb-1.5 block`
- **Error box:** `rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600`
