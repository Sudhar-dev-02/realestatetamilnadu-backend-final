# Real Estate Tamil Nadu — Backend & Database Architecture

Production-ready MERN-stack backend API and database architecture built with **Node.js**, **Express.js**, **MongoDB**, and **Mongoose**, implementing a 3-tier administration and referral hierarchy:

$$\textbf{Super Admin} \longrightarrow \textbf{Mediator} \longrightarrow \textbf{Seller}$$

---

## Architecture Overview

```
backend/
├── config/
│   └── db.js                 # MongoDB connection & reconnection handler
├── controllers/
│   ├── authController.js     # Mediator/Seller registration, login, profile, referral check
│   ├── adminController.js    # Super Admin management of Mediators, Sellers, and Listings
│   ├── mediatorController.js # Mediator managing assigned Sellers & their properties
│   ├── sellerController.js   # Seller managing own profile & assigned mediator info
│   └── propertyController.js # Public property search, filter, and detail retrieval
├── middleware/
│   ├── authMiddleware.js      # JWT verification & populates req.user
│   ├── roleMiddleware.js      # Role-based access control (SUPER_ADMIN, MEDIATOR, SELLER)
│   ├── errorMiddleware.js     # Centralized 404 and Error Handler
│   └── validateMiddleware.js  # express-validator request validation handler
├── models/
│   ├── User.js               # Unified User schema with role-based attributes & referral relations
│   └── Property.js           # Property & Land listing schema
├── routes/
│   ├── authRoutes.js         # /api/auth
│   ├── adminRoutes.js        # /api/admin
│   ├── mediatorRoutes.js     # /api/mediator
│   ├── sellerRoutes.js       # /api/seller
│   └── propertyRoutes.js     # /api/properties
├── services/
│   ├── authService.js        # Registration, password hashing, and token signing
│   ├── referralService.js    # Unique code generation and referral validation
│   └── propertyService.js    # Hierarchy access verification helpers
├── tests/
│   └── apiTest.js            # Automated end-to-end test suite
├── utils/
│   ├── apiResponse.js        # Standardized API response formatters
│   ├── generateReferralCode.js # Guaranteed unique uppercase code generator
│   └── seedData.js           # Database seeder script
├── .env.example
├── .env
├── server.js                 # Express application entry point
└── package.json
```

---

## 3-Tier Hierarchy & Access Rules

### 1. Super Admin (`SUPER_ADMIN`)
- Root administrator with full platform control.
- View, edit, activate/deactivate all Mediators.
- View all Sellers, filter by assigned or unassigned status.
- Reassign Sellers to any Mediator or unassign them to Super Admin.
- View, edit, and delete all property/land listings platform-wide.

### 2. Mediator (`MEDIATOR`)
- Self-registers and receives a unique uppercase referral code (e.g. `MED-VE5F4U`).
- View and manage **only** Sellers who registered using their referral code.
- View and manage property listings created by their assigned Sellers.
- **Strict Isolation**: Cannot view other Mediators, cannot access other Mediators' Sellers or unassigned Sellers.

### 3. Seller (`SELLER`)
- Self-registers with an **optional** Referral Code:
  - **With valid referral code**: Linked to that Mediator (`referredBy: mediatorId`).
  - **Without referral code**: Not linked to any Mediator (`referredBy: null`); managed directly by Super Admin.
- Manage their own profile and view their management status.
- Create, view, update, and delete their own property/land listings.
- **Strict Isolation**: Cannot access other Sellers' data or mediator/admin endpoints.

---

## Database Schemas

### User Schema (`models/User.js`)
| Field | Type | Description |
| :--- | :--- | :--- |
| `name` | String | User's full name / username (required) |
| `email` | String | Unique lowercase email (required) |
| `password` | String | Hashed using bcryptjs (excluded in standard queries) |
| `role` | String | Enum: `'SUPER_ADMIN'`, `'MEDIATOR'`, `'SELLER'` |
| `phone` | String | Contact phone number |
| `isActive` | Boolean | Account status (default `true`) |
| `referralCode` | String | Unique sparse index for Mediators (e.g. `MED-VE5F4U`) |
| `referredBy` | ObjectId | Ref to `User` (role: `MEDIATOR`) for Sellers; `null` if unassigned |
| `profile` | Object | Subdocument for agency details, address, city, state, bio, avatar |

