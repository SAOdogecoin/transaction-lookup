// app.js
let db;
let transactionsRef;
const BATCH_SIZE = 100;
const COLUMN_SIZE = 25;

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

function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
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

        const ids = [...new Set(document.getElementById('newIds').value
            .trim()
            .split('\n')
            .map(id => id.trim())
            .filter(id => id))];

        if (!ids.length) {
            updateProgress(progressBar, statusText, 0, 'Please enter transaction IDs');
            return;
        }

        updateProgress(progressBar, statusText, 0, `Checking ${ids.length} transactions...`);

        const existingIds = [];
        const newIds = [];

        await processInBatches(
            ids,
            async (batch) => {
                const promises = batch.map(id => 
                    transactionsRef.child(id).once('value')
                        .then(snapshot => {
                            if (snapshot.exists()) {
                                existingIds.push(id);
                            } else {
                                newIds.push(id);
                            }
                        })
                );
                
                await Promise.all(promises);
            },
            (progress) => {
                updateProgress(
                    progressBar, 
                    statusText, 
                    progress, 
                    `Checking... ${Math.round(progress)}%`
                );
            }
        );

        if (existingIds.length > 0) {
            results.innerHTML = `
                <div class="result-section warning">
                    <h3>Duplicate Transactions (${existingIds.length})</h3>
                    <div class="transaction-list">${existingIds.join('<br>')}</div>
                </div>
            `;
        }

        if (newIds.length > 0) {
            updateProgress(progressBar, statusText, 0, `Adding ${newIds.length} transactions...`);

            await processInBatches(
                newIds,
                async (batch) => {
                    const promises = batch.map(id => 
                        transactionsRef.child(id).set({ timestamp: firebase.database.ServerValue.TIMESTAMP })
                    );
                    
                    await Promise.all(promises);
                },
                (progress) => {
                    updateProgress(
                        progressBar, 
                        statusText, 
                        progress, 
                        `Adding... ${Math.round(progress)}%`
                    );
                }
            );

            results.innerHTML += `
                <div class="result-section found">
                    <h3>Added Transactions (${newIds.length})</h3>
                    <div class="transaction-list">${newIds.join('<br>')}</div>
                </div>
            `;
        }

        updateProgress(progressBar, statusText, 100, `Completed processing ${ids.length} transactions`);

    } catch (error) {
        console.error('Add error:', error);
        results.innerHTML = `
            <div class="result-section not-found">
                <h3>Error adding transactions: ${error.message}</h3>
            </div>
        `;
        updateProgress(progressBar, statusText, 0, 'Error occurred while adding');
    } finally {
        addButton.disabled = false;
    }
}

function copyToClipboard(text, button) {
    // Create a temporary textarea element
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
        document.execCommand('copy');
        // Visual feedback
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.disabled = true;
        
        setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy:', err);
        alert('Failed to copy text');
    } finally {
        document.body.removeChild(textarea);
    }
}

function createColumnLayout(transactions, isNotReimbursed) {
    const columns = chunkArray(transactions, COLUMN_SIZE);
    return `
        <div class="columns-container">
            ${columns.map(column => `
                <div class="column">
                    ${isNotReimbursed ? `
                        <button class="copy-button" onclick="copyToClipboard('${column.join('\\n')}', this)">
                            Copy Column
                        </button>
                    ` : ''}
                    <div class="transaction-list">
                        ${column.join('\n')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function processInBatches(items, processBatch, updateProgressCallback) {
    const batches = chunkArray(items, BATCH_SIZE);
    let results = [];
    let processed = 0;

    for (const batch of batches) {
        const batchResults = await processBatch(batch);
        results = results.concat(batchResults);
        
        processed += batch.length;
        const progress = (processed / items.length) * 100;
        updateProgressCallback(progress);
    }

    return results;
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

        let resultsHtml = '';

        // Display Not Reimbursed results (red background) at the top
        if (notFound.length > 0) {
            resultsHtml += `
                <div class="result-section not-found">
                    <div class="header-with-button">
                        <h3>Not Reimbursed (${notFound.length})</h3>
                    </div>
                    ${createColumnLayout(notFound, true)}
                </div>
            `;
        }

        // Display Reimbursed results (green background)
        if (found.length > 0) {
            resultsHtml += `
                <div class="result-section found">
                    <div class="header-with-button">
                        <h3>Reimbursed (${found.length})</h3>
                    </div>
                    ${createColumnLayout(found, false)}
                </div>
            `;
        }

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

document.addEventListener('DOMContentLoaded', () => {
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
        textarea.addEventListener('input', (e) => {
            e.target.value = e.target.value
                .replace(/[^\S\r\n]+/g, '')
                .replace(/\n\s*\n\s*\n/g, '\n\n');
        });
    });
});

document.addEventListener('keydown', (e) => {
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
