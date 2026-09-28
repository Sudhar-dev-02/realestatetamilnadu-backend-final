const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { User, ROLES } = require('../models/User');
const { Property } = require('../models/Property');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const SubscriptionTransaction = require('../models/SubscriptionTransaction');
const Review = require('../models/Review');
const ContactEntry = require('../models/ContactEntry');
const Client = require('../models/Client');
const Blog = require('../models/Blog');
const FAQ = require('../models/FAQ');
const { generateUniqueReferralCode } = require('./generateReferralCode');

// Load environment variables
dotenv.config();

const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/realestate_tamilnadu';

const seedDatabase = async () => {
  try {
    console.log(`Connecting to MongoDB at: ${mongoURI}`);
    await mongoose.connect(mongoURI);
    console.log('Connected to MongoDB successfully.');

    // Clear existing collections
    console.log('Clearing existing database collections...');
    await User.deleteMany({});
    await Property.deleteMany({});
    await SubscriptionPlan.deleteMany({});
    await SubscriptionTransaction.deleteMany({});
    await Review.deleteMany({});
    await ContactEntry.deleteMany({});
    await Client.deleteMany({});
    await Blog.deleteMany({});
    await FAQ.deleteMany({});
    console.log('Existing data cleared.');

    // 1. Create Super Admin
    console.log('Creating Super Admin account...');
    const superAdmin = await User.create({
      name: 'Root Super Admin',
      email: 'admin@realestatetamilnadu.com',
      password: 'Admin@123456',
      role: ROLES.SUPER_ADMIN,
      phone: '+91 98765 43210',
      isActive: true,
      profile: {
        agencyName: 'Real Estate Tamil Nadu HQ',
        address: 'Mount Road, Anna Salai, Chennai',
        city: 'Chennai',
        state: 'Tamil Nadu',
        bio: 'Main system administrator with full platform control.',
        avatar: '/images/avatar/avt-admin.jpg',
      },
    });
    console.log(`✓ Super Admin created: ${superAdmin.email}`);

    // 2. Create Mediators
    console.log('Creating Mediator accounts with unique referral codes & verification statuses...');
    const medCode1 = await generateUniqueReferralCode(User, 'MED');
    const mediator1 = await User.create({
      name: 'Arun Kumar (Chennai Mediator)',
      email: 'arun.mediator@gmail.com',
      password: 'Mediator@123456',
      role: ROLES.MEDIATOR,
      phone: '+91 94441 23456',
      referralCode: medCode1,
      isActive: true,
      isVerified: true,
      verificationStatus: 'verified',
      verificationDate: new Date(),
      verificationNotes: 'Verified RERA Real Estate License TN/MED/2026/00142',
      profile: {
        agencyName: 'Kumar Real Estate Associates',
        licenseNumber: 'TN/MED/2026/00142',
        address: 'T Nagar, Chennai',
        city: 'Chennai',
        state: 'Tamil Nadu',
        bio: 'Senior property mediator specializing in Chennai residential and commercial properties.',
        avatar: '/images/avatar/avt-1.jpg',
      },
    });

    const medCode2 = await generateUniqueReferralCode(User, 'MED');
    const mediator2 = await User.create({
      name: 'Kavitha Sundaram (Coimbatore Mediator)',
      email: 'kavitha.mediator@gmail.com',
      password: 'Mediator@123456',
      role: ROLES.MEDIATOR,
      phone: '+91 98422 67890',
      referralCode: medCode2,
      isActive: true,
      isVerified: true,
      verificationStatus: 'verified',
      verificationDate: new Date(),
      verificationNotes: 'Approved with verified agency documents',
      profile: {
        agencyName: 'Kongu Realty Consultants',
        licenseNumber: 'TN/MED/2026/00289',
        address: 'RS Puram, Coimbatore',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        bio: 'Property mediator catering to Coimbatore, Tiruppur, and Nilgiris land deals.',
        avatar: '/images/avatar/avt-2.jpg',
      },
    });

    const medCode3 = await generateUniqueReferralCode(User, 'MED');
    const mediator3 = await User.create({
      name: 'Muthukumar Raman (Madurai Mediator - Pending)',
      email: 'muthu.mediator@gmail.com',
      password: 'Mediator@123456',
      role: ROLES.MEDIATOR,
      phone: '+91 97890 12345',
      referralCode: medCode3,
      isActive: true,
      isVerified: false,
      verificationStatus: 'pending',
      verificationNotes: 'License submitted for verification (TN/MED/2026/00450)',
      profile: {
        agencyName: 'Meenakshi Property Deals',
        licenseNumber: 'TN/MED/2026/00450',
        address: 'KK Nagar, Madurai',
        city: 'Madurai',
        state: 'Tamil Nadu',
        bio: 'Madurai regional mediator handling commercial plots and farm lands.',
        avatar: '/images/avatar/avt-3.jpg',
      },
    });

    console.log(`✓ Mediator 1 created (Verified): ${mediator1.name} (Code: ${mediator1.referralCode})`);
    console.log(`✓ Mediator 2 created (Verified): ${mediator2.name} (Code: ${mediator2.referralCode})`);
    console.log(`✓ Mediator 3 created (Pending Verification): ${mediator3.name} (Code: ${mediator3.referralCode})`);

    // 3. Create Assigned Sellers
    console.log('Creating Assigned Sellers (linked via Mediator Referral Codes)...');
    const sellerAssigned1 = await User.create({
      name: 'Suresh Raina (Seller under Arun)',
      email: 'suresh.seller@gmail.com',
      password: 'Seller@123456',
      role: ROLES.SELLER,
      phone: '+91 99401 11223',
      referredBy: mediator1._id,
      isActive: true,
      profile: {
        address: 'Velachery, Chennai',
        city: 'Chennai',
        state: 'Tamil Nadu',
        bio: 'Individual property seller in South Chennai.',
        avatar: '/images/avatar/avt-3.jpg',
      },
    });

    const sellerAssigned2 = await User.create({
      name: 'Priya Mani (Seller under Kavitha)',
      email: 'priya.seller@gmail.com',
      password: 'Seller@123456',
      role: ROLES.SELLER,
      phone: '+91 98840 33445',
      referredBy: mediator2._id,
      isActive: true,
      profile: {
        address: 'Gandhipuram, Coimbatore',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        bio: 'Plot and agricultural land owner in Coimbatore region.',
        avatar: '/images/avatar/avt-4.jpg',
      },
    });

    // 4. Create Unassigned Sellers (Managed directly by Super Admin)
    console.log('Creating Unassigned Sellers (Directly managed by Super Admin)...');
    const sellerUnassigned1 = await User.create({
      name: 'Vijay Varma (Direct / Unassigned Seller)',
      email: 'vijay.directseller@gmail.com',
      password: 'Seller@123456',
      role: ROLES.SELLER,
      phone: '+91 98400 99887',
      referredBy: null, // UNASSIGNED -> Managed by Super Admin
      isActive: true,
      profile: {
        address: 'KK Nagar, Madurai',
        city: 'Madurai',
        state: 'Tamil Nadu',
        bio: 'Direct independent land owner registered without mediator code.',
        avatar: '/images/avatar/avt-5.jpg',
      },
    });

    // 5. Create Sample Properties
    console.log('Creating Sample Properties & Land listings...');
    const propertiesData = [
      {
        title: 'Luxury 3BHK Independent Villa with Garden',
        description: 'Modern luxury 3BHK villa with private terrace, modular kitchen, and covered car parking.',
        propertyType: 'Villa',
        purpose: 'forSale',
        price: 8500000,
        priceFormatted: '₹85,00,000',
        address: 'Plot 45, ECR Road, Injambakkam, Chennai',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600115',
        beds: 3,
        baths: 3,
        sqft: 2200,
        amenities: ['Swimming Pool', 'Air Conditioning', 'Car Parking', '24/7 Security', 'Private Garden'],
        images: ['/images/home/house-7.jpg', '/images/home/house-8.jpg'],
        status: 'available',
        featured: true,
        seller: sellerAssigned1._id,
        mediator: mediator1._id,
      },
      {
        title: 'DTCP Approved Residential Land Plot (2400 sqft)',
        description: 'Gated community residential plot ready for immediate construction, clear title documents, 30ft tar road facing.',
        propertyType: 'Plot',
        purpose: 'forSale',
        price: 3600000,
        priceFormatted: '₹36,00,000',
        address: 'Saravanampatti, Sathy Road, Coimbatore',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        pincode: '641035',
        beds: 0,
        baths: 0,
        sqft: 2400,
        landArea: 5.5,
        landUnit: 'cent',
        amenities: ['Gated Community', 'Street Lights', '24/7 Water Supply', 'Tar Road'],
        images: ['/images/home/house-9.jpg'],
        status: 'available',
        featured: true,
        seller: sellerAssigned2._id,
        mediator: mediator2._id,
      },
      {
        title: '2.5 Acres Agricultural Farmland with Coconut Trees',
        description: 'Fertile agricultural land with drip irrigation, borewell connection, and 150 coconut trees.',
        propertyType: 'Land',
        purpose: 'forSale',
        price: 6500000,
        priceFormatted: '₹65,00,000',
        address: 'Thirumangalam Highway, Madurai',
        city: 'Madurai',
        state: 'Tamil Nadu',
        pincode: '625706',
        beds: 0,
        baths: 0,
        sqft: 108900,
        landArea: 2.5,
        landUnit: 'acre',
        amenities: ['Borewell', 'Electricity Connection', 'Fencing', 'Drip Irrigation'],
        images: ['/images/home/house-11.jpg'],
        status: 'available',
        featured: false,
        seller: sellerUnassigned1._id,
        mediator: null,
      },
      {
        title: 'Modern 2BHK Apartment in Anna Nagar for Rent',
        description: 'Spacious semi-furnished 2BHK apartment with lift, security, and covered car parking in a prime location.',
        propertyType: 'Apartment',
        purpose: 'forRent',
        price: 25000,
        priceFormatted: '₹25,000/month',
        address: '4th Avenue, Anna Nagar East, Chennai',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600102',
        beds: 2,
        baths: 2,
        sqft: 1200,
        amenities: ['Air Conditioning', 'Car Parking', '24/7 Security', 'Lift', 'Power Backup'],
        images: ['/images/home/house-8.jpg'],
        status: 'available',
        featured: true,
        seller: sellerAssigned1._id,
        mediator: mediator1._id,
      },
    ];

    for (const prop of propertiesData) {
      await Property.create(prop);
    }
    console.log(`✓ ${propertiesData.length} sample properties seeded.`);

    // 6. Create Subscription Plans
    console.log('Seeding Subscription Plans...');
    const plansData = [
      {
        name: 'Intro',
        desc: 'Join us every month for a very reasonable price',
        monthlyPrice: 20,
        annualPrice: 190,
        popular: false,
        order: 1,
        features: [
          { text: 'Transportation for you', included: true },
          { text: 'A hotel or homestay.', included: true },
          { text: 'Free meals and drinks.', included: true },
          { text: '24/7 Support', included: false },
          { text: 'Unlimited users', included: false },
        ],
      },
      {
        name: 'Base',
        desc: 'Join us every month for a very reasonable price',
        monthlyPrice: 99,
        annualPrice: 890,
        popular: false,
        order: 2,
        features: [
          { text: 'Transportation for you', included: true },
          { text: 'A hotel or homestay.', included: true },
          { text: 'Free meals and drinks.', included: true },
          { text: '24/7 Support', included: false },
          { text: 'Unlimited users', included: false },
        ],
      },
      {
        name: 'Pro',
        desc: 'Join us every month for a very reasonable price',
        monthlyPrice: 150,
        annualPrice: 1350,
        popular: true,
        order: 3,
        features: [
          { text: 'Transportation for you', included: true },
          { text: 'A hotel or homestay.', included: true },
          { text: 'Free meals and drinks.', included: true },
          { text: '24/7 Support', included: false },
          { text: 'Unlimited users', included: false },
        ],
      },
      {
        name: 'Enterprise',
        desc: 'Join us every month for a very reasonable price',
        monthlyPrice: 200,
        annualPrice: 1800,
        popular: false,
        order: 4,
        features: [
          { text: 'Transportation for you', included: true },
          { text: 'A hotel or homestay.', included: true },
          { text: 'Free meals and drinks.', included: true },
          { text: '24/7 Support', included: false },
          { text: 'Unlimited users', included: false },
        ],
      },
    ];

    for (const plan of plansData) {
      await SubscriptionPlan.create(plan);
    }
    console.log('✓ 4 Subscription Plans seeded.');

    // 7. Create Subscription Transactions
    console.log('Seeding Subscription Transactions...');
    const transactionsData = [
      {
        user: mediator1._id,
        userName: 'Arun Kumar',
        userRole: 'MEDIATOR',
        userEmail: 'arun.mediator@gmail.com',
        planName: 'Pro',
        billingCycle: 'annual',
        amountPaid: 1350,
        currency: 'USD',
        transactionStatus: 'success',
        paymentMethod: 'Credit Card (Stripe)',
        transactionId: 'TXN-2026-9812401',
        purchaseDate: new Date('2026-08-15'),
      },
      {
        user: mediator2._id,
        userName: 'Kavitha Sundaram',
        userRole: 'MEDIATOR',
        userEmail: 'kavitha.mediator@gmail.com',
        planName: 'Base',
        billingCycle: 'monthly',
        amountPaid: 99,
        currency: 'USD',
        transactionStatus: 'success',
        paymentMethod: 'UPI / NetBanking',
        transactionId: 'TXN-2026-9812402',
        purchaseDate: new Date('2026-08-20'),
      },
      {
        user: sellerAssigned1._id,
        userName: 'Suresh Raina',
        userRole: 'SELLER',
        userEmail: 'suresh.seller@gmail.com',
        planName: 'Intro',
        billingCycle: 'monthly',
        amountPaid: 20,
        currency: 'USD',
        transactionStatus: 'success',
        paymentMethod: 'Credit Card',
        transactionId: 'TXN-2026-9812403',
        purchaseDate: new Date('2026-08-25'),
      },
    ];

    for (const txn of transactionsData) {
      await SubscriptionTransaction.create(txn);
    }
    console.log('✓ 3 Subscription Transactions seeded.');

    // 8. Create Reviews / Testimonials
    console.log('Seeding Reviews...');
    const reviewsData = [
      {
        name: 'Dinesh Karthik',
        role: 'Commercial Property Investor, Chennai',
        quote: 'Real Estate Tamil Nadu helped me find an exceptional land parcel on OMR within 3 days. The verified mediator made the deal smooth and transparent.',
        avatar: '/images/avatar/avt-png1.png',
        rating: 5,
        featured: true,
        order: 1,
      },
      {
        name: 'Ananya Ramachandran',
        role: 'Villa Owner, Coimbatore',
        quote: 'Selling my gated villa in Saravanampatti was effortless. Direct mediator assistance and clear platform verification gave buyers immense confidence.',
        avatar: '/images/avatar/avt-png2.png',
        rating: 5,
        featured: true,
        order: 2,
      },
      {
        name: 'K. Senthil Nathan',
        role: 'First-time Homebuyer, Madurai',
        quote: 'The search filters and DTCP verified listings gave us complete peace of mind. Truly the most reliable real estate ecosystem in Tamil Nadu.',
        avatar: '/images/avatar/avt-png3.png',
        rating: 5,
        featured: true,
        order: 3,
      },
    ];

    for (const r of reviewsData) {
      await Review.create(r);
    }
    console.log('✓ Reviews seeded.');

    // 9. Create Clients / Partners
    console.log('Seeding Clients/Partners...');
    const clientsData = [
      { name: 'Premier Group', logo: '', website: 'https://premiergroup.in', order: 1 },
      { name: 'Alpha Realty', logo: '', website: 'https://alpharealty.com', order: 2 },
      { name: 'Horizon Assets', logo: '', website: 'https://horizonassets.in', order: 3 },
      { name: 'Apex Capital', logo: '', website: 'https://apexcapital.com', order: 4 },
      { name: 'Metropolis Homes', logo: '', website: 'https://metropolishomes.in', order: 5 },
      { name: 'BlueSky Estate', logo: '', website: 'https://blueskyestate.in', order: 6 },
    ];

    for (const c of clientsData) {
      await Client.create(c);
    }
    console.log('✓ Clients seeded.');

    // 10. Create Blogs
    console.log('Seeding Blogs...');
    const blogsData = [
      {
        title: 'Building gains into housing stocks and how to trade the sector',
        desc: 'The average contract interest rate for 30-year fixed-rate mortgages with conforming loan balances in Tamil Nadu real estate corridors.',
        content: 'Comprehensive analysis on property growth along Chennai OMR, Coimbatore Avinashi road, and Madurai Ring Road corridors.',
        author: 'Jerome Bell',
        category: 'Furniture',
        date: 'January 28, 2026',
        image: '/images/blog/blog-1.jpg',
        featured: true,
      },
      {
        title: '92% of millennial homebuyers say inflation has impacted their plans',
        desc: 'Mortgage applications to purchase a home in Chennai and Coimbatore show shift towards smart gated community townships.',
        content: 'Insight into how modern homebuyers balance budgets, land areas, and amenities in urban development belts.',
        author: 'Angel Priya',
        category: 'Interior',
        date: 'January 31, 2026',
        image: '/images/blog/blog-2.jpg',
        featured: true,
      },
      {
        title: 'Sustainable Living: Eco-Friendly Architectural Innovations in 2026',
        desc: 'Explore sustainable building materials, solar energy integration, and green roof architecture in luxury developments across TN.',
        content: 'Modern sustainable villas in ECR and Coimbatore outskirts are adopting rainwater harvesting and 100% solar power grids.',
        author: 'Marcus Colleen',
        category: 'Architecture',
        date: 'February 22, 2026',
        image: '/images/blog/blog-3.jpg',
        featured: true,
      },
    ];

    for (const b of blogsData) {
      await Blog.create(b);
    }
    console.log('✓ Blogs seeded.');

    // 11. Create FAQ Questions
    console.log('Seeding FAQ Questions...');
    const faqsData = [
      {
        question: 'Why should I use Real Estate Tamil Nadu services?',
        answer: 'Our platform provides verified listings, RERA approved mediator channels, transparent escrow protocols, and seamless property management across all 38 districts of Tamil Nadu.',
        category: 'General',
        order: 1,
      },
      {
        question: 'How do I get started as a Seller or Mediator?',
        answer: 'You can register in under 2 minutes through our registration portal. Mediators receive an exclusive referral code upon sign up, and sellers can register under a mediator or directly with Super Admin.',
        category: 'Registration',
        order: 2,
      },
      {
        question: 'How secure are the property transactions on the platform?',
        answer: 'Every property uploaded is vetted for DTCP/CMDA approvals. Verified Mediators are awarded strict verification badges only after identity and legal license checks.',
        category: 'Security',
        order: 3,
      },
      {
        question: 'Is customer support available for buyers and sellers?',
        answer: 'Yes! Super Admin and customer assistance teams operate 24/7 via live contact channels, email inquiries, and dedicated phone support.',
        category: 'Support',
        order: 4,
      },
      {
        question: 'How can I update my account information or subscription plan?',
        answer: 'Log in to your dedicated dashboard (Super Admin, Mediator, or Seller) to manage subscription plans, update profiles, and manage listings in real time.',
        category: 'Account',
        order: 5,
      },
    ];

    for (const f of faqsData) {
      await FAQ.create(f);
    }
    console.log('✓ FAQ Questions seeded.');

    // 12. Create Contact Us Form Entries
    console.log('Seeding Contact Entries...');
    const contactEntriesData = [
      {
        name: 'Rajesh Subramanian',
        email: 'rajesh.subramanian@gmail.com',
        phone: '+91 98841 00221',
        subject: 'Inquiry for 3BHK Villa on ECR',
        message: 'Hello, I would like to schedule an in-person viewing of the 3BHK luxury villa listed in Injambakkam this Saturday.',
        status: 'unread',
      },
      {
        name: 'Deepika Mohan',
        email: 'deepika.mohan@yahoo.com',
        phone: '+91 97910 44556',
        subject: 'Commercial Plot in Saravanampatti',
        message: 'Looking for 1 acre commercial space near IT SEZ Saravanampatti. Please share mediator contact details.',
        status: 'read',
      },
    ];

    for (const c of contactEntriesData) {
      await ContactEntry.create(c);
    }
    console.log('✓ Contact Entries seeded.');

    console.log('\n=============================================================');
    console.log(' DATABASE SEEDING COMPLETED SUCCESSFULLY!');
    console.log('=============================================================');
    console.log(' Super Admin Credentials:');
    console.log('   Email:    admin@realestatetamilnadu.com');
    console.log('   Password: Admin@123456');
    console.log('=============================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Seeding Error:', error);
    process.exit(1);
  }
};

seedDatabase();
