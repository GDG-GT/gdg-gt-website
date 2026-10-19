# 🔥 GDG@GT MODERN UI BIBLE - Make People Go "WOW"

## 🎯 MISSION: Create a website so good people screenshot it

---

## 🌟 2025 Web Design Trends (What's HOT)

### ✅ WHAT'S IN (DO THIS)

1. **Immersive 3D Experiences**
   - Interactive 3D models that respond to mouse/scroll
   - Spline 3D, Three.js, React Three Fiber
   - But make it SMOOTH and purposeful

2. **Micro-Animations EVERYWHERE**
   - Button hover effects
   - Card lift on hover
   - Text reveal on scroll
   - Icon animations
   - Loading states that don't feel like waiting

3. **Cinematic Scrolling**
   - Parallax layers (different scroll speeds)
   - Elements that fade/slide in as you scroll
   - Scroll-triggered animations
   - Horizontal scroll sections
   - Sticky sections that reveal content

4. **Bento Grid Layouts**
   - Apple-style card grids
   - Mixed sizes (some cards 2x, some 1x)
   - Rounded corners
   - Subtle shadows

5. **Glassmorphism**
   - Frosted glass effect
   - Blur backgrounds
   - Semi-transparent cards
   - Colorful gradients behind glass

6. **Gradient Everything**
   - Animated gradients
   - Text gradients
   - Button gradients
   - Background gradients that move

7. **Typography as Hero**
   - HUGE bold headlines
   - Text with gradient fills
   - Animated text reveals
   - Kinetic typography (text that moves)

8. **Dark Mode Done Right**
   - Not pure black (#000)
   - Use dark grays (#0A0A0A, #1A1A1A)
   - Colored accents pop on dark
   - Toggle between light/dark

9. **Motion Design**
   - Spring animations (bouncy, organic)
   - Stagger animations (elements appear in sequence)
   - Morphing shapes
   - Liquid animations

10. **Interactive Elements**
    - Cursor that changes shape
    - Magnetic buttons (follow mouse)
    - Hover effects that transform
    - Click animations with feedback

### ❌ WHAT'S OUT (AVOID THIS)

- Static, boring layouts
- No animations at all
- Generic stock photos
- Flat 2D everything
- Hamburger menus on desktop
- Carousels/sliders (users hate them)
- Pure white backgrounds (#FFF)
- Small, timid text
- Generic blue (#0000FF)

---

## 🎨 THE PERFECT GDG@GT DESIGN SYSTEM

### Color Palette (FIRE Edition)

```css
/* Google Brand Colors (Primary) */
--google-blue: #4285F4;
--google-red: #EA4335;
--google-yellow: #FBBC04;
--google-green: #34A853;

/* Georgia Tech Colors */
--gt-gold: #B3A369;
--gt-navy: #003057;
--gt-tech-gold: #EAAA00; /* Brighter version */

/* Modern Neutrals */
--bg-primary: #FFFFFF;
--bg-secondary: #F8F9FA;
--bg-tertiary: #F1F3F5;
--surface: #FFFFFF;
--surface-elevated: #FFFFFF;

/* Dark Mode */
--dark-bg: #0A0A0A;
--dark-surface: #1A1A1A;
--dark-elevated: #252525;

/* Text */
--text-primary: #1A1A1A;
--text-secondary: #6B7280;
--text-tertiary: #9CA3AF;

/* Gradients (The Secret Sauce) */
--gradient-hero: linear-gradient(135deg, #4285F4 0%, #34A853 100%);
--gradient-card: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
--gradient-glass: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
```

### Typography (Make It POP)

```css
/* Fonts */
--font-display: 'Inter', 'SF Pro Display', -apple-system, sans-serif;
--font-body: 'Inter', 'SF Pro Text', -apple-system, sans-serif;

/* Sizes (Desktop) */
--text-hero: clamp(48px, 8vw, 96px); /* HUGE */
--text-h1: clamp(36px, 5vw, 72px);
--text-h2: clamp(32px, 4vw, 56px);
--text-h3: clamp(24px, 3vw, 40px);
--text-body: 18px; /* Bigger is better for readability */
--text-small: 14px;

/* Weights */
--weight-black: 900;
--weight-bold: 700;
--weight-semibold: 600;
--weight-medium: 500;
--weight-regular: 400;
```

### Spacing System

```css
/* 8px base grid */
--space-1: 8px;
--space-2: 16px;
--space-3: 24px;
--space-4: 32px;
--space-5: 40px;
--space-6: 48px;
--space-8: 64px;
--space-10: 80px;
--space-12: 96px;
--space-16: 128px;
--space-20: 160px;
```

---

## 🎬 ANIMATION LIBRARY

### 1. Fade In (Classic but Good)

```jsx
<motion.div
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true }}
  transition={{ duration: 0.6, ease: "easeOut" }}
>
  Your content
</motion.div>
```

### 2. Stagger Children (Professional AF)

```jsx
<motion.div
  variants={{
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }}
  initial="hidden"
  whileInView="show"
>
  {items.map(item => (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
      }}
    >
      {item}
    </motion.div>
  ))}
</motion.div>
```

### 3. Parallax Scroll (Apple-Style)

```jsx
const { scrollYProgress } = useScroll();
const y = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);

<motion.div style={{ y }}>
  Background layer (moves slower)
</motion.div>
```

### 4. Magnetic Button (Interactive)

```jsx
const [position, setPosition] = useState({ x: 0, y: 0 });

<motion.button
  onMouseMove={(e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPosition({
      x: (e.clientX - rect.left - rect.width / 2) * 0.3,
      y: (e.clientY - rect.top - rect.height / 2) * 0.3
    });
  }}
  onMouseLeave={() => setPosition({ x: 0, y: 0 })}
  animate={position}
  transition={{ type: "spring", stiffness: 150, damping: 15 }}
>
  Hover me!
</motion.button>
```

### 5. Scroll Progress Bar (Satisfying)

```jsx
const { scrollYProgress } = useScroll();

<motion.div
  style={{
    scaleX: scrollYProgress,
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: 'linear-gradient(90deg, #4285F4, #34A853)',
    transformOrigin: '0%'
  }}
/>
```

### 6. Card Hover Tilt (3D Effect)

```jsx
<motion.div
  whileHover={{ 
    scale: 1.05,
    rotateX: 5,
    rotateY: 5,
    transition: { duration: 0.2 }
  }}
  style={{
    transformStyle: 'preserve-3d',
    perspective: 1000
  }}
>
  Card content
</motion.div>
```

### 7. Text Reveal (Cinematic)

```jsx
<motion.h1
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.8, ease: "easeOut" }}
>
  {text.split('').map((char, i) => (
    <motion.span
      key={i}
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: i * 0.05 }}
    >
      {char}
    </motion.span>
  ))}
</motion.h1>
```

### 8. Infinite Scroll Marquee (Modern)

```jsx
<motion.div
  animate={{
    x: [0, -1000]
  }}
  transition={{
    x: {
      repeat: Infinity,
      duration: 20,
      ease: "linear"
    }
  }}
  style={{ display: 'flex', gap: '2rem' }}
>
  {/* Logos or text */}
</motion.div>
```

---

## 🌊 SCROLL ANIMATIONS (The Good Stuff)

### Scroll-Linked Animations

```jsx
const { scrollYProgress } = useScroll({
  target: ref,
  offset: ["start end", "end start"]
});

const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0]);
const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1, 0.8]);
const y = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
```

### Horizontal Scroll Section

```jsx
const targetRef = useRef(null);
const { scrollYProgress } = useScroll({ target: targetRef });
const x = useTransform(scrollYProgress, [0, 1], ["0%", "-75%"]);

<section ref={targetRef} style={{ height: '400vh' }}>
  <div style={{ position: 'sticky', top: 0, overflow: 'hidden' }}>
    <motion.div style={{ x, display: 'flex' }}>
      {/* Cards that scroll horizontally */}
    </motion.div>
  </div>
</section>
```

### Sticky Reveal Sections

```jsx
<section style={{ position: 'sticky', top: 0 }}>
  <motion.div
    style={{
      clipPath: scrollYProgress.get() > 0.5 
        ? 'inset(0% 0% 0% 0%)'
        : 'inset(0% 0% 100% 0%)'
    }}
  >
    Content reveals as you scroll
  </motion.div>
</section>
```

---

## 🎭 3D ELEMENTS (Done Right)

### Option 1: Spline (Easiest, Best Quality)

```jsx
import Spline from '@splinetool/react-spline';

<div style={{ height: '100vh', position: 'relative' }}>
  <Spline scene="https://prod.spline.design/YOUR-SCENE-ID/scene.splinecode" />
</div>
```

**Use Cases:**
- Hero section background
- Interactive product showcase
- Floating geometric shapes
- Abstract art pieces

### Option 2: React Three Fiber (More Control)

```jsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Float } from '@react-three/drei';

<Canvas style={{ height: '100vh' }}>
  <ambientLight intensity={0.5} />
  <directionalLight position={[10, 10, 5]} />
  
  <Float speed={2} rotationIntensity={0.5}>
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial 
        color="#4285F4" 
        metalness={0.8}
        roughness={0.2}
      />
    </mesh>
  </Float>
  
  <OrbitControls enableZoom={false} />
</Canvas>
```

**Use Cases:**
- Interactive 3D logo
- Product demonstrations
- Data visualizations
- Abstract backgrounds

### Modern 3D Concepts:

1. **Floating Cards in 3D Space**
   - Cards that tilt on hover
   - Depth and shadows
   - Parallax on scroll

2. **Morphing Shapes**
   - Blob that changes shape
   - Responds to mouse movement
   - Smooth, organic animations

3. **3D Typography**
   - Extruded text
   - Rotating text
   - Text with depth and shadows

4. **Abstract Geometric Patterns**
   - Wireframe spheres (like Apple)
   - Floating particles
   - Interconnected nodes

---

## 🎨 COMPONENT PATTERNS

### Hero Section (Maximum Impact)

```jsx
<section className="min-h-screen relative overflow-hidden">
  {/* Background gradient */}
  <div className="absolute inset-0 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 opacity-10" />
  
  {/* 3D Background */}
  <div className="absolute inset-0 -z-10">
    <Spline scene="..." />
  </div>
  
  {/* Content */}
  <motion.div
    initial={{ opacity: 0, y: 40 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 1, ease: "easeOut" }}
    className="relative z-10 flex flex-col items-center justify-center min-h-screen text-center px-4"
  >
    <motion.span
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.2 }}
      className="text-sm font-semibold text-blue-600 mb-4 uppercase tracking-wider"
    >
      Student Chapter
    </motion.span>
    
    <h1 className="text-6xl md:text-8xl font-black mb-6 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-green-500">
      Google Developer Groups
    </h1>
    
    <h2 className="text-4xl md:text-6xl font-bold text-gold-500 mb-8">
      at Georgia Tech
    </h2>
    
    <p className="text-xl text-gray-600 max-w-2xl mb-12">
      Join a community of passionate developers, designers, and tech enthusiasts. 
      Learn, build, and grow together.
    </p>
    
    <div className="flex gap-4">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="px-8 py-4 bg-blue-600 text-white rounded-xl font-semibold shadow-xl"
      >
        Browse Events →
      </motion.button>
      
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="px-8 py-4 border-2 border-blue-600 text-blue-600 rounded-xl font-semibold"
      >
        Join Chapter
      </motion.button>
    </div>
  </motion.div>
  
  {/* Scroll indicator */}
  <motion.div
    animate={{ y: [0, 10, 0] }}
    transition={{ repeat: Infinity, duration: 1.5 }}
    className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
  >
    <ChevronDown className="text-gray-400" size={32} />
  </motion.div>
</section>
```

### Bento Grid (Apple-Style)

```jsx
<div className="grid grid-cols-4 gap-4 p-8">
  <motion.div
    whileHover={{ scale: 1.02 }}
    className="col-span-2 row-span-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl p-8 text-white"
  >
    <h3 className="text-3xl font-bold mb-4">Upcoming Events</h3>
    <p>Don't miss our next workshop!</p>
  </motion.div>
  
  <motion.div
    whileHover={{ scale: 1.02 }}
    className="col-span-2 bg-white rounded-3xl p-8 shadow-lg"
  >
    <h3 className="text-2xl font-bold mb-2">500+ Members</h3>
    <p className="text-gray-600">Join our growing community</p>
  </motion.div>
  
  {/* More cards... */}
</div>
```

### Glassmorphism Card

```jsx
<div className="relative overflow-hidden rounded-2xl">
  {/* Blurred background */}
  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 backdrop-blur-xl" />
  
  {/* Border gradient */}
  <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-white/20 to-white/5" />
  
  {/* Content */}
  <div className="relative p-8 text-white">
    <h3 className="text-2xl font-bold mb-4">Glassmorphism</h3>
    <p className="text-white/80">Modern, beautiful, and on-trend</p>
  </div>
</div>
```

### Interactive Event Card

```jsx
<motion.div
  whileHover={{ y: -8, rotateX: 5, rotateY: 5 }}
  className="group cursor-pointer"
  style={{ transformStyle: 'preserve-3d' }}
>
  <div className="relative overflow-hidden rounded-2xl bg-white shadow-xl">
    {/* Image */}
    <div className="relative h-48 overflow-hidden">
      <motion.img
        whileHover={{ scale: 1.1 }}
        transition={{ duration: 0.4 }}
        src={event.image}
        className="w-full h-full object-cover"
      />
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
      
      {/* Badge */}
      <div className="absolute top-4 right-4 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
        Workshop
      </div>
    </div>
    
    {/* Content */}
    <div className="p-6">
      <h3 className="text-xl font-bold mb-2 group-hover:text-blue-600 transition-colors">
        {event.title}
      </h3>
      
      <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
        <span className="flex items-center gap-1">
          <Calendar size={16} />
          {event.date}
        </span>
        <span className="flex items-center gap-1">
          <MapPin size={16} />
          {event.location}
        </span>
      </div>
      
      <p className="text-gray-600 mb-4 line-clamp-2">
        {event.description}
      </p>
      
      <motion.button
        whileHover={{ x: 5 }}
        className="flex items-center gap-2 text-blue-600 font-semibold"
      >
        Learn More <ArrowRight size={16} />
      </motion.button>
    </div>
  </div>
</motion.div>
```

---

## 🎪 MICRO-INTERACTIONS

### Button States

```jsx
<motion.button
  className="relative overflow-hidden px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold"
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
>
  <motion.div
    className="absolute inset-0 bg-white/20"
    initial={{ x: '-100%' }}
    whileHover={{ x: '100%' }}
    transition={{ duration: 0.5 }}
  />
  <span className="relative z-10">Hover Me</span>
</motion.button>
```

### Loading Skeleton

```jsx
<div className="animate-pulse">
  <div className="h-48 bg-gray-200 rounded-lg mb-4" />
  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
  <div className="h-4 bg-gray-200 rounded w-1/2" />
</div>
```

### Toast Notification (Smooth)

```jsx
<motion.div
  initial={{ opacity: 0, y: 50, scale: 0.3 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
  className="bg-green-500 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3"
>
  <CheckCircle size={24} />
  <span>Success! You're registered.</span>
</motion.div>
```

---

## 🎯 PAGE-SPECIFIC ANIMATIONS

### Homepage

1. **Hero**: Fade in from bottom with scale
2. **Stats Section**: Count up animation when in view
3. **Features**: Stagger reveal cards
4. **3D Background**: Slowly rotating, responds to mouse
5. **CTA Section**: Gradient animation background

### Events Page

1. **Filter Pills**: Smooth slide animation when changed
2. **Event Cards**: Stagger on load, hover tilt effect
3. **Calendar View**: Fade between month transitions
4. **Detail Modal**: Scale up from card position

### Team Page

1. **Member Cards**: Grid that staggers in
2. **Hover State**: Card lifts, image zooms slightly
3. **Click**: Modal slides up from bottom
4. **Social Icons**: Stagger reveal on hover

### Admin Dashboard

1. **Stat Cards**: Count up animation
2. **Charts**: Draw animation on load
3. **Tables**: Row-by-row reveal
4. **Sidebar**: Smooth slide transitions

---

## 🚀 PERFORMANCE OPTIMIZATION

### Keep It Fast

```jsx
// Lazy load heavy components
const Spline3D = lazy(() => import('@/components/Spline3D'));

// Use loading states
<Suspense fallback={<LoadingSkeleton />}>
  <Spline3D />
</Suspense>

// Optimize images
import Image from 'next/image'; // or use <img loading="lazy" />

// Reduce motion for accessibility
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

<motion.div
  animate={prefersReducedMotion ? {} : { y: [0, -10, 0] }}
>
```

---

## 🎨 INSPIRATION WEBSITES (Study These)

### Design Excellence
1. **Apple.com** - Scroll animations, product showcases
2. **Stripe.com** - Clean, professional, smooth animations
3. **Linear.app** - Modern SaaS design, beautiful interactions
4. **Vercel.com** - Developer-focused, fast, elegant
5. **Framer.com** - Motion design showcase
6. **Spline.design** - 3D web experiences
7. **Awwwards.com** - Award-winning designs
8. **Behance.net** - Creative portfolios

### Tech Communities
1. **GitHub Universe** - Event page design
2. **Figma Config** - Conference site
3. **Google I/O** - Event showcase
4. **React Conf** - Community site

---

## 📋 IMPLEMENTATION CHECKLIST

### Phase 1: Foundation (Week 1)
- [ ] Set up design system (colors, typography, spacing)
- [ ] Install Framer Motion
- [ ] Create reusable animation variants
- [ ] Build component library (buttons, cards, inputs)

### Phase 2: Hero & Navigation (Week 2)
- [ ] Animated navigation with glassmorphism
- [ ] Hero section with 3D background (Spline)
- [ ] Scroll progress indicator
- [ ] Smooth scroll implementation

### Phase 3: Key Pages (Week 3-4)
- [ ] Events page with filter animations
- [ ] Team page with card grid
- [ ] Interactive event cards
- [ ] Modal transitions

### Phase 4: Admin Panel (Week 5)
- [ ] Dashboard with animated stats
- [ ] Chart animations
- [ ] Table interactions
- [ ] Form micro-interactions

### Phase 5: Polish (Week 6)
- [ ] Add loading states everywhere
- [ ] Optimize performance
- [ ] Test on mobile
- [ ] Add Easter eggs (fun surprises)

---

## 🎪 EASTER EGGS & FUN STUFF

1. **Konami Code**: Unlock special animation
2. **Shake Device**: Easter egg on mobile
3. **Click Logo 10 times**: Secret admin shortcut
4. **Alt+G+D+G**: Show hidden message
5. **Scroll past 100%**: Confetti celebration

---

## 🔥 FINAL BOSS: THE ULTIMATE HERO SECTION

```jsx
<section className="relative min-h-screen overflow-hidden flex items-center justify-center">
  {/* Animated gradient background */}
  <motion.div
    animate={{
      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
    }}
    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
    className="absolute inset-0 opacity-30"
    style={{
      background: 'linear-gradient(270deg, #4285F4, #EA4335, #FBBC04, #34A853)',
      backgroundSize: '400% 400%',
    }}
  />
  
  {/* 3D Spline background */}
  <div className="absolute inset-0 -z-10">
    <Spline scene="..." />
  </div>
  
  {/* Floating particles */}
  {[...Array(20)].map((_, i) => (
    <motion.div
      key={i}
      className="absolute w-2 h-2 bg-blue-500 rounded-full"
      style={{
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
      }}
      animate={{
        y: [0, -30, 0],
        opacity: [0.3, 1, 0.3],
      }}
      transition={{
        duration: 2 + Math.random() * 2,
        repeat: Infinity,
        delay: Math.random() * 2,
      }}
    />
  ))}
  
  {/* Main content */}
  <div className="relative z-10 text-center px-4 max-w-5xl">
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
    >
      {/* Badge */}
      <motion.span
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", delay: 0.2 }}
        className="inline-block px-4 py-2 bg-blue-600/10 backdrop-blur-sm rounded-full text-blue-600 font-semibold text-sm mb-8 border border-blue-600/20"
      >
        🎓 STUDENT CHAPTER
      </motion.span>
      
      {/* Main heading with gradient */}
      <h1 className="text-7xl md:text-9xl font-black mb-6 leading-none">
        {["Google", "Developer", "Groups"].map((word, i) => (
          <motion.span
            key={i}
            className="inline-block mr-6"
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }}
          >
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600">
              {word}
            </span>
          </motion.span>
        ))}
      </h1>
      
      {/* Subheading */}
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="text-4xl md:text-6xl font-bold text-gold-500 mb-8"
      >
        at Georgia Tech
      </motion.h2>
      
      {/* Description */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto"
      >
        Join 500+ passionate developers, designers, and innovators. 
        Build the future, one line of code at a time.
      </motion.p>
      
      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="flex flex-col sm:flex-row gap-4 justify-center"
      >
        <motion.button
          whileHover={{ scale: 1.05, boxShadow: "0 20px 40px rgba(66,133,244,0.3)" }}
          whileTap={{ scale: 0.95 }}
          className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl font-bold text-lg shadow-xl relative overflow-hidden"
        >
          <motion.div
            className="absolute inset-0 bg-white/20"
            initial={{ x: '-100%' }}
            whileHover={{ x: '100%' }}
            transition={{ duration: 0.5 }}
          />
          <span className="relative flex items-center gap-2">
            Browse Events
            <motion.span
              animate={{ x: [0, 5, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            >
              →
            </motion.span>
          </span>
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-8 py-4 bg-white/80 backdrop-blur-sm text-blue-600 rounded-2xl font-bold text-lg shadow-xl border-2 border-blue-600/20"
        >
          Join Chapter
        </motion.button>
      </motion.div>
    </motion.div>
  </div>
  
  {/* Scroll indicator */}
  <motion.div
    animate={{ y: [0, 10, 0] }}
    transition={{ repeat: Infinity, duration: 1.5 }}
    className="absolute bottom-12 left-1/2 -translate-x-1/2 cursor-pointer"
    onClick={() => window.scrollTo({ top: window.innerHeight, behavior: 'smooth' })}
  >
    <motion.div
      whileHover={{ scale: 1.2 }}
      className="w-8 h-12 border-2 border-gray-400 rounded-full flex items-center justify-center"
    >
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 1.5 }}
        className="w-1.5 h-3 bg-gray-400 rounded-full"
      />
    </motion.div>
  </motion.div>
</section>
```

---

## 🎯 MAKE IT YOURS

Remember:
- ✅ Animations should feel natural, not forced
- ✅ Performance > Fancy effects
- ✅ Mobile experience is critical
- ✅ Accessibility matters (reduce motion support)
- ✅ Every animation should serve a purpose
- ✅ When in doubt, less is more (but make that "less" PERFECT)

**Now go make something SO GOOD people can't stop talking about it! 🔥🚀**