### Property Schema (`models/Property.js`)
| Field | Type | Description |
| :--- | :--- | :--- |
| `title` | String | Property title (required) |
| `description` | String | Detailed description |
| `propertyType` | String | Enum: `'House'`, `'Apartment'`, `'Villa'`, `'Townhouse'`, `'Land'`, `'Plot'`, `'Commercial'`, `'Office'`, `'Studio'`, `'Other'` |
| `purpose` | String | Enum: `'forSale'`, `'forRent'` (default `'forSale'`) |
| `price` | Number | Property price in INR (required) |
| `priceFormatted`| String | Formatted currency display (e.g., `₹85,00,000`) |
| `address` | String | Street address / landmark |
| `city` | String | City (default `'Tamil Nadu'`) |
| `state` | String | State (default `'Tamil Nadu'`) |
| `beds` / `baths` | Number | Bedroom and bathroom counts |
| `sqft` | Number | Built-up area in sqft |
| `landArea` | Number | Land extent (for plots/lands) |
| `landUnit` | String | Enum: `'sqft'`, `'cent'`, `'acre'`, `'ground'` |
| `amenities` | [String] | List of amenities |
| `images` | [String] | Image paths / URLs |
| `status` | String | Enum: `'available'`, `'under_offer'`, `'sold'`, `'rented'`, `'inactive'` |
| `featured` | Boolean | Featured property flag |
| `seller` | ObjectId | Ref to `User` (role: `SELLER`) who owns the listing |
| `mediator` | ObjectId | Ref to `User` (role: `MEDIATOR`) auto-populated from seller |

---

## API Documentation & Examples

### Authentication (`/api/auth`)

#### 1. Register Mediator
`POST /api/auth/register/mediator`
```json
// Request Body
{
  "name": "Arun Kumar",
  "email": "arun.mediator@gmail.com",
  "password": "Mediator@123456",
  "phone": "+91 94441 23456",
  "profile": {
    "agencyName": "Kumar Real Estate Associates",
    "city": "Chennai"
  }
}

// Response (201 Created)
{
  "success": true,
  "message": "Mediator registered successfully. A unique referral code has been generated.",
  "data": {
    "user": {
      "_id": "6a8e73bf5925d76940144ec1",
      "name": "Arun Kumar",
      "email": "arun.mediator@gmail.com",
      "role": "MEDIATOR",
      "referralCode": "MED-VE5F4U",
      "isActive": true
    },
    "referralCode": "MED-VE5F4U",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
}
```

#### 2. Register Seller (With Referral Code)
`POST /api/auth/register/seller`
```json
// Request Body
{
  "name": "Suresh Raina",
  "email": "suresh.seller@gmail.com",
  "password": "Seller@123456",
  "phone": "+91 99401 11223",
  "referralCode": "MED-VE5F4U"
}

// Response (201 Created)
{
  "success": true,
  "message": "Seller registered successfully and linked to Mediator (Arun Kumar).",
  "data": {
    "user": {
      "_id": "6a8e73bf5925d76940144ec5",
      "name": "Suresh Raina",
      "email": "suresh.seller@gmail.com",
      "role": "SELLER",
      "referredBy": "6a8e73bf5925d76940144ec1"
    },
    "isAssignedToMediator": true,
    "mediator": {
      "id": "6a8e73bf5925d76940144ec1",
      "name": "Arun Kumar",
      "email": "arun.mediator@gmail.com",
      "referralCode": "MED-VE5F4U"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
}
```

#### 3. Register Seller (Without Referral Code)
`POST /api/auth/register/seller`
```json
// Request Body (referralCode omitted)
{
  "name": "Vijay Varma",
  "email": "vijay.directseller@gmail.com",
  "password": "Seller@123456"
}

// Response (201 Created)
{
  "success": true,
  "message": "Seller registered successfully without referral code. Managed directly by Super Admin.",
  "data": {
    "user": {
      "_id": "6a8e73bf5925d76940144ec9",
      "name": "Vijay Varma",
      "email": "vijay.directseller@gmail.com",
      "role": "SELLER",
      "referredBy": null
    },
    "isAssignedToMediator": false,
    "mediator": null,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
}
```

