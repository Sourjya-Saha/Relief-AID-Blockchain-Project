// server.js - Relief Aid System Backend (Enhanced)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pinataSDK = require('@pinata/sdk');
const stream = require('stream');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 5000;

// ==================== PINATA CONFIGURATION ====================

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

console.log("=== BACKEND STARTUP ===");
console.log(`PORT: ${port}`);
console.log(`PINATA_API_KEY: ${PINATA_API_KEY ? '✅ Set' : '❌ Not set'}`);
console.log(`PINATA_SECRET_KEY: ${PINATA_SECRET_KEY ? '✅ Set' : '❌ Not set'}`);

if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    console.error("❌ ERROR: Pinata API keys are missing!");
    throw new Error("Pinata API keys are required");
}

const pinata = new pinataSDK(PINATA_API_KEY, PINATA_SECRET_KEY);

// ==================== MIDDLEWARE ====================

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ==================== MULTER CONFIGURATION ====================

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ==================== CONSTANTS ====================

const CATEGORY_MAP = {
    'FOOD': 0,
    'MEDICAL': 1,
    'SHELTER': 2
};

const ENUM_TO_CATEGORY = ['FOOD', 'MEDICAL', 'SHELTER'];

// ==================== HELPER FUNCTIONS ====================

async function uploadJSONToIPFS(jsonData, metadata = {}) {
    try {
        const result = await pinata.pinJSONToIPFS(jsonData, {
            pinataMetadata: {
                name: metadata.name || `profile-${Date.now()}`,
                keyvalues: {
                    project: 'Relief-Aid-System',
                    timestamp: new Date().toISOString(),
                    ...metadata.keyvalues
                }
            }
        });
        
        return {
            success: true,
            cid: result.IpfsHash,
            url: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
            size: result.PinSize
        };
    } catch (error) {
        console.error('IPFS JSON upload error:', error);
        throw error;
    }
}

async function uploadFileToIPFS(fileBuffer, fileName, metadata = {}) {
    try {
        const readableStream = stream.Readable.from(fileBuffer);
        
        const result = await pinata.pinFileToIPFS(readableStream, {
            pinataMetadata: {
                name: fileName,
                keyvalues: {
                    project: 'Relief-Aid-System',
                    timestamp: new Date().toISOString(),
                    ...metadata.keyvalues
                }
            }
        });
        
        return {
            success: true,
            cid: result.IpfsHash,
            url: `https://gateway.pinata.cloud/ipfs/${result.IpfsHash}`,
            size: result.PinSize
        };
    } catch (error) {
        console.error('IPFS file upload error:', error);
        throw error;
    }
}

// ==================== BASIC ENDPOINTS ====================

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Relief Aid System Backend is running',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: 'GET /api/health',
            testPinata: 'GET /api/test-pinata',
            categoryToEnum: 'GET /api/category/to-enum/:category',
            categoryToString: 'GET /api/category/to-string/:enumValue',
            beneficiaryUpload: 'POST /api/beneficiary/upload-profile',
            beneficiaryBatch: 'POST /api/beneficiary/upload-profiles-batch',
            merchantUpload: 'POST /api/merchant/upload-profile',
            merchantBatch: 'POST /api/merchant/upload-profiles-batch',
            uploadDocument: 'POST /api/upload-document',
            getProfile: 'GET /api/profile/:cid',
            updateProfile: 'PUT /api/profile/update'
        }
    });
});

app.get('/api/test-pinata', async (req, res) => {
    try {
        console.log("Testing Pinata authentication...");
        const result = await pinata.testAuthentication();
        console.log('✅ Pinata connection successful');
        res.json({ 
            success: true, 
            message: 'Pinata connection successful',
            authenticated: result.authenticated
        });
    } catch (error) {
        console.error('❌ Pinata connection failed:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Pinata connection failed',
            error: error.message 
        });
    }
});

// ==================== CATEGORY UTILITY ENDPOINTS ====================

/**
 * Convert category string to enum value for smart contracts
 * GET /api/category/to-enum/:category
 * Example: /api/category/to-enum/MEDICAL → { enumValue: 1 }
 */
