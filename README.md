# Open Door Christian Church Website

**Live Site:** https://opendoorchristian.church  
**Project Type:** Full-stack web application with content management system  
**Built with:** React + Vite + Express.js + PostgreSQL

## Overview

The Open Door Christian Church website is a comprehensive digital presence for the church community, featuring public-facing content, a robust content management system (CMS), and sophisticated internal tools for communication and administration.

### Key Features

- **Public Website**: Home, About, Services, Events, Blog, Donations (Tithe/Give), Contact, and community sections
- **Blog System**: Full-featured blogging with posts, comments, drafts, and publishing workflow
- **Events Management**: Church service schedule and special event management with recurring event support
- **User Authentication**: Secure registration, login, password reset, and JWT-based authorization
- **Admin Dashboard**: Comprehensive management interface for content, users, donations, and communications
- **Email System**: In-app email client with accounts, folders, messages, contacts, auto-replies, and audit logging
- **Donation Management**: Stripe integration for one-time and recurring donations with receipt generation
- **Newsletter Campaigns**: Email newsletter management and distribution
- **AI Assistant**: OpenAI integration for content suggestions and email composition
- **Contact Management**: Member directory with privacy controls and contact information

## Quick Start

### Installation

```bash
npm install
npm run build
npm start
```

The application will start on `http://localhost:3000` (or the port specified in `PORT` environment variable).

### Development

```bash
npm run dev
```

Starts the Vite dev server with hot module reloading for frontend development.

## Project Structure

```
.
├── server/                  # Express.js backend
│   ├── index.js            # Server entry point
│   ├── db.js               # Database initialization and schema
│   ├── config.js           # Configuration management
│   ├── email.js            # Email sending utilities
│   ├── routes/             # API endpoints
│   ├── middleware/         # Express middleware
│   ├── utils/              # Utility functions
│   ├── cron/               # Scheduled jobs
│   ├── scripts/            # Database migration scripts
│   └── data/               # Email templates and configuration
├── src/                    # React frontend
│   ├── App.jsx             # Main application component
│   ├── pages/              # Route pages
│   ├── components/         # Reusable React components
│   ├── contexts/           # React context providers
│   ├── hooks/              # Custom React hooks
│   ├── services/           # API service layer
│   ├── utils/              # Utility functions
│   └── index.css           # Global styles
├── public/                 # Static assets
│   └── uploads/            # User-uploaded files
├── dist/                   # Built frontend (generated)
├── package.json            # Dependencies and scripts
├── vite.config.js          # Vite configuration
├── tailwind.config.js      # Tailwind CSS configuration
└── postcss.config.js       # PostCSS configuration
```

## Technology Stack

### Frontend
- **React 18**: UI framework
- **Vite**: Build tool and dev server
- **React Router**: Client-side routing
- **Tailwind CSS**: Utility-first CSS framework
- **TipTap**: Rich text editor for content creation
- **CodeMirror**: HTML code editor
- **Stripe.js**: Payment processing

### Backend
- **Express.js**: Web framework
- **PostgreSQL**: Relational database
- **JWT**: JSON Web Tokens for authentication
- **bcryptjs**: Password hashing
- **Multer**: File upload handling
- **SendGrid**: Email delivery
- **Stripe API**: Payment processing
- **OpenAI**: AI-powered features
- **Sharp**: Image processing

### Deployment
- **PM2**: Process manager for production
- **Nginx**: Reverse proxy (managed by platform)
- **Cloud VPS**: Hosting infrastructure

## Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/church_db

# Server
PORT=3000
NODE_ENV=production

# Authentication
JWT_SECRET=your-secret-key-here

# CORS
CORS_ORIGIN=https://opendoorchristian.church

# Security
TURNSTILE_SECRET_KEY=your-turnstile-secret
TURNSTILE_SITE_KEY=your-turnstile-site-key

# Email
SENDGRID_API_KEY=your-sendgrid-api-key
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key

# Stripe
STRIPE_SECRET_KEY=your-stripe-secret-key
STRIPE_PUBLISHABLE_KEY=your-stripe-publishable-key
STRIPE_WEBHOOK_SECRET=your-webhook-secret

# OpenAI
OPENAI_API_KEY=your-openai-api-key

# File Storage
DATA_DIR=./data
```

## Documentation

Comprehensive documentation is available in the following files:

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Technical architecture, design decisions, and system overview
- **[DATABASE.md](./DATABASE.md)** - Database schema, models, and data relationships
- **[API.md](./API.md)** - REST API endpoints and usage examples
- **[FEATURES.md](./FEATURES.md)** - Detailed feature documentation and user guides
- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Development setup, best practices, and code guidelines
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Production deployment, configuration, and maintenance

## Church Information

**Open Door Christian Church**
- **Address:** 1700 S Clara Ave, DeLand, FL 32724
- **Phone:** (386) 734-8200
- **Founded:** 1986
- **Website:** https://opendoorchristian.church

## Support & Maintenance

For issues, questions, or feature requests, please contact the development team or refer to the [DEVELOPMENT.md](./DEVELOPMENT.md) guide.

## License

This project is proprietary to Open Door Christian Church. All rights reserved.
