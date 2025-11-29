#!/usr/bin/env node

/**
 * Standalone script to test AWS Rekognition credentials and basic functionality
 * 
 * Usage: node scripts/testRekognitionCredentials.js
 * 
 * This script tests:
 * 1. AWS credentials validity
 * 2. Rekognition service connectivity
 * 3. Basic operations (list collections, create collection, delete test collection)
 */

import { createRequire } from "module";
import { config } from "dotenv";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  RekognitionClient,
  ListCollectionsCommand,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  DescribeCollectionCommand
} from "@aws-sdk/client-rekognition";

// Load environment variables from .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');
config({ path: envPath });

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.cyan}🔄 ${msg}${colors.reset}`),
  header: (msg) => console.log(`${colors.bold}${colors.cyan}\n=== ${msg} ===${colors.reset}`)
};

// Test collection name (will be created and deleted)
const TEST_COLLECTION_ID = "test-rekognition-credentials";

async function checkEnvironmentVariables() {
  log.header("Checking Environment Variables");
  
  const requiredVars = {
    'AWS_REGION': process.env.AWS_REGION,
    'AWS_ACCESS_KEY': process.env.AWS_ACCESS_KEY,
    'AWS_SECRET_KEY': process.env.AWS_SECRET_KEY
  };

  let allPresent = true;
  
  for (const [varName, value] of Object.entries(requiredVars)) {
    if (value) {
      log.success(`${varName}: ${varName === 'AWS_SECRET_ACCESS_KEY' ? '***' : value}`);
    } else {
      log.error(`${varName}: Not set`);
      allPresent = false;
    }
  }
  
  if (!allPresent) {
    log.error("Missing required environment variables!");
    log.info("Please set AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY");
    process.exit(1);
  }
  
  return true;
}

async function createRekognitionClient() {
  log.header("Creating Rekognition Client");
  
  try {
    const client = new RekognitionClient({
      region: process.env.AWS_REGION || "ap-south-1",
      profile: "AWS_PROFILE",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
      },
    });
    
    log.success(`Rekognition client created for region: ${process.env.AWS_REGION || "ap-south-1"}`);
    return client;
  } catch (error) {
    log.error(`Failed to create Rekognition client: ${error.message}`);
    throw error;
  }
}

async function testListCollections(client) {
  log.header("Testing List Collections");
  
  try {
    log.step("Sending ListCollections request...");
    const command = new ListCollectionsCommand({});
    const response = await client.send(command);
    
    log.success("ListCollections request successful!");
    
    if (response.CollectionIds && response.CollectionIds.length > 0) {
      log.info(`Found ${response.CollectionIds.length} existing collections:`);
      response.CollectionIds.forEach(id => {
        console.log(`  - ${id}`);
      });
    } else {
      log.info("No existing collections found");
    }
    
    return response.CollectionIds || [];
  } catch (error) {
    log.error(`ListCollections failed: ${error.message}`);
    throw error;
  }
}

async function testCreateCollection(client) {
  log.header("Testing Create Collection");
  
  try {
    log.step(`Creating test collection: ${TEST_COLLECTION_ID}`);
    const command = new CreateCollectionCommand({
      CollectionId: TEST_COLLECTION_ID
    });
    
    const response = await client.send(command);
    log.success(`Test collection created successfully!`);
    log.info(`Collection ARN: ${response.CollectionArn}`);
    log.info(`Face Model Version: ${response.FaceModelVersion}`);
    log.info(`Status Code: ${response.StatusCode}`);
    
    return true;
  } catch (error) {
    if (error.name === 'ResourceAlreadyExistsException') {
      log.warning(`Collection ${TEST_COLLECTION_ID} already exists`);
      return true;
    }
    log.error(`CreateCollection failed: ${error.message}`);
    throw error;
  }
}

async function testDescribeCollection(client) {
  log.header("Testing Describe Collection");
  
  try {
    log.step(`Describing test collection: ${TEST_COLLECTION_ID}`);
    const command = new DescribeCollectionCommand({
      CollectionId: TEST_COLLECTION_ID
    });
    
    const response = await client.send(command);
    log.success("DescribeCollection request successful!");
    log.info(`Face Count: ${response.FaceCount}`);
    log.info(`Face Model Version: ${response.FaceModelVersion}`);
    log.info(`Created: ${new Date(response.CreationTimestamp).toLocaleString()}`);
    
    return true;
  } catch (error) {
    log.error(`DescribeCollection failed: ${error.message}`);
    throw error;
  }
}

async function cleanupTestCollection(client) {
  log.header("Cleaning Up Test Collection");
  
  try {
    log.step(`Deleting test collection: ${TEST_COLLECTION_ID}`);
    const command = new DeleteCollectionCommand({
      CollectionId: TEST_COLLECTION_ID
    });
    
    const response = await client.send(command);
    log.success("Test collection deleted successfully!");
    log.info(`Status Code: ${response.StatusCode}`);
    
    return true;
  } catch (error) {
    if (error.name === 'ResourceNotFoundException') {
      log.warning(`Collection ${TEST_COLLECTION_ID} was not found (already deleted)`);
      return true;
    }
    log.error(`DeleteCollection failed: ${error.message}`);
    // Don't throw error for cleanup, just warn
    return false;
  }
}

async function runTests() {
  console.log(`${colors.bold}${colors.blue}🧪 AWS Rekognition Credentials Test${colors.reset}\n`);
  
  let client;
  
  try {
    // Step 1: Check environment variables
    await checkEnvironmentVariables();
    
    // Step 2: Create Rekognition client
    client = await createRekognitionClient();
    
    // Step 3: Test listing collections
    const existingCollections = await testListCollections(client);
    
    // Step 4: Test creating a collection
    await testCreateCollection(client);
    
    // Step 5: Test describing the collection
    await testDescribeCollection(client);
    
    // Step 6: Clean up test collection
    await cleanupTestCollection(client);
    
    // Final success message
    log.header("All Tests Passed!");
    log.success("✨ Your AWS Rekognition credentials are working perfectly!");
    log.info("You can now use Rekognition in your Firebase functions.");
    
    // Show existing collections if any
    if (existingCollections.length > 0) {
      console.log(`\n${colors.cyan}📋 Your existing collections:${colors.reset}`);
      existingCollections.forEach(id => {
        console.log(`  - ${id}`);
      });
    }
    
  } catch (error) {
    log.header("Test Failed!");
    log.error("❌ Rekognition credentials test failed");
    log.error(`Error: ${error.message}`);
    
    if (error.name === 'InvalidSignatureException') {
      log.warning("This usually means your AWS credentials are incorrect");
    } else if (error.name === 'UnauthorizedOperation') {
      log.warning("Your AWS credentials don't have permission for Rekognition operations");
    } else if (error.code === 'NETWORK_ERROR') {
      log.warning("Network error - check your internet connection");
    }
    
    console.log(`\n${colors.yellow}💡 Troubleshooting tips:${colors.reset}`);
    console.log("1. Verify your AWS credentials are correct");
    console.log("2. Ensure your AWS user has Rekognition permissions");
    console.log("3. Check if the specified region supports Rekognition");
    console.log("4. Verify your network connection");
    
    process.exit(1);
  }
}

// Run the tests
runTests().catch(error => {
  log.error(`Unexpected error: ${error.message}`);
  process.exit(1);
}); 