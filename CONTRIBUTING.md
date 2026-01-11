# Contributing to Nebula

First off, thanks for considering contributing to Nebula! 🎉

## Ways to Contribute

### 🐛 Reporting Bugs

Found a bug? Please [open an issue](https://github.com/maskrdotio/nebula/issues/new) with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
- Your environment (browser, OS, Ceph/MinIO version)

### 💡 Suggesting Features

Have an idea? [Start a discussion](https://github.com/maskrdotio/nebula/discussions) or open an issue with:
- Clear description of the feature
- Why it would be useful
- Any implementation ideas you have

### 🌍 Translations

Want to add your language? Here's how:

1. Copy `i18n/locales/en.json` to `i18n/locales/{your-locale}.json`
2. Translate all the strings (keep the keys, translate the values)
3. Add your locale to `nuxt.config.ts`
4. Submit a PR

**Guidelines for translations:**
- Keep technical terms (S3, ACL, CORS, etc.) as-is
- Use natural, conversational language (not robotic translations)
- Test your translations in the actual UI

Currently supported:
- 🇬🇧 English (`en`)
- 🇷🇺 Russian (`ru`)

### 🔧 Code Contributions

#### Setting Up Development Environment

```bash
# Fork and clone the repo
git clone https://github.com/YOUR_USERNAME/nebula.git
cd nebula

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The app will be available at http://localhost:3000

#### Project Structure

```
nebula/
├── app/
│   ├── assets/css/          # Global styles
│   ├── components/
│   │   ├── bucket/          # Bucket cards, modals, settings
│   │   ├── common/          # Breadcrumbs, empty states
│   │   ├── connection/      # Connection forms, preset cards
│   │   ├── layout/          # AppLayout, Sidebar
│   │   ├── object/          # File preview, code viewer, row
│   │   ├── ui/              # Button, Input, Modal, Toast, Toggle...
│   │   ├── upload/          # Upload panel
│   │   └── user/            # User create/credentials modals
│   ├── composables/
│   │   ├── usePresets.ts    # Environment presets
│   │   ├── useRgwAdmin.ts   # Ceph RGW Admin API
│   │   ├── useS3Client.ts   # S3 operations
│   │   └── useSavedConnections.ts
│   ├── pages/
│   │   ├── browse/[...path].vue  # Object browser
│   │   ├── users/[uid].vue       # User detail
│   │   ├── users/index.vue       # Users list
│   │   ├── analytics.vue
│   │   ├── buckets.vue
│   │   ├── connect.vue
│   │   └── index.vue             # Dashboard
│   ├── stores/
│   │   ├── connection.ts    # Connection state & backend detection
│   │   ├── toast.ts         # Notifications
│   │   └── uploads.ts       # Upload queue
│   ├── types/
│   │   └── connection.ts    # TypeScript interfaces
│   └── app.vue
├── i18n/
│   └── locales/
│       ├── en.json          # English
│       └── ru.json          # Russian
├── server/
│   ├── api/
│   │   ├── config/
│   │   │   └── presets.get.ts    # Serve env presets to client
│   │   └── proxy/
│   │       ├── admin.post.ts     # Proxy RGW Admin API
│   │       └── s3.post.ts        # Proxy S3 API
│   └── utils/
│       └── presets.ts       # Parse env vars
├── nuxt.config.ts
├── package.json
└── tsconfig.json
```

#### Code Style

- We use TypeScript - please maintain type safety
- Vue 3 Composition API with `<script setup>`
- Tailwind CSS for styling
- Use existing components and patterns where possible

#### Commit Messages

Keep them clear and descriptive:
```
feat: add bucket lifecycle management
fix: handle empty bucket deletion error
docs: update README with docker instructions
i18n: add German translation
```

#### Pull Request Process

1. Fork the repo and create your branch from `main`
2. Make your changes
3. Test your changes thoroughly
4. Update documentation if needed
5. Submit a PR with a clear description

## Development Tips

### Testing with Different Backends

**Ceph RGW:**
- Full features available
- Need admin user for Users/Analytics/Quotas

**MinIO:**
- Basic S3 features work
- Admin features will be hidden automatically

### Environment Variables for Development

Create a `.env` file for local testing:
```env
NEBULA_RGW_1_NAME=Local Ceph
NEBULA_RGW_1_ENDPOINT=http://localhost:8888
NEBULA_RGW_1_REGION=us-east-1
```

### Proxy Mode Testing

To test proxy mode locally:
```env
NEBULA_RGW_1_PROXY=true
NEBULA_RGW_1_ACCESS_KEY=your-key
NEBULA_RGW_1_SECRET_KEY=your-secret
```

## Questions?

- 💬 [GitHub Discussions](https://github.com/maskrdotio/nebula/discussions) for questions and ideas
- 🐛 [GitHub Issues](https://github.com/maskrdotio/nebula/issues) for bugs and feature requests

## Code of Conduct

Be kind. Be respectful. We're all here to build something useful.

No tolerance for harassment, discrimination, or being a jerk. Simple as that.

---

Thanks for helping make Nebula better! 🚀