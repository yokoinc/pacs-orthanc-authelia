console.log('TEST: Loading minimal token manager');

// Test simple fetch
document.addEventListener('DOMContentLoaded', async function() {
    console.log('TEST: DOM loaded');
    
    try {
        console.log('TEST: Trying fetch with absolute HTTPS URL');
        const response = await fetch('https://pacs.yokoinc.ovh/auth/tokens', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            credentials: 'include'
        });
        
        console.log('TEST: Response status:', response.status);
        if (response.ok) {
            const data = await response.json();
            console.log('TEST: Success! Data:', data);
            document.getElementById('test-result').innerHTML = `
                <div class="alert alert-success">
                    ✅ Success! Found ${data.tokens?.length || 0} tokens
                </div>
            `;
        } else {
            console.log('TEST: Failed with status:', response.status);
            document.getElementById('test-result').innerHTML = `
                <div class="alert alert-danger">
                    ❌ Failed with status: ${response.status}
                </div>
            `;
        }
    } catch (error) {
        console.error('TEST: Error:', error);
        document.getElementById('test-result').innerHTML = `
            <div class="alert alert-danger">
                ❌ Error: ${error.message}
            </div>
        `;
    }
});