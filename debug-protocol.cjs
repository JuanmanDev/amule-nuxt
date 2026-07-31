#!/usr/bin/env node
const net = require('net');
const crypto = require('crypto');

const HOST = 'localhost';
const PORT = 4712;
const PASSWORD = 'mule';

const EC_OP_AUTH_REQ = 0x02;
const EC_OP_AUTH_PASSWD = 0x50;
const EC_CURRENT_PROTOCOL_VERSION = 0x0204;

const EC_TAG_CLIENT_NAME = 0x0100;
const EC_TAG_CLIENT_VERSION = 0x0101;
const EC_TAG_PROTOCOL_VERSION = 0x0002;
const EC_TAG_PASSWD_HASH = 0x0001;

const EC_TAGTYPE_STRING = 0x06;
const EC_TAGTYPE_UINT16 = 0x03;
const EC_TAGTYPE_HASH16 = 0x09;

function buildTag(name, type, value) {
    const buffers = [];
    
    // Tag name (2 bytes, big-endian)
    const nameBuf = Buffer.alloc(2);
    nameBuf.writeUInt16BE(name);
    buffers.push(nameBuf);
    
    // Tag type (1 byte)
    buffers.push(Buffer.from([type]));
    
    // Value and length
    let valueBuffer;
    if (type === EC_TAGTYPE_STRING) {
        valueBuffer = Buffer.from(value + '\0', 'utf8');
    } else if (type === EC_TAGTYPE_UINT16) {
        valueBuffer = Buffer.alloc(2);
        valueBuffer.writeUInt16BE(value);
    } else if (type === EC_TAGTYPE_HASH16) {
        valueBuffer = Buffer.from(value, 'hex');
    }
    
    // Length (4 bytes, big-endian)
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32BE(valueBuffer.length);
    buffers.push(lengthBuf);
    
    // Value
    buffers.push(valueBuffer);
    
    return Buffer.concat(buffers);
}

function buildPacket(opCode, tags) {
    const tagsBuffer = Buffer.concat(tags);
    const bodyLength = 1 + 2 + tagsBuffer.length; // opCode + tagCount + tags
    
    // Header
    const header = Buffer.alloc(8);
    header.writeUInt32BE(0x20); // Flags
    header.writeUInt32BE(bodyLength, 4); // Length
    
    // OpCode (1 byte)
    const opCodeBuf = Buffer.from([opCode]);
    
    // Tag count (2 bytes)
    const tagCountBuf = Buffer.alloc(2);
    tagCountBuf.writeUInt16BE(tags.length);
    
    return Buffer.concat([header, opCodeBuf, tagCountBuf, tagsBuffer]);
}

function parseResponse(data) {
    const flags = data.readUInt32BE(0);
    const length = data.readUInt32BE(4);
    const opCode = data.readUInt8(8);
    const tagCount = data.readUInt16BE(9);
    
    console.log('Response:');
    console.log('  Flags:', flags.toString(16));
    console.log('  Length:', length);
    console.log('  OpCode:', opCode.toString(16));
    console.log('  Tag Count:', tagCount);
    
    // If OpCode is EC_OP_AUTH_SALT (0x4F)
    if (opCode === 0x4F) {
        // Parse the salt tag
        const tagName = data.readUInt16BE(11);
        const tagType = data.readUInt8(13);
        const tagLength = data.readUInt32BE(14);
        
        console.log('  Salt Tag Name:', tagName.toString(16));
        console.log('  Salt Tag Type:', tagType);
        console.log('  Salt Tag Length:', tagLength);
        
        // Read salt as uint64 (8 bytes)
        const saltHigh = data.readUInt32BE(18);
        const saltLow = data.readUInt32BE(22);
        const saltBigInt = BigInt(saltHigh) * BigInt(0x100000000) + BigInt(saltLow);
        
        console.log('  Salt (raw high):', saltHigh.toString(16));
        console.log('  Salt (raw low):', saltLow.toString(16));
        console.log('  Salt (BigInt):', saltBigInt.toString(16));
        console.log('  Salt (uppercase hex):', saltBigInt.toString(16).toUpperCase());
        
        return { opCode, salt: saltBigInt.toString(16).toUpperCase() };
    }
    
    return { opCode };
}

async function main() {
    const client = new net.Socket();
    
    try {
        await new Promise((resolve, reject) => {
            client.connect(PORT, HOST, resolve);
            client.once('error', reject);
        });
        
        console.log('Connected to amuled');
        
        // Send auth request 1
        const authReq1 = buildPacket(EC_OP_AUTH_REQ, [
            buildTag(EC_TAG_CLIENT_NAME * 2, EC_TAGTYPE_STRING, 'test-client'),
            buildTag(EC_TAG_CLIENT_VERSION * 2, EC_TAGTYPE_STRING, '1.0'),
            buildTag(0x04, EC_TAGTYPE_UINT16, EC_CURRENT_PROTOCOL_VERSION)
        ]);
        
        console.log('\nSending auth request 1...');
        console.log('  Packet hex:', authReq1.toString('hex'));
        
        client.write(authReq1);
        
        // Wait for response
        const response1 = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
            client.once('data', (data) => {
                clearTimeout(timeout);
                resolve(data);
            });
        });
        
        console.log('\nReceived response 1:');
        console.log('  Raw hex:', response1.toString('hex'));
        const parsed = parseResponse(response1);
        
        if (parsed.opCode === 0x4F && parsed.salt) {
            // Build auth request 2
            const passwordMd5 = crypto.createHash('md5').update(PASSWORD).digest('hex');
            const saltHash = crypto.createHash('md5').update(parsed.salt).digest('hex');
            const combined = passwordMd5.toLowerCase() + saltHash;
            const finalHash = crypto.createHash('md5').update(combined).digest('hex');
            
            console.log('\nPassword computation:');
            console.log('  Password:', PASSWORD);
            console.log('  Password MD5:', passwordMd5);
            console.log('  Salt (hex string):', parsed.salt);
            console.log('  Salt MD5:', saltHash);
            console.log('  Combined:', combined);
            console.log('  Final hash:', finalHash);
            
            const authReq2 = buildPacket(EC_OP_AUTH_PASSWD, [
                buildTag(EC_TAG_PASSWD_HASH * 2, EC_TAGTYPE_HASH16, finalHash)
            ]);
            
            console.log('\nSending auth request 2...');
            console.log('  Packet hex:', authReq2.toString('hex'));
            
            client.write(authReq2);
            
            // Wait for response
            const response2 = await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Timeout')), 5000);
                client.once('data', (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            });
            
            console.log('\nReceived response 2:');
            console.log('  Raw hex:', response2.toString('hex'));
            
            const parsed2 = parseResponse(response2);
            
            if (parsed2.opCode === 0x04) {
                console.log('\n✅ Authentication successful!');
            } else if (parsed2.opCode === 0x03) {
                console.log('\n❌ Authentication failed!');
            } else {
                console.log('\n⚠️ Unexpected response opcode:', parsed2.opCode.toString(16));
            }
        }
        
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        client.destroy();
    }
}

main();
