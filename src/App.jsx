import React, { useState, useRef } from 'react';
import { Shield, Key, Upload, Download, Lock, Unlock, RefreshCw, Mail, Clock, Calendar, AlertTriangle } from 'lucide-react';
import './App.css';

export default function FileEncryptionApp() {
  const [activeTab, setActiveTab] = useState('encrypt');
  
  // Separate states for encrypt and decrypt sections
  const [encryptFile, setEncryptFile] = useState(null);
  const [decryptFile, setDecryptFile] = useState(null);
  
  const [encryptedResult, setEncryptedResult] = useState(null);
  const [decryptedResult, setDecryptedResult] = useState(null);
  
  const [encryptionKey, setEncryptionKey] = useState('');
  const [decryptKey, setDecryptKey] = useState('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [keyValid, setKeyValid] = useState(true);
  const [notificationSent, setNotificationSent] = useState(false);
  
  // Time-lock feature states
  const [unlockDate, setUnlockDate] = useState('');
  const [unlockTime, setUnlockTime] = useState('');
  const [timeLockEnabled, setTimeLockEnabled] = useState(false);
  const [timeLockStatus, setTimeLockStatus] = useState(null);
  
  // Deadline feature states
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [deadlineStatus, setDeadlineStatus] = useState(null);
  
  const encryptFileInputRef = useRef(null);
  const decryptFileInputRef = useRef(null);

  // Handle tab change and clear error
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setError('');
  };

  const handleEncryptFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setEncryptFile(selectedFile);
      setEncryptedResult(null);
      setEncryptionKey('');
      setError('');
    }
  };

  const handleDecryptFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setDecryptFile(selectedFile);
      setDecryptedResult(null);
      setError('');
      setKeyValid(true);
      setNotificationSent(false);
      setTimeLockStatus(null);
      setDeadlineStatus(null);
    }
  };

  const generateKey = async () => {
    // Generate a random 256-bit (32-byte) key for AES-GCM
    const key = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
    
    // Export the key as a raw string (hex encoded)
    const exportedKey = await window.crypto.subtle.exportKey("raw", key);
    const keyArray = Array.from(new Uint8Array(exportedKey));
    return keyArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const importKey = async (keyStr) => {
    // Convert hex string back to ArrayBuffer
    const keyBuffer = new Uint8Array(
      keyStr.match(/.{1,2}/g).map(byte => parseInt(byte, 16))
    ).buffer;
    
    return await window.crypto.subtle.importKey(
      "raw",
      keyBuffer,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  };

  const encryptFileData = async () => {
    if (!encryptFile) {
      setError('Please select a file first.');
      return;
    }

    // Validate time window logic
    if (timeLockEnabled && deadlineEnabled) {
      const startTime = new Date(`${unlockDate}T${unlockTime}`).getTime();
      const endTime = new Date(`${deadlineDate}T${deadlineTime}`).getTime();
      
      if (startTime >= endTime) {
        setError('Deadline must be after the unlock date/time.');
        return;
      }
    }

    setIsProcessing(true);
    setError('');

    try {
      // Generate encryption key
      const newKey = await generateKey();
      setEncryptionKey(newKey);
      
      // Read the file as ArrayBuffer
      const fileBuffer = await encryptFile.arrayBuffer();
      
      // Generate a random 96-bit (12-byte) IV
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      
      // Import the key
      const cryptoKey = await importKey(newKey);
      
      // Encrypt the file
      const encryptedData = await window.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        cryptoKey,
        fileBuffer
      );
      
      // Time-lock: Calculate unlock timestamp if enabled
      let unlockTimestamp = null;
      if (timeLockEnabled && unlockDate && unlockTime) {
        const dateTimeStr = `${unlockDate}T${unlockTime}`;
        unlockTimestamp = new Date(dateTimeStr).getTime();
      }
      
      // Deadline: Calculate deadline timestamp if enabled
      let deadlineTimestamp = null;
      if (deadlineEnabled && deadlineDate && deadlineTime) {
        const dateTimeStr = `${deadlineDate}T${deadlineTime}`;
        deadlineTimestamp = new Date(dateTimeStr).getTime();
      }

      // Create metadata header (file type + original name + IV + unlock timestamp + deadline timestamp)
      const meta = {
        type: encryptFile.type,
        name: encryptFile.name,
        iv: Array.from(iv), // Convert IV to array for JSON
        timeLock: unlockTimestamp, // Add time-lock timestamp (null if not enabled)
        deadline: deadlineTimestamp  // Add deadline timestamp (null if not enabled)
      };
      const metaStr = JSON.stringify(meta);
      const metaEncoder = new TextEncoder();
      const metaData = metaEncoder.encode(metaStr);
      
      // Combine metadata length (4 bytes), metadata, IV, and encrypted data
      const combined = new Uint8Array(
        4 + metaData.length + iv.length + encryptedData.byteLength
      );
      
      // Write metadata length (4 bytes)
      new DataView(combined.buffer).setUint32(0, metaData.length);
      
      // Write metadata
      combined.set(metaData, 4);
      
      // Write IV
      combined.set(iv, 4 + metaData.length);
      
      // Write encrypted data
      combined.set(new Uint8Array(encryptedData), 4 + metaData.length + iv.length);
      
      // Create encrypted blob
      const encryptedBlob = new Blob([combined], { type: 'application/octet-stream' });
      
      setEncryptedResult({
        name: `${encryptFile.name}.encrypted`,
        type: 'application/octet-stream',
        blob: encryptedBlob
      });
      
    } catch (err) {
      setError('Error encrypting file: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const decryptFileData = async () => {
    if (!decryptFile) {
      setError('Please select an encrypted file first.');
      return;
    }

    if (!decryptKey) {
      setError('Please enter the decryption key.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setKeyValid(true);
    setDecryptedResult(null);
    setNotificationSent(false);
    setTimeLockStatus(null);
    setDeadlineStatus(null);

    try {
      // Read the encrypted file
      const encryptedBuffer = await decryptFile.arrayBuffer();
      const encryptedData = new Uint8Array(encryptedBuffer);
      
      // Read metadata length (first 4 bytes)
      const metaLength = new DataView(encryptedBuffer).getUint32(0);
      
      // Read metadata (JSON string)
      const metaData = encryptedData.slice(4, 4 + metaLength);
      const metaDecoder = new TextDecoder();
      const metaStr = metaDecoder.decode(metaData);
      const meta = JSON.parse(metaStr);
      
      const currentTime = Date.now();
      
      // Check deadline if present
      if (meta.deadline && currentTime > meta.deadline) {
        // File has expired
        setDeadlineStatus({
          expired: true,
          message: "This file has expired and is no longer available for decryption.",
          deadline: new Date(meta.deadline).toLocaleString()
        });
        setIsProcessing(false);
        return;
      }
      
      // Check time-lock if present
      if (meta.timeLock && currentTime < meta.timeLock) {
        // File is time-locked - don't show when it will unlock
        setTimeLockStatus({
          locked: true,
          message: "This file isn't available for decryption yet!",
          unlockTime: new Date(meta.timeLock).toLocaleString()
        });
        setIsProcessing(false);
        return;
      } else if (meta.timeLock) {
        // File is unlocked
        setTimeLockStatus({
          locked: false,
          message: "Time-lock expired. File is available for decryption."
        });
      }
      
      // If we get here, the file is within its valid decryption window
      if (meta.timeLock && meta.deadline) {
        const remainingTime = meta.deadline - currentTime;
        const daysRemaining = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
        const hoursRemaining = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        
        setDeadlineStatus({
          expired: false,
          message: `File will expire in ${daysRemaining} days and ${hoursRemaining} hours.`,
          deadline: new Date(meta.deadline).toLocaleString()
        });
      }
      
      // Read IV (next 12 bytes after metadata)
      const iv = encryptedData.slice(4 + metaLength, 4 + metaLength + 12);
      
      // Read actual encrypted data (remaining bytes)
      const data = encryptedData.slice(4 + metaLength + 12);
      
      // Import the key  
      const cryptoKey = await importKey(decryptKey);
      
      // Decrypt the file
      const decryptedData = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        cryptoKey,
        data
      );
      
      // Create blob with original file type
      const decryptedBlob = new Blob([decryptedData], { type: meta.type });
      
      setDecryptedResult({
        name: meta.name,
        type: meta.type,
        blob: decryptedBlob
      });
      
    } catch (err) {
      setError('Error decrypting file. Invalid key or file format.');
      setKeyValid(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFile = (fileObj) => {
    if (!fileObj) return;
    
    const url = URL.createObjectURL(fileObj.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileObj.name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const resetEncryptForm = () => {
    setEncryptFile(null);
    setEncryptedResult(null);
    setEncryptionKey('');
    setError('');
    setTimeLockEnabled(false);
    setUnlockDate('');
    setUnlockTime('');
    setDeadlineEnabled(false);
    setDeadlineDate('');
    setDeadlineTime('');
    if (encryptFileInputRef.current) {
      encryptFileInputRef.current.value = '';
    }
  };

  const resetDecryptForm = () => {
    setDecryptFile(null);
    setDecryptedResult(null);
    setDecryptKey('');
    setError('');
    setKeyValid(true);
    setNotificationSent(false);
    setTimeLockStatus(null);
    setDeadlineStatus(null);
    if (decryptFileInputRef.current) {
      decryptFileInputRef.current.value = '';
    }
  };

  // Set minimum date to today for the date picker
  const today = new Date();
  const minDate = today.toISOString().split('T')[0]; // Format: YYYY-MM-DD

  return (
    <div className="app-container">
      <div className="app-header">
        <Shield className="logo-icon" size={40} />
        <h1>CRYPTGUARD</h1>
        <p>Secure File Encryption Portal</p>
      </div>

      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'encrypt' ? 'active' : ''}`} 
          onClick={() => handleTabChange('encrypt')}
        >
          <Lock size={18} />
          Encrypt
        </button>
        <button 
          className={`tab ${activeTab === 'decrypt' ? 'active' : ''}`} 
          onClick={() => handleTabChange('decrypt')}
        >
          <Unlock size={18} />
          Decrypt
        </button>
      </div>

      <div className="content-box">
        {activeTab === 'encrypt' ? (
          <>
            <div className="file-section">
              <div className="upload-area" onClick={() => encryptFileInputRef.current.click()}>
                <Upload size={32} />
                <p>{encryptFile ? encryptFile.name : 'Select a file to encrypt'}</p>
                <input 
                  type="file" 
                  ref={encryptFileInputRef}
                  onChange={handleEncryptFileChange} 
                  style={{ display: 'none' }} 
                />
                <button className="file-button">Browse Files</button>
              </div>
              
              {/* Time-lock options */}
              <div className="time-lock-section">
                <div className="time-lock-header">
                  <label className="time-lock-toggle">
                    <input 
                      type="checkbox" 
                      checked={timeLockEnabled}
                      onChange={(e) => setTimeLockEnabled(e.target.checked)}
                    />
                    <Clock size={18} />
                    Enable Time-Lock Protection
                  </label>
                </div>
                
                {timeLockEnabled && (
                  <div className="time-lock-inputs">
                    <div className="date-time-input">
                      <label>Unlock Date:</label>
                      <input 
                        type="date" 
                        value={unlockDate}
                        min={minDate}
                        onChange={(e) => setUnlockDate(e.target.value)}
                      />
                    </div>
                    <div className="date-time-input">
                      <label>Unlock Time:</label>
                      <input 
                        type="time" 
                        value={unlockTime}
                        onChange={(e) => setUnlockTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Deadline options */}
              <div className="time-lock-section" style={{ borderLeft: '3px solid #ff9800' }}>
                <div className="time-lock-header">
                  <label className="time-lock-toggle">
                    <input 
                      type="checkbox" 
                      checked={deadlineEnabled}
                      onChange={(e) => setDeadlineEnabled(e.target.checked)}
                    />
                    <Calendar size={18} style={{ color: '#ff9800' }} />
                    Set Expiration Deadline
                  </label>
                </div>
                
                {deadlineEnabled && (
                  <div className="time-lock-inputs">
                    <div className="date-time-input">
                      <label>Expiration Date:</label>
                      <input 
                        type="date" 
                        value={deadlineDate}
                        min={minDate}
                        onChange={(e) => setDeadlineDate(e.target.value)}
                      />
                    </div>
                    <div className="date-time-input">
                      <label>Expiration Time:</label>
                      <input 
                        type="time" 
                        value={deadlineTime}
                        onChange={(e) => setDeadlineTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              <button 
                className="action-button"
                onClick={encryptFileData}
                disabled={!encryptFile || isProcessing || 
                  (timeLockEnabled && (!unlockDate || !unlockTime)) ||
                  (deadlineEnabled && (!deadlineDate || !deadlineTime))}
              >
                {isProcessing ? <RefreshCw className="spin" /> : <Lock />}
                {isProcessing ? 'Encrypting...' : 'Encrypt File'}
              </button>
            </div>

            {encryptionKey && (
              <div className="result-section">
                <div className="key-container">
                  <div className="key-header">
                    <Key size={18} />
                    <h3>Encryption Key</h3>
                  </div>
                  <div className="key-value">{encryptionKey}</div>
                  <p className="key-warning">Save this key! You'll need it to decrypt your file.</p>
                </div>
                
                {encryptedResult && (
                  <div className="download-section">
                    <h3>File Encrypted Successfully</h3>
                    <p>{encryptedResult.name}</p>
                    
                    {/* Display time constraints info */}
                    {(timeLockEnabled && unlockDate && unlockTime) || 
                     (deadlineEnabled && deadlineDate && deadlineTime) ? (
                      <div style={{ marginBottom: '1rem' }}>
                        {timeLockEnabled && unlockDate && unlockTime && (
                          <div className="time-lock-info">
                            <Clock size={16} />
                            <span>Available after: {new Date(`${unlockDate}T${unlockTime}`).toLocaleString()}</span>
                          </div>
                        )}
                        
                        {deadlineEnabled && deadlineDate && deadlineTime && (
                          <div className="time-lock-info" style={{ color: '#ff9800' }}>
                            <AlertTriangle size={16} />
                            <span>Expires on: {new Date(`${deadlineDate}T${deadlineTime}`).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    ) : null}
                    
                    <button className="download-button" onClick={() => downloadFile(encryptedResult)}>
                      <Download size={18} />
                      Download Encrypted File
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {error && <div className="error-message">{error}</div>}
            
            <button className="reset-button" onClick={resetEncryptForm}>
              <RefreshCw size={16} />
              Reset
            </button>
          </>
        ) : (
          <>
            <div className="file-section">
              <div className="upload-area" onClick={() => decryptFileInputRef.current.click()}>
                <Upload size={32} />
                <p>{decryptFile ? decryptFile.name : 'Select an encrypted file'}</p>
                <input 
                  type="file" 
                  ref={decryptFileInputRef}
                  onChange={handleDecryptFileChange} 
                  style={{ display: 'none' }} 
                />
                <button className="file-button">Browse Files</button>
              </div>
              
              <div className="key-input">
                <label>
                  <Key size={16} />
                  Enter Decryption Key:
                </label>
                <input 
                  type="text" 
                  value={decryptKey} 
                  onChange={(e) => setDecryptKey(e.target.value)}
                  placeholder="Paste your decryption key here"
                />
              </div>
              
              {/* Time-lock status message */}
              {timeLockStatus && (
                <div className={`time-lock-message ${timeLockStatus.locked ? 'locked' : 'unlocked'}`}>
                  <Clock size={18} />
                  <p>{timeLockStatus.message}</p>
                  {timeLockStatus.unlockTime && (
                    <span className="time-remaining">Available after: {timeLockStatus.unlockTime}</span>
                  )}
                </div>
              )}
              
              {/* Deadline status message */}
              {deadlineStatus && (
                <div className={`time-lock-message ${deadlineStatus.expired ? 'locked' : 'unlocked'}`} 
                     style={deadlineStatus.expired ? {} : { borderLeft: '3px solid #ff9800' }}>
                  <Calendar size={18} style={{ color: deadlineStatus.expired ? 'var(--error-color)' : '#ff9800' }} />
                  <p>{deadlineStatus.message}</p>
                  {deadlineStatus.deadline && !deadlineStatus.expired && (
                    <span className="time-remaining">Expires on: {deadlineStatus.deadline}</span>
                  )}
                </div>
              )}
              <button 
                className="action-button"
                onClick={decryptFileData}
                disabled={!decryptFile || !decryptKey || isProcessing || 
                  (timeLockStatus && timeLockStatus.locked) || 
                  (deadlineStatus && deadlineStatus.expired)}
              >
                {isProcessing ? <RefreshCw className="spin" /> : <Unlock />}
                {isProcessing ? 'Decrypting...' : 'Decrypt File'}
              </button>
            </div>

            {decryptedResult && keyValid && (
              <div className="result-section">
                <div className="download-section">
                  <h3>File Decrypted Successfully</h3>
                  <p>{decryptedResult.name}</p>
                  {deadlineStatus && !deadlineStatus.expired && (
                    <div className="time-lock-info" style={{ color: '#ff9800', margin: '1rem 0' }}>
                      <AlertTriangle size={16} />
                      <span>{deadlineStatus.message}</span>
                    </div>
                  )}
                  <button className="download-button" onClick={() => downloadFile(decryptedResult)}>
                    <Download size={18} />
                    Download Decrypted File
                  </button>
                </div>
              </div>
            )}
            
            {error && <div className="error-message">{error}</div>}
            
            <button className="reset-button" onClick={resetDecryptForm}>
              <RefreshCw size={16} />
              Reset
            </button>
          </>
        )}
      </div>

      <div className="app-footer">
        <p>CryptGuard &copy; 2025 | Secure End-to-End Encryption</p>
        <p className="disclaimer">All processing happens locally in your browser. Your files never leave your device.</p>
      </div>
    </div>
  );
}