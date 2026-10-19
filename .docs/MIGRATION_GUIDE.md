# GDG@GT Website - Migration Guide from GDG PSU

## ✅ Files Successfully Copied

All files from the GDG PSU website have been successfully copied to this directory. Below is a comprehensive guide to customize it for GDG@GT.

---

## 📋 Quick Start Checklist

### Step 1: Update Package Information (5 minutes)
```bash
# File: package.json
- Change "name" from "gdg-website" to "gdg-gt-website"
- Update repository URL if using Git
```

### Step 2: Update Branding (15 minutes)
1. **Replace Logo Files**
   - `public/logo.png` - Add GDG@GT logo
   - `public/favicon.png` - Add GT favicon
   - Recommended size: 512x512px for logo, 32x32px for favicon

2. **Update Colors** (Optional - if GT has different brand colors)
   - File: `tailwind.config.ts`
   - File: `src/index.css` (look for CSS custom properties)

### Step 3: Update Meta Tags & SEO (10 minutes)
**File: `index.html`**
- Replace "Penn State University" → "Georgia Tech" / "Georgia Institute of Technology"
- Replace "PSU" → "GT"
- Replace "Pennsylvania State University" → "Georgia Tech"
- Update canonical URL: `https://gdgpsu.dev` → Your GT domain
- Update social media handles (Twitter, GitHub, LinkedIn)
- Update contact email: `gdg@psu.edu` → `gdg@gatech.edu` (or correct email)
- Update og:image URLs to point to your domain

### Step 4: Update PWA Manifest (5 minutes)
**File: `public/manifest.json`**
```json
{
  "name": "GDG on Campus GT",
  "short_name": "GDG GT",
  "description": "Google Developer Group on Campus at Georgia Tech"
}
```

### Step 5: Update Environment Variables (10 minutes)
**File: `.env.example` → Create `.env` or `.env.local`**
```bash
# Supabase Configuration (You'll need to create a new Supabase project)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Backend keys (NEVER expose these)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Email Configuration (Sign up at resend.com)
VITE_EMAIL_API_URL=https://api.resend.com
VITE_RESEND_API_KEY=your_resend_api_key
VITE_FROM_EMAIL=noreply@your-gt-domain.com
VITE_FROM_NAME=GDG on Campus GT
VITE_DOMAIN=your-gt-domain.com
```

---

## 🎨 Content Customization Guide

### Home Page
**File: `src/pages/Home.tsx`**
- Update hero section text
- Update mission/vision statements
- Update statistics (member count, events, etc.)
- Update featured events/projects

### Team Page
**File: `src/pages/Team.tsx`**
- This pulls from the database `team_members` table
- You'll add your team through the admin panel after setup

### Contact Page
**File: `src/pages/Contact.tsx`**
- Update contact email
- Update social media links
- Update meeting information
- Update office/location details (if applicable)

### Footer
**File: `src/components/Footer.tsx`**
- Update organization name references
- Update social media links
- Update contact information
- Update copyright year and organization name

### Navigation
**File: `src/components/Navigation.tsx`**
- Generally no changes needed
- May want to add/remove menu items

---

## 🗄️ Database Setup (Critical!)

### Step 1: Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Note down:
   - Project URL
   - Anon (public) Key
   - Service Role Key (keep secret!)

### Step 2: Run Database Migrations
```bash
# Install Supabase CLI first
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run all migrations (79 migration files!)
supabase db reset

# Or push migrations one by one
supabase db push
```

### Step 3: Create Admin User
After migrations run, you'll need to create your first admin user:

**Option A: Use the secret code during newsletter signup**
- Secret code is defined in the database
- Default is `gdg-secret@psu.edu` (you should change this!)
- Sign up for newsletter with this "email" to become admin

**Option B: Directly in database**
```sql
INSERT INTO admin_users (username, email, role, is_active)
VALUES ('your_username', 'your_email@gatech.edu', 'super_admin', true);

-- Set password (run through Supabase SQL Editor)
UPDATE admin_users 
SET password_hash = crypt('YourStrongPassword123!', gen_salt('bf'))
WHERE email = 'your_email@gatech.edu';
```

---

## 📧 Email Setup