app.get('/api/category/to-enum/:category', (req, res) => {
    const { category } = req.params;
    const upperCategory = category.toUpperCase();
    
    const enumValue = CATEGORY_MAP[upperCategory];
    
    if (enumValue === undefined) {
        return res.status(400).json({
            success: false,
            error: 'Invalid category. Must be FOOD, MEDICAL, or SHELTER',
            validCategories: Object.keys(CATEGORY_MAP)
        });
    }
    
    res.json({
        success: true,
        category: upperCategory,
        enumValue: enumValue,
        description: `Use ${enumValue} when calling smart contract functions`
    });
});

/**
 * Convert enum value to category string
 * GET /api/category/to-string/:enumValue
 * Example: /api/category/to-string/1 → { category: "MEDICAL" }
 */
app.get('/api/category/to-string/:enumValue', (req, res) => {
    const { enumValue } = req.params;
    const value = parseInt(enumValue);
    
    if (isNaN(value) || value < 0 || value > 2) {
        return res.status(400).json({
            success: false,
            error: 'Invalid enum value. Must be 0 (FOOD), 1 (MEDICAL), or 2 (SHELTER)'
        });
    }
    
    res.json({
        success: true,
        enumValue: value,
        category: ENUM_TO_CATEGORY[value]
    });
});

/**
 * Get all category mappings at once
 * GET /api/category/mappings
 */
app.get('/api/category/mappings', (req, res) => {
    res.json({
        success: true,
        stringToEnum: CATEGORY_MAP,
        enumToString: ENUM_TO_CATEGORY,
        usage: {
            toEnum: 'Use when calling smart contract functions',
            toString: 'Use when displaying data from smart contracts'
        }
    });
});

// ==================== BENEFICIARY ENDPOINTS ====================

app.post('/api/beneficiary/upload-profile', async (req, res) => {
    try {
        const { name, phone, address, walletAddress, additionalInfo } = req.body;
        
        if (!name || !phone || !address || !walletAddress) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields: name, phone, address, walletAddress' 
            });
        }
        
        const profileData = {
            type: 'beneficiary',
            name,
            phone,
            address,
            walletAddress,
            additionalInfo: additionalInfo || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const result = await uploadJSONToIPFS(profileData, {
            name: `beneficiary-${name.replace(/\s+/g, '-')}-${Date.now()}`,
            keyvalues: {
                type: 'beneficiary-profile',
                walletAddress: walletAddress,
                name: name
            }
        });
        
        console.log(`✅ Beneficiary profile uploaded: ${result.cid}`);
        res.json({
            ...result,
            nextStep: 'Use this CID to register beneficiary on smart contract using registerBeneficiary(address, cid)'
        });
        
    } catch (error) {
        console.error('Beneficiary profile upload error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload beneficiary profile',
            details: error.message 
        });
    }
});

app.post('/api/beneficiary/upload-profiles-batch', async (req, res) => {
    try {
        const { profiles } = req.body;
        
        if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'profiles array is required' 
            });
        }
        
        const results = [];
        const errors = [];
        
        for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            
            if (!profile.name || !profile.phone || !profile.address || !profile.walletAddress) {
                errors.push({ index: i, error: 'Missing required fields' });
                continue;
            }
            
            try {
                const profileData = {
                    type: 'beneficiary',
                    name: profile.name,
                    phone: profile.phone,
                    address: profile.address,
                    walletAddress: profile.walletAddress,
                    additionalInfo: profile.additionalInfo || {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                const result = await uploadJSONToIPFS(profileData, {
                    name: `beneficiary-${profile.name.replace(/\s+/g, '-')}-${Date.now()}`,
                    keyvalues: {
                        type: 'beneficiary-profile',
                        walletAddress: profile.walletAddress,
                        name: profile.name
                    }
                });
                
                results.push({
                    index: i,
                    walletAddress: profile.walletAddress,
                    name: profile.name,
                    cid: result.cid,
                    url: result.url
                });
                
            } catch (error) {
                errors.push({ index: i, error: error.message });
            }
        }
        
        console.log(`✅ Batch upload: ${results.length} success, ${errors.length} errors`);
        res.json({
            success: true,
            results,
            errors,
            total: profiles.length,
            successful: results.length,
            failed: errors.length,
            nextStep: 'Use registerBeneficiariesBatch(addresses[], cids[]) to register on blockchain'
        });
        
    } catch (error) {
        console.error('Batch upload error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload profiles',
            details: error.message 
        });
    }
});

