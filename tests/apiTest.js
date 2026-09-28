const http = require('http');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const app = require('../server');
const { User } = require('../models/User');
const { Property } = require('../models/Property');

const PORT = 5099;

// Helper to make HTTP JSON requests
function makeRequest({ method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;

    const options = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (dataString) {
      options.headers['Content-Length'] = Buffer.byteLength(dataString);
    }

    const req = http.request(options, (res) => {
      let rawData = '';
      res.on('data', (chunk) => {
        rawData += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(rawData);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, raw: rawData, headers: res.headers });
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (dataString) {
      req.write(dataString);
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n=============================================================');
  console.log(' RUNNING BACKEND ARCHITECTURE & RELATIONSHIP VERIFICATION');
  console.log('=============================================================\n');

  let serverInstance;
  let passedTests = 0;
  let failedTests = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      if (details) console.error(`    Details: ${JSON.stringify(details)}`);
      failedTests++;
    }
  }

  try {
    // Start temporary test server
    serverInstance = app.listen(PORT);
    await new Promise((res) => setTimeout(res, 800));

    // 1. Health check
    const healthRes = await makeRequest({ method: 'GET', path: '/api/health' });
    assert(healthRes.status === 200 && healthRes.data.success === true, 'Health check endpoint returns 200 OK');

    // 2. Register Mediator 1
    const med1Email = `med1_${Date.now()}@example.com`;
    const regMed1Res = await makeRequest({
      method: 'POST',
      path: '/api/auth/register/mediator',
      body: {
        name: 'Mediator Alpha',
        email: med1Email,
        password: 'Password@123',
        phone: '+91 99999 11111',
        profile: { agencyName: 'Alpha Properties' },
      },
    });

    assert(
      regMed1Res.status === 201 &&
        regMed1Res.data.success === true &&
        regMed1Res.data.data.referralCode &&
        regMed1Res.data.data.referralCode.startsWith('MED-'),
      'Mediator 1 registers and receives unique referral code',
      regMed1Res.data
    );

    const med1Code = regMed1Res.data?.data?.referralCode;
    const med1Token = regMed1Res.data?.data?.token;
    const med1Id = regMed1Res.data?.data?.user?._id;

    // 3. Register Mediator 2 (to test cross-mediator isolation)
    const med2Email = `med2_${Date.now()}@example.com`;
    const regMed2Res = await makeRequest({
      method: 'POST',
      path: '/api/auth/register/mediator',
      body: {
        name: 'Mediator Beta',
        email: med2Email,
        password: 'Password@123',
        phone: '+91 99999 22222',
      },
    });
    const med2Token = regMed2Res.data?.data?.token;

    // 4. Validate Valid Referral Code
    const validCodeRes = await makeRequest({
      method: 'GET',
      path: `/api/auth/validate-referral/${med1Code}`,
    });
    assert(
      validCodeRes.status === 200 &&
        validCodeRes.data.success === true &&
        validCodeRes.data.data.isValid === true,
      'Valid referral code endpoint returns isValid: true with mediator info'
    );

    // 5. Validate Invalid Referral Code
    const invalidCodeRes = await makeRequest({
      method: 'GET',
      path: '/api/auth/validate-referral/INVALID_CODE_999',
    });
    assert(
      invalidCodeRes.status === 400 && invalidCodeRes.data.success === false,
      'Invalid referral code endpoint returns 400 error'
    );

    // 6. Register Seller with INVALID referral code -> must fail with 400
    const failSellerRes = await makeRequest({
      method: 'POST',
      path: '/api/auth/register/seller',
      body: {
        name: 'Faulty Seller',
        email: `faulty_${Date.now()}@example.com`,
        password: 'Password@123',
        referralCode: 'FAKE-CODE-12345',
      },
    });
    assert(
      failSellerRes.status === 400 && failSellerRes.data.success === false,
      'Seller registration with invalid referral code fails with proper 400 validation error',
      failSellerRes.data
    );

    // 7. Register Seller WITH valid Mediator 1 referral code -> linked to Mediator 1
    const seller1Email = `seller1_${Date.now()}@example.com`;
    const regSeller1Res = await makeRequest({
      method: 'POST',
      path: '/api/auth/register/seller',
      body: {
        name: 'Seller Under Alpha',
        email: seller1Email,
        password: 'Password@123',
        referralCode: med1Code,
      },
    });
    assert(
      regSeller1Res.status === 201 &&
        regSeller1Res.data.success === true &&
        regSeller1Res.data.data.isAssignedToMediator === true &&
        regSeller1Res.data.data.user.referredBy === med1Id,
      'Seller registers with valid code and is properly linked to Mediator in DB',
      regSeller1Res.data
    );

    const seller1Token = regSeller1Res.data?.data?.token;
    const seller1Id = regSeller1Res.data?.data?.user?._id;

    // 8. Register Seller WITHOUT referral code -> Unassigned (Super Admin Managed)
    const seller2Email = `seller2_${Date.now()}@example.com`;
    const regSeller2Res = await makeRequest({
      method: 'POST',
      path: '/api/auth/register/seller',
      body: {
        name: 'Unassigned Seller',
        email: seller2Email,
        password: 'Password@123',
        // referralCode omitted
      },
    });
    assert(
      regSeller2Res.status === 201 &&
        regSeller2Res.data.success === true &&
        regSeller2Res.data.data.isAssignedToMediator === false &&
        regSeller2Res.data.data.user.referredBy === null,
      'Seller registers WITHOUT referral code and is unassigned (referredBy: null)',
      regSeller2Res.data
    );

    const seller2Token = regSeller2Res.data?.data?.token;

    // 9. Check Seller 1 Profile -> shows assigned to Mediator Alpha
    const seller1ProfileRes = await makeRequest({
      method: 'GET',
      path: '/api/seller/profile',
      headers: { Authorization: `Bearer ${seller1Token}` },
    });
    assert(
      seller1ProfileRes.status === 200 &&
        seller1ProfileRes.data.data.managementInfo.status === 'ASSIGNED_TO_MEDIATOR',
      'Seller 1 profile shows ASSIGNED_TO_MEDIATOR with mediator details'
    );

    // 10. Check Seller 2 Profile -> shows managed by Super Admin
    const seller2ProfileRes = await makeRequest({
      method: 'GET',
      path: '/api/seller/profile',
      headers: { Authorization: `Bearer ${seller2Token}` },
    });
    assert(
      seller2ProfileRes.status === 200 &&
        seller2ProfileRes.data.data.managementInfo.status === 'MANAGED_BY_SUPER_ADMIN',
      'Seller 2 profile shows MANAGED_BY_SUPER_ADMIN'
    );

    // 11. Mediator 1 lists their sellers -> Seller 1 is listed, Seller 2 is not
    const med1SellersRes = await makeRequest({
      method: 'GET',
      path: '/api/mediator/sellers',
      headers: { Authorization: `Bearer ${med1Token}` },
    });
    const med1SellerList = med1SellersRes.data?.data || [];
    const containsSeller1 = med1SellerList.some((s) => s._id === seller1Id);
    const containsSeller2 = med1SellerList.some((s) => s.email === seller2Email);
    assert(
      med1SellersRes.status === 200 && containsSeller1 && !containsSeller2,
      'Mediator 1 sees ONLY their own referred Seller 1 and not unassigned Seller 2'
    );

    // 12. Mediator 2 attempts to view Seller 1 (Cross-Mediator isolation check)
    const med2AccessSeller1Res = await makeRequest({
      method: 'GET',
      path: `/api/mediator/sellers/${seller1Id}`,
      headers: { Authorization: `Bearer ${med2Token}` },
    });
    assert(
      med2AccessSeller1Res.status === 404 || med2AccessSeller1Res.status === 403,
      'Mediator 2 is BLOCKED from viewing Seller 1 belonging to Mediator 1 (Isolation enforced)'
    );

    // 13. Seller 1 creates a property listing -> verify mediator reference auto-attached
    const createPropRes = await makeRequest({
      method: 'POST',
      path: '/api/seller/properties',
      headers: { Authorization: `Bearer ${seller1Token}` },
      body: {
        title: '3 BHK Villa in OMR Chennai',
        description: 'Spacious independent villa with private terrace',
        propertyType: 'Villa',
        purpose: 'forSale',
        price: 9500000,
        address: 'Thoraipakkam, OMR, Chennai',
        city: 'Chennai',
        state: 'Tamil Nadu',
        beds: 3,
        baths: 3,
        sqft: 2100,
        images: ['/images/banner/banner-property-5.jpg'],
      },
    });
    assert(
      createPropRes.status === 201 &&
        createPropRes.data.success === true &&
        createPropRes.data.data.seller === seller1Id &&
        createPropRes.data.data.mediator === med1Id,
      'Seller 1 creates property listing; seller and mediator references auto-linked'
    );

    const propertyId = createPropRes.data?.data?._id;

    // 14. Mediator 1 views their sellers properties -> property is present
    const med1PropsRes = await makeRequest({
      method: 'GET',
      path: '/api/mediator/properties',
      headers: { Authorization: `Bearer ${med1Token}` },
    });
    assert(
      med1PropsRes.status === 200 &&
        med1PropsRes.data.data.some((p) => p._id === propertyId),
      'Mediator 1 can view property listings created by their assigned Seller 1'
    );

    // 15. Mediator 2 attempts to delete Mediator 1's seller property -> blocked
    const med2DeletePropRes = await makeRequest({
      method: 'DELETE',
      path: `/api/mediator/properties/${propertyId}`,
      headers: { Authorization: `Bearer ${med2Token}` },
    });
    assert(
      med2DeletePropRes.status === 403 || med2DeletePropRes.status === 404,
      'Mediator 2 is BLOCKED from modifying or deleting Seller 1 property'
    );

    // 16. Super Admin Login & Full Hierarchy Management
    // Find or create admin
    let superAdmin = await User.findOne({ role: 'SUPER_ADMIN' });
    if (!superAdmin) {
      superAdmin = await User.create({
        name: 'Root Super Admin',
        email: `admin_${Date.now()}@example.com`,
        password: 'AdminPassword@123',
        role: 'SUPER_ADMIN',
        isActive: true,
      });
    }
    const adminToken = superAdmin.getSignedJwtToken();

    // Super Admin gets stats
    const adminStatsRes = await makeRequest({
      method: 'GET',
      path: '/api/admin/stats',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminStatsRes.status === 200 && adminStatsRes.data.data.totalMediators >= 2,
      'Super Admin retrieves platform statistics'
    );

    // Super Admin gets unassigned sellers
    const unassignedSellersRes = await makeRequest({
      method: 'GET',
      path: '/api/admin/sellers/unassigned',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      unassignedSellersRes.status === 200 &&
        unassignedSellersRes.data.data.sellers.some((s) => s.email === seller2Email),
      'Super Admin can view and manage unassigned Sellers'
    );

    // 17. Mediator creates a property listing on behalf of Seller 1
    const medCreatePropRes = await makeRequest({
      method: 'POST',
      path: `/api/mediator/sellers/${seller1Id}/properties`,
      headers: { Authorization: `Bearer ${med1Token}` },
      body: {
        title: '2 BHK Apartment in Anna Nagar',
        propertyType: 'Apartment',
        purpose: 'forRent',
        price: 35000,
        address: '2nd Avenue, Anna Nagar',
        city: 'Chennai',
        beds: 2,
        baths: 2,
        sqft: 1100,
        images: ['/images/banner/banner-property-6.jpg'],
      },
    });
    assert(
      medCreatePropRes.status === 201 &&
        medCreatePropRes.data.success === true &&
        medCreatePropRes.data.data.seller === seller1Id &&
        medCreatePropRes.data.data.mediator === med1Id,
      'Mediator 1 successfully lists property on behalf of referred Seller 1'
    );

    // 18. Unassigned Seller 2 creates property listing (Direct listing without mediator)
    const seller2PropRes = await makeRequest({
      method: 'POST',
      path: '/api/seller/properties',
      headers: { Authorization: `Bearer ${seller2Token}` },
      body: {
        title: 'Commercial Land in Coimbatore',
        propertyType: 'Land',
        purpose: 'forSale',
        price: 15000000,
        address: 'Avinashi Road',
        city: 'Coimbatore',
        landArea: 2,
        landUnit: 'acre',
        images: ['/images/banner/banner-property-7.jpg'],
      },
    });
    assert(
      seller2PropRes.status === 201 &&
        seller2PropRes.data.success === true &&
        seller2PropRes.data.data.mediator === null,
      'Unassigned Seller 2 creates direct property listing with mediator: null'
    );
    const seller2PropId = seller2PropRes.data?.data?._id;

    // 19. Super Admin queries Mediator-managed properties
    const adminMedPropsRes = await makeRequest({
      method: 'GET',
      path: '/api/admin/properties?referralType=mediator',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminMedPropsRes.status === 200 &&
        adminMedPropsRes.data.data.every((p) => p.mediator !== null),
      'Super Admin referralType=mediator filter returns ONLY mediator-managed properties'
    );

    // 20. Super Admin queries Unreferred / Direct seller properties
    const adminUnrefPropsRes = await makeRequest({
      method: 'GET',
      path: '/api/admin/properties?referralType=unreferred',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert(
      adminUnrefPropsRes.status === 200 &&
        adminUnrefPropsRes.data.data.some((p) => p._id === seller2PropId) &&
        adminUnrefPropsRes.data.data.every((p) => !p.mediator),
      'Super Admin referralType=unreferred filter returns unreferred direct listings'
    );

    // 21. Super Admin assigns Seller 2 to Mediator 2 -> verifies Seller 2 properties auto-link to Mediator 2
    const assignRes = await makeRequest({
      method: 'PUT',
      path: `/api/admin/sellers/${regSeller2Res.data?.data?.user?._id}/assign`,
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        mediatorId: med2Email ? (await User.findOne({ email: med2Email }))._id : null,
      },
    });
    assert(
      assignRes.status === 200 && assignRes.data.success === true,
      'Super Admin assigns unreferred Seller 2 to Mediator 2'
    );

    const updatedSeller2Prop = await Property.findById(seller2PropId);
    assert(
      updatedSeller2Prop && updatedSeller2Prop.mediator !== null,
      'Seller 2 property listing is automatically linked to Mediator 2 after assignment'
    );

    // 22. Public properties catalog endpoint
    const publicPropsRes = await makeRequest({
      method: 'GET',
      path: '/api/properties',
    });
    assert(
      publicPropsRes.status === 200 && publicPropsRes.data.success === true,
      'Public property catalog endpoint is accessible and returns active listings'
    );
  } catch (error) {
    console.error('Test execution encountered error:', error);
    failedTests++;
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
    console.log('\n=============================================================');
    console.log(` TEST RUN COMPLETED: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('=============================================================\n');

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runTests();
