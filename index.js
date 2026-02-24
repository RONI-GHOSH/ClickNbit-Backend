const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import routes
const adminRoutes = require('./routes/admin.routes');
const loginRoutes = require('./routes/login.routes');
const userRoutes = require('./routes/user.routes');
const newsRoutes = require('./routes/news.routes');
const prefRoutes = require('./routes/preferences.routes');
const uploadRoutes = require('./routes/upload.routes');
const newsTypesRoutes = require('./routes/news-types.routes');
const catRoutes = require('./routes/cat.routes');
const adFormatsRoutes = require('./routes/ad-formats.routes');
const engagementRoutes = require('./routes/engagement.routes');
const advertisementsRoutes = require('./routes/advertisements.routes');
const autosaveRoutes = require('./routes/autosave.routes');
const saveRoutes = require('./routes/save.routes');
const cronRoutes = require('./routes/feed-cron');
const settingsRoutes = require('./routes/settings.routes');
// const internalFeedRoutes = require('./routes/feed-apis');

const compression = require('compression');
const rateLimit = require('express-rate-limit');

// ... imports remain the same

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust Proxy for Vercel/Cloudflare
app.set('trust proxy', 1);

// Middleware
// Define allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
    'https://clicknbit.in',
    'https://www.clicknbit.in',
    'https://s3.clicknbit.in',
    'https://clicknbitadminvercelapp.vercel.app',
    'https://admin.clicknbit.in',
    'https://editor.clicknbit.in',
    'https://clicknbit-backend.vercel.app',
    'https://clickbit-admin-panel-djhg.vercel.app',
    'https://click-nbit-editor.vercel.app',
    'https://clickbit-admin-panel.vercel.app'
  ];

// Add localhost for development
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002');
}

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after 15 minutes',
  skip: (req) => process.env.NODE_ENV === 'development' // Skip in development
});

app.use(helmet()); // Security headers
app.use(compression()); // Compress all responses
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use('/api/', limiter); // Apply rate limiting to API routes only
app.use(morgan('dev')); // Logging
app.use(express.json({ limit: '50mb' })); // Parse JSON bodies
app.use(express.urlencoded({ limit: '50mb', extended: true })); // Parse URL-encoded bodies

// Routes
app.use('/api/admin', adminRoutes);
app.use('/api/login', loginRoutes);
app.use('/api/profile', userRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/preferences', prefRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/news-types', newsTypesRoutes);
app.use('/api/categories', catRoutes);
app.use('/api/ad-formats', adFormatsRoutes);
app.use('/api/engagements', engagementRoutes);
app.use('/api/advertisements', advertisementsRoutes);
app.use('/api/autosave', autosaveRoutes);
app.use('/api/save', saveRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/settings', settingsRoutes);
// app.use('/api/internal-feed', internalFeedRoutes);
// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to ClickNbit News API' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});