// ==================== MERCHANT ENDPOINTS ====================

app.post('/api/merchant/upload-profile', async (req, res) => {
    try {
        const { name, phone, address, walletAddress, category, businessLicense, additionalInfo } = req.body;
        
        if (!name || !phone || !address || !walletAddress || !category) {
            return res.status(400).json({ 
                success: false,
                error: 'Missing required fields: name, phone, address, walletAddress, category' 
            });
        }
        
        const validCategories = ['FOOD', 'MEDICAL', 'SHELTER'];
        const upperCategory = category.toUpperCase();
        
        if (!validCategories.includes(upperCategory)) {
            return res.status(400).json({ 
                success: false,
                error: `Invalid category. Must be one of: ${validCategories.join(', ')}` 
            });
        }
        
        const profileData = {
            type: 'merchant',
            name,
            phone,
            address,
            walletAddress,
            category: upperCategory,
            businessLicense: businessLicense || '',
            additionalInfo: additionalInfo || {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const result = await uploadJSONToIPFS(profileData, {
            name: `merchant-${name.replace(/\s+/g, '-')}-${Date.now()}`,
            keyvalues: {
                type: 'merchant-profile',
                walletAddress: walletAddress,
                name: name,
                category: upperCategory
            }
        });
        
        const categoryEnum = CATEGORY_MAP[upperCategory];
        
        console.log(`✅ Merchant profile uploaded: ${result.cid}`);
        res.json({
            ...result,
            category: upperCategory,
            categoryEnum: categoryEnum,
            nextStep: `Use registerMerchant(address, ${categoryEnum}, name, cid) to register on blockchain`
        });
        
    } catch (error) {
        console.error('Merchant profile upload error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload merchant profile',
            details: error.message 
        });
    }
});

app.post('/api/merchant/upload-profiles-batch', async (req, res) => {
    try {
        const { profiles } = req.body;
        
        if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
            return res.status(400).json({ 
                success: false,
                error: 'profiles array is required' 
            });
        }
        
        const validCategories = ['FOOD', 'MEDICAL', 'SHELTER'];
        const results = [];
        const errors = [];
        
        for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            
            if (!profile.name || !profile.phone || !profile.address || 
                !profile.walletAddress || !profile.category) {
                errors.push({ index: i, error: 'Missing required fields' });
                continue;
            }
            
            const upperCategory = profile.category.toUpperCase();
            
            if (!validCategories.includes(upperCategory)) {
                errors.push({ index: i, error: 'Invalid category' });
                continue;
            }
            
            try {
                const profileData = {
                    type: 'merchant',
                    name: profile.name,
                    phone: profile.phone,
                    address: profile.address,
                    walletAddress: profile.walletAddress,
                    category: upperCategory,
                    businessLicense: profile.businessLicense || '',
                    additionalInfo: profile.additionalInfo || {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };
                
                const result = await uploadJSONToIPFS(profileData, {
                    name: `merchant-${profile.name.replace(/\s+/g, '-')}-${Date.now()}`,
                    keyvalues: {
                        type: 'merchant-profile',
                        walletAddress: profile.walletAddress,
                        name: profile.name,
                        category: upperCategory
                    }
                });
                
                results.push({
                    index: i,
                    walletAddress: profile.walletAddress,
                    name: profile.name,
                    category: upperCategory,
                    categoryEnum: CATEGORY_MAP[upperCategory],
                    cid: result.cid,
                    url: result.url
                });
                
            } catch (error) {
                errors.push({ index: i, error: error.message });
            }
        }
        
        console.log(`✅ Batch upload: ${results.length} success, ${errors.length} errors`);
        res.json({
            success: true,
            results,
            errors,
            total: profiles.length,
            successful: results.length,
            failed: errors.length,
            nextStep: 'Use registerMerchantsBatch(addresses[], categories[], names[], cids[]) on blockchain'
        });
        
    } catch (error) {
        console.error('Batch upload error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload profiles',
            details: error.message 
        });
    }
});

