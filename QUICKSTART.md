# Student App Quick Start Guide

## Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v16 or higher)
- Git

## Local Development Setup

### 1. Database Setup
```bash
# Start PostgreSQL service (Windows)
# Use Services.msc or run:
net start postgresql-x64-16

# Create database
psql -U postgres -d postgres -c "CREATE DATABASE studentapp;"
```

### 2. Backend Setup
```bash
cd backend
# Copy environment file
copy .env.example .env

# Edit .env with your settings:
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studentapp
# JWT_SECRET=dev_secret_key_change_this_in_production
# EXPOSE_RESET_CODE=true
# SCHOOL_MAIL_ENABLED=false

# Install dependencies
npm install

# Initialize database
npm run init-db

# Start backend server
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
# Install dependencies
npm install

# Start frontend server
npm run dev
```

### 4. Access the Application
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api

## Common Issues and Solutions

### Blank Page After Login
**Problem**: User sees a blank page after successful login.

**Solutions**:
1. Check backend server is running on port 5000
2. Check database connection is working
3. Check browser console for JavaScript errors
4. Verify API URL configuration in frontend
5. Clear browser cache and localStorage

### Database Connection Issues
**Problem**: Backend fails to connect to PostgreSQL.

**Solutions**:
1. Ensure PostgreSQL service is running
2. Verify DATABASE_URL in backend/.env is correct
3. Check PostgreSQL credentials
4. Test connection: `psql -U postgres -d studentapp`

### API Connection Issues
**Problem**: Frontend cannot connect to backend API.

**Solutions**:
1. Verify backend is running on port 5000
2. Check CORS configuration in backend/index.js
3. Verify VITE_API_URL in frontend (if set)
4. Check browser network tab for failed requests

## Testing Authentication Flow

### Create Test User
```bash
# Using backend API
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Student",
    "email": "test@school.edu",
    "password": "Test123456",
    "role": "student",
    "school_id": 1
  }'
```

### Test Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@school.edu",
    "password": "Test123456"
  }'
```

## Production Deployment

### Backend (VPS)
```bash
# On production server
cd /path/to/backend
curl -fsSL https://raw.githubusercontent.com/Kwizera250232/Teacher-s-App-backend/main/scripts/cloudpanel-deploy.sh | bash
```

### Frontend (Vercel)
- Frontend auto-deploys from main branch to student.umunsi.com
- Ensure VITE_API_URL points to production API

## Development Tips

1. **Use EXPOSE_RESET_CODE=true** in development to see password reset codes in UI
2. **Set SCHOOL_MAIL_ENABLED=false** to disable email features in development
3. **Check browser console** for JavaScript errors when debugging
4. **Use React DevTools** for component debugging
5. **Monitor backend logs** for API errors

## Support

For issues or questions:
- Check AGENTS.md in backend/ and frontend/ directories
- Review error messages in browser console and backend logs
- Verify database schema is up to date with `npm run init-db`
