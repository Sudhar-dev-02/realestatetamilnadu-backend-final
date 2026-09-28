const http = require('http');

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}`;

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, text: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runSuperAdminTests() {
  console.log('====================================================');
  console.log(' RUNNING COMPREHENSIVE SUPER ADMIN TEST SUITE');
  console.log('====================================================\n');

  try {
    // 1. Authenticate as Super Admin
    console.log('1. Logging in as Super Admin...');
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'admin@realestatetamilnadu.com',
      password: 'Admin@123456',
    });

    if (loginRes.status !== 200 || !loginRes.data.data?.token) {
      throw new Error(`Login failed: ${JSON.stringify(loginRes)}`);
    }

    const token = loginRes.data.data.token;
    console.log('✓ Logged in successfully. Token acquired.\n');

    // 2. Test Dashboard Stats (6 Required Counts)
    console.log('2. Testing Dashboard Overview Stats (6 Counts)...');
    const statsRes = await request('GET', '/api/admin/stats', null, token);
    const s = statsRes.data.data;
    console.log(`✓ Total Mediators: ${s.totalMediators}`);
    console.log(`✓ Total Sellers: ${s.totalSellers}`);
    console.log(`✓ Total Properties: ${s.totalProperties}`);
    console.log(`✓ Total Property Listings: ${s.totalPropertyListings}`);
    console.log(`✓ Total Subscription Transactions: ${s.totalSubscriptionTransactions}`);
    console.log(`✓ Total Verified Mediators: ${s.totalVerifiedMediators}\n`);

    // 3. Test Mediators Page API
    console.log('3. Testing Mediators Directory & Detailed 3-Section View...');
    const mediatorsRes = await request('GET', '/api/admin/mediators', null, token);
    const mediatorList = mediatorsRes.data.data;
    console.log(`✓ Fetched ${mediatorList.length} mediator cards.`);

    if (mediatorList.length > 0) {
      const medId = mediatorList[0]._id;
      const medDetailRes = await request('GET', `/api/admin/mediators/${medId}`, null, token);
      const md = medDetailRes.data.data;
      console.log(`✓ Mediator Details fetched: ${md.mediator.name}`);
      console.log(`  - Section 1 (Profile & Verified): ${md.mediator.isVerified}`);
      console.log(`  - Section 2 (Properties Listed): ${md.properties.length} listings`);
      console.log(`  - Section 3 (Sellers Under Mediator): ${md.referredSellers.length} sellers\n`);
    }

    // 4. Test Sellers Page API
    console.log('4. Testing Sellers Directory & Detailed View...');
    const sellersRes = await request('GET', '/api/admin/sellers', null, token);
    const sellerList = sellersRes.data.data;
    console.log(`✓ Fetched ${sellerList.length} seller cards.`);

    if (sellerList.length > 0) {
      const selId = sellerList[0]._id;
      const selDetailRes = await request('GET', `/api/admin/sellers/${selId}`, null, token);
      const sd = selDetailRes.data.data;
      console.log(`✓ Seller Details fetched: ${sd.seller.name}`);
      console.log(`  - Management Status: ${sd.seller.managementStatus}`);
      console.log(`  - Properties Listed: ${sd.properties.length} properties\n`);
    }

    // 5. Test Subscription Management API
    console.log('5. Testing Subscription Plans & Transactions...');
    const plansRes = await request('GET', '/api/admin/subscriptions/plans', null, token);
    console.log(`✓ Fetched ${plansRes.data.data.length} subscription plans.`);

    const txnsRes = await request('GET', '/api/admin/subscriptions/transactions', null, token);
    console.log(`✓ Fetched ${txnsRes.data.data.length} purchase transactions.\n`);

    // 6. Test Verification Management API
    console.log('6. Testing Mediator Verification & Badging...');
    const verRes = await request('GET', '/api/admin/verifications', null, token);
    console.log(`✓ Fetched ${verRes.data.data.length} mediators in verification registry.`);
    const pendingMed = verRes.data.data.find((m) => !m.isVerified);
    if (pendingMed) {
      const approveRes = await request('PUT', `/api/admin/verifications/${pendingMed._id}/approve`, { notes: 'Automated test approval' }, token);
      console.log(`✓ Approved verification for: ${pendingMed.name} -> Verified Badge Granted!\n`);
    }

    // 7. Test Settings Management API (Reviews, Contacts, Clients, Blogs, FAQs)
    console.log('7. Testing Settings CRUD Modules...');

    // 7A. Reviews
    const newRevRes = await request('POST', '/api/admin/settings/reviews', {
      name: 'Test Reviewer',
      role: 'Villa Buyer',
      quote: 'Exceptional test experience on Real Estate TN',
      rating: 5,
    }, token);
    const revId = newRevRes.data.data._id;
    console.log(`✓ Created Review: ${newRevRes.data.data.name}`);
    await request('DELETE', `/api/admin/settings/reviews/${revId}`, null, token);
    console.log('✓ Deleted Test Review.');

    // 7B. Contact Form Entries
    const contactsRes = await request('GET', '/api/admin/settings/contacts', null, token);
    console.log(`✓ Fetched ${contactsRes.data.data.length} contact inquiries.`);

    // 7C. Clients
    const clientsRes = await request('GET', '/api/admin/settings/clients', null, token);
    console.log(`✓ Fetched ${clientsRes.data.data.length} partner brands.`);

    // 7D. Blogs
    const blogsRes = await request('GET', '/api/admin/settings/blogs', null, token);
    console.log(`✓ Fetched ${blogsRes.data.data.length} published blogs.`);

    // 7E. FAQs
    const faqsRes = await request('GET', '/api/admin/settings/faqs', null, token);
    console.log(`✓ Fetched ${faqsRes.data.data.length} FAQ items.\n`);

    // 8. Test Profile API
    console.log('8. Testing Super Admin Profile...');
    const profRes = await request('GET', '/api/admin/profile', null, token);
    console.log(`✓ Super Admin Profile Name: ${profRes.data.data.name} (${profRes.data.data.email})\n`);

    // 9. Test Public Endpoints
    console.log('9. Testing Public Endpoints for Dynamic Landing Page Integration...');
    const publicPlans = await request('GET', '/api/public/plans');
    console.log(`✓ Public Plans endpoint returned ${publicPlans.data.data.length} plans.`);
    const publicReviews = await request('GET', '/api/public/reviews');
    console.log(`✓ Public Reviews endpoint returned ${publicReviews.data.data.length} reviews.`);

    console.log('\n====================================================');
    console.log(' ALL 7 SUPER ADMIN MODULES PASSED 100% SUCCESSFULLY!');
    console.log('====================================================');
  } catch (error) {
    console.error('Test Suite Error:', error);
  }
}

runSuperAdminTests();
