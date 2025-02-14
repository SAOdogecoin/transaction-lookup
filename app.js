let db;
let transactionsRef;
const BATCH_SIZE = 100; // Number of operations to process at once

async function initializeApp() {
    try {
        const firebaseConfig = {
            apiKey: "AIzaSyAZX4MEI8UZoYVVpzqfP9abIWQq0UYhJFQ",
            authDomain: "rms-checker.firebaseapp.com",
            databaseURL: "https://rms-checker-default-rtdb.firebaseio.com",
            projectId: "rms-checker",
            storageBucket: "rms-checker.firebasestorage.app",
            messagingSenderId: "1:766008840687:web:a6ee57583b102ad2f7e61a",
            appId: "YOUR_APP_ID"
        };

        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        
        db = firebase.database();
        transactionsRef = db.ref('transactions');
        
        // Enable offline persistence
        db.goOnline();
        
        db.ref('.info/connected').on('value', (snap) => {
            updateConnectionStatus(snap.val());
        });
    } catch (error) {
        console.error('Firebase initialization error:', error);
        alert('Error initializing the application. Please check the console for details.');
    }
}

function updateConnectionStatus(connected) {
    const statusElements = document.querySelectorAll('.status-text');
    statusElements.forEach(element => {
        element.style.display = 'block';
        element.textContent = connected ? 'Connected to database' : 'Offline - Some features may be limited';
        element.style.color = connected ? '#1a73e8' : '#d93025';
    });
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    document.querySelector(`.tab:nth-child(${tabName === 'search' ? '1' : '2'})`).classList.add('active');
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

function updateProgress(progressBar, statusText, progress, message) {
    progressBar.style.display = progress > 0 && progress < 100 ? 'block' : 'none';
    progressBar.querySelector('.progress-bar-fill').style.width = `${progress}%`;
    
    statusText.style.display = 'block';
    statusText.textContent = message;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function copyToClipboard(text, buttonElement) {
    // Decode any HTML entities in the text
    const decodedText = text.replace(/&amp;/g, '&')
                           .replace(/&lt;/g, '<')
                           .replace(/&gt;/g, '>')
                           .replace(/&quot;/g, '"')
                           .replace(/&#039;/g, "'");
    
    const textarea = document.createElement('textarea');
    textarea.value = decodedText;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    
    try {
        textarea.select();
        document.execCommand('copy');
        
        // Visual feedback
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Copied!';
        buttonElement.disabled = true;
        
        setTimeout(() => {
            buttonElement.textContent = originalText;
            buttonElement.disabled = false;
        }, 2000);
        
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard');
    } finally {
        document.body.removeChild(textarea);
    }
}

// Modified results HTML generation in searchTransactions function
if (notFound.length) {
    resultsHtml += `
        <div class="result-section not-found">
            <div class="header-with-button">
                <h3>Not Reimbursed (${notFound.length})</h3>
                <button class="copy-button" onclick="copyToClipboard(\`${notFound.join('\n')}\`)">
                    Copy All
                </button>
            </div>
            <div class="transaction-list">${notFound.join('\n')}</div>
        </div>
    `;
}

// Modified results HTML generation in addTransactions function
if (notFound.length) {
    resultsHtml += `
        <div class="result-section not-found">
            <div class="header-with-button">
                <h3>Not Reimbursed (${notFound.length})</h3>
                <button class="copy-button" onclick="copyToClipboard('${escapeHtml(notFound.join('\n'))}', this)">
                    Copy All
                </button>
            </div>
            <div class="transaction-list">${escapeHtml(notFound.join('\n'))}</div>
        </div>
    `;
}

// Update the results HTML generation in addTransactions function:
if (duplicates.length > 0) {
    resultsHtml += `
        <div class="result-section duplicates">
            <div class="header-with-button">
                <h3>Skipped - Already Exists (${duplicates.length})</h3>
                <button class="copy-button" onclick="copyToClipboard('${escapeHtml(duplicates.join('\n'))}', this)">
                    Copy All
                </button>
            </div>
            <div class="transaction-list">${escapeHtml(duplicates.join('\n'))}</div>
        </div>
    `;
}

function processInBatches(items, processBatch, updateProgressCallback) {
    return new Promise((resolve, reject) => {
        const batches = [];
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
            batches.push(items.slice(i, i + BATCH_SIZE));
        }

        let results = [];
        let processed = 0;

        const processBatches = async () => {
            for (const batch of batches) {
                const batchResults = await processBatch(batch);
                results = results.concat(batchResults);
                
                processed += batch.length;
                const progress = (processed / items.length) * 100;
                updateProgressCallback(progress);
            }
            return results;
        };

        processBatches()
            .then(resolve)
            .catch(reject);
    });
}

async function searchTransactions() {
    if (!transactionsRef) {
        alert('Database not initialized. Please check your Firebase configuration.');
        return;
    }

    const searchButton = document.getElementById('searchButton');
    const progressBar = document.getElementById('searchProgress');
    const statusText = document.getElementById('searchStatus');
    const results = document.getElementById('searchResults');

    try {
        searchButton.disabled = true;
        results.innerHTML = '';
        
        const ids = [...new Set(document.getElementById('searchIds').value
            .trim()
            .split('\n')
            .map(id => id.trim())
            .filter(id => id))];

        if (!ids.length) {
            updateProgress(progressBar, statusText, 0, 'Please enter transaction IDs');
            return;
        }

        updateProgress(progressBar, statusText, 0, `Processing ${ids.length} transactions...`);

        const found = [];
        const notFound = [];

        await processInBatches(
            ids,
            async (batch) => {
                const promises = batch.map(id => 
                    transactionsRef.child(id).once('value')
                        .then(snapshot => ({id, exists: snapshot.exists()}))
                );
                
                const batchResults = await Promise.all(promises);
                batchResults.forEach(({id, exists}) => {
                    if (exists) found.push(id);
                    else notFound.push(id);
                });
                
                return batchResults;
            },
            (progress) => {
                updateProgress(
                    progressBar, 
                    statusText, 
                    progress, 
                    `Processing... ${Math.round(progress)}%`
                );
            }
        );

        // Display results
        let resultsHtml = '';

        if (notFound.length) {
            resultsHtml += `
                <div class="result-section not-found">
                    <div class="header-with-button">
                        <h3>Not Reimbursed (${notFound.length})</h3>
                        <button class="copy-button" onclick="copyToClipboard('${notFound.join('\n')}')">
                            Copy All
                        </button>
                    </div>
                    <div class="transaction-list">${notFound.join('\n')}</div>
                </div>
            `;
        } else {
            resultsHtml += `
                <div class="result-section not-found">
                    <h3>Not Reimbursed (0)</h3>
                    <div class="transaction-list">None</div>
                </div>
            `;
        }

        resultsHtml += `
            <div class="result-section found">
                <h3>Reimbursed (${found.length})</h3>
                <div class="transaction-list">${found.join('\n') || 'None'}</div>
            </div>
        `;

        results.innerHTML = resultsHtml;
        updateProgress(progressBar, statusText, 100, `Completed processing ${ids.length} transactions`);

    } catch (error) {
        console.error('Search error:', error);
        results.innerHTML = `
            <div class="result-section not-found">
                <h3>Error searching transactions: ${error.message}</h3>
            </div>
        `;
        updateProgress(progressBar, statusText, 0, 'Error occurred while searching');
    } finally {
        searchButton.disabled = false;
    }
}

async function addTransactions() {
    if (!transactionsRef) {
        alert('Database not initialized. Please check your Firebase configuration.');
        return;
    }

    const addButton = document.getElementById('addButton');
    const progressBar = document.getElementById('addProgress');
    const statusText = document.getElementById('addStatus');
    const results = document.getElementById('addResults');
    
    try {
        addButton.disabled = true;
        results.innerHTML = '';

        // Remove duplicates from input
        const ids = [...new Set(document.getElementById('newIds').value
            .trim()
            .split('\n')
            .map(id => id.trim())
            .filter(id => id))];

        if (!ids.length) {
            updateProgress(progressBar, statusText, 0, 'Please enter transaction IDs');
            return;
        }

        updateProgress(progressBar, statusText, 0, `Processing ${ids.length} transactions...`);

        const newTransactions = [];
        const duplicates = [];

        // First, check for existing transactions
        await processInBatches(
            ids,
            async (batch) => {
                const checkPromises = batch.map(async (id) => {
                    const snapshot = await transactionsRef.child(id).once('value');
                    if (snapshot.exists()) {
                        duplicates.push(id);
                    } else {
                        newTransactions.push(id);
                    }
                });
                await Promise.all(checkPromises);
                return batch;
            },
            (progress) => {
                updateProgress(
                    progressBar,
                    statusText,
                    progress / 2, // First half of progress for checking
                    `Checking existing transactions... ${Math.round(progress)}%`
                );
            }
        );

        // Only proceed with adding new transactions if there are any
        if (newTransactions.length > 0) {
            await processInBatches(
                newTransactions,
                async (batch) => {
                    const updates = {};
                    batch.forEach(id => {
                        updates[id] = {
                            timestamp: firebase.database.ServerValue.TIMESTAMP,
                            added: new Date().toISOString()
                        };
                    });
                    await transactionsRef.update(updates);
                    return batch;
                },
                (progress) => {
                    const overallProgress = 50 + (progress / 2); // Second half of progress for adding
                    updateProgress(
                        progressBar,
                        statusText,
                        overallProgress,
                        `Adding new transactions... ${Math.round(progress)}%`
                    );
                }
            );
        }

        // Display results
        let resultsHtml = '';

        if (newTransactions.length > 0) {
            resultsHtml += `
                <div class="result-section found">
                    <h3>Successfully Added (${newTransactions.length})</h3>
                    <div class="transaction-list">${newTransactions.join('\n')}</div>
                </div>
            `;
        }

        if (duplicates.length > 0) {
            resultsHtml += `
                <div class="result-section duplicates">
                    <div class="header-with-button">
                        <h3>Skipped - Already Exists (${duplicates.length})</h3>
                        <button class="copy-button" onclick="copyToClipboard('${duplicates.join('\n')}')">
                            Copy All
                        </button>
                    </div>
                    <div class="transaction-list">${duplicates.join('\n')}</div>
                </div>
            `;
        }

        results.innerHTML = resultsHtml;
        
        // Clear input after successful addition
        if (newTransactions.length > 0) {
            document.getElementById('newIds').value = '';
        }

        updateProgress(
            progressBar,
            statusText,
            100,
            `Completed: Added ${newTransactions.length} transactions, ${duplicates.length} duplicates skipped`
        );

    } catch (error) {
        console.error('Add error:', error);
        results.innerHTML = `
            <div class="result-section not-found">
                <h3>Error adding transactions: ${error.message}</h3>
            </div>
        `;
        updateProgress(progressBar, statusText, 0, 'Error occurred while adding transactions');
    } finally {
        addButton.disabled = false;
    }
}

// Add event listeners for textarea input validation
document.addEventListener('DOMContentLoaded', () => {
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', (e) => {
            // Remove any non-printable characters and excessive whitespace
            e.target.value = e.target.value
                .replace(/[^\S\r\n]+/g, '') // Remove multiple spaces
                .replace(/\n\s*\n\s*\n/g, '\n\n'); // Remove excessive newlines
        });
    });
});

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to trigger search/add depending on active tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const activeTab = document.querySelector('.tab-content.active');
        if (activeTab.id === 'searchTab') {
            searchTransactions();
        } else if (activeTab.id === 'addTab') {
            addTransactions();
        }
    }
});
