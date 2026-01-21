# Settings Pages Documentation

This directory contains the settings pages for the Pulse API web application.

## Pages

### Settings.tsx

User preferences and account settings page with three main sections:

#### Features:
- **User Information**: Full name and email address management
- **Notifications**: Optional separate notification email configuration
- **Preferences**:
  - Theme selection (light/dark)
  - Default check interval for new endpoints
  - Alert threshold percentage

#### API Integration:
- `GET /api/settings` - Fetch user settings
- `POST /api/settings` - Save user settings

#### Form Validation:
- Required field validation for name and email
- Email format validation (optional notification email)
- Numeric range validation for intervals and thresholds
- Real-time error display

#### UX Features:
- Full-screen loading spinner while fetching settings
- Success/error alerts with auto-dismiss
- Disabled save button while submitting
- Helpful hints for each preference
- Clear section headers for organization

### Endpoints.tsx

Endpoint management interface with add/edit/delete functionality.

#### Features:
- **List View**: Displays all monitored endpoints with:
  - Endpoint name and URL
  - Check interval
  - Creation date
  - Last check timestamp
  - Status badge (Up/Down with optional pulsing animation)

- **Add/Edit Form**: Side panel form with:
  - Endpoint name input
  - URL validation
  - Check interval configuration

- **Actions**: Edit and delete buttons for each endpoint

#### API Integration:
- `GET /api/endpoints` - Fetch all endpoints
- `POST /api/endpoints` - Create new endpoint
- `PUT /api/endpoints/:id` - Update endpoint
- `DELETE /api/endpoints/:id` - Delete endpoint

#### Form Validation:
- Endpoint name required
- URL format validation (uses native URL constructor)
- Check interval range validation (10-3600 seconds)
- Error messages displayed inline

#### UX Features:
- Empty state with call-to-action
- Responsive grid layout (1 column on mobile, 3 columns on desktop)
- Sticky form when editing/creating
- Confirmation dialog before deletion
- Loading states for async operations
- Success/error alerts with auto-dismiss
- Disabled buttons during operations

## Components

### FormComponents.tsx

Reusable form components built with Tailwind CSS:

#### Components:
- **FormField**: Text input with label, placeholder, validation error display
- **FormSelect**: Select dropdown with options
- **Form**: Form wrapper with submit/cancel buttons
- **Alert**: Dismissible alert component (success/error/info/warning)
- **LoadingSpinner**: Animated loading indicator (with fullScreen option)
- **EmptyState**: Empty state display with optional action button

#### Features:
- Consistent styling with Tailwind CSS
- Accessibility features (labels, ARIA attributes)
- Error state styling with red borders
- Disabled state handling
- Loading state feedback

### StatusBadge.tsx

Status indicator component for endpoint health monitoring.

#### Features:
- **Status Display**: Shows "Up" or "Down" status with color coding
  - Up: Green background with green dot
  - Down: Red background with red dot
- **Sizes**: Small, medium, large
- **Pulse Animation**: Optional pulsing dot for "Up" status
- **Custom Label**: Override default "Up"/"Down" text

#### Styling:
- Inline styled with Tailwind CSS
- Responsive sizing
- Smooth animations

## API Contract

### Settings Endpoints

```typescript
// GET /api/settings
Response: {
  name: string;
  email: string;
  notificationEmail?: string;
  theme: 'light' | 'dark';
  checkInterval: number; // seconds
  alertThreshold: number; // percentage
}

// POST /api/settings
Request/Response: Same as GET
```

### Endpoints API

```typescript
// GET /api/endpoints
Response: Endpoint[]

interface Endpoint {
  id: string;
  name: string;
  url: string;
  interval_seconds: number;
  createdAt: string;
  status?: 'up' | 'down';
  lastChecked?: string;
}

// POST /api/endpoints
Request: {
  name: string;
  url: string;
  interval_seconds: number;
}
Response: Endpoint

// PUT /api/endpoints/:id
Request/Response: Same as POST

// DELETE /api/endpoints/:id
Response: { success: boolean }
```

## Authentication

All endpoints require Bearer token authentication via the `Authorization` header:

```typescript
headers: {
  'Authorization': `Bearer ${localStorage.getItem('token')}`
}
```

Token is retrieved from localStorage and should be set during login.

## Error Handling

Both pages include comprehensive error handling:

1. **Network Errors**: Caught and displayed as error alerts
2. **Validation Errors**: Field-level error messages
3. **API Errors**: Displayed as dismissible alerts
4. **Loading States**: Full-screen spinner during initial load
5. **Fallback Behavior**: Default values used if settings can't be loaded

## Styling

All components use Tailwind CSS for styling with:
- Light gray backgrounds (bg-gray-50)
- White cards with shadows (rounded-lg, shadow-md)
- Blue accent color for primary actions (blue-600)
- Red for destructive actions
- Green for success states
- Responsive grid layouts

## Usage

Import and use the pages in your routing configuration:

```typescript
import Settings from './pages/Settings';
import Endpoints from './pages/Endpoints';

// In your router/navigation
<Route path="/settings" component={Settings} />
<Route path="/endpoints" component={Endpoints} />
```

## Future Enhancements

- Pagination for large endpoint lists
- Bulk operations (delete multiple endpoints)
- Export settings/endpoints data
- Import endpoints from file
- Endpoint health history graphs
- Notification preferences (frequency, channels)
- Email verification for notification emails
- Dark mode implementation
- Endpoint tagging and filtering