// ==================== DOCUMENT UPLOAD ====================

app.post('/api/upload-document', upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'No document file provided' 
            });
        }
        
        const { documentType, walletAddress, description } = req.body;
        
        if (!documentType || !walletAddress) {
            return res.status(400).json({ 
                success: false,
                error: 'documentType and walletAddress are required' 
            });
        }
        
        const fileBuffer = req.file.buffer;
        const fileName = `${documentType}-${walletAddress.substring(0, 8)}-${Date.now()}.${req.file.originalname.split('.').pop()}`;
        
        const result = await uploadFileToIPFS(fileBuffer, fileName, {
            keyvalues: {
                type: documentType,
                walletAddress: walletAddress,
                description: description || '',
                originalName: req.file.originalname,
                mimeType: req.file.mimetype
            }
        });
        
        console.log(`✅ Document uploaded: ${result.cid}`);
        res.json(result);
        
    } catch (error) {
        console.error('Document upload error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to upload document',
            details: error.message 
        });
    }
});

// ==================== PROFILE FETCH & UPDATE ====================

app.get('/api/profile/:cid', async (req, res) => {
    try {
        const { cid } = req.params;
        
        if (!cid) {
            return res.status(400).json({ 
                success: false,
                error: 'CID is required' 
            });
        }
        
        const response = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Convert category enum to string if present
        if (data.category !== undefined && typeof data.category === 'number') {
            data.categoryString = ENUM_TO_CATEGORY[data.category];
        }
        
        res.json({
            success: true,
            data,
            cid,
            url: `https://gateway.pinata.cloud/ipfs/${cid}`
        });
        
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch profile from IPFS',
            details: error.message 
        });
    }
});

app.put('/api/profile/update', async (req, res) => {
    try {
        const { oldCID, updatedData, profileType } = req.body;
        
        if (!oldCID || !updatedData || !profileType) {
            return res.status(400).json({ 
                success: false,
                error: 'oldCID, updatedData, and profileType are required' 
            });
        }
        
        const oldResponse = await fetch(`https://gateway.pinata.cloud/ipfs/${oldCID}`);
        const oldData = await oldResponse.json();
        
        const newProfileData = {
            ...oldData,
            ...updatedData,
            updatedAt: new Date().toISOString()
        };
        
        const result = await uploadJSONToIPFS(newProfileData, {
            name: `${profileType}-updated-${Date.now()}`,
            keyvalues: {
                type: `${profileType}-profile`,
                previousCID: oldCID,
                updated: 'true'
            }
        });
        
        console.log(`✅ Profile updated: ${oldCID} -> ${result.cid}`);
        res.json({
            ...result,
            previousCID: oldCID,
            nextStep: `Update the CID on blockchain using update${profileType.charAt(0).toUpperCase() + profileType.slice(1)}Profile(address, newCID)`
        });
        
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update profile',
            details: error.message 
        });
    }
});

// ==================== REDEMPTION (OFF-CHAIN INR) ====================

// Merchant submits INR redemption request → backend stores JSON in IPFS
app.post('/api/redemption/request', async (req, res) => {
  try {
    const { merchantWallet, rusdAmount, inrAmount, upiId, upiLink, note } = req.body;

    if (!merchantWallet || !rusdAmount || !inrAmount || (!upiId && !upiLink)) {
      return res.status(400).json({
        success: false,
        error: "Missing fields: merchantWallet, rusdAmount, inrAmount and (upiId or upiLink)"
      });
    }

    const requestData = {
      type: "offchain-redemption-request",
      merchantWallet,
      rusdAmount,
      inrAmount,
      upiId: upiId || "",
      upiLink: upiLink || "",
      note: note || "",
      status: "PENDING",
      createdAt: new Date().toISOString()
    };

    const result = await uploadJSONToIPFS(requestData, {
      name: `redemption-request-${merchantWallet.slice(0, 8)}-${Date.now()}`,
      keyvalues: {
        type: "redemption-request",
        merchantWallet
      }
    });

    console.log(`✅ Redemption request uploaded: ${result.cid}`);

    res.json({
      success: true,
      cid: result.cid,
      url: result.url,
      nextStep: "Call DonationTreasury.requestOffchainRedemption(rusdAmount, cid)"
    });

  } catch (error) {
    console.error("Redemption request upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload redemption request",
      details: error.message
    });
  }
});