#### 4. Validate Referral Code (Pre-check)
`GET /api/auth/validate-referral/MED-VE5F4U`
```json
// Response (200 OK)
{
  "success": true,
  "message": "Valid referral code. Mediator: Arun Kumar",
  "data": {
    "isValid": true,
    "mediator": {
      "id": "6a8e73bf5925d76940144ec1",
      "name": "Arun Kumar",
      "referralCode": "MED-VE5F4U",
      "agencyName": "Kumar Real Estate Associates"
    }
  }
}
```

#### 5. Login
`POST /api/auth/login`
```json
// Request Body
{
  "email": "admin@realestatetamilnadu.com",
  "password": "Admin@123456"
}

// Response (200 OK)
{
  "success": true,
  "message": "Welcome back, Root Super Admin!",
  "data": {
    "user": {
      "_id": "6a8e73bf5925d76940144eb0",
      "name": "Root Super Admin",
      "email": "admin@realestatetamilnadu.com",
      "role": "SUPER_ADMIN"
    },
    "role": "SUPER_ADMIN",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
}
```

---

### Super Admin Endpoints (`/api/admin`)
*Requires header: `Authorization: Bearer <SUPER_ADMIN_TOKEN>`*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/admin/stats` | Dashboard metrics (total mediators, sellers, listings) |
| `GET` | `/api/admin/mediators` | List all mediators with referred seller & listing counts |
| `GET` | `/api/admin/mediators/:id` | Get mediator details and their sellers |
| `PUT` | `/api/admin/mediators/:id` | Update mediator or toggle active status |
| `GET` | `/api/admin/sellers` | List all sellers (`?assignment=assigned\|unassigned`) |
| `GET` | `/api/admin/sellers/unassigned`| List unassigned sellers managed directly by Super Admin |
| `PUT` | `/api/admin/sellers/:id/assign`| Assign/reassign a seller to a mediator or unassign (`null`) |
| `PUT` | `/api/admin/sellers/:id` | Update seller profile or toggle active status |
| `GET` | `/api/admin/properties` | View all platform property listings |
| `DELETE`| `/api/admin/properties/:id` | Delete any property listing |

---

### Mediator Endpoints (`/api/mediator`)
*Requires header: `Authorization: Bearer <MEDIATOR_TOKEN>`*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/mediator/my-referral-code` | Get referral code and invite link |
| `GET` | `/api/mediator/sellers` | List Sellers registered with this Mediator's code |
| `GET` | `/api/mediator/sellers/:id` | View details of an assigned Seller |
| `PUT` | `/api/mediator/sellers/:id` | Update assigned Seller's profile |
| `GET` | `/api/mediator/properties` | View listings belonging to assigned Sellers |
| `POST`| `/api/mediator/sellers/:sellerId/properties` | Create listing on behalf of assigned seller |
| `PUT` | `/api/mediator/properties/:id` | Update listing belonging to assigned seller |
| `DELETE`| `/api/mediator/properties/:id` | Delete listing belonging to assigned seller |

---

### Seller Endpoints (`/api/seller`)
*Requires header: `Authorization: Bearer <SELLER_TOKEN>`*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/seller/profile` | View profile and mediator assignment status |
| `PUT` | `/api/seller/profile` | Update seller's own contact details |
| `GET` | `/api/seller/properties` | List seller's own property/land listings |
| `POST`| `/api/seller/properties` | Create a new property/land listing |
| `PUT` | `/api/seller/properties/:id` | Update seller's own listing |
| `DELETE`| `/api/seller/properties/:id` | Delete seller's own listing |

---

### Public Property Endpoints (`/api/properties`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/properties` | Search and filter active properties (`purpose`, `propertyType`, `location`, `minPrice`, `maxPrice`, `minSize`, `beds`, etc.) |
| `GET` | `/api/properties/:id` | View single property details with seller/mediator info |

---

## Setup & Running Locally

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
Verify `.env` has appropriate settings:
```ini
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/realestate_tamilnadu
JWT_SECRET=super_secret_jwt_key_realestate_tn_2026_secure
JWT_EXPIRE=7d
CLIENT_URL=http://localhost:5173
```

### 3. Seed Database with Initial Accounts & Properties
```bash
npm run seed
```

### 4. Run Automated Test Suite
```bash
npm run test:api
```

### 5. Start the Development Server
```bash
npm run dev
# Server will start on http://localhost:5000
```
