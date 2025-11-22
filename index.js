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

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

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