// Admin uploads proof (UPI payment screenshot/receipt) → backend stores file in IPFS
app.post('/api/redemption/proof', upload.single("proof"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No proof file uploaded" });
    }

    const { requestId, merchantWallet } = req.body;

    const fileName = `redemption-proof-${requestId || "unknown"}-${Date.now()}-${req.file.originalname}`;

    const result = await uploadFileToIPFS(req.file.buffer, fileName, {
      keyvalues: {
        type: "redemption-proof",
        merchantWallet: merchantWallet || "",
        requestId: requestId || ""
      }
    });

    console.log(`✅ Redemption proof uploaded: ${result.cid}`);

    res.json({
      success: true,
      proofCID: result.cid,
      url: result.url,
      nextStep: "Call DonationTreasury.fulfillOffchainRedemption(requestId, proofCID)"
    });

  } catch (error) {
    console.error("Redemption proof upload error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to upload redemption proof",
      details: error.message
    });
  }
});


// ==================== GENERIC IPFS FETCH ROUTE ====================

/**
 * ✅ Fetch ANY CID from IPFS (JSON / text)
 * GET /api/ipfs/:cid
 *
 * This is required for AdminDashboard CID details:
 * fetch(`http://localhost:5000/api/ipfs/${cid}`)
 */
app.get("/api/ipfs/:cid", async (req, res) => {
  try {
    const { cid } = req.params;

    if (!cid) {
      return res.status(400).json({
        success: false,
        error: "CID is required",
      });
    }

    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

    const response = await fetch(url);

    if (!response.ok) {
      return res.status(404).json({
        success: false,
        error: `CID fetch failed (${response.status})`,
        cid,
        url,
      });
    }

    const contentType = response.headers.get("content-type") || "";

    // ✅ If JSON
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return res.json({
        success: true,
        cid,
        url,
        data,
      });
    }

    // ✅ If text
    if (contentType.includes("text")) {
      const text = await response.text();
      return res.json({
        success: true,
        cid,
        url,
        data: text,
      });
    }

    // ✅ If file (image/pdf etc.)
    // We will return the file as a stream
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${cid}"`);

    return res.send(buffer);
  } catch (error) {
    console.error("❌ /api/ipfs/:cid error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch CID from IPFS",
      details: error.message,
    });
  }
});


// ==================== ERROR HANDLING ====================

app.use((req, res) => {
    res.status(404).json({ 
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        availableEndpoints: '/api/health for endpoint list'
    });
});

app.use((error, req, res, next) => {
    console.error('Global error handler:', error);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        details: error.message 
    });
});

// ==================== SERVER START ====================

app.listen(port, () => {
    console.log(`\n✅ Relief Aid System Backend running on http://localhost:${port}`);
    console.log(`\n📋 Available Endpoints:`);
    console.log(`   GET  /api/health - Health check & endpoint list`);
    console.log(`   GET  /api/test-pinata - Test Pinata connection`);
    console.log(`   GET  /api/category/to-enum/:category - Convert string to enum`);
    console.log(`   GET  /api/category/to-string/:enumValue - Convert enum to string`);
    console.log(`   GET  /api/category/mappings - Get all category mappings`);
    console.log(`   POST /api/beneficiary/upload-profile - Upload beneficiary profile`);
    console.log(`   POST /api/beneficiary/upload-profiles-batch - Batch beneficiaries`);
    console.log(`   POST /api/merchant/upload-profile - Upload merchant profile`);
    console.log(`   POST /api/merchant/upload-profiles-batch - Batch merchants`);
    console.log(`   POST /api/upload-document - Upload document to IPFS`);
    console.log(`   GET  /api/profile/:cid - Fetch profile from IPFS`);
    console.log(`   PUT  /api/profile/update - Update profile`);
    console.log(`\n🌐 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
    console.log(`🔐 Pinata: ${PINATA_API_KEY ? '✅ Connected' : '❌ Not configured'}\n`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\nSIGINT received, shutting down gracefully...');
    process.exit(0);
});