### Step 1: Sign Up for Resend
1. Go to [resend.com](https://resend.com)
2. Create account (free tier available)
3. Get API key

### Step 2: Verify Domain (Optional but recommended)
- Add your domain to Resend
- Add DNS records
- Verify domain

### Step 3: Update Email Templates
**Locations:**
- `supabase/functions/` - Various email edge functions
- Update sender name and organization references

---

## 🚀 Deployment Guide

### Option 1: Vercel (Recommended - Pre-configured)
1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel
   ```

4. **Set Environment Variables in Vercel Dashboard**
   - Go to Vercel project settings
   - Add all environment variables from `.env`

5. **Connect Domain**
   - Add custom domain in Vercel settings
   - Update DNS records

### Option 2: Other Platforms
The project uses standard Vite build, so it can be deployed to:
- Netlify
- GitHub Pages
- AWS S3 + CloudFront
- Any static hosting service

**Build command**: `npm run build`
**Output directory**: `dist`

---

## 🔐 Security Checklist

### Before Going Live:
- [ ] Change admin secret code in database
- [ ] Create strong admin passwords (14+ characters)
- [ ] Update CORS settings in Supabase
- [ ] Enable RLS on all database tables (already enabled in migrations)
- [ ] Review `vercel.json` security headers
- [ ] Test email delivery
- [ ] Verify SSL certificate on custom domain
- [ ] Set up database backups
- [ ] Review audit logging

### Security Features Already Implemented:
✅ Row Level Security (RLS) on all tables
✅ Password hashing server-side
✅ Rate limiting on authentication
✅ CSRF protection
✅ XSS prevention (DOMPurify)
✅ Content Security Policy headers
✅ Audit logging for all admin actions
✅ Security event tracking

---

## 🛠️ Development Workflow

### Initial Setup
```bash
# Install dependencies
npm install

# Create .env file (copy from .env.example)
cp .env.example .env

# Edit .env with your values
# Then start development server
npm run dev
```

### Development Commands
```bash
# Start dev server (http://localhost:8080)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Database commands (requires Supabase CLI)
supabase db reset    # Reset database with migrations
supabase db push     # Push schema changes
supabase gen types   # Generate TypeScript types
```

### Development URL
Default: `http://localhost:8080`

### Admin Panel Access
URL: `http://localhost:8080/admin`

**First-time login:**
1. Sign up for newsletter with secret code: `gdg-secret@psu.edu`
2. Or create admin user directly in database (see Database Setup)

---

## 📁 Important Files to Customize

### High Priority (Must Change)
- [ ] `index.html` - Meta tags, SEO, branding
- [ ] `public/manifest.json` - PWA configuration
- [ ] `public/logo.png` - Organization logo
- [ ] `public/favicon.png` - Site favicon
- [ ] `package.json` - Project name
- [ ] `.env` - Environment variables
- [ ] `src/pages/Home.tsx` - Home page content
- [ ] `src/pages/Contact.tsx` - Contact information
- [ ] `src/components/Footer.tsx` - Footer content

### Medium Priority (Should Change)
- [ ] `README.md` - Project documentation
- [ ] `public/humans.txt` - Team credits
- [ ] `src/pages/Team.tsx` - Team page (or use admin panel)
- [ ] `src/pages/Events.tsx` - Events page styling/content
- [ ] `src/pages/Projects.tsx` - Projects page content
- [ ] Database content (through admin panel)

### Low Priority (Optional)
- [ ] `tailwind.config.ts` - Design system (if custom colors needed)
- [ ] `src/index.css` - Global styles (if theme changes needed)
- [ ] Email templates in `supabase/functions/`

---

## 📊 Admin Panel Guide

### Accessing Admin Panel
1. Navigate to `/admin` on your website
2. Login with admin credentials
3. You'll see the admin dashboard

### Admin Features Available

#### 1. Dashboard
- Real-time statistics
- Recent activity
- Quick actions
- System health monitoring

#### 2. Content Management
- **Content Editor**: Edit all page content
- **Events**: Create and manage events
- **Blog**: Publish and manage blog posts
- **Projects**: Showcase projects
- **Team**: Manage team members
- **Sponsors**: Manage sponsor relationships

#### 3. Member Management
- **Members**: Complete member database
- **Member Categories**: Founder, Organizer, Lead, Active, Member, Alumni
- **Activity Tracking**: View member engagement

#### 4. Communications
- **Newsletter**: Email campaign system
- **Communications**: Bulk email to segments
- **Subscribers**: Manage email subscribers
- **Campaign Analytics**: Track email performance

#### 5. Media & Assets
- **Media Library**: Upload and manage files
- **Gallery**: Photo gallery management
- **Blog Images**: Image uploads for blog posts

#### 6. Advanced Features
- **Linktree**: Social link management
- **Teams**: Internal team collaboration
- **Whiteboard**: Collaborative drawing
- **Channels**: Communication channels
- **Finances**: Budget tracking
- **Audit Log**: View all admin actions
- **Security**: Monitor security events
- **Site Status**: Maintenance mode control

#### 7. Settings
- **Users**: Manage admin users
- **Profile**: Update your admin profile
- **Resources**: Learning resources
- **Site Settings**: Global configuration

---

## 🎯 Recommended Customization Order

### Week 1: Setup & Configuration
1. **Day 1-2**: Environment setup
   - Install dependencies
   - Create Supabase project
   - Run database migrations
   - Configure environment variables
   - Test local development

2. **Day 3-4**: Branding
   - Replace logo and favicon
   - Update all PSU → GT references
   - Update meta tags
   - Update colors (if needed)

3. **Day 5-7**: Content
   - Update home page
   - Update contact information
   - Test admin panel
   - Add initial team members
   - Create first event/blog post

### Week 2: Testing & Launch
1. **Day 8-10**: Testing
   - Test all pages
   - Test admin features
   - Test email delivery
   - Test on mobile devices
   - Fix any issues

2. **Day 11-12**: Deployment
   - Deploy to Vercel
   - Configure custom domain
   - Set up production environment variables
   - Test production site

3. **Day 13-14**: Post-launch
   - Monitor for issues
   - Add more content
   - Train team members on admin panel
   - Create documentation

---

## 🔍 Find & Replace Guide

Use your IDE's global find & replace feature for these:

### Text Replacements
```
Find: "Penn State University" or "Pennsylvania State University"
Replace: "Georgia Tech" or "Georgia Institute of Technology"

Find: "PSU"
Replace: "GT"

Find: "gdgpsu" or "GDG@PSU" or "GDG on Campus PSU"
Replace: "gdggt" or "GDG@GT" or "GDG on Campus GT"

Find: "gdg@psu.edu"
Replace: "gdg@gatech.edu" (or your actual email)

Find: "https://gdgpsu.dev"
Replace: "https://your-gt-domain.com"

Find: "@gdgpsu" (Twitter/social)
Replace: "@gdggt" (or your social handle)
```

### Files to Search In
- All `.tsx` and `.ts` files in `src/`
- `index.html`
- `public/manifest.json`
- `README.md`
- `package.json`

---

## 🐛 Common Issues & Solutions

### Issue 1: "Module not found" errors
**Solution**: Run `npm install` to install all dependencies

### Issue 2: Database connection errors
**Solution**: 
- Verify Supabase environment variables are correct
- Check Supabase project is active
- Ensure RLS policies are enabled

### Issue 3: Email sending fails
**Solution**:
- Verify Resend API key is correct
- Check Resend account is active
- Verify sender email/domain

### Issue 4: Admin panel shows "Access Denied"
**Solution**:
- Verify admin user exists in database
- Check admin_users table has correct permissions
- Verify session is active

### Issue 5: Build fails
**Solution**:
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear cache: `rm -rf .cache dist`
- Check for TypeScript errors: `npm run lint`

### Issue 6: Supabase migrations fail
**Solution**:
- Migrations must run in order
- Check for existing tables/conflicts
- Try `supabase db reset` for clean slate

---

## 📚 Additional Resources

### Documentation
- **Project README**: `README.md`
- **Security Guide**: `SECURITY.md`
- **Complete Analysis**: `PROJECT_ANALYSIS.md`

### External Resources
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Guide](https://vite.dev/guide/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Resend Email Docs](https://resend.com/docs)
- [Vercel Documentation](https://vercel.com/docs)

### Tech Stack Reference
See `PROJECT_ANALYSIS.md` for complete technology breakdown

---

## 💡 Tips for Success

### 1. Start Small
- Get basic site running first
- Add content gradually
- Test each feature before moving on

### 2. Use Admin Panel
- Don't edit database directly (except for initial setup)
- Use admin panel for all content management
- This ensures proper audit logging

### 3. Test Thoroughly
- Test on multiple devices
- Test all forms and submissions
- Test email delivery before launch

### 4. Keep Backups
- Supabase provides automatic backups
- Keep local database dumps
- Version control with Git

### 5. Security First
- Change all default passwords
- Review security settings
- Monitor audit logs
- Keep dependencies updated

### 6. Performance Monitoring
- Use Vercel Analytics (already integrated)
- Monitor page load times
- Optimize images before uploading

### 7. Documentation
- Document any customizations you make
- Keep track of environment variables
- Maintain admin user list

---

## ✅ Pre-Launch Checklist

### Content
- [ ] All PSU references changed to GT
- [ ] Logo and favicon updated
- [ ] Contact information correct
- [ ] Social media links working
- [ ] Home page content written
- [ ] At least 3 team members added
- [ ] At least 1 event created
- [ ] About section completed

### Technical
- [ ] All environment variables set
- [ ] Database migrations successful
- [ ] Admin user created
- [ ] Email delivery tested
- [ ] Forms tested (contact, newsletter)
- [ ] All pages load without errors
- [ ] Mobile responsive verified
- [ ] Cross-browser tested

### Security
- [ ] Admin password strong (14+ chars)
- [ ] Admin secret code changed
- [ ] HTTPS enabled
- [ ] Environment variables secured
- [ ] RLS policies verified
- [ ] Security headers configured

### Deployment
- [ ] Vercel project created
- [ ] Custom domain configured
- [ ] SSL certificate active
- [ ] Production build tested
- [ ] Analytics configured
- [ ] Error monitoring set up

---

## 🎉 You're Ready!

Once you've completed this checklist, your GDG@GT website will be ready to launch!

**Estimated Total Time**: 2-3 weeks
- **Setup**: 3-5 days
- **Customization**: 7-10 days  
- **Testing**: 3-5 days

**Need Help?**
- Check `PROJECT_ANALYSIS.md` for detailed technical information
- Review `SECURITY.md` for security best practices
- Consult the original GDG PSU codebase for examples

---

**Good luck with your GDG@GT website! 🚀**

*Migration guide created: January 2